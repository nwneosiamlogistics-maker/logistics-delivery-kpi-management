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
  const [returnedPage, setReturnedPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const itemsPerPage = 50;

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
      {weekReturnedDocs.length > 0 && (() => {
        // Get provinces and districts for filters
        const allProvinces = Array.from(new Set(weekReturnedDocs.map(d => d.province).filter(Boolean))).sort() as string[];
        const filteredByProv = filterProvince ? weekReturnedDocs.filter(d => d.province === filterProvince) : weekReturnedDocs;
        const allDistricts = Array.from(new Set(filteredByProv.map(d => d.district).filter(Boolean))).sort() as string[];
        
        // Apply filters
        const searchLower = filterSearch.toLowerCase();
        let filteredDocs = weekReturnedDocs;
        if (filterProvince) filteredDocs = filteredDocs.filter(d => d.province === filterProvince);
        if (filterDistrict) filteredDocs = filteredDocs.filter(d => d.district === filterDistrict);
        if (filterSearch) filteredDocs = filteredDocs.filter(d => 
          d.orderNo.toLowerCase().includes(searchLower) || 
          (d.sender || '').toLowerCase().includes(searchLower) ||
          d.storeId.toLowerCase().includes(searchLower)
        );
        
        const paginatedDocs = filteredDocs.slice((returnedPage - 1) * itemsPerPage, returnedPage * itemsPerPage);
        const totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
        
        return (
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-check-double text-green-500"></i>
              ส่งเอกสารคืนแล้ว ({filteredDocs.length} รายการ)
            </h3>
            
            {/* Filters */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <select value={filterProvince} onChange={e => { setFilterProvince(e.target.value); setFilterDistrict(''); setReturnedPage(1); }} title="เลือกจังหวัด" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกจังหวัด</option>
                  {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filterDistrict} onChange={e => { setFilterDistrict(e.target.value); setReturnedPage(1); }} title="เลือกอำเภอ" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกอำเภอ</option>
                  {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {(filterSearch || filterProvince || filterDistrict) && (
                  <button onClick={() => { setFilterSearch(''); setFilterProvince(''); setFilterDistrict(''); setReturnedPage(1); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
                  </button>
                )}
              </div>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..." value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setReturnedPage(1); }} className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white" />
                {filterSearch && <button onClick={() => { setFilterSearch(''); setReturnedPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="ล้างการค้นหา"><i className="fas fa-times"></i></button>}
              </div>
            </div>
            
            <div className="flex justify-end mb-2">
              <span className="text-xs text-gray-500">
                แสดง {filteredDocs.length > 0 ? ((returnedPage - 1) * itemsPerPage) + 1 : 0}-{Math.min(returnedPage * itemsPerPage, filteredDocs.length)} จาก {filteredDocs.length}
              </span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">เลขที่เอกสาร</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">ร้านค้า</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">ผู้ส่ง</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">สาขา</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">จังหวัด/อำเภอ</th>
                    <th className="px-3 py-2 text-right text-gray-600 bg-white">จำนวน</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">วันที่เปิดบิล</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">วันที่ส่งเสร็จ</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">วันคืนบิล</th>
                    <th className="px-3 py-2 text-left text-gray-600 bg-white">วันที่บันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDocs.map(doc => (
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
                    <td className="px-3 py-2 text-gray-600">{doc.documentReturnBillDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.documentReturnedDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Math.ceil(weekReturnedDocs.length / itemsPerPage) > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setReturnedPage(p => Math.max(1, p - 1))} disabled={returnedPage === 1} className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed">
                <i className="fas fa-chevron-left mr-1"></i>ก่อนหน้า
              </button>
              <span className="text-sm text-green-700">หน้า {returnedPage} / {Math.ceil(weekReturnedDocs.length / itemsPerPage)}</span>
              <button onClick={() => setReturnedPage(p => Math.min(Math.ceil(weekReturnedDocs.length / itemsPerPage), p + 1))} disabled={returnedPage === Math.ceil(weekReturnedDocs.length / itemsPerPage)} className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed">
                ถัดไป<i className="fas fa-chevron-right ml-1"></i>
              </button>
            </div>
          )}
          </div>
        );
      })()}

      {/* Pending Documents */}
      {pendingDocs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <i className="fas fa-exclamation-triangle text-amber-500"></i>
              รายการค้างส่งเอกสาร ({pendingDocs.length} รายการ)
            </h3>
            <span className="text-xs text-gray-500">
              แสดง {((pendingPage - 1) * itemsPerPage) + 1}-{Math.min(pendingPage * itemsPerPage, pendingDocs.length)} จาก {pendingDocs.length}
            </span>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">สาขา</th>
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">พื้นที่</th>
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">วันที่ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-left text-gray-600 bg-white">ค้างมา</th>
                </tr>
              </thead>
              <tbody>
                {pendingDocs.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage).map(doc => {
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
          </div>
          {Math.ceil(pendingDocs.length / itemsPerPage) > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed">
                <i className="fas fa-chevron-left mr-1"></i>ก่อนหน้า
              </button>
              <span className="text-sm text-amber-700">หน้า {pendingPage} / {Math.ceil(pendingDocs.length / itemsPerPage)}</span>
              <button onClick={() => setPendingPage(p => Math.min(Math.ceil(pendingDocs.length / itemsPerPage), p + 1))} disabled={pendingPage === Math.ceil(pendingDocs.length / itemsPerPage)} className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed">
                ถัดไป<i className="fas fa-chevron-right ml-1"></i>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
