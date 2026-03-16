/**
 * Import deliveries to NAS via API
 * Run: npx tsx src/import-via-api.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'https://mat-designed-restoration-talented.trycloudflare.com';
const BATCH_SIZE = 100;

interface Delivery {
  orderNo: string;
  district?: string;
  storeId?: string;
  planDate?: string;
  openDate?: string;
  actualDate?: string;
  qty?: number;
  sender?: string;
  province?: string;
  importFileId?: string;
  deliveryStatus?: string;
  actualDatetime?: string;
  productDetails?: string;
  kpiStatus?: string;
  delayDays?: number;
  reasonRequired?: boolean;
  reasonStatus?: string;
  delayReason?: string;
  weekday?: string;
  documentReturned?: boolean;
  documentReturnedDate?: string;
  documentReturnBillDate?: string;
  documentReturnSource?: string;
  manualPlanDate?: boolean;
  manualActualDate?: boolean;
}

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

  const deliveries: Delivery[] = Object.entries(data.deliveries).map(([key, d]: [string, any]) => ({
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
      } else {
        failed += batch.length;
        console.error(`\nBatch ${batchNum} failed: ${response.status}`);
      }
    } catch (error) {
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
