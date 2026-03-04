/**
 * Version 8 - Browser Global Linker
 * Primary source is window.XLSX from script tag for best CSP/Vite compatibility.
 */
const getXLSX = () => {
  if (typeof window !== 'undefined' && (window as any).XLSX) {
    return (window as any).XLSX;
  }
  return null;
};

const XLSX = getXLSX();

import { DeliveryRecord, KpiStatus, ReasonStatus, Holiday, KpiConfig, StoreClosure, DeliveryStatus } from '../types';
import { calculateKpiStatus, calculatePendingKpiStatus, getWeekday } from './kpiEngine';

export interface ParsedRow {
  orderNo: string;
  district: string;
  storeId: string;
  planDate: string;
  openDate?: string;
  actualDate: string;
  qty: number;
  productDetails?: string;
  sender?: string;
  province?: string;
  importFileId?: string;
  deliveryStatus?: string;
  actualDatetime?: string;
  updatedAt?: string;
  version?: number;
}

export interface ImportResult {
  created: DeliveryRecord[];
  updated: DeliveryRecord[];
  skipped: { row: number; reason: string; data?: any }[];
  errors: { row: number; error: string; data?: any }[];
}

const REQUIRED_COLUMNS = ['orderNo', 'district', 'storeId'];
const QTY_COLUMNS = ['qty', 'productDetails']; // At least one must exist

const COLUMN_ALIASES: Record<string, string[]> = {
  orderNo: ['orderNo', 'order_no', 'orderno', 'Order No', 'Order Number', 'เลขที่ใบสั่ง', 'เลขที่ออเดอร์', 'ใบสั่งซื้อ', 'เลขที่ใบสินค้า', 'รหัสใบสั่ง', 'ID', 'เลขที่'],
  district: ['district', 'District', 'อำเภอ', 'เขต', 'พื้นที่'],
  storeId: ['storeId', 'store_id', 'storeid', 'Store ID', 'Store', 'ร้านค้า', 'รหัสร้าน', 'รหัสร้านค้า', 'รหัสสาขา',
    'สาขาที่', // ย้ายมาจาก district — มักเป็นชื่อร้าน/สาขา ไม่ใช่ชื่ออำเภอ
    'ผู้รับสินค้า', 'ลูกค้า', 'ผู้รับ', 'ปลายทาง'],
  planDate: [
    'planDate', 'plan_date', 'plandate', 'Plan Date', 'Planned Date',
    'วันที่แผน', 'วันกำหนดส่ง', 'วันที่ต้องส่ง', 'นัดส่ง', 'วันที่นัด', 'วันที่ตามแผน',
    // เพิ่มชื่อ column ที่พบบ่อยใน Thai ERP/Logistics
    'วันนัดส่ง', 'วันจัดส่ง', 'วันที่จัดส่ง', 'วันส่ง', 'วันที่ส่งของ',
  ],
  openDate: ['openDate', 'open_date', 'วันที่', 'วันที่เพิ่ม', 'วันเปิด', 'วันเปิดเอกสาร'],
  actualDate: [
    'actualDate', 'actual_date', 'actualdate', 'Actual Date', 'Delivery Date',
    'วันที่ส่งจริง', 'วันที่จัดส่ง', 'วันที่แก้ไข',
    // หมายเหตุ: ไม่ใส่ 'วันที่ส่ง' / 'วันส่ง' เพื่อป้องกัน conflict กับ planDate
  ],
  qty: ['qty', 'Qty', 'quantity', 'Quantity', 'จำนวน', 'ชิ้น', 'จำนวนชิ้น', 'ปริมาณ', 'พาเลท', 'ขึ้น'],
  productDetails: ['productDetails', 'สินค้า', 'product', 'Product', 'รายการสินค้า', 'รายละเอียดสินค้า'],
  sender: ['sender', 'Sender', 'ผู้ส่ง', 'ต้นทาง', 'บริษัทผู้ส่ง', 'shipper', 'Shipper'],
  province: ['province', 'Province', 'จังหวัด', 'จว.', 'จว'],
  deliveryStatus: ['deliveryStatus', 'สถานะ', 'status', 'Status', 'สถานะการจัดส่ง'],
  actualDatetime: [
    'actualDatetime', 'รายละเอียด', 'detail', 'Detail',
    // ชื่อ column timestamp ส่งเสร็จที่พบบ่อยใน Thai Logistics ERP
    'วันส่งเสร็จ', 'เวลาส่งเสร็จ',
    'วันที่ส่งเสร็จ', 'วันส่งสำเร็จ', 'วันที่ส่งสำเร็จ',
    'เวลาส่งสำเร็จ', 'วันและเวลาส่งเสร็จ', 'วันที่และเวลาส่งเสร็จ',
    'วันจัดส่งเสร็จ', 'วันที่จัดส่งเสร็จ', 'วันที่จัดส่งสำเร็จ',
    'เวลาจัดส่งเสร็จ', 'timestamp', 'Timestamp',
    'วันส่งของเสร็จ', 'เวลาส่ง', 'เวลาส่งสินค้า',
  ],

  updatedAt: ['updatedAt', 'updated_at', 'updatedat', 'Updated At', 'Last Updated'],
  version: ['version', 'Version', 'เวอร์ชัน']
};

