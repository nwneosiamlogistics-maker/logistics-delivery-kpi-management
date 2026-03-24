import React, { useState, useMemo, useCallback } from 'react';
import { DeliveryRecord, KpiConfig, DocumentImportLog } from '../types';
import { formatQty } from '../utils/formatters';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface DocumentImportProps {
  deliveries: DeliveryRecord[];
  onUpdateDeliveries: (deliveries: DeliveryRecord[]) => void;
  kpiConfigs?: KpiConfig[];
  documentImportLogs?: DocumentImportLog[];
  onSaveDocumentImportLog?: (log: DocumentImportLog) => void;
}

interface ExtractedDoc {
  orderNo: string;
  found: boolean;
  selected: boolean;
  sourceFile?: string;
  sourceDate?: string;
  // New fields for status check
  isDelivered?: boolean;  // สถานะ "ส่งเสร็จ" หรือยัง
  actualDate?: string;    // วันที่ส่งจริง
  calculatedReturnDate?: string;  // วันคืนเอกสาร = actualDate + 1
  deliveryStatus?: string; // สถานะปัจจุบัน
  // Additional fields for display
  storeId?: string;
  sender?: string;
  province?: string;
  district?: string;
  qty?: number;
  openDate?: string;
  planDate?: string;
}

interface FileInfo {
  fileName: string;
  orderCount: number;
  extractedDate: string | null;
}

