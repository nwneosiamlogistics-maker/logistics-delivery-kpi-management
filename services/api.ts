/**
 * NAS API Service
 * Handles all data operations with the backend API on Synology NAS
 * Replace Firebase with this service for 100% NAS data sync
 */

import { 
  DeliveryRecord, 
  Holiday, 
  StoreClosure, 
  KpiConfig, 
  DelayReason, 
  StoreMapping, 
  BranchResource,
  BranchResourceHistory,
  ImportLog,
  DocumentImportLog
} from '../types';

const USER_ROLES = ['Admin', 'Staff', 'Viewer'] as const;
type UserRole = typeof USER_ROLES[number];
type ApiUser = {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
};

// Strip ISO time portion from date strings (2026-03-11T00:00:00.000Z → 2026-03-11)
function formatApiDate(d: string | null | undefined): string {
  if (!d) return '';
  return d.includes('T') ? d.slice(0, 10) : d;
}

// Convert empty/whitespace date strings to null before sending to API
function normalizeApiDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Windows-1252 → byte mapping (MySQL "latin1" is actually cp1252)
const CP1252_MAP: Record<number, number> = {
  0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,
  0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,
  0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,
  0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
  0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,
  0x017E:0x9E,0x0178:0x9F,
};

// Fix double-encoded UTF-8 Thai text (browser-side, cp1252-aware)
function fixDoubleEncoded(str: string | null | undefined): string {
  if (!str || !/[À-ÿ]/.test(str)) return str || '';
  try {
    const bytes = new Uint8Array([...str].map(c => {
      const cp = c.charCodeAt(0);
      return CP1252_MAP[cp] ?? (cp & 0xFF);
    }));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (!decoded.includes('\uFFFD')) return decoded;
  } catch { /* ignore */ }
  return str;
}

// API Base URL
// In local dev, keep empty string so Vite proxy handles /api.
const ENV_API_BASE_URL = import.meta.env.VITE_API_URL?.trim() ?? '';
const API_BASE_URL = import.meta.env.DEV
  ? ENV_API_BASE_URL
  : (ENV_API_BASE_URL || 'https://neosiam.dscloud.biz:8443');

type FirebaseExportSnapshot = {
  deliveries?: Record<string, any>;
  kpiConfigs?: Record<string, any>;
  holidays?: Record<string, any>;
  storeClosures?: Record<string, any>;
  delayReasons?: Record<string, any>;
  storeMappings?: Record<string, any>;
  branchResources?: Record<string, any>;
  branchResourcesHistory?: Record<string, any>;
};

let localSnapshotPromise: Promise<FirebaseExportSnapshot | null> | null = null;

function normalizeUserRole(role: unknown): UserRole | null {
  if (role === 'Admin' || role === 'Staff' || role === 'Viewer') return role;
  return null;
}

function getApiUser(): ApiUser {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('logistics_kpi_user');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ApiUser>;
        const parsedRole = normalizeUserRole(parsed.role);
        if (parsedRole && parsed.id && parsed.name) {
          return {
            id: parsed.id,
            name: parsed.name,
            role: parsedRole,
            email: parsed.email,
          };
        }
      }
    } catch (error) {
      console.warn('[API Auth] Failed to parse current user from localStorage:', error);
    }
  }

  const envRole = normalizeUserRole(import.meta.env.VITE_DEFAULT_USER_ROLE);
  if (envRole && import.meta.env.VITE_DEFAULT_USER_NAME) {
    return {
      id: `env-${envRole.toLowerCase()}`,
      name: import.meta.env.VITE_DEFAULT_USER_NAME,
      role: envRole,
      email: import.meta.env.VITE_DEFAULT_USER_EMAIL || undefined,
    };
  }

  return {
    id: 'viewer-001',
    name: 'ผู้ใช้งานทั่วไป',
    role: 'Viewer',
    email: 'viewer@local',
  };
}

function shouldUseLocalSnapshotFallback(error: unknown): boolean {
  if (!import.meta.env.DEV) return false;
  return error instanceof Error && /403\b/.test(error.message);
}