/**
 * Parse quantity from a product details cell.
 * Format: "Product name 146.00 กล่อง  Other product 5.00  ..."
 * Each item is separated by 2+ spaces.
 * Within each segment the LAST number is the quantity.
 */
function parseQtyFromProducts(text: string): number {
  if (!text) return 0;
  // Split by 2 or more consecutive spaces to get individual product segments
  const segments = text.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return 0;

  let total = 0;
  for (const seg of segments) {
    // Find all numbers in this segment
    const nums = seg.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) continue;
    // The LAST number in the segment is the quantity
    const last = parseFloat(nums[nums.length - 1]);
    if (!isNaN(last) && last <= 99999) total += last;
  }
  return Math.round(total * 100) / 100;
}

function normalize(s: string): string {
  if (!s) return '';
  return s.toString()
    .normalize('NFC') // Unicode normalization for consistent Thai character comparison
    .replace(/[^\u0020-\u007E\u0E00-\u0E7F]/g, '') // Remove hidden chars
    .replace(/["']/g, '') // Remove literal quotes
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function mapHeader(header: string): string | null {
  const clean = normalize(header);
  if (!clean) return null;
  console.log(`Normalizing header: "${header}" -> "${clean}"`);
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(a => normalize(a) === clean)) return canonical;
  }
  return null;
}

function parseDate(v: any): string | null {
  if (!v || String(v).trim() === '') return null;

  if (typeof v === 'number') {
    const ssf = XLSX?.SSF || XLSX?.utils?.SSF;
    if (ssf) {
      try {
        const d = ssf.parse_date_code(v);
        if (d) {
          let y = d.y;
          let m = d.m;
          let day = d.d;

          if (y > 2400) {
            // กรณี Excel เก็บปี พ.ศ. โดยตรง — แปลงเป็น ค.ศ. และสลับ MM/DD กลับ
            y -= 543;
            const tmp = m; m = day; day = tmp;
          } else if (y >= 2020 && y <= 2032 && m <= 12 && day <= 12) {
            // ────────────────────────────────────────────────────────────────
            // Heuristic: Thai Excel (US locale) — ผู้ใช้พิมพ์ DD/MM/YYYY
            // แต่ Excel อ่านเป็น MM/DD และเก็บ serial เป็นวันนั้น
            // ตัวอย่าง: พิมพ์ "10/2/2569" (10 ก.พ.) → Excel อ่านเป็น Oct 2
            //
            // ตรวจจับ: ถ้าวัน as-is อยู่ในอนาคต แต่สลับ DD↔MM แล้วได้วันในอดีต
            //          → น่าจะเป็น DD/MM ที่ถูกกลับ ให้สลับกลับ
            // ────────────────────────────────────────────────────────────────
            const todayAnchor = new Date();
            todayAnchor.setHours(0, 0, 0, 0);
            const asIsDate = new Date(y, m - 1, day);
            const swappedDate = new Date(y, day - 1, m);
            const swappedMonthValid = day >= 1 && day <= 12; // เดือน (หลัง swap) ต้องถูกต้อง
            if (swappedMonthValid && asIsDate > todayAnchor && swappedDate <= todayAnchor) {
              console.log(`[parseDate] numeric swap: ${y}-${m}-${day} (future) → ${y}-${day}-${m} (past) — ปรับ DD/MM กลับ`);
              const tmp = m; m = day; day = tmp;
            }
          }

          if (y < 1900) return null;
          return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } catch (e) {
        console.warn('Error parsing date code:', v, e);
      }
    }
  }

  if (typeof v === 'string') {
    const s = v.trim();

    // ── กรณีพิเศษ: XLSX ส่งค่า datetime เป็น string ตัวเลข เช่น "244655.60833..." ──
    // เกิดจาก String(m.actualDatetime) ที่ m.actualDatetime เป็น Excel serial number (ปี พ.ศ.)
    // ให้แปลงกลับเป็น number แล้ว recurse ผ่าน numeric path (SSF) ซึ่งรองรับ BE year + swap
    if (/^\d+(\.\d+)?$/.test(s)) {
      const serial = parseFloat(s);
      if (!isNaN(serial) && serial > 100) { // > 100 เพื่อกันค่า qty หรือ version ธรรมดา
        console.log(`[parseDate] numeric-string detected: "${s}" → re-parse as serial`);
        return parseDate(serial);
      }
    }

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const y = parseInt(iso[1], 10);
      if (y < 1900) return null;
      return iso[0];
    }
    const thai = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (thai) {
      let y = parseInt(thai[3], 10);
      if (y > 2400) y -= 543;
      if (y < 1900) return null;
      return `${y}-${thai[2].padStart(2, '0')}-${thai[1].padStart(2, '0')}`;
    }
  }
  return null;
}

export function parseExcelFile(file: ArrayBuffer): ParsedRow[] {
  console.log('ExcelParser V9 (Robust-Headers) Running', {
    hasLib: !!XLSX,
    hasRead: !!XLSX?.read,
    hasUtils: !!XLSX?.utils
  });

  if (!XLSX || typeof XLSX.read !== 'function') {
    console.error('XLSX Library invalid:', XLSX);
    throw new Error('ไม่สามารถโหลดตัวอ่านไฟล์ได้ (Invalid XLSX) กรุณาลองใช้ Chrome และ Hard Refresh (Ctrl+F5)');
  }

  let wb;
  try {
    wb = XLSX.read(file, { type: 'array', cellDates: false, raw: false });
  } catch (e: any) {
    console.error('XLSX Read Error:', e);
    throw new Error(`ไม่สามารถอ่านไฟล์ได้: ${e.message || 'รูปแบบไฟล์อาจไม่ถูกต้อง'}`);
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('ไฟล์ว่างเปล่าหรือไม่มีแผ่นงาน (Sheet)');
  }

  const sn = wb.SheetNames[0];
  const ws = wb.Sheets[sn];

  if (!XLSX.utils || typeof XLSX.utils.sheet_to_json !== 'function') {
    console.error('XLSX Utils invalid:', XLSX.utils);
    throw new Error('ไม่สามารถประมวลผลข้อมูลได้ (Utils Missing) กรุณาตรวจสอบการตั้งค่า Browser');
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[];
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const columnMap: Record<string, string> = {};

  headers.forEach(h => {
    const can = mapHeader(h);
    if (can) columnMap[h] = can;
  });

  console.log('[ExcelParser] All headers found:', headers);
  console.log('[ExcelParser] Column map:', columnMap);
  console.log('[ExcelParser] sender mapped?', Object.values(columnMap).includes('sender'));
  console.log('[ExcelParser] qty mapped?', Object.values(columnMap).includes('qty'));
  // Debug: show hex of each header to catch hidden chars
  headers.forEach(h => {
    const hex = Array.from(h).map(c => c.codePointAt(0)?.toString(16)).join(' ');
    console.log(`[ExcelParser] header "${h}" -> normalized "${normalize(h)}" -> hex: ${hex} -> canonical: ${mapHeader(h)}`);
  });
  // Debug: show first row raw values
  if (rows.length > 0) console.log('[ExcelParser] First row raw:', JSON.stringify(rows[0]));

  const mapped = Object.values(columnMap);
  const missing = REQUIRED_COLUMNS.filter(c => !mapped.includes(c));
  if (missing.length > 0) {
    throw new Error(`ไม่พบหัวคอลัมน์ที่จำเป็น: ${missing.join(', ')} \n(ตรวจพบ: ${headers.join(', ')})`);
  }
  const hasQtySource = QTY_COLUMNS.some(c => mapped.includes(c));
  if (!hasQtySource) {
    throw new Error(`ไม่พบคอลัมน์จำนวนสินค้า (ชิ้น/จำนวน/สินค้า) \n(ตรวจพบ: ${headers.join(', ')})`);
  }

  return rows.map(r => {
    const m: Record<string, any> = {};
    for (const [orig, can] of Object.entries(columnMap)) {
      const val = r[orig];
      // First non-empty value wins — prevents later columns from overwriting earlier ones
      if (m[can] === undefined || m[can] === '') {
        m[can] = val;
      }
    }
    const parsedPlanDate = parseDate(m.planDate) || '';
    return {
      orderNo: String(m.orderNo || '').trim(),
      district: String(m.district || '').trim(),
      storeId: String(m.storeId || '').trim(),
      planDate: parsedPlanDate,
      openDate: m.openDate ? (parseDate(m.openDate) || undefined) : undefined,
      actualDate: parseDate(m.actualDate) || '',
      qty: (() => {
        const directQty = parseFloat(String(m.qty));
        // Sanity check: reject values that look like barcodes/IDs (>99999) or negative
        const isValidQty = directQty && !isNaN(directQty) && directQty > 0 && directQty <= 99999;
        if (isValidQty) {
          return directQty;
        }
        // Fallback: parse qty from productDetails column (สินค้า)
        if (m.productDetails) {
          return parseQtyFromProducts(String(m.productDetails));
        }
        return 0;
      })(),
      productDetails: m.productDetails ? String(m.productDetails).trim() : undefined,
      sender: m.sender ? String(m.sender).trim() : undefined,
      province: m.province ? String(m.province).trim() : undefined,
      deliveryStatus: m.deliveryStatus ? String(m.deliveryStatus).trim() : undefined,
      // actualDatetime: parse ก่อนเก็บ — แปลง Excel serial เป็น ISO date เช่น "2026-02-11"
      // ไม่งั้น UI จะแสดงเลข "244441.54305..." แทนที่จะเป็นวันที่
      actualDatetime: m.actualDatetime
        ? (parseDate(m.actualDatetime) || String(m.actualDatetime).trim() || undefined)
        : undefined,
      updatedAt: m.updatedAt ? parseDate(m.updatedAt) || undefined : undefined,
      version: m.version ? parseInt(String(m.version), 10) : undefined
    };
  });
}

// Status progression — higher index = more advanced state
const STATUS_ORDER: Record<string, number> = {
  'รอจัด': 0,
  'ขนส่ง': 1,
  'รอกระจาย': 2,
  'กระจายสินค้า': 3,
  'ส่งเสร็จ': 4,
};

function getStatusPriority(status: string | undefined): number {
  if (!status) return -1;
  return STATUS_ORDER[status.trim()] ?? -1;
}

export function processImport(
  parsedRows: ParsedRow[],
  existingDeliveries: DeliveryRecord[],
  kpiConfigs: KpiConfig[],
  holidays: Holiday[],
  storeClosures: StoreClosure[],
  importFileId?: string
): ImportResult {
  const result: ImportResult = { created: [], updated: [], skipped: [], errors: [] };
  // Use orderNo as unique key — every Inv. stored separately
  const existingMap = new Map(
    existingDeliveries.map(d => [d.orderNo, d])
  );

  parsedRows.forEach((row, index) => {
    if (!row.orderNo) {
      result.errors.push({ row: index + 2, error: 'ไม่พบเลขที่ใบสินค้า', data: row });
      return;
    }

    // Fallback: ถ้า planDate (นัดส่ง) ว่าง → คำนวณจาก baseDate + onTimeLimit
    // baseDate priority: openDate (วันที่) → actualDate (วันที่แก้ไข) → actualDatetime (รายละเอียด)
    if (!row.planDate) {
      const baseDate = row.openDate
        || row.actualDate
        || (row.actualDatetime ? parseDate(row.actualDatetime) || undefined : undefined);
      if (baseDate) {
        const cfg = kpiConfigs.find(c =>
          c.district === row.district && (!c.province || c.province === row.province)
        ) || kpiConfigs.find(c => c.district === row.district);
        const limit = cfg?.onTimeLimit ?? 1;
        const d = new Date(baseDate);
        d.setDate(d.getDate() + limit);
        row = { ...row, planDate: d.toISOString().slice(0, 10) };
      }
    }

    if (!row.planDate) {
      result.errors.push({ row: index + 2, error: 'ไม่พบวันกำหนดส่ง และไม่มีวันที่อ้างอิง', data: row });
      return;
    }

    const status = (row.deliveryStatus || '').trim();
    const isDelivered = status === 'ส่งเสร็จ';

    // Logic:
    // - วันที่ (openDate) → วันเปิดเอกสาร ใช้ fallback คำนวณ planDate
    // - นัดส่ง → planDate (วันกำหนดส่ง)
    // - วันที่แก้ไข → actualDate (วันส่งจริง)
    // - รายละเอียด → actualDatetime (timestamp ส่งเสร็จ)
    // For KPI: only calculate when ส่งเสร็จ, use actualDate/actualDatetime directly
    // For รอจัด/ขนส่ง: not delivered yet, skip KPI
    const resolvedActualDate = row.actualDate || row.planDate;

    if (!resolvedActualDate) {
      result.errors.push({ row: index + 2, error: 'ไม่พบวันที่ส่งจริง', data: row });
      return;
    }

    // For ส่งเสร็จ: use actualDatetime (รายละเอียด) as the KPI delivery date if available
    const kpiActualDate = (isDelivered && row.actualDatetime)
      ? (parseDate(row.actualDatetime) || resolvedActualDate)
      : resolvedActualDate;

    // Lookup by orderNo
    const existing = existingMap.get(row.orderNo);

    // Status-based merge guard (same orderNo imported again)
    if (existing) {
      const existingPriority = getStatusPriority(existing.deliveryStatus);
      const newPriority = getStatusPriority(status);

      // ส่งเสร็จ is final — never overwrite status, but always recalculate KPI with latest dates
      if (existingPriority >= STATUS_ORDER['ส่งเสร็จ']) {
        const newOpenDate = row.openDate || existing.openDate;
        const patchedCfg = kpiConfigs.find(c =>
          c.district === existing.district && (!c.province || c.province === existing.province)
        ) || kpiConfigs.find(c => c.district === existing.district);
        const patchedLimit = patchedCfg?.onTimeLimit ?? 1;
        const patchedDeadline = (() => {
          const base = newOpenDate || row.planDate || existing.planDate;
          if (!base) return existing.planDate;
          const d = new Date(base);
          d.setDate(d.getDate() + patchedLimit);
          return d.toISOString().slice(0, 10);
        })();

        // ── actualDate: ใช้ค่าใหม่จาก row ก่อน ถ้าว่างค่อย fallback เก่า ──────────────
        const newActualDateRaw = row.actualDate || existing.actualDate;
        const newActualDatetime = row.actualDatetime || existing.actualDatetime;

        // ถ้า actualDatetime parse ได้เป็นวันที่สมเหตุสมผล (ไม่ใช่อนาคต)
        // ให้ใช้เป็นวัน "ส่งจริง" ด้วย (ไม่ใช่แค่สำหรับ KPI)
        const parsedDatetime = newActualDatetime ? parseDate(newActualDatetime) : null;
        const today = new Date().toISOString().slice(0, 10);
        const newActualDate = (() => {
          // ถ้า actualDatetime ให้วันที่ดีกว่า (ไม่เป็นอนาคต) ใช้มันเป็น actualDate ด้วย
          if (parsedDatetime && parsedDatetime <= today) return parsedDatetime;
          // ถ้า actualDate ยังเป็นอนาคต และ planDate ใหม่ไม่เป็นอนาคต ใช้ planDate
          if (newActualDateRaw > today && row.planDate && row.planDate <= today) return row.planDate;
          return newActualDateRaw;
        })();

        const patchedActual = parsedDatetime || newActualDate;

        // Debug log ช่วย diagnose ปัญหา column mapping
        console.log(`[processImport][ส่งเสร็จ] ${row.orderNo}`, {
          'row.planDate': row.planDate,
          'row.actualDate': row.actualDate,
          'row.actualDatetime': row.actualDatetime,
          'existing.actualDate': existing.actualDate,
          newActualDate,
          parsedDatetime,
          patchedActual,
          patchedDeadline,
        });

        const patchedKpi = calculateKpiStatus(
          patchedDeadline, patchedActual,
          existing.district, kpiConfigs, holidays, storeClosures, undefined, existing.province
        );
        // Preserve approved/submitted reason if still NOT_PASS; reset if now PASS
        const preserveReason = patchedKpi.kpiStatus === KpiStatus.NOT_PASS
          && (existing.reasonStatus === ReasonStatus.APPROVED || existing.reasonStatus === ReasonStatus.SUBMITTED);
        const patched: DeliveryRecord = {
          ...existing,
          // อัปเดต planDate จาก row ใหม่ (แก้ข้อมูลเก่าที่ parse ผิด)
          planDate: row.planDate || existing.planDate,
          openDate: newOpenDate,
          actualDate: newActualDate,
          actualDatetime: newActualDatetime,
          ...patchedKpi,
          ...(preserveReason ? { reasonStatus: existing.reasonStatus, delayReason: existing.delayReason } : {})
        };
        // Only push to updated if something actually changed
        if (
          patched.openDate !== existing.openDate ||
          patched.planDate !== existing.planDate ||
          patched.actualDate !== existing.actualDate ||
          patched.actualDatetime !== existing.actualDatetime ||  // ← fix: serial "244441→ISO" ต้อง update
          patched.kpiStatus !== existing.kpiStatus ||
          patched.delayDays !== existing.delayDays
        ) {
          result.updated.push(patched);
          existingMap.set(row.orderNo, patched);
        } else {
          result.skipped.push({ row: index + 2, reason: `ส่งเสร็จ - ข้อมูล KPI ไม่เปลี่ยนแปลง [${row.orderNo}]` });
        }
        return;
      }

      // Skip if new status is lower than existing, but always patch openDate from new data
      if (newPriority < existingPriority) {
        if (row.openDate && row.openDate !== existing.openDate) {
          const patched = { ...existing, openDate: row.openDate };
          result.updated.push(patched);
          existingMap.set(row.orderNo, patched);
        } else {
          result.skipped.push({ row: index + 2, reason: `สถานะใหม่ (${status || 'ไม่ระบุ'}) ต่ำกว่าเดิม (${existing.deliveryStatus}) [${row.orderNo}]` });
        }
        return;
      }
    }

    // Compute the true deadline = openDate + onTimeLimit (this is the date customer must receive by)
    // planDate from Excel (นัดส่ง) is the appointment date, openDate is the document open date
    // KPI deadline should be openDate + onTimeLimit
    const kpiCfg = kpiConfigs.find(c =>
      c.district === row.district && (!c.province || c.province === row.province)
    ) || kpiConfigs.find(c => c.district === row.district);
    const kpiLimit = kpiCfg?.onTimeLimit ?? 1;
    const deadlineBase = row.openDate || row.planDate;
    const kpiDeadline = (() => {
      if (!deadlineBase) return row.planDate;
      const d = new Date(deadlineBase);
      d.setDate(d.getDate() + kpiLimit);
      return d.toISOString().slice(0, 10);
    })();

    // KPI calculation logic:
    // - ส่งเสร็จ: calculate based on actual delivery date (with grace period)
    // - ยังไม่ส่งเสร็จ: strict calculation - exceeding planDate = fail immediately (no grace period)
    const kpi = (() => {
      if (isDelivered) {
        return calculateKpiStatus(kpiDeadline, kpiActualDate, row.district, kpiConfigs, holidays, storeClosures, undefined, row.province);
      }
      // For pending deliveries, use strict calculation with planDate (no grace period)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return calculatePendingKpiStatus(row.planDate, today.toISOString().slice(0, 10), row.district, kpiConfigs, holidays, storeClosures, undefined, row.province);
    })();

    const data: DeliveryRecord = {
      orderNo: row.orderNo,
      district: row.district,
      storeId: row.storeId,
      planDate: row.planDate,
      openDate: row.openDate || existing?.openDate,
      actualDate: resolvedActualDate,
      qty: row.qty,
      sender: row.sender,
      province: row.province,
      importFileId: importFileId || row.importFileId,
      deliveryStatus: status || undefined,
      actualDatetime: row.actualDatetime,
      productDetails: row.productDetails,
      ...kpi,
      weekday: getWeekday(resolvedActualDate),
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      result.updated.push(data);
      existingMap.set(row.orderNo, data);
    } else {
      result.created.push(data);
      existingMap.set(row.orderNo, data);
    }
  });
  return result;
}

function shouldUpdateRecord(newRow: ParsedRow, existing: DeliveryRecord): boolean {
  if (newRow.version !== undefined) return newRow.version > 0;
  if (newRow.updatedAt) return new Date(newRow.updatedAt) > new Date(existing.updatedAt);
  return true;
}
