import React, { useState, useMemo } from 'react';
import { DeliveryRecord, DeliveryStatus, KpiStatus, KpiConfig, StoreMapping } from '../types';
import { formatQty, formatNum } from '../utils/formatters';

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

// Export to CSV function
function exportToCSV(data: DeliveryRecord[], columns: { key: keyof DeliveryRecord | string; header: string; format?: (d: DeliveryRecord) => string }[], filename: string) {
  const headers = columns.map(c => c.header);
  const rows = data.map(d => columns.map(c => {
    if (c.format) return c.format(d);
    const val = d[c.key as keyof DeliveryRecord];
    return val !== undefined && val !== null ? String(val) : '';
  }));
  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
  const [podPendingPage, setPodPendingPage] = useState(1);
  const [over2DaysPage, setOver2DaysPage] = useState(1);
  const [podSearch, setPodSearch] = useState('');
  const [podProvince, setPodProvince] = useState('');
  const [podDistrict, setPodDistrict] = useState('');
  const [over2Search, setOver2Search] = useState('');
  const [over2Province, setOver2Province] = useState('');
  const [over2District, setOver2District] = useState('');
  const itemsPerPage = 50;

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

  // Get all unique provinces from kpiConfigs + deliveries (รวมจังหวัดที่ยังไม่มี KPI Config)
  const allProvinces = useMemo(() => {
    const fromKpi = kpiConfigs.filter(c => c.province).map(c => c.province);
    const fromDeliveries = deliveries.filter(d => d.province).map(d => d.province);
    return [...fromKpi, ...fromDeliveries]
      .filter((p, i, arr) => p && arr.indexOf(p) === i)
      .sort();
  }, [kpiConfigs, deliveries]);

  // Get available districts for a province from kpiConfigs + deliveries
  const getDistrictsForProvince = (province: string) => {
    const fromKpi = kpiConfigs
      .filter(c => c.province === province && c.district)
      .map(c => c.district);
    const fromDeliveries = deliveries
      .filter(d => d.province === province && d.district)
      .map(d => d.district);
    const districts = [...fromKpi, ...fromDeliveries]
      .filter((d, i, arr) => d && arr.indexOf(d) === i);
    // ถ้าไม่มี district → เพิ่ม "เมือง" เป็น default
    if (districts.length === 0 && province) {
      return ['เมือง'];
    }
    return districts;
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

    // If remember store is checked (default true), add store mappings
    if (rememberStore[displayKey] !== false && onAddStoreMapping && finalDistrict) {
      data.storeIds.forEach(storeId => {
        const trimmedStoreId = storeId.trim();
        if (!trimmedStoreId) return;
        onAddStoreMapping({
          storeId: trimmedStoreId,
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
        <td className="px-4 py-3 text-center font-bold text-gray-800">{formatNum(invCount)}</td>
        <td className="px-4 py-3 text-center text-gray-500">{formatQty(qtySum)}</td>
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
        {statCard('fa-file-invoice', 'text-indigo-600', 'bg-indigo-50', 'จำนวน Inv. ทั้งหมด', formatNum(totalInv), `${formatQty(totalQty)} ชิ้น/กล่อง`)}
        {statCard('fa-check-circle', 'text-green-600', 'bg-green-50', 'ส่งเสร็จ', formatNum(podDone), `${pct(podDone, totalInv)}% ของทั้งหมด`)}
        {statCard('fa-clock', 'text-orange-600', 'bg-orange-50', 'รอจัดส่ง', formatNum(podPendingCount), `${podPendingPct}% ของทั้งหมด`)}
        {statCard('fa-trophy', 'text-blue-600', 'bg-blue-50', 'KPI ผ่าน', `${pct(kpiPass, kpiTotal)}%`, `ผ่าน ${kpiPass} / ไม่ผ่าน ${kpiFail} (จาก ${kpiTotal} Inv.)`)}
      </div>

      {/* Branch Summary Table */}
      {branchSummary.length > 1 && (
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <i className="fas fa-code-branch text-indigo-500"></i>
              สรุปแยกตามสาขา
            </h3>
            <button 
              onClick={() => {
                const csvData = branchSummary.map(([branch, data]) => ({
                  สาขา: branch,
                  'Inv ทั้งหมด': data.total,
                  'ส่งเสร็จ': data.delivered,
                  'รอจัดส่ง': data.pending,
                  'KPI ผ่าน': data.kpiPass,
                  'KPI ไม่ผ่าน': data.kpiTotal - data.kpiPass,
                  'KPI %': data.kpiTotal > 0 ? ((data.kpiPass / data.kpiTotal) * 100).toFixed(1) : '0'
                }));
                const headers = Object.keys(csvData[0] || {});
                const rows = csvData.map(row => headers.map(h => row[h as keyof typeof row]));
                const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
                const BOM = '\uFEFF';
                const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `สรุปรายสาขา_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
            >
              <i className="fas fa-file-csv"></i> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">สาขา</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Inv. ทั้งหมด</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">ส่งเสร็จ</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">รอจัดส่ง</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">KPI ผ่าน</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map(([branch, data]) => {
                  const kpiPct = data.kpiTotal > 0 ? (data.kpiPass / data.kpiTotal) * 100 : 0;
                  return (
                    <tr key={branch} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{branch}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-600">{formatNum(data.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-green-600">{formatNum(data.delivered)}</span>
                        <span className="text-gray-400 text-xs ml-1">({pct(data.delivered, data.total)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-orange-600">{formatNum(data.pending)}</span>
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
                  <td className="px-4 py-3 text-center font-bold text-indigo-700">{formatNum(branchSummary.reduce((s, [_, d]) => s + d.total, 0))}</td>
                  <td className="px-4 py-3 text-center font-bold text-green-700">{formatNum(branchSummary.reduce((s, [_, d]) => s + d.delivered, 0))}</td>
                  <td className="px-4 py-3 text-center font-bold text-orange-700">{formatNum(branchSummary.reduce((s, [_, d]) => s + d.pending, 0))}</td>
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
                                const newProvince = e.target.value;
                                setSelectedProvinces(prev => ({ ...prev, [displayKey]: newProvince }));
                                // Auto-select first district (usually "เมือง") when province changes
                                const districts = getDistrictsForProvince(newProvince);
                                setSelectedDistricts(prev => ({ ...prev, [displayKey]: districts[0] || '' }));
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
                                checked={rememberStore[displayKey] !== false}
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
                <td className="px-4 py-3 text-center font-bold text-gray-800">{formatNum(deliveredThisWeek.length)}</td>
                <td className="px-4 py-3 text-center font-bold text-gray-800">
                  {formatQty(deliveredThisWeek.reduce((s, d) => s + d.qty, 0))}
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
              รอจัดส่ง — ยังไม่ได้ส่งสินค้า
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
        ) : (() => {
          // Get provinces and districts for filters
          const podProvinces = Array.from(new Set(podPending.map(d => d.province).filter(Boolean))).sort() as string[];
          const filteredByPodProv = podProvince ? podPending.filter(d => d.province === podProvince) : podPending;
          const podDistricts = Array.from(new Set(filteredByPodProv.map(d => d.district).filter(Boolean))).sort() as string[];
          
          // Apply filters
          const searchLower = podSearch.toLowerCase();
          let filteredPod = podPending;
          if (podProvince) filteredPod = filteredPod.filter(d => d.province === podProvince);
          if (podDistrict) filteredPod = filteredPod.filter(d => d.district === podDistrict);
          if (podSearch) filteredPod = filteredPod.filter(d => 
            d.orderNo.toLowerCase().includes(searchLower) || 
            (d.sender || '').toLowerCase().includes(searchLower) ||
            d.storeId.toLowerCase().includes(searchLower)
          );
          
          const paginatedPod = filteredPod.slice((podPendingPage - 1) * itemsPerPage, podPendingPage * itemsPerPage);
          
          return (
            <>
              {/* Filters */}
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <select value={podProvince} onChange={e => { setPodProvince(e.target.value); setPodDistrict(''); setPodPendingPage(1); }} title="เลือกจังหวัด" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white min-w-[160px]">
                    <option value="">ทุกจังหวัด</option>
                    {podProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={podDistrict} onChange={e => { setPodDistrict(e.target.value); setPodPendingPage(1); }} title="เลือกอำเภอ" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white min-w-[160px]">
                    <option value="">ทุกอำเภอ</option>
                    {podDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {(podSearch || podProvince || podDistrict) && (
                    <button onClick={() => { setPodSearch(''); setPodProvince(''); setPodDistrict(''); setPodPendingPage(1); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                      <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
                    </button>
                  )}
                </div>
                <div className="relative">
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input type="text" placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..." value={podSearch} onChange={e => { setPodSearch(e.target.value); setPodPendingPage(1); }} className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white" />
                  {podSearch && <button onClick={() => { setPodSearch(''); setPodPendingPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="ล้างการค้นหา"><i className="fas fa-times"></i></button>}
                </div>
              </div>
              
              <div className="flex justify-between items-center mb-2">
                <button 
                  onClick={() => exportToCSV(filteredPod, [
                    { key: 'orderNo', header: 'เลขที่ใบส่ง' },
                    { key: 'sender', header: 'ผู้ส่ง' },
                    { key: 'storeId', header: 'ร้านค้า' },
                    { key: 'province', header: 'จังหวัด' },
                    { key: 'district', header: 'อำเภอ' },
                    { key: 'qty', header: 'จำนวน' },
                    { key: 'openDate', header: 'วันที่เปิดบิล' },
                    { key: 'planDate', header: 'กำหนดส่ง' },
                    { key: 'deliveryStatus', header: 'สถานะ' }
                  ], 'POD_ยังค้าง')}
                  className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
                >
                  <i className="fas fa-file-csv"></i> Export CSV
                </button>
                <span className="text-xs text-gray-500">
                  แสดง {filteredPod.length > 0 ? ((podPendingPage - 1) * itemsPerPage) + 1 : 0}-{Math.min(podPendingPage * itemsPerPage, filteredPod.length)} จาก {filteredPod.length}
                </span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">เลขที่ใบส่ง</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">ผู้ส่ง</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">จังหวัด / อำเภอ</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">จำนวน</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">วันที่เปิดบิล</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPod.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-gray-700">{d.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{d.sender || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{d.province ? `${d.province} / ` : ''}{d.district}</td>
                      <td className="px-3 py-2 text-center text-gray-700">{formatQty(d.qty)}</td>
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
            </div>
            {Math.ceil(podPending.length / itemsPerPage) > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setPodPendingPage(p => Math.max(1, p - 1))} disabled={podPendingPage === 1} className="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  <i className="fas fa-chevron-left mr-1"></i>ก่อนหน้า
                </button>
                <span className="text-sm text-orange-700">หน้า {podPendingPage} / {Math.ceil(podPending.length / itemsPerPage)}</span>
                <button onClick={() => setPodPendingPage(p => Math.min(Math.ceil(podPending.length / itemsPerPage), p + 1))} disabled={podPendingPage === Math.ceil(podPending.length / itemsPerPage)} className="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  ถัดไป<i className="fas fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
            </>
          );
        })()}
      </div>

      {/* Over 2 days detail */}
      {over2Days.length > 0 && (() => {
        // Get provinces and districts for filters
        const over2Provinces = Array.from(new Set(over2Days.map(d => d.province).filter(Boolean))).sort() as string[];
        const filteredByOver2Prov = over2Province ? over2Days.filter(d => d.province === over2Province) : over2Days;
        const over2Districts = Array.from(new Set(filteredByOver2Prov.map(d => d.district).filter(Boolean))).sort() as string[];
        
        // Apply filters
        const searchLower = over2Search.toLowerCase();
        let filteredOver2 = over2Days;
        if (over2Province) filteredOver2 = filteredOver2.filter(d => d.province === over2Province);
        if (over2District) filteredOver2 = filteredOver2.filter(d => d.district === over2District);
        if (over2Search) filteredOver2 = filteredOver2.filter(d => 
          d.orderNo.toLowerCase().includes(searchLower) || 
          (d.sender || '').toLowerCase().includes(searchLower) ||
          d.storeId.toLowerCase().includes(searchLower)
        );
        
        const sortedOver2Days = [...filteredOver2].sort((a, b) => b.delayDays - a.delayDays);
        const totalOver2DaysPages = Math.ceil(sortedOver2Days.length / itemsPerPage);
        const paginatedOver2 = sortedOver2Days.slice((over2DaysPage - 1) * itemsPerPage, over2DaysPage * itemsPerPage);
        
        return (
          <div className="glass-panel p-6 rounded-2xl border-l-4 border-red-400">
            <h3 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <i className="fas fa-exclamation-triangle text-red-500"></i>
              รายการส่งช้าเกิน 2 วัน ({filteredOver2.length} Inv.)
            </h3>
            <p className="text-xs text-gray-400 mb-4">จำนวนสินค้ารวม {formatQty(filteredOver2.reduce((s, d) => s + d.qty, 0))} ชิ้น/กล่อง</p>
            
            {/* Filters */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <select value={over2Province} onChange={e => { setOver2Province(e.target.value); setOver2District(''); setOver2DaysPage(1); }} title="เลือกจังหวัด" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกจังหวัด</option>
                  {over2Provinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={over2District} onChange={e => { setOver2District(e.target.value); setOver2DaysPage(1); }} title="เลือกอำเภอ" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกอำเภอ</option>
                  {over2Districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {(over2Search || over2Province || over2District) && (
                  <button onClick={() => { setOver2Search(''); setOver2Province(''); setOver2District(''); setOver2DaysPage(1); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
                  </button>
                )}
              </div>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..." value={over2Search} onChange={e => { setOver2Search(e.target.value); setOver2DaysPage(1); }} className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white" />
                {over2Search && <button onClick={() => { setOver2Search(''); setOver2DaysPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="ล้างการค้นหา"><i className="fas fa-times"></i></button>}
              </div>
            </div>
            
            <div className="flex justify-end mb-2">
              <span className="text-xs text-gray-500">
                แสดง {sortedOver2Days.length > 0 ? ((over2DaysPage - 1) * itemsPerPage) + 1 : 0}-{Math.min(over2DaysPage * itemsPerPage, sortedOver2Days.length)} จาก {sortedOver2Days.length}
              </span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">เลขที่ใบส่ง</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">ผู้ส่ง</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase bg-white">จังหวัด / อำเภอ</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">จำนวน</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">วันที่เปิดบิล</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-semibold uppercase bg-white">ช้ากี่วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOver2.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-red-50 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-gray-700">{d.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{d.sender || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{d.province ? `${d.province} / ` : ''}{d.district}</td>
                      <td className="px-3 py-2 text-center">{formatQty(d.qty)}</td>
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
            {totalOver2DaysPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setOver2DaysPage(p => Math.max(1, p - 1))} disabled={over2DaysPage === 1} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  <i className="fas fa-chevron-left mr-1"></i>ก่อนหน้า
                </button>
                <span className="text-sm text-red-700">หน้า {over2DaysPage} / {totalOver2DaysPages}</span>
                <button onClick={() => setOver2DaysPage(p => Math.min(totalOver2DaysPages, p + 1))} disabled={over2DaysPage === totalOver2DaysPages} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  ถัดไป<i className="fas fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
