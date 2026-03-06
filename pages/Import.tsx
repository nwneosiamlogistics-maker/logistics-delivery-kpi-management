import React, { useState, useCallback } from 'react';
import { DeliveryRecord, KpiConfig, Holiday, StoreClosure, ImportLog, User, StoreMapping } from '../types';
import { parseExcelFile, processImport, ImportResult } from '../utils/excelParser';

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

    // Filter valid files
    const validFiles = files.filter(file => 
      validTypes.includes(file.type) || file.name.match(/\.(csv|xlsx|xls)$/i)
    );

    if (validFiles.length === 0) {
      setError('ประเภทไฟล์ไม่ถูกต้อง กรุณาอัปโหลดไฟล์ CSV หรือ Excel');
      return;
    }

    setIsUploading(true);
    setError(null);
    setImportResults([]);
    setTotalFiles(validFiles.length);
    setProcessedCount(0);

    const results: Array<{ fileName: string; result: ImportResult; error?: string }> = [];
    let allNewRecords: DeliveryRecord[] = [];
    let currentDeliveries = [...existingDeliveries];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setProcessedCount(i + 1);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsedRows = parseExcelFile(arrayBuffer);

        if (parsedRows.length === 0) {
          results.push({ fileName: file.name, result: { created: [], updated: [], skipped: [], errors: [{ row: 0, error: 'ไม่พบข้อมูลในไฟล์', data: {} }] }, error: 'ไม่พบข้อมูลในไฟล์' });
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

        results.push({ fileName: file.name, result });

        if (result.created.length > 0 || result.updated.length > 0) {
          // Update currentDeliveries for next file processing
          const newRecords = [...result.created, ...result.updated];
          allNewRecords = [...allNewRecords, ...newRecords];
          
          // Merge into currentDeliveries for next iteration
          const existingMap = new Map(currentDeliveries.map(d => [d.orderNo, d]));
          newRecords.forEach(r => existingMap.set(r.orderNo, r));
          currentDeliveries = Array.from(existingMap.values());

          const importLog: ImportLog = {
            id: importFileId,
            timestamp: new Date().toISOString(),
            fileName: file.name,
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
        results.push({ fileName: file.name, result: { created: [], updated: [], skipped: [], errors: [] }, error: err.message || 'ไม่สามารถประมวลผลไฟล์ได้' });
      }
    }

    setImportResults(results);
    setIsUploading(false);
  }, [existingDeliveries, kpiConfigs, holidays, storeClosures, currentUser, onImportComplete, isDataLoaded, storeMappings]);

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
  };

  // Calculate totals
  const totals = importResults.reduce((acc, r) => ({
    created: acc.created + r.result.created.length,
    updated: acc.updated + r.result.updated.length,
    skipped: acc.skipped + r.result.skipped.length,
    errors: acc.errors + r.result.errors.length,
    filesWithError: acc.filesWithError + (r.error ? 1 : 0)
  }), { created: 0, updated: 0, skipped: 0, errors: 0, filesWithError: 0 });

  return (
    <div className="space-y-8 animate-fade-in-up">
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
