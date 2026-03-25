import React, { useState, useMemo } from 'react';
import { DeliveryRecord, KpiStatus, KpiConfig, DeliveryStatus } from '../types';
import { formatNum } from '../utils/formatters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

interface KpiDashboardProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
}

type RangeMode = 'custom' | 'week' | 'month' | 'year';

function getWeekRange(offset = 0): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay();
  const sun = new Date(today);
  sun.setDate(today.getDate() - day - offset * 7);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  return { start: sun.toISOString().split('T')[0], end: sat.toISOString().split('T')[0] };
}

function getMonthRange(offset = 0): { start: string; end: string } {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: d.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

function getYearRange(offset = 0): { start: string; end: string } {
  const y = new Date().getFullYear() - offset;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

const COLORS = ['#EF4444','#F97316','#F59E0B','#EAB308','#84CC16','#10B981','#3B82F6','#8B5CF6','#EC4899','#6B7280'];

export const KpiDashboard: React.FC<KpiDashboardProps> = ({ deliveries, kpiConfigs = [] }) => {
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [offset, setOffset] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [delayedPage, setDelayedPage] = useState(1);
  const [delayedSearch, setDelayedSearch] = useState('');
  const [delayedTab, setDelayedTab] = useState<'delivered' | 'pending'>('delivered');
  const delayedPerPage = 50;

  const { start, end } = useMemo(() => {
    if (rangeMode === 'custom') return { start: customStart, end: customEnd };
    if (rangeMode === 'week') return getWeekRange(offset);
    if (rangeMode === 'month') return getMonthRange(offset);
    return getYearRange(offset);
  }, [rangeMode, offset, customStart, customEnd]);

  const rangeLabel = useMemo(() => {
    if (rangeMode === 'custom') return `${start} – ${end}`;
    if (rangeMode === 'week') { const r = getWeekRange(offset); return `สัปดาห์ ${r.start} – ${r.end}`; }
    if (rangeMode === 'month') {
      const d = new Date(); d.setMonth(d.getMonth() - offset);
      return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    }
    return `ปี ${new Date().getFullYear() - offset}`;
  }, [rangeMode, offset, start, end]);

  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    kpiConfigs.forEach(c => { if (c.branch) s.add(c.branch); });
    return Array.from(s).sort();
  }, [kpiConfigs]);

  const getBranch = (d: DeliveryRecord) => {
    const key = `${d.province || ''}||${d.district}`;
    return districtBranchMap.get(key) || districtBranchMap.get(`||${d.district}`) || '';
  };

  const filtered = useMemo(() => deliveries.filter(d => {
    if (d.kpiStatus !== KpiStatus.NOT_PASS) return false;
    const dateRef = d.actualDate || d.planDate || d.openDate;
    if (!dateRef) return false;
    if (start && dateRef < start) return false;
    if (end && dateRef > end) return false;
    if (filterProvince && d.province !== filterProvince) return false;
    if (filterDistrict && d.district !== filterDistrict) return false;
    if (filterBranch && getBranch(d) !== filterBranch) return false;
    return true;
  }), [deliveries, start, end, filterProvince, filterDistrict, filterBranch, districtBranchMap]);

  const provinces = useMemo(() =>
    [...new Set(deliveries.map(d => d.province).filter(Boolean))].sort() as string[], [deliveries]);

  const districts = useMemo(() => {
    const src = filterProvince ? deliveries.filter(d => d.province === filterProvince) : deliveries;
    return [...new Set(src.map(d => d.district).filter(Boolean))].sort();
  }, [deliveries, filterProvince]);

  // แยกรายการล่าช้าเป็น 2 กลุ่ม: สำเร็จ/ตีกลับ (สถานะสุดท้าย) และ ยังไม่ส่ง
  const { deliveredDelayed, pendingDelayed } = useMemo(() => {
    const delivered = filtered.filter(d => d.deliveryStatus === DeliveryStatus.DELIVERED || d.deliveryStatus === DeliveryStatus.RETURNED);
    const pending = filtered.filter(d => d.deliveryStatus !== DeliveryStatus.DELIVERED && d.deliveryStatus !== DeliveryStatus.RETURNED);
    return {
      deliveredDelayed: delivered.sort((a, b) => b.delayDays - a.delayDays),
      pendingDelayed: pending.sort((a, b) => b.delayDays - a.delayDays)
    };
  }, [filtered]);

  const allDelayed = useMemo(() => {
    const source = delayedTab === 'delivered' ? deliveredDelayed : pendingDelayed;
    let result = [...source];
    if (delayedSearch) {
      const searchLower = delayedSearch.toLowerCase();
      result = result.filter(d => 
        d.orderNo.toLowerCase().includes(searchLower) ||
        (d.sender || '').toLowerCase().includes(searchLower) ||
        d.storeId.toLowerCase().includes(searchLower)
      );
    }
    return result;
  }, [delayedTab, deliveredDelayed, pendingDelayed, delayedSearch]);
  const delayedTotalPages = Math.ceil(allDelayed.length / delayedPerPage);
  const paginatedDelayed = useMemo(() => {
    const startIdx = (delayedPage - 1) * delayedPerPage;
    return allDelayed.slice(startIdx, startIdx + delayedPerPage);
  }, [allDelayed, delayedPage]);

  const byDistrict = useMemo(() => {
    const map = new Map<string, { count: number; totalDelay: number }>();
    filtered.forEach(d => {
      const key = `${d.province ? d.province + ' / ' : ''}${d.district}`;
      const cur = map.get(key) || { count: 0, totalDelay: 0 };
      map.set(key, { count: cur.count + 1, totalDelay: cur.totalDelay + d.delayDays });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgDelay: +(v.totalDelay / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const byProvince = useMemo(() => {
    const map = new Map<string, { count: number; totalDelay: number }>();
    filtered.forEach(d => {
      const key = d.province || 'ไม่ระบุ';
      const cur = map.get(key) || { count: 0, totalDelay: 0 };
      map.set(key, { count: cur.count + 1, totalDelay: cur.totalDelay + d.delayDays });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgDelay: +(v.totalDelay / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const bySender = useMemo(() => {
    const map = new Map<string, { count: number; totalDelay: number }>();
    filtered.forEach(d => {
      const key = d.sender || 'ไม่ระบุ';
      const cur = map.get(key) || { count: 0, totalDelay: 0 };
      map.set(key, { count: cur.count + 1, totalDelay: cur.totalDelay + d.delayDays });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgDelay: +(v.totalDelay / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const byStore = useMemo(() => {
    const map = new Map<string, { count: number; totalDelay: number }>();
    filtered.forEach(d => {
      const key = d.storeId || 'ไม่ระบุ';
      const cur = map.get(key) || { count: 0, totalDelay: 0 };
      map.set(key, { count: cur.count + 1, totalDelay: cur.totalDelay + d.delayDays });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgDelay: +(v.totalDelay / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const totalDelay = filtered.reduce((s, d) => s + d.delayDays, 0);
  const avgDelay = filtered.length > 0 ? (totalDelay / filtered.length).toFixed(1) : '0';
  const maxDelay = filtered.length > 0 ? Math.max(...filtered.map(d => d.delayDays)) : 0;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header + Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <i className="fas fa-chart-bar text-red-500"></i>
            KPI Dashboard — รายการเกินกำหนด
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['week','month','year','custom'] as RangeMode[]).map(m => (
            <button key={m} onClick={() => { setRangeMode(m); setOffset(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${rangeMode === m ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m === 'week' ? 'สัปดาห์' : m === 'month' ? 'เดือน' : m === 'year' ? 'ปี' : 'กำหนดเอง'}
            </button>
          ))}
          {rangeMode !== 'custom' && (
            <div className="flex items-center gap-1 ml-1">
              <button title="ย้อนกลับ" onClick={() => setOffset(o => o + 1)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center">
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <button title="ถัดไป" onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-40">
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
            </div>
          )}
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" title="วันที่เริ่มต้น" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="date" title="วันที่สิ้นสุด" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap gap-3 items-center">
        <span className="text-sm text-gray-400 flex items-center gap-1.5">
          <i className="fas fa-filter text-xs"></i> กรองตาม:
        </span>
        <select title="กรองตามสาขา" value={filterBranch}
          onChange={e => { setFilterBranch(e.target.value); setFilterProvince(''); setFilterDistrict(''); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white">
          <option value="">ทุกสาขา</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select title="กรองตามจังหวัด" value={filterProvince}
          onChange={e => { setFilterProvince(e.target.value); setFilterDistrict(''); setFilterBranch(''); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white">
          <option value="">ทุกจังหวัด</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select title="กรองตามอำเภอ" value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white">
          <option value="">ทุกอำเภอ</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(filterProvince || filterDistrict || filterBranch) && (
          <button onClick={() => { setFilterProvince(''); setFilterDistrict(''); setFilterBranch(''); }}
            className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
            <i className="fas fa-times text-xs"></i> ล้างตัวกรอง
          </button>
        )}
        <span className="ml-auto text-sm font-semibold text-gray-600">{formatNum(filtered.length)} รายการ</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: 'fa-times-circle', color: 'text-red-500', bg: 'bg-red-50', label: 'KPI ไม่ผ่านทั้งหมด', value: formatNum(filtered.length), sub: 'Inv.' },
          { icon: 'fa-clock', color: 'text-orange-500', bg: 'bg-orange-50', label: 'ล่าช้าเฉลี่ย', value: avgDelay, sub: 'วัน / Inv.' },
          { icon: 'fa-exclamation-circle', color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'ล่าช้าสูงสุด', value: maxDelay.toString(), sub: 'วัน' },
          { icon: 'fa-calendar-times', color: 'text-purple-500', bg: 'bg-purple-50', label: 'รวมวันที่ล่าช้า', value: formatNum(totalDelay), sub: 'วัน' },
        ].map((c, i) => (
          <div key={i} className="glass-panel p-4 rounded-2xl flex items-center gap-4">
            <div className={`${c.bg} ${c.color} w-12 h-12 rounded-xl flex items-center justify-center shrink-0`}>
              <i className={`fas ${c.icon} text-xl`}></i>
            </div>
            <div>
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center">
          <i className="fas fa-check-circle text-5xl text-green-400 mb-3 block"></i>
          <p className="text-green-600 font-semibold text-lg">ไม่มีรายการ KPI ไม่ผ่านในช่วงเวลานี้</p>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-flag text-blue-400"></i>
                Top 10 จังหวัด — KPI ไม่ผ่านมากที่สุด
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byProvince} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: any, name?: string) => [val, name === 'count' ? 'Inv.' : 'เฉลี่ย (วัน)']}
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" name="count" radius={[0, 6, 6, 0]}>
                    {byProvince.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-map-marker-alt text-red-400"></i>
                Top 10 อำเภอ — KPI ไม่ผ่านมากที่สุด
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byDistrict} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: any, name?: string) => [val, name === 'count' ? 'Inv.' : 'เฉลี่ย (วัน)']}
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" name="count" radius={[0, 6, 6, 0]}>
                    {byDistrict.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-truck text-orange-400"></i>
                Top 10 ผู้ส่ง — KPI ไม่ผ่านมากที่สุด
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={bySender} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: any, name?: string) => [val, name === 'count' ? 'Inv.' : 'เฉลี่ย (วัน)']}
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" name="count" radius={[0, 6, 6, 0]}>
                    {bySender.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-store text-pink-400"></i>
                Top 10 ร้านค้า — KPI ไม่ผ่านมากที่สุด
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byStore} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: any, name?: string) => [val, name === 'count' ? 'Inv.' : 'เฉลี่ย (วัน)']}
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" name="count" radius={[0, 6, 6, 0]}>
                    {byStore.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Delayed Table with Pagination */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <i className="fas fa-list-ol text-red-400"></i>
                  รายการล่าช้าทั้งหมด (เรียงจากล่าช้ามากที่สุด)
                </h3>
                <span className="text-xs text-gray-400">
                  แสดง {allDelayed.length > 0 ? ((delayedPage - 1) * delayedPerPage) + 1 : 0}-{Math.min(delayedPage * delayedPerPage, allDelayed.length)} จาก {formatNum(allDelayed.length)} รายการ
                </span>
              </div>
              {/* Tab UI */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setDelayedTab('delivered'); setDelayedPage(1); }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    delayedTab === 'delivered'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <i className="fas fa-check-circle"></i>
                  ส่งเสร็จแล้ว ({formatNum(deliveredDelayed.length)})
                </button>
                <button
                  onClick={() => { setDelayedTab('pending'); setDelayedPage(1); }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    delayedTab === 'pending'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <i className="fas fa-clock"></i>
                  ยังไม่ส่ง ({formatNum(pendingDelayed.length)})
                </button>
              </div>
              {/* Search */}
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" placeholder="ค้นหาด้วยเลขที่ใบสั่ง, ผู้ส่ง, หรือร้านค้า..." value={delayedSearch} onChange={e => { setDelayedSearch(e.target.value); setDelayedPage(1); }} className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white" />
                {delayedSearch && <button onClick={() => { setDelayedSearch(''); setDelayedPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="ล้างการค้นหา"><i className="fas fa-times"></i></button>}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'auto', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 text-xs text-gray-500 uppercase border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left bg-gray-50">#</th>
                    <th className="px-4 py-3 text-left bg-gray-50">เลขที่ใบสั่ง</th>
                    <th className="px-4 py-3 text-left bg-gray-50">ผู้ส่ง</th>
                    <th className="px-4 py-3 text-left bg-gray-50">จังหวัด / อำเภอ</th>
                    <th className="px-4 py-3 text-center bg-gray-50">วันที่เปิดบิล</th>
                    <th className="px-4 py-3 text-center bg-gray-50">กำหนดส่ง</th>
                    <th className="px-4 py-3 text-center bg-gray-50">ส่งจริง</th>
                    <th className="px-4 py-3 text-center bg-gray-50">ล่าช้า</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDelayed.map((d, i) => (
                    <tr key={d.orderNo} className="border-b border-gray-50 hover:bg-red-50/40 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-bold text-xs">{(delayedPage - 1) * delayedPerPage + i + 1}</td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-800 text-xs">{d.orderNo}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{d.sender || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{d.province ? `${d.province} / ` : ''}{d.district}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-gray-500">{d.openDate || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-gray-500">{d.planDate || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-gray-500">{d.actualDate || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          d.delayDays >= 7 ? 'bg-red-100 text-red-700' :
                          d.delayDays >= 4 ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>+{d.delayDays} วัน</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            {delayedTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => setDelayedPage(p => Math.max(1, p - 1))}
                  disabled={delayedPage === 1}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-chevron-left mr-1"></i>ก่อนหน้า
                </button>
                <div className="flex items-center gap-3">
                  {/* ปุ่มไปหน้าแรก */}
                  <button
                    onClick={() => setDelayedPage(1)}
                    disabled={delayedPage === 1}
                    className="w-8 h-8 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ไปหน้าแรก"
                  >
                    <i className="fas fa-angle-double-left"></i>
                  </button>
                  {/* แสดงหน้าปัจจุบัน */}
                  <span className="text-sm font-medium text-gray-700">
                    หน้า <span className="text-red-600 font-bold">{delayedPage}</span> / {delayedTotalPages}
                  </span>
                  {/* ปุ่มไปหน้าสุดท้าย */}
                  <button
                    onClick={() => setDelayedPage(delayedTotalPages)}
                    disabled={delayedPage === delayedTotalPages}
                    className="w-8 h-8 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ไปหน้าสุดท้าย"
                  >
                    <i className="fas fa-angle-double-right"></i>
                  </button>
                </div>
                <button
                  onClick={() => setDelayedPage(p => Math.min(delayedTotalPages, p + 1))}
                  disabled={delayedPage === delayedTotalPages}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ถัดไป<i className="fas fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
