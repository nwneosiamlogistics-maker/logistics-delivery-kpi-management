
import { Holiday, StoreClosure, KpiConfig, KpiStatus, ReasonStatus } from '../types';

/**
 * Checks if a date is a working day (Not Sunday and not a holiday)
 */
export const isWorkingDay = (date: Date, holidays: Holiday[]): boolean => {
  const day = date.getDay();
  if (day === 0) return false; // Sunday is not a working day

  const dateStr = date.toISOString().split('T')[0];
  const isHoliday = holidays.some(h => h.date === dateStr);
  
  return !isHoliday;
};

/**
 * Calculates working days between two dates
 */
export const getWorkingDaysBetween = (start: Date, end: Date, holidays: Holiday[]): number => {
  let count = 0;
  let current = new Date(start);
  current.setDate(current.getDate() + 1); // Start counting from day after plan

  while (current <= end) {
    if (isWorkingDay(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

/**
 * Core KPI Calculation Engine
 */
export const calculateKpiStatus = (
  planDate: string,
  actualDate: string,
  district: string,
  configs: KpiConfig[],
  holidays: Holiday[],
  storeClosures: StoreClosure[] = []
) => {
  const config = configs.find(c => c.district === district) || configs[0];
  const pDate = new Date(planDate);
  const aDate = new Date(actualDate);
  
  // Calculate delay in working days
  const delayInWorkingDays = getWorkingDaysBetween(pDate, aDate, holidays);
  
  // Basic On-Time Check
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
