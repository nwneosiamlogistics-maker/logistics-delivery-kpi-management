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
  ReasonStatus
} from './types';
import { getRealtimeDb } from './services/firebase';
import { ref, onValue, set, get } from 'firebase/database';

const KPI_CONFIGS_PATH = 'kpiConfigs';

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
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>(HOLIDAYS);
  const [storeClosures, setStoreClosures] = useState<StoreClosure[]>(STORE_CLOSURES);
  const [kpiConfigs, setKpiConfigs] = useState<KpiConfig[]>(KPI_CONFIGS);
  const [delayReasons, setDelayReasons] = useState<DelayReason[]>(DELAY_REASONS);
  const kpiLoadedFromFirebase = useRef(false);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [reasonAuditLogs, setReasonAuditLogs] = useState<ReasonAuditLog[]>([]);
  const [currentUser] = useState<User>(DEFAULT_USER);

  const handleImportComplete = useCallback((newRecords: DeliveryRecord[], importLog: ImportLog) => {
    setDeliveries(prev => {
      // Use orderNo as unique key — every Inv. stored separately
      const existingMap = new Map(prev.map(d => [d.orderNo, d]));
      newRecords.forEach(record => {
        existingMap.set(record.orderNo, record);
      });
      const merged = Array.from(existingMap.values());

      // Sync merged deliveries to Firebase (strip productDetails to save bandwidth)
      const db = getRealtimeDb();
      if (db) {
        const obj: Record<string, Omit<DeliveryRecord, 'productDetails'>> = {};
        merged.forEach(d => {
          const key = sanitizeFirebaseKey(d.orderNo);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { productDetails: _pd, ...rest } = d;
          obj[key] = cleanUndefined(rest);
        });
        set(ref(db, 'deliveries'), obj).catch(e =>
          console.warn('[Firebase] sync deliveries error:', e)
        );
      }

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

  // Load deliveries from Firebase on mount (one-time read to minimize bandwidth)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) return;
    get(ref(db, 'deliveries'))
      .then(snapshot => {
        if (snapshot.exists()) {
          const records: DeliveryRecord[] = Object.values(snapshot.val());
          setDeliveries(records);
        }
      })
      .catch(e => console.warn('[Firebase] load deliveries error:', e));
  }, []);

  // Load kpiConfigs from Firebase on mount
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) {
      kpiLoadedFromFirebase.current = true;
      return;
    }
    try {
      const kpiRef = ref(db, KPI_CONFIGS_PATH);
      const unsub = onValue(kpiRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const configs: KpiConfig[] = Object.values(data);
          setKpiConfigs(configs);
        } else {
          const obj: Record<string, KpiConfig> = {};
          KPI_CONFIGS.forEach(c => { obj[c.id] = c; });
          set(ref(db, KPI_CONFIGS_PATH), obj);
        }
        kpiLoadedFromFirebase.current = true;
      });
      return () => unsub();
    } catch {
      kpiLoadedFromFirebase.current = true;
    }
  }, []);

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
        return <WeeklyReport deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'kpi-dashboard':
        return <KpiDashboard deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'analysis':
        return <WeekdayAnalysis deliveries={deliveries} kpiConfigs={kpiConfigs} />;
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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userRole={currentUser.role} />

      <main className="flex-1 ml-64 pt-16 transition-all duration-300">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
