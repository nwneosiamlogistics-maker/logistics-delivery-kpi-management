export enum KpiStatus {
  PASS = 'PASS',
  NOT_PASS = 'NOT_PASS'
}

export enum ReasonStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum DeliveryStatus {
  WAITING = 'รอจัด',
  IN_TRANSIT = 'ขนส่ง',
  DISTRIBUTING = 'กระจายสินค้า',
  WAITING_DISTRIBUTE = 'รอกระจาย',
  DELIVERED = 'ส่งเสร็จ'
}

export enum HolidayType {
  SUNDAY = 'sunday',
  PUBLIC = 'public',
  COMPANY = 'company',
  SPECIAL = 'special'
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
}

export interface StoreClosure {
  id: string;
  storeId: string;
  date?: string;
  closeRule?: 'every_sunday' | 'every_saturday' | 'every_weekend';
  reason: string;
}

export interface KpiConfig {
  id: string;
  branch?: string;
  province?: string;
  district: string;
  onTimeLimit: number;
  isDraft?: boolean;
}

export interface DelayReason {
  code: string;
  label: string;
  category: 'internal' | 'external';
}

export interface DeliveryRecord {
  orderNo: string;
  district: string;
  storeId: string;
  planDate: string;
  openDate?: string;
  actualDate: string;
  qty: number;
  sender?: string;
  province?: string;
  importFileId?: string;
  deliveryStatus?: string;
  actualDatetime?: string;
  productDetails?: string;
  kpiStatus: KpiStatus;
  delayDays: number;
  reasonRequired: boolean;
  reasonStatus: ReasonStatus;
  delayReason?: string;
  updatedAt: string;
  weekday: string;
  documentReturned?: boolean;
  documentReturnedDate?: string;
  manualPlanDate?: boolean;
  manualActualDate?: boolean;
}

export interface User {
  id: string;
  name: string;
  role: 'Admin' | 'Staff' | 'Viewer';
  email?: string;
}

export interface ImportLog {
  id: string;
  timestamp: string;
  fileName: string;
  userId: string;
  userName: string;
  recordsProcessed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails?: { row: number; error: string }[];
  skippedDetails?: { row: number; reason: string }[];
}

export interface ReasonAuditLog {
  id: string;
  timestamp: string;
  orderNo: string;
  action: 'submitted' | 'approved' | 'rejected';
  userId: string;
  userName: string;
  reason?: string;
  comment?: string;
}

export interface StoreMapping {
  storeId: string;
  district: string;
  province?: string;
  createdAt: string;
}

export interface AppState {
  deliveries: DeliveryRecord[];
  holidays: Holiday[];
  storeClosures: StoreClosure[];
  kpiConfigs: KpiConfig[];
  delayReasons: DelayReason[];
  importLogs: ImportLog[];
  reasonAuditLogs: ReasonAuditLog[];
  storeMappings: StoreMapping[];
  currentUser: User;
}
