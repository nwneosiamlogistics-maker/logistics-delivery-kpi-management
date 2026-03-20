"use strict";
/**
 * Import deliveries to NAS via API
 * Run: npx tsx src/import-via-api.ts
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const API_URL = 'https://mat-designed-restoration-talented.trycloudflare.com';
const BATCH_SIZE = 100;
async function importDeliveries() {
    console.log('='.repeat(60));
    console.log('Import Deliveries to NAS via API');
    console.log('='.repeat(60));
    const jsonFile = path.join(__dirname, 'firebase-export.json');
    console.log('\nReading:', jsonFile);
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    if (!data.deliveries) {
        console.error('No deliveries found in export file!');
        process.exit(1);
    }
    const deliveries = Object.entries(data.deliveries).map(([key, d]) => ({
        orderNo: d.orderNo || key,
        district: d.district,
        storeId: d.storeId,
        planDate: d.planDate,
        openDate: d.openDate,
        actualDate: d.actualDate,
        qty: d.qty || 0,
        sender: d.sender,
        province: d.province,
        importFileId: d.importFileId,
        deliveryStatus: d.deliveryStatus,
        actualDatetime: d.actualDatetime,
        productDetails: d.productDetails,
        kpiStatus: d.kpiStatus,
        delayDays: d.delayDays || 0,
        reasonRequired: d.reasonRequired,
        reasonStatus: d.reasonStatus,
        delayReason: d.delayReason,
        weekday: d.weekday,
        documentReturned: d.documentReturned,
        documentReturnedDate: d.documentReturnedDate,
        documentReturnBillDate: d.documentReturnBillDate,
        documentReturnSource: d.documentReturnSource,
        manualPlanDate: d.manualPlanDate,
        manualActualDate: d.manualActualDate,
    }));
    console.log(`Total deliveries: ${deliveries.length}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`Total batches: ${Math.ceil(deliveries.length / BATCH_SIZE)}`);
    let imported = 0;
    let failed = 0;
    for (let i = 0; i < deliveries.length; i += BATCH_SIZE) {
        const batch = deliveries.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(deliveries.length / BATCH_SIZE);
        try {
            const response = await fetch(`${API_URL}/api/deliveries/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch),
            });
            if (response.ok) {
                imported += batch.length;
                process.stdout.write(`\rBatch ${batchNum}/${totalBatches} - Imported: ${imported}/${deliveries.length}`);
            }
            else {
                failed += batch.length;
                console.error(`\nBatch ${batchNum} failed: ${response.status}`);
            }
        }
        catch (error) {
            failed += batch.length;
            console.error(`\nBatch ${batchNum} error:`, error);
        }
    }
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ Import Complete!');
    console.log('='.repeat(60));
    console.log(`Imported: ${imported}`);
    console.log(`Failed: ${failed}`);
}
importDeliveries()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
});