async function loadLocalSnapshot(): Promise<FirebaseExportSnapshot | null> {
  if (!import.meta.env.DEV) return null;
  if (!localSnapshotPromise) {
    const snapshotModulePath = '../backend/src/firebase-export.json';
    localSnapshotPromise = import(/* @vite-ignore */ snapshotModulePath)
      .then(module => (module.default ?? module) as FirebaseExportSnapshot)
      .catch(error => {
        console.warn('[Local Snapshot] load error:', error);
        return null;
      });
  }
  return localSnapshotPromise;
}

async function withLocalSnapshotFallback<T>(
  loadFromApi: () => Promise<T>,
  loadFromSnapshot: (snapshot: FirebaseExportSnapshot) => T | Promise<T>
): Promise<T> {
  try {
    return await loadFromApi();
  } catch (error) {
    if (!shouldUseLocalSnapshotFallback(error)) {
      throw error;
    }
    const snapshot = await loadLocalSnapshot();
    if (!snapshot) {
      throw error;
    }
    console.warn('[Local Snapshot] Using local fallback because NAS API returned 403');
    return loadFromSnapshot(snapshot);
  }
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const currentUser = getApiUser();
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': currentUser.id,
      'x-user-name': encodeURIComponent(currentUser.name),
      'x-user-role': currentUser.role,
      ...(currentUser.email ? { 'x-user-email': encodeURIComponent(currentUser.email) } : {}),
      ...(options?.headers || {}),
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      ...options,
      headers,
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ========== Deliveries ==========
async function fetchDeliveriesPages(params: string): Promise<DeliveryRecord[]> {
  const PAGE_SIZE = 2000;
  const CONCURRENCY = 3;
  console.log(`[API] calling deliveries/count?${params} from ${API_BASE_URL}`);
  const countData = await fetchAPI<{ count: number }>(`/api/deliveries/count?${params}`);
  const count = countData?.count ?? 0;
  console.log(`[API] deliveries/count?${params} → ${count}`);
  if (count === 0) return [];
  const totalPages = Math.ceil(count / PAGE_SIZE);
  const allRows: any[] = [];
  for (let i = 0; i < totalPages; i += CONCURRENCY) {
    const chunk = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - i) },
      (_, j) => i + j + 1
    );
    const results = await Promise.all(
      chunk.map(page => fetchAPI<any[]>(`/api/deliveries?${params}&page=${page}&limit=${PAGE_SIZE}`))
    );
    results.forEach(rows => allRows.push(...rows));
    console.log(`[API] fetched pages ${i+1}-${i+chunk.length} → allRows=${allRows.length}`);
  }
  console.log(`[API] fetchDeliveriesPages done → ${allRows.length} rows`);
  return allRows.map(mapDeliveryFromAPI);
}

export async function getDeliveries(days = 90): Promise<DeliveryRecord[]> {
  return withLocalSnapshotFallback(
    () => fetchDeliveriesPages(`days=${days}`),
    snapshot => {
      const rows = Object.values(snapshot.deliveries || {});
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
      return rows
        .filter((row: any) => {
          const refDate = row.planDate || row.openDate || row.actualDate;
          if (!refDate) return false;
          const date = new Date(refDate);
          return !Number.isNaN(date.getTime()) && date >= cutoff;
        })
        .map(mapDeliveryFromSnapshot);
    }
  );
}

export async function getAllDeliveries(): Promise<DeliveryRecord[]> {
  return withLocalSnapshotFallback(
    () => fetchDeliveriesPages('all=true'),
    snapshot => Object.values(snapshot.deliveries || {}).map(mapDeliveryFromSnapshot)
  ).catch(err => { console.error('[API] getAllDeliveries failed:', err); return []; });
}

export async function importDeliveries(
  deliveries: DeliveryRecord[],
  onProgress?: (saved: number, total: number) => void
): Promise<{ saved: number; errors: number; total: number }> {
  const mapped = deliveries.map(mapDeliveryToAPI);
  onProgress?.(0, mapped.length);
  const result = await fetchAPI<{ saved: number; errors: number; total: number }>('/api/deliveries/import', {
    method: 'POST',
    body: JSON.stringify(mapped),
  });
  onProgress?.(result.saved, result.total);
  return result;
}

