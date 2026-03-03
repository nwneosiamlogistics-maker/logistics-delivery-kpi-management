import React, { useState, useMemo } from 'react';
import { DeliveryRecord, KpiStatus, ReasonStatus, DelayReason, KpiConfig } from '../types';

interface KpiExceptionsProps {
  deliveries: DeliveryRecord[];
  onUpdateDelivery: (updated: DeliveryRecord, action?: 'submitted' | 'approved' | 'rejected') => void;
  userRole: string;
  delayReasons?: DelayReason[];
  kpiConfigs?: KpiConfig[];
}

const DEFAULT_REASONS: DelayReason[] = [
  { code: 'R01', label: 'รถเสีย', category: 'internal' },
  { code: 'R02', label: 'รถติด', category: 'external' },
  { code: 'R03', label: 'ร้านปิด (ไม่แจ้งล่วงหน้า)', category: 'external' },
  { code: 'R04', label: 'สภาพอากาศไม่ดี', category: 'external' },
  { code: 'R05', label: 'ขาดพนักงาน', category: 'internal' },
];

const STATUS_LABELS: Record<ReasonStatus, string> = {
  [ReasonStatus.NOT_REQUIRED]: 'ไม่ต้องดำเนินการ',
  [ReasonStatus.PENDING]: 'รอระบุเหตุผล',
  [ReasonStatus.SUBMITTED]: 'ส่งเหตุผลแล้ว',
  [ReasonStatus.APPROVED]: 'อนุมัติแล้ว',
  [ReasonStatus.REJECTED]: 'ถูกปฏิเสธ',
};

