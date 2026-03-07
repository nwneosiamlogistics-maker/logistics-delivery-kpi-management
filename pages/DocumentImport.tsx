import React, { useState, useMemo, useCallback } from 'react';
import { DeliveryRecord, KpiConfig } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface DocumentImportProps {
  deliveries: DeliveryRecord[];
  onUpdateDeliveries: (deliveries: DeliveryRecord[]) => void;
  kpiConfigs?: KpiConfig[];
}

interface ExtractedDoc {
  orderNo: string;
  found: boolean;
  selected: boolean;
  sourceFile?: string;
  sourceDate?: string;
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

export const DocumentImport: React.FC<DocumentImportProps> = ({ deliveries, onUpdateDeliveries, kpiConfigs = [] }) => {
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
    setExtractedDocs([]);
    setUploadedFiles([]);
    setImportSuccess(null);
    
    const allExtracted: ExtractedDoc[] = [];
    const fileInfos: FileInfo[] = [];
    const deliveryOrderNos = new Set(deliveries.map(d => d.orderNo));
    const seenOrderNos = new Set<string>();
    let latestDate: string | null = null;
    
    try {
      for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
        const file = files[fileIdx];
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const orderNos: string[] = [];
        let extractedDate: string | null = null;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          // Extract date from first page header
          if (i === 1 && !extractedDate) {
            extractedDate = parsePdfDate(text);
          }
          const matches = text.match(/B\d{10}/g);
          if (matches) orderNos.push(...matches);
        }
        
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
            allExtracted.push({
              orderNo,
              found: deliveryOrderNos.has(orderNo),
              selected: deliveryOrderNos.has(orderNo),
              sourceFile: file.name,
              sourceDate: extractedDate || undefined
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
    const orderNos = lines.filter(s => /^B\d{10}$/.test(s));
    if (orderNos.length === 0) {
      alert('ไม่พบเลขที่เอกสารที่ถูกต้อง (รูปแบบ: B + ตัวเลข 10 หลัก)');
      return;
    }
    const deliveryOrderNos = new Set(deliveries.map(d => d.orderNo));
    const newDocs: ExtractedDoc[] = orderNos
      .filter(orderNo => !extractedDocs.some(d => d.orderNo === orderNo))
      .map(orderNo => ({
        orderNo,
        found: deliveryOrderNos.has(orderNo),
        selected: deliveryOrderNos.has(orderNo)
      }));
    setExtractedDocs(prev => [...prev, ...newDocs]);
    setManualInput('');
    setShowManualInput(false);
  }, [manualInput, deliveries, extractedDocs]);

  const toggleSelection = useCallback((orderNo: string) => {
    setExtractedDocs(prev => prev.map(d => 
      d.orderNo === orderNo ? { ...d, selected: !d.selected } : d
    ));
  }, []);

  const handleConfirmImport = useCallback(() => {
    const selectedOrderNos = extractedDocs.filter(d => d.selected && d.found).map(d => d.orderNo);
    if (selectedOrderNos.length === 0) {
      alert('กรุณาเลือกรายการที่ต้องการบันทึก');
      return;
    }
    // วันคืนบิล = จาก PDF หรือ manual input
    const billReturnDate = manualReturnDate || new Date().toISOString().slice(0, 10);
    // วันที่บันทึก = วันนี้
    const today = new Date().toISOString().slice(0, 10);
    const updatedDeliveries = deliveries.map(d => {
      if (selectedOrderNos.includes(d.orderNo)) {
        return { 
          ...d, 
          documentReturned: true, 
          documentReturnedDate: today,
          documentReturnBillDate: billReturnDate
        };
      }
      return d;
    });
    onUpdateDeliveries(updatedDeliveries);
    setImportSuccess(`บันทึกสำเร็จ ${selectedOrderNos.length} รายการ (วันคืนบิล: ${billReturnDate})`);
    setExtractedDocs([]);
    setPdfReturnDate(null);
    setManualReturnDate('');
  }, [extractedDocs, deliveries, onUpdateDeliveries, manualReturnDate]);

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
                <span className="text-sm text-gray-500 ml-2">(ในระบบ: {extractedDocs.filter(d => d.found).length}, ไม่พบ: {extractedDocs.filter(d => !d.found).length})</span>
              </h4>
              <button onClick={() => { setExtractedDocs([]); setPdfReturnDate(null); setManualReturnDate(''); }} className="text-sm text-red-500 hover:text-red-600"><i className="fas fa-times mr-1"></i>ล้างทั้งหมด</button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">
                      <input type="checkbox" aria-label="เลือกทั้งหมด" checked={extractedDocs.filter(d => d.found).every(d => d.selected)} onChange={e => setExtractedDocs(prev => prev.map(d => d.found ? { ...d, selected: e.target.checked } : d))} className="rounded border-gray-300 text-teal-500 focus:ring-teal-500" />
                    </th>
                    <th className="px-3 py-2 text-left">เลขที่เอกสาร</th>
                    <th className="px-3 py-2 text-left">สถานะ</th>
                    <th className="px-3 py-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {extractedDocs.map(doc => (
                    <tr key={doc.orderNo} className={`border-t ${!doc.found ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`เลือก ${doc.orderNo}`} checked={doc.selected} onChange={() => toggleSelection(doc.orderNo)} disabled={!doc.found} className="rounded border-gray-300 text-teal-500 focus:ring-teal-500 disabled:opacity-30" /></td>
                      <td className="px-3 py-2 font-mono">{doc.orderNo}</td>
                      <td className="px-3 py-2">{doc.found ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">✓ พบในระบบ</span> : <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">✗ ไม่พบในระบบ</span>}</td>
                      <td className="px-3 py-2 text-center"><button onClick={() => removeExtracted(doc.orderNo)} className="text-gray-400 hover:text-red-500" aria-label={`ลบ ${doc.orderNo}`}><i className="fas fa-times"></i></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleConfirmImport} disabled={!extractedDocs.some(d => d.selected && d.found)} className="px-6 py-2 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                <i className="fas fa-check"></i>ยืนยัน Import ({extractedDocs.filter(d => d.selected && d.found).length} รายการ)
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
                      <td className="px-3 py-2 text-right text-gray-600">{doc.qty || '-'}</td>
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
    </div>
  );
};