export async function saveDelivery(delivery: DeliveryRecord): Promise<void> {
  await fetchAPI('/api/deliveries', {
    method: 'POST',
    body: JSON.stringify(mapDeliveryToAPI(delivery)),
  });
}

export async function saveDeliveries(deliveries: DeliveryRecord[], onProgress?: (saved: number, total: number) => void): Promise<void> {
  const BATCH_SIZE = 500;
  const CONCURRENCY = 2;
  const mapped = deliveries.map(mapDeliveryToAPI);
  const total = mapped.length;
  let savedCount = 0;
  onProgress?.(0, total);

  // Split into batches
  const batches: any[][] = [];
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    batches.push(mapped.slice(i, i + BATCH_SIZE));
  }

  // Process in parallel groups of CONCURRENCY
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    await Promise.all(
      group.map(async (batch, idx) => {
        try {
          await fetchAPI('/api/deliveries/bulk', {
            method: 'POST',
            body: JSON.stringify(batch),
          });
        } catch (err) {
          console.warn(`[saveDeliveries] batch ${i + idx + 1}/${batches.length} failed, continuing...`, err);
        }
        savedCount += batch.length;
        onProgress?.(Math.min(savedCount, total), total);
      })
    );
  }
  console.log(`[saveDeliveries] done: ${savedCount}/${total} saved`);
}

// ========== Holidays ==========
export async function getHolidays(): Promise<Holiday[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/holidays');
      return data.map(h => ({
        id: h.id,
        date: formatApiDate(h.date),
        name: h.name,
        type: h.type,
      }));
    },
    snapshot => Object.entries(snapshot.holidays || {}).map(([key, h]: [string, any]) => ({
      id: h.id || key,
      date: formatApiDate(h.date),
      name: fixDoubleEncoded(h.name),
      type: h.type,
    }))
  );
}

export async function saveHoliday(holiday: Holiday): Promise<void> {
  await fetchAPI('/api/holidays', {
    method: 'POST',
    body: JSON.stringify(holiday),
  });
}

export async function deleteHoliday(id: string): Promise<void> {
  await fetchAPI(`/api/holidays/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========== KPI Configs ==========
export async function getKpiConfigs(): Promise<KpiConfig[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/kpi-configs');
      return data.map(c => ({
        id: c.id,
        branch: fixDoubleEncoded(c.branch),
        province: fixDoubleEncoded(c.province),
        district: fixDoubleEncoded(c.district),
        onTimeLimit: c.on_time_limit,
        isDraft: Boolean(c.is_draft),
      }));
    },
    snapshot => Object.entries(snapshot.kpiConfigs || {}).map(([key, c]: [string, any]) => ({
      id: c.id || key,
      branch: fixDoubleEncoded(c.branch),
      province: fixDoubleEncoded(c.province),
      district: fixDoubleEncoded(c.district),
      onTimeLimit: c.onTimeLimit,
      isDraft: Boolean(c.isDraft),
    }))
  );
}

export async function saveKpiConfig(config: KpiConfig): Promise<void> {
  await fetchAPI('/api/kpi-configs', {
    method: 'POST',
    body: JSON.stringify({
      id: config.id,
      branch: config.branch,
      province: config.province,
      district: config.district,
      onTimeLimit: config.onTimeLimit,
      isDraft: config.isDraft ? 1 : 0,
    }),
  });
}

export async function deleteKpiConfig(id: string): Promise<void> {
  await fetchAPI(`/api/kpi-configs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========== Store Closures ==========
export async function getStoreClosures(): Promise<StoreClosure[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/store-closures');
      return data.map(s => ({
        id: s.id,
        storeId: s.store_id,
        date: formatApiDate(s.date),
        closeRule: s.close_rule,
        reason: fixDoubleEncoded(s.reason),
      }));
    },
    snapshot => Object.entries(snapshot.storeClosures || {}).map(([key, s]: [string, any]) => ({
      id: s.id || key,
      storeId: fixDoubleEncoded(s.storeId),
      date: formatApiDate(s.date),
      closeRule: s.closeRule,
      reason: fixDoubleEncoded(s.reason),
    }))
  );
}

