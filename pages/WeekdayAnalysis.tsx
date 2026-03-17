import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line
} from 'recharts';
import { DeliveryRecord, KpiConfig, Holiday, StoreClosure } from '../types';
import { getWeekday } from '../utils/kpiEngine';
import { formatQty, formatNum } from '../utils/formatters';

interface WeekdayAnalysisProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
  holidays?: Holiday[];
  storeClosures?: StoreClosure[];
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_THAI: Record<string, string> = {
  'Monday': 'จันทร์',
  'Tuesday': 'อังคาร',
  'Wednesday': 'พุธ',
  'Thursday': 'พฤหัสบดี',
  'Friday': 'ศุกร์',
  'Saturday': 'เสาร์',
  'Sunday': 'อาทิตย์'
};

export const WeekdayAnalysis: React.FC<WeekdayAnalysisProps> = ({ deliveries, kpiConfigs = [], holidays = [], storeClosures = [] }) => {
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [provinceFilter, setProvinceFilter] = useState<string>('All');
  const [districtFilter, setDistrictFilter] = useState<string>('All');
  const [storeFilter, setStoreFilter] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Build district → branch map
  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  const branches = useMemo(() => {
    const set = new Set<string>();
    kpiConfigs.forEach(c => { if (c.branch) set.add(c.branch); });
    return Array.from(set).sort();
  }, [kpiConfigs]);

  const provinces = useMemo(() =>
    Array.from(new Set(deliveries.map(d => d.province).filter(Boolean) as string[])).sort()
  , [deliveries]);

  const districts = useMemo(() => {
    let filtered = deliveries;
    if (provinceFilter !== 'All') filtered = filtered.filter(d => d.province === provinceFilter);
    return Array.from(new Set(filtered.map(d => d.district))).sort();
  }, [deliveries, provinceFilter]);

  const stores = useMemo(() => {
    let filtered = deliveries;
    if (provinceFilter !== 'All') filtered = filtered.filter(d => d.province === provinceFilter);
    if (districtFilter !== 'All') filtered = filtered.filter(d => d.district === districtFilter);
    return Array.from(new Set(filtered.map(d => d.storeId))).sort();
  }, [deliveries, provinceFilter, districtFilter]);

  const filteredData = useMemo(() => {
    return deliveries.filter(d => {
      const key = `${d.province || ''}||${d.district}`;
      const keyNoProvince = `||${d.district}`;
      const matchBranch = branchFilter === 'All' || districtBranchMap.get(key) === branchFilter || districtBranchMap.get(keyNoProvince) === branchFilter;
      const matchProvince = provinceFilter === 'All' || d.province === provinceFilter;
      const matchDistrict = districtFilter === 'All' || d.district === districtFilter;
      const matchStore = storeFilter === 'All' || d.storeId === storeFilter;

      let matchDate = true;
      if (startDate) matchDate = matchDate && d.actualDate >= startDate;
      if (endDate) matchDate = matchDate && d.actualDate <= endDate;

      return matchBranch && matchProvince && matchDistrict && matchStore && matchDate;
    });
  }, [deliveries, branchFilter, districtBranchMap, provinceFilter, districtFilter, storeFilter, startDate, endDate]);

  const analyticsData = useMemo(() => {
    const map = new Map(WEEKDAYS.map(day => [day, { name: day, nameThai: WEEKDAY_THAI[day], count: 0, qty: 0 }]));

    filteredData.forEach(d => {
      const dayName = getWeekday(d.actualDate);
      if (map.has(dayName)) {
        const entry = map.get(dayName)!;
        entry.count += 1;
        entry.qty += d.qty;
      }
    });

    return WEEKDAYS.map(day => map.get(day)!);
  }, [filteredData]);

  const totalTrips = analyticsData.reduce((s, d) => s + d.count, 0);
  const totalQty = analyticsData.reduce((s, d) => s + d.qty, 0);
  const maxTripDay = analyticsData.reduce((prev, current) => (prev.count > current.count) ? prev : current, analyticsData[0]);
  const minTripDay = analyticsData.filter(d => d.count > 0).reduce((prev, current) => (prev.count < current.count) ? prev : current, { name: '-', nameThai: '-', count: 0 } as any);
  // Calculate holiday trips: Sunday + public holidays + company holidays + store closures
  const holidayTrips = useMemo(() => {
    const holidayDates = new Set<string>();
    // Add all holidays (public + company)
    holidays.forEach(h => holidayDates.add(h.date));
    // Add all store closures
    storeClosures.forEach(sc => { if (sc.date) holidayDates.add(sc.date); });
    
    return filteredData.filter(d => {
      if (!d.actualDate) return false;
      const date = new Date(d.actualDate);
      const dayOfWeek = date.getDay(); // 0 = Sunday
      // Check if Sunday or in holiday/closure dates
      return dayOfWeek === 0 || holidayDates.has(d.actualDate);
    }).length;
  }, [filteredData, holidays, storeClosures]);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="glass-panel p-6 rounded-2xl flex flex-col lg:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            วิเคราะห์รูปแบบการจัดส่งรายวัน
          </h2>
          <p className="text-gray-500 mt-1">เพิ่มประสิทธิภาพตารางจัดส่งจากข้อมูลในอดีต</p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {branches.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">สาขา</label>
              <select
                aria-label="กรองตามสาขา"
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setProvinceFilter('All'); setDistrictFilter('All'); setStoreFilter('All'); }}
              >
                <option value="All">ทุกสาขา</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">จังหวัด</label>
            <select
              aria-label="กรองตามจังหวัด"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={provinceFilter}
              onChange={(e) => { setProvinceFilter(e.target.value); setDistrictFilter('All'); setStoreFilter('All'); }}
            >
              <option value="All">ทุกจังหวัด</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">อำเภอ</label>
            <select
              aria-label="กรองตามอำเภอ"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={districtFilter}
              onChange={(e) => { setDistrictFilter(e.target.value); setStoreFilter('All'); }}
            >
              <option value="All">ทุกอำเภอ</option>
              {districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">ร้านค้า</label>
            <select
              aria-label="กรองตามร้านค้า"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="All">ทุกร้านค้า</option>
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">ตั้งแต่</label>
            <input
              aria-label="วันเริ่มต้น"
              type="date"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">ถึง</label>
            <input
              aria-label="วันสิ้นสุด"
              type="date"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="จำนวน Inv"
          value={totalTrips.toLocaleString()}
          icon="fa-truck"
          color="blue"
        />
        <MetricCard
          title="ปริมาณรวม"
          value={totalQty.toLocaleString()}
          subValue="ชิ้น"
          icon="fa-box-open"
          color="purple"
        />
        <MetricCard
          title="วันที่ส่งมากที่สุด"
          value={maxTripDay.nameThai}
          subValue={`${maxTripDay.count} Inv`}
          icon="fa-chart-line"
          color="emerald"
        />
        <MetricCard
          title="กิจกรรมวันหยุด"
          value={holidayTrips.toString()}
          subValue="Inv (อา.+วันหยุด)"
          icon="fa-calendar-week"
          color={holidayTrips > 0 ? "orange" : "gray"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-chart-bar text-indigo-500"></i> การกระจายปริมาณการจัดส่ง
          </h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analyticsData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EC4899" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#EC4899" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="nameThai" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    border: 'none',
                    padding: '12px'
                  }}
                  formatter={(value: any, name?: string) => [name === 'count' ? value.toLocaleString() : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name === 'count' ? 'Inv' : 'ชิ้น']}
                />
                <Bar yAxisId="left" dataKey="count" name="count" fill="url(#colorCount)" radius={[6, 6, 0, 0]} barSize={40}>
                  {analyticsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === maxTripDay.name ? '#10B981' : 'url(#colorCount)'} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="qty" name="qty" stroke="#EC4899" strokeWidth={3} dot={{ r: 4, fill: '#EC4899', strokeWidth: 2, stroke: '#fff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-white to-indigo-50/50">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-lightbulb text-amber-400"></i> AI วิเคราะห์
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-green-100 text-green-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-check"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">วันที่งานหนาแน่น</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    วัน{maxTripDay.nameThai}เป็นวันที่ยุ่งที่สุดมี {maxTripDay.count} Inv ควรเตรียมรถให้เพียงพอ
                  </p>
                </div>
              </li>

              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-orange-100 text-orange-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">ความเสี่ยงวันหยุด</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {holidayTrips > 0
                      ? `มี ${holidayTrips} Inv ในวันหยุด ตรวจสอบว่าร้านเปิดหรือไม่`
                      : "ไม่มีการจัดส่งในวันหยุด ลดความเสี่ยง KPI ไม่ผ่าน"}
                  </p>
                </div>
              </li>

              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-chart-pie"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">สมดุลงาน</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    เฉลี่ย {(totalQty / (totalTrips || 1)).toFixed(0)} ชิ้นต่อ Inv
                    {maxTripDay.qty > (totalQty / 7) * 1.5 ? ` วัน${maxTripDay.nameThai}มีปริมาณสูงผิดปกติ` : " ปริมาณกระจายดี"}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">สถิติย่อ</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">วันที่มีการส่ง</span>
                <span className="font-bold text-gray-900">{analyticsData.filter(d => d.count > 0).length} / 7</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-2 rounded-full dynamic-width-bar"
                  style={{ '--target-width': `${(analyticsData.filter(d => d.count > 0).length / 7) * 100}%` } as React.CSSProperties}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800">รายละเอียดแยกตามวัน</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100/50">
              <tr>
                <th className="px-6 py-4 font-bold">วัน</th>
                <th className="px-6 py-4 font-bold">จำนวน Inv.</th>
                <th className="px-6 py-4 font-bold">จำนวนชิ้น</th>
                <th className="px-6 py-4 font-bold">สัดส่วน</th>
                <th className="px-6 py-4 font-bold">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.map(day => {
                const percentage = totalTrips > 0 ? (day.count / totalTrips) * 100 : 0;
                return (
                  <tr key={day.name} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${day.count > 0 ? 'bg-indigo-400' : 'bg-gray-300'}`}></div>
                      {day.nameThai}
                    </td>
                    <td className="px-6 py-4 font-medium">{formatNum(day.count)}</td>
                    <td className="px-6 py-4">{formatQty(day.qty)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full dynamic-width-bar"
                            style={{ '--target-width': `${percentage}%` } as React.CSSProperties}
                          ></div>
                        </div>
                        <span className="text-xs">{percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {day.count === maxTripDay.count && day.count > 0 ? (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">สูงสุด</span>
                      ) : day.count === 0 ? (
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">ไม่มี</span>
                      ) : (
                        <span className="bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">ปกติ</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, subValue, icon, color }: any) => {
  const colorMap: any = {
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
    emerald: "bg-emerald-100 text-emerald-600",
    orange: "bg-orange-100 text-orange-600",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h4 className="text-2xl font-bold text-gray-900">{value}</h4>
        {subValue && <p className="text-xs font-medium text-gray-400 mt-1">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.blue}`}>
        <i className={`fas ${icon}`}></i>
      </div>
    </div>
  );
};
