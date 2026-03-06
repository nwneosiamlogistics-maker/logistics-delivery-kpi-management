import React, { useState, useMemo } from 'react';
import { DeliveryRecord, KpiConfig } from '../types';

interface DocumentReturnReportProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
}

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function getWeekRange(offset: number = 0): { start: Date; end: Date; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();
  const diffToSunday = dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - diffToSunday + offset * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return { start: sunday, end: saturday, label: `${fmt(sunday)} - ${fmt(saturday)}` };
}

export const DocumentReturnReport: React.FC<DocumentReturnReportProps> = ({ deliveries, kpiConfigs = [] }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [branchFilter, setBranchFilter] = useState<string>('All');

  const { start, end, label } = getWeekRange(weekOffset);

  // Build district → branch map
  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  // All unique branches
  const allBranches = useMemo(() => {
    const set = new Set<string>();
    kpiConfigs.forEach(c => { if (c.branch) set.add(c.branch); });
    return Array.from(set).sort();
  }, [kpiConfigs]);

  // Get branch for a delivery
  const getBranch = (d: DeliveryRecord): string => {
    const key = `${d.province || ''}||${d.district}`;
    const keyNoProvince = `||${d.district}`;
    return districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince) || 'ไม่ระบุสาขา';
  };

  // Week deliveries (delivered only)
  const weekDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      if (d.deliveryStatus !== 'ส่งเสร็จ') return false;
      if (!d.actualDate) return false;
      const checkDate = parseLocalDate(d.actualDate);
      if (!checkDate) return false;
      if (!(checkDate >= start && checkDate <= end)) return false;
      if (branchFilter !== 'All' && getBranch(d) !== branchFilter) return false;
      return true;
    });
  }, [deliveries, start, end, branchFilter, districtBranchMap]);

  // Week returned docs (regardless of deliveryStatus)
  const weekReturnedDocs = useMemo(() => {
    return deliveries.filter(d => {
      if (!d.documentReturned) return false;
      const dateToUse = d.actualDate || d.openDate || d.planDate;
      const checkDate = parseLocalDate(dateToUse || '');
      if (!checkDate) return false;
      if (!(checkDate >= start && checkDate <= end)) return false;
      if (branchFilter !== 'All' && getBranch(d) !== branchFilter) return false;
      return true;
    });
  }, [deliveries, start, end, branchFilter, districtBranchMap]);

  // Stats
  const stats = useMemo(() => {
    const total = weekDeliveries.length;
    const returned = weekReturnedDocs.length;
    const pending = total - returned;
    const percentage = total > 0 ? ((returned / total) * 100).toFixed(1) : '0.0';
    return { total, returned, pending, percentage };
  }, [weekDeliveries, weekReturnedDocs]);

  // Pending docs
  const pendingDocs = useMemo(() => {
    return weekDeliveries
      .filter(d => !d.documentReturned)
      .sort((a, b) => {
        const dateA = parseLocalDate(a.actualDate!);
        const dateB = parseLocalDate(b.actualDate!);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
      });
  }, [weekDeliveries]);

  // Branch summary
  const branchSummary = useMemo(() => {
    const summary = new Map<string, { total: number; returned: number; pending: number }>();
    
    // Count total from weekDeliveries
    weekDeliveries.forEach(d => {
      const branch = getBranch(d);
      const existing = summary.get(branch) || { total: 0, returned: 0, pending: 0 };
      existing.total++;
      if (d.documentReturned) existing.returned++;
      else existing.pending++;
      summary.set(branch, existing);
    });

    return Array.from(summary.entries())
      .map(([branch, data]) => ({
        branch,
        ...data,
        percentage: data.total > 0 ? ((data.returned / data.total) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.total - a.total);
  }, [weekDeliveries, districtBranchMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-chart-pie text-indigo-500"></i>
            รายงานส่งเอกสารคืนประจำสัปดาห์
          </h2>
          <p className="text-sm text-gray-500 mt-1">สรุปสถานะการส่งเอกสารคืน แยกตามสาขา</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Branch filter */}
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            aria-label="เลือกสาขา"
          >
            <option value="All">ทุกสาขา</option>
            {allBranches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {/* Week navigation */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 shadow-sm">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="สัปดาห์ก่อน">
              <i className="fas fa-chevron-left text-gray-600"></i>
            </button>
            <span className="font-medium text-gray-700 min-w-[140px] text-center">{label}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30" aria-label="สัปดาห์ถัดไป">
              <i className="fas fa-chevron-right text-gray-600"></i>
            </button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="ml-2 px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200">
                สัปดาห์นี้
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><i className="fas fa-file-invoice text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ส่งเสร็จทั้งหมด</p><p className="text-2xl font-bold text-gray-800">{stats.total}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><i className="fas fa-check-circle text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ส่งเอกสารคืนแล้ว</p><p className="text-2xl font-bold text-green-600">{stats.returned}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><i className="fas fa-clock text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ค้างส่ง</p><p className="text-2xl font-bold text-amber-600">{stats.pending}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl"><i className="fas fa-percentage text-lg"></i></div>
            <div><p className="text-xs text-gray-500">% สำเร็จ</p><p className="text-2xl font-bold text-indigo-600">{stats.percentage}%</p></div>
          </div>
        </div>
      </div>

      {/* Branch Summary Table */}
      {branchFilter === 'All' && branchSummary.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-sitemap text-indigo-500"></i>
            สรุปตามสาขา
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600">สาขา</th>
                  <th className="px-3 py-2 text-right text-gray-600">ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-right text-gray-600">ส่งคืนแล้ว</th>
                  <th className="px-3 py-2 text-right text-gray-600">ค้างส่ง</th>
                  <th className="px-3 py-2 text-right text-gray-600">% สำเร็จ</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map(row => (
                  <tr key={row.branch} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setBranchFilter(row.branch)}>
                    <td className="px-3 py-2 font-medium text-gray-800">{row.branch}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.total}</td>
                    <td className="px-3 py-2 text-right text-green-600 font-medium">{row.returned}</td>
                    <td className="px-3 py-2 text-right text-amber-600 font-medium">{row.pending}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        parseFloat(row.percentage) >= 80 ? 'bg-green-100 text-green-700' :
                        parseFloat(row.percentage) >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {row.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Returned Documents */}
      {weekReturnedDocs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-check-double text-green-500"></i>
            ส่งเอกสารคืนแล้ว ({weekReturnedDocs.length} รายการ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-gray-600">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-gray-600">ผู้ส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-600">สาขา</th>
                  <th className="px-3 py-2 text-left text-gray-600">จังหวัด/อำเภอ</th>
                  <th className="px-3 py-2 text-right text-gray-600">จำนวน</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่เปิดบิล</th>
                  <th className="px-3 py-2 text-left text-gray-600">กำหนดส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {weekReturnedDocs.slice(0, 50).map(doc => (
                  <tr key={doc.orderNo} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.sender || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{getBranch(doc)}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.province || ''}{doc.province && doc.district ? ' / ' : ''}{doc.district || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{doc.qty || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.openDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.planDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.actualDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.documentReturnedDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {weekReturnedDocs.length > 50 && <p className="text-center text-gray-500 text-sm py-2">แสดง 50 รายการแรก จากทั้งหมด {weekReturnedDocs.length} รายการ</p>}
          </div>
        </div>
      )}

      {/* Pending Documents */}
      {pendingDocs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-exclamation-triangle text-amber-500"></i>
            รายการค้างส่งเอกสาร ({pendingDocs.length} รายการ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-gray-600">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-gray-600">สาขา</th>
                  <th className="px-3 py-2 text-left text-gray-600">พื้นที่</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-left text-gray-600">ค้างมา</th>
                </tr>
              </thead>
              <tbody>
                {pendingDocs.slice(0, 50).map(doc => {
                  const deliveredDate = parseLocalDate(doc.actualDate!);
                  const today = new Date();
                  const daysAgo = deliveredDate ? Math.floor((today.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  return (
                    <tr key={doc.orderNo} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                      <td className="px-3 py-2 text-gray-600">{getBranch(doc)}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.district}, {doc.province}</td>
                      <td className="px-3 py-2 text-gray-600">{deliveredDate?.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${daysAgo > 7 ? 'bg-red-100 text-red-700' : daysAgo > 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{daysAgo} วัน</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pendingDocs.length > 50 && <p className="text-center text-gray-500 text-sm py-2">แสดง 50 รายการแรก จากทั้งหมด {pendingDocs.length} รายการ</p>}
          </div>
        </div>
      )}
    </div>
  );
};
