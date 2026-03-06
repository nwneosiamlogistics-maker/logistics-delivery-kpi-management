import React, { useState, useMemo, useCallback } from 'react';
import { DeliveryRecord } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface DocumentReturnProps {
  deliveries: DeliveryRecord[];
  onUpdateDeliveries: (deliveries: DeliveryRecord[]) => void;
}

interface ExtractedDoc {
  orderNo: string;
  found: boolean;
  selected: boolean;
}

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function getWeekRange(offset: number = 0): { start: Date; end: Date; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();
  const diffToSunday = dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - diffToSunday + offset * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return { start: sunday, end: saturday, label: `${fmt(sunday)} - ${fmt(saturday)}` };
}

export const DocumentReturn: React.FC<DocumentReturnProps> = ({ deliveries, onUpdateDeliveries }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedDocs, setExtractedDocs] = useState<ExtractedDoc[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const { start, end, label } = getWeekRange(weekOffset);

  const weekDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      if (d.deliveryStatus !== 'ส่งเสร็จ') return false;
      if (!d.actualDate) return false;
      const checkDate = parseLocalDate(d.actualDate);
      if (!checkDate) return false;
      return checkDate >= start && checkDate <= end;
    });
  }, [deliveries, start, end]);

  const stats = useMemo(() => {
    const total = weekDeliveries.length;
    // Count returned docs for this week from all deliveries (regardless of deliveryStatus)
    const returnedThisWeek = deliveries.filter(d => {
      if (!d.documentReturned) return false;
      const dateToUse = d.actualDate || d.openDate || d.planDate;
      const checkDate = parseLocalDate(dateToUse || '');
      if (!checkDate) return false;
      return checkDate >= start && checkDate <= end;
    }).length;
    const pending = total - returnedThisWeek;
    const percentage = total > 0 ? ((returnedThisWeek / total) * 100).toFixed(1) : '0.0';
    return { total, returned: returnedThisWeek, pending, percentage };
  }, [weekDeliveries, deliveries, start, end]);

  const pendingDocs = useMemo(() => {
    return weekDeliveries
      .filter(d => !d.documentReturned)
      .sort((a, b) => {
        const dateA = parseLocalDate(a.actualDate!);
        const dateB = parseLocalDate(b.actualDate!);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
      });
  }, [weekDeliveries]);

  // All returned documents (not filtered by week or status) - for verification
  const allReturnedDocs = useMemo(() => {
    return deliveries
      .filter(d => d.documentReturned)
      .sort((a, b) => {
        const dateA = parseLocalDate(a.documentReturnedDate || '');
        const dateB = parseLocalDate(b.documentReturnedDate || '');
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime(); // newest first
      });
  }, [deliveries]);

  
  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    setExtractedDocs([]);
    setImportSuccess(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const orderNos: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        const matches = text.match(/B\d{10}/g);
        if (matches) orderNos.push(...matches);
      }
      const uniqueOrderNos = [...new Set(orderNos)];
      const deliveryOrderNos = new Set(deliveries.map(d => d.orderNo));
      const extracted: ExtractedDoc[] = uniqueOrderNos.map(orderNo => ({
        orderNo,
        found: deliveryOrderNos.has(orderNo),
        selected: deliveryOrderNos.has(orderNo)
      }));
      setExtractedDocs(extracted);
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
    const today = new Date().toISOString().slice(0, 10);
    const updatedDeliveries = deliveries.map(d => {
      if (selectedOrderNos.includes(d.orderNo)) {
        return { ...d, documentReturned: true, documentReturnedDate: today };
      }
      return d;
    });
    onUpdateDeliveries(updatedDeliveries);
    setImportSuccess(`บันทึกสำเร็จ ${selectedOrderNos.length} รายการ`);
    setExtractedDocs([]);
  }, [extractedDocs, deliveries, onUpdateDeliveries]);

  const removeExtracted = useCallback((orderNo: string) => {
    setExtractedDocs(prev => prev.filter(d => d.orderNo !== orderNo));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-file-import text-teal-500"></i>
            ติดตามการส่งเอกสารคืน
          </h2>
          <p className="text-sm text-gray-500 mt-1">Import PDF ใบส่งคืนเอกสาร เพื่อติดตามสถานะ</p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 shadow-sm">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="สัปดาห์ก่อน">
            <i className="fas fa-chevron-left text-gray-600"></i>
          </button>
          <span className="font-medium text-gray-700 min-w-[140px] text-center">{label}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30" aria-label="สัปดาห์ถัดไป">
            <i className="fas fa-chevron-right text-gray-600"></i>
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="ml-2 px-3 py-1 text-xs bg-teal-100 text-teal-700 rounded-full hover:bg-teal-200">
              สัปดาห์นี้
            </button>
          )}
        </div>
      </div>

      {/* All returned documents - TOP PRIORITY DISPLAY */}
      {allReturnedDocs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border-2 border-teal-300 bg-teal-50">
          <h3 className="text-base font-bold text-teal-800 mb-4 flex items-center gap-2">
            <i className="fas fa-list-check text-teal-600"></i>
            📋 รายการที่บันทึกส่งคืนทั้งหมด ({allReturnedDocs.length} รายการ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-lg">
              <thead>
                <tr className="border-b border-teal-200">
                  <th className="px-3 py-2 text-left text-teal-700">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-teal-700">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-teal-700">ผู้ส่ง</th>
                  <th className="px-3 py-2 text-left text-teal-700">จังหวัด/อำเภอ</th>
                  <th className="px-3 py-2 text-right text-teal-700">จำนวน</th>
                  <th className="px-3 py-2 text-left text-teal-700">วันที่เปิดบิล</th>
                  <th className="px-3 py-2 text-left text-teal-700">กำหนดส่ง</th>
                  <th className="px-3 py-2 text-left text-teal-700">วันที่ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-left text-teal-700">วันที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {allReturnedDocs.slice(0, 50).map(doc => (
                  <tr key={doc.orderNo} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.sender || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.province || ''}{doc.province && doc.district ? ' / ' : ''}{doc.district || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{doc.qty || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.openDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.planDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.actualDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.documentReturnedDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><i className="fas fa-file-invoice text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ส่งเสร็จทั้งหมด</p><p className="text-2xl font-bold text-gray-800">{stats.total}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><i className="fas fa-check-circle text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ส่งเอกสารคืนแล้ว</p><p className="text-2xl font-bold text-green-600">{stats.returned}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><i className="fas fa-clock text-lg"></i></div>
            <div><p className="text-xs text-gray-500">ค้างส่ง</p><p className="text-2xl font-bold text-amber-600">{stats.pending}</p></div>
          </div>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-100 text-teal-600 rounded-xl"><i className="fas fa-percentage text-lg"></i></div>
            <div><p className="text-xs text-gray-500">% สำเร็จ</p><p className="text-2xl font-bold text-teal-600">{stats.percentage}%</p></div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl">
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <i className="fas fa-upload text-teal-500"></i>
          Import ใบส่งคืนเอกสาร
        </h3>
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer">
            <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" disabled={isExtracting} />
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isExtracting ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-teal-500 text-white hover:bg-teal-600'}`}>
              {isExtracting ? (<><i className="fas fa-spinner fa-spin"></i>กำลังอ่าน PDF...</>) : (<><i className="fas fa-file-pdf"></i>เลือกไฟล์ PDF</>)}
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
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700">
                พบ {extractedDocs.length} รายการ 
                <span className="text-sm text-gray-500 ml-2">(ในระบบ: {extractedDocs.filter(d => d.found).length}, ไม่พบ: {extractedDocs.filter(d => !d.found).length})</span>
              </h4>
              <button onClick={() => setExtractedDocs([])} className="text-sm text-red-500 hover:text-red-600"><i className="fas fa-times mr-1"></i>ล้างทั้งหมด</button>
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

      {pendingDocs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-exclamation-triangle text-amber-500"></i>
            รายการค้างส่งเอกสาร ({pendingDocs.length} รายการ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-gray-600">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-gray-600">พื้นที่</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่ส่งเสร็จ</th>
                  <th className="px-3 py-2 text-left text-gray-600">ค้างมา</th>
                </tr>
              </thead>
              <tbody>
                {pendingDocs.slice(0, 50).map(doc => {
                  const deliveredDate = parseLocalDate(doc.actualDate!);
                  const today = new Date();
                  const daysAgo = deliveredDate ? Math.floor((today.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  return (
                    <tr key={doc.orderNo} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                      <td className="px-3 py-2 text-gray-600">{doc.district}, {doc.province}</td>
                      <td className="px-3 py-2 text-gray-600">{deliveredDate?.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${daysAgo > 7 ? 'bg-red-100 text-red-700' : daysAgo > 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{daysAgo} วัน</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pendingDocs.length > 50 && <p className="text-center text-gray-500 text-sm py-2">แสดง 50 รายการแรก จากทั้งหมด {pendingDocs.length} รายการ</p>}
          </div>
        </div>
      )}

      {stats.returned > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fas fa-check-double text-green-500"></i>
            ส่งเอกสารคืนแล้ว (สัปดาห์นี้ {stats.returned} รายการ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-600">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left text-gray-600">ร้านค้า</th>
                  <th className="px-3 py-2 text-left text-gray-600">ผู้ส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-600">จังหวัด/อำเภอ</th>
                  <th className="px-3 py-2 text-right text-gray-600">จำนวน</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่เปิดบิล</th>
                  <th className="px-3 py-2 text-left text-gray-600">กำหนดส่ง</th>
                  <th className="px-3 py-2 text-left text-gray-600">วันที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {weekDeliveries.filter(d => d.documentReturned).slice(0, 50).map(doc => (
                  <tr key={doc.orderNo} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-mono text-gray-800">{doc.orderNo}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.storeId}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.sender || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.province || ''}{doc.province && doc.district ? ' / ' : ''}{doc.district || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{doc.qty || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.openDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.planDate || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.documentReturnedDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
