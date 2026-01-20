import React, { useState } from 'react';
import { DeliveryRecord, KpiStatus, ReasonStatus } from '../types';
import { DELAY_REASONS } from '../constants';

interface KpiExceptionsProps {
  deliveries: DeliveryRecord[];
  onUpdateDelivery: (updated: DeliveryRecord) => void;
  userRole: string;
}

export const KpiExceptions: React.FC<KpiExceptionsProps> = ({ deliveries, onUpdateDelivery, userRole }) => {
  const exceptions = deliveries.filter(d => d.kpiStatus === KpiStatus.NOT_PASS);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryRecord | null>(null);
  const [reason, setReason] = useState('');

  const handleSubmitReason = () => {
    if (!selectedOrder) return;
    const updated: DeliveryRecord = {
      ...selectedOrder,
      delayReason: reason,
      reasonStatus: ReasonStatus.SUBMITTED,
      updatedAt: new Date().toISOString()
    };
    onUpdateDelivery(updated);
    setSelectedOrder(null);
    setReason('');
  };

  const handleApprove = (order: DeliveryRecord, status: ReasonStatus) => {
    const updated: DeliveryRecord = {
      ...order,
      reasonStatus: status,
      updatedAt: new Date().toISOString()
    };
    onUpdateDelivery(updated);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-pink-600">
            KPI Exceptions
          </h2>
          <p className="text-gray-500 mt-1">Manage and resolve delivery delays</p>
        </div>
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm">
          <i className="fas fa-exclamation-circle mr-2"></i>
          {exceptions.length} Issues Pending
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-bold">Order No</th>
                <th className="px-6 py-4 font-bold">District</th>
                <th className="px-6 py-4 font-bold">Planned</th>
                <th className="px-6 py-4 font-bold">Actual</th>
                <th className="px-6 py-4 font-bold">Delay</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map(order => (
                <tr key={order.orderNo} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{order.orderNo}</td>
                  <td className="px-6 py-4">{order.district}</td>
                  <td className="px-6 py-4 text-gray-400">{order.planDate}</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">{order.actualDate}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold border border-red-200">
                      +{order.delayDays} Days
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${order.reasonStatus === ReasonStatus.PENDING ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      order.reasonStatus === ReasonStatus.SUBMITTED ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        order.reasonStatus === ReasonStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                      {order.reasonStatus === ReasonStatus.NOT_REQUIRED ? 'No Action' : order.reasonStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {order.reasonStatus === ReasonStatus.PENDING && (
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all hover:shadow-md"
                      >
                        Add Reason
                      </button>
                    )}
                    {order.reasonStatus === ReasonStatus.SUBMITTED && userRole === 'Admin' && (
                      <div className="flex justify-center gap-2">
                        <button aria-label="Approve Reason" onClick={() => handleApprove(order, ReasonStatus.APPROVED)} className="w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-colors flex items-center justify-center">
                          <i className="fas fa-check"></i>
                        </button>
                        <button aria-label="Reject Reason" onClick={() => handleApprove(order, ReasonStatus.REJECTED)} className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center">
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}
                    {order.reasonStatus === ReasonStatus.SUBMITTED && userRole !== 'Admin' && (
                      <span className="text-xs text-gray-400 italic">Waiting Approval</span>
                    )}
                  </td>
                </tr>
              ))}
              {exceptions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                      <i className="fas fa-check-circle text-4xl text-green-200 mb-3"></i>
                      <p>Great Job! No KPI exceptions found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Glassmorphism */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform scale-100 transition-all">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-900">Submit Delay Reason</h3>
                <button aria-label="Close Modal" onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">Order No</span>
                    <span className="font-bold">{selectedOrder.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">District</span>
                    <span className="font-bold">{selectedOrder.district}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase block">Delay</span>
                    <span className="font-bold text-red-600">+{selectedOrder.delayDays} Days</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Select Reason Code</label>
                  <select
                    aria-label="Select Reason Code"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-200 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                  >
                    <option value="">-- Choose Reason --</option>
                    {DELAY_REASONS.map(r => (
                      <option key={r.code} value={r.label}>{r.code}: {r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50/50">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-gray-600 font-semibold text-sm hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!reason}
                onClick={handleSubmitReason}
                className="px-6 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5"
              >
                Submit Reason
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
