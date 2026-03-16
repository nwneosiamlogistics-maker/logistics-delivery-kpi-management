#!/usr/bin/env node
/**
 * Import JSON data to MariaDB on NAS
 * Run this on the NAS via Task Scheduler
 * 
 * Usage: node import-json-to-mariadb.js /path/to/firebase-export.json
 */

const fs = require('fs');
const mariadb = require('mariadb');

// MariaDB configuration
const dbConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'logistics_api',
  password: 'LogisticsKPI2026!',
  database: 'logistics_kpi',
  connectionLimit: 5,
};

async function importData() {
  const jsonFile = process.argv[2] || '/volume1/docker/logistics-api/firebase-export.json';
  
  console.log('='.repeat(60));
  console.log('JSON to MariaDB Import');
  console.log('='.repeat(60));
  console.log(`\nReading: ${jsonFile}\n`);

  if (!fs.existsSync(jsonFile)) {
    throw new Error(`File not found: ${jsonFile}`);
  }

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`Exported at: ${data.exportedAt}`);
  console.log(`Source: ${data.source}\n`);

  const pool = mariadb.createPool(dbConfig);
  const conn = await pool.getConnection();

  const stats = {
    kpiConfigs: 0,
    holidays: 0,
    storeClosures: 0,
    delayReasons: 0,
    storeMappings: 0,
    branchResources: 0,
    branchResourcesHistory: 0,
  };

  try {
    // Import KPI Configs
    if (data.kpiConfigs) {
      console.log('📤 Importing kpiConfigs...');
      for (const [key, config] of Object.entries(data.kpiConfigs)) {
        await conn.query(
          `INSERT INTO kpi_configs (id, branch, province, district, on_time_limit, is_draft)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           branch = VALUES(branch), province = VALUES(province), district = VALUES(district),
           on_time_limit = VALUES(on_time_limit), is_draft = VALUES(is_draft)`,
          [config.id || key, config.branch || null, config.province || null,
           config.district || '', config.onTimeLimit || 3, config.isDraft ? 1 : 0]
        );
        stats.kpiConfigs++;
      }
    }

    // Import Holidays
    if (data.holidays) {
      console.log('📤 Importing holidays...');
      for (const [key, holiday] of Object.entries(data.holidays)) {
        await conn.query(
          `INSERT INTO holidays (id, date, name, type)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE date = VALUES(date), name = VALUES(name), type = VALUES(type)`,
          [holiday.id || key, holiday.date || null, holiday.name || '', holiday.type || 'public']
        );
        stats.holidays++;
      }
    }

    // Import Store Closures
    if (data.storeClosures) {
      console.log('📤 Importing storeClosures...');
      for (const [key, closure] of Object.entries(data.storeClosures)) {
        await conn.query(
          `INSERT INTO store_closures (id, store_id, date, close_rule, reason)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           store_id = VALUES(store_id), date = VALUES(date), close_rule = VALUES(close_rule), reason = VALUES(reason)`,
          [closure.id || key, closure.storeId || '', closure.date || null,
           closure.closeRule || null, closure.reason || '']
        );
        stats.storeClosures++;
      }
    }

    // Import Delay Reasons
    if (data.delayReasons) {
      console.log('📤 Importing delayReasons...');
      for (const [key, reason] of Object.entries(data.delayReasons)) {
        await conn.query(
          `INSERT INTO delay_reasons (code, label, category)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`,
          [reason.code || key, reason.label || '', reason.category || 'internal']
        );
        stats.delayReasons++;
      }
    }

    // Import Store Mappings
    if (data.storeMappings) {
      console.log('📤 Importing storeMappings...');
      for (const [key, mapping] of Object.entries(data.storeMappings)) {
        await conn.query(
          `INSERT INTO store_mappings (store_id, district, province, created_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE district = VALUES(district), province = VALUES(province)`,
          [mapping.storeId || key, mapping.district || '', mapping.province || null,
           mapping.createdAt ? new Date(mapping.createdAt) : new Date()]
        );
        stats.storeMappings++;
      }
    }

    // Import Branch Resources
    if (data.branchResources) {
      console.log('📤 Importing branchResources...');
      for (const [key, resource] of Object.entries(data.branchResources)) {
        await conn.query(
          `INSERT INTO branch_resources (id, branch_name, trucks, trips_per_day, loaders, checkers, admin,
           work_hours_per_day, loader_wage, checker_wage, admin_wage, truck_cost_per_day,
           calculated_capacity, calculated_speed, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           branch_name = VALUES(branch_name), trucks = VALUES(trucks), trips_per_day = VALUES(trips_per_day),
           loaders = VALUES(loaders), checkers = VALUES(checkers), admin = VALUES(admin),
           work_hours_per_day = VALUES(work_hours_per_day), loader_wage = VALUES(loader_wage),
           checker_wage = VALUES(checker_wage), admin_wage = VALUES(admin_wage),
           truck_cost_per_day = VALUES(truck_cost_per_day), calculated_capacity = VALUES(calculated_capacity),
           calculated_speed = VALUES(calculated_speed), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
          [resource.id || key, resource.branchName || '', resource.trucks || 0,
           resource.tripsPerDay || 0, resource.loaders || 0, resource.checkers || 0,
           resource.admin || 0, resource.workHoursPerDay || 8, resource.loaderWage || 0,
           resource.checkerWage || 0, resource.adminWage || 0, resource.truckCostPerDay || 0,
           resource.calculatedCapacity || null, resource.calculatedSpeed || null,
           resource.updatedAt ? new Date(resource.updatedAt) : new Date(), resource.updatedBy || '']
        );
        stats.branchResources++;
      }
    }

    // Import Branch Resource History
    if (data.branchResourcesHistory) {
      console.log('📤 Importing branchResourcesHistory...');
      for (const [key, history] of Object.entries(data.branchResourcesHistory)) {
        await conn.query(
          `INSERT INTO branch_resource_history (id, branch_id, action, changes, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           branch_id = VALUES(branch_id), action = VALUES(action), changes = VALUES(changes),
           updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
          [history.id || key, history.branchId || '', history.action || 'update',
           JSON.stringify(history.changes || {}),
           history.updatedAt ? new Date(history.updatedAt) : new Date(), history.updatedBy || '']
        );
        stats.branchResourcesHistory++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Import Complete!');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log(`   KPI Configs:           ${stats.kpiConfigs} records`);
    console.log(`   Holidays:              ${stats.holidays} records`);
    console.log(`   Store Closures:        ${stats.storeClosures} records`);
    console.log(`   Delay Reasons:         ${stats.delayReasons} records`);
    console.log(`   Store Mappings:        ${stats.storeMappings} records`);
    console.log(`   Branch Resources:      ${stats.branchResources} records`);
    console.log(`   Branch Resource Hist:  ${stats.branchResourcesHistory} records`);

    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    console.log(`\nTotal: ${total} records imported`);

  } finally {
    conn.release();
    await pool.end();
  }
}

importData()
  .then(() => {
    console.log('\n🎉 Migration finished successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err.message);
    process.exit(1);
  });
