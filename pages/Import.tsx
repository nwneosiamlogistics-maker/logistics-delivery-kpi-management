import React, { useState, useCallback } from 'react';
import { DeliveryRecord, KpiConfig, Holiday, StoreClosure, ImportLog, User, StoreMapping } from '../types';
import { parseExcelFile, processImport, ImportResult, previewExcelHeaders, ColumnPreview } from '../utils/excelParser';

interface ImportProps {
  onImportComplete: (newDeliveries: DeliveryRecord[], importLog: ImportLog) => void;
  existingDeliveries: DeliveryRecord[];
  kpiConfigs: KpiConfig[];
  holidays: Holiday[];
  storeClosures: StoreClosure[];
  currentUser: User;
  isDataLoaded?: boolean;
  storeMappings?: StoreMapping[];
}

export const Import: React.FC<ImportProps> = ({
  onImportComplete,
  existingDeliveries,
  kpiConfigs,
  holidays,
  storeClosures,
  currentUser,
  isDataLoaded = true,
  storeMappings = []
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [importResults, setImportResults] = useState<Array<{ fileName: string; result: ImportResult; error?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  // Step 2: Column mapping preview state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [columnPreviews, setColumnPreviews] = useState<Array<{ fileName: string; preview: ColumnPreview; buffer: ArrayBuffer }>>([]);
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  // Step 1: Read headers and show mapping preview
  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;

    if (!isDataLoaded) {
      setError('⚠️ กรุณารอให้ข้อมูลโหลดเสร็จก่อนนำเข้าข้อมูลใหม่ (รีเฟรชหน้าแล้วรอสักครู่)');
      return;
    }

    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const validFiles = files.filter(file => 
      validTypes.includes(file.type) || file.name.match(/\.(csv|xlsx|xls)$/i)
    );

    if (validFiles.length === 0) {
      setError('ประเภทไฟล์ไม่ถูกต้อง กรุณาอัปโหลดไฟล์ CSV หรือ Excel');
      return;
    }

    setError(null);
    setImportResults([]);

    // Read headers from first file and show preview
    try {
      const previews: Array<{ fileName: string; preview: ColumnPreview; buffer: ArrayBuffer }> = [];
      for (const file of validFiles) {
        const buffer = await file.arrayBuffer();
        const preview = previewExcelHeaders(buffer);
        previews.push({ fileName: file.name, preview, buffer });
      }
      setPendingFiles(validFiles);
      setColumnPreviews(previews);
      setColumnOverrides({});
      setShowColumnMapping(true);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถอ่านไฟล์ได้');
    }
  }, [isDataLoaded]);

  // Step 2: Process files after user confirms column mapping
  const processFiles = useCallback(async () => {
    setShowColumnMapping(false);
    setIsUploading(true);
    setTotalFiles(columnPreviews.length);
    setProcessedCount(0);

    const results: Array<{ fileName: string; result: ImportResult; error?: string }> = [];
    let allNewRecords: DeliveryRecord[] = [];
    let currentDeliveries = [...existingDeliveries];

    const overrides = Object.keys(columnOverrides).length > 0 ? columnOverrides : undefined;

    for (let i = 0; i < columnPreviews.length; i++) {
      const { fileName, buffer } = columnPreviews[i];
      setProcessedCount(i + 1);

      try {
        const parsedRows = parseExcelFile(buffer, overrides);

        if (parsedRows.length === 0) {
          results.push({ fileName, result: { created: [], updated: [], skipped: [], errors: [{ row: 0, error: 'ไม่พบข้อมูลในไฟล์', data: {} }], warnings: [] }, error: 'ไม่พบข้อมูลในไฟล์' });
          continue;
        }

        const importFileId = `log-${Date.now()}-${i}`;
        const result = processImport(
          parsedRows,
          currentDeliveries,
          kpiConfigs,
          holidays,
          storeClosures,
          importFileId,
          storeMappings
        );

        results.push({ fileName, result });

        if (result.created.length > 0 || result.updated.length > 0) {
          const newRecords = [...result.created, ...result.updated];
          allNewRecords = [...allNewRecords, ...newRecords];
          
          const existingMap = new Map(currentDeliveries.map(d => [d.orderNo, d]));
          newRecords.forEach(r => existingMap.set(r.orderNo, r));
          currentDeliveries = Array.from(existingMap.values());

          const importLog: ImportLog = {
            id: importFileId,
            timestamp: new Date().toISOString(),
            fileName,
            userId: currentUser.id,
            userName: currentUser.name,
            recordsProcessed: parsedRows.length,
            created: result.created.length,
            updated: result.updated.length,
            skipped: result.skipped.length,
            errors: result.errors.length,
            errorDetails: result.errors.map(e => ({ row: e.row, error: e.error })),
            skippedDetails: result.skipped.map(s => ({ row: s.row, reason: s.reason }))
          };

          onImportComplete(newRecords, importLog);
        }
      } catch (err: any) {
        results.push({ fileName, result: { created: [], updated: [], skipped: [], errors: [], warnings: [] }, error: err.message || 'ไม่สามารถประมวลผลไฟล์ได้' });
      }
    }

    setImportResults(results);
    setIsUploading(false);
    setPendingFiles([]);
    setColumnPreviews([]);
  }, [columnPreviews, columnOverrides, existingDeliveries, kpiConfigs, holidays, storeClosures, currentUser, onImportComplete, storeMappings]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, [handleFiles]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  }, [handleFiles]);

  const resetForm = () => {
    setImportResults([]);
    setError(null);
    setProcessedCount(0);
    setTotalFiles(0);
    setPendingFiles([]);
    setColumnPreviews([]);
    setColumnOverrides({});
    setShowColumnMapping(false);
  };

  // Calculate totals
  const totals = importResults.reduce((acc, r) => ({
    created: acc.created + r.result.created.length,
    updated: acc.updated + r.result.updated.length,
    skipped: acc.skipped + r.result.skipped.length,
    errors: acc.errors + r.result.errors.length,
    filesWithError: acc.filesWithError + (r.error ? 1 : 0)
  }), { created: 0, updated: 0, skipped: 0, errors: 0, filesWithError: 0 });

  // Derive first preview for the column mapping modal
  const firstPreview = columnPreviews.length > 0 ? columnPreviews[0].preview : null;

  // Compute effective column map (auto + overrides) for display
  const effectiveMap = firstPreview ? { ...firstPreview.columnMap, ...columnOverrides } : {};
  const hasQtyColumn = Object.values(effectiveMap).includes('qty');
  const hasWeightColumn = Object.values(effectiveMap).includes('weight');

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ===== Column Mapping Modal ===== */}
      {showColumnMapping && firstPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-full">
                    <i className="fas fa-columns text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">ตรวจสอบการ Map คอลัมน์</h3>
                    <p className="text-indigo-100 text-sm">{columnPreviews.length} ไฟล์ • ตัวอย่าง: {firstPreview.sampleRows.length > 0 ? columnPreviews[0].fileName : '-'}</p>
                  </div>
                </div>
                <button aria-label="ปิด" onClick={resetForm} className="text-white/70 hover:text-white">
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Warning if no qty but has weight */}
              {!hasQtyColumn && hasWeightColumn && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>
                  <div>
                    <p className="font-bold text-amber-900">ไม่พบคอลัมน์ "จำนวนชิ้น" — พบเฉพาะ "น้ำหนัก"</p>
                    <p className="text-amber-700 text-sm mt-1">กรุณาเลือกว่าจะใช้คอลัมน์น้ำหนักเป็นจำนวนชิ้นหรือไม่ (ค่าน้ำหนักไม่ใช่จำนวนกล่อง)</p>
                  </div>
                </div>
              )}

              {/* Column mapping table */}
              <div>
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <i className="fas fa-table text-indigo-500"></i>
                  คอลัมน์ที่ตรวจพบ
                </h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-gray-700">ชื่อคอลัมน์ (Excel)</th>
                        <th className="px-4 py-2.5 text-left font-bold text-gray-700">ตัวอย่างข้อมูล</th>
                        <th className="px-4 py-2.5 text-left font-bold text-gray-700">ระบบตรวจพบว่า</th>
                        <th className="px-4 py-2.5 text-center font-bold text-gray-700">ใช้เป็น qty?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {firstPreview.headers.map((h, i) => {
                        const autoMap = firstPreview.columnMap[h];
                        const effectiveMapping = effectiveMap[h];
                        const isWeight = effectiveMapping === 'weight';
                        const isQty = effectiveMapping === 'qty';
                        const sampleVal = firstPreview.sampleRows[0]?.[h] ?? '';
                        return (
                          <tr key={i} className={`border-t border-gray-100 ${isWeight ? 'bg-amber-50/50' : isQty ? 'bg-green-50/50' : ''}`}>
                            <td className="px-4 py-2 font-mono text-gray-800 font-medium">{h}</td>
                            <td className="px-4 py-2 text-gray-500 truncate max-w-[150px]">{String(sampleVal).substring(0, 40)}</td>
                            <td className="px-4 py-2">
                              {isQty && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">จำนวนชิ้น (qty)</span>}
                              {isWeight && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">น้ำหนัก (weight)</span>}
                              {autoMap && !isWeight && !isQty && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">{autoMap}</span>}
                              {!autoMap && !columnOverrides[h] && <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {(isWeight || isQty || !autoMap) && (
                                <button
                                  onClick={() => {
                                    if (isQty && autoMap === 'qty') {
                                      // Already auto-mapped as qty, can't toggle off
                                      return;
                                    }
                                    setColumnOverrides(prev => {
                                      const next = { ...prev };
                                      if (next[h] === 'qty') {
                                        // Revert to original
                                        delete next[h];
                                      } else {
                                        // Set this column as qty
                                        // Remove qty override from other columns first
                                        Object.keys(next).forEach(k => { if (next[k] === 'qty') delete next[k]; });
                                        next[h] = 'qty';
                                      }
                                      return next;
                                    });
                                  }}
                                  className={`w-8 h-8 rounded-lg transition-all ${
                                    isQty
                                      ? 'bg-green-500 text-white shadow-md'
                                      : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                                  }`}
                                  title={isQty ? 'ใช้เป็นจำนวนชิ้นแล้ว' : 'เลือกเป็นจำนวนชิ้น'}
                                >
                                  <i className={`fas ${isQty ? 'fa-check' : 'fa-plus'}`}></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2">
                <button onClick={resetForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">
                  <i className="fas fa-arrow-left mr-2"></i>ยกเลิก
                </button>
                <button
                  onClick={processFiles}
                  disabled={!hasQtyColumn}
                  className={`px-6 py-2.5 rounded-xl font-bold transition-all ${
                    hasQtyColumn
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:-translate-y-0.5'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <i className="fas fa-file-import mr-2"></i>
                  ยืนยันและนำเข้า ({columnPreviews.length} ไฟล์)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-emerald-600">
            นำเข้าข้อมูลการจัดส่ง
          </h2>
          <p className="text-gray-500 mt-1">อัปโหลดไฟล์ CSV หรือ Excel ที่มีข้อมูลการจัดส่ง</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div
            className={`glass-panel rounded-2xl p-8 transition-all ${
              dragActive ? 'border-2 border-blue-500 bg-blue-50/50' : 'border-2 border-dashed border-gray-200'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <div className="mb-4">
                <div className={`inline-flex p-4 rounded-full ${dragActive ? 'bg-blue-100' : 'bg-green-50'}`}>
                  <i className={`fas fa-file-excel text-4xl ${dragActive ? 'text-blue-500' : 'text-green-500'}`}></i>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {dragActive ? 'วางไฟล์ที่นี่' : 'ลากและวางไฟล์ข้อมูลการจัดส่ง'}
              </h3>
              <p className="text-gray-500 mb-6 text-sm">
                รองรับไฟล์: CSV, XLSX, XLS (เลือกได้หลายไฟล์พร้อมกัน)
              </p>
              <input
                type="file"
                className="hidden"
                id="file-upload"
                accept=".csv,.xlsx,.xls"
                multiple
                onChange={handleInputChange}
              />
              <label
                htmlFor="file-upload"
                className={`inline-flex items-center px-6 py-3 rounded-xl font-bold cursor-pointer transition-all ${
                  isUploading
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:-translate-y-0.5'
                }`}
              >
                {isUploading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    กำลังประมวลผล...
                  </>
                ) : (
                  <>
                    <i className="fas fa-upload mr-2"></i>
                    เลือกไฟล์
                  </>
                )}
              </label>
            </div>
          </div>

          {error && (
            <div className="glass-panel rounded-2xl p-6 border-l-4 border-red-500 bg-red-50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <i className="fas fa-exclamation-circle text-red-600"></i>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-red-900">นำเข้าไม่สำเร็จ</h4>
                  <p className="text-red-700 text-sm mt-1">{error}</p>
                </div>
                <button aria-label="ปิด" onClick={resetForm} className="text-red-400 hover:text-red-600">
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
          )}

          {/* Progress indicator */}
          {isUploading && totalFiles > 0 && (
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <i className="fas fa-spinner fa-spin text-2xl text-green-500"></i>
                <div className="flex-1">
                  <p className="font-bold text-gray-900">กำลังประมวลผล...</p>
                  <p className="text-sm text-gray-500">ไฟล์ที่ {processedCount} / {totalFiles}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all" 
                      style={{ width: `${(processedCount / totalFiles) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {importResults.length > 0 && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-full">
                      <i className="fas fa-check-circle text-white"></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-white">นำเข้าสำเร็จ</h4>
                      <p className="text-green-100 text-sm">{importResults.length} ไฟล์ {totals.filesWithError > 0 && `(${totals.filesWithError} ไฟล์มีข้อผิดพลาด)`}</p>
                    </div>
                  </div>
                  <button aria-label="ปิด" onClick={resetForm} className="text-white/70 hover:text-white">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Total summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-green-600 font-bold uppercase mb-1">สร้างใหม่</p>
                    <p className="text-2xl font-black text-green-700">{totals.created}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-blue-600 font-bold uppercase mb-1">อัปเดต</p>
                    <p className="text-2xl font-black text-blue-700">{totals.updated}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-600 font-bold uppercase mb-1">ข้าม</p>
                    <p className="text-2xl font-black text-gray-700">{totals.skipped}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-red-600 font-bold uppercase mb-1">ข้อผิดพลาด</p>
                    <p className="text-2xl font-black text-red-700">{totals.errors}</p>
                  </div>
                </div>

                {/* Per-file results */}
                <div className="space-y-3">
                  <h5 className="font-bold text-gray-800 flex items-center gap-2">
                    <i className="fas fa-list text-gray-500"></i>
                    รายละเอียดแต่ละไฟล์
                  </h5>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {importResults.map((r, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border ${r.error ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <i className={`fas ${r.error ? 'fa-times-circle text-red-500' : 'fa-check-circle text-green-500'}`}></i>
                            <span className="font-medium text-gray-800 text-sm">{r.fileName}</span>
                          </div>
                          {!r.error && (
                            <span className="text-xs text-gray-500">
                              {r.result.created.length} ใหม่, {r.result.updated.length} อัปเดต, {r.result.skipped.length} ข้าม
                            </span>
                          )}
                        </div>
                        {r.error && <p className="text-sm text-red-600 mt-1">{r.error}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <i className="fas fa-columns text-indigo-500"></i>
              คอลัมน์ที่จำเป็น
            </h4>
            <div className="space-y-3">
              {[
                { name: 'orderNo', desc: 'เลขที่ใบสั่ง (ไม่ซ้ำ)', required: true },
                { name: 'district', desc: 'อำเภอ/เขต', required: true },
                { name: 'storeId', desc: 'รหัสร้านค้า', required: true },
                { name: 'planDate', desc: 'วันที่กำหนดส่ง', required: true },
                { name: 'actualDate', desc: 'วันที่ส่งจริง', required: true },
                { name: 'qty', desc: 'จำนวนชิ้น', required: true },
              ].map((col) => (
                <div key={col.name} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <span className={`w-2 h-2 rounded-full ${col.required ? 'bg-red-500' : 'bg-gray-300'}`}></span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">{col.name}</p>
                    <p className="text-xs text-gray-500">{col.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <i className="fas fa-info-circle text-blue-500"></i>
              กฎการนำเข้า
            </h4>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <i className="fas fa-check text-green-500 mt-1"></i>
                <span>ตรวจจับข้อมูลซ้ำ (orderNo เดียวกัน) อัตโนมัติ</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-check text-green-500 mt-1"></i>
                <span>ข้อมูลใหม่กว่าจะอัปเดตทับข้อมูลเดิม</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-check text-green-500 mt-1"></i>
                <span>คำนวณ KPI อัตโนมัติ (รวมวันหยุด)</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-check text-green-500 mt-1"></i>
                <span>คำนวณวันในสัปดาห์จากวันที่ส่งจริง</span>
              </li>
            </ul>
          </div>

          <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-amber-50 to-orange-50">
            <h4 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
              <i className="fas fa-lightbulb text-amber-500"></i>
              เคล็ดลับ
            </h4>
            <p className="text-sm text-amber-800">
              ชื่อคอลัมน์ยืดหยุ่นได้ ใช้รูปแบบใดก็ได้:
              <span className="font-mono text-xs bg-amber-100 px-1 mx-1 rounded">orderNo</span>,
              <span className="font-mono text-xs bg-amber-100 px-1 mx-1 rounded">order_no</span>,
              <span className="font-mono text-xs bg-amber-100 px-1 rounded">เลขที่ใบสั่ง</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
