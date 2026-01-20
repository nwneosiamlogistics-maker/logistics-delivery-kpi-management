import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DeliveryRecord, KpiStatus } from '../types';
import { getKpiInsights } from '../services/geminiService';

interface DashboardProps {
  deliveries: DeliveryRecord[];
}

export const Dashboard: React.FC<DashboardProps> = ({ deliveries }) => {
  const [aiInsight, setAiInsight] = useState<string>('Analyzing data for insights...');

  useEffect(() => {
    const fetchInsight = async () => {
      // In a real app, we might debounce this or check if insights are already cached
      const insight = await getKpiInsights(deliveries);
      setAiInsight(insight || 'Unable to load insights.');
    };
    fetchInsight();
  }, [deliveries]);

  const total = deliveries.length;
  const passCount = deliveries.filter(d => d.kpiStatus === KpiStatus.PASS).length;
  const failCount = total - passCount;
  const passRate = total > 0 ? (passCount / total) * 100 : 0;

  const pieData = [
    { name: 'On Target', value: passCount, color: '#10B981' },
    { name: 'Actions Required', value: failCount, color: '#EF4444' }
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
      {/* Header */}
      <div className="flex justify-between items-center bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white/40">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Performance Overview
          </h2>
          <p className="text-gray-500">Real-time logistics KPI monitoring</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-500">Last Updated</p>
          <p className="font-mono text-indigo-600">{new Date().toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Deliveries</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{total}</h3>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <i className="fas fa-box"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            <span className="text-indigo-500 font-bold">100%</span> processed
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">On-Time (KPI)</p>
              <h3 className="text-3xl font-bold text-green-600 mt-1">{passCount}</h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl">
              <i className="fas fa-check-circle"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            Target: <span className="text-gray-600">98%</span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Delayed</p>
              <h3 className="text-3xl font-bold text-red-600 mt-1">{failCount}</h3>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <i className="fas fa-clock"></i>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            Requires reason submission
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Global KPI Rate</p>
              <h3 className={`text-3xl font-bold mt-1 ${passRate >= 98 ? 'text-green-600' : 'text-amber-500'}`}>
                {passRate.toFixed(1)}%
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${passRate >= 98 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
              <i className="fas fa-chart-pie"></i>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full ${passRate >= 98 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${passRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-building text-indigo-500"></i> Performance by District
          </h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={districtData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} />
                <Tooltip
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="pass" name="On Time" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fail" name="Delayed" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-chart-donut text-indigo-500"></i> Overall Status
          </h3>
          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
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
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-gray-800">{passRate.toFixed(0)}%</span>
              <span className="text-xs text-gray-400 uppercase tracking-wider">Pass Rate</span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full bg-green-500"></span> On Target
              </span>
              <span className="font-bold text-gray-900">{passCount}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full bg-red-500"></span> Actions Required
              </span>
              <span className="font-bold text-gray-900">{failCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights Banner */}
      <div className="glass-panel p-1 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500">
        <div className="bg-white/95 backdrop-blur-md rounded-xl p-6 flex flex-col md:flex-row gap-6 items-center">
          <div className="p-4 bg-indigo-50 rounded-full shrink-0">
            <i className="fas fa-robot text-2xl text-indigo-600 animate-pulse"></i>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">
              AI Performance Analysis
            </h4>
            <p className="text-gray-600 italic leading-relaxed">
              "{aiInsight}"
            </p>
          </div>
          <div className="hidden md:block">
            <button className="px-6 py-2 bg-indigo-50 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-100 transition-colors text-sm">
              View Detailed Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