export async function saveStoreClosure(closure: StoreClosure): Promise<void> {
  await fetchAPI('/api/store-closures', {
    method: 'POST',
    body: JSON.stringify({
      id: closure.id,
      storeId: closure.storeId,
      date: closure.date,
      closeRule: closure.closeRule,
      reason: closure.reason,
    }),
  });
}

export async function deleteStoreClosure(id: string): Promise<void> {
  await fetchAPI(`/api/store-closures/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========== Delay Reasons ==========
export async function getDelayReasons(): Promise<DelayReason[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/delay-reasons');
      return data.map(d => ({
        code: d.code,
        label: fixDoubleEncoded(d.label),
        category: d.category,
      }));
    },
    snapshot => Object.entries(snapshot.delayReasons || {}).map(([key, d]: [string, any]) => ({
      code: d.code || key,
      label: fixDoubleEncoded(d.label),
      category: d.category,
    }))
  );
}

export async function saveDelayReason(reason: DelayReason): Promise<void> {
  await fetchAPI('/api/delay-reasons', {
    method: 'POST',
    body: JSON.stringify(reason),
  });
}

export async function deleteDelayReason(code: string): Promise<void> {
  await fetchAPI(`/api/delay-reasons/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

// ========== Store Mappings ==========
export async function getStoreMappings(): Promise<StoreMapping[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/store-mappings');
      return data.map(m => ({
        storeId: fixDoubleEncoded(m.store_id),
        district: fixDoubleEncoded(m.district),
        province: fixDoubleEncoded(m.province),
        createdAt: m.created_at,
      }));
    },
    snapshot => Object.entries(snapshot.storeMappings || {}).map(([key, m]: [string, any]) => ({
      storeId: fixDoubleEncoded(m.storeId || key),
      district: fixDoubleEncoded(m.district),
      province: fixDoubleEncoded(m.province),
      createdAt: m.createdAt || '',
    }))
  );
}

export async function saveStoreMapping(mapping: StoreMapping): Promise<void> {
  await fetchAPI('/api/store-mappings', {
    method: 'POST',
    body: JSON.stringify({
      storeId: mapping.storeId,
      district: mapping.district,
      province: mapping.province,
      createdAt: mapping.createdAt || new Date().toISOString().slice(0, 10),
    }),
  });
}

// ========== Branch Resources ==========
export async function getBranchResources(): Promise<BranchResource[]> {
  return withLocalSnapshotFallback(
    async () => {
      const data = await fetchAPI<any[]>('/api/branch-resources');
      return data.map(b => ({
        id: b.id,
        branchName: fixDoubleEncoded(b.branch_name),
        trucks: b.trucks,
        tripsPerDay: b.trips_per_day,
        loaders: b.loaders,
        checkers: b.checkers,
        admin: b.admin,
        workHoursPerDay: b.work_hours_per_day,
        loaderWage: b.loader_wage,
        checkerWage: b.checker_wage,
        adminWage: b.admin_wage,
        truckCostPerDay: b.truck_cost_per_day,
        calculatedCapacity: b.calculated_capacity,
        calculatedSpeed: b.calculated_speed,
        updatedAt: b.updated_at,
        updatedBy: b.updated_by,
      }));
    },
    snapshot => Object.entries(snapshot.branchResources || {}).map(([key, b]: [string, any]) => ({
      id: b.id || key,
      branchName: fixDoubleEncoded(b.branchName),
      trucks: Number(b.trucks || 0),
      tripsPerDay: Number(b.tripsPerDay || 0),
      loaders: Number(b.loaders || 0),
      checkers: Number(b.checkers || 0),
      admin: Number(b.admin || 0),
      workHoursPerDay: Number(b.workHoursPerDay || 0),
      loaderWage: Number(b.loaderWage || 0),
      checkerWage: Number(b.checkerWage || 0),
      adminWage: Number(b.adminWage || 0),
      truckCostPerDay: Number(b.truckCostPerDay || 0),
      calculatedCapacity: Number(b.calculatedCapacity || 0),
      calculatedSpeed: Number(b.calculatedSpeed || 0),
      updatedAt: b.updatedAt || '',
      updatedBy: b.updatedBy || '',
    }))
  );
}

