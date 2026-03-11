import React, { useState, useMemo } from 'react';
import { DeliveryRecord, KpiConfig, Holiday, StoreClosure, KpiStatus, ReasonStatus } from '../types';
import { displayDate, calculateKpiStatus, getWeekday } from '../utils/kpiEngine';
import { formatQty } from '../utils/formatters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface DeliveryTrackerProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
  holidays?: Holiday[];
  storeClosures?: StoreClosure[];
  onUpdateDelivery?: (updated: DeliveryRecord) => void;
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

export const DeliveryTracker: React.FC<DeliveryTrackerProps> = ({ deliveries, kpiConfigs = [], holidays = [], storeClosures = [], onUpdateDelivery }) => {
  const [activeTab, setActiveTab] = useState('รอจัด');
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  
  // Inline edit states
  const [editingCell, setEditingCell] = useState<{ orderNo: string; field: 'planDate' | 'actualDate' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingEdit, setPendingEdit] = useState<{ orderNo: string; field: 'planDate' | 'actualDate'; value: string } | null>(null);
  
  // Track order search
  const [trackOrderNo, setTrackOrderNo] = useState('');
  const trackedOrder = useMemo(() => {
    if (!trackOrderNo.trim()) return null;
    const found = deliveries.find(d => d.orderNo.toLowerCase().includes(trackOrderNo.toLowerCase().trim()));
    if (found) {
      console.log(`[DeliveryTracker] trackedOrder found:`, {
        orderNo: found.orderNo,
        kpiStatus: found.kpiStatus,
        delayDays: found.delayDays,
        manualActualDate: found.manualActualDate
      });
    }
    return found;
  }, [deliveries, trackOrderNo]);

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
    deliveries
      .filter(d => {
        if (filterBranch) {
          const key = `${d.province || ''}||${d.district}`;
          const keyNoProvince = `||${d.district}`;
          const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince);
          if (branch !== filterBranch) return false;
        }
        if (filterProvince && d.province !== filterProvince) return false;
        if (filterDistrict && d.district !== filterDistrict) return false;
        return true;
      })
      .forEach(d => {
        const s = d.deliveryStatus || '';
        if (map[s] !== undefined) map[s]++;
      });
    return map;
  }, [deliveries, filterBranch, filterProvince, filterDistrict, districtBranchMap]);

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

  const currentTab = STATUS_TABS.find(t => t.key === activeTab) || STATUS_TABS[0];
  const isDeliveredTab = activeTab === 'ส่งเสร็จ';
  const urgentCount = isDeliveredTab ? 0 : tabRecords.filter(d => getDaysOverdue(getKpiDeadline(d, kpiConfigs)) > 0).length;

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const statusSummary = useMemo(() => {
    return STATUS_TABS.map(tab => {
      const rows = deliveries.filter(d => (d.deliveryStatus || '') === tab.key);
      if (rows.length === 0) return { key: tab.key, label: tab.label, icon: tab.icon, color: tab.color, count: 0, avgFromOpen: '-', avgOverPlan: '-', overdueCount: 0 };
      const openRows = rows.filter(d => d.openDate);
      const avgOpen = openRows.length > 0
        ? openRows.reduce((s, d) => s + Math.floor((today.getTime() - new Date(d.openDate!).getTime()) / 86400000), 0) / openRows.length
        : 0;
      const overdueRows = tab.key !== 'ส่งเสร็จ'
        ? rows.filter(d => getDaysOverdue(getKpiDeadline(d, kpiConfigs)) > 0)
        : [];
      const avgOver = overdueRows.length > 0
        ? overdueRows.reduce((s, d) => s + getDaysOverdue(getKpiDeadline(d, kpiConfigs)), 0) / overdueRows.length
        : 0;
      return {
        key: tab.key, label: tab.label, icon: tab.icon, color: tab.color,
        count: rows.length,
        avgFromOpen: openRows.length > 0 ? avgOpen.toFixed(1) : '-',
        avgOverPlan: overdueRows.length > 0 ? avgOver.toFixed(1) : '-',
        overdueCount: overdueRows.length,
      };
    });
  }, [deliveries, kpiConfigs, today]);

  const provinceChartData = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    deliveries.forEach(d => {
      const prov = d.province || 'ไม่ระบุ';
      const status = d.deliveryStatus || 'ไม่ระบุ';
      if (!map.has(prov)) map.set(prov, {});
      const entry = map.get(prov)!;
      entry[status] = (entry[status] || 0) + 1;
    });
    return [...map.entries()]
      .map(([name, counts]) => ({ name, total: Object.values(counts).reduce((s, v) => s + v, 0), ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [deliveries]);

  const STATUS_COLORS: Record<string, string> = {
    'รอจัด': '#9CA3AF',
    'ขนส่ง': '#3B82F6',
    'รอกระจาย': '#F97316',
    'กระจายสินค้า': '#6366F1',
    'ส่งเสร็จ': '#10B981',
  };

  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    orange: 'bg-orange-100 text-orange-700',
    green: 'bg-green-100 text-green-700',
  };

  // Handle click to start editing
  const handleStartEdit = (orderNo: string, field: 'planDate' | 'actualDate', currentValue: string) => {
    if (!onUpdateDelivery) return; // No callback = read-only
    setEditingCell({ orderNo, field });
    setEditValue(currentValue || '');
  };

  // Handle edit confirmation - show password modal
  const handleConfirmEdit = () => {
    if (!editingCell) return;
    setPendingEdit({ orderNo: editingCell.orderNo, field: editingCell.field, value: editValue });
    setShowPasswordModal(true);
    setPassword('');
    setPasswordError('');
    setEditingCell(null);
  };

  // Handle password verification and save
  const handlePasswordSubmit = () => {
    if (password !== '1234') {
      setPasswordError('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    if (!pendingEdit || !onUpdateDelivery) return;

    const delivery = deliveries.find(d => d.orderNo === pendingEdit.orderNo);
    if (!delivery) return;

    // Update the delivery record
    const updated: DeliveryRecord = { ...delivery };
    if (pendingEdit.field === 'planDate') {
      updated.planDate = pendingEdit.value;
      updated.manualPlanDate = true; // Flag: แก้ไขด้วยมือ - ห้าม overwrite เมื่อ import
    } else {
      updated.actualDate = pendingEdit.value;
      updated.manualActualDate = true; // Flag: แก้ไขด้วยมือ - ห้าม overwrite เมื่อ import
      // Update deliveryStatus to 'ส่งเสร็จ' if actualDate is set
      if (pendingEdit.value && !updated.deliveryStatus?.includes('ส่งเสร็จ')) {
        updated.deliveryStatus = 'ส่งเสร็จ';
      }
    }

    // Recalculate KPI if both dates exist
    if (updated.planDate && updated.actualDate) {
      // คำนวณ KPI deadline = openDate + onTimeLimit (เหมือน excelParser)
      const kpiCfg = kpiConfigs.find(c =>
        c.district === updated.district && (!c.province || c.province === updated.province)
      ) || kpiConfigs.find(c => c.district === updated.district);
      const kpiLimit = kpiCfg?.onTimeLimit ?? 1;
      const deadlineBase = updated.openDate || updated.planDate;
      const kpiDeadline = (() => {
        if (!deadlineBase) return updated.planDate;
        const d = new Date(deadlineBase);
        d.setDate(d.getDate() + kpiLimit);
        return d.toISOString().slice(0, 10);
      })();

      const kpiResult = calculateKpiStatus(
        kpiDeadline,
        updated.actualDate,
        updated.district,
        kpiConfigs,
        holidays,
        storeClosures,
        updated.storeId,
        updated.province
      );
      updated.kpiStatus = kpiResult.kpiStatus;
      updated.delayDays = kpiResult.delayDays;
      updated.reasonRequired = kpiResult.reasonRequired;
      updated.reasonStatus = kpiResult.reasonStatus;
      updated.weekday = getWeekday(updated.actualDate);
    }

    updated.updatedAt = new Date().toISOString();
    
    // Debug log เพื่อยืนยันว่า flag ถูก set
    console.log(`[DeliveryTracker] Saving edit for ${updated.orderNo}:`, {
      field: pendingEdit.field,
      newValue: pendingEdit.value,
      manualPlanDate: updated.manualPlanDate,
      manualActualDate: updated.manualActualDate,
      kpiStatus: updated.kpiStatus,
      delayDays: updated.delayDays
    });
    
    onUpdateDelivery(updated);

    // Reset states
    setShowPasswordModal(false);
    setPendingEdit(null);
    setPassword('');
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

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

      {/* Track Order Search */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <i className="fas fa-search text-indigo-400"></i>
          ค้นหาเลขที่เอกสาร
        </h3>
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <i className="fas fa-file-invoice absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input
              type="text"
              value={trackOrderNo}
              onChange={e => setTrackOrderNo(e.target.value)}
              placeholder="พิมพ์เลขที่เอกสาร เช่น B0226013518"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          {trackOrderNo && (
            <button
              onClick={() => setTrackOrderNo('')}
              className="px-3 py-2 text-gray-500 hover:text-gray-700"
              title="ล้างการค้นหา"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        
        {/* Search Result */}
        {trackOrderNo.trim() && (
          <div className="mt-4">
            {trackedOrder ? (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-indigo-700">{trackedOrder.orderNo}</span>
                    <StatusBadge status={trackedOrder.deliveryStatus || ''} />
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab(trackedOrder.deliveryStatus || 'รอจัด');
                      setSearch(trackedOrder.orderNo);
                      setTrackOrderNo('');
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    <i className="fas fa-external-link-alt mr-1"></i>ดูในตาราง
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs">ร้าน</div>
                    <div className="font-medium text-gray-800">{trackedOrder.storeId || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">อำเภอ/จังหวัด</div>
                    <div className="font-medium text-gray-800">{trackedOrder.district}{trackedOrder.province ? `, ${trackedOrder.province}` : ''}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">วันที่เปิดบิล</div>
                    <div className="font-medium text-gray-800">{displayDate(trackedOrder.openDate)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">กำหนดส่ง</div>
                    <div className="font-medium text-gray-800">{displayDate(trackedOrder.planDate)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">ส่งจริง</div>
                    <div className="font-medium text-gray-800">{trackedOrder.actualDate ? displayDate(trackedOrder.actualDate) : <span className="text-orange-500">ยังไม่ส่ง</span>}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">KPI</div>
                    <div className={`font-bold ${trackedOrder.kpiStatus === 'PASS' ? 'text-green-600' : trackedOrder.kpiStatus === 'NOT_PASS' ? 'text-red-600' : 'text-gray-500'}`}>
                      {trackedOrder.kpiStatus === 'PASS' ? 'ผ่าน' : trackedOrder.kpiStatus === 'NOT_PASS' ? 'ไม่ผ่าน' : 'รอดำเนินการ'}
                      {trackedOrder.delayDays !== undefined && trackedOrder.delayDays !== null && (
                        <span className="text-xs font-normal ml-1">({trackedOrder.delayDays} วัน)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">จำนวน</div>
                    <div className="font-medium text-gray-800">{trackedOrder.qty || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">ผู้ส่ง</div>
                    <div className="font-medium text-gray-800">{trackedOrder.sender || '-'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <i className="fas fa-search text-yellow-500 text-2xl mb-2"></i>
                <div className="text-yellow-700 font-medium">ไม่พบเลขที่เอกสาร "{trackOrderNo}"</div>
                <div className="text-yellow-600 text-sm mt-1">กรุณาตรวจสอบเลขที่เอกสารอีกครั้ง</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Pipeline Summary */}
      <div className="grid grid-cols-5 gap-3">
        {STATUS_TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); }}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${activeTab === tab.key ? tab.activeClass + ' shadow-lg scale-105' : 'bg-white border-gray-100 hover:border-gray-300'
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

      {/* Status Summary Table */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <i className="fas fa-table text-indigo-400"></i>
          สรุประยะเวลาเฉลี่ยแต่ละสถานะ
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-bold">สถานะ</th>
                <th className="px-4 py-3 text-right font-bold">จำนวน (Inv.)</th>
                <th className="px-4 py-3 text-right font-bold">% จากทั้งหมด</th>
                <th className="px-4 py-3 text-right font-bold">เฉลี่ยวันจากเปิดบิล</th>
                <th className="px-4 py-3 text-right font-bold">เฉลี่ยวันเกินกำหนด</th>
                <th className="px-4 py-3 text-right font-bold">เลยกำหนด (Inv.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {statusSummary.map(row => (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${colorMap[row.color]}`}>
                      <i className={`fas ${row.icon} mr-1`}></i>{row.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">{row.count}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {deliveries.length > 0 ? ((row.count / deliveries.length) * 100).toFixed(1) + '%' : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.avgFromOpen !== '-'
                      ? <span className="font-bold text-indigo-700">{row.avgFromOpen} วัน</span>
                      : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.avgOverPlan !== '-'
                      ? <span className="font-bold text-red-600">{row.avgOverPlan} วัน</span>
                      : <span className="text-green-500 text-xs font-bold">✓ ทันกำหนด</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.overdueCount > 0
                      ? <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold text-xs">{row.overdueCount}</span>
                      : <span className="text-gray-300 text-xs">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Province Stacked Bar Chart */}
      {provinceChartData.length > 0 && (
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-flag text-blue-400"></i>
            สัดส่วนสถานะสินค้าตามจังหวัด (Top 12)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={provinceChartData} margin={{ top: 4, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {Object.keys(STATUS_COLORS).map(status => (
                <Bar key={status} dataKey={status} stackId="a" fill={STATUS_COLORS[status]} name={status} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab Bar */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); }}
              className={`flex-1 min-w-[120px] px-4 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === tab.key
                  ? `border-current ${tab.bgClass}`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <i className={`fas ${tab.icon} mr-2`}></i>
              {tab.label}
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-white/30' : 'bg-gray-100 text-gray-600'
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
              <button 
                onClick={() => {
                  const headers = ['เลขที่ใบส่ง', 'ผู้ส่ง', 'ร้านค้า', 'จังหวัด', 'อำเภอ', 'จำนวน', 'วันเปิดบิล', 'วันนัดส่ง', 'ส่งจริง', 'สถานะ', 'KPI'];
                  const rows = tabRecords.map(d => [
                    d.orderNo, d.sender || '', d.storeId, d.province || '', d.district, d.qty, 
                    d.openDate || '', d.planDate, d.actualDate || '', d.deliveryStatus, d.kpiStatus || ''
                  ]);
                  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
                  const BOM = '\uFEFF';
                  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `รายการจัดส่ง_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
              >
                <i className="fas fa-file-csv"></i> Export CSV
              </button>
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
                    <th className="px-4 py-3 text-left font-bold">
                      วันนัดส่ง {onUpdateDelivery && <i className="fas fa-edit text-blue-400 ml-1" title="คลิกเพื่อแก้ไข"></i>}
                    </th>
                    <th className="px-4 py-3 text-left font-bold">
                      ส่งจริง {onUpdateDelivery && <i className="fas fa-edit text-blue-400 ml-1" title="คลิกเพื่อแก้ไข"></i>}
                    </th>
                    <th className="px-4 py-3 text-left font-bold">KPI (วัน)</th>
                    <th className="px-4 py-3 text-left font-bold">
                      {isDeliveredTab ? 'สถานะ KPI' : 'เกินกำหนด'}
                    </th>
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
                            {formatQty(d.qty)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs">{d.openDate || <span className="text-gray-300">-</span>}</td>
                        {/* Editable planDate */}
                        <td className="px-4 py-3">
                          {editingCell?.orderNo === d.orderNo && editingCell?.field === 'planDate' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="border border-blue-300 rounded px-1 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                title="แก้ไขวันนัดส่ง"
                                autoFocus
                              />
                              <button onClick={handleConfirmEdit} className="text-green-600 hover:text-green-800" title="ยืนยัน">
                                <i className="fas fa-check text-xs"></i>
                              </button>
                              <button onClick={handleCancelEdit} className="text-red-500 hover:text-red-700" title="ยกเลิก">
                                <i className="fas fa-times text-xs"></i>
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => handleStartEdit(d.orderNo, 'planDate', d.planDate)}
                              className={`font-mono text-xs text-indigo-700 font-bold ${onUpdateDelivery ? 'cursor-pointer hover:bg-indigo-50 px-1 py-0.5 rounded' : ''}`}
                              title={onUpdateDelivery ? 'คลิกเพื่อแก้ไข' : ''}
                            >
                              {d.planDate || '-'}
                            </span>
                          )}
                        </td>
                        {/* Editable actualDate */}
                        <td className="px-4 py-3">
                          {editingCell?.orderNo === d.orderNo && editingCell?.field === 'actualDate' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="border border-blue-300 rounded px-1 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                title="แก้ไขวันส่งจริง"
                                autoFocus
                              />
                              <button onClick={handleConfirmEdit} className="text-green-600 hover:text-green-800" title="ยืนยัน">
                                <i className="fas fa-check text-xs"></i>
                              </button>
                              <button onClick={handleCancelEdit} className="text-red-500 hover:text-red-700" title="ยกเลิก">
                                <i className="fas fa-times text-xs"></i>
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => handleStartEdit(d.orderNo, 'actualDate', d.actualDate)}
                              className={`font-mono text-xs ${d.actualDate ? 'text-green-700' : 'text-gray-300'} ${onUpdateDelivery ? 'cursor-pointer hover:bg-green-50 px-1 py-0.5 rounded' : ''}`}
                              title={onUpdateDelivery ? 'คลิกเพื่อแก้ไข' : ''}
                            >
                              {displayDate(d.actualDatetime || d.actualDate) || '-'}
                            </span>
                          )}
                        </td>
                        {/* KPI Days */}
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            d.kpiStatus === 'PASS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {d.delayDays || 0}
                          </span>
                        </td>
                        {/* Status / Overdue */}
                        <td className="px-4 py-3">
                          {isDeliveredTab ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.kpiStatus === 'PASS'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                              }`}>
                              {d.kpiStatus === 'PASS' ? 'ผ่าน' : 'ไม่ผ่าน'}
                            </span>
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

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-lock text-indigo-500"></i>
              ยืนยันการแก้ไข
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              กรุณาใส่รหัสผ่านเพื่อยืนยันการแก้ไขข้อมูล
            </p>
            {pendingEdit && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <div className="text-gray-500">แก้ไข: <span className="font-bold text-gray-800">{pendingEdit.field === 'planDate' ? 'วันนัดส่ง' : 'ส่งจริง'}</span></div>
                <div className="text-gray-500">ค่าใหม่: <span className="font-bold text-indigo-600">{pendingEdit.value || '(ลบ)'}</span></div>
              </div>
            )}
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
              placeholder="ใส่รหัสผ่าน"
              className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit(); }}
            />
            {passwordError && (
              <p className="text-red-500 text-sm mb-3">
                <i className="fas fa-exclamation-circle mr-1"></i>{passwordError}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowPasswordModal(false); setPendingEdit(null); setPassword(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
