import React, { useState, useMemo, useCallback } from 'react';
import { ImportLog, DeliveryRecord, KpiStatus, KpiConfig } from '../types';
import { displayDate } from '../utils/kpiEngine';
import { formatNum } from '../utils/formatters';
import * as XLSX from 'xlsx';

interface UploadHistoryProps {
  importLogs: ImportLog[];
  deliveries: DeliveryRecord[];
  kpiConfigs?: KpiConfig[];
  onUpdateDelivery?: (orderNo: string, updates: Partial<DeliveryRecord>) => Promise<void>;
}

export const UploadHistory: React.FC<UploadHistoryProps> = ({ importLogs, deliveries, kpiConfigs = [], onUpdateDelivery }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState<Record<string, string>>({});
  const [allDeliveriesPage, setAllDeliveriesPage] = useState(1);
  const [allDeliveriesSearch, setAllDeliveriesSearch] = useState('');
  const [allDeliveriesBranch, setAllDeliveriesBranch] = useState('');
  const [allDeliveriesProvince, setAllDeliveriesProvince] = useState('');
  const [allDeliveriesDistrict, setAllDeliveriesDistrict] = useState('');
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState('');
  const [savingQty, setSavingQty] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const itemsPerPage = 50;
  const EDIT_PASSWORD = 'sansan856';

  // Build district → branch map
  const districtBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    kpiConfigs.forEach(c => { if (c.branch && c.district) map.set(`${c.province || ''}||${c.district}`, c.branch); });
    return map;
  }, [kpiConfigs]);

  // Get branch for a delivery
  const getBranch = useCallback((d: DeliveryRecord): string => {
    const key = `${d.province || ''}||${d.district}`;
    const keyNoProvince = `||${d.district}`;
    return districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince) || '-';
  }, [districtBranchMap]);

  const filtered = useMemo(() => {
    if (!searchTerm) return importLogs;
    const term = searchTerm.toLowerCase();
    return importLogs.filter(log =>
      log.fileName.toLowerCase().includes(term) ||
      log.userName.toLowerCase().includes(term)
    );
  }, [importLogs, searchTerm]);

  const deliveryByFile = useMemo(() => {
    const map = new Map<string, DeliveryRecord[]>();
    deliveries.forEach(d => {
      if (d.importFileId) {
        if (!map.has(d.importFileId)) map.set(d.importFileId, []);
        map.get(d.importFileId)!.push(d);
      }
    });
    return map;
  }, [deliveries]);

  const totalCreated = importLogs.reduce((s, l) => s + l.created, 0);
  const totalUpdated = importLogs.reduce((s, l) => s + l.updated, 0);
  const totalErrors = importLogs.reduce((s, l) => s + l.errors, 0);

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.match(/\.xlsx?$/i)) return 'fa-file-excel text-green-500';
    if (fileName.match(/\.csv$/i)) return 'fa-file-csv text-blue-500';
    return 'fa-file text-gray-400';
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">
            ประวัติการอัปโหลดไฟล์
          </h2>
          <p className="text-gray-500 mt-1">รายการไฟล์ที่นำเข้าข้อมูลทั้งหมด</p>
        </div>
        <div className="text-right text-sm text-gray-400">
          ทั้งหมด <span className="font-bold text-indigo-600">{importLogs.length}</span> ไฟล์
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl">
          <p className="text-sm font-medium text-gray-500">รายการที่สร้างใหม่ทั้งหมด</p>
          <h3 className="text-3xl font-bold text-green-600 mt-1">{totalCreated.toLocaleString()}</h3>
        </div>
        <div className="glass-card p-6 rounded-2xl">
          <p className="text-sm font-medium text-gray-500">รายการที่อัปเดตทั้งหมด</p>
          <h3 className="text-3xl font-bold text-blue-600 mt-1">{totalUpdated.toLocaleString()}</h3>
        </div>
        <div className="glass-card p-6 rounded-2xl">
          <p className="text-sm font-medium text-gray-500">ข้อผิดพลาดสะสม</p>
          <h3 className={`text-3xl font-bold mt-1 ${totalErrors > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {totalErrors.toLocaleString()}
          </h3>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="ค้นหาชื่อไฟล์หรือผู้อัปโหลด..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl px-6 py-16 text-center text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <i className="fas fa-folder-open text-5xl text-gray-200"></i>
              <p className="font-semibold">ยังไม่มีประวัติการอัปโหลด</p>
              <p className="text-sm">ไปที่หน้า "นำเข้าข้อมูล" เพื่ออัปโหลดไฟล์แรก</p>
            </div>
          </div>
        )}

        {filtered.map((log, idx) => {
          const isExpanded = expandedId === log.id;
          const allFileDeliveries = deliveryByFile.get(log.id) || [];
          const fileQ = (fileSearch[log.id] || '').toLowerCase();
          const fileDeliveries = fileQ
            ? allFileDeliveries.filter(d =>
              d.orderNo.toLowerCase().includes(fileQ) ||
              (d.sender || '').toLowerCase().includes(fileQ) ||
              (d.province || '').toLowerCase().includes(fileQ) ||
              d.district.toLowerCase().includes(fileQ) ||
              d.storeId.toLowerCase().includes(fileQ)
            )
            : allFileDeliveries;

          return (
            <div key={log.id} className="glass-panel rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleExpand(log.id)}
                className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
              >
                <span className="text-gray-300 text-xs w-5">{filtered.length - idx}</span>
                <i className={`fas ${getFileIcon(log.fileName)} text-xl flex-shrink-0`}></i>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{log.fileName}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(log.timestamp)} · {log.userName}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100">
                    +{log.created}
                  </span>
                  {log.updated > 0 && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                      {log.updated} อัปเดต
                    </span>
                  )}
                  {log.errors > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-100">
                      {log.errors} error
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{log.recordsProcessed.toLocaleString()} รายการ</span>
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400 text-xs ml-2`}></i>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Error details */}
                  {log.errorDetails && log.errorDetails.length > 0 && (
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                      <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
                        <i className="fas fa-exclamation-circle"></i>
                        รายการที่เกิดข้อผิดพลาด ({log.errorDetails.length} แถว)
                      </p>
                      <div className="space-y-1">
                        {log.errorDetails.map((e, i) => (
                          <p key={i} className="text-xs text-red-600">
                            <span className="font-mono bg-red-100 px-1 rounded">แถว {e.row}</span> — {e.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Skipped details */}
                  {log.skippedDetails && log.skippedDetails.length > 0 && (
                    <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100">
                      <p className="text-xs font-bold text-yellow-700 mb-2 flex items-center gap-1.5">
                        <i className="fas fa-forward"></i>
                        รายการที่ข้ามเนื่องจาก Status ({log.skippedDetails.length} แถว)
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {log.skippedDetails.map((s, i) => (
                          <p key={i} className="text-xs text-yellow-700">
                            <span className="font-mono bg-yellow-100 px-1 rounded">แถว {s.row}</span> — {s.reason}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {allFileDeliveries.length === 0 ? (
                    <div className="px-6 py-6 text-center text-sm text-gray-400">
                      ไม่พบรายการ delivery ที่ผูกกับไฟล์นี้ (ไฟล์เก่าก่อนระบบ tracking)
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="px-4 py-3 border-b border-gray-100 bg-white">
                        <div className="relative max-w-md">
                          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs"></i>
                          <input
                            type="text"
                            placeholder="ค้นหา เลขที่ใบสั่ง, ผู้ส่ง, จังหวัด, อำเภอ, ร้านค้า..."
                            value={fileSearch[log.id] || ''}
                            onChange={e => setFileSearch(prev => ({ ...prev, [log.id]: e.target.value }))}
                            className="w-full pl-8 pr-4 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          {fileSearch[log.id] && (
                            <button
                              aria-label="ล้างการค้นหา"
                              onClick={() => setFileSearch(prev => ({ ...prev, [log.id]: '' }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                            >
                              <i className="fas fa-times text-xs"></i>
                            </button>
                          )}
                        </div>
                      </div>
                      <table className="w-full text-xs text-left text-gray-500">
                        <thead className="text-xs text-gray-600 uppercase bg-gray-50/80 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-3 font-bold">เลขที่ใบสั่ง</th>
                            <th className="px-4 py-3 font-bold">ผู้ส่ง</th>
                            <th className="px-4 py-3 font-bold">จังหวัด</th>
                            <th className="px-4 py-3 font-bold">อำเภอ</th>
                            <th className="px-4 py-3 font-bold">ร้านค้า</th>
                            <th className="px-4 py-3 font-bold">สถานะ</th>
                            <th className="px-4 py-3 font-bold">กำหนดส่ง</th>
                            <th className="px-4 py-3 font-bold">วันส่งเสร็จ</th>
                            <th className="px-4 py-3 font-bold">ล่าช้า</th>
                            <th className="px-4 py-3 font-bold">KPI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fileDeliveries.map(d => (
                            <tr key={d.orderNo} className="border-b border-gray-50 hover:bg-gray-50/40">
                              <td className="px-4 py-2.5 font-semibold text-gray-800">{d.orderNo}</td>
                              <td className="px-4 py-2.5 text-gray-600">{d.sender || '-'}</td>
                              <td className="px-4 py-2.5">{d.province || '-'}</td>
                              <td className="px-4 py-2.5">{d.district}</td>
                              <td className="px-4 py-2.5 font-mono">{d.storeId}</td>
                              <td className="px-4 py-2.5">
                                {d.deliveryStatus === 'ส่งเสร็จ' && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold border border-green-200">ส่งเสร็จ</span>
                                )}
                                {d.deliveryStatus === 'ขนส่ง' && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold border border-blue-200">ขนส่ง</span>
                                )}
                                {d.deliveryStatus === 'รอจัด' && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-bold border border-gray-200">รอจัด</span>
                                )}
                                {!d.deliveryStatus && <span className="text-gray-300">-</span>}
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 font-mono">{d.planDate}</td>
                              <td className="px-4 py-2.5 font-mono text-gray-700">
                                {d.deliveryStatus === 'ส่งเสร็จ' ? (
                                  <span className="text-green-700">{displayDate(d.actualDatetime || d.actualDate)}</span>
                                ) : (
                                  <span className="text-gray-300 italic text-xs">ยังไม่ส่ง</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {d.deliveryStatus === 'ส่งเสร็จ' ? (
                                  d.delayDays > 0 ? (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">+{d.delayDays}วัน</span>
                                  ) : (
                                    <span className="text-green-400 text-xs">ตรงเวลา</span>
                                  )
                                ) : (
                                  <span className="text-gray-300 text-xs">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {d.deliveryStatus === 'ส่งเสร็จ' ? (
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${d.kpiStatus === KpiStatus.PASS ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {d.kpiStatus === KpiStatus.PASS ? 'ผ่าน' : 'ไม่ผ่าน'}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 text-xs">รอผล</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-4 py-2 bg-gray-50/50 text-xs text-gray-400 text-right">
                        แสดง {formatNum(fileDeliveries.length)} รายการ
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All Deliveries Table with Pagination */}
      {deliveries.length > 0 && (() => {
        // Get all branches, provinces, districts
        const allBranches = Array.from(new Set(deliveries.map(d => getBranch(d)).filter(b => b && b !== '-'))).sort();
        const allProvinces = Array.from(new Set(deliveries.map(d => d.province).filter(Boolean))).sort() as string[];
        const filteredProvinceDistricts = allDeliveriesProvince 
          ? deliveries.filter(d => d.province === allDeliveriesProvince) 
          : deliveries;
        const allDistricts = Array.from(new Set(filteredProvinceDistricts.map(d => d.district).filter(Boolean))).sort() as string[];
        
        // Filter deliveries based on all filters
        const searchLower = allDeliveriesSearch.toLowerCase();
        let filteredDeliveries = deliveries;
        
        // Apply branch filter
        if (allDeliveriesBranch) {
          filteredDeliveries = filteredDeliveries.filter(d => getBranch(d) === allDeliveriesBranch);
        }
        
        // Apply province filter
        if (allDeliveriesProvince) {
          filteredDeliveries = filteredDeliveries.filter(d => d.province === allDeliveriesProvince);
        }
        
        // Apply district filter
        if (allDeliveriesDistrict) {
          filteredDeliveries = filteredDeliveries.filter(d => d.district === allDeliveriesDistrict);
        }
        
        // Apply search filter
        if (allDeliveriesSearch) {
          filteredDeliveries = filteredDeliveries.filter(d =>
            d.orderNo.toLowerCase().includes(searchLower) ||
            (d.sender || '').toLowerCase().includes(searchLower) ||
            (d.province || '').toLowerCase().includes(searchLower) ||
            d.district.toLowerCase().includes(searchLower) ||
            d.storeId.toLowerCase().includes(searchLower)
          );
        }
        
        // Sort by openDate descending
        const sortedDeliveries = [...filteredDeliveries].sort((a, b) => {
          const dateA = new Date(a.openDate || '');
          const dateB = new Date(b.openDate || '');
          return dateB.getTime() - dateA.getTime();
        });
        
        const totalPages = Math.ceil(sortedDeliveries.length / itemsPerPage);
        const startIndex = (allDeliveriesPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, sortedDeliveries.length);
        const paginatedDeliveries = sortedDeliveries.slice(startIndex, endIndex);
        
        return (
          <div className="glass-panel p-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 mt-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-indigo-800 flex items-center gap-2">
                <i className="fas fa-table text-indigo-600"></i>
                📋 รายการ Import ทั้งหมด ({formatNum(sortedDeliveries.length)} รายการ)
              </h3>
              <button
                onClick={() => {
                  const exportData = sortedDeliveries.map(d => ({
                    'เลขที่เอกสาร': d.orderNo,
                    'ร้านค้า': d.storeId,
                    'ผู้ส่ง': d.sender || '-',
                    'สาขา': getBranch(d),
                    'จังหวัด': d.province || '-',
                    'อำเภอ': d.district,
                    'จำนวน': d.qty,
                    'วันที่เปิดบิล': d.openDate || '-',
                    'กำหนดส่ง': d.planDate || '-',
                    'วันที่ส่งเสร็จ': d.actualDate || '-',
                    'สถานะ': d.deliveryStatus || '-',
                    'KPI': d.kpiStatus === KpiStatus.PASS ? 'ผ่าน' : d.kpiStatus === KpiStatus.NOT_PASS ? 'ไม่ผ่าน' : 'รอผล',
                    'ล่าช้า (วัน)': d.delayDays || 0
                  }));
                  const ws = XLSX.utils.json_to_sheet(exportData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'รายการ Import');
                  XLSX.writeFile(wb, `รายการ_Import_${new Date().toISOString().slice(0,10)}.xlsx`);
                }}
                className="px-4 py-2 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-file-excel"></i>
                Export Excel
              </button>
            </div>
            
            {/* Search and Filter */}
            <div className="mb-4 space-y-3">
              {/* Dropdowns Row */}
              <div className="flex flex-wrap gap-3">
                <select
                  value={allDeliveriesBranch}
                  onChange={e => { setAllDeliveriesBranch(e.target.value); setAllDeliveriesPage(1); }}
                  title="เลือกสาขา"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[140px]"
                >
                  <option value="">ทุกสาขา</option>
                  {allBranches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  value={allDeliveriesProvince}
                  onChange={e => { setAllDeliveriesProvince(e.target.value); setAllDeliveriesDistrict(''); setAllDeliveriesPage(1); }}
                  title="เลือกจังหวัด"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[160px]"
                >
                  <option value="">ทุกจังหวัด</option>
                  {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                  value={allDeliveriesDistrict}
                  onChange={e => { setAllDeliveriesDistrict(e.target.value); setAllDeliveriesPage(1); }}
                  title="เลือกอำเภอ"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[160px]"
                >
                  <option value="">ทุกอำเภอ</option>
                  {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {(allDeliveriesSearch || allDeliveriesBranch || allDeliveriesProvince || allDeliveriesDistrict) && (
                  <button
                    onClick={() => { setAllDeliveriesSearch(''); setAllDeliveriesBranch(''); setAllDeliveriesProvince(''); setAllDeliveriesDistrict(''); setAllDeliveriesPage(1); }}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                  >
                    <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
                  </button>
                )}
              </div>
              {/* Search Row */}
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input
                  type="text"
                  placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..."
                  value={allDeliveriesSearch}
                  onChange={e => { setAllDeliveriesSearch(e.target.value); setAllDeliveriesPage(1); }}
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
                {allDeliveriesSearch && (
                  <button
                    onClick={() => { setAllDeliveriesSearch(''); setAllDeliveriesPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="ล้างการค้นหา"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm bg-white rounded-lg">
                <thead>
                  <tr className="border-b border-indigo-200">
                    <th className="px-3 py-2 text-left text-indigo-700">เลขที่เอกสาร</th>
                    <th className="px-3 py-2 text-left text-indigo-700">ร้านค้า</th>
                    <th className="px-3 py-2 text-left text-indigo-700">ผู้ส่ง</th>
                    <th className="px-3 py-2 text-left text-indigo-700">สาขา</th>
                    <th className="px-3 py-2 text-left text-indigo-700">จังหวัด/อำเภอ</th>
                    <th className="px-3 py-2 text-right text-indigo-700">จำนวน</th>
                    <th className="px-3 py-2 text-left text-indigo-700">วันที่เปิดบิล</th>
                    <th className="px-3 py-2 text-left text-indigo-700">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-left text-indigo-700">วันที่ส่งเสร็จ</th>
                    <th className="px-3 py-2 text-left text-indigo-700">วันคืนบิล</th>
                    <th className="px-3 py-2 text-left text-indigo-700">วันที่บันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeliveries.map(doc => (
                    <tr key={doc.orderNo} className="border-b border-gray-100 hover:bg-indigo-50/30">
                      <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.sender || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{getBranch(doc)}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.province || ''}{doc.province && doc.district ? ' / ' : ''}{doc.district || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {editingQty === doc.orderNo ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              value={editQtyValue}
                              onChange={e => setEditQtyValue(e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-indigo-300 rounded text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                              step="0.01"
                              min="0"
                              autoFocus
                              placeholder="จำนวน"
                              title="แก้ไขจำนวนสินค้า"
                            />
                            <button
                              onClick={async () => {
                                if (!onUpdateDelivery) return;
                                setSavingQty(true);
                                try {
                                  await onUpdateDelivery(doc.orderNo, { qty: parseFloat(editQtyValue) || 0 });
                                  setEditingQty(null);
                                } finally {
                                  setSavingQty(false);
                                }
                              }}
                              disabled={savingQty}
                              className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                              title="บันทึก"
                            >
                              <i className={`fas ${savingQty ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                            </button>
                            <button
                              onClick={() => setEditingQty(null)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="ยกเลิก"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end group">
                            <span className={doc.qty && doc.qty > 10000 ? 'text-red-600 font-bold' : ''}>
                              {doc.qty || '-'}
                            </span>
                            {onUpdateDelivery && (
                              <button
                                onClick={() => {
                                  setShowPasswordModal(doc.orderNo);
                                  setEditQtyValue(String(doc.qty || 0));
                                  setPasswordInput('');
                                  setPasswordError('');
                                }}
                                className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="แก้ไขจำนวน"
                              >
                                <i className="fas fa-pencil text-xs"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{doc.openDate || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.planDate || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.actualDate || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.documentReturnBillDate || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.documentReturnedDate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-indigo-200">
                <span className="text-sm text-gray-600">
                  แสดง {formatNum(startIndex + 1)}-{formatNum(endIndex)} จาก {formatNum(sortedDeliveries.length)} รายการ
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAllDeliveriesPage(1)}
                    disabled={allDeliveriesPage === 1}
                    className="px-2 py-1 text-sm rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="หน้าแรก"
                  >
                    <i className="fas fa-angles-left"></i>
                  </button>
                  <button
                    onClick={() => setAllDeliveriesPage(p => Math.max(1, p - 1))}
                    disabled={allDeliveriesPage === 1}
                    className="px-2 py-1 text-sm rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ก่อนหน้า"
                  >
                    <i className="fas fa-angle-left"></i>
                  </button>
                  <span className="px-3 py-1 text-sm font-medium text-indigo-800">
                    หน้า {allDeliveriesPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setAllDeliveriesPage(p => Math.min(totalPages, p + 1))}
                    disabled={allDeliveriesPage === totalPages}
                    className="px-2 py-1 text-sm rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ถัดไป"
                  >
                    <i className="fas fa-angle-right"></i>
                  </button>
                  <button
                    onClick={() => setAllDeliveriesPage(totalPages)}
                    disabled={allDeliveriesPage === totalPages}
                    className="px-2 py-1 text-sm rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="หน้าสุดท้าย"
                  >
                    <i className="fas fa-angles-right"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fas fa-lock text-indigo-600"></i>
              ยืนยันรหัสผ่าน
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              กรุณาใส่รหัสผ่านเพื่อแก้ไขจำนวนสินค้า
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (passwordInput === EDIT_PASSWORD) {
                    setEditingQty(showPasswordModal);
                    setShowPasswordModal(null);
                    setPasswordInput('');
                  } else {
                    setPasswordError('รหัสผ่านไม่ถูกต้อง');
                  }
                }
              }}
              placeholder="ใส่รหัสผ่าน..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none mb-2"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-500 mb-3">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {passwordError}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowPasswordModal(null);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  if (passwordInput === EDIT_PASSWORD) {
                    setEditingQty(showPasswordModal);
                    setShowPasswordModal(null);
                    setPasswordInput('');
                  } else {
                    setPasswordError('รหัสผ่านไม่ถูกต้อง');
                  }
                }}
                className="flex-1 px-4 py-2 text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
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
