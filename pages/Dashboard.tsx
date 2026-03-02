import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DeliveryRecord, KpiStatus } from '../types';

interface DashboardProps {
  deliveries: DeliveryRecord[];
}

export const Dashboard: React.FC<DashboardProps> = ({ deliveries }) => {
  const total = deliveries.length;
  const passCount = deliveries.filter(d => d.kpiStatus === KpiStatus.PASS).length;
  const failCount = total - passCount;
  const passRate = total > 0 ? (passCount / total) * 100 : 0;
  const totalQty = deliveries.reduce((sum, d) => sum + d.qty, 0);

  const pieData = [
    { name: 'ตรงเวลา', value: passCount, color: '#10B981' },
    { name: 'ต้องดำเนินการ', value: failCount, color: '#EF4444' }
  ];

  const districtData = Array.from(new Set(deliveries.map(d => d.district))).map(dist => {
    const distItems = deliveries.filter(d => d.district === dist);
    return {
      name: dist,
      pass: distItems.filter(d => d.kpiStatus === KpiStatus.PASS).length,
      fail: distItems.filter(d => d.kpiStatus === KpiStatus.NOT_PASS).length,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex justify-between items-center bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white/40">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            ภาพรวมประสิทธิภาพ
          </h2>
          <p className="text-gray-500">ติดตาม KPI การจัดส่งแบบ Real-time</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-500">อัปเดตล่าสุด</p>
          <p className="font-mono text-indigo-600">{new Date().toLocaleTimeString('th-TH')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">จำนวน Inv.</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{total.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <i className="fas fa-box"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            รวม <span className="text-indigo-500 font-bold">{totalQty.toLocaleString()}</span> ชิ้น
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">ส่งตรงเวลา (KPI ผ่าน)</p>
              <h3 className="text-3xl font-bold text-green-600 mt-1">{passCount.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl">
              <i className="fas fa-check-circle"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            เป้าหมาย: <span className="text-gray-600">98%</span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">ส่งล่าช้า (KPI ไม่ผ่าน)</p>
              <h3 className="text-3xl font-bold text-red-600 mt-1">{failCount.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <i className="fas fa-clock"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            ต้องระบุเหตุผล
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">อัตรา KPI ผ่าน</p>
              <h3 className={`text-3xl font-bold mt-1 ${passRate >= 98 ? 'text-green-600' : passRate >= 90 ? 'text-amber-500' : 'text-red-600'}`}>
                {passRate.toFixed(1)}%
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${passRate >= 98 ? 'bg-green-50 text-green-600' : passRate >= 90 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
              <i className="fas fa-chart-pie"></i>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
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
