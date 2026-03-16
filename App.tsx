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
import { Forecast } from './pages/Forecast';
import { BranchResources } from './pages/BranchResources';
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
  StoreMapping,
  BranchResource,
  BranchResourceHistory
} from './types';
import { syncWeeklyDeliveriesToReturnNeosiam } from './services/returnNeosiamSync';
import * as api from './services/api';
import { calculateKpiStatus, calculatePendingKpiStatus } from './utils/kpiEngine';

// Using NAS API for all data operations (100% NAS sync)

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>(HOLIDAYS);
  const [storeClosures, setStoreClosures] = useState<StoreClosure[]>(STORE_CLOSURES);
  const [kpiConfigs, setKpiConfigs] = useState<KpiConfig[]>(KPI_CONFIGS);
  const [delayReasons, setDelayReasons] = useState<DelayReason[]>(DELAY_REASONS);
  const [storeMappings, setStoreMappings] = useState<StoreMapping[]>([]);
  const [branchResources, setBranchResources] = useState<BranchResource[]>([]);
  const dataLoadedFromNAS = useRef(false);
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
            // Force overwrite qty ถ้า record ใหม่มีค่า > 0
            qty: record.qty > 0 ? record.qty : existing.qty,
            reasonStatus: existing.reasonStatus,
            delayReason: existing.delayReason,
            updatedAt: existing.updatedAt,
          });
        } else if (existing) {
          // Force overwrite: ใช้ record ใหม่ทั้งหมด ไม่เก็บค่าเก่าที่อาจผิดพลาด
          existingMap.set(record.orderNo, record);
        } else {
          existingMap.set(record.orderNo, record);
        }
      });
      const merged = Array.from(existingMap.values());

      // Save to NAS API
      api.saveDeliveries(merged).catch(err => console.warn('[NAS API] save deliveries error:', err));
      syncWeeklyDeliveriesToReturnNeosiam(merged, kpiConfigs);

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
    console.log('[Recalculate KPI] Started - will also reset invalid actualDate');
    setDeliveries(prev => {
      let failCount = 0;
      let resetCount = 0;
      const recalculated = prev.map(d => {
        const isDelivered = d.deliveryStatus === 'ส่งเสร็จ';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().slice(0, 10);
        
        // ตรวจสอบว่า actualDate ถูกต้องหรือไม่
        // ถ้า actualDate ห่างจาก planDate มากเกินไป (> 60 วัน) หรือเป็นค่าที่ไม่สมเหตุสมผล
        // ให้ reset เป็น planDate (ถือว่าส่งตรงเวลา)
        let correctedActualDate = d.actualDate;
        if (isDelivered && d.actualDate && d.planDate) {
          const actualMs = new Date(d.actualDate).getTime();
          const planMs = new Date(d.planDate).getTime();
          const diffDays = Math.abs(actualMs - planMs) / (1000 * 60 * 60 * 24);
          // ถ้า actualDate ห่างจาก planDate มากกว่า 60 วัน → น่าจะผิด → reset เป็น planDate
          if (diffDays > 60) {
            console.log(`[Recalculate KPI] Reset actualDate for ${d.orderNo}: ${d.actualDate} → ${d.planDate} (diff: ${diffDays.toFixed(0)} days)`);
            correctedActualDate = d.planDate;
            resetCount++;
          }
        }
        
        // Recalculate KPI with new logic
        const kpi = (() => {
          if (isDelivered) {
            // For delivered items, use standard KPI calculation with corrected actualDate
            return calculateKpiStatus(d.planDate, correctedActualDate || d.planDate, d.district, kpiConfigs, holidays, storeClosures, d.storeId, d.province);
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
            actualDate: correctedActualDate, // Update corrected actualDate
            kpiStatus: kpi.kpiStatus,
            delayDays: kpi.delayDays,
          };
        }

        return {
          ...d,
          actualDate: correctedActualDate, // Update corrected actualDate
          kpiStatus: kpi.kpiStatus,
          delayDays: kpi.delayDays,
          reasonRequired: kpi.reasonRequired,
          reasonStatus: kpi.reasonStatus,
        };
      });

      // Save to NAS API
      api.saveDeliveries(recalculated).catch(err => console.warn('[NAS API] recalculate sync error:', err));

      console.log(`[Recalculate KPI] Completed. Total FAIL: ${failCount}, Reset actualDate: ${resetCount}, Total records: ${recalculated.length}`);
      return recalculated;
    });
  }, [kpiConfigs, holidays, storeClosures]);

  // Load all data from NAS API on mount
  useEffect(() => {
    const loadDataFromNAS = async () => {
      try {
        console.log('[NAS API] Loading data from NAS...');
        
        // Load all data in parallel
        const [
          deliveriesData,
          holidaysData,
          kpiConfigsData,
          delayReasonsData,
          storeMappingsData,
          branchResourcesData
        ] = await Promise.all([
          api.getDeliveries().catch(() => []),
          api.getHolidays().catch(() => HOLIDAYS),
          api.getKpiConfigs().catch(() => KPI_CONFIGS),
          api.getDelayReasons().catch(() => DELAY_REASONS),
          api.getStoreMappings().catch(() => []),
          api.getBranchResources().catch(() => [])
        ]);

        console.log(`[NAS API] Loaded: ${deliveriesData.length} deliveries, ${kpiConfigsData.length} kpi-configs`);
        
        setDeliveries(deliveriesData);
        setHolidays(holidaysData.length > 0 ? holidaysData : HOLIDAYS);
        setKpiConfigs(kpiConfigsData.length > 0 ? kpiConfigsData : KPI_CONFIGS);
        setDelayReasons(delayReasonsData.length > 0 ? delayReasonsData : DELAY_REASONS);
        setStoreMappings(storeMappingsData);
        setBranchResources(branchResourcesData);
        
        if (deliveriesData.length > 0) {
          syncWeeklyDeliveriesToReturnNeosiam(deliveriesData, kpiConfigsData);
        }
        
        dataLoadedFromNAS.current = true;
        setDeliveriesLoaded(true);
      } catch (error) {
        console.error('[NAS API] Error loading data:', error);
        setDeliveriesLoaded(true);
      }
    };
    
    loadDataFromNAS();
  }, []);

  // All data is now loaded from NAS API in the useEffect above

  // Handle save branch resource with history
  const handleSaveBranchResource = useCallback((resource: BranchResource, oldResource?: BranchResource) => {
    console.log('[BranchResource] handleSaveBranchResource called:', resource.branchName);
    
    // Update or add resource in local state
    setBranchResources(prev => {
      const exists = prev.find(b => b.id === resource.id);
      if (exists) {
        return prev.map(b => b.id === resource.id ? resource : b);
      }
      return [...prev, resource];
    });

    // Save to NAS API
    api.saveBranchResource(resource)
      .then(() => console.log('[NAS API] Branch resource saved:', resource.branchName))
      .catch(err => console.error('[NAS API] Save branch resource error:', err));
  }, []);

  const handleAddKpiConfig = useCallback((newConfig: Omit<KpiConfig, 'id'>) => {
    const config: KpiConfig = {
      ...newConfig,
      id: `kpi-${Date.now()}`
    };
    setKpiConfigs(prev => [...prev, config]);
  }, []);

  const handleUpdateDelivery = useCallback((updated: DeliveryRecord, action?: 'submitted' | 'approved' | 'rejected') => {
    setDeliveries(prev => prev.map(d => d.orderNo === updated.orderNo ? updated : d));

    // Save to NAS API
    api.saveDelivery(updated).catch(err => console.warn('[NAS API] save delivery error:', err));

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
        return <UploadHistory 
          importLogs={importLogs} 
          deliveries={deliveries} 
          kpiConfigs={kpiConfigs}
          onUpdateDelivery={async (orderNo, updates) => {
            const existing = deliveries.find(d => d.orderNo === orderNo);
            if (existing) {
              const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
              handleUpdateDelivery(updated);
            }
          }}
        />;
      case 'delivery-status':
        return <DeliveryTracker 
          deliveries={deliveries} 
          kpiConfigs={kpiConfigs}
          holidays={holidays}
          storeClosures={storeClosures}
          onUpdateDelivery={(updated) => {
            // Debug log เพื่อยืนยันว่า flag ถูกส่งมา
            console.log(`[App.tsx] onUpdateDelivery received:`, {
              orderNo: updated.orderNo,
              manualPlanDate: updated.manualPlanDate,
              manualActualDate: updated.manualActualDate,
              planDate: updated.planDate,
              actualDate: updated.actualDate,
              kpiStatus: updated.kpiStatus,
              delayDays: updated.delayDays
            });
            
            // Update single delivery in state and save to NAS
            setDeliveries(prev => prev.map(d => d.orderNo === updated.orderNo ? updated : d));
            api.saveDelivery(updated).catch(err => console.warn('[NAS API] save error:', err));
          }}
        />;
      case 'weekly-report':
        return <WeeklyReport 
          deliveries={deliveries} 
          kpiConfigs={kpiConfigs} 
          storeMappings={storeMappings}
          onUpdateDeliveries={(updated) => {
            setDeliveries(updated);
            api.saveDeliveries(updated).catch(err => console.warn('[NAS API] sync error:', err));
          }}
          onAddStoreMapping={(mapping) => {
            setStoreMappings(prev => [...prev.filter(m => m.storeId !== mapping.storeId), mapping]);
            api.saveStoreMapping(mapping).catch(err => console.warn('[NAS API] save mapping error:', err));
          }}
        />;
      case 'document-import':
        return <DocumentImport 
          deliveries={deliveries}
          kpiConfigs={kpiConfigs}
          onUpdateDeliveries={(updated) => {
            setDeliveries(updated);
            api.saveDeliveries(updated).catch(err => console.warn('[NAS API] sync error:', err));
          }}
        />;
      case 'document-report':
        return <DocumentReturnReport deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'kpi-dashboard':
        return <KpiDashboard deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'forecast':
        return <Forecast deliveries={deliveries} kpiConfigs={kpiConfigs} />;
      case 'branch-resources':
        return (
          <BranchResources
            kpiConfigs={kpiConfigs}
            deliveries={deliveries}
            branchResources={branchResources}
            onSaveBranchResource={handleSaveBranchResource}
            currentUserEmail={currentUser.email || currentUser.name}
          />
        );
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
