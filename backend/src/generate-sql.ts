/**
 * Generate SQL INSERT statements from Firebase export JSON
 * Run: npm run generate-sql
 */

import * as fs from 'fs';
import * as path from 'path';

const jsonFile = path.join(__dirname, 'firebase-export.json');
const sqlFile = path.join(__dirname, 'firebase-import.sql');

function escape(s: any): string {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

// Convert Thai datetime format (e.g., '25/2/2569 11:51:00') to ISO format (e.g., '2026-02-25 11:51:00')
function parseThaiDatetime(value: string | undefined | null): string | null {
  if (!value) return null;
  
  // If already in ISO format (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  
  // Handle Thai format: DD/M/YYYY HH:MM:SS (year in Buddhist Era)
  const parts = String(value).split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00:00:00';
  
  const dateComponents = datePart.split('/');
  if (dateComponents.length !== 3) return value; // Can't parse, return original
  
  const day = dateComponents[0].padStart(2, '0');
  const month = dateComponents[1].padStart(2, '0');
  let year = parseInt(dateComponents[2], 10);
  
  // Convert Buddhist Era (พ.ศ.) to Gregorian (ค.ศ.) if year > 2500
  if (year > 2500) {
    year = year - 543;
  }
  
  return `${year}-${month}-${day} ${timePart}`;
}

function normalizeEmpty(value: any): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function generateSQL() {
  console.log('Reading:', jsonFile);
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  
  let sql = '-- Firebase to MariaDB Import\n';
  sql += '-- Generated: ' + new Date().toISOString() + '\n\n';
  sql += 'SET NAMES utf8mb4;\n';
  sql += 'SET CHARACTER SET utf8mb4;\n\n';
  
  // Extend column sizes to handle Thai text
  sql += '-- Extend columns for Thai text\n';
  sql += 'ALTER TABLE deliveries MODIFY COLUMN store_id VARCHAR(255);\n';
  sql += 'ALTER TABLE deliveries MODIFY COLUMN sender VARCHAR(255);\n';
  sql += 'ALTER TABLE store_closures MODIFY COLUMN store_id VARCHAR(255);\n';
  sql += 'ALTER TABLE store_mappings MODIFY COLUMN store_id VARCHAR(255);\n\n';
  
  const counts = { deliveries: 0, kpiConfigs: 0, holidays: 0, storeClosures: 0, delayReasons: 0, storeMappings: 0, branchResources: 0 };

  // Deliveries
  if (data.deliveries) {
    sql += '-- Deliveries\n';
    for (const [key, d] of Object.entries(data.deliveries) as any) {
      const actualDatetimeISO = parseThaiDatetime(d.actualDatetime);
      const actualDateValue = normalizeEmpty(d.actualDate);
      sql += `INSERT INTO deliveries (order_no, district, store_id, plan_date, open_date, actual_date, qty, sender, province, import_file_id, delivery_status, actual_datetime, product_details, kpi_status, delay_days, reason_required, reason_status, delay_reason, weekday, document_returned, document_returned_date, document_return_bill_date, document_return_source, manual_plan_date, manual_actual_date) VALUES (${escape(d.orderNo || key)}, ${escape(d.district)}, ${escape(d.storeId)}, ${escape(d.planDate)}, ${escape(d.openDate)}, ${escape(actualDateValue)}, ${d.qty || 0}, ${escape(d.sender)}, ${escape(d.province)}, ${escape(d.importFileId)}, ${escape(d.deliveryStatus)}, ${escape(actualDatetimeISO)}, ${escape(d.productDetails)}, ${escape(d.kpiStatus)}, ${d.delayDays || 0}, ${d.reasonRequired ? 1 : 0}, ${escape(d.reasonStatus)}, ${escape(d.delayReason)}, ${escape(d.weekday)}, ${d.documentReturned ? 1 : 0}, ${escape(d.documentReturnedDate)}, ${escape(d.documentReturnBillDate)}, ${escape(d.documentReturnSource)}, ${d.manualPlanDate ? 1 : 0}, ${d.manualActualDate ? 1 : 0}) ON DUPLICATE KEY UPDATE district=VALUES(district), store_id=VALUES(store_id), plan_date=VALUES(plan_date), open_date=VALUES(open_date), actual_date=VALUES(actual_date), qty=VALUES(qty), sender=VALUES(sender), province=VALUES(province), kpi_status=VALUES(kpi_status), delay_days=VALUES(delay_days), reason_required=VALUES(reason_required), reason_status=VALUES(reason_status), delay_reason=VALUES(delay_reason);\n`;
      counts.deliveries++;
    }
    sql += '\n';
  }

  // KPI Configs
  if (data.kpiConfigs) {
    sql += '-- KPI Configs\n';
    for (const [key, c] of Object.entries(data.kpiConfigs) as any) {
      sql += `INSERT INTO kpi_configs (id, branch, province, district, on_time_limit, is_draft) VALUES (${escape(c.id || key)}, ${escape(c.branch)}, ${escape(c.province)}, ${escape(c.district || '')}, ${c.onTimeLimit || 3}, ${c.isDraft ? 1 : 0}) ON DUPLICATE KEY UPDATE branch=VALUES(branch), province=VALUES(province), district=VALUES(district), on_time_limit=VALUES(on_time_limit), is_draft=VALUES(is_draft);\n`;
      counts.kpiConfigs++;
    }
    sql += '\n';
  }

  // Holidays
  if (data.holidays) {
    sql += '-- Holidays\n';
    for (const [key, h] of Object.entries(data.holidays) as any) {
      sql += `INSERT INTO holidays (id, date, name, type) VALUES (${escape(h.id || key)}, ${escape(h.date)}, ${escape(h.name || '')}, ${escape(h.type || 'public')}) ON DUPLICATE KEY UPDATE date=VALUES(date), name=VALUES(name), type=VALUES(type);\n`;
      counts.holidays++;
    }
    sql += '\n';
  }

  // Store Closures
  if (data.storeClosures) {
    sql += '-- Store Closures\n';
    for (const [key, s] of Object.entries(data.storeClosures) as any) {
      sql += `INSERT INTO store_closures (id, store_id, date, close_rule, reason) VALUES (${escape(s.id || key)}, ${escape(s.storeId || '')}, ${escape(s.date)}, ${escape(s.closeRule)}, ${escape(s.reason || '')}) ON DUPLICATE KEY UPDATE store_id=VALUES(store_id), date=VALUES(date), close_rule=VALUES(close_rule), reason=VALUES(reason);\n`;
      counts.storeClosures++;
    }
    sql += '\n';
  }

  // Delay Reasons
  if (data.delayReasons) {
    sql += '-- Delay Reasons\n';
    for (const [key, d] of Object.entries(data.delayReasons) as any) {
      sql += `INSERT INTO delay_reasons (code, label, category) VALUES (${escape(d.code || key)}, ${escape(d.label || '')}, ${escape(d.category || 'internal')}) ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category);\n`;
      counts.delayReasons++;
    }
    sql += '\n';
  }

  // Store Mappings
  if (data.storeMappings) {
    sql += '-- Store Mappings\n';
    for (const [key, m] of Object.entries(data.storeMappings) as any) {
      sql += `INSERT INTO store_mappings (store_id, district, province) VALUES (${escape(m.storeId || key)}, ${escape(m.district || '')}, ${escape(m.province)}) ON DUPLICATE KEY UPDATE district=VALUES(district), province=VALUES(province);\n`;
      counts.storeMappings++;
    }
    sql += '\n';
  }

  // Branch Resources
  if (data.branchResources) {
    sql += '-- Branch Resources\n';
    for (const [key, b] of Object.entries(data.branchResources) as any) {
      sql += `INSERT INTO branch_resources (id, branch_name, trucks, trips_per_day, loaders, checkers, admin, work_hours_per_day, loader_wage, checker_wage, admin_wage, truck_cost_per_day) VALUES (${escape(b.id || key)}, ${escape(b.branchName || '')}, ${b.trucks || 0}, ${b.tripsPerDay || 0}, ${b.loaders || 0}, ${b.checkers || 0}, ${b.admin || 0}, ${b.workHoursPerDay || 8}, ${b.loaderWage || 0}, ${b.checkerWage || 0}, ${b.adminWage || 0}, ${b.truckCostPerDay || 0}) ON DUPLICATE KEY UPDATE branch_name=VALUES(branch_name), trucks=VALUES(trucks), trips_per_day=VALUES(trips_per_day), loaders=VALUES(loaders), checkers=VALUES(checkers), admin=VALUES(admin);\n`;
      counts.branchResources++;
    }
    sql += '\n';
  }

  fs.writeFileSync(sqlFile, sql, 'utf8');

  console.log('\n✅ SQL file generated:', sqlFile);
  console.log('\nSummary:');
  console.log('  Deliveries:', counts.deliveries);
  console.log('  KPI Configs:', counts.kpiConfigs);
  console.log('  Holidays:', counts.holidays);
  console.log('  Store Closures:', counts.storeClosures);
  console.log('  Delay Reasons:', counts.delayReasons);
  console.log('  Store Mappings:', counts.storeMappings);
  console.log('  Branch Resources:', counts.branchResources);
  console.log('  Total:', Object.values(counts).reduce((a, b) => a + b, 0));
  console.log('\nNext: Upload firebase-import.sql to NAS and run via Task Scheduler');
}

generateSQL();