export async function saveBranchResource(resource: BranchResource): Promise<void> {
  await fetchAPI('/api/branch-resources', {
    method: 'POST',
    body: JSON.stringify({
      id: resource.id,
      branchName: resource.branchName,
      trucks: resource.trucks,
      tripsPerDay: resource.tripsPerDay,
      loaders: resource.loaders,
      checkers: resource.checkers,
      admin: resource.admin,
      workHoursPerDay: resource.workHoursPerDay,
      loaderWage: resource.loaderWage,
      checkerWage: resource.checkerWage,
      adminWage: resource.adminWage,
      truckCostPerDay: resource.truckCostPerDay,
      calculatedCapacity: resource.calculatedCapacity,
      calculatedSpeed: resource.calculatedSpeed,
      updatedAt: resource.updatedAt,
      updatedBy: resource.updatedBy,
    }),
  });
}

// ========== Branch Resource History ==========
export async function getBranchResourceHistory(branchId: string): Promise<BranchResourceHistory[]> {
  const data = await fetchAPI<any[]>(`/api/branch-resource-history/${branchId}`);
  return data.map(h => ({
    id: h.id,
    branchId: h.branch_id,
    action: h.action,
    changes: typeof h.changes === 'string' ? JSON.parse(h.changes) : h.changes,
    updatedAt: h.updated_at,
    updatedBy: h.updated_by,
  }));
}

// ========== Import Logs ==========
export async function getImportLogs(): Promise<ImportLog[]> {
  const data = await fetchAPI<any[]>('/api/import-logs');
  return data.map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    fileName: l.fileName,
    userId: l.userId,
    userName: l.userName,
    recordsProcessed: l.recordsProcessed,
    created: l.created,
    updated: l.updated,
    skipped: l.skipped,
    errors: l.errors,
    errorDetails: l.errorDetails,
    skippedDetails: l.skippedDetails,
  }));
}

export async function saveImportLog(log: ImportLog): Promise<void> {
  await fetchAPI('/api/import-logs', {
    method: 'POST',
    body: JSON.stringify({
      id: log.id,
      timestamp: log.timestamp,
      fileName: log.fileName,
      userId: log.userId,
      userName: log.userName,
      recordsProcessed: log.recordsProcessed,
      created: log.created,
      updated: log.updated,
      skipped: log.skipped,
      errors: log.errors,
      errorDetails: log.errorDetails,
      skippedDetails: log.skippedDetails,
    }),
  });
}

// ========== Document Import Logs ==========
export async function getDocumentImportLogs(): Promise<DocumentImportLog[]> {
  const data = await fetchAPI<any[]>('/api/document-import-logs');
  return data.map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    fileNames: l.fileNames || [],
    returnDate: l.returnDate || '',
    confirmedCount: l.confirmedCount || 0,
    pdfCount: l.pdfCount || 0,
    manualCount: l.manualCount || 0,
  }));
}

export async function saveDocumentImportLog(log: DocumentImportLog): Promise<void> {
  await fetchAPI('/api/document-import-logs', {
    method: 'POST',
    body: JSON.stringify({
      id: log.id,
      timestamp: log.timestamp,
      fileNames: log.fileNames,
      returnDate: log.returnDate,
      confirmedCount: log.confirmedCount,
      pdfCount: log.pdfCount,
      manualCount: log.manualCount,
    }),
  });
}

