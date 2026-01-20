
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
  closeRule?: string; // e.g., "Every Sunday"
  reason: string;
}

export interface KpiConfig {
  district: string;
  onTimeLimit: number; // working days
  minTripsPerWeek: number;
  minQtyPerDay: number;
}

export interface DeliveryRecord {
  orderNo: string;
  district: string;
  storeId: string;
  planDate: string;
  actualDate: string;
  qty: number;
  kpiStatus: KpiStatus;
  delayDays: number;
  reasonRequired: boolean;
  reasonStatus: ReasonStatus;
  delayReason?: string;
  updatedAt: string;
  weekday: string;
}

export interface User {
  role: 'Admin' | 'Staff' | 'Viewer';
  name: string;
}

export interface ImportLog {
  id: string;
  timestamp: string;
  fileName: string;
  recordsProcessed: number;
  created: number;
  updated: number;
  skipped: number;
}
