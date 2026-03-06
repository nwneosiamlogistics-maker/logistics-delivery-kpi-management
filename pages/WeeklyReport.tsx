import React, { useState, useMemo } from 'react';
import { DeliveryRecord, DeliveryStatus, KpiStatus, KpiConfig, StoreMapping } from '../types';

interface WeeklyReportProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
  storeMappings?: StoreMapping[];
  onUpdateDeliveries?: (deliveries: DeliveryRecord[]) => void;
  onAddStoreMapping?: (mapping: StoreMapping) => void;
}

function getWeekRange(referenceDate: Date): { start: Date; end: Date; label: string } {
  const d = new Date(referenceDate);
  // Find the most recent Saturday (cutoff day)
  const day = d.getDay(); // 0=Sun, 6=Sat
  const diffToSat = (day === 6) ? 0 : day + 1;
  const sat = new Date(d);
  sat.setDate(d.getDate() - diffToSat);
  sat.setHours(23, 59, 59, 999);

  const prevSat = new Date(sat);
  prevSat.setDate(sat.getDate() - 7);
  prevSat.setHours(0, 0, 0, 0);

  const start = new Date(prevSat);
  start.setDate(prevSat.getDate() + 1); // Sunday
  start.setHours(0, 0, 0, 0);

  const label = `${start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${sat.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return { start, end: sat, label };
}

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({ 
  deliveries, 
  kpiConfigs = [], 
  storeMappings = [],
  onUpdateDeliveries,
  onAddStoreMapping
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [selectedDistricts, setSelectedDistricts] = useState<Record<string, string>>({}); // displayKey -> selected district
  const [selectedProvinces, setSelectedProvinces] = useState<Record<string, string>>({}); // displayKey -> selected province
  const [rememberStore, setRememberStore] = useState<Record<string, boolean>>({});

  // Build district → branch map from kpiConfigs
  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  // All unique branches
  const branches = useMemo(() => {
    const set = new Set<string>();
    kpiConfigs.forEach(c => { if (c.branch) set.add(c.branch); });
    return Array.from(set).sort();
  }, [kpiConfigs]);

  const today = new Date();
  const refDate = new Date(today);
  refDate.setDate(today.getDate() - weekOffset * 7);

  const { start, end, label } = useMemo(() => getWeekRange(refDate), [weekOffset]);

  // Filter deliveries for this week by openDate (วันที่เปิดบิล) + branch
  // Fallback to planDate if openDate is not available
  const weekDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      // Use openDate if available, otherwise fallback to planDate
      const dateToUse = d.openDate || d.planDate;
      const checkDate = parseLocalDate(dateToUse || '');
      if (!checkDate) return false;
      if (!(checkDate >= start && checkDate <= end)) return false;
      if (branchFilter !== 'All') {
        const key = `${d.province || ''}||${d.district}`;
        const keyNoProvince = `||${d.district}`;
        const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince);
        if (branch !== branchFilter) return false;
      }
      return true;
    });
  }, [deliveries, start, end, branchFilter, districtBranchMap]);

  // All delivered (ส่งเสร็จ) records for POD calculation
  const deliveredThisWeek = weekDeliveries.filter(d =>
    d.deliveryStatus === DeliveryStatus.DELIVERED
  );

  // Delay buckets based on delayDays (for delivered records only)
  const on1Day = deliveredThisWeek.filter(d => d.delayDays <= 1);
  const on2Days = deliveredThisWeek.filter(d => d.delayDays === 2);
  const over2Days = deliveredThisWeek.filter(d => d.delayDays > 2);

  const totalInv = weekDeliveries.length;
  const totalQty = weekDeliveries.reduce((s, d) => s + d.qty, 0);

  const pct = (n: number, total: number) =>
    total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';

  // POD pending: not yet delivered
  const podPending = weekDeliveries.filter(d =>
    d.deliveryStatus !== DeliveryStatus.DELIVERED
  );
  const podDone = deliveredThisWeek.length;
  const podPendingCount = podPending.length;
  const podPendingPct = pct(podPendingCount, totalInv);

  // KPI summary — exclude 'รอจัด' (items not yet at branch)
  const activeDeliveries = weekDeliveries.filter(d => d.deliveryStatus !== 'รอจัด');
  const kpiPass = activeDeliveries.filter(d => d.kpiStatus === KpiStatus.PASS).length;
  const kpiFail = activeDeliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS).length;
  const kpiTotal = activeDeliveries.length;

  // Branch summary data (for all deliveries in the week, not filtered by branchFilter)
  const branchSummary = useMemo(() => {
    const branchData = new Map<string, { total: number; delivered: number; pending: number; kpiPass: number; kpiTotal: number }>();
    
    branches.forEach(b => {
      branchData.set(b, { total: 0, delivered: 0, pending: 0, kpiPass: 0, kpiTotal: 0 });
    });
    branchData.set('ไม่ระบุสาขา', { total: 0, delivered: 0, pending: 0, kpiPass: 0, kpiTotal: 0 });

    deliveries.forEach(d => {
      const dateToUse = d.openDate || d.planDate;
      const checkDate = parseLocalDate(dateToUse || '');
      if (!checkDate) return;
      if (!(checkDate >= start && checkDate <= end)) return;

      const key = `${d.province || ''}||${d.district}`;
      const keyNoProvince = `||${d.district}`;
      const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince) || 'ไม่ระบุสาขา';

      const data = branchData.get(branch) || { total: 0, delivered: 0, pending: 0, kpiPass: 0, kpiTotal: 0 };
      data.total++;
      
      if (d.deliveryStatus === DeliveryStatus.DELIVERED) {
        data.delivered++;
      } else {
        data.pending++;
      }

      if (d.deliveryStatus !== 'รอจัด') {
        data.kpiTotal++;
        if (d.kpiStatus === KpiStatus.PASS) {
          data.kpiPass++;
        }
      }

      branchData.set(branch, data);
    });

    return Array.from(branchData.entries())
      .filter(([_, data]) => data.total > 0)
      .sort((a, b) => b[1].total - a[1].total);
  }, [deliveries, branches, districtBranchMap, start, end]);

  // Find unmapped districts (districts without branch mapping) with order numbers and storeIds
  const unmappedDistricts = useMemo(() => {
    const unmapped = new Map<string, { 
      count: number; 
      orderNos: string[]; 
      storeIds: string[];
      province: string;
      district: string;
    }>();
    
    deliveries.forEach(d => {
      const dateToUse = d.openDate || d.planDate;
      const checkDate = parseLocalDate(dateToUse || '');
      if (!checkDate) return;
      if (!(checkDate >= start && checkDate <= end)) return;

      const key = `${d.province || ''}||${d.district}`;
      const keyNoProvince = `||${d.district}`;
      const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince);
      
      if (!branch) {
        const displayKey = d.province ? `${d.province} / ${d.district || '(ไม่ระบุอำเภอ)'}` : (d.district || '(ไม่ระบุ)');
        const existing = unmapped.get(displayKey) || { 
          count: 0, 
          orderNos: [], 
          storeIds: [],
          province: d.province || '',
          district: d.district || ''
        };
        existing.count++;
        existing.orderNos.push(d.orderNo);
        if (d.storeId && !existing.storeIds.includes(d.storeId)) {
          existing.storeIds.push(d.storeId);
        }
        unmapped.set(displayKey, existing);
      }
    });

    return Array.from(unmapped.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [deliveries, districtBranchMap, start, end]);

  // Get all unique provinces from kpiConfigs
  const allProvinces = useMemo(() => {
    return kpiConfigs
      .filter(c => c.province)
      .map(c => c.province)
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .sort();
  }, [kpiConfigs]);

  // Get available districts for a province from kpiConfigs
  const getDistrictsForProvince = (province: string) => {
    return kpiConfigs
      .filter(c => c.province === province && c.district)
      .map(c => c.district)
      .filter((d, i, arr) => arr.indexOf(d) === i);
  };

  // Handle save district fix
  const handleSaveDistrictFix = (displayKey: string, data: { orderNos: string[]; storeIds: string[]; province: string }) => {
    const selectedDistrict = selectedDistricts[displayKey];
    const selectedProvince = selectedProvinces[displayKey];
    
    // Need at least district OR province to proceed
    if ((!selectedDistrict && !selectedProvince) || !onUpdateDeliveries) return;

    // Update deliveries with the selected district and/or province
    const finalProvince = selectedProvince || data.province;
    const finalDistrict = selectedDistrict || '';
    
    const updatedDeliveries = deliveries.map(d => {
      if (data.orderNos.includes(d.orderNo)) {
        return { 
          ...d, 
          province: finalProvince,
          district: finalDistrict || d.district 
        };
      }
      return d;
    });
    onUpdateDeliveries(updatedDeliveries);

    // If remember store is checked, add store mappings
    if (rememberStore[displayKey] && onAddStoreMapping && finalDistrict) {
      data.storeIds.forEach(storeId => {
        onAddStoreMapping({
          storeId,
          district: finalDistrict,
          province: finalProvince,
          createdAt: new Date().toISOString().slice(0, 10)
        });
      });
    }

    // Clear selection
    setSelectedDistricts(prev => {
      const next = { ...prev };
      delete next[displayKey];
      return next;
    });
    setSelectedProvinces(prev => {
      const next = { ...prev };
      delete next[displayKey];
      return next;
    });
    setRememberStore(prev => {
      const next = { ...prev };
      delete next[displayKey];
      return next;
    });
  };

  const statCard = (
    icon: string,
    color: string,
    bg: string,
    label: string,
    value: string | number,
    sub?: string
  ) => (
    <div className="glass-card p-5 rounded-2xl flex items-start gap-4">
      <div className={`p-3 ${bg} ${color} rounded-xl shrink-0 text-lg`}>
        <i className={`fas ${icon}`}></i>
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );

  const delayRow = (label: string, records: DeliveryRecord[], color: string) => {
    const invCount = records.length;
    const qtySum = records.reduce((s, d) => s + d.qty, 0);
    const pctVal = pct(invCount, deliveredThisWeek.length);
    return (
      <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${color}`}>
            {label}
          </span>
        </td>
        <td className="px-4 py-3 text-center font-bold text-gray-800">{invCount.toLocaleString()}</td>
        <td className="px-4 py-3 text-center text-gray-500">{qtySum % 1 === 0 ? qtySum.toLocaleString() : qtySum.toFixed(2)}</td>
        <td className="px-4 py-3 text-center">
          <span className="font-bold text-gray-700">{pctVal}%</span>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="h-1.5 rounded-full bg-current transition-all" style={{ width: `${pctVal}%` }}></div>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white/40">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            สรุปผลการทำงานประจำสัปดาห์
          </h2>
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1.5">
            <i className="fas fa-calendar-week text-indigo-400"></i>
            ตัดรอบทุกวันเสาร์ · {label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 0 && (
            <select
              aria-label="กรองตามสาขา"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white/70 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="All">ทุกสาขา</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            title="สัปดาห์ก่อนหน้า"
            aria-label="สัปดาห์ก่อนหน้า"
            className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm transition-colors"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${weekOffset === 0 ? 'bg-indigo-100 text-indigo-600 cursor-default' : 'border border-gray-200 hover:bg-gray-50 text-gray-600'}`}
          >
            สัปดาห์นี้
          </button>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            title="สัปดาห์ถัดไป"
            aria-label="สัปดาห์ถัดไป"
            className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm transition-colors"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCard('fa-file-invoice', 'text-indigo-600', 'bg-indigo-50', 'จำนวน Inv. ทั้งหมด', totalInv.toLocaleString(), `${totalQty % 1 === 0 ? totalQty.toLocaleString() : totalQty.toFixed(2)} ชิ้น/กล่อง`)}
        {statCard('fa-check-circle', 'text-green-600', 'bg-green-50', 'ส่งเสร็จ (POD)', podDone.toLocaleString(), `${pct(podDone, totalInv)}% ของทั้งหมด`)}
        {statCard('fa-clock', 'text-orange-600', 'bg-orange-50', 'POD ยังค้าง', podPendingCount.toLocaleString(), `${podPendingPct}% ของทั้งหมด`)}
        {statCard('fa-trophy', 'text-blue-600', 'bg-blue-50', 'KPI ผ่าน', `${pct(kpiPass, kpiTotal)}%`, `ผ่าน ${kpiPass} / ไม่ผ่าน ${kpiFail} (จาก ${kpiTotal} Inv.)`)}
      </div>

      {/* Branch Summary Table */}
      {branchSummary.length > 1 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-code-branch text-indigo-500"></i>
            สรุปแยกตามสาขา
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">สาขา</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Inv. ทั้งหมด</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">ส่งเสร็จ (POD)</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">POD ยังค้าง</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">KPI ผ่าน</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map(([branch, data]) => {
                  const kpiPct = data.kpiTotal > 0 ? (data.kpiPass / data.kpiTotal) * 100 : 0;
                  return (
                    <tr key={branch} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{branch}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-600">{data.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-green-600">{data.delivered.toLocaleString()}</span>
                        <span className="text-gray-400 text-xs ml-1">({pct(data.delivered, data.total)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-orange-600">{data.pending.toLocaleString()}</span>
                        <span className="text-gray-400 text-xs ml-1">({pct(data.pending, data.total)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${kpiPct >= 98 ? 'bg-green-100 text-green-700' : kpiPct >= 90 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {kpiPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-700">รวมทั้งหมด</td>
                  <td className="px-4 py-3 text-center font-bold text-indigo-700">{branchSummary.reduce((s, [_, d]) => s + d.total, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center font-bold text-green-700">{branchSummary.reduce((s, [_, d]) => s + d.delivered, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center font-bold text-orange-700">{branchSummary.reduce((s, [_, d]) => s + d.pending, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${parseFloat(pct(kpiPass, kpiTotal)) >= 98 ? 'bg-green-100 text-green-700' : parseFloat(pct(kpiPass, kpiTotal)) >= 90 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {pct(kpiPass, kpiTotal)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Unmapped Districts */}
          {unmappedDistricts.length > 0 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h4 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle"></i>
                อำเภอ/จังหวัด ที่ยังไม่ได้ตั้งค่าสาขา ({unmappedDistricts.length} รายการ)
              </h4>
              <p className="text-xs text-amber-600 mb-3">เลือกอำเภอแล้วกดบันทึกเพื่อแก้ไข หรือไปที่ "ตั้งค่าข้อมูลหลัก" → "กฎ KPI"</p>
              <div className="space-y-3">
                {unmappedDistricts.map(([displayKey, data]) => {
                  const availableDistricts = getDistrictsForProvince(data.province);
                  return (
                    <div key={displayKey} className="p-3 bg-white border border-amber-300 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-amber-800">📍 {displayKey}</span>
                        <span className="text-xs font-bold text-amber-600">({data.count} Inv)</span>
                      </div>
                      
                      {/* Store IDs */}
                      {data.storeIds.length > 0 && (
                        <div className="mb-2 p-2 bg-gray-50 rounded text-xs">
                          <span className="text-gray-500 font-medium">🏪 ร้านค้า:</span>
                          <div className="mt-1 space-y-1">
                            {data.storeIds.map(storeId => (
                              <div key={storeId} className="text-gray-700 truncate">{storeId}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Order Numbers */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {data.orderNos.slice(0, 5).map(orderNo => (
                          <span key={orderNo} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">
                            {orderNo}
                          </span>
                        ))}
                        {data.orderNos.length > 5 && (
                          <span className="px-1.5 py-0.5 text-amber-500 text-xs">
                            +{data.orderNos.length - 5} รายการ
                          </span>
                        )}
                      </div>

                      {/* Fix Section */}
                      {onUpdateDeliveries && (
                        <div className="pt-2 border-t border-amber-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-600">🔧 แก้ไข:</span>
                            {/* Province dropdown - shown when province looks wrong */}
                            <select
                              aria-label="เลือกจังหวัด"
                              value={selectedProvinces[displayKey] || ''}
                              onChange={e => {
                                setSelectedProvinces(prev => ({ ...prev, [displayKey]: e.target.value }));
                                setSelectedDistricts(prev => ({ ...prev, [displayKey]: '' })); // Reset district when province changes
                              }}
                              className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-amber-500 outline-none"
                            >
                              <option value="">จังหวัด...</option>
                              {allProvinces.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            {/* District dropdown - uses selected province or original province */}
                            <select
                              aria-label="เลือกอำเภอ"
                              value={selectedDistricts[displayKey] || ''}
                              onChange={e => setSelectedDistricts(prev => ({ ...prev, [displayKey]: e.target.value }))}
                              className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-amber-500 outline-none"
                            >
                              <option value="">อำเภอ...</option>
                              {getDistrictsForProvince(selectedProvinces[displayKey] || data.province).map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleSaveDistrictFix(displayKey, data)}
                              disabled={!selectedDistricts[displayKey] && !selectedProvinces[displayKey]}
                              className="px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              💾 บันทึก
                            </button>
                          </div>
                          {onAddStoreMapping && data.storeIds.length > 0 && (
                            <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rememberStore[displayKey] || false}
                                onChange={e => setRememberStore(prev => ({ ...prev, [displayKey]: e.target.checked }))}
                                className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                              />
                              จดจำร้านค้านี้ → ใช้อำเภอเดียวกันอัตโนมัติในครั้งถัดไป
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delivery Timing Breakdown */}
      <div className="glass-panel p-6 rounded-2xl">
        <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
          <i className="fas fa-shipping-fast text-indigo-500"></i>
          สรุปผลการจัดส่ง — นับจากวันที่ได้รับสินค้า
        </h3>
        <p className="text-xs text-gray-400 mb-4">เฉพาะรายการที่ส่งเสร็จแล้ว ({deliveredThisWeek.length} Inv.)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">ระยะเวลาส่ง</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">จำนวน Inv.</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">จำนวนสินค้า</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Ontime %</th>
              </tr>
            </thead>
            <tbody>
              {delayRow('ภายใน 1 วัน', on1Day, 'bg-green-100 text-green-700')}
              {delayRow('ภายใน 2 วัน', on2Days, 'bg-blue-100 text-blue-700')}
              {delayRow('มีเกิน 2 วัน', over2Days, 'bg-red-100 text-red-700')}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 font-bold text-gray-700 text-xs">รวมทั้งหมด</td>
                <td className="px-4 py-3 text-center font-bold text-gray-800">{deliveredThisWeek.length.toLocaleString()}</td>
                <td className="px-4 py-3 text-center font-bold text-gray-800">
                  {deliveredThisWeek.reduce((s, d) => s + d.qty, 0).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-bold ${parseFloat(pct(on1Day.length + on2Days.length, deliveredThisWeek.length)) >= 90 ? 'text-green-600' : 'text-red-600'}`}>
                    {pct(on1Day.length + on2Days.length, deliveredThisWeek.length)}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* POD Pending Detail */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <i className="fas fa-file-signature text-orange-500"></i>
              POD ยังค้าง — ยังไม่ได้รับเอกสารคืน
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">รายการที่ยังไม่ได้สถานะ ส่งเสร็จ ในสัปดาห์นี้</p>
          </div>
          <span className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg font-bold text-sm">
            {podPendingCount} บิล ({podPendingPct}%)
          </span>
        </div>
        {podPending.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <i className="fas fa-check-circle text-4xl mb-2 text-green-400"></i>
            <p className="text-green-600 font-medium">ส่งเอกสารครบทุกบิลแล้ว ✓</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">เลขที่ใบส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">ผู้ส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">จังหวัด / อำเภอ</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">จำนวน</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">วันที่เปิดบิล</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">กำหนดส่ง</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {podPending.slice(0, 50).map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 font-mono font-bold text-gray-700">{d.orderNo}</td>
                    <td className="px-3 py-2 text-gray-600">{d.sender || <span className="text-gray-300">-</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{d.province ? `${d.province} / ` : ''}{d.district}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{d.qty % 1 === 0 ? d.qty : d.qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-500">{d.openDate || <span className="text-gray-300">-</span>}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-500">{d.planDate}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        d.deliveryStatus === DeliveryStatus.IN_TRANSIT ? 'bg-blue-100 text-blue-700' :
                        d.deliveryStatus === DeliveryStatus.DISTRIBUTING ? 'bg-purple-100 text-purple-700' :
                        d.deliveryStatus === DeliveryStatus.WAITING_DISTRIBUTE ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {d.deliveryStatus || 'รอจัด'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {podPending.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-3">
                แสดง 50 รายการแรก จากทั้งหมด {podPending.length} รายการ
              </p>
            )}
          </div>
        )}
      </div>

      {/* Over 2 days detail */}
      {over2Days.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border-l-4 border-red-400">
          <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
            <i className="fas fa-exclamation-triangle text-red-500"></i>
            รายการส่งช้าเกิน 2 วัน ({over2Days.length} Inv.)
          </h3>
          <p className="text-xs text-gray-400 mb-4">จำนวนสินค้ารวม {over2Days.reduce((s, d) => s + d.qty, 0).toFixed(2)} ชิ้น/กล่อง</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">เลขที่ใบส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">ผู้ส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase">จังหวัด / อำเภอ</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">จำนวน</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">วันที่เปิดบิล</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">กำหนดส่ง</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase">ช้ากี่วัน</th>
                </tr>
              </thead>
              <tbody>
                {over2Days.sort((a, b) => b.delayDays - a.delayDays).slice(0, 30).map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-red-50 transition-colors">
                    <td className="px-3 py-2 font-mono font-bold text-gray-700">{d.orderNo}</td>
                    <td className="px-3 py-2 text-gray-600">{d.sender || <span className="text-gray-300">-</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{d.province ? `${d.province} / ` : ''}{d.district}</td>
                    <td className="px-3 py-2 text-center">{d.qty % 1 === 0 ? d.qty : d.qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-500">{d.openDate || <span className="text-gray-300">-</span>}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-500">{d.planDate}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">+{d.delayDays} วัน</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
