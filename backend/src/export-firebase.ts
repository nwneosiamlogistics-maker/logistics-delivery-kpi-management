/**
 * Export Firebase Realtime Database to JSON file
 * Run this on your local machine to export data before uploading to NAS
 * 
 * Usage: npm run export-firebase
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import * as fs from 'fs';
import * as path from 'path';

// Firebase configuration - using the project's Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyDummyKey',
  authDomain: 'delivery-kpi-ddc7b.firebaseapp.com',
  databaseURL: 'https://delivery-kpi-ddc7b-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'delivery-kpi-ddc7b',
};

// Firebase paths to export
const PATHS = [
  'kpiConfigs',
  'holidays',
  'storeClosures',
  'delayReasons',
  'storeMappings',
  'branchResources',
  'branchResourcesHistory',
];

async function fetchData(db: any, nodePath: string): Promise<any> {
  try {
    const snapshot = await get(ref(db, nodePath));
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return {};
  } catch (error) {
    console.error(`Error fetching ${nodePath}:`, error);
    return {};
  }
}

async function exportFirebase() {
  console.log('='.repeat(60));
  console.log('Firebase Data Export');
  console.log('='.repeat(60));
  console.log(`\nDatabase URL: ${firebaseConfig.databaseURL}\n`);

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  const exportData: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    source: firebaseConfig.databaseURL,
  };

  for (const nodePath of PATHS) {
    console.log(`📥 Fetching ${nodePath}...`);
    const data = await fetchData(db, nodePath);
    const count = Object.keys(data).length;
    exportData[nodePath] = data;
    console.log(`   Found ${count} records`);
  }

  // Write to JSON file
  const outputFile = path.join(__dirname, 'firebase-export.json');
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2), 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Export Complete!');
  console.log('='.repeat(60));
  console.log(`\nOutput file: ${outputFile}`);
  console.log('\nNext steps:');
  console.log('1. Upload firebase-export.json to NAS (e.g., /volume1/docker/logistics-api/)');
  console.log('2. Run import-json-to-mariadb.sh via Task Scheduler on NAS');
}

exportFirebase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  });
