/**
 * Firebase to NAS MariaDB Migration Script
 * 
 * This script migrates data from Firebase Realtime Database to MariaDB on Synology NAS.
 * Run once to transfer all data, then the system will use NAS as the single source of truth.
 * 
 * Usage:
 *   1. Set environment variables (see below)
 *   2. Run: npx ts-node src/migrate-firebase-to-nas.ts
 * 
 * Required Environment Variables:
 *   - FIREBASE_API_KEY
 *   - FIREBASE_AUTH_DOMAIN
 *   - FIREBASE_DATABASE_URL
 *   - FIREBASE_PROJECT_ID
 *   - DB_HOST (NAS IP, e.g., 192.168.1.82)
 *   - DB_PORT (default 3306)
 *   - DB_USER (e.g., logistics_api)
 *   - DB_PASSWORD (e.g., LogisticsKPI2026!)
 *   - DB_NAME (e.g., logistics_kpi)
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import * as mariadb from 'mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load migration-specific env file
dotenv.config({ path: path.join(__dirname, 'migrate.env') });

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

// MariaDB configuration
const dbConfig = {
  host: process.env.DB_HOST || '192.168.1.82',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'logistics_api',
  password: process.env.DB_PASSWORD || 'LogisticsKPI2026!',
  database: process.env.DB_NAME || 'logistics_kpi',
  connectionLimit: 5,
};

// Firebase paths to migrate
const PATHS = {
  kpiConfigs: 'kpiConfigs',
  holidays: 'holidays',
  storeClosures: 'storeClosures',
  delayReasons: 'delayReasons',
  storeMappings: 'storeMappings',
  branchResources: 'branchResources',
  branchResourcesHistory: 'branchResourcesHistory',
};

interface MigrationStats {
  kpiConfigs: number;
  holidays: number;
  storeClosures: number;
  delayReasons: number;
  storeMappings: number;
  branchResources: number;
  branchResourcesHistory: number;
  errors: string[];
}

async function fetchFirebaseData(db: any, path: string): Promise<Record<string, any>> {
  try {
    const snapshot = await get(ref(db, path));
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return {};
  } catch (error) {
    console.error(`Error fetching ${path}:`, error);
    return {};
  }
}

async function migrateKpiConfigs(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, config] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO kpi_configs (id, branch, province, district, on_time_limit, is_draft)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         branch = VALUES(branch), province = VALUES(province), district = VALUES(district),
         on_time_limit = VALUES(on_time_limit), is_draft = VALUES(is_draft)`,
        [
          config.id || key,
          config.branch || null,
          config.province || null,
          config.district || '',
          config.onTimeLimit || 3,
          config.isDraft ? 1 : 0,
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting kpi_config ${key}:`, error);
    }
  }
  return count;
}

async function migrateHolidays(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, holiday] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO holidays (id, date, name, type)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         date = VALUES(date), name = VALUES(name), type = VALUES(type)`,
        [
          holiday.id || key,
          holiday.date || null,
          holiday.name || '',
          holiday.type || 'public',
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting holiday ${key}:`, error);
    }
  }
  return count;
}

async function migrateStoreClosures(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, closure] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO store_closures (id, store_id, date, close_rule, reason)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         store_id = VALUES(store_id), date = VALUES(date), close_rule = VALUES(close_rule), reason = VALUES(reason)`,
        [
          closure.id || key,
          closure.storeId || '',
          closure.date || null,
          closure.closeRule || null,
          closure.reason || '',
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting store_closure ${key}:`, error);
    }
  }
  return count;
}

async function migrateDelayReasons(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, reason] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO delay_reasons (code, label, category)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
         label = VALUES(label), category = VALUES(category)`,
        [
          reason.code || key,
          reason.label || '',
          reason.category || 'internal',
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting delay_reason ${key}:`, error);
    }
  }
  return count;
}

async function migrateStoreMappings(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, mapping] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO store_mappings (store_id, district, province, created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         district = VALUES(district), province = VALUES(province)`,
        [
          mapping.storeId || key,
          mapping.district || '',
          mapping.province || null,
          mapping.createdAt ? new Date(mapping.createdAt) : new Date(),
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting store_mapping ${key}:`, error);
    }
  }
  return count;
}

async function migrateBranchResources(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, resource] of Object.entries(data)) {
    try {
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
        [
          resource.id || key,
          resource.branchName || '',
          resource.trucks || 0,
          resource.tripsPerDay || 0,
          resource.loaders || 0,
          resource.checkers || 0,
          resource.admin || 0,
          resource.workHoursPerDay || 8,
          resource.loaderWage || 0,
          resource.checkerWage || 0,
          resource.adminWage || 0,
          resource.truckCostPerDay || 0,
          resource.calculatedCapacity || null,
          resource.calculatedSpeed || null,
          resource.updatedAt ? new Date(resource.updatedAt) : new Date(),
          resource.updatedBy || '',
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting branch_resource ${key}:`, error);
    }
  }
  return count;
}

async function migrateBranchResourceHistory(conn: mariadb.Connection, data: Record<string, any>): Promise<number> {
  let count = 0;
  for (const [key, history] of Object.entries(data)) {
    try {
      await conn.query(
        `INSERT INTO branch_resource_history (id, branch_id, action, changes, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         branch_id = VALUES(branch_id), action = VALUES(action), changes = VALUES(changes),
         updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
        [
          history.id || key,
          history.branchId || '',
          history.action || 'update',
          JSON.stringify(history.changes || {}),
          history.updatedAt ? new Date(history.updatedAt) : new Date(),
          history.updatedBy || '',
        ]
      );
      count++;
    } catch (error) {
      console.error(`Error inserting branch_resource_history ${key}:`, error);
    }
  }
  return count;
}

async function runMigration(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    kpiConfigs: 0,
    holidays: 0,
    storeClosures: 0,
    delayReasons: 0,
    storeMappings: 0,
    branchResources: 0,
    branchResourcesHistory: 0,
    errors: [],
  };

  console.log('='.repeat(60));
  console.log('Firebase to NAS MariaDB Migration');
  console.log('='.repeat(60));

  // Validate Firebase config
  if (!firebaseConfig.databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL is required. Set it in .env or environment variables.');
  }

  console.log('\n📡 Connecting to Firebase...');
  console.log(`   Database URL: ${firebaseConfig.databaseURL}`);
  
  const app = initializeApp(firebaseConfig);
  const firebaseDb = getDatabase(app);

  console.log('\n🔌 Connecting to MariaDB on NAS...');
  console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`   Database: ${dbConfig.database}`);

  const pool = mariadb.createPool(dbConfig);
  const conn = await pool.getConnection();

  try {
    // Fetch all data from Firebase
    console.log('\n📥 Fetching data from Firebase...');
    
    const [
      kpiConfigsData,
      holidaysData,
      storeClosuresData,
      delayReasonsData,
      storeMappingsData,
      branchResourcesData,
      branchResourcesHistoryData,
    ] = await Promise.all([
      fetchFirebaseData(firebaseDb, PATHS.kpiConfigs),
      fetchFirebaseData(firebaseDb, PATHS.holidays),
      fetchFirebaseData(firebaseDb, PATHS.storeClosures),
      fetchFirebaseData(firebaseDb, PATHS.delayReasons),
      fetchFirebaseData(firebaseDb, PATHS.storeMappings),
      fetchFirebaseData(firebaseDb, PATHS.branchResources),
      fetchFirebaseData(firebaseDb, PATHS.branchResourcesHistory),
    ]);

    console.log(`   Found ${Object.keys(kpiConfigsData).length} KPI configs`);
    console.log(`   Found ${Object.keys(holidaysData).length} holidays`);
    console.log(`   Found ${Object.keys(storeClosuresData).length} store closures`);
    console.log(`   Found ${Object.keys(delayReasonsData).length} delay reasons`);
    console.log(`   Found ${Object.keys(storeMappingsData).length} store mappings`);
    console.log(`   Found ${Object.keys(branchResourcesData).length} branch resources`);
    console.log(`   Found ${Object.keys(branchResourcesHistoryData).length} branch resource history`);

    // Migrate each collection
    console.log('\n📤 Migrating to MariaDB...');

    console.log('   Migrating KPI configs...');
    stats.kpiConfigs = await migrateKpiConfigs(conn, kpiConfigsData);

    console.log('   Migrating holidays...');
    stats.holidays = await migrateHolidays(conn, holidaysData);

    console.log('   Migrating store closures...');
    stats.storeClosures = await migrateStoreClosures(conn, storeClosuresData);

    console.log('   Migrating delay reasons...');
    stats.delayReasons = await migrateDelayReasons(conn, delayReasonsData);

    console.log('   Migrating store mappings...');
    stats.storeMappings = await migrateStoreMappings(conn, storeMappingsData);

    console.log('   Migrating branch resources...');
    stats.branchResources = await migrateBranchResources(conn, branchResourcesData);

    console.log('   Migrating branch resource history...');
    stats.branchResourcesHistory = await migrateBranchResourceHistory(conn, branchResourcesHistoryData);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration Complete!');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log(`   KPI Configs:           ${stats.kpiConfigs} records`);
    console.log(`   Holidays:              ${stats.holidays} records`);
    console.log(`   Store Closures:        ${stats.storeClosures} records`);
    console.log(`   Delay Reasons:         ${stats.delayReasons} records`);
    console.log(`   Store Mappings:        ${stats.storeMappings} records`);
    console.log(`   Branch Resources:      ${stats.branchResources} records`);
    console.log(`   Branch Resource Hist:  ${stats.branchResourcesHistory} records`);
    console.log('');
    console.log(`Total: ${
      stats.kpiConfigs + stats.holidays + stats.storeClosures + 
      stats.delayReasons + stats.storeMappings + stats.branchResources + 
      stats.branchResourcesHistory
    } records migrated`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      stats.errors.forEach(err => console.log(`   - ${err}`));
    }

  } finally {
    conn.release();
    await pool.end();
  }

  return stats;
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 Migration finished successfully!');
    console.log('Your system will now use NAS MariaDB as the single source of truth.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
