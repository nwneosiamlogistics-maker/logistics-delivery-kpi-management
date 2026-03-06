import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, remove } from 'firebase/database';

interface KpiConfigLite {
  district: string;
  branch?: string;
  province?: string;
}

const RETURN_NEOSIAM_CONFIG = {
  apiKey: 'AIzaSyCu4-qBECAiA2Bqgzt0JB52dBx3d4WKsFo',
  authDomain: 'returnneosiam.firebaseapp.com',
  databaseURL: 'https://returnneosiam-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'returnneosiam',
  storageBucket: 'returnneosiam.firebasestorage.app',
  messagingSenderId: '46662606762',
  appId: '1:46662606762:web:29d41bf680226753f4d5d3',
};

const APP_NAME = 'returnneosiam-sync';

function getReturnNeosiamDb() {
  try {
    const existing = getApps().find(a => a.name === APP_NAME);
    const app = existing ?? initializeApp(RETURN_NEOSIAM_CONFIG, APP_NAME);
    return getDatabase(app);
  } catch (e) {
    console.warn('[ReturnNeosiamSync] getDatabase error:', e);
    return null;
  }
}

function getWeekStart(date: Date): Date {
  // Match KPI App WeeklyReport getWeekRange logic exactly
  // KPI App: finds most recent Saturday, then start = prevSat + 1 (Sunday)
  // But we need to find which week the date falls INTO, not the week that ended before it
  
  // For a date, find the Sunday of its week (Sunday-Saturday cycle)
  const d = new Date(date);
  d.setHours(12, 0, 0, 0); // Noon to avoid timezone issues
  
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  
  // Go back to Sunday of this week
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  
  return d;
}

