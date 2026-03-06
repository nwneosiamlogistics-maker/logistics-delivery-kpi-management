import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { KpiExceptions } from './pages/KpiExceptions';
import { WeekdayAnalysis } from './pages/WeekdayAnalysis';
import { KpiDashboard } from './pages/KpiDashboard';
import { MasterData } from './pages/MasterData';
import { UploadHistory } from './pages/UploadHistory';
import { DeliveryTracker } from './pages/DeliveryTracker';
import { WeeklyReport } from './pages/WeeklyReport';
import { DocumentImport } from './pages/DocumentImport';
import { DocumentReturnReport } from './pages/DocumentReturnReport';
import {
  HOLIDAYS,
  STORE_CLOSURES,
  KPI_CONFIGS,
  DELAY_REASONS,
  DEFAULT_USER
} from './constants';
import {
  DeliveryRecord,
  Holiday,
  StoreClosure,
  KpiConfig,
  DelayReason,
  ImportLog,
  ReasonAuditLog,
  User,
  ReasonStatus,
  KpiStatus,
  StoreMapping
} from './types';
import { getRealtimeDb } from './services/firebase';
import { syncWeeklyDeliveriesToReturnNeosiam } from './services/returnNeosiamSync';
import { ref, set, get } from 'firebase/database';
import { calculateKpiStatus, calculatePendingKpiStatus } from './utils/kpiEngine';

const KPI_CONFIGS_PATH = 'kpiConfigs';
const HOLIDAYS_PATH = 'holidays';
const STORE_CLOSURES_PATH = 'storeClosures';
const DELAY_REASONS_PATH = 'delayReasons';
const STORE_MAPPINGS_PATH = 'storeMappings';

