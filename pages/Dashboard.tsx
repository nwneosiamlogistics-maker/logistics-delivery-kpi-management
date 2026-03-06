import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DeliveryRecord, KpiStatus, KpiConfig } from '../types';

interface DashboardProps {
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
}

export const Dashboard: React.FC<DashboardProps> = ({ deliveries, kpiConfigs = [] }) => {
  const [branchFilter, setBranchFilter] = useState('All');
  const [provinceFilter, setProvinceFilter] = useState('All');
  const [districtFilter, setDistrictFilter] = useState('All');

  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  const branches = useMemo(() => Array.from(new Set(kpiConfigs.filter(c => c.branch).map(c => c.branch!))).sort(), [kpiConfigs]);
  const provinces = useMemo(() => Array.from(new Set(deliveries.map(d => d.province).filter(Boolean) as string[])).sort(), [deliveries]);
  const districts = useMemo(() => {
    let src = deliveries;
    if (provinceFilter !== 'All') src = src.filter(d => d.province === provinceFilter);
    return Array.from(new Set(src.map(d => d.district))).sort();
  }, [deliveries, provinceFilter]);

  const filtered = useMemo(() => deliveries.filter(d => {
    if (branchFilter !== 'All') {
      const key = `${d.province || ''}||${d.district}`;
      const keyNoProvince = `||${d.district}`;
      const branch = districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince);
      if (branch !== branchFilter) return false;
    }
    if (provinceFilter !== 'All' && d.province !== provinceFilter) return false;
    if (districtFilter !== 'All' && d.district !== districtFilter) return false;
    return true;
  }), [deliveries, branchFilter, provinceFilter, districtFilter, districtBranchMap]);

  // Exclude 'รอจัด' from KPI calculation (items not yet at branch)
  const activeDeliveries = filtered.filter(d => d.deliveryStatus !== 'รอจัด');
  const totalAll = filtered.length;
  const waitingCount = filtered.filter(d => d.deliveryStatus === 'รอจัด').length;
  const total = activeDeliveries.length;
  const passCount = activeDeliveries.filter(d => d.kpiStatus === KpiStatus.PASS).length;
  const failCount = total - passCount;
  const passRate = total > 0 ? (passCount / total) * 100 : 0;
  const totalQty = filtered.reduce((sum, d) => sum + d.qty, 0);

  const pieData = [
    { name: 'ตรงเวลา', value: passCount, color: '#10B981' },
    { name: 'ต้องดำเนินการ', value: failCount, color: '#EF4444' }
  ];

  const districtData = Array.from(new Set(activeDeliveries.map(d => d.district))).map(dist => {
    const distItems = activeDeliveries.filter(d => d.district === dist);
    return {
      name: dist,
      pass: distItems.filter(d => d.kpiStatus === KpiStatus.PASS).length,
      fail: distItems.filter(d => d.kpiStatus === KpiStatus.NOT_PASS).length,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white/40">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            ภาพรวมประสิทธิภาพ
          </h2>
          <p className="text-gray-500">ติดตาม KPI การจัดส่งแบบ Real-time</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {branches.length > 0 && (
            <select aria-label="สาขา" value={branchFilter}
              onChange={e => { setBranchFilter(e.target.value); setProvinceFilter('All'); setDistrictFilter('All'); }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white/70 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="All">ทุกสาขา</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select aria-label="จังหวัด" value={provinceFilter}
            onChange={e => { setProvinceFilter(e.target.value); setDistrictFilter('All'); }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white/70 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="All">ทุกจังหวัด</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="อำเภอ" value={districtFilter}
            onChange={e => setDistrictFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white/70 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="All">ทุกอำเภอ</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-500">อัปเดตล่าสุด</p>
            <p className="font-mono text-indigo-600 text-sm">{new Date().toLocaleTimeString('th-TH')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Inv. ทั้งหมด</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{totalAll.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <i className="fas fa-boxes"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            รวม <span className="text-blue-500 font-bold">{totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ชิ้น
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">ใช้คำนวณ KPI</p>
              <h3 className="text-2xl font-bold text-indigo-600 mt-1">{total.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <i className="fas fa-box"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ไม่รวม "รอจัด"
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">รอจัด</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{waitingCount.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <i className="fas fa-hourglass-half"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ยังไม่ถึงสาขา
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">KPI ผ่าน</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">{passCount.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <i className="fas fa-check-circle"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ส่งตรงเวลา
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">KPI ไม่ผ่าน</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{failCount.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <i className="fas fa-clock"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ส่งล่าช้า
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500">อัตรา KPI</p>
              <h3 className={`text-2xl font-bold mt-1 ${passRate >= 98 ? 'text-green-600' : passRate >= 90 ? 'text-amber-500' : 'text-red-600'}`}>
                {passRate.toFixed(1)}%
              </h3>
            </div>
            <div className={`p-2 rounded-lg ${passRate >= 98 ? 'bg-green-50 text-green-600' : passRate >= 90 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
              <i className="fas fa-chart-pie"></i>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div
              className={`h-1.5 rounded-full dynamic-width-bar ${passRate >= 98 ? 'bg-green-500' : passRate >= 90 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ '--target-width': `${passRate}%` } as React.CSSProperties}
            ></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-building text-indigo-500"></i> ประสิทธิภาพรายอำเภอ
          </h3>
          {districtData.length === 0 ? (
            <div className="h-[350px] flex items-center justify-center text-gray-300">
              <div className="text-center">
                <i className="fas fa-chart-bar text-5xl mb-3"></i>
                <p className="text-sm">ยังไม่มีข้อมูล</p>
              </div>
            </div>
          ) : (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={districtData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} />
                <Tooltip
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" formatter={(value) => value === 'pass' ? 'ตรงเวลา' : 'ล่าช้า'} />
                <Bar dataKey="pass" name="pass" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fail" name="fail" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-chart-donut text-indigo-500"></i> สถานะภาพรวม
          </h3>
          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-gray-800">{passRate.toFixed(0)}%</span>
              <span className="text-xs text-gray-400 uppercase tracking-wider">อัตราผ่าน</span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full bg-green-500"></span> ตรงเวลา
              </span>
              <span className="font-bold text-gray-900">{passCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full bg-red-500"></span> ต้องดำเนินการ
              </span>
              <span className="font-bold text-gray-900">{failCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
