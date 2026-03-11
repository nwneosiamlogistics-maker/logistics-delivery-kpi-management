import React, { useState, useMemo, useEffect } from 'react';
import { DeliveryRecord, KpiConfig, BranchResource } from '../types';
import { formatNum, formatQty } from '../utils/formatters';
import { getRealtimeDb } from '../services/firebase';
import { ref, onValue } from 'firebase/database';

interface ForecastProps {
  deliveries: DeliveryRecord[];
  kpiConfigs: KpiConfig[];
}

const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const Forecast: React.FC<ForecastProps> = ({ deliveries, kpiConfigs }) => {
  // Branch selection
  const branchNames = useMemo(() => {
    const names = new Set<string>();
    kpiConfigs.forEach(k => {
      if (k.branch) names.add(k.branch);
    });
    return Array.from(names).sort();
  }, [kpiConfigs]);
  
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  
  // District to branch mapping
  const districtBranchMap = useMemo(() => {
    const map: Record<string, string> = {};
    kpiConfigs.forEach(k => {
      if (k.branch && k.district) {
        map[k.district] = k.branch;
      }
    });
    return map;
  }, [kpiConfigs]);
  
  // Filter deliveries by branch
  const filteredDeliveries = useMemo(() => {
    if (!selectedBranch) return deliveries;
    return deliveries.filter(d => {
      const branch = districtBranchMap[d.district];
      return branch === selectedBranch;
    });
  }, [deliveries, selectedBranch, districtBranchMap]);
  
  // Available months (last 6 months)
  const availableMonths = useMemo(() => {
    const months: { year: number; month: number; key: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        key: `${d.getFullYear()}-${d.getMonth()}`
      });
    }
    return months;
  }, []);
  
  // Get month date range
  const getMonthRange = (year: number, month: number) => {
    const start = toLocalDateStr(new Date(year, month, 1));
    const end = toLocalDateStr(new Date(year, month + 1, 0));
    return { start, end };
  };
  
  // Month selection state
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (availableMonths.length > 0) {
      initial.add(availableMonths[0].key);
    }
    return initial;
  });
  
  const [baseMonthKey, setBaseMonthKey] = useState<string>(availableMonths[0]?.key || '');
  
  const toggleMonth = (key: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (baseMonthKey === key && next.size > 0) {
          setBaseMonthKey(Array.from(next)[0]);
        }
      } else {
        next.add(key);
      }
      return next;
    });
  };
  
  // Forecast parameters
  const [growthPercent, setGrowthPercent] = useState(0);
  const [workDays, setWorkDays] = useState(26);
  
  // Truck parameters
  const [truckCapacity, setTruckCapacity] = useState(100);
  const [tripsPerDay, setTripsPerDay] = useState(2);
  const [truckCostPerDay, setTruckCostPerDay] = useState(1500);
  const [existingTrucks, setExistingTrucks] = useState(0);
  
  // Labor parameters
  const [loaderSpeed, setLoaderSpeed] = useState(100);
  const [workHoursPerDay, setWorkHoursPerDay] = useState(8);
  const [checkerRatio, setCheckerRatio] = useState(2);
  const [adminRatio, setAdminRatio] = useState(10);
  const [loaderWage, setLoaderWage] = useState(400);
  const [checkerWage, setCheckerWage] = useState(450);
  const [adminWage, setAdminWage] = useState(500);
  
  const [existingLoaders, setExistingLoaders] = useState(0);
  const [existingCheckers, setExistingCheckers] = useState(0);
  const [existingAdmin, setExistingAdmin] = useState(0);
  
  // Branch Resources state
  const [branchResources, setBranchResources] = useState<BranchResource[]>([]);
  const [branchDataLoaded, setBranchDataLoaded] = useState(false);
  
  // Load branchResources from Firebase (realtime listener)
  useEffect(() => {
    const db = getRealtimeDb();
    if (!db) return;
    const unsubscribe = onValue(ref(db, 'branchResources'), (snapshot) => {
      if (snapshot.exists()) {
        setBranchResources(Object.values(snapshot.val()) as BranchResource[]);
      }
    });
    return () => unsubscribe();
  }, []);
  
  // Auto-load branch data when branch is selected
  useEffect(() => {
    if (!selectedBranch) {
      setBranchDataLoaded(false);
      return;
    }
    const resource = branchResources.find(b => b.branchName === selectedBranch);
    if (resource) {
      setExistingTrucks(resource.trucks);
      setTripsPerDay(resource.tripsPerDay);
      setTruckCostPerDay(resource.truckCostPerDay);
      setExistingLoaders(resource.loaders);
      setExistingCheckers(resource.checkers);
      setExistingAdmin(resource.admin);
      setWorkHoursPerDay(resource.workHoursPerDay);
      setLoaderWage(resource.loaderWage);
      setCheckerWage(resource.checkerWage);
      setAdminWage(resource.adminWage);
      if (resource.calculatedCapacity && resource.calculatedCapacity > 0) {
        setTruckCapacity(resource.calculatedCapacity);
      }
      if (resource.calculatedSpeed && resource.calculatedSpeed > 0) {
        setLoaderSpeed(resource.calculatedSpeed);
      }
      setBranchDataLoaded(true);
    } else {
      setExistingTrucks(0);
      setExistingLoaders(0);
      setExistingCheckers(0);
      setExistingAdmin(0);
      setBranchDataLoaded(false);
    }
  }, [selectedBranch, branchResources]);
  
  // OT
  const [otMultiplier, setOtMultiplier] = useState(1.5);
  const [partTimeWage, setPartTimeWage] = useState(350);
  const [maxOtPerWeek, setMaxOtPerWeek] = useState(36);
  
  // Modal state
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const openModal = (modal: string) => setActiveModal(modal);
  const closeModal = () => setActiveModal(null);
  
  // Calculate monthly data
  const monthlyData = useMemo(() => {
    const result: Record<string, { qty: number; invoices: number; workDays: number }> = {};
    
    availableMonths.forEach(({ year, month, key }) => {
      const { start, end } = getMonthRange(year, month);
      const filtered = filteredDeliveries.filter(d => {
        const refDate = d.openDate || d.planDate;
        return refDate && refDate >= start && refDate <= end;
      });
      
      const totalQty = filtered.reduce((sum, d) => sum + d.qty, 0);
      const uniqueDays = new Set(filtered.map(d => d.openDate || d.planDate)).size;
      
      result[key] = {
        qty: totalQty,
        invoices: filtered.length,
        workDays: uniqueDays
      };
    });
    
    return result;
  }, [filteredDeliveries, availableMonths]);
  
  // Find max month
  const maxMonthKey = useMemo(() => {
    let maxKey = '';
    let maxQty = -1;
    selectedMonths.forEach(key => {
      const data = monthlyData[key];
      if (data && data.qty > maxQty) {
        maxQty = data.qty;
        maxKey = key;
      }
    });
    return maxKey;
  }, [selectedMonths, monthlyData]);
  
  // Base data
  const baseData = useMemo(() => {
    const data = monthlyData[baseMonthKey];
    return data || { qty: 0, invoices: 0, workDays: 26 };
  }, [monthlyData, baseMonthKey]);
  
  // ใช้ค่า calculatedCapacity/Speed จาก "ทรัพยากรสาขา" ที่บันทึกไว้ใน Firebase
  const savedCapacity = useMemo(() => {
    if (!selectedBranch) return 0;
    const resource = branchResources.find(b => b.branchName === selectedBranch);
    return resource?.calculatedCapacity || 0;
  }, [selectedBranch, branchResources]);

  const savedSpeed = useMemo(() => {
    if (!selectedBranch) return 0;
    const resource = branchResources.find(b => b.branchName === selectedBranch);
    return resource?.calculatedSpeed || 0;
  }, [selectedBranch, branchResources]);

  // ใช้ค่าจาก "ทรัพยากรสาขา" ถ้ามี มิฉะนั้นใช้ค่า default
  const effectiveCapacity = savedCapacity > 0 ? savedCapacity : truckCapacity;
  const effectiveSpeed = savedSpeed > 0 ? savedSpeed : loaderSpeed;
  
  const useMaxMonth = () => {
    if (maxMonthKey) {
      setBaseMonthKey(maxMonthKey);
    }
  };
  
  // Forecast calculation
  const forecast = useMemo(() => {
    const forecastQty = Math.round(baseData.qty * (1 + growthPercent / 100));
    const qtyPerDay = workDays > 0 ? Math.round(forecastQty / workDays) : 0;
    
    // Trucks - ใช้ effectiveCapacity แทน truckCapacity
    const tripsNeededPerDay = effectiveCapacity > 0 ? Math.ceil(qtyPerDay / effectiveCapacity) : 0;
    const trucksNeeded = tripsPerDay > 0 ? Math.ceil(tripsNeededPerDay / tripsPerDay) : 0;
    const additionalTrucksNeeded = Math.max(0, trucksNeeded - existingTrucks);
    const truckCostTotal = additionalTrucksNeeded * truckCostPerDay;
    
    // Labor - ใช้ effectiveSpeed แทน loaderSpeed
    const manHoursNeeded = effectiveSpeed > 0 ? qtyPerDay / effectiveSpeed : 0;
    const loadersNeeded = workHoursPerDay > 0 ? Math.ceil(manHoursNeeded / workHoursPerDay) : 0;
    const checkersNeeded = checkerRatio > 0 ? Math.ceil(loadersNeeded / checkerRatio) : 0;
    const adminNeeded = adminRatio > 0 ? Math.ceil(trucksNeeded / adminRatio) : 0;
    
    const additionalLoaders = Math.max(0, loadersNeeded - existingLoaders);
    const additionalCheckers = Math.max(0, checkersNeeded - existingCheckers);
    const additionalAdminNeeded = Math.max(0, adminNeeded - existingAdmin);
    
    const loadersCostPerDay = additionalLoaders * loaderWage;
    const checkersCostPerDay = additionalCheckers * checkerWage;
    const adminCostPerDay = additionalAdminNeeded * adminWage;
    const laborCostPerDay = loadersCostPerDay + checkersCostPerDay + adminCostPerDay;
    
    // Totals
    const totalWorkers = loadersNeeded + checkersNeeded + adminNeeded;
    const totalExistingWorkers = existingLoaders + existingCheckers + existingAdmin;
    const totalAdditionalWorkers = additionalLoaders + additionalCheckers + additionalAdminNeeded;
    
    const totalCostPerDay = truckCostTotal + laborCostPerDay;
    const totalCostPerMonth = totalCostPerDay * workDays;
    
    // OT calculation - ใช้ effectiveSpeed
    const capacityPerDay = existingLoaders * effectiveSpeed * workHoursPerDay;
    const overCapacity = qtyPerDay > capacityPerDay;
    const otHoursNeeded = overCapacity && effectiveSpeed > 0 ? Math.ceil((qtyPerDay - capacityPerDay) / effectiveSpeed / existingLoaders) : 0;
    const otCost = otHoursNeeded * (loaderWage / workHoursPerDay) * otMultiplier * existingLoaders;
    const partTimeCost = additionalLoaders * partTimeWage;
    const recommendOt = otCost < partTimeCost && otHoursNeeded <= (maxOtPerWeek / 5);
    
    return {
      forecastQty,
      qtyPerDay,
      tripsNeededPerDay,
      trucksNeeded,
      additionalTrucksNeeded,
      truckCostTotal,
      loadersNeeded,
      checkersNeeded,
      adminNeeded,
      additionalLoaders,
      additionalCheckers,
      additionalAdminNeeded,
      loadersCostPerDay,
      checkersCostPerDay,
      adminCostPerDay,
      laborCostPerDay,
      totalWorkers,
      totalExistingWorkers,
      totalAdditionalWorkers,
      totalCostPerDay,
      totalCostPerMonth,
      overCapacity,
      otHoursNeeded,
      otCost,
      partTimeCost,
      recommendOt
    };
  }, [baseData, growthPercent, workDays, effectiveCapacity, tripsPerDay, truckCostPerDay, existingTrucks, effectiveSpeed, workHoursPerDay, checkerRatio, adminRatio, loaderWage, checkerWage, adminWage, existingLoaders, existingCheckers, existingAdmin, otMultiplier, partTimeWage, maxOtPerWeek]);
  
  const getMonthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return `${monthNames[m]} ${y + 543}`;
  };

  // Modal Component
  const Modal = ({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) => {
    if (activeModal !== id) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
              <span>{icon}</span> {title}
            </h2>
            <button
              onClick={closeModal}
              className="p-2 hover:bg-white/80 rounded-lg transition-colors"
              aria-label="ปิด"
            >
              <i className="fas fa-times text-gray-500"></i>
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
            {children}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📊 Forecast & Resource Planning</h1>
          <p className="text-gray-500 text-sm">วางแผนทรัพยากรล่วงหน้า</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
            aria-label="เลือกสาขา"
          >
            <option value="">-- เลือกสาขา --</option>
            {branchNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedBranch && branchDataLoaded && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <i className="fas fa-check mr-1"></i>โหลดข้อมูลสาขาแล้ว
            </span>
          )}
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Forecast ยอด/เดือน</p>
              <h3 className="text-2xl font-bold text-purple-600 mt-1">{formatQty(forecast.forecastQty)}</h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <i className="fas fa-chart-line"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {formatQty(forecast.qtyPerDay)} กล่อง/วัน
          </div>
        </div>
        
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">รถที่ต้องใช้</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{forecast.trucksNeeded} คัน</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <i className="fas fa-truck"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {forecast.additionalTrucksNeeded > 0 ? (
              <span className="text-orange-500">เช่าเพิ่ม {forecast.additionalTrucksNeeded} คัน</span>
            ) : (
              <span className="text-green-500">เพียงพอ ✓</span>
            )}
          </div>
        </div>
        
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">กำลังคนที่ต้องใช้</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">{forecast.totalWorkers} คน</h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <i className="fas fa-users"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {forecast.totalAdditionalWorkers > 0 ? (
              <span className="text-orange-500">จ้างเพิ่ม {forecast.totalAdditionalWorkers} คน</span>
            ) : (
              <span className="text-green-500">เพียงพอ ✓</span>
            )}
          </div>
        </div>
        
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">ต้นทุน/เดือน</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">฿{formatNum(forecast.totalCostPerMonth)}</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <i className="fas fa-coins"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ฿{formatNum(forecast.totalCostPerDay)}/วัน
          </div>
        </div>
      </div>
      
      {/* Parameter Section Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => openModal('compare')}
          className="glass-panel p-5 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">📅</span>
            <span className="font-bold text-gray-800 group-hover:text-purple-600 transition-colors">เปรียบเทียบยอดหลายเดือน</span>
          </div>
          <p className="text-xs text-gray-500">เลือกเดือนฐาน, % การเติบโต</p>
        </button>
        
        <button
          onClick={() => openModal('truck')}
          className="glass-panel p-5 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🚚</span>
            <span className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">รถขนส่ง</span>
          </div>
          <p className="text-xs text-gray-500">รถประจำ {existingTrucks} คัน | ความจุ {effectiveCapacity > 0 ? effectiveCapacity : truckCapacity} กล่อง</p>
        </button>
        
        <button
          onClick={() => openModal('labor')}
          className="glass-panel p-5 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">👷</span>
            <span className="font-bold text-gray-800 group-hover:text-green-600 transition-colors">กำลังคน</span>
          </div>
          <p className="text-xs text-gray-500">ประจำ {existingLoaders + existingCheckers + existingAdmin} คน</p>
        </button>
        
        <button
          onClick={() => openModal('ot')}
          className="glass-panel p-5 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-gray-800 group-hover:text-amber-600 transition-colors">OT & ค่าใช้จ่าย</span>
          </div>
          <p className="text-xs text-gray-500">ต้นทุน ฿{formatNum(forecast.totalCostPerDay)}/วัน</p>
        </button>
      </div>
      
      {/* Modal: เปรียบเทียบเดือน */}
      <Modal id="compare" title="เปรียบเทียบยอดหลายเดือน" icon="📅">
        <div>
          <p className="text-sm text-gray-600 mb-4">เลือกเดือนที่ต้องการเปรียบเทียบ แล้วเลือกเดือนที่จะใช้เป็นฐาน Forecast</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {availableMonths.map(({ key }) => {
              const data = monthlyData[key];
              const isSelected = selectedMonths.has(key);
              const isBase = baseMonthKey === key;
              const isMax = maxMonthKey === key && selectedMonths.size > 1;
              
              return (
                <div
                  key={key}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    isBase
                      ? 'border-purple-500 bg-purple-50'
                      : isSelected
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => toggleMonth(key)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`เลือกเดือน ${getMonthLabel(key)}`}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className={`font-medium ${isBase ? 'text-purple-700' : 'text-gray-700'}`}>
                        {getMonthLabel(key)}
                      </span>
                    </div>
                    {isMax && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">สูงสุด</span>
                    )}
                    {isBase && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">ใช้อยู่</span>
                    )}
                  </div>
                  <div className="text-lg font-bold text-gray-800">
                    {formatQty(data?.qty || 0)} <span className="text-sm font-normal text-gray-500">กล่อง</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatNum(data?.invoices || 0)} Invoice | {data?.workDays || 0} วันทำงาน
                  </div>
                  {isSelected && !isBase && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setBaseMonthKey(key); }}
                      className="mt-2 w-full text-xs py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                    >
                      ใช้เดือนนี้เป็นฐาน
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={useMaxMonth}
              disabled={!maxMonthKey || maxMonthKey === baseMonthKey}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-lg text-sm transition-colors"
            >
              <i className="fas fa-chart-line mr-2"></i>ใช้เดือนยอดสูงสุด
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">% การเติบโต</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={growthPercent}
                  onChange={e => setGrowthPercent(Number(e.target.value))}
                  aria-label="% การเติบโต"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">วันทำงาน (เดือน Forecast)</label>
              <input
                type="number"
                value={workDays}
                onChange={e => setWorkDays(Number(e.target.value))}
                aria-label="วันทำงาน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">วันทำงานจริง (เดือนอ้างอิง)</label>
              <div className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium">
                {baseData.workDays} วัน
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-purple-50 rounded-xl">
            <p className="text-sm text-purple-800">
              <i className="fas fa-calculator mr-2"></i>
              <strong>สรุป:</strong> ใช้ยอด <strong>{getMonthLabel(baseMonthKey)}</strong> ({formatQty(baseData.qty)} กล่อง)
              {growthPercent !== 0 && <> + {growthPercent}%</>}
              = <strong>{formatQty(forecast.forecastQty)} กล่อง</strong> ({formatQty(forecast.qtyPerDay)} กล่อง/วัน)
            </p>
          </div>
        </div>
      </Modal>
      
      {/* Modal: รถขนส่ง */}
      <Modal id="truck" title="รถขนส่ง" icon="🚚">
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">🚛 รถประจำสาขา (คัน)</label>
              <input
                type="number"
                value={existingTrucks}
                onChange={e => setExistingTrucks(Number(e.target.value))}
                aria-label="รถประจำสาขา"
                className="w-full px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                ความจุ (กล่อง/เที่ยว)
                {savedCapacity > 0 && <span className="text-xs text-green-600 ml-1">✓ จากทรัพยากรสาขา</span>}
              </label>
              <input
                type="number"
                value={savedCapacity > 0 ? savedCapacity : truckCapacity}
                onChange={e => setTruckCapacity(Number(e.target.value))}
                aria-label="ความจุรถ"
                className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${savedCapacity > 0 ? 'border-green-300 bg-green-50 font-medium' : 'border-gray-200 bg-white'}`}
                readOnly={savedCapacity > 0}
              />
              {savedCapacity > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  ค่าจากหน้า "ทรัพยากรสาขา" ({savedCapacity} กล่อง/เที่ยว)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">จำนวนรอบ/วัน</label>
              <input
                type="number"
                value={tripsPerDay}
                onChange={e => setTripsPerDay(Number(e.target.value))}
                aria-label="จำนวนรอบต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่าเช่ารถเพิ่ม/วัน (บาท)</label>
              <input
                type="number"
                value={truckCostPerDay}
                onChange={e => setTruckCostPerDay(Number(e.target.value))}
                aria-label="ค่าเช่ารถต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-800">
              <i className="fas fa-info-circle mr-2"></i>
              <strong>คำนวณ:</strong> ยอด {formatQty(forecast.qtyPerDay)} กล่อง/วัน ÷ {effectiveCapacity} กล่อง/เที่ยว = <strong>{forecast.tripsNeededPerDay} เที่ยว</strong> → ต้องใช้รถ <strong>{forecast.trucksNeeded} คัน</strong> (@ {tripsPerDay} รอบ/วัน)
            </p>
            {existingTrucks > 0 && (
              <p className="text-sm text-blue-800 mt-2">
                <i className="fas fa-truck mr-2"></i>
                <strong>สรุป:</strong> มีรถประจำ {existingTrucks} คัน →
                {forecast.additionalTrucksNeeded > 0 ? (
                  <span className="text-orange-600 font-bold"> ต้องเช่าเพิ่ม {forecast.additionalTrucksNeeded} คัน (฿{formatNum(forecast.truckCostTotal)}/วัน)</span>
                ) : (
                  <span className="text-green-600 font-bold"> เพียงพอ ไม่ต้องเช่าเพิ่ม ✓</span>
                )}
              </p>
            )}
          </div>
        </div>
      </Modal>
      
      {/* Modal: กำลังคน */}
      <Modal id="labor" title="กำลังคน" icon="👷">
        <div>
          <div className="mb-4 p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-sm font-medium text-green-700 mb-3">👥 คนประจำสาขา (ที่มีอยู่แล้ว)</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Loaders (คน)</label>
                <input
                  type="number"
                  value={existingLoaders}
                  onChange={e => setExistingLoaders(Number(e.target.value))}
                  aria-label="Loaders ประจำสาขา"
                  className="w-full px-3 py-2 rounded-lg border border-green-300 bg-white focus:ring-2 focus:ring-green-500 outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Checkers (คน)</label>
                <input
                  type="number"
                  value={existingCheckers}
                  onChange={e => setExistingCheckers(Number(e.target.value))}
                  aria-label="Checkers ประจำสาขา"
                  className="w-full px-3 py-2 rounded-lg border border-green-300 bg-white focus:ring-2 focus:ring-green-500 outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Admin (คน)</label>
                <input
                  type="number"
                  value={existingAdmin}
                  onChange={e => setExistingAdmin(Number(e.target.value))}
                  aria-label="Admin ประจำสาขา"
                  className="w-full px-3 py-2 rounded-lg border border-green-300 bg-white focus:ring-2 focus:ring-green-500 outline-none font-medium"
                />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                ความเร็วขนถ่าย (กล่อง/ชม./คน)
                {savedSpeed > 0 && <span className="text-xs text-green-600 ml-1">✓ จากทรัพยากรสาขา</span>}
              </label>
              <input
                type="number"
                value={savedSpeed > 0 ? savedSpeed : loaderSpeed}
                onChange={e => setLoaderSpeed(Number(e.target.value))}
                aria-label="ความเร็วขนถ่าย"
                className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-green-500 outline-none ${savedSpeed > 0 ? 'border-green-300 bg-green-50 font-medium' : 'border-gray-200 bg-white'}`}
                readOnly={savedSpeed > 0}
              />
              {savedSpeed > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  ค่าจากหน้า "ทรัพยากรสาขา" ({savedSpeed} กล่อง/ชม./คน)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ชั่วโมงทำงาน/วัน</label>
              <input
                type="number"
                value={workHoursPerDay}
                onChange={e => setWorkHoursPerDay(Number(e.target.value))}
                aria-label="ชั่วโมงทำงานต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Checker : Loader (1:x)</label>
              <input
                type="number"
                value={checkerRatio}
                onChange={e => setCheckerRatio(Number(e.target.value))}
                aria-label="อัตราส่วน Checker ต่อ Loader"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Admin : สายรถ (1:x)</label>
              <input
                type="number"
                value={adminRatio}
                onChange={e => setAdminRatio(Number(e.target.value))}
                aria-label="อัตราส่วน Admin ต่อสายรถ"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Loader/วัน (บาท)</label>
              <input
                type="number"
                value={loaderWage}
                onChange={e => setLoaderWage(Number(e.target.value))}
                aria-label="ค่าแรง Loader ต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Checker/วัน (บาท)</label>
              <input
                type="number"
                value={checkerWage}
                onChange={e => setCheckerWage(Number(e.target.value))}
                aria-label="ค่าแรง Checker ต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Admin/วัน (บาท)</label>
              <input
                type="number"
                value={adminWage}
                onChange={e => setAdminWage(Number(e.target.value))}
                aria-label="ค่าแรง Admin ต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="p-4 bg-green-50 rounded-xl">
              <p className="text-sm text-green-800">
                <i className="fas fa-user-hard-hat mr-2"></i>
                <strong>Loaders:</strong> ต้องใช้ <strong>{forecast.loadersNeeded} คน</strong> (มี {existingLoaders} →
                {forecast.additionalLoaders > 0 ? (
                  <span className="text-orange-600 font-bold">จ้างเพิ่ม {forecast.additionalLoaders} คน</span>
                ) : (
                  <span className="text-green-600 font-bold">เพียงพอ ✓</span>
                )}
                )
              </p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-xl">
              <p className="text-sm text-yellow-800">
                <i className="fas fa-clipboard-check mr-2"></i>
                <strong>Checkers:</strong> ต้องใช้ <strong>{forecast.checkersNeeded} คน</strong> (มี {existingCheckers} →
                {forecast.additionalCheckers > 0 ? (
                  <span className="text-orange-600 font-bold">จ้างเพิ่ม {forecast.additionalCheckers} คน</span>
                ) : (
                  <span className="text-green-600 font-bold">เพียงพอ ✓</span>
                )}
                )
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl">
              <p className="text-sm text-purple-800">
                <i className="fas fa-file-alt mr-2"></i>
                <strong>Admin:</strong> ต้องใช้ <strong>{forecast.adminNeeded} คน</strong> (มี {existingAdmin} →
                {forecast.additionalAdminNeeded > 0 ? (
                  <span className="text-orange-600 font-bold">จ้างเพิ่ม {forecast.additionalAdminNeeded} คน</span>
                ) : (
                  <span className="text-green-600 font-bold">เพียงพอ ✓</span>
                )}
                )
              </p>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Modal: OT & ค่าใช้จ่าย */}
      <Modal id="ot" title="OT & ค่าใช้จ่าย" icon="💰">
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่า OT (เท่าของค่าแรง)</label>
              <input
                type="number"
                step="0.1"
                value={otMultiplier}
                onChange={e => setOtMultiplier(Number(e.target.value))}
                aria-label="ค่า OT เท่าของค่าแรง"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ค่าจ้าง Part-time/วัน (บาท)</label>
              <input
                type="number"
                value={partTimeWage}
                onChange={e => setPartTimeWage(Number(e.target.value))}
                aria-label="ค่าจ้าง Part-time ต่อวัน"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">OT สูงสุด/สัปดาห์ (ชม.)</label>
              <input
                type="number"
                value={maxOtPerWeek}
                onChange={e => setMaxOtPerWeek(Number(e.target.value))}
                aria-label="OT สูงสุดต่อสัปดาห์"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-xl mb-4">
            <p className="text-sm text-amber-800 font-medium mb-2">
              <i className="fas fa-calculator mr-2"></i>สรุปต้นทุน/วัน
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="bg-white/70 p-2 rounded-lg">
                <span className="text-gray-500">ค่ารถ:</span>
                <span className="float-right font-bold">฿{formatNum(forecast.truckCostTotal)}</span>
              </div>
              <div className="bg-white/70 p-2 rounded-lg">
                <span className="text-gray-500">Loaders:</span>
                <span className="float-right font-bold">฿{formatNum(forecast.loadersCostPerDay)}</span>
              </div>
              <div className="bg-white/70 p-2 rounded-lg">
                <span className="text-gray-500">Checkers:</span>
                <span className="float-right font-bold">฿{formatNum(forecast.checkersCostPerDay)}</span>
              </div>
              <div className="bg-white/70 p-2 rounded-lg">
                <span className="text-gray-500">Admin:</span>
                <span className="float-right font-bold">฿{formatNum(forecast.adminCostPerDay)}</span>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-red-50 rounded-xl">
            <p className="text-sm text-red-800">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              <strong>กฎหมายแรงงาน:</strong> OT ไม่เกิน {maxOtPerWeek} ชม./สัปดาห์ และต้องมีเวลาพักผ่อนเพียงพอสำหรับพนักงานขับรถ
            </p>
          </div>
        </div>
      </Modal>
      
      {/* Recommendations */}
      <div className="glass-panel p-6 rounded-2xl">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <i className="fas fa-lightbulb text-yellow-500"></i> คำแนะนำ
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
            <i className="fas fa-truck text-blue-500 mt-0.5"></i>
            <div className="text-sm text-blue-800">
              <strong>จองรถร่วม (Sub-contract):</strong> ควรติดต่อล่วงหน้าอย่างน้อย 3-5 วันสำหรับช่วงปกติ และ 1-2 สัปดาห์สำหรับช่วง Peak Season
            </div>
          </div>
          
          {forecast.overCapacity ? (
            <div className={`flex items-start gap-3 p-4 rounded-xl ${forecast.recommendOt ? 'bg-green-50' : 'bg-orange-50'}`}>
              <i className={`fas fa-clock mt-0.5 ${forecast.recommendOt ? 'text-green-500' : 'text-orange-500'}`}></i>
              <div className={`text-sm ${forecast.recommendOt ? 'text-green-800' : 'text-orange-800'}`}>
                <strong>งานล้น {forecast.otHoursNeeded} ชม./วัน:</strong>{' '}
                {forecast.recommendOt
                  ? `แนะนำจ่าย OT (฿${formatNum(Math.round(forecast.otCost))}) คุ้มกว่าจ้าง Part-time (฿${formatNum(forecast.partTimeCost)})`
                  : `แนะนำจ้าง Part-time (฿${formatNum(forecast.partTimeCost)}) คุ้มกว่าจ่าย OT (฿${formatNum(Math.round(forecast.otCost))})`}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl">
              <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
              <div className="text-sm text-green-800">
                <strong>ยอดงานปกติ:</strong> กำลังคนเพียงพอ ไม่ต้องจ่าย OT หรือจ้าง Part-time เพิ่ม
              </div>
            </div>
          )}
          
          <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
            <i className="fas fa-file-alt text-purple-500 mt-0.5"></i>
            <div className="text-sm text-purple-800">
              <strong>Admin/เอกสาร:</strong> เตรียมเอกสารล่วงหน้า (ใบ DO/Invoice) จัดชุดตามสายรถให้เสร็จก่อนรถเข้า เพื่อลด Waiting Time ของคนขับ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { Forecast };
