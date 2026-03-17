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
  ImportLog 
} from '../types';

// Strip ISO time portion from date strings (2026-03-11T00:00:00.000Z → 2026-03-11)
function formatApiDate(d: string | null | undefined): string {
  if (!d) return '';
  return d.includes('T') ? d.slice(0, 10) : d;
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

// API Base URL - Cloudflare Tunnel to NAS
// Use empty string for local dev (Vite proxy), full URL for production (Vercel)
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'https://mat-designed-restoration-talented.trycloudflare.com';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// ========== Deliveries ==========
export async function getDeliveries(): Promise<DeliveryRecord[]> {
  const data = await fetchAPI<any[]>('/api/deliveries');
  return data.map(mapDeliveryFromAPI);
}

export async function saveDelivery(delivery: DeliveryRecord): Promise<void> {
  await fetchAPI('/api/deliveries', {
    method: 'POST',
    body: JSON.stringify(mapDeliveryToAPI(delivery)),
  });
}

export async function saveDeliveries(deliveries: DeliveryRecord[]): Promise<void> {
  await fetchAPI('/api/deliveries/bulk', {
    method: 'POST',
    body: JSON.stringify(deliveries.map(mapDeliveryToAPI)),
  });
}

// ========== Holidays ==========
export async function getHolidays(): Promise<Holiday[]> {
  const data = await fetchAPI<any[]>('/api/holidays');
  return data.map(h => ({
    id: h.id,
    date: formatApiDate(h.date),
    name: h.name,
    type: h.type,
  }));
}

export async function saveHoliday(holiday: Holiday): Promise<void> {
  await fetchAPI('/api/holidays', {
    method: 'POST',
    body: JSON.stringify(holiday),
  });
}

// ========== KPI Configs ==========
export async function getKpiConfigs(): Promise<KpiConfig[]> {
  const data = await fetchAPI<any[]>('/api/kpi-configs');
  return data.map(c => ({
    id: c.id,
    branch: c.branch,
    province: c.province,
    district: c.district,
    onTimeLimit: c.on_time_limit,
    isDraft: Boolean(c.is_draft),
  }));
}

export async function saveKpiConfig(config: KpiConfig): Promise<void> {
  await fetchAPI('/api/kpi-configs', {
    method: 'POST',
    body: JSON.stringify({
      id: config.id,
      branch: config.branch,
      province: config.province,
      district: config.district,
      on_time_limit: config.onTimeLimit,
      is_draft: config.isDraft ? 1 : 0,
    }),
  });
}

// ========== Store Closures ==========
export async function getStoreClosures(): Promise<StoreClosure[]> {
  const data = await fetchAPI<any[]>('/api/store-closures');
  return data.map(s => ({
    id: s.id,
    storeId: s.store_id,
    date: formatApiDate(s.date),
    closeRule: s.close_rule,
    reason: s.reason,
  }));
}

// ========== Delay Reasons ==========
export async function getDelayReasons(): Promise<DelayReason[]> {
  const data = await fetchAPI<any[]>('/api/delay-reasons');
  return data.map(d => ({
    code: d.code,
    label: d.label,
    category: d.category,
  }));
}

// ========== Store Mappings ==========
export async function getStoreMappings(): Promise<StoreMapping[]> {
  const data = await fetchAPI<any[]>('/api/store-mappings');
  return data.map(m => ({
    storeId: m.store_id,
    district: m.district,
    province: m.province,
    createdAt: m.created_at,
  }));
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
  const data = await fetchAPI<any[]>('/api/branch-resources');
  return data.map(b => ({
    id: b.id,
    branchName: b.branch_name,
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
}

export async function saveBranchResource(resource: BranchResource): Promise<void> {
  await fetchAPI('/api/branch-resources', {
    method: 'POST',
    body: JSON.stringify({
      id: resource.id,
      branch_name: resource.branchName,
      trucks: resource.trucks,
      trips_per_day: resource.tripsPerDay,
      loaders: resource.loaders,
      checkers: resource.checkers,
      admin: resource.admin,
      work_hours_per_day: resource.workHoursPerDay,
      loader_wage: resource.loaderWage,
      checker_wage: resource.checkerWage,
      admin_wage: resource.adminWage,
      truck_cost_per_day: resource.truckCostPerDay,
    }),
  });
}

// ========== Import Logs ==========
export async function getImportLogs(): Promise<ImportLog[]> {
  const data = await fetchAPI<any[]>('/api/import-logs');
  return data.map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    fileName: l.file_name,
    userId: l.user_id,
    userName: l.user_name,
    recordsProcessed: l.records_processed,
    created: l.created,
    updated: l.updated,
    skipped: l.skipped,
    errors: l.errors,
    errorDetails: l.error_details,
    skippedDetails: l.skipped_details,
  }));
}

export async function saveImportLog(log: ImportLog): Promise<void> {
  await fetchAPI('/api/import-logs', {
    method: 'POST',
    body: JSON.stringify({
      id: log.id,
      timestamp: log.timestamp,
      file_name: log.fileName,
      user_id: log.userId,
      user_name: log.userName,
      records_processed: log.recordsProcessed,
      created: log.created,
      updated: log.updated,
      skipped: log.skipped,
      errors: log.errors,
      error_details: log.errorDetails,
      skipped_details: log.skippedDetails,
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
    planDate: d.planDate,
    openDate: d.openDate,
    actualDate: d.actualDate,
    qty: d.qty,
    sender: d.sender,
    province: d.province,
    importFileId: d.importFileId,
    deliveryStatus: d.deliveryStatus,
    actualDatetime: d.actualDatetime,
    productDetails: d.productDetails,
    kpiStatus: d.kpiStatus,
    delayDays: d.delayDays,
    reasonRequired: d.reasonRequired ? 1 : 0,
    reasonStatus: d.reasonStatus,
    delayReason: d.delayReason,
    updatedAt: d.updatedAt,
    weekday: d.weekday,
    documentReturned: d.documentReturned ? 1 : 0,
    documentReturnedDate: d.documentReturnedDate,
    documentReturnBillDate: d.documentReturnBillDate,
    documentReturnSource: d.documentReturnSource,
    manualPlanDate: d.manualPlanDate ? 1 : 0,
    manualActualDate: d.manualActualDate ? 1 : 0,
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