export const KpiExceptions: React.FC<KpiExceptionsProps> = ({
  deliveries,
  onUpdateDelivery,
  userRole,
  delayReasons = DEFAULT_REASONS,
  kpiConfigs = []
}) => {
  const kpiMap = useMemo(() => {
    const m = new Map<string, number>();
    kpiConfigs.forEach(cfg => {
      if (cfg.onTimeLimit !== undefined) {
        if (cfg.province && cfg.district) m.set(`${cfg.province}||${cfg.district}`, cfg.onTimeLimit);
        else if (cfg.district) m.set(`||${cfg.district}`, cfg.onTimeLimit);
      }
    });
    return m;
  }, [kpiConfigs]);

  const getThreshold = (order: DeliveryRecord): number | undefined =>
    kpiMap.get(`${order.province || ''}||${order.district}`) ??
    kpiMap.get(`||${order.district}`);

  const branches = useMemo(() => Array.from(new Set(kpiConfigs.filter(c => c.branch).map(c => c.branch!))).sort(), [kpiConfigs]);
  const allProvinces = useMemo(() => Array.from(new Set(deliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS && d.province).map(d => d.province!))).sort(), [deliveries]);
  const allDistricts = useMemo(() => Array.from(new Set(deliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS).map(d => d.district))).sort(), [deliveries]);

  const [selectedOrder, setSelectedOrder] = useState<DeliveryRecord | null>(null);
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState('All');
  const [filterProvince, setFilterProvince] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const exceptions = useMemo(() => {
    return deliveries
      .filter(d => d.kpiStatus === KpiStatus.NOT_PASS)
      .filter(d => filterStatus === 'all' || d.reasonStatus === filterStatus)
      .filter(d => filterBranch === 'All' || kpiMap.get(`${d.province || ''}||${d.district}`) !== undefined
        ? filterBranch === 'All' || (() => {
            const cfg = kpiConfigs.find(c => c.district === d.district && (!c.province || c.province === d.province));
            return cfg?.branch === filterBranch;
          })()
        : filterBranch === 'All')
      .filter(d => filterProvince === 'All' || d.province === filterProvince)
      .filter(d => filterDistrict === 'All' || d.district === filterDistrict)
      .filter(d => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          d.orderNo.toLowerCase().includes(term) ||
          d.district.toLowerCase().includes(term) ||
          d.storeId.toLowerCase().includes(term) ||
          (d.sender || '').toLowerCase().includes(term)
        );
      });
  }, [deliveries, filterStatus, filterBranch, filterProvince, filterDistrict, searchTerm, kpiMap, kpiConfigs]);

  const statusCounts = useMemo(() => {
    const all = deliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS);
    return {
      all: all.length,
      pending: all.filter(d => d.reasonStatus === ReasonStatus.PENDING).length,
      submitted: all.filter(d => d.reasonStatus === ReasonStatus.SUBMITTED).length,
      approved: all.filter(d => d.reasonStatus === ReasonStatus.APPROVED).length,
      rejected: all.filter(d => d.reasonStatus === ReasonStatus.REJECTED).length,
    };
  }, [deliveries]);

  const handleSubmitReason = () => {
    if (!selectedOrder || !reason) return;
    const fullReason = reasonNote.trim() ? `${reason} — ${reasonNote.trim()}` : reason;
    const updated: DeliveryRecord = {
      ...selectedOrder,
      delayReason: fullReason,
      reasonStatus: ReasonStatus.SUBMITTED,
      updatedAt: new Date().toISOString()
    };
    onUpdateDelivery(updated, 'submitted');
    setSelectedOrder(null);
    setReason('');
    setReasonNote('');
  };

  const handleApprove = (order: DeliveryRecord) => {
    const updated: DeliveryRecord = {
      ...order,
      reasonStatus: ReasonStatus.APPROVED,
      updatedAt: new Date().toISOString()
    };
    onUpdateDelivery(updated, 'approved');
  };

  const handleReject = (order: DeliveryRecord) => {
    const updated: DeliveryRecord = {
      ...order,
      reasonStatus: ReasonStatus.REJECTED,
      updatedAt: new Date().toISOString()
    };
    onUpdateDelivery(updated, 'rejected');
  };

  const getStatusBadge = (status: ReasonStatus) => {
    const styles: Record<ReasonStatus, string> = {
      [ReasonStatus.NOT_REQUIRED]: 'bg-gray-50 text-gray-700 border-gray-200',
      [ReasonStatus.PENDING]: 'bg-amber-50 text-amber-700 border-amber-200',
      [ReasonStatus.SUBMITTED]: 'bg-blue-50 text-blue-700 border-blue-200',
      [ReasonStatus.APPROVED]: 'bg-green-50 text-green-700 border-green-200',
      [ReasonStatus.REJECTED]: 'bg-red-50 text-red-700 border-red-200',
    };
    return styles[status];
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-pink-600">
            KPI ที่ไม่ผ่าน
          </h2>
          <p className="text-gray-500 mt-1">จัดการและระบุเหตุผลสำหรับการจัดส่งล่าช้า</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'ทั้งหมด', count: statusCounts.all },
            { key: ReasonStatus.PENDING, label: 'รอระบุ', count: statusCounts.pending },
            { key: ReasonStatus.SUBMITTED, label: 'ส่งแล้ว', count: statusCounts.submitted },
            { key: ReasonStatus.APPROVED, label: 'อนุมัติ', count: statusCounts.approved },
            { key: ReasonStatus.REJECTED, label: 'ปฏิเสธ', count: statusCounts.rejected },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                filterStatus === tab.key
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                filterStatus === tab.key ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {branches.length > 0 && (
            <select aria-label="กรองสาขา" value={filterBranch}
              onChange={e => { setFilterBranch(e.target.value); setFilterProvince('All'); setFilterDistrict('All'); }}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="All">ทุกสาขา</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select aria-label="กรองจังหวัด" value={filterProvince}
            onChange={e => { setFilterProvince(e.target.value); setFilterDistrict('All'); }}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="All">ทุกจังหวัด</option>
            {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="กรองอำเภอ" value={filterDistrict}
            onChange={e => setFilterDistrict(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="All">ทุกอำเภอ</option>
            {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {(filterBranch !== 'All' || filterProvince !== 'All' || filterDistrict !== 'All') && (
            <button onClick={() => { setFilterBranch('All'); setFilterProvince('All'); setFilterDistrict('All'); }}
              className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-100 transition-colors">
              <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
            </button>
          )}
        </div>
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-bold">เลขที่ใบสั่ง</th>
                <th className="px-6 py-4 font-bold">ผู้ส่ง</th>
                <th className="px-6 py-4 font-bold">จังหวัด</th>
                <th className="px-6 py-4 font-bold">อำเภอ</th>
                <th className="px-6 py-4 font-bold">ร้านค้า</th>
                <th className="px-6 py-4 font-bold">กำหนดส่ง</th>
                <th className="px-6 py-4 font-bold text-center">KPI (วัน)</th>
                <th className="px-6 py-4 font-bold">ส่งจริง</th>
                <th className="px-6 py-4 font-bold">ล่าช้า</th>
                <th className="px-6 py-4 font-bold">เหตุผล</th>
                <th className="px-6 py-4 font-bold">สถานะ</th>
                <th className="px-6 py-4 font-bold text-center">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map(order => (
                <tr key={order.orderNo} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{order.orderNo}</td>
                  <td className="px-6 py-4 text-xs text-gray-700">{order.sender || <span className="text-gray-300 italic">-</span>}</td>
                  <td className="px-6 py-4 text-xs">{order.province || <span className="text-gray-300 italic">-</span>}</td>
                  <td className="px-6 py-4">{order.district}</td>
                  <td className="px-6 py-4 font-mono text-xs">{order.storeId}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{order.planDate}</td>
                  <td className="px-6 py-4 text-center">
                    {getThreshold(order) !== undefined ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200">
                        {getThreshold(order)} วัน
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-900 font-mono text-xs">{order.actualDate}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold border border-red-200">
                      +{order.delayDays} วัน
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {order.delayReason ? (
                      <span className="text-gray-700 text-xs">{order.delayReason}</span>
                    ) : (
                      <span className="text-gray-400 text-xs italic">ยังไม่ระบุ</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStatusBadge(order.reasonStatus)}`}>
                      {STATUS_LABELS[order.reasonStatus]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {order.reasonStatus === ReasonStatus.PENDING && (
                      order.deliveryStatus === 'ส่งเสร็จ' ? (
                        <button
                          onClick={() => { setSelectedOrder(order); setReason(''); setReasonNote(''); }}
                          className="text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all hover:shadow-md"
                        >
                          ระบุเหตุผล
                        </button>
                      ) : (
                        <span className="text-xs text-amber-600 italic">รอสถานะ ส่งเสร็จ</span>
                      )
                    )}
                    {order.reasonStatus === ReasonStatus.SUBMITTED && userRole === 'Admin' && (
                      <div className="flex justify-center gap-2">
                        <button
                          aria-label="อนุมัติเหตุผล"
                          onClick={() => handleApprove(order)}
                          className="w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-colors flex items-center justify-center"
                        >
                          <i className="fas fa-check"></i>
                        </button>
                        <button
                          aria-label="ปฏิเสธเหตุผล"
                          onClick={() => handleReject(order)}
                          className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}
                    {order.reasonStatus === ReasonStatus.SUBMITTED && userRole !== 'Admin' && (
                      <span className="text-xs text-gray-400 italic">รออนุมัติ</span>
                    )}
                    {order.reasonStatus === ReasonStatus.APPROVED && (
                      <span className="text-xs text-green-600 font-semibold">
                        <i className="fas fa-check-circle mr-1"></i>เสร็จสิ้น
                      </span>
                    )}
                    {order.reasonStatus === ReasonStatus.REJECTED && (
                      <button
                        onClick={() => { setSelectedOrder(order); setReason(''); setReasonNote(''); }}
                        className="text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-lg text-xs font-semibold"
                      >
                        ส่งใหม่
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {exceptions.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                      <i className="fas fa-check-circle text-4xl text-green-200 mb-3"></i>
                      <p className="font-semibold">ไม่พบรายการที่ต้องดำเนินการ</p>
                      <p className="text-sm">ลองปรับตัวกรองใหม่</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform scale-100 transition-all">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedOrder.reasonStatus === ReasonStatus.REJECTED ? 'ส่งเหตุผลใหม่' : 'ระบุเหตุผลความล่าช้า'}
                </h3>
                <button aria-label="ปิด" onClick={() => { setSelectedOrder(null); setReason(''); }} className="text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {selectedOrder.reasonStatus === ReasonStatus.REJECTED && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
                  <p className="text-sm text-red-700">
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    เหตุผลเดิมถูกปฏิเสธ กรุณาระบุเหตุผลใหม่
                  </p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">เลขที่ใบสั่ง</span>
                    <span className="font-bold">{selectedOrder.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">ผู้ส่ง</span>
                    <span className="font-bold">{selectedOrder.sender || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">จังหวัด</span>
                    <span className="font-bold">{selectedOrder.province || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">อำเภอ</span>
                    <span className="font-bold">{selectedOrder.district}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">ร้านค้า</span>
                    <span className="font-bold">{selectedOrder.storeId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">ล่าช้า</span>
                    <span className="font-bold text-red-600">+{selectedOrder.delayDays} วัน</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">เลือกเหตุผล <span className="text-red-500">*</span></label>
                  <select
                    aria-label="เลือกรหัสเหตุผล"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-200 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                  >
                    <option value="">-- เลือกเหตุผล --</option>
                    <optgroup label="สาเหตุภายใน">
                      {delayReasons.filter(r => r.category === 'internal').map(r => (
                        <option key={r.code} value={r.label}>{r.code}: {r.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="สาเหตุภายนอก">
                      {delayReasons.filter(r => r.category === 'external').map(r => (
                        <option key={r.code} value={r.label}>{r.code}: {r.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รายละเอียดเพิ่มเติม <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
                  <textarea
                    aria-label="รายละเอียดเพิ่มเติม"
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    rows={3}
                    placeholder="รายละเอียดเพิ่มเติม เช่น เส้นทางน้ำท่วมถนนสายเอก..."
                    className="w-full border border-gray-200 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50/50">
              <button
                onClick={() => { setSelectedOrder(null); setReason(''); }}
                className="px-4 py-2 text-gray-600 font-semibold text-sm hover:bg-gray-100 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                disabled={!reason}
                onClick={handleSubmitReason}
                className="px-6 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5"
              >
                ส่งเหตุผล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
