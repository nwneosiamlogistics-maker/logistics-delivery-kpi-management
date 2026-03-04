import React, { useState, useMemo } from 'react';
import { DeliveryRecord, KpiConfig } from '../types';

interface DeliveryTrackerProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
}

const STATUS_TABS = [
  {
    key: 'รอจัด',
    label: 'รอจัด',
    description: 'ของอยู่ต้นทาง / นำข้อมูลเข้าระบบ',
    icon: 'fa-box',
    color: 'gray',
    bgClass: 'bg-gray-100 text-gray-700 border-gray-200',
    activeClass: 'bg-gray-600 text-white border-gray-600',
    badgeClass: 'bg-gray-500',
    rowClass: 'hover:bg-gray-50',
    urgentClass: 'bg-red-50 border-l-4 border-red-400',
  },
  {
    key: 'ขนส่ง',
    label: 'ขนส่ง',
    description: 'ของอยู่บนรถใหญ่ → ถึงสาขาปลายทาง',
    icon: 'fa-truck',
    color: 'blue',
    bgClass: 'bg-blue-100 text-blue-700 border-blue-200',
    activeClass: 'bg-blue-600 text-white border-blue-600',
    badgeClass: 'bg-blue-500',
    rowClass: 'hover:bg-blue-50',
    urgentClass: 'bg-red-50 border-l-4 border-red-400',
  },
  {
    key: 'กระจายสินค้า',
    label: 'กระจายสินค้า',
    description: 'ขึ้นรถพร้อมส่ง',
    icon: 'fa-truck-fast',
    color: 'indigo',
    bgClass: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    activeClass: 'bg-indigo-600 text-white border-indigo-600',
    badgeClass: 'bg-indigo-500',
    rowClass: 'hover:bg-indigo-50',
    urgentClass: 'bg-red-50 border-l-4 border-red-400',
  },
  {
    key: 'รอกระจาย',
    label: 'รอกระจาย',
    description: 'นำลงจากรถ / ส่งไม่สำเร็จ',
    icon: 'fa-triangle-exclamation',
    color: 'orange',
    bgClass: 'bg-orange-100 text-orange-700 border-orange-200',
    activeClass: 'bg-orange-500 text-white border-orange-500',
    badgeClass: 'bg-orange-500',
    rowClass: 'hover:bg-orange-50',
    urgentClass: 'bg-red-50 border-l-4 border-red-400',
  },
  {
    key: 'ส่งเสร็จ',
    label: 'ส่งเสร็จ',
    description: 'ได้บิลกลับจากรถร่วม',
    icon: 'fa-circle-check',
    color: 'green',
    bgClass: 'bg-green-100 text-green-700 border-green-200',
    activeClass: 'bg-green-600 text-white border-green-600',
    badgeClass: 'bg-green-500',
    rowClass: 'hover:bg-green-50',
    urgentClass: '',
  },
];

function getKpiDeadline(d: DeliveryRecord, kpiConfigs: KpiConfig[]): string {
  const base = d.openDate || d.planDate;
  if (!base) return d.planDate;
  const cfg = kpiConfigs.find(c => c.district === d.district && (!c.province || c.province === d.province))
    || kpiConfigs.find(c => c.district === d.district);
  const limit = cfg?.onTimeLimit ?? 1;
  const dt = new Date(base);
  dt.setDate(dt.getDate() + limit);
  return dt.toISOString().slice(0, 10);
}

function getDaysOverdue(deadline: string): number {
  if (!deadline) return 0;
  const plan = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  plan.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - plan.getTime()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }: { status: string }) {
  const tab = STATUS_TABS.find(t => t.key === status);
  if (!tab) return <span className="text-gray-400 text-xs">-</span>;
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border border-gray-200',
    blue: 'bg-blue-100 text-blue-700 border border-blue-200',
    indigo: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    orange: 'bg-orange-100 text-orange-700 border border-orange-200',
    green: 'bg-green-100 text-green-700 border border-green-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorMap[tab.color]}`}>
      <i className={`fas ${tab.icon} mr-1`}></i>{tab.label}
    </span>
  );
}

