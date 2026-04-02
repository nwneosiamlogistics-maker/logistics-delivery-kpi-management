import { KpiConfig, Holiday, HolidayType, StoreClosure, DelayReason, User } from './types';

export const DEFAULT_USER: User = {
  id: 'viewer-001',
  name: 'ผู้ใช้งานทั่วไป',
  role: 'Viewer',
  email: 'viewer@local'
};

export const KPI_CONFIGS: KpiConfig[] = [
  { id: 'kpi-001', province: 'กรุงเทพมหานคร', district: 'เมือง', onTimeLimit: 1 },
  { id: 'kpi-002', province: 'นนทบุรี', district: 'เมืองนนทบุรี', onTimeLimit: 2 },
  { id: 'kpi-003', province: 'ปทุมธานี', district: 'เมืองปทุมธานี', onTimeLimit: 2 },
  { id: 'kpi-004', province: 'สมุทรปราการ', district: 'เมืองสมุทรปราการ', onTimeLimit: 2 },
  { id: 'kpi-005', province: 'ชลบุรี', district: 'เมืองชลบุรี', onTimeLimit: 3 },
  { id: 'kpi-006', province: 'นครสวรรค์', district: 'เมือง', onTimeLimit: 2 },
  { id: 'kpi-007', province: 'นครสวรรค์', district: 'ตาคลี', onTimeLimit: 3 },
];

export const HOLIDAYS: Holiday[] = [
  { id: 'h-001', date: '2024-01-01', name: 'วันขึ้นปีใหม่', type: HolidayType.PUBLIC },
  { id: 'h-002', date: '2024-02-24', name: 'วันมาฆบูชา', type: HolidayType.PUBLIC },
  { id: 'h-003', date: '2024-04-06', name: 'วันจักรี', type: HolidayType.PUBLIC },
  { id: 'h-004', date: '2024-04-13', name: 'วันสงกรานต์', type: HolidayType.PUBLIC },
  { id: 'h-005', date: '2024-04-14', name: 'วันสงกรานต์', type: HolidayType.PUBLIC },
  { id: 'h-006', date: '2024-04-15', name: 'วันสงกรานต์', type: HolidayType.PUBLIC },
  { id: 'h-007', date: '2024-05-01', name: 'วันแรงงานแห่งชาติ', type: HolidayType.PUBLIC },
  { id: 'h-008', date: '2024-05-22', name: 'วันวิสาขบูชา', type: HolidayType.PUBLIC },
  { id: 'h-009', date: '2024-06-03', name: 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี', type: HolidayType.PUBLIC },
  { id: 'h-010', date: '2024-07-28', name: 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว', type: HolidayType.PUBLIC },
  { id: 'h-011', date: '2024-08-12', name: 'วันแม่แห่งชาติ', type: HolidayType.PUBLIC },
  { id: 'h-012', date: '2024-10-13', name: 'วันคล้ายวันสวรรคต รัชกาลที่ 9', type: HolidayType.PUBLIC },
  { id: 'h-013', date: '2024-10-23', name: 'วันปิยมหาราช', type: HolidayType.PUBLIC },
  { id: 'h-014', date: '2024-12-05', name: 'วันพ่อแห่งชาติ', type: HolidayType.PUBLIC },
  { id: 'h-015', date: '2024-12-10', name: 'วันรัฐธรรมนูญ', type: HolidayType.PUBLIC },
  { id: 'h-016', date: '2024-12-31', name: 'วันขึ้นปีใหม่ (วันสิ้นปี)', type: HolidayType.PUBLIC },
  { id: 'h-017', date: '2024-07-01', name: 'วันก่อตั้งบริษัท', type: HolidayType.COMPANY },
  { id: 'h-018', date: '2024-12-30', name: 'วันหยุดพิเศษบริษัท', type: HolidayType.COMPANY },
];

export const STORE_CLOSURES: StoreClosure[] = [
  { id: 'sc-001', storeId: 'STR-A1', closeRule: 'every_sunday', reason: 'ปิดทุกวันอาทิตย์' },
  { id: 'sc-002', storeId: 'STR-B2', date: '2024-05-25', reason: 'ร้านปิดปรับปรุง' },
  { id: 'sc-003', storeId: 'STR-C3', closeRule: 'every_weekend', reason: 'ปิดเสาร์-อาทิตย์' },
];

export const DELAY_REASONS: DelayReason[] = [
  { code: 'R01', label: 'รถเสีย/ขัดข้อง', category: 'internal' },
  { code: 'R02', label: 'การจราจรติดขัด', category: 'external' },
  { code: 'R03', label: 'ร้านปิด (ไม่ได้รับแจ้ง)', category: 'external' },
  { code: 'R04', label: 'สภาพอากาศ/ฝนตก', category: 'external' },
  { code: 'R05', label: 'พนักงานไม่พอ', category: 'internal' },
  { code: 'R06', label: 'ที่อยู่ไม่ชัดเจน', category: 'external' },
  { code: 'R07', label: 'ลูกค้าไม่อยู่/ติดต่อไม่ได้', category: 'external' },
  { code: 'R08', label: 'การจัดเตรียมสินค้าล่าช้า', category: 'internal' },
  { code: 'R09', label: 'ปัญหาการวางแผนเส้นทาง', category: 'internal' },
  { code: 'R10', label: 'อุบัติเหตุระหว่างทาง', category: 'external' },
];

