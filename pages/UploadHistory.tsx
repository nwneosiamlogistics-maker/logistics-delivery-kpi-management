import React, { useState, useMemo } from 'react';
import { ImportLog, DeliveryRecord, KpiStatus } from '../types';

interface UploadHistoryProps {
  importLogs: ImportLog[];
  deliveries: DeliveryRecord[];
}

export const UploadHistory: React.FC<UploadHistoryProps> = ({ importLogs, deliveries }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState<Record<string, string>>({});

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
  const totalErrors  = importLogs.reduce((s, l) => s + l.errors, 0);

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
    if (fileName.match(/\.csv$/i))   return 'fa-file-csv text-blue-500';
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
                                  <span className="text-green-700">{d.actualDatetime || d.actualDate}</span>
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
                        แสดง {fileDeliveries.length.toLocaleString()} รายการ
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
