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

function generateSQL() {
  console.log('Reading:', jsonFile);
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  
  let sql = '-- Firebase to MariaDB Import\n';
  sql += '-- Generated: ' + new Date().toISOString() + '\n\n';
  
  const counts = { kpiConfigs: 0, holidays: 0, storeClosures: 0, delayReasons: 0, storeMappings: 0, branchResources: 0 };

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