export const DeliveryTracker: React.FC<DeliveryTrackerProps> = ({ deliveries, kpiConfigs = [] }) => {
  const [activeTab, setActiveTab] = useState('รอจัด');
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');

  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  const branches = useMemo(() => Array.from(new Set(kpiConfigs.filter(c => c.branch).map(c => c.branch!))).sort(), [kpiConfigs]);

  const provinces = useMemo(() => {
    const s = new Set<string>();
    deliveries.forEach(d => { if (d.province) s.add(d.province); });
    return Array.from(s).sort();
  }, [deliveries]);

  const districts = useMemo(() => {
    let src = deliveries;
    if (filterProvince) src = src.filter(d => d.province === filterProvince);
    return Array.from(new Set(src.map(d => d.district))).sort();
  }, [deliveries, filterProvince]);

  const countByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    STATUS_TABS.forEach(t => { map[t.key] = 0; });
    deliveries.forEach(d => {
      const s = d.deliveryStatus || '';
      if (map[s] !== undefined) map[s]++;
    });
    return map;
  }, [deliveries]);

  const tabRecords = useMemo(() => {
    return deliveries
      .filter(d => (d.deliveryStatus || '') === activeTab)
      .filter(d => {
        if (filterBranch) {
          const key = `${d.province || ''}||${d.district}`;
          const keyNoProvince = `||${d.district}`;
          const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince);
          if (branch !== filterBranch) return false;
        }
        if (filterProvince && d.province !== filterProvince) return false;
        if (filterDistrict && d.district !== filterDistrict) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            d.orderNo?.toLowerCase().includes(q) ||
            d.storeId?.toLowerCase().includes(q) ||
            d.district?.toLowerCase().includes(q) ||
            d.province?.toLowerCase().includes(q) ||
            d.sender?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const oa = getDaysOverdue(getKpiDeadline(a, kpiConfigs));
        const ob = getDaysOverdue(getKpiDeadline(b, kpiConfigs));
        if (ob !== oa) return ob - oa;
        return getKpiDeadline(a, kpiConfigs).localeCompare(getKpiDeadline(b, kpiConfigs));
      });
  }, [deliveries, activeTab, search, filterBranch, filterProvince, filterDistrict, districtBranchMap]);

  const currentTab = STATUS_TABS.find(t => t.key === activeTab)!;
  const isDeliveredTab = activeTab === 'ส่งเสร็จ';
  const urgentCount = isDeliveredTab ? 0 : tabRecords.filter(d => getDaysOverdue(getKpiDeadline(d, kpiConfigs)) > 0).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            ติดตามสถานะสินค้า
          </h2>
          <p className="text-gray-500 mt-1">ตรวจสอบสถานะการจัดส่งสินค้าแยกตามขั้นตอน</p>
        </div>
        <div className="text-right text-sm text-gray-400">
          <div>ทั้งหมด <span className="font-bold text-gray-700">{deliveries.length}</span> รายการ</div>
          <div>ยังไม่ส่ง <span className="font-bold text-orange-600">
            {deliveries.filter(d => d.deliveryStatus !== 'ส่งเสร็จ').length}
          </span> รายการ</div>
        </div>
      </div>

      {/* Status Pipeline Summary */}
      <div className="grid grid-cols-5 gap-3">
        {STATUS_TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); }}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
              activeTab === tab.key ? tab.activeClass + ' shadow-lg scale-105' : 'bg-white border-gray-100 hover:border-gray-300'
            }`}
          >
            {i < STATUS_TABS.length - 1 && (
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 text-xs">
                <i className="fas fa-chevron-right"></i>
              </div>
            )}
            <div className={`text-2xl font-bold ${activeTab === tab.key ? 'text-white' : 'text-gray-800'}`}>
              {countByStatus[tab.key]}
            </div>
            <div className={`text-xs font-bold mt-1 ${activeTab === tab.key ? 'text-white/90' : 'text-gray-600'}`}>
              <i className={`fas ${tab.icon} mr-1`}></i>{tab.label}
            </div>
            {tab.key !== 'ส่งเสร็จ' && countByStatus[tab.key] > 0 && activeTab !== tab.key && (
              <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${tab.badgeClass} animate-pulse`}></div>
            )}
          </button>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); }}
              className={`flex-1 min-w-[120px] px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab.key
                  ? `border-current ${tab.bgClass}`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={`fas ${tab.icon} mr-2`}></i>
              {tab.label}
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.key ? 'bg-white/30' : 'bg-gray-100 text-gray-600'
              }`}>
                {countByStatus[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {/* Description & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentTab.bgClass}`}>
                <i className={`fas ${currentTab.icon} mr-1`}></i>{currentTab.description}
              </span>
              {urgentCount > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-bold animate-pulse">
                  <i className="fas fa-fire mr-1"></i>เลยกำหนด {urgentCount} รายการ
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {branches.length > 0 && (
                <select
                  value={filterBranch}
                  onChange={e => { setFilterBranch(e.target.value); setFilterProvince(''); setFilterDistrict(''); }}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-400 outline-none"
                  aria-label="กรองตามสาขา"
                >
                  <option value="">ทุกสาขา</option>
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <select
                value={filterProvince}
                onChange={e => { setFilterProvince(e.target.value); setFilterDistrict(''); }}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-400 outline-none"
                aria-label="กรองตามจังหวัด"
              >
                <option value="">ทุกจังหวัด</option>
                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterDistrict}
                onChange={e => setFilterDistrict(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-400 outline-none"
                aria-label="กรองตามอำเภอ"
              >
                <option value="">ทุกอำเภอ</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่, ร้าน, อำเภอ..."
                  className="pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none w-48"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {tabRecords.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <i className={`fas ${currentTab.icon} text-5xl mb-3 opacity-30`}></i>
              <p className="font-semibold text-lg">ไม่มีรายการในสถานะ "{currentTab.label}"</p>
              <p className="text-sm mt-1">
                {search || filterProvince ? 'ลองเปลี่ยน filter หรือล้างการค้นหา' : 'ทุกรายการอยู่ในสถานะอื่น'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">เลขที่ใบส่ง</th>
                    <th className="px-4 py-3 text-left font-bold">ผู้ส่ง</th>
                    <th className="px-4 py-3 text-left font-bold">จังหวัด</th>
                    <th className="px-4 py-3 text-left font-bold">อำเภอ / ร้าน</th>
                    <th className="px-4 py-3 text-left font-bold">จำนวน</th>
                    <th className="px-4 py-3 text-left font-bold">วันที่เปิดบิล</th>
                    <th className="px-4 py-3 text-left font-bold">กำหนดส่ง</th>
                    <th className="px-4 py-3 text-left font-bold">
                      {isDeliveredTab ? 'วันส่งเสร็จ' : 'เกินกำหนดส่ง'}
                    </th>
                    {isDeliveredTab && <th className="px-4 py-3 text-left font-bold">KPI</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tabRecords.map(d => {
                    const overdue = getDaysOverdue(getKpiDeadline(d, kpiConfigs));
                    const isUrgent = !isDeliveredTab && overdue > 0;
                    return (
                      <tr
                        key={d.orderNo}
                        className={`transition-colors ${isUrgent ? 'bg-red-50 border-l-4 border-red-400' : currentTab.rowClass}`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-gray-800 text-xs">{d.orderNo}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{d.sender || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{d.province || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800 text-xs">{d.district}</div>
                          <div className="text-gray-400 text-xs">{d.storeId}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-bold text-xs">
                            {d.qty % 1 === 0 ? d.qty : d.qty.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs">{d.openDate || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className="text-indigo-700 font-bold">{getKpiDeadline(d, kpiConfigs)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isDeliveredTab ? (
                            <span className="text-green-700 font-mono text-xs">{d.actualDatetime || d.actualDate}</span>
                          ) : overdue > 0 ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded font-bold text-xs">
                              <i className="fas fa-exclamation-circle mr-1"></i>+{overdue} วัน
                            </span>
                          ) : overdue === 0 ? (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded text-xs font-bold">
                              <i className="fas fa-clock mr-1"></i>วันนี้
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs font-bold">
                              <i className="fas fa-check mr-1"></i>เหลือ {Math.abs(overdue)} วัน
                            </span>
                          )}
                        </td>
                        {isDeliveredTab && (
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              d.kpiStatus === 'PASS'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {d.kpiStatus === 'PASS' ? 'ผ่าน' : 'ไม่ผ่าน'}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 text-right text-xs text-gray-400">
                แสดง {tabRecords.length} รายการ
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