// ========== Mapping Helpers ==========
function mapDeliveryFromAPI(d: any): DeliveryRecord {
  return {
    orderNo: d.order_no,
    district: d.district,
    storeId: d.store_id,
    planDate: formatApiDate(d.plan_date),
    openDate: formatApiDate(d.open_date),
    actualDate: formatApiDate(d.actual_date),
    qty: parseFloat(String(d.qty)) || 0,
    sender: d.sender,
    province: d.province,
    importFileId: d.import_file_id,
    deliveryStatus: fixDoubleEncoded(d.delivery_status),
    actualDatetime: d.actual_datetime,
    productDetails: d.product_details,
    kpiStatus: d.kpi_status,
    delayDays: parseInt(String(d.delay_days), 10) || 0,
    reasonRequired: Boolean(d.reason_required),
    reasonStatus: d.reason_status,
    delayReason: d.delay_reason,
    updatedAt: d.updated_at,
    weekday: d.weekday,
    documentReturned: Boolean(d.document_returned),
    documentReturnedDate: formatApiDate(d.document_returned_date),
    documentReturnBillDate: formatApiDate(d.document_return_bill_date),
    documentReturnSource: d.document_return_source,
    manualPlanDate: Boolean(d.manual_plan_date),
    manualActualDate: Boolean(d.manual_actual_date),
  };
}

function mapDeliveryToAPI(d: DeliveryRecord): any {
  return {
    orderNo: d.orderNo,
    district: d.district,
    storeId: d.storeId,
    planDate: normalizeApiDate(d.planDate),
    openDate: normalizeApiDate(d.openDate),
    actualDate: normalizeApiDate(d.actualDate),
    qty: d.qty,
    sender: d.sender,
    province: d.province,
    importFileId: d.importFileId,
    deliveryStatus: d.deliveryStatus,
    actualDatetime: normalizeApiDate(d.actualDatetime),
    productDetails: d.productDetails,
    kpiStatus: d.kpiStatus,
    delayDays: d.delayDays,
    reasonRequired: d.reasonRequired ? 1 : 0,
    reasonStatus: d.reasonStatus,
    delayReason: d.delayReason,
    updatedAt: normalizeApiDate(d.updatedAt) ?? new Date().toISOString(),
    weekday: d.weekday,
    documentReturned: d.documentReturned ? 1 : 0,
    documentReturnedDate: normalizeApiDate(d.documentReturnedDate),
    documentReturnBillDate: normalizeApiDate(d.documentReturnBillDate),
    documentReturnSource: d.documentReturnSource,
    manualPlanDate: d.manualPlanDate ? 1 : 0,
    manualActualDate: d.manualActualDate ? 1 : 0,
  };
}

function mapDeliveryFromSnapshot(d: any): DeliveryRecord {
  return {
    orderNo: d.orderNo,
    district: fixDoubleEncoded(d.district),
    storeId: fixDoubleEncoded(d.storeId),
    planDate: formatApiDate(d.planDate),
    openDate: formatApiDate(d.openDate),
    actualDate: formatApiDate(d.actualDate),
    qty: parseFloat(String(d.qty)) || 0,
    sender: fixDoubleEncoded(d.sender),
    province: fixDoubleEncoded(d.province),
    importFileId: d.importFileId,
    deliveryStatus: fixDoubleEncoded(d.deliveryStatus),
    actualDatetime: d.actualDatetime,
    productDetails: d.productDetails,
    kpiStatus: d.kpiStatus,
    delayDays: parseInt(String(d.delayDays), 10) || 0,
    reasonRequired: Boolean(d.reasonRequired),
    reasonStatus: d.reasonStatus,
    delayReason: d.delayReason,
    updatedAt: d.updatedAt,
    weekday: d.weekday,
    documentReturned: Boolean(d.documentReturned),
    documentReturnedDate: formatApiDate(d.documentReturnedDate),
    documentReturnBillDate: formatApiDate(d.documentReturnBillDate),
    documentReturnSource: d.documentReturnSource,
    manualPlanDate: Boolean(d.manualPlanDate),
    manualActualDate: Boolean(d.manualActualDate),
  };
}

// ========== Health Check ==========
export async function checkHealth(): Promise<boolean> {
  try {
    const data = await fetchAPI<{ status: string }>('/health');
    return data.status === 'ok';
  } catch {
    return false;
  }
}
