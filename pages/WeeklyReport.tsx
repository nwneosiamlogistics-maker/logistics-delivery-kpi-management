import React, { useState, useMemo } from 'react';
import { DeliveryRecord, DeliveryStatus, KpiStatus, KpiConfig } from '../types';

interface WeeklyReportProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
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

export const WeeklyReport: React.FC<WeeklyReportProps> = ({ deliveries, kpiConfigs = [] }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [branchFilter, setBranchFilter] = useState<string>('All');

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

  // Filter deliveries for this week by actualDate + branch
  const weekDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      const ad = parseLocalDate(d.actualDate);
      if (!ad) return false;
      if (!(ad >= start && ad <= end)) return false;
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

  // KPI summary
  const kpiPass = weekDeliveries.filter(d => d.kpiStatus === KpiStatus.PASS).length;
  const kpiFail = weekDeliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS).length;

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
            onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            title="สัปดาห์ถัดไป"
            aria-label="สัปดาห์ถัดไป"
            className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm transition-colors disabled:opacity-40"
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
        {statCard('fa-trophy', 'text-blue-600', 'bg-blue-50', 'KPI ผ่าน', `${pct(kpiPass, totalInv)}%`, `ผ่าน ${kpiPass} / ไม่ผ่าน ${kpiFail}`)}
      </div>

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