function getWeekKey(weekStart: Date): string {
  // Use Sunday date as key: YYYY-MM-DD
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Map district names from KPI App → Branch names in ReturnNeosiam
// Supports both Thai and English district names
const DISTRICT_TO_BRANCH: Record<string, string> = {
  // พิษณุโลก (Thai + English)
  'พิษณุโลก': 'พิษณุโลก',
  'เมืองพิษณุโลก': 'พิษณุโลก',
  'phitsanulok': 'พิษณุโลก',
  'mueang phitsanulok': 'พิษณุโลก',
  'muang phitsanulok': 'พิษณุโลก',
  // กำแพงเพชร (Thai + English)
  'กำแพงเพชร': 'กำแพงเพชร',
  'เมืองกำแพงเพชร': 'กำแพงเพชร',
  'kamphaeng phet': 'กำแพงเพชร',
  'mueang kamphaeng phet': 'กำแพงเพชร',
  // แม่สอด (Thai + English)
  'แม่สอด': 'แม่สอด',
  'เมืองตาก': 'แม่สอด',
  'ตาก': 'แม่สอด',
  'mae sot': 'แม่สอด',
  'maesot': 'แม่สอด',
  'tak': 'แม่สอด',
  'mueang tak': 'แม่สอด',
  // เชียงใหม่ (Thai + English)
  'เชียงใหม่': 'เชียงใหม่',
  'เมืองเชียงใหม่': 'เชียงใหม่',
  'สันกำแพง': 'เชียงใหม่',
  'สันทราย': 'เชียงใหม่',
  'สันป่าตอง': 'เชียงใหม่',
  'สารภี': 'เชียงใหม่',
  'ดอยสะเก็ด': 'เชียงใหม่',
  'หางดง': 'เชียงใหม่',
  'chiang mai': 'เชียงใหม่',
  'chiangmai': 'เชียงใหม่',
  'mueang chiang mai': 'เชียงใหม่',
  'san kamphaeng': 'เชียงใหม่',
  'san sai': 'เชียงใหม่',
  'sansai': 'เชียงใหม่',
  'san pa tong': 'เชียงใหม่',
  'saraphi': 'เชียงใหม่',
  'doi saket': 'เชียงใหม่',
  'hang dong': 'เชียงใหม่',
  'hangdong': 'เชียงใหม่',
  'mae rim': 'เชียงใหม่',
  'mae taeng': 'เชียงใหม่',
  'chom thong': 'เชียงใหม่',
  'fang': 'เชียงใหม่',
  'hot': 'เชียงใหม่',
  // EKP ลำปาง (Thai + English)
  'ลำปาง': 'EKP ลำปาง',
  'เมืองลำปาง': 'EKP ลำปาง',
  'EKP ลำปาง': 'EKP ลำปาง',
  'ekp': 'EKP ลำปาง',
  'lampang': 'EKP ลำปาง',
  'mueang lampang': 'EKP ลำปาง',
  'ekp lampang': 'EKP ลำปาง',
  // นครสวรรค์ (Thai + English)
  'นครสวรรค์': 'นครสวรรค์',
  'เมืองนครสวรรค์': 'นครสวรรค์',
  'ตาคลี': 'นครสวรรค์',
  'พยุหะ': 'นครสวรรค์',
  'nakhon sawan': 'นครสวรรค์',
  'nakhonsawan': 'นครสวรรค์',
  'mueang nakhon sawan': 'นครสวรรค์',
  'takhli': 'นครสวรรค์',
  'phayuha khiri': 'นครสวรรค์',
  // สาย 3 (Thai + English)
  'สาย 3': 'สาย 3',
  'สาย3': 'สาย 3',
  'สายที่ 3': 'สาย 3',
  'route 3': 'สาย 3',
  'sai 3': 'สาย 3',
  'sai3': 'สาย 3',
  // คลอง 13 (Thai + English)
  'คลอง 13': 'คลอง 13',
  'คลอง13': 'คลอง 13',
  'องครักษ์': 'คลอง 13',
  'khlong 13': 'คลอง 13',
  'klong 13': 'คลอง 13',
  'ongkharak': 'คลอง 13',
  'nakhon nayok': 'คลอง 13',
  // ซีโน่ (Thai + English)
  'ซีโน่': 'ซีโน่',
  'สมุทรปราการ': 'ซีโน่',
  'sino': 'ซีโน่',
  'samut prakan': 'ซีโน่',
  'samutprakan': 'ซีโน่',
  'mueang samut prakan': 'ซีโน่',
  'sino pacific': 'ซีโน่',
  // ประดู่ (Thai + English)
  'ประดู่': 'ประดู่',
  'บางกรวย': 'ประดู่',
  'บึงกุ่ม': 'ประดู่',
  'pradoo': 'ประดู่',
  'bang kruai': 'ประดู่',
  'bueng kum': 'ประดู่',
  'buengkum': 'ประดู่',
};

function sanitizeFirebaseKey(key: string): string {
  return key.replace(/[.#$\/\[\]]/g, '_').trim();
}

function mapDistrictToBranch(district: string): string {
  if (!district) return '_unknown_';
  const key = district.trim();
  const mapped = DISTRICT_TO_BRANCH[key] || DISTRICT_TO_BRANCH[key.toLowerCase()] || key;
  return sanitizeFirebaseKey(mapped) || '_unknown_';
}

export async function syncWeeklyDeliveriesToReturnNeosiam(
  deliveries: Array<{ district?: string; planDate?: string; openDate?: string; province?: string }>,
  kpiConfigs?: KpiConfigLite[]
): Promise<void> {
  const db = getReturnNeosiamDb();
  if (!db) return;

  // Build dynamic mapping from kpiConfigs: district -> branch
  const dynamicMap: Record<string, string> = {};
  if (kpiConfigs && kpiConfigs.length > 0) {
    const withBranch = kpiConfigs.filter(c => c.branch);
    console.log('[ReturnNeosiamSync] kpiConfigs total:', kpiConfigs.length, '| with branch:', withBranch.length);
    console.log('[ReturnNeosiamSync] Sample configs (first 5):', JSON.stringify(kpiConfigs.slice(0, 5)));
    console.log('[ReturnNeosiamSync] With-branch configs (first 5):', JSON.stringify(withBranch.slice(0, 5)));
    kpiConfigs.forEach(cfg => {
      if (cfg.district && cfg.branch) {
        // Exactly matches KPI App districtBranchMap:
        // map.set(`${c.province || ''}||${c.district}`, c.branch)
        const provDistKey = `${(cfg.province || '').trim()}||${cfg.district.trim()}`;
        dynamicMap[provDistKey] = cfg.branch.trim();
      }
    });
    console.log('[ReturnNeosiamSync] Dynamic mapping built:', Object.keys(dynamicMap).length, 'entries');
  } else {
    console.log('[ReturnNeosiamSync] No kpiConfigs provided — using static mapping only');
  }

  function resolveBranch(district: string, province?: string): string | null {
    const key = district.trim();
    const provKey = `${(province || '').trim()}||${key}`;
    const noProvKey = `||${key}`;
    // Exactly matches KPI App branchSummary:
    // districtBranchMap.get(key) || districtBranchMap.get(keyNoProvince) || 'ไม่ระบุสาขา'
    const dynamic = dynamicMap[provKey] || dynamicMap[noProvKey];
    if (dynamic) return sanitizeFirebaseKey(dynamic) || null;
    // Fall back to static mapping (for branches not in kpiConfigs)
    const staticMapped = DISTRICT_TO_BRANCH[key] || DISTRICT_TO_BRANCH[key.toLowerCase()];
    if (staticMapped) return sanitizeFirebaseKey(staticMapped) || null;
    // No mapping found — skip this delivery
    return null;
  }

  try {
    const grouped: Record<string, Record<string, number>> = {};

    let skipNoDistrict = 0, skipNoDate = 0, skipInvalidDate = 0;
    const uniqueDistricts = new Set<string>();
    deliveries.forEach(d => {
      if (!d.district) { skipNoDistrict++; return; }
      // Exactly matches KPI App WeeklyReport: const dateToUse = d.openDate || d.planDate
      const dateStr = d.openDate || d.planDate;
      if (!dateStr) { skipNoDate++; return; }
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) { skipInvalidDate++; return; }

      uniqueDistricts.add(d.district);
      const weekKey = getWeekKey(getWeekStart(date));
      // Use province+district for mapping (more precise)
      const branch = resolveBranch(d.district, d.province);
      if (!branch) return; // skip unmapped districts
      if (!grouped[weekKey]) grouped[weekKey] = {};
      grouped[weekKey][branch] = (grouped[weekKey][branch] || 0) + 1;
      
    });

    const totalProcessed = Object.values(grouped).reduce((s, w) => s + Object.values(w).reduce((a, b) => a + b, 0), 0);
    console.log(`[ReturnNeosiamSync] Total deliveries: ${deliveries.length} | Processed: ${totalProcessed} | Skip(no district): ${skipNoDistrict} | Skip(no date): ${skipNoDate} | Skip(invalid date): ${skipInvalidDate}`);
    console.log('[ReturnNeosiamSync] Unique districts in data:', [...uniqueDistricts].sort());

    // Debug: count deliveries where date is in each week
    const weekCounts: Record<string, number> = {};
    deliveries.forEach(d => {
      const dateStr = d.openDate || d.planDate;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      const wk = getWeekKey(getWeekStart(date));
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    });
    console.log('[ReturnNeosiamSync] DEBUG weekCounts (before branch mapping):', JSON.stringify(weekCounts));

    // Debug: count deliveries where planDate is between 2026-02-01 and 2026-02-07
    const feb1to7 = deliveries.filter(d => {
      const dateStr = d.openDate || d.planDate;
      if (!dateStr) return false;
      return dateStr >= '2026-02-01' && dateStr <= '2026-02-07';
    });
    console.log(`[ReturnNeosiamSync] DEBUG: Deliveries with date 2026-02-01 to 2026-02-07: ${feb1to7.length}`);
    // Show sample of these deliveries
    const sample = feb1to7.slice(0, 5).map(d => ({ planDate: d.planDate, openDate: d.openDate, district: d.district, province: d.province }));
    console.log('[ReturnNeosiamSync] DEBUG: Sample feb 1-7:', JSON.stringify(sample));
    // Log unmapped districts (branch = district itself = no mapping found)
    // Log all keys in 2026-02-22 to find unknown branches
    if (grouped['2026-02-22']) {
      const week0222 = grouped['2026-02-22'];
      const total0222 = Object.values(week0222).reduce((a, b) => a + b, 0);
      console.log('[ReturnNeosiamSync] 2026-02-22 branches:', JSON.stringify(week0222));
      console.log('[ReturnNeosiamSync] 2026-02-22 total:', total0222);
    }
    console.log('[ReturnNeosiamSync] Grouped result:', JSON.stringify(grouped));

    // Clear ALL existing weekly_deliveries first (removes stale/old-format keys)
    await remove(ref(db, 'weekly_deliveries'));

    for (const [weekKey, districtMap] of Object.entries(grouped)) {
      await set(ref(db, `weekly_deliveries/${weekKey}`), districtMap);
    }

    console.log('[ReturnNeosiamSync] Synced weeks:', Object.keys(grouped));
  } catch (error) {
    console.warn('[ReturnNeosiamSync] sync error:', error);
  }
}
