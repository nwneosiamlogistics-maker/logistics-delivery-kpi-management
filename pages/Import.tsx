
import React, { useState } from 'react';
import { DeliveryRecord, KpiStatus, ReasonStatus } from '../types';
import { calculateKpiStatus, getWeekday } from '../utils/kpiEngine';
import { HOLIDAYS, KPI_CONFIGS } from '../constants';

interface ImportProps {
  onImportComplete: (newDeliveries: DeliveryRecord[]) => void;
}

export const Import: React.FC<ImportProps> = ({ onImportComplete }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [importLog, setImportLog] = useState<{ created: number, updated: number, skipped: number } | null>(null);

  const simulateImport = () => {
    setIsUploading(true);
    // Simulating file processing
    setTimeout(() => {
      const newItems: DeliveryRecord[] = [
        {
          orderNo: 'ORD' + Math.floor(Math.random() * 10000).toString().padStart(5, '0'),
          district: 'Bangkok',
          storeId: 'STR-X' + Math.floor(Math.random() * 99),
          planDate: '2024-05-24',
          actualDate: '2024-05-27',
          qty: 150,
          ...calculateKpiStatus('2024-05-24', '2024-05-27', 'Bangkok', KPI_CONFIGS, HOLIDAYS),
          updatedAt: new Date().toISOString(),
          weekday: getWeekday('2024-05-27')
        },
        {
          orderNo: 'ORD' + Math.floor(Math.random() * 10000).toString().padStart(5, '0'),
          district: 'Nonthaburi',
          storeId: 'STR-Y' + Math.floor(Math.random() * 99),
          planDate: '2024-05-24',
          actualDate: '2024-05-25',
          qty: 60,
          ...calculateKpiStatus('2024-05-24', '2024-05-25', 'Nonthaburi', KPI_CONFIGS, HOLIDAYS),
          updatedAt: new Date().toISOString(),
          weekday: getWeekday('2024-05-25')
        }
      ];

      onImportComplete(newItems);
      setImportLog({ created: 2, updated: 0, skipped: 0 });
      setIsUploading(false);
    }, 1500);
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Import Delivery Data</h2>
      
      <div className="max-w-3xl">
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center hover:border-blue-500 transition-colors bg-gray-50">
          <div className="mb-4">
            <i className="fas fa-file-excel text-5xl text-green-500"></i>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Drag and drop your delivery file</h3>
          <p className="text-gray-500 mb-6 text-sm">Supported formats: CSV, XLSX. Ensure 'orderNo' is present.</p>
          <input type="file" className="hidden" id="file-upload" />
          <button 
            onClick={simulateImport}
            disabled={isUploading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
          >
            {isUploading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
            {isUploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>

        {importLog && (
          <div className="mt-8 p-6 bg-green-50 border border-green-100 rounded-xl">
            <h4 className="font-bold text-green-900 mb-4 flex items-center">
              <i className="fas fa-check-circle mr-2"></i> Import Successful
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 font-bold uppercase">New Records</p>
                <p className="text-2xl font-black text-green-900">{importLog.created}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 font-bold uppercase">Updated</p>
                <p className="text-2xl font-black text-green-900">{importLog.updated}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 font-bold uppercase">Duplicates Skipped</p>
                <p className="text-2xl font-black text-green-900">{importLog.skipped}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 border-t border-gray-100 pt-8">
          <h4 className="font-bold text-gray-900 mb-4">Required Column Mapping</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold">1</span>
              <div>
                <p className="text-sm font-bold">orderNo</p>
                <p className="text-xs text-gray-500">Primary unique key</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold">2</span>
              <div>
                <p className="text-sm font-bold">planDate</p>
                <p className="text-xs text-gray-500">Expected delivery date</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold">3</span>
              <div>
                <p className="text-sm font-bold">actualDate</p>
                <p className="text-xs text-gray-500">Actual completion date</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold">4</span>
              <div>
                <p className="text-sm font-bold">qty</p>
                <p className="text-xs text-gray-500">Units delivered</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
