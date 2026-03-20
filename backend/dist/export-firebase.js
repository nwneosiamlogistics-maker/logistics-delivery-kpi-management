"use strict";
/**
 * Export Firebase Realtime Database to JSON file
 * Run this on your local machine to export data before uploading to NAS
 *
 * Usage: npm run export-firebase
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("firebase/app");
const database_1 = require("firebase/database");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Firebase configuration - using the project's Firebase
const firebaseConfig = {
    apiKey: 'AIzaSyDummyKey',
    authDomain: 'delivery-kpi-ddc7b.firebaseapp.com',
    databaseURL: 'https://delivery-kpi-ddc7b-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'delivery-kpi-ddc7b',
};
// Firebase paths to export
const PATHS = [
    'deliveries',
    'kpiConfigs',
    'holidays',
    'storeClosures',
    'delayReasons',
    'storeMappings',
    'branchResources',
    'branchResourcesHistory',
];
async function fetchData(db, nodePath) {
    try {
        const snapshot = await (0, database_1.get)((0, database_1.ref)(db, nodePath));
        if (snapshot.exists()) {
            return snapshot.val();
        }
        return {};
    }
    catch (error) {
        console.error(`Error fetching ${nodePath}:`, error);
        return {};
    }
}
async function exportFirebase() {
    console.log('='.repeat(60));
    console.log('Firebase Data Export');
    console.log('='.repeat(60));
    console.log(`\nDatabase URL: ${firebaseConfig.databaseURL}\n`);
    const app = (0, app_1.initializeApp)(firebaseConfig);
    const db = (0, database_1.getDatabase)(app);
    const exportData = {
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