// Parse date from PDF header text (format: "วันที่ DD/MM/YYYY" or "DD/MM/YYYY")
function parsePdfDate(text: string): string | null {
  // Match patterns like "วันที่ 25/2/2026" or "25/02/2026"
  const patterns = [
    /วันที่\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /วันที่\s*(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      // Handle 2-digit year
      if (year.length === 2) {
        year = '20' + year;
      }
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

export const DocumentImport: React.FC<DocumentImportProps> = ({ deliveries, onUpdateDeliveries, kpiConfigs = [], documentImportLogs = [], onSaveDocumentImportLog }) => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedDocs, setExtractedDocs] = useState<ExtractedDoc[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pdfReturnDate, setPdfReturnDate] = useState<string | null>(null);
  const [manualReturnDate, setManualReturnDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [returnedSearch, setReturnedSearch] = useState('');
  const [returnedBranch, setReturnedBranch] = useState('');
  const [returnedProvince, setReturnedProvince] = useState('');
  const [returnedDistrict, setReturnedDistrict] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressLabel, setUploadProgressLabel] = useState('');
  const itemsPerPage = 50;

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

  const allReturnedDocs = useMemo(() => {
    return deliveries
      .filter(d => d.documentReturned)
      .sort((a, b) => {
        const dateA = new Date(a.documentReturnedDate || '');
        const dateB = new Date(b.documentReturnedDate || '');
        return dateB.getTime() - dateA.getTime();
      });
  }, [deliveries]);

  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsExtracting(true);
    setUploadProgress(0);
    setUploadProgressLabel('กำลังเตรียมไฟล์...');
    setExtractedDocs([]);
    setUploadedFiles([]);
    setImportSuccess(null);
    
    const allExtracted: ExtractedDoc[] = [];
    const fileInfos: FileInfo[] = [];
    const deliveryMap = new Map(deliveries.map(d => [d.orderNo, d]));
    const seenOrderNos = new Set<string>();
    let latestDate: string | null = null;
    
    try {
      // Load all PDFs in parallel
      setUploadProgressLabel('กำลังโหลดไฟล์ PDF...');
      const pdfDocs = await Promise.all(
        Array.from(files).map(async file => {
          const arrayBuffer = await file.arrayBuffer();
          return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        })
      );
      const totalPages = pdfDocs.reduce((sum, pdf) => sum + pdf.numPages, 0);
      
      // Process each file (parallel pages within each file)
      let processedPages = 0;
      for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
        const file = files[fileIdx];
        const pdf = pdfDocs[fileIdx];
        const orderNos: string[] = [];
        let extractedDate: string | null = null;
        
        setUploadProgressLabel(`ไฟล์ ${fileIdx + 1}/${files.length} · ประมวลผล ${pdf.numPages} หน้า...`);
        const pageTexts = await Promise.all(
          Array.from({ length: pdf.numPages }, async (_, i) => {
            const page = await pdf.getPage(i + 1);
            const textContent = await page.getTextContent();
            return textContent.items.map((item: any) => item.str).join(' ');
          })
        );
        pageTexts.forEach((text, i) => {
          if (i === 0) extractedDate = parsePdfDate(text);
          const matches = text.match(/\*?B\d{10}(\/\d+)?/g);
          if (matches) orderNos.push(...matches);
        });
        processedPages += pdf.numPages;
        const pct = Math.round((processedPages / totalPages) * 100);
        setUploadProgress(pct);
        setUploadProgressLabel(`ไฟล์ ${fileIdx + 1}/${files.length} เสร็จแล้ว (${pct}%)`);
        
        // Track file info
        const uniqueFileOrderNos = [...new Set(orderNos)];
        fileInfos.push({
          fileName: file.name,
          orderCount: uniqueFileOrderNos.length,
          extractedDate
        });
        
        // Update latest date (use the most recent date found)
        if (extractedDate) {
          if (!latestDate || extractedDate > latestDate) {
            latestDate = extractedDate;
          }
        }
        
        // Add to extracted docs (deduplicate across files)
        for (const orderNo of uniqueFileOrderNos) {
          if (!seenOrderNos.has(orderNo)) {
            seenOrderNos.add(orderNo);
            const delivery = deliveryMap.get(orderNo);
            const found = !!delivery;
            const isDelivered = delivery?.deliveryStatus === 'ส่งเสร็จ';
            const actualDate = delivery?.actualDate || '';
            
            // คำนวณวันคืนเอกสาร = วันที่จาก PDF (ถ้ามี) หรือ actualDate + 1 วัน
            let calculatedReturnDate = '';
            if (isDelivered) {
              // PDF เป็นหลัก - ใช้วันที่จาก PDF ถ้ามี
              if (extractedDate) {
                calculatedReturnDate = extractedDate;
              } else if (actualDate) {
                const d = new Date(actualDate);
                d.setDate(d.getDate() + 1);
                calculatedReturnDate = d.toISOString().slice(0, 10);
              }
            }
            
            allExtracted.push({
              orderNo,
              found,
              selected: isDelivered, // เลือกเฉพาะที่ส่งเสร็จแล้ว
              sourceFile: file.name,
              sourceDate: extractedDate || undefined,
              isDelivered,
              actualDate,
              calculatedReturnDate,
              deliveryStatus: delivery?.deliveryStatus || 'ไม่พบ',
              storeId: delivery?.storeId || '-',
              sender: delivery?.sender || '-',
              province: delivery?.province || '-',
              district: delivery?.district || '-',
              qty: delivery?.qty || 0,
              openDate: delivery?.openDate || '-',
              planDate: delivery?.planDate || '-'
            });
          }
        }
      }
      
      setPdfReturnDate(latestDate);
      setManualReturnDate(latestDate || new Date().toISOString().slice(0, 10));
      setUploadedFiles(fileInfos);
      setExtractedDocs(allExtracted);
    } catch (error) {
      console.error('PDF extraction error:', error);
      alert('ไม่สามารถอ่านไฟล์ PDF ได้ กรุณาลองใหม่');
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  }, [deliveries]);

  const handleManualAdd = useCallback(() => {
    const lines = manualInput.split(/[\n,\s]+/).map(s => s.trim()).filter(s => s);
    // รองรับรูปแบบ: *B0926128689, B0926128689, *B0926128689/1, B0926128689/1
    const orderNos = lines.filter(s => /^\*?B\d{10}(\/\d+)?$/.test(s));
    if (orderNos.length === 0) {
      alert('ไม่พบเลขที่เอกสารที่ถูกต้อง (รูปแบบ: B หรือ *B + ตัวเลข 10 หลัก)');
      return;
    }
    
    // สร้าง map สำหรับค้นหา delivery
    const deliveryMap = new Map(deliveries.map(d => [d.orderNo, d]));
    
    const newDocs: ExtractedDoc[] = orderNos
      .filter(orderNo => !extractedDocs.some(d => d.orderNo === orderNo))
      .map(orderNo => {
        const delivery = deliveryMap.get(orderNo);
        const found = !!delivery;
        const isDelivered = delivery?.deliveryStatus === 'ส่งเสร็จ';
        const actualDate = delivery?.actualDate || '';
        
        // คำนวณวันคืนเอกสาร = actualDate + 1 วัน
        let calculatedReturnDate = '';
        if (isDelivered && actualDate) {
          const d = new Date(actualDate);
          d.setDate(d.getDate() + 1);
          calculatedReturnDate = d.toISOString().slice(0, 10);
        }
        
        return {
          orderNo,
          found,
          selected: isDelivered, // เลือกเฉพาะที่ส่งเสร็จแล้ว
          isDelivered,
          actualDate,
          calculatedReturnDate,
          deliveryStatus: delivery?.deliveryStatus || 'ไม่พบ',
          // Additional fields for display
          storeId: delivery?.storeId || '-',
          sender: delivery?.sender || '-',
          province: delivery?.province || '-',
          district: delivery?.district || '-',
          qty: delivery?.qty || 0,
          openDate: delivery?.openDate || '-',
          planDate: delivery?.planDate || '-'
        };
      });
    
    setExtractedDocs(prev => [...prev, ...newDocs]);
    setManualInput('');
    // ไม่ปิด panel เพื่อให้เห็นผลลัพธ์
  }, [manualInput, deliveries, extractedDocs]);

  const toggleSelection = useCallback((orderNo: string) => {
    setExtractedDocs(prev => prev.map(d => 
      d.orderNo === orderNo ? { ...d, selected: !d.selected } : d
    ));
  }, []);

  const handleConfirmImport = useCallback(() => {
    // กรอง เฉพาะที่เลือก + ส่งเสร็จแล้ว
    const selectedDocs = extractedDocs.filter(d => d.selected && d.isDelivered);
    if (selectedDocs.length === 0) {
      alert('กรุณาเลือกรายการที่ส่งเสร็จแล้วเท่านั้น');
      return;
    }
    
    // สร้าง map ของ orderNo → { returnDate, source }
    const returnInfoMap = new Map(selectedDocs.map(d => [d.orderNo, {
      returnDate: d.calculatedReturnDate || '',
      source: d.sourceFile ? 'pdf' as const : 'manual' as const  // ถ้ามี sourceFile = มาจาก PDF
    }]));
    
    // วันที่บันทึก = วันนี้
    const today = new Date().toISOString().slice(0, 10);
    const updatedDeliveries = deliveries.map(d => {
      const info = returnInfoMap.get(d.orderNo);
      if (info) {
        const isPdf = info.source === 'pdf';
        // ถ้าเป็น PDF → เขียนทับเสมอ
        // ถ้าเป็น manual และข้อมูลเดิมมาจาก PDF → ไม่เขียนทับ (PDF เป็นหลัก)
        if (!isPdf && d.documentReturnSource === 'pdf') {
          // ไม่เขียนทับ - ข้อมูลเดิมมาจาก PDF
          return d;
        }
        
        // วันคืนบิล = วันที่จาก PDF หรือ actualDate + 1 วัน (หรือ manual override)
        const billReturnDate = manualReturnDate || info.returnDate || today;
        return { 
          ...d, 
          documentReturned: true, 
          documentReturnedDate: today,
          documentReturnBillDate: billReturnDate,
          documentReturnSource: info.source  // บันทึกแหล่งข้อมูล
        };
      }
      return d;
    });
    
    const pdfCount = selectedDocs.filter(d => d.sourceFile).length;
    const manualCount = selectedDocs.length - pdfCount;
    const skippedCount = selectedDocs.filter(d => !d.sourceFile && deliveries.find(del => del.orderNo === d.orderNo)?.documentReturnSource === 'pdf').length;
    
    onUpdateDeliveries(updatedDeliveries);
    let msg = `บันทึกสำเร็จ ${selectedDocs.length - skippedCount} รายการ`;
    if (pdfCount > 0) msg += ` (📄 PDF: ${pdfCount})`;
    if (manualCount - skippedCount > 0) msg += ` (⌨️ พิมพ์เอง: ${manualCount - skippedCount})`;
    if (skippedCount > 0) msg += ` (ข้าม ${skippedCount} รายการที่เคย Import PDF ไปแล้ว)`;
    setImportSuccess(msg);
    if (onSaveDocumentImportLog) {
      const docLog: DocumentImportLog = {
        id: `doclog_${Date.now()}`,
        timestamp: new Date().toISOString(),
        fileNames: uploadedFiles.map(f => f.fileName),
        returnDate: manualReturnDate || '',
        confirmedCount: selectedDocs.length - skippedCount,
        pdfCount,
        manualCount: manualCount - skippedCount,
      };
      onSaveDocumentImportLog(docLog);
    }
    setExtractedDocs([]);
    setPdfReturnDate(null);
    setManualReturnDate('');
  }, [extractedDocs, deliveries, onUpdateDeliveries, manualReturnDate, uploadedFiles, onSaveDocumentImportLog]);

  const removeExtracted = useCallback((orderNo: string) => {
    setExtractedDocs(prev => prev.filter(d => d.orderNo !== orderNo));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <i className="fas fa-file-import text-teal-500"></i>
          Import ใบส่งคืนเอกสาร
        </h2>
        <p className="text-sm text-gray-500 mt-1">อัปโหลดไฟล์ PDF ใบส่งคืนเอกสาร หรือพิมพ์เลขที่เอกสารเอง</p>
      </div>

      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer">
            <input type="file" accept=".pdf" multiple onChange={handlePdfUpload} className="hidden" disabled={isExtracting} />
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isExtracting ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-teal-500 text-white hover:bg-teal-600'}`}>
              {isExtracting ? (<><i className="fas fa-spinner fa-spin"></i>กำลังอ่าน PDF...</>) : (<><i className="fas fa-file-pdf"></i>เลือกไฟล์ PDF (เลือกได้หลายไฟล์)</>)}
            </span>
          </label>
          <button onClick={() => setShowManualInput(!showManualInput)} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
            <i className="fas fa-keyboard"></i>พิมพ์เลขที่เอง
          </button>
        </div>

        {isExtracting && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-teal-700 font-medium flex items-center gap-2">
                <i className="fas fa-file-pdf text-red-400"></i>
                {uploadProgressLabel}
              </span>
              <span className="text-sm font-bold text-teal-700">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {showManualInput && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">พิมพ์หรือวางเลขที่เอกสาร (คั่นด้วย Enter, comma หรือ space)</p>
            <textarea value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="B0926131146&#10;B0926131697" className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-teal-500 outline-none" />
            <button onClick={handleManualAdd} className="mt-2 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600">เพิ่มรายการ</button>
          </div>
        )}

        {importSuccess && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
            <i className="fas fa-check-circle"></i>{importSuccess}
          </div>
        )}

        {extractedDocs.length > 0 && (
          <div className="mt-4">
            {/* Files Summary */}
            {uploadedFiles.length > 0 && (
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <i className="fas fa-files text-blue-600"></i>
                  ไฟล์ที่อัปโหลด ({uploadedFiles.length} ไฟล์)
                </h4>
                <div className="space-y-1">
                  {uploadedFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      <i className="fas fa-file-pdf text-red-500"></i>
                      <span className="font-medium text-gray-700">{f.fileName}</span>
                      <span className="text-blue-600">{f.orderCount} รายการ</span>
                      {f.extractedDate && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          วันที่: {f.extractedDate}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-blue-200 text-sm text-blue-700 font-medium">
                  รวมทั้งหมด (หลังตัดซ้ำ): {extractedDocs.length} รายการ
                </div>
              </div>
            )}

            {/* Return Date Preview & Input */}
            <div className="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <i className="fas fa-calendar-alt text-amber-600"></i>
                  <span className="font-medium text-gray-700">วันคืนบิล:</span>
                </div>
                <input
                  type="date"
                  value={manualReturnDate}
                  onChange={e => setManualReturnDate(e.target.value)}
                  title="วันคืนบิล"
                  aria-label="วันคืนบิล"
                  className="px-3 py-1.5 border border-amber-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-amber-400 outline-none bg-white"
                />
                {pdfReturnDate && (
                  <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                    <i className="fas fa-file-pdf mr-1"></i>จาก PDF: {pdfReturnDate}
                  </span>
                )}
                {!pdfReturnDate && (
                  <span className="text-xs text-gray-500">
                    <i className="fas fa-info-circle mr-1"></i>ไม่พบวันที่ใน PDF - กรุณาระบุเอง
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700">
                พบ {extractedDocs.length} รายการ 
                <span className="text-sm text-gray-500 ml-2">
                  (✅ ส่งเสร็จ: {extractedDocs.filter(d => d.isDelivered).length}, 
                  ⏳ ยังไม่ส่ง: {extractedDocs.filter(d => d.found && !d.isDelivered).length}, 
                  ❌ ไม่พบ: {extractedDocs.filter(d => !d.found).length})
                </span>
              </h4>
              <button onClick={() => { setExtractedDocs([]); setPdfReturnDate(null); setManualReturnDate(''); }} className="text-sm text-red-500 hover:text-red-600"><i className="fas fa-times mr-1"></i>ล้างทั้งหมด</button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <input type="checkbox" aria-label="เลือกทั้งหมด" checked={extractedDocs.filter(d => d.isDelivered).every(d => d.selected)} onChange={e => setExtractedDocs(prev => prev.map(d => d.isDelivered ? { ...d, selected: e.target.checked } : d))} className="rounded border-gray-300 text-teal-500 focus:ring-teal-500" />
                    </th>
                    <th className="px-2 py-2 text-left text-xs">เลขที่เอกสาร</th>
                    <th className="px-2 py-2 text-left text-xs">ร้านค้า</th>
                    <th className="px-2 py-2 text-left text-xs">ผู้ส่ง</th>
                    <th className="px-2 py-2 text-left text-xs">สาขา</th>
                    <th className="px-2 py-2 text-left text-xs">จังหวัด/อำเภอ</th>
                    <th className="px-2 py-2 text-center text-xs">จำนวน</th>
                    <th className="px-2 py-2 text-left text-xs">วันเปิดบิล</th>
                    <th className="px-2 py-2 text-left text-xs">กำหนดส่ง</th>
                    <th className="px-2 py-2 text-left text-xs">ส่งเสร็จ</th>
                    <th className="px-2 py-2 text-left text-xs">วันคืนเอกสาร</th>
                    <th className="px-2 py-2 text-left text-xs">สถานะ</th>
                    <th className="px-2 py-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {extractedDocs.map(doc => (
                    <tr key={doc.orderNo} className={`border-t ${!doc.found ? 'bg-red-50' : !doc.isDelivered ? 'bg-amber-50' : ''}`}>
                      <td className="px-2 py-2"><input type="checkbox" aria-label={`เลือก ${doc.orderNo}`} checked={doc.selected} onChange={() => toggleSelection(doc.orderNo)} disabled={!doc.isDelivered} className="rounded border-gray-300 text-teal-500 focus:ring-teal-500 disabled:opacity-30" /></td>
                      <td className="px-2 py-2 font-mono text-xs">{doc.orderNo}</td>
                      <td className="px-2 py-2 text-xs text-gray-600">{doc.storeId || '-'}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 max-w-[120px] truncate" title={doc.sender}>{doc.sender || '-'}</td>
                      <td className="px-2 py-2 text-xs text-gray-600">{doc.found ? getBranch({ district: doc.district || '', province: doc.province || '' } as DeliveryRecord) : '-'}</td>
                      <td className="px-2 py-2 text-xs text-gray-600">{doc.province || '-'} / {doc.district || '-'}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-600">{doc.qty != null && doc.qty > 0 ? formatQty(doc.qty) : <span className="text-gray-300">-</span>}</td>
                      <td className="px-2 py-2 font-mono text-xs text-gray-500">{doc.openDate || '-'}</td>
                      <td className="px-2 py-2 font-mono text-xs text-gray-500">{doc.planDate || '-'}</td>
                      <td className="px-2 py-2 font-mono text-xs text-gray-600">{doc.actualDate || '-'}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {doc.calculatedReturnDate ? (
                          <span className="text-teal-700 font-medium">{doc.calculatedReturnDate}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {!doc.found ? (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">❌</span>
                        ) : doc.isDelivered ? (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">✅</span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">⏳</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center"><button onClick={() => removeExtracted(doc.orderNo)} className="text-gray-400 hover:text-red-500" aria-label={`ลบ ${doc.orderNo}`}><i className="fas fa-times"></i></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleConfirmImport} disabled={!extractedDocs.some(d => d.selected && d.isDelivered)} className="px-6 py-2 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                <i className="fas fa-check"></i>ยืนยัน Import ({extractedDocs.filter(d => d.selected && d.isDelivered).length} รายการที่ส่งเสร็จ)
              </button>
            </div>
          </div>
        )}
      </div>

      {allReturnedDocs.length > 0 && (() => {
        // Get provinces and districts for filters
        const allProvinces = Array.from(new Set(allReturnedDocs.map(d => d.province).filter(Boolean))).sort() as string[];
        const filteredByProv = returnedProvince ? allReturnedDocs.filter(d => d.province === returnedProvince) : allReturnedDocs;
        const allDistricts = Array.from(new Set(filteredByProv.map(d => d.district).filter(Boolean))).sort() as string[];
        
        // Apply filters
        const searchLower = returnedSearch.toLowerCase();
        let filteredDocs = allReturnedDocs;
        if (returnedProvince) filteredDocs = filteredDocs.filter(d => d.province === returnedProvince);
        if (returnedDistrict) filteredDocs = filteredDocs.filter(d => d.district === returnedDistrict);
        if (returnedSearch) filteredDocs = filteredDocs.filter(d => 
          d.orderNo.toLowerCase().includes(searchLower) || 
          (d.sender || '').toLowerCase().includes(searchLower) ||
          d.storeId.toLowerCase().includes(searchLower)
        );
        
        const totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredDocs.length);
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        return (
          <div className="glass-panel p-6 rounded-2xl border-2 border-teal-300 bg-teal-50">
            <h3 className="text-base font-bold text-teal-800 mb-4 flex items-center gap-2">
              <i className="fas fa-list-check text-teal-600"></i>
              📋 รายการที่บันทึกส่งคืนทั้งหมด ({filteredDocs.length} รายการ)
            </h3>
            
            {/* Filters */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <select value={returnedProvince} onChange={e => { setReturnedProvince(e.target.value); setReturnedDistrict(''); setCurrentPage(1); }} title="เลือกจังหวัด" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกจังหวัด</option>
                  {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={returnedDistrict} onChange={e => { setReturnedDistrict(e.target.value); setCurrentPage(1); }} title="เลือกอำเภอ" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white min-w-[160px]">
                  <option value="">ทุกอำเภอ</option>
                  {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {(returnedSearch || returnedProvince || returnedDistrict) && (
                  <button onClick={() => { setReturnedSearch(''); setReturnedProvince(''); setReturnedDistrict(''); setCurrentPage(1); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    <i className="fas fa-times mr-1"></i>ล้างตัวกรอง
                  </button>
                )}
              </div>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" placeholder="ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า..." value={returnedSearch} onChange={e => { setReturnedSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white" />
                {returnedSearch && <button onClick={() => { setReturnedSearch(''); setCurrentPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="ล้างการค้นหา"><i className="fas fa-times"></i></button>}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm bg-white rounded-lg">
                <thead>
                  <tr className="border-b border-teal-200">
                    <th className="px-3 py-2 text-left text-teal-700">เลขที่เอกสาร</th>
                    <th className="px-3 py-2 text-left text-teal-700">ร้านค้า</th>
                    <th className="px-3 py-2 text-left text-teal-700">ผู้ส่ง</th>
                    <th className="px-3 py-2 text-left text-teal-700">สาขา</th>
                    <th className="px-3 py-2 text-left text-teal-700">จังหวัด/อำเภอ</th>
                    <th className="px-3 py-2 text-right text-teal-700">จำนวน</th>
                    <th className="px-3 py-2 text-left text-teal-700">วันที่เปิดบิล</th>
                    <th className="px-3 py-2 text-left text-teal-700">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-left text-teal-700">วันที่ส่งเสร็จ</th>
                    <th className="px-3 py-2 text-left text-teal-700">วันคืนบิล</th>
                    <th className="px-3 py-2 text-left text-teal-700">วันที่บันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDocs.map(doc => (
                    <tr key={doc.orderNo} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.sender || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{getBranch(doc)}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.province || ''}{doc.province && doc.district ? ' / ' : ''}{doc.district || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{doc.qty != null && doc.qty > 0 ? formatQty(doc.qty) : <span className="text-gray-300">-</span>}</td>
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
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-teal-200">
                <span className="text-sm text-gray-600">
                  แสดง {startIndex + 1}-{endIndex} จาก {allReturnedDocs.length} รายการ
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-sm rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="หน้าแรก"
                  >
                    <i className="fas fa-angles-left"></i>
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-sm rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ก่อนหน้า"
                  >
                    <i className="fas fa-angle-left"></i>
                  </button>
                  <span className="px-3 py-1 text-sm font-medium text-teal-800">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-sm rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ถัดไป"
                  >
                    <i className="fas fa-angle-right"></i>
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-sm rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Document Import History */}
      {documentImportLogs.length > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <i className="fas fa-history text-teal-500"></i>
            ประวัติการ Import ใบส่งคืนเอกสาร ({documentImportLogs.length} ครั้ง)
          </h3>
          <div className="space-y-2">
            {documentImportLogs.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                <i className="fas fa-file-pdf text-red-400 flex-shrink-0"></i>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {log.fileNames.length > 0 ? log.fileNames.join(', ') : 'พิมพ์เอง'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.timestamp).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {log.returnDate ? ` · วันคืนบิล: ${log.returnDate}` : ''}
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs font-bold border border-teal-100 flex-shrink-0">
                  {log.confirmedCount} รายการ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