// Firebase keys cannot contain . # $ / [ ]
function sanitizeFirebaseKey(key: string): string {
  return key.replace(/[.#$\[\]/]/g, '_');
}

// Replace undefined with null recursively to satisfy Firebase and avoid runtime errors
function cleanUndefined<T>(val: T): T {
  if (val === undefined) return null as any;
  if (Array.isArray(val)) return val.map(cleanUndefined) as any;
  if (val && typeof val === 'object') {
    const out: Record<string, any> = {};
    Object.entries(val as Record<string, any>).forEach(([k, v]) => {
      const cleaned = cleanUndefined(v);
      if (cleaned !== undefined) out[k] = cleaned;
    });
    return out as any;
  }
  return val;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>(HOLIDAYS);
  const [storeClosures, setStoreClosures] = useState<StoreClosure[]>(STORE_CLOSURES);
  const [kpiConfigs, setKpiConfigs] = useState<KpiConfig[]>(KPI_CONFIGS);
  const [delayReasons, setDelayReasons] = useState<DelayReason[]>(DELAY_REASONS);
  const [storeMappings, setStoreMappings] = useState<StoreMapping[]>([]);
  const kpiLoadedFromFirebase = useRef(false);
  const holidaysLoadedFromFirebase = useRef(false);
  const storeClosuresLoadedFromFirebase = useRef(false);
  const delayReasonsLoadedFromFirebase = useRef(false);
  const storeMappingsLoadedFromFirebase = useRef(false);
  const [deliveriesLoaded, setDeliveriesLoaded] = useState(false);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [reasonAuditLogs, setReasonAuditLogs] = useState<ReasonAuditLog[]>([]);
  const [currentUser] = useState<User>(DEFAULT_USER);

  const handleImportComplete = useCallback((newRecords: DeliveryRecord[], importLog: ImportLog) => {
    setDeliveries(prev => {
      // Use orderNo as unique key — every Inv. stored separately
      const existingMap = new Map(prev.map(d => [d.orderNo, d]));
      newRecords.forEach(record => {
        const existing = existingMap.get(record.orderNo);
        // ถ้า order เดิมมีการระบุเหตุผลแล้ว (SUBMITTED/APPROVED) → ให้คง reason ไว้
        if (existing && (existing.reasonStatus === ReasonStatus.SUBMITTED || existing.reasonStatus === ReasonStatus.APPROVED)) {
          existingMap.set(record.orderNo, {
            ...record,
            reasonStatus: existing.reasonStatus,
            delayReason: existing.delayReason,
            updatedAt: existing.updatedAt,
          });
        } else {
          existingMap.set(record.orderNo, record);
        }
      });
      const merged = Array.from(existingMap.values());

      // Sync merged deliveries to Firebase (strip productDetails to save bandwidth)
      const db = getRealtimeDb();
      const stripped = merged.map(d => { const { productDetails: _pd, ...rest } = d; return cleanUndefined(rest); });
      if (db) {
        const obj: Record<string, any> = {};
        stripped.forEach(d => { obj[sanitizeFirebaseKey(d.orderNo)] = d; });
        set(ref(db, 'deliveries'), obj).catch(e =>
          console.warn('[Firebase] sync deliveries error:', e)
        );
      }
      syncWeeklyDeliveriesToReturnNeosiam(stripped, kpiConfigs);

      // Update localStorage cache so next page load uses fresh data (no Firebase read needed)
      try { localStorage.setItem('deliveries_cache', JSON.stringify(stripped)); } catch { /* quota */ }

      return merged;
    });
    setImportLogs(prev => [...prev, importLog]);

    // Auto-detect new province/district combos not in KPI config → create drafts
    setKpiConfigs(prevConfigs => {
      // ── Normalize ก่อน compare เพื่อป้องกัน duplicate จาก whitespace / case ────
      const normStr = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

      // ── Auto-deduplicate prevConfigs ที่มีอยู่ (กัน double จาก import คราวก่อน) ───
      const seenIds = new Set<string>();
      const dedupedConfigs = prevConfigs.filter(c => {
        const key = `${normStr(c.province || '')}|${normStr(c.district)}`;
        if (seenIds.has(key)) return false; // ซ้ำ → ตัดออก
        seenIds.add(key);
        return true;
      });

      // ── Build seen set จาก deduped configs ─────────────────────────────────────
      const seen = new Set(dedupedConfigs.map(c =>
        `${normStr(c.province || '')}|${normStr(c.district)}`
      ));
      // ตรวจ district เดี่ยวด้วย (กรณี config เก่าไม่มี province แต่ใหม่มี)
      const seenByDistrict = new Set(dedupedConfigs.map(c => normStr(c.district)));

      const draftsToAdd: KpiConfig[] = [];
      const combos = new Set<string>();

      // คำที่บ่งบอกว่าค่านี้เป็นชื่อบริษัท/ร้านค้า ไม่ใช่ชื่ออำเภอ
      const COMPANY_KEYWORDS = ['จำกัด', 'บริษัท', 'ห้างหุ้นส่วน', 'มหาชน', 'หจก.', 'บจก.', ' co.', ' ltd'];

      newRecords.forEach(r => {
        if (!r.district) return;

        // ข้ามถ้าค่า district ดูเหมือนชื่อบริษัท/ร้านค้า (ไม่ใช่ชื่ออำเภอ)
        const districtLower = r.district.toLowerCase();
        const looksLikeCompany = COMPANY_KEYWORDS.some(kw => districtLower.includes(kw));
        const tooLong = r.district.length > 40;
        if (looksLikeCompany || tooLong) return;

        const key = `${normStr(r.province || '')}|${normStr(r.district)}`;
        const distKey = normStr(r.district);
        // ข้ามถ้า province+district ซ้ำ หรือ district เดียวกัน (ต่างกันแค่ province)
        if (!seen.has(key) && !combos.has(key) && !seenByDistrict.has(distKey)) {
          combos.add(key);
          draftsToAdd.push({
            id: `kpi-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            province: r.province || undefined,
            district: r.district,
            onTimeLimit: 1,
            isDraft: true
          });
        }
      });

      // คืนค่า dedupedConfigs (แทน prevConfigs) เพื่อลบ duplicate ที่มีอยู่
      return draftsToAdd.length > 0
        ? [...dedupedConfigs, ...draftsToAdd]
        : dedupedConfigs;
    });

    setActiveTab('dashboard');
  }, []);

  const handleRecalculateKpi = useCallback(() => {
    console.log('[Recalculate KPI] Started');
    setDeliveries(prev => {
      let failCount = 0;
      const recalculated = prev.map(d => {
        const isDelivered = d.deliveryStatus === 'ส่งเสร็จ';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().slice(0, 10);
        
        // Recalculate KPI with new logic
        const kpi = (() => {
          if (isDelivered) {
            // For delivered items, use standard KPI calculation
            return calculateKpiStatus(d.planDate, d.actualDate, d.district, kpiConfigs, holidays, storeClosures, d.storeId, d.province);
          }
          // For pending deliveries, use strict calculation (no grace period)
          const result = calculatePendingKpiStatus(d.planDate, todayStr, d.district, kpiConfigs, holidays, storeClosures, d.storeId, d.province);
          if (result.kpiStatus === KpiStatus.NOT_PASS) {
            failCount++;
            console.log(`[Recalculate KPI] FAIL: ${d.orderNo}, planDate=${d.planDate}, today=${todayStr}, status=${d.deliveryStatus}`);
          }
          return result;
        })();

        // Preserve existing reason if already submitted/approved
        if (d.reasonStatus === ReasonStatus.SUBMITTED || d.reasonStatus === ReasonStatus.APPROVED) {
          return {
            ...d,
            kpiStatus: kpi.kpiStatus,
            delayDays: kpi.delayDays,
          };
        }

        return {
          ...d,
          kpiStatus: kpi.kpiStatus,
          delayDays: kpi.delayDays,
          reasonRequired: kpi.reasonRequired,
          reasonStatus: kpi.reasonStatus,
        };
      });

      // Sync to Firebase
      const db = getRealtimeDb();
      const stripped = recalculated.map(d => { const { productDetails: _pd, ...rest } = d; return cleanUndefined(rest); });
      if (db) {
        const obj: Record<string, any> = {};
        stripped.forEach(d => { obj[sanitizeFirebaseKey(d.orderNo)] = d; });
        set(ref(db, 'deliveries'), obj).catch(e => console.warn('[Firebase] recalculate sync error:', e));
      }

      // Update localStorage cache
      try { localStorage.setItem('deliveries_cache', JSON.stringify(stripped)); } catch { /* quota */ }

      console.log(`[Recalculate KPI] Completed. Total FAIL: ${failCount}, Total records: ${recalculated.length}`);
      return recalculated;
    });
  }, [kpiConfigs, holidays, storeClosures]);

  // Load deliveries: localStorage cache first for fast display, then sync with Firebase
  useEffect(() => {
    let cachedRecords: DeliveryRecord[] = [];
    
    // Step 1: Load from localStorage for immediate display
    try {
      const cached = localStorage.getItem('deliveries_cache');
      if (cached) {
        cachedRecords = JSON.parse(cached);
        if (cachedRecords.length > 0) {
          console.log(`[Load] localStorage cache: ${cachedRecords.length} records`);
          setDeliveries(cachedRecords);
        }
      }
    } catch { /* ignore parse errors */ }

    // Step 2: Always load from Firebase and merge with cache (use larger dataset)
    const db = getRealtimeDb();
    if (!db) {
      setDeliveriesLoaded(true);
      return;
    }
    
    get(ref(db, 'deliveries'))
      .then(snapshot => {
        if (snapshot.exists()) {
          const firebaseRecords: DeliveryRecord[] = Object.values(snapshot.val());
          console.log(`[Load] Firebase: ${firebaseRecords.length} records`);
          
          // Merge: use orderNo as key, Firebase takes precedence for conflicts
          const mergedMap = new Map<string, DeliveryRecord>();
          
          // Add cached records first
          cachedRecords.forEach(d => mergedMap.set(d.orderNo, d));
          
          // Firebase records override/add
          firebaseRecords.forEach(d => mergedMap.set(d.orderNo, d));
          
          const merged = Array.from(mergedMap.values());
          console.log(`[Load] Merged total: ${merged.length} records`);
          
          setDeliveries(merged);
          syncWeeklyDeliveriesToReturnNeosiam(merged, kpiConfigs);
          
          // Update localStorage with merged data
          try { 
            localStorage.setItem('deliveries_cache', JSON.stringify(merged)); 
            console.log(`[Load] localStorage updated with ${merged.length} records`);
          } catch (e) { 
            console.warn('[Load] localStorage write failed:', e);
          }
        } else if (cachedRecords.length === 0) {
          console.log('[Load] No data in Firebase or cache');
        }
        setDeliveriesLoaded(true);
      })
      .catch(e => {
        console.warn('[Firebase] load deliveries error:', e);
        setDeliveriesLoaded(true);
      });
  }, []);

  // Load holidays from Firebase on mount (one-time get)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) { holidaysLoadedFromFirebase.current = true; return; }
    get(ref(db, HOLIDAYS_PATH))
      .then(snapshot => {
        if (snapshot.exists()) {
          setHolidays(Object.values(snapshot.val()) as Holiday[]);
        } else {
          const obj: Record<string, Holiday> = {};
          HOLIDAYS.forEach(h => { obj[h.id] = h; });
          set(ref(db, HOLIDAYS_PATH), obj);
        }
        holidaysLoadedFromFirebase.current = true;
      })
      .catch(() => { holidaysLoadedFromFirebase.current = true; });
  }, []);

  // Save holidays to Firebase whenever they change
  useEffect(() => {
    if (!holidaysLoadedFromFirebase.current) return;
    const db = getRealtimeDb();
    if (!db) return;
    try {
      const obj: Record<string, Holiday> = {};
      holidays.forEach(h => { obj[h.id] = cleanUndefined(h); });
      set(ref(db, HOLIDAYS_PATH), obj);
    } catch { /* silent */ }
  }, [holidays]);

  // Load storeClosures from Firebase on mount (one-time get)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) { storeClosuresLoadedFromFirebase.current = true; return; }
    get(ref(db, STORE_CLOSURES_PATH))
      .then(snapshot => {
        if (snapshot.exists()) {
          setStoreClosures(Object.values(snapshot.val()) as StoreClosure[]);
        } else {
          const obj: Record<string, StoreClosure> = {};
          STORE_CLOSURES.forEach(c => { obj[c.id] = c; });
          set(ref(db, STORE_CLOSURES_PATH), obj);
        }
        storeClosuresLoadedFromFirebase.current = true;
      })
      .catch(() => { storeClosuresLoadedFromFirebase.current = true; });
  }, []);

  // Save storeClosures to Firebase whenever they change
  useEffect(() => {
    if (!storeClosuresLoadedFromFirebase.current) return;
    const db = getRealtimeDb();
    if (!db) return;
    try {
      const obj: Record<string, StoreClosure> = {};
      storeClosures.forEach(c => { obj[c.id] = cleanUndefined(c); });
      set(ref(db, STORE_CLOSURES_PATH), obj);
    } catch { /* silent */ }
  }, [storeClosures]);

  // Load delayReasons from Firebase on mount (one-time get)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) { delayReasonsLoadedFromFirebase.current = true; return; }
    get(ref(db, DELAY_REASONS_PATH))
      .then(snapshot => {
        if (snapshot.exists()) {
          setDelayReasons(Object.values(snapshot.val()) as DelayReason[]);
        } else {
          const obj: Record<string, DelayReason> = {};
          DELAY_REASONS.forEach(r => { obj[r.code] = r; });
          set(ref(db, DELAY_REASONS_PATH), obj);
        }
        delayReasonsLoadedFromFirebase.current = true;
      })
      .catch(() => { delayReasonsLoadedFromFirebase.current = true; });
  }, []);

  // Save delayReasons to Firebase whenever they change
  useEffect(() => {
    if (!delayReasonsLoadedFromFirebase.current) return;
    const db = getRealtimeDb();
    if (!db) return;
    try {
      const obj: Record<string, DelayReason> = {};
      delayReasons.forEach(r => { obj[r.code] = cleanUndefined(r); });
      set(ref(db, DELAY_REASONS_PATH), obj);
    } catch { /* silent */ }
  }, [delayReasons]);

  // Load storeMappings from Firebase on mount
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) { storeMappingsLoadedFromFirebase.current = true; return; }
    get(ref(db, STORE_MAPPINGS_PATH))
      .then(snapshot => {
        if (snapshot.exists()) {
          setStoreMappings(Object.values(snapshot.val()) as StoreMapping[]);
        }
        storeMappingsLoadedFromFirebase.current = true;
      })
      .catch(() => { storeMappingsLoadedFromFirebase.current = true; });
  }, []);

  // Save storeMappings to Firebase whenever they change
  useEffect(() => {
    if (!storeMappingsLoadedFromFirebase.current) return;
    const db = getRealtimeDb();
    if (!db) return;
    try {
      const obj: Record<string, StoreMapping> = {};
      storeMappings.forEach(m => { obj[sanitizeFirebaseKey(m.storeId)] = cleanUndefined(m); });
      set(ref(db, STORE_MAPPINGS_PATH), obj);
    } catch { /* silent */ }
  }, [storeMappings]);

  // Load kpiConfigs from Firebase on mount (one-time get)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) { kpiLoadedFromFirebase.current = true; return; }
    get(ref(db, KPI_CONFIGS_PATH))
      .then(snapshot => {
        if (snapshot.exists()) {
          const configs: KpiConfig[] = Object.values(snapshot.val());
          setKpiConfigs(configs);
        } else {
          const obj: Record<string, KpiConfig> = {};
          KPI_CONFIGS.forEach(c => { obj[c.id] = c; });
          set(ref(db, KPI_CONFIGS_PATH), obj);
        }
        kpiLoadedFromFirebase.current = true;
      })
      .catch(() => { kpiLoadedFromFirebase.current = true; });
  }, []);

  // Re-sync weekly deliveries to ReturnNeosiam when kpiConfigs is loaded from Firebase
  // (deliveries load first, kpiConfigs loads async — need to re-sync with correct branch mapping)
  useEffect(() => {
    if (!kpiLoadedFromFirebase.current) return;
    if (deliveries.length === 0) return;
    syncWeeklyDeliveriesToReturnNeosiam(deliveries, kpiConfigs);
  }, [kpiConfigs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save kpiConfigs to Firebase whenever they change (after initial load)
  useEffect(() => {
    if (!kpiLoadedFromFirebase.current) return;
    const db = getRealtimeDb();
    if (!db) return;
    try {
      const obj: Record<string, KpiConfig> = {};
      kpiConfigs.forEach(c => { obj[c.id] = c; });
      set(ref(db, KPI_CONFIGS_PATH), obj);
    } catch { /* silent */ }
  }, [kpiConfigs]);

  const handleAddKpiConfig = useCallback((newConfig: Omit<KpiConfig, 'id'>) => {
    const config: KpiConfig = {
      ...newConfig,
      id: `kpi-${Date.now()}`
    };
    setKpiConfigs(prev => [...prev, config]);
  }, []);

  const handleUpdateDelivery = useCallback((updated: DeliveryRecord, action?: 'submitted' | 'approved' | 'rejected') => {
    setDeliveries(prev => prev.map(d => d.orderNo === updated.orderNo ? updated : d));

    // Sync updated delivery to Firebase
    const db = getRealtimeDb();
    if (db) {
      const key = sanitizeFirebaseKey(updated.orderNo);
      const { productDetails: _pd, ...rest } = updated;
      set(ref(db, `deliveries/${key}`), cleanUndefined(rest)).catch(e =>
        console.warn('[Firebase] sync updated delivery error:', e)
      );
    }

    if (action) {
      const auditLog: ReasonAuditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        orderNo: updated.orderNo,
        action,
        userId: currentUser.id,
        userName: currentUser.name,
        reason: updated.delayReason
      };
      setReasonAuditLogs(prev => [...prev, auditLog]);
    }
  }, [currentUser]);

  const canAccess = (tab: string): boolean => {
    if (currentUser.role === 'Admin') return true;
    if (currentUser.role === 'Staff') {
      return ['dashboard', 'import', 'exceptions', 'analysis'].includes(tab);
    }
    return ['dashboard', 'analysis'].includes(tab);
  };

  const renderContent = () => {
    if (!canAccess(activeTab)) {
      return (
        <div className="p-8 text-center text-gray-500">
          <i className="fas fa-lock text-6xl mb-4 text-gray-300"></i>
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p>You don't have permission to view this page.</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'import':
        return (
          <Import
            onImportComplete={handleImportComplete}
            existingDeliveries={deliveries}
            kpiConfigs={kpiConfigs}
            holidays={holidays}
            storeClosures={storeClosures}
            currentUser={currentUser}
            isDataLoaded={deliveriesLoaded}
            storeMappings={storeMappings}
          />
        );
      case 'exceptions':
        return (
          <KpiExceptions
            deliveries={deliveries}
            onUpdateDelivery={handleUpdateDelivery}
            userRole={currentUser.role}
            delayReasons={delayReasons}
            kpiConfigs={kpiConfigs}
          />
        );
      case 'upload-history':
        return <UploadHistory importLogs={importLogs} deliveries={deliveries} />;
      case 'delivery-status':
        return <DeliveryTracker deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'weekly-report':
        return <WeeklyReport 
          deliveries={deliveries} 
          kpiConfigs={kpiConfigs} 
          storeMappings={storeMappings}
          onUpdateDeliveries={(updated) => {
            setDeliveries(updated);
            // Sync to Firebase
            const db = getRealtimeDb();
            const stripped = updated.map(d => { const { productDetails: _pd, ...rest } = d; return cleanUndefined(rest); });
            if (db) {
              const obj: Record<string, any> = {};
              stripped.forEach(d => { obj[sanitizeFirebaseKey(d.orderNo)] = d; });
              set(ref(db, 'deliveries'), obj).catch(e => console.warn('[Firebase] sync error:', e));
            }
            // Update localStorage
            try { localStorage.setItem('deliveries_cache', JSON.stringify(stripped)); } catch { /* quota */ }
          }}
          onAddStoreMapping={(mapping) => setStoreMappings(prev => [...prev.filter(m => m.storeId !== mapping.storeId), mapping])}
        />;
      case 'document-import':
        return <DocumentImport 
          deliveries={deliveries}
          onUpdateDeliveries={(updated) => {
            setDeliveries(updated);
            const db = getRealtimeDb();
            const stripped = updated.map(d => { const { productDetails: _pd, ...rest } = d; return cleanUndefined(rest); });
            if (db) {
              const obj: Record<string, any> = {};
              stripped.forEach(d => { obj[sanitizeFirebaseKey(d.orderNo)] = d; });
              set(ref(db, 'deliveries'), obj).catch(e => console.warn('[Firebase] sync error:', e));
            }
            try { localStorage.setItem('deliveries_cache', JSON.stringify(stripped)); } catch { /* quota */ }
          }}
        />;
      case 'document-report':
        return <DocumentReturnReport deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'kpi-dashboard':
        return <KpiDashboard deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'analysis':
        return <WeekdayAnalysis deliveries={deliveries} kpiConfigs={kpiConfigs} holidays={holidays} storeClosures={storeClosures} />;
      case 'settings':
        return (
          <MasterData
            holidays={holidays}
            storeClosures={storeClosures}
            kpiConfigs={kpiConfigs}
            delayReasons={delayReasons}
            importLogs={importLogs}
            deliveries={deliveries}
            onUpdateHolidays={setHolidays}
            onUpdateStoreClosures={setStoreClosures}
            onUpdateKpiConfigs={setKpiConfigs}
            onAddKpiConfig={handleAddKpiConfig}
            onUpdateDelayReasons={setDelayReasons}
            onRecalculateKpi={handleRecalculateKpi}
            userRole={currentUser.role}
          />
        );
      default:
        return <Dashboard deliveries={deliveries} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Navbar user={currentUser} />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole={currentUser.role}
        onCollapseChange={setSidebarCollapsed}
      />

      <main className={`flex-1 pt-16 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
