import React, { useState, useMemo, useEffect } from 'react';
import { BranchResource, BranchResourceHistory, KpiConfig, DeliveryRecord } from '../types';
import { getBranchResourceHistory } from '../services/api';

interface BranchResourcesProps {
  kpiConfigs: KpiConfig[];
  deliveries: DeliveryRecord[];
  branchResources: BranchResource[];
  onSaveBranchResource: (resource: BranchResource, oldResource?: BranchResource) => void;
  currentUserEmail: string;
}

const formatNum = (n: number) => n.toLocaleString('th-TH');

export const BranchResources: React.FC<BranchResourcesProps> = ({
  kpiConfigs,
  deliveries,
  branchResources,
  onSaveBranchResource,
  currentUserEmail
}) => {
  // Get unique branches from kpiConfigs
  const branches = useMemo(() => {
    const branchSet = new Set<string>();
    kpiConfigs.forEach(c => {
      if (c.branch) branchSet.add(c.branch);
    });
    return Array.from(branchSet).sort();
  }, [kpiConfigs]);

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<BranchResourceHistory[]>([]);
  
  // Month selection for calculation
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
  
  const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  
  // Generate available years (last 3 years)
  const availableYears = useMemo(() => {
    const years = [];
    for (let y = today.getFullYear(); y >= today.getFullYear() - 2; y--) {
      years.push(y);
    }
    return years;
  }, []);

  // Form state
  const [trucks, setTrucks] = useState(0);
  const [tripsPerDay, setTripsPerDay] = useState(2);
  const [loaders, setLoaders] = useState(0);
  const [checkers, setCheckers] = useState(0);
  const [admin, setAdmin] = useState(0);
  const [workHoursPerDay, setWorkHoursPerDay] = useState(8);
  const [loaderWage, setLoaderWage] = useState(400);
  const [checkerWage, setCheckerWage] = useState(450);
  const [adminWage, setAdminWage] = useState(500);
  const [truckCostPerDay, setTruckCostPerDay] = useState(1500);

  // Build district-to-branch map
  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => {
      if (c.branch && c.district) {
        map.set(`${c.province || ''}||${c.district}`, c.branch);
      }
    });
    return map;
  }, [kpiConfigs]);

  const getBranch = (d: DeliveryRecord) => {
    const key = `${d.province || ''}||${d.district}`;
    const keyNoProvince = `||${d.district}`;
    return districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince) || '';
  };

  // Calculate stats from deliveries for selected branch and month
  const stats = useMemo(() => {
    if (!selectedBranch) return { avgQtyPerDay: 0, workDays: 0, totalQty: 0 };
    
    const fromDate = new Date(selectedYear, selectedMonth, 1);
    const toDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
    
    const filtered = deliveries.filter(d => {
      if (getBranch(d) !== selectedBranch) return false;
      const refDate = d.openDate || d.planDate;
      if (!refDate) return false;
      const date = new Date(refDate);
      return date >= fromDate && date <= toDate;
    });

    // Count unique work days
    const workDaysSet = new Set<string>();
    let totalQty = 0;
    filtered.forEach(d => {
      const refDate = d.openDate || d.planDate;
      if (refDate) workDaysSet.add(refDate.split('T')[0]);
      totalQty += d.qty || 0;
    });

    const workDays = workDaysSet.size;
    const avgQtyPerDay = workDays > 0 ? Math.round(totalQty / workDays) : 0;

    return { avgQtyPerDay, workDays, totalQty };
  }, [selectedBranch, deliveries, selectedYear, selectedMonth, districtBranchMap]);

  // Calculate monthly stats for recommendations (all months available)
  const monthlyStats = useMemo(() => {
    if (!selectedBranch) return [];
    
    const result: { year: number; month: number; totalQty: number; workDays: number; avgQtyPerDay: number }[] = [];
    
    // Calculate for last 24 months
    for (let i = 0; i < 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const fromDate = new Date(year, month, 1);
      const toDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
      
      const filtered = deliveries.filter(del => {
        if (getBranch(del) !== selectedBranch) return false;
        const refDate = del.openDate || del.planDate;
        if (!refDate) return false;
        const date = new Date(refDate);
        return date >= fromDate && date <= toDate;
      });
      
      const workDaysSet = new Set<string>();
      let totalQty = 0;
      filtered.forEach(del => {
        const refDate = del.openDate || del.planDate;
        if (refDate) workDaysSet.add(refDate.split('T')[0]);
        totalQty += del.qty || 0;
      });
      
      const workDays = workDaysSet.size;
      if (workDays > 0) {
        result.push({
          year,
          month,
          totalQty,
          workDays,
          avgQtyPerDay: Math.round(totalQty / workDays)
        });
      }
    }
    
    return result;
  }, [selectedBranch, deliveries, districtBranchMap]);

  // Find highest month and same month last year
  const recommendations = useMemo(() => {
    if (monthlyStats.length === 0) return null;
    
    // Find month with highest totalQty
    const highestMonth = monthlyStats.reduce((max, m) => m.totalQty > max.totalQty ? m : max, monthlyStats[0]);
    
    // Find same month last year
    const lastYearMonth = monthlyStats.find(m => m.year === selectedYear - 1 && m.month === selectedMonth);
    
    return { highestMonth, lastYearMonth };
  }, [monthlyStats, selectedYear, selectedMonth]);

  // Auto-calculate capacity and speed
  const calculatedCapacity = useMemo(() => {
    if (trucks <= 0 || tripsPerDay <= 0) return 0;
    return Math.round(stats.avgQtyPerDay / (trucks * tripsPerDay));
  }, [stats.avgQtyPerDay, trucks, tripsPerDay]);

  const calculatedSpeed = useMemo(() => {
    if (loaders <= 0 || workHoursPerDay <= 0) return 0;
    return Math.round(stats.avgQtyPerDay / (loaders * workHoursPerDay));
  }, [stats.avgQtyPerDay, loaders, workHoursPerDay]);

  // Load existing resource when branch changes
  useEffect(() => {
    if (!selectedBranch) return;
    const existing = branchResources.find(b => b.branchName === selectedBranch);
    if (existing) {
      setTrucks(existing.trucks);
      setTripsPerDay(existing.tripsPerDay);
      setLoaders(existing.loaders);
      setCheckers(existing.checkers);
      setAdmin(existing.admin);
      setWorkHoursPerDay(existing.workHoursPerDay);
      setLoaderWage(existing.loaderWage);
      setCheckerWage(existing.checkerWage);
      setAdminWage(existing.adminWage);
      setTruckCostPerDay(existing.truckCostPerDay);
    } else {
      // Reset to defaults
      setTrucks(0);
      setTripsPerDay(2);
      setLoaders(0);
      setCheckers(0);
      setAdmin(0);
      setWorkHoursPerDay(8);
      setLoaderWage(400);
      setCheckerWage(450);
      setAdminWage(500);
      setTruckCostPerDay(1500);
    }
  }, [selectedBranch, branchResources]);

  // Load history when viewing
  const loadHistory = async () => {
    if (!selectedBranch) return;
    const existing = branchResources.find(b => b.branchName === selectedBranch);
    if (!existing) {
      setHistory([]);
      setShowHistory(true);
      return;
    }

    try {
      const historyData = await getBranchResourceHistory(existing.id);
      setHistory(historyData.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch (e) {
      console.warn('Load history error:', e);
      setHistory([]);
    }
    setShowHistory(true);
  };

  const handleSave = () => {
    if (!selectedBranch) {
      alert('กรุณาเลือกสาขา');
      return;
    }

    const existing = branchResources.find(b => b.branchName === selectedBranch);
    const now = new Date().toISOString();

    const resource: BranchResource = {
      id: existing?.id || `branch-${Date.now()}`,
      branchName: selectedBranch,
      trucks,
      tripsPerDay,
      loaders,
      checkers,
      admin,
      workHoursPerDay,
      loaderWage,
      checkerWage,
      adminWage,
      truckCostPerDay,
      calculatedCapacity, // บันทึกค่าความจุเฉลี่ยที่คำนวณได้
      calculatedSpeed, // บันทึกค่าความเร็วขนถ่ายที่คำนวณได้
      updatedAt: now,
      updatedBy: currentUserEmail
    };

    onSaveBranchResource(resource, existing);
    alert('✅ บันทึกข้อมูลสาขาเรียบร้อย');
  };

  const fieldLabels: Record<string, string> = {
    trucks: 'จำนวนรถ',
    tripsPerDay: 'รอบ/วัน',
    loaders: 'Loaders',
    checkers: 'Checkers',
    admin: 'Admin',
    workHoursPerDay: 'ชม.ทำงาน/วัน',
    loaderWage: 'ค่าแรง Loader',
    checkerWage: 'ค่าแรง Checker',
    adminWage: 'ค่าแรง Admin',
    truckCostPerDay: 'ค่าเช่ารถ/วัน'
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              <i className="fas fa-building text-purple-500"></i>
              ทรัพยากรสาขา
            </h1>
            <p className="text-gray-500 mt-1">จัดการข้อมูลรถขนส่งและพนักงานประจำแต่ละสาขา</p>
          </div>
        </div>
      </div>

      {/* Branch Selection & Month Selection */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">เลือกสาขา</label>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              aria-label="เลือกสาขา"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none text-lg"
            >
              <option value="">-- เลือกสาขา --</option>
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">เลือกเดือน</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              aria-label="เลือกเดือน"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
            >
              {monthNames.map((name, idx) => (
                <option key={idx} value={idx}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">ปี (พ.ศ.)</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              aria-label="เลือกปี"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year + 543}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedBranch && (
          <div className="mt-4 space-y-3">
            {/* Current month stats */}
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-blue-800">
                <i className="fas fa-chart-bar mr-2"></i>
                <strong>ข้อมูล {monthNames[selectedMonth]} {selectedYear + 543}:</strong> ยอดเฉลี่ย <strong>{formatNum(stats.avgQtyPerDay)}</strong> กล่อง/วัน | 
                วันทำงาน <strong>{formatNum(stats.workDays)}</strong> วัน | 
                ยอดรวม <strong>{formatNum(stats.totalQty)}</strong> กล่อง
              </p>
            </div>
            
            {/* Recommendations */}
            {recommendations && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Highest month */}
                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <p className="text-xs text-green-600 font-medium mb-1">
                    <i className="fas fa-trophy mr-1"></i> เดือนที่มียอดสูงสุด
                  </p>
                  <p className="text-sm text-green-800">
                    <strong>{monthNames[recommendations.highestMonth.month]} {recommendations.highestMonth.year + 543}</strong>
                    <br />
                    ยอดรวม <strong>{formatNum(recommendations.highestMonth.totalQty)}</strong> กล่อง | 
                    เฉลี่ย <strong>{formatNum(recommendations.highestMonth.avgQtyPerDay)}</strong> กล่อง/วัน
                  </p>
                  <button
                    onClick={() => { setSelectedYear(recommendations.highestMonth.year); setSelectedMonth(recommendations.highestMonth.month); }}
                    className="mt-2 text-xs text-green-600 hover:text-green-800 underline"
                  >
                    <i className="fas fa-arrow-right mr-1"></i> ใช้ข้อมูลเดือนนี้
                  </button>
                </div>
                
                {/* Same month last year */}
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    <i className="fas fa-history mr-1"></i> เดือนเดียวกันปีที่แล้ว
                  </p>
                  {recommendations.lastYearMonth ? (
                    <>
                      <p className="text-sm text-purple-800">
                        <strong>{monthNames[recommendations.lastYearMonth.month]} {recommendations.lastYearMonth.year + 543}</strong>
                        <br />
                        ยอดรวม <strong>{formatNum(recommendations.lastYearMonth.totalQty)}</strong> กล่อง | 
                        เฉลี่ย <strong>{formatNum(recommendations.lastYearMonth.avgQtyPerDay)}</strong> กล่อง/วัน
                      </p>
                      <button
                        onClick={() => { setSelectedYear(recommendations.lastYearMonth!.year); setSelectedMonth(recommendations.lastYearMonth!.month); }}
                        className="mt-2 text-xs text-purple-600 hover:text-purple-800 underline"
                      >
                        <i className="fas fa-arrow-right mr-1"></i> ใช้ข้อมูลเดือนนี้
                      </button>
                      {/* Comparison */}
                      {stats.totalQty > 0 && (
                        <p className="mt-2 text-xs text-purple-600">
                          {stats.totalQty > recommendations.lastYearMonth.totalQty ? (
                            <span className="text-green-600">
                              <i className="fas fa-arrow-up mr-1"></i>
                              เพิ่มขึ้น {formatNum(Math.round((stats.totalQty - recommendations.lastYearMonth.totalQty) / recommendations.lastYearMonth.totalQty * 100))}% จากปีที่แล้ว
                            </span>
                          ) : (
                            <span className="text-red-600">
                              <i className="fas fa-arrow-down mr-1"></i>
                              ลดลง {formatNum(Math.round((recommendations.lastYearMonth.totalQty - stats.totalQty) / recommendations.lastYearMonth.totalQty * 100))}% จากปีที่แล้ว
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-purple-400">ไม่มีข้อมูลปีที่แล้ว</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedBranch && (
        <>
          {/* Trucks Section */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-truck text-blue-500"></i>
              🚛 รถขนส่ง
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">จำนวนรถประจำสาขา (คัน)</label>
                <input
                  type="number"
                  value={trucks}
                  onChange={e => setTrucks(Number(e.target.value))}
                  aria-label="จำนวนรถ"
                  className="w-full px-4 py-3 rounded-xl border border-blue-300 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">รอบ/วัน</label>
                <input
                  type="number"
                  value={tripsPerDay}
                  onChange={e => setTripsPerDay(Number(e.target.value))}
                  aria-label="รอบต่อวัน"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ค่าเช่ารถเพิ่ม/วัน (บาท)</label>
                <input
                  type="number"
                  value={truckCostPerDay}
                  onChange={e => setTruckCostPerDay(Number(e.target.value))}
                  aria-label="ค่าเช่ารถต่อวัน"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            {trucks > 0 && tripsPerDay > 0 && stats.avgQtyPerDay > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-800">
                  <i className="fas fa-calculator mr-2"></i>
                  <strong>ความจุเฉลี่ย (คำนวณอัตโนมัติ):</strong> {formatNum(stats.avgQtyPerDay)} ÷ ({trucks} × {tripsPerDay}) = <strong>{formatNum(calculatedCapacity)} กล่อง/เที่ยว</strong>
                </p>
              </div>
            )}
          </div>

          {/* Manpower Section */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-users text-green-500"></i>
              👷 Manpower (พนักงานประจำสาขา)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Loaders (คน)</label>
                <input
                  type="number"
                  value={loaders}
                  onChange={e => setLoaders(Number(e.target.value))}
                  aria-label="Loaders"
                  className="w-full px-4 py-3 rounded-xl border border-green-300 bg-green-50 focus:ring-2 focus:ring-green-500 outline-none font-medium text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Checkers (คน)</label>
                <input
                  type="number"
                  value={checkers}
                  onChange={e => setCheckers(Number(e.target.value))}
                  aria-label="Checkers"
                  className="w-full px-4 py-3 rounded-xl border border-green-300 bg-green-50 focus:ring-2 focus:ring-green-500 outline-none font-medium text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Admin (คน)</label>
                <input
                  type="number"
                  value={admin}
                  onChange={e => setAdmin(Number(e.target.value))}
                  aria-label="Admin"
                  className="w-full px-4 py-3 rounded-xl border border-green-300 bg-green-50 focus:ring-2 focus:ring-green-500 outline-none font-medium text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ชม.ทำงาน/วัน</label>
                <input
                  type="number"
                  value={workHoursPerDay}
                  onChange={e => setWorkHoursPerDay(Number(e.target.value))}
                  aria-label="ชั่วโมงทำงานต่อวัน"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>
            {loaders > 0 && workHoursPerDay > 0 && stats.avgQtyPerDay > 0 && (
              <div className="mt-4 p-4 bg-green-50 rounded-xl">
                <p className="text-sm text-green-800">
                  <i className="fas fa-calculator mr-2"></i>
                  <strong>ความเร็วขนถ่ายเฉลี่ย (คำนวณอัตโนมัติ):</strong> {formatNum(stats.avgQtyPerDay)} ÷ ({loaders} × {workHoursPerDay}) = <strong>{formatNum(calculatedSpeed)} กล่อง/ชม./คน</strong>
                </p>
              </div>
            )}
          </div>

          {/* Wages Section */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-coins text-amber-500"></i>
              💰 ค่าแรง
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Loader/วัน (บาท)</label>
                <input
                  type="number"
                  value={loaderWage}
                  onChange={e => setLoaderWage(Number(e.target.value))}
                  aria-label="ค่าแรง Loader"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Checker/วัน (บาท)</label>
                <input
                  type="number"
                  value={checkerWage}
                  onChange={e => setCheckerWage(Number(e.target.value))}
                  aria-label="ค่าแรง Checker"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ค่าแรง Admin/วัน (บาท)</label>
                <input
                  type="number"
                  value={adminWage}
                  onChange={e => setAdminWage(Number(e.target.value))}
                  aria-label="ค่าแรง Admin"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-medium hover:shadow-lg transition-all flex items-center gap-2"
            >
              <i className="fas fa-save"></i>
              บันทึก
            </button>
            <button
              onClick={loadHistory}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all flex items-center gap-2"
            >
              <i className="fas fa-history"></i>
              ดูประวัติการเปลี่ยนแปลง
            </button>
          </div>
        </>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">
                <i className="fas fa-history mr-2 text-purple-500"></i>
                ประวัติการเปลี่ยนแปลง - {selectedBranch}
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="ปิด"
                title="ปิด"
              >
                <i className="fas fa-times text-gray-500"></i>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <p className="text-gray-500 text-center py-8">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
              ) : (
                <div className="space-y-4">
                  {history.map(h => (
                    <div key={h.id} className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <i className="fas fa-clock"></i>
                        <span>{new Date(h.updatedAt).toLocaleString('th-TH')}</span>
                        <span>-</span>
                        <span>{h.updatedBy}</span>
                      </div>
                      {h.action === 'create' ? (
                        <p className="text-green-600 font-medium">
                          <i className="fas fa-plus-circle mr-2"></i>
                          สร้างข้อมูลสาขาใหม่
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {Object.entries(h.changes).map(([field, change]) => (
                            <p key={field} className="text-sm">
                              <span className="font-medium">{fieldLabels[field] || field}:</span>{' '}
                              <span className="text-red-500">{change.from}</span>{' '}
                              <i className="fas fa-arrow-right mx-1 text-gray-400"></i>{' '}
                              <span className="text-green-600">{change.to}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
