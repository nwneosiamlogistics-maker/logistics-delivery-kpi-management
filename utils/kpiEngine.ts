import { Holiday, StoreClosure, KpiConfig, KpiStatus, ReasonStatus } from '../types';

export const isWorkingDay = (
  date: Date,
  holidays: Holiday[],
  storeClosures: StoreClosure[] = [],
  storeId?: string
): boolean => {
  const day = date.getDay();

  if (day === 0) return false;

  const dateStr = date.toISOString().split('T')[0];
  const isHoliday = holidays.some(h => h.date === dateStr);
  if (isHoliday) return false;

  if (storeId && storeClosures.length > 0) {
    const normalizedId = storeId.trim().toLowerCase();
    const storeRules = storeClosures.filter(sc => sc.storeId.trim().toLowerCase() === normalizedId);

    for (const rule of storeRules) {
      if (rule.date && rule.date === dateStr) {
        return false;
      }

      if (rule.closeRule) {
        if (rule.closeRule === 'every_sunday' && day === 0) return false;
        if (rule.closeRule === 'every_saturday' && day === 6) return false;
        if (rule.closeRule === 'every_weekend' && (day === 0 || day === 6)) return false;
      }
    }
  }

  return true;
};

export const getWorkingDaysBetween = (
  start: Date,
  end: Date,
  holidays: Holiday[],
  storeClosures: StoreClosure[] = [],
  storeId?: string
): number => {
  let count = 0;
  let current = new Date(start);
  current.setDate(current.getDate() + 1);

  while (current <= end) {
    if (isWorkingDay(current, holidays, storeClosures, storeId)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

export const calculateKpiStatus = (
  planDate: string,
  actualDate: string,
  district: string,
  configs: KpiConfig[],
  holidays: Holiday[],
  storeClosures: StoreClosure[] = [],
  storeId?: string,
  province?: string
) => {
  const config =
    (province ? configs.find(c => c.province === province && c.district === district) : undefined) ||
    configs.find(c => c.district === district) ||
    (province ? configs.find(c => c.province === province) : undefined) ||
    configs[0];
  const pDate = new Date(planDate);

  // Cap actualDate ที่วันนี้ — ป้องกันกรณีวันที่ในอนาคต (เช่น parse ปี พ.ศ. ผิด)
  // ถ้า actualDate > today แสดงว่าข้อมูลผิดพลาด ให้นับถึงวันนี้แทน
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rawActual = new Date(actualDate);
  const aDate = rawActual > today ? today : rawActual;

  if (aDate < pDate) {
    return {
      kpiStatus: KpiStatus.PASS,
      delayDays: 0,
      reasonRequired: false,
      reasonStatus: ReasonStatus.NOT_REQUIRED
    };
  }

  if (aDate.getTime() === pDate.getTime()) {
    return {
      kpiStatus: KpiStatus.PASS,
      delayDays: 0,
      reasonRequired: false,
      reasonStatus: ReasonStatus.NOT_REQUIRED
    };
  }

  const delayInWorkingDays = getWorkingDaysBetween(pDate, aDate, holidays, storeClosures, storeId);
  const isOnTime = delayInWorkingDays <= config.onTimeLimit;
  const status = isOnTime ? KpiStatus.PASS : KpiStatus.NOT_PASS;
  const reasonRequired = !isOnTime;

  return {
    kpiStatus: status,
    delayDays: delayInWorkingDays,
    reasonRequired: reasonRequired,
    reasonStatus: reasonRequired ? ReasonStatus.PENDING : ReasonStatus.NOT_REQUIRED
  };
};

export const getWeekday = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

export const getWeekdayThai = (dateStr: string): string => {
  const weekdays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const date = new Date(dateStr);
  return weekdays[date.getDay()];
};

/**
 * ตรวจสอบว่า actualDate อยู่ในอนาคต (ข้อมูลน่าสงสัย)
 * ใช้สำหรับ UI แสดง warning badge
 */
export const isFutureDate = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) > today;
};


