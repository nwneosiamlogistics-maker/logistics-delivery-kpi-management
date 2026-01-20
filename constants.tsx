
import { KpiConfig, Holiday, HolidayType, ReasonStatus, KpiStatus, DeliveryRecord } from './types';

export const KPI_CONFIGS: KpiConfig[] = [
  { district: 'Bangkok', onTimeLimit: 1, minTripsPerWeek: 5, minQtyPerDay: 100 },
  { district: 'Nonthaburi', onTimeLimit: 2, minTripsPerWeek: 3, minQtyPerDay: 50 },
  { district: 'Pathum Thani', onTimeLimit: 2, minTripsPerWeek: 3, minQtyPerDay: 50 },
];

export const HOLIDAYS: Holiday[] = [
  { id: '1', date: '2024-04-13', name: 'Songkran', type: HolidayType.PUBLIC },
  { id: '2', date: '2024-04-14', name: 'Songkran', type: HolidayType.PUBLIC },
  { id: '3', date: '2024-04-15', name: 'Songkran', type: HolidayType.PUBLIC },
];

export const DELAY_REASONS = [
  { code: 'R01', label: 'Vehicle Breakdown', category: 'internal' },
  { code: 'R02', label: 'Traffic Jam', category: 'external' },
  { code: 'R03', label: 'Store Closed (Unannounced)', category: 'external' },
  { code: 'R04', label: 'Weather Conditions', category: 'external' },
  { code: 'R05', label: 'Staff Shortage', category: 'internal' },
];

// Seed data for simulation
export const MOCK_DELIVERIES: DeliveryRecord[] = [
  {
    orderNo: 'ORD001',
    district: 'Bangkok',
    storeId: 'STR-A1',
    planDate: '2024-05-20',
    actualDate: '2024-05-20',
    qty: 120,
    kpiStatus: KpiStatus.PASS,
    delayDays: 0,
    reasonRequired: false,
    reasonStatus: ReasonStatus.NOT_REQUIRED,
    updatedAt: new Date().toISOString(),
    weekday: 'Monday'
  },
  {
    orderNo: 'ORD002',
    district: 'Bangkok',
    storeId: 'STR-B2',
    planDate: '2024-05-20',
    actualDate: '2024-05-22',
    qty: 85,
    kpiStatus: KpiStatus.NOT_PASS,
    delayDays: 2,
    reasonRequired: true,
    reasonStatus: ReasonStatus.PENDING,
    updatedAt: new Date().toISOString(),
    weekday: 'Monday'
  },
  {
    orderNo: 'ORD003',
    district: 'Nonthaburi',
    storeId: 'STR-C3',
    planDate: '2024-05-21',
    actualDate: '2024-05-24',
    qty: 45,
    kpiStatus: KpiStatus.NOT_PASS,
    delayDays: 3,
    reasonRequired: true,
    reasonStatus: ReasonStatus.SUBMITTED,
    delayReason: 'Vehicle Breakdown',
    updatedAt: new Date().toISOString(),
    weekday: 'Tuesday'
  }
];
