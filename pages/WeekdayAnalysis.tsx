import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line
} from 'recharts';
import { DeliveryRecord } from '../types';
import { getWeekday } from '../utils/kpiEngine';

interface WeekdayAnalysisProps {
  deliveries: DeliveryRecord[];
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const WeekdayAnalysis: React.FC<WeekdayAnalysisProps> = ({ deliveries }) => {
  // State for Filters
  const [districtFilter, setDistrictFilter] = useState<string>('All');
  const [storeFilter, setStoreFilter] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // unique values for dropdowns
  const districts = useMemo(() => Array.from(new Set(deliveries.map(d => d.district))), [deliveries]);
  const stores = useMemo(() => {
    let filtered = deliveries;
    if (districtFilter !== 'All') {
      filtered = filtered.filter(d => d.district === districtFilter);
    }
    return Array.from(new Set(filtered.map(d => d.storeId)));
  }, [deliveries, districtFilter]);

  // Filter Data
  const filteredData = useMemo(() => {
    return deliveries.filter(d => {
      const matchDistrict = districtFilter === 'All' || d.district === districtFilter;
      const matchStore = storeFilter === 'All' || d.storeId === storeFilter;

      let matchDate = true;
      if (startDate) matchDate = matchDate && d.actualDate >= startDate;
      if (endDate) matchDate = matchDate && d.actualDate <= endDate;

      return matchDistrict && matchStore && matchDate;
    });
  }, [deliveries, districtFilter, storeFilter, startDate, endDate]);

  // Aggregate Data
  const analyticsData = useMemo(() => {
    const map = new Map(WEEKDAYS.map(day => [day, { name: day, count: 0, qty: 0 }]));

    filteredData.forEach(d => {
      // Robust weekday calculation
      const dayName = getWeekday(d.actualDate);
      // Ensure it matches our WEEKDAYS array (case sensitive?)
      // getWeekday returns "Monday", etc.
      if (map.has(dayName)) {
        const entry = map.get(dayName)!;
        entry.count += 1;
        entry.qty += d.qty;
      }
    });

    return WEEKDAYS.map(day => map.get(day)!);
  }, [filteredData]);

  // Metrics
  const totalTrips = analyticsData.reduce((s, d) => s + d.count, 0);
  const totalQty = analyticsData.reduce((s, d) => s + d.qty, 0);
  const maxTripDay = analyticsData.reduce((prev, current) => (prev.count > current.count) ? prev : current, analyticsData[0]);
  const minTripDay = analyticsData.filter(d => d.count > 0).reduce((prev, current) => (prev.count < current.count) ? prev : current, { name: '-', count: 0 } as any);

  const weekendTrips = analyticsData.filter(d => d.name === 'Saturday' || d.name === 'Sunday').reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header & Controls */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col lg:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Weekday Pattern Analysis
          </h2>
          <p className="text-gray-500 mt-1">Optimize delivery schedules based on historical traffic patterns</p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">District</label>
            <select
              aria-label="Filter by District"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
            >
              <option value="All">All Districts</option>
              {districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Store</label>
            <select
              aria-label="Filter by Store"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="All">All Stores</option>
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">From</label>
            <input
              aria-label="Start Date"
              type="date"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">To</label>
            <input
              aria-label="End Date"
              type="date"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Trips"
          value={totalTrips.toLocaleString()}
          icon="fa-truck"
          color="blue"
        />
        <MetricCard
          title="Total Volume"
          value={totalQty.toLocaleString()}
          subValue="Units"
          icon="fa-box-open"
          color="purple"
        />
        <MetricCard
          title="Peak Day"
          value={maxTripDay.name}
          subValue={`${maxTripDay.count} Trips`}
          icon="fa-chart-line"
          color="emerald"
        />
        <MetricCard
          title="Weekend Activity"
          value={weekendTrips.toString()}
          subValue="Trips (Sat-Sun)"
          icon="fa-calendar-week"
          color={weekendTrips > 0 ? "orange" : "gray"}
        />
      </div>

      {/* Charts & Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="xl:col-span-2 glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fas fa-chart-bar text-indigo-500"></i> Delivery Volume Distribution
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
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} dy={10} />
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
                />
                <Bar yAxisId="left" dataKey="count" name="Trips" fill="url(#colorCount)" radius={[6, 6, 0, 0]} barSize={40}>
                  {analyticsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === maxTripDay.name ? '#10B981' : 'url(#colorCount)'} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="qty" name="Qty" stroke="#EC4899" strokeWidth={3} dot={{ r: 4, fill: '#EC4899', strokeWidth: 2, stroke: '#fff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Insights Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-white to-indigo-50/50">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-lightbulb text-amber-400"></i> AI Insights
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-green-100 text-green-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-check"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Peak Efficiency</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {maxTripDay.name} is your busiest day with {maxTripDay.count} trips. Ensure maximum fleet availability on this day.
                  </p>
                </div>
              </li>

              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-orange-100 text-orange-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Weekend Risk</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {weekendTrips > 0
                      ? `${weekendTrips} trips scheduled on weekends. Verify store opening hours to avoid KPI failure.`
                      : "No weekend deliveries detected. Low risk of closure-related delays."}
                  </p>
                </div>
              </li>

              <li className="flex gap-3 items-start p-3 bg-white/60 rounded-lg shadow-sm">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                  <i className="fas fa-chart-pie"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Load Balance</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    Average of {(totalQty / (totalTrips || 1)).toFixed(0)} items per trip.
                    {maxTripDay.qty > (totalQty / 7) * 1.5 ? ` ${maxTripDay.name} has unusually high volume.` : " Volume is well distributed."}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Active Days</span>
                <span className="font-bold text-gray-900">{analyticsData.filter(d => d.count > 0).length} / 7</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${(analyticsData.filter(d => d.count > 0).length / 7) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800">Detailed Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100/50">
              <tr>
                <th className="px-6 py-4 font-bold">Weekday</th>
                <th className="px-6 py-4 font-bold">Delivery Count</th>
                <th className="px-6 py-4 font-bold">Total Quantity</th>
                <th className="px-6 py-4 font-bold">Proportion</th>
                <th className="px-6 py-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.map(day => {
                const percentage = totalTrips > 0 ? (day.count / totalTrips) * 100 : 0;
                return (
                  <tr key={day.name} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${day.count > 0 ? 'bg-indigo-400' : 'bg-gray-300'}`}></div>
                      {day.name}
                    </td>
                    <td className="px-6 py-4 font-medium">{day.count}</td>
                    <td className="px-6 py-4">{day.qty.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <span className="text-xs">{percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {day.count === maxTripDay.count && day.count > 0 ? (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">Peak</span>
                      ) : day.count === 0 ? (
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">Inactive</span>
                      ) : (
                        <span className="bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">Normal</span>
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

// Sub-component for metric cards
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
