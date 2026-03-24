"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const zlib_1 = require("zlib");
const util_1 = require("util");
const db_1 = require("./db");
const gzipAsync = (0, util_1.promisify)(zlib_1.gzip);
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' }));
// Windows-1252 → byte mapping (MySQL "latin1" is actually cp1252)
const CP1252_MAP = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
};
// Fix double-encoded UTF-8 strings (e.g. Thai text stored as latin1/cp1252→utf8)
function fixDoubleEncoded(str) {
    if (!str)
        return str;
    if (!/[À-ÿ]/.test(str))
        return str;
    try {
        const bytes = Buffer.from([...str].map(ch => {
            const cp = ch.charCodeAt(0);
            return CP1252_MAP[cp] ?? (cp & 0xFF);
        }));
        const decoded = bytes.toString('utf8');
        if (!decoded.includes('\uFFFD'))
            return decoded;
    }
    catch { /* ignore */ }
    return str;
}
function safeJsonParse(val) {
    if (!val)
        return undefined;
    try {
        return JSON.parse(val);
    }
    catch {
        return undefined;
    }
}
console.log('[STARTUP] index.js v15g - 2026-03-24 no-proxy-buffering active');
// Auto-migrate: expand store_id column + create import_logs table
(async () => {
    try {
        await (0, db_1.execute)("ALTER TABLE store_mappings MODIFY store_id VARCHAR(255)");
        console.log('[MIGRATION] store_mappings.store_id expanded to VARCHAR(255)');
    }
    catch (e) {
        if (!String(e?.message).includes('store_mappings')) {
            console.warn('[MIGRATION] store_mappings alter skipped:', e?.message);
        }
    }
    try {
        await (0, db_1.execute)(`CREATE TABLE IF NOT EXISTS import_logs (
      id VARCHAR(100) PRIMARY KEY,
      timestamp VARCHAR(50),
      file_name VARCHAR(500),
      user_id VARCHAR(100),
      user_name VARCHAR(200),
      records_processed INT DEFAULT 0,
      created INT DEFAULT 0,
      updated INT DEFAULT 0,
      skipped INT DEFAULT 0,
      errors INT DEFAULT 0,
      error_details TEXT,
      skipped_details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
        console.log('[MIGRATION] import_logs table ready');
    }
    catch (e) {
        console.warn('[MIGRATION] import_logs create skipped:', e?.message);
    }
    try {
        await (0, db_1.execute)('CREATE INDEX IF NOT EXISTS idx_deliveries_plan_date ON deliveries(plan_date)');
        console.log('[MIGRATION] index idx_deliveries_plan_date ready');
    }
    catch (e) {
        console.warn('[MIGRATION] index plan_date skipped:', e?.message);
    }
    try {
        await (0, db_1.execute)('CREATE INDEX IF NOT EXISTS idx_deliveries_updated_at ON deliveries(updated_at)');
        console.log('[MIGRATION] index idx_deliveries_updated_at ready');
    }
    catch (e) {
        console.warn('[MIGRATION] index updated_at skipped:', e?.message);
    }
    try {
        await (0, db_1.execute)(`CREATE TABLE IF NOT EXISTS document_import_logs (
      id VARCHAR(100) PRIMARY KEY,
      timestamp VARCHAR(50),
      file_names TEXT,
      return_date VARCHAR(20),
      confirmed_count INT DEFAULT 0,
      pdf_count INT DEFAULT 0,
      manual_count INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
        console.log('[MIGRATION] document_import_logs table ready');
    }
    catch (e) {
        console.warn('[MIGRATION] document_import_logs create skipped:', e?.message);
    }
})();
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
function fixDate(value) {
    if (!value)
        return null;
    if (value === '' || value === '-' || value === 'N/A')
        return null;
    return value;
}
function sqlDate(v) {
    const safe = fixDate(v);
    if (!safe || safe.trim() === '')
        return 'NULL';
    const s = safe.trim();
    return `'${s.includes('T') ? s.slice(0, 10) : s}'`;
}
function sqlDatetime(v) {
    const safe = fixDate(v);
    if (!safe || safe.trim() === '')
        return 'NULL';
    const s = safe.trim();
    const dt = s.includes('T') ? s.slice(0, 19).replace('T', ' ') : s;
    return `'${dt}'`;
}
function normalizeDate(value) {
    if (!value && value !== 0)
        return null;
    if (typeof value !== 'string')
        return value ?? null;
    const trimmed = value.trim();
    if (!trimmed.length)
        return null;
    return trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed;
}
function normalizeDatetime(value) {
    if (!value && value !== 0)
        return null;
    if (typeof value !== 'string')
        return value ?? null;
    const trimmed = value.trim();
    if (!trimmed.length)
        return null;
    if (trimmed.includes('T'))
        return trimmed.slice(0, 19).replace('T', ' ');
    return trimmed;
}
// ============ DELIVERIES ============
app.get('/api/deliveries', async (req, res) => {
    try {
        const all = req.query.all === 'true';
        const days = parseInt(String(req.query.days || '30'), 10);
        const sql = all
            ? 'SELECT * FROM deliveries ORDER BY plan_date DESC'
            : `SELECT * FROM deliveries WHERE plan_date >= DATE_SUB(NOW(), INTERVAL ${days} DAY) ORDER BY plan_date DESC`;
        const rows = await (0, db_1.query)(sql);
        console.log(`[deliveries] loaded ${rows.length} rows (all=${all}, days=${days})`);
        const sanitized = rows.map((r) => ({
            ...r,
            qty: r.qty !== null && r.qty !== undefined ? parseFloat(String(r.qty)) : 0,
            delay_days: r.delay_days !== null && r.delay_days !== undefined ? parseInt(String(r.delay_days), 10) : 0,
            delivery_status: fixDoubleEncoded(r.delivery_status),
        }));
        const json = JSON.stringify(sanitized);
        console.log(`[deliveries] sending ${Math.round(json.length / 1024)}KB plain JSON`);
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Content-Type', 'application/json');
        res.end(json);
    }
    catch (error) {
        console.error('Error fetching deliveries:', error);
        res.status(500).json({ error: 'Failed to fetch deliveries' });
    }
});
app.get('/api/deliveries/:orderNo', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM deliveries WHERE order_no = ?', [req.params.orderNo]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Delivery not found' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching delivery:', error);
        res.status(500).json({ error: 'Failed to fetch delivery' });
    }
});
app.post('/api/deliveries', async (req, res) => {
    try {
        const d = req.body;
        const planDate = normalizeDate(d.planDate);
        const openDate = normalizeDate(d.openDate);
        const actualDate = normalizeDate(d.actualDate);
        const actualDatetime = normalizeDatetime(d.actualDatetime);
        const documentReturnedDate = normalizeDate(d.documentReturnedDate);
        const documentReturnBillDate = normalizeDate(d.documentReturnBillDate);
        const updatedAt = normalizeDatetime(d.updatedAt) ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
        await (0, db_1.execute)(`
      INSERT INTO deliveries (
        order_no, district, store_id, plan_date, open_date, actual_date, qty, sender, province,
        import_file_id, delivery_status, actual_datetime, product_details, kpi_status, delay_days,
        reason_required, reason_status, delay_reason, updated_at, weekday, document_returned,
        document_returned_date, document_return_bill_date, document_return_source, manual_plan_date, manual_actual_date
      ) VALUES (?, ?, ?, ${sqlDate(planDate)}, ${sqlDate(openDate)}, ${sqlDate(actualDate)}, ?, ?, ?, ?, ?, ${sqlDatetime(actualDatetime)}, ?, ?, ?, ?, ?, ?, ${sqlDatetime(updatedAt)}, ?, ?, ${sqlDate(documentReturnedDate)}, ${sqlDate(documentReturnBillDate)}, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        district = VALUES(district), store_id = VALUES(store_id), plan_date = VALUES(plan_date),
        open_date = VALUES(open_date), actual_date = VALUES(actual_date), qty = VALUES(qty),
        sender = VALUES(sender), province = VALUES(province), import_file_id = VALUES(import_file_id),
        delivery_status = VALUES(delivery_status), actual_datetime = VALUES(actual_datetime),
        product_details = VALUES(product_details), kpi_status = VALUES(kpi_status), delay_days = VALUES(delay_days),
        reason_required = VALUES(reason_required), reason_status = VALUES(reason_status),
        delay_reason = VALUES(delay_reason), updated_at = VALUES(updated_at), weekday = VALUES(weekday),
        document_returned = VALUES(document_returned), document_returned_date = VALUES(document_returned_date),
        document_return_bill_date = VALUES(document_return_bill_date), document_return_source = VALUES(document_return_source),
        manual_plan_date = VALUES(manual_plan_date), manual_actual_date = VALUES(manual_actual_date)
    `, [
            d.orderNo, d.district, d.storeId, d.qty, d.sender, d.province,
            d.importFileId, d.deliveryStatus, d.productDetails, d.kpiStatus, d.delayDays,
            d.reasonRequired ? 1 : 0, d.reasonStatus, d.delayReason, d.weekday, d.documentReturned ? 1 : 0,
            d.documentReturnSource, d.manualPlanDate ? 1 : 0, d.manualActualDate ? 1 : 0
        ]);
        res.json({ success: true, orderNo: d.orderNo });
    }
    catch (error) {
        console.error('Error saving delivery:', error);
        res.status(500).json({ error: 'Failed to save delivery' });
    }
});
app.post('/api/deliveries/bulk', async (req, res) => {
    try {
        const deliveries = req.body;
        if (deliveries.length > 0) {
            const f = deliveries[0];
            console.log(`[BULK-DEBUG] first record: orderNo=${f.orderNo} planDate=${JSON.stringify(f.planDate)} actualDate=${JSON.stringify(f.actualDate)} actualDatetime=${JSON.stringify(f.actualDatetime)}`);
        }
        let saved = 0;
        for (const d of deliveries) {
            const planDate = normalizeDate(d.planDate);
            const openDate = normalizeDate(d.openDate);
            const actualDate = normalizeDate(d.actualDate);
            const actualDatetime = normalizeDatetime(d.actualDatetime);
            const documentReturnedDate = normalizeDate(d.documentReturnedDate);
            const documentReturnBillDate = normalizeDate(d.documentReturnBillDate);
            const updatedAt = normalizeDatetime(d.updatedAt) ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
            if (saved === 0)
                console.log(`[NORM-DEBUG] orderNo=${d.orderNo} raw_actualDate=${JSON.stringify(d.actualDate)} sqlDate=${sqlDate(actualDate)} sqlDatetime=${sqlDatetime(actualDatetime)}`);
            await (0, db_1.execute)(`
        INSERT INTO deliveries (
          order_no, district, store_id, plan_date, open_date, actual_date, qty, sender, province,
          import_file_id, delivery_status, actual_datetime, product_details, kpi_status, delay_days,
          reason_required, reason_status, delay_reason, updated_at, weekday, document_returned,
          document_returned_date, document_return_bill_date, document_return_source, manual_plan_date, manual_actual_date
        ) VALUES (?, ?, ?, ${sqlDate(planDate)}, ${sqlDate(openDate)}, ${sqlDate(actualDate)}, ?, ?, ?, ?, ?, ${sqlDatetime(actualDatetime)}, ?, ?, ?, ?, ?, ?, ${sqlDatetime(updatedAt)}, ?, ?, ${sqlDate(documentReturnedDate)}, ${sqlDate(documentReturnBillDate)}, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          district = VALUES(district), store_id = VALUES(store_id), plan_date = VALUES(plan_date),
          open_date = VALUES(open_date), actual_date = VALUES(actual_date), qty = VALUES(qty),
          sender = VALUES(sender), province = VALUES(province), import_file_id = VALUES(import_file_id),
          delivery_status = VALUES(delivery_status), actual_datetime = VALUES(actual_datetime),
          product_details = VALUES(product_details), kpi_status = VALUES(kpi_status), delay_days = VALUES(delay_days),
          reason_required = VALUES(reason_required), reason_status = VALUES(reason_status),
          delay_reason = VALUES(delay_reason), updated_at = VALUES(updated_at), weekday = VALUES(weekday),
          document_returned = VALUES(document_returned), document_returned_date = VALUES(document_returned_date),
          document_return_bill_date = VALUES(document_return_bill_date), document_return_source = VALUES(document_return_source),
          manual_plan_date = VALUES(manual_plan_date), manual_actual_date = VALUES(manual_actual_date)
      `, [
                d.orderNo, d.district, d.storeId, d.qty, d.sender, d.province,
                d.importFileId, d.deliveryStatus, d.productDetails, d.kpiStatus, d.delayDays,
                d.reasonRequired ? 1 : 0, d.reasonStatus, d.delayReason, d.weekday, d.documentReturned ? 1 : 0,
                d.documentReturnSource, d.manualPlanDate ? 1 : 0, d.manualActualDate ? 1 : 0
            ]);
            saved++;
        }
        console.log(`[BULK] Saved ${saved}/${deliveries.length} records`);
        res.json({ success: true, saved });
    }
    catch (error) {
        console.error('Error bulk saving deliveries:', error);
        res.status(500).json({ error: 'Failed to bulk save deliveries' });
    }
});
app.post('/api/deliveries/import', async (req, res) => {
    try {
        const deliveries = req.body;
        if (!Array.isArray(deliveries) || deliveries.length === 0) {
            return res.status(400).json({ error: 'Expected non-empty array of deliveries' });
        }
        console.log(`[IMPORT] Starting server-side import: ${deliveries.length} records`);
        let saved = 0, errors = 0;
        for (const d of deliveries) {
            try {
                const planDate = normalizeDate(d.planDate);
                const openDate = normalizeDate(d.openDate);
                const actualDate = normalizeDate(d.actualDate);
                const actualDatetime = normalizeDatetime(d.actualDatetime);
                const documentReturnedDate = normalizeDate(d.documentReturnedDate);
                const documentReturnBillDate = normalizeDate(d.documentReturnBillDate);
                const updatedAt = normalizeDatetime(d.updatedAt) ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
                await (0, db_1.execute)(`
          INSERT INTO deliveries (
            order_no, district, store_id, plan_date, open_date, actual_date, qty, sender, province,
            import_file_id, delivery_status, actual_datetime, product_details, kpi_status, delay_days,
            reason_required, reason_status, delay_reason, updated_at, weekday, document_returned,
            document_returned_date, document_return_bill_date, document_return_source, manual_plan_date, manual_actual_date
          ) VALUES (?, ?, ?, ${sqlDate(planDate)}, ${sqlDate(openDate)}, ${sqlDate(actualDate)}, ?, ?, ?, ?, ?, ${sqlDatetime(actualDatetime)}, ?, ?, ?, ?, ?, ?, ${sqlDatetime(updatedAt)}, ?, ?, ${sqlDate(documentReturnedDate)}, ${sqlDate(documentReturnBillDate)}, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            district = VALUES(district), store_id = VALUES(store_id), plan_date = VALUES(plan_date),
            open_date = VALUES(open_date), actual_date = VALUES(actual_date), qty = VALUES(qty),
            sender = VALUES(sender), province = VALUES(province), import_file_id = VALUES(import_file_id),
            delivery_status = VALUES(delivery_status), actual_datetime = VALUES(actual_datetime),
            product_details = VALUES(product_details), kpi_status = VALUES(kpi_status), delay_days = VALUES(delay_days),
            reason_required = VALUES(reason_required), reason_status = VALUES(reason_status),
            delay_reason = VALUES(delay_reason), updated_at = VALUES(updated_at), weekday = VALUES(weekday),
            document_returned = VALUES(document_returned), document_returned_date = VALUES(document_returned_date),
            document_return_bill_date = VALUES(document_return_bill_date), document_return_source = VALUES(document_return_source),
            manual_plan_date = VALUES(manual_plan_date), manual_actual_date = VALUES(manual_actual_date)
        `, [
                    d.orderNo, d.district, d.storeId, d.qty, d.sender, d.province,
                    d.importFileId, d.deliveryStatus, d.productDetails, d.kpiStatus, d.delayDays,
                    d.reasonRequired ? 1 : 0, d.reasonStatus, d.delayReason, d.weekday, d.documentReturned ? 1 : 0,
                    d.documentReturnSource, d.manualPlanDate ? 1 : 0, d.manualActualDate ? 1 : 0
                ]);
                saved++;
            }
            catch (err) {
                errors++;
                if (errors <= 3)
                    console.warn(`[IMPORT] record error orderNo=${d.orderNo}:`, err);
            }
        }
        console.log(`[IMPORT] Done: ${saved} saved, ${errors} errors / ${deliveries.length} total`);
        res.json({ success: true, saved, errors, total: deliveries.length });
    }
    catch (error) {
        console.error('[IMPORT] Fatal error:', error);
        res.status(500).json({ error: 'Failed to import deliveries' });
    }
});
app.patch('/api/deliveries/:orderNo', async (req, res) => {
    try {
        const updates = req.body;
        const fields = Object.keys(updates).map(k => `${toSnakeCase(k)} = ?`).join(', ');
        const values = Object.values(updates);
        await (0, db_1.execute)(`UPDATE deliveries SET ${fields} WHERE order_no = ?`, [...values, req.params.orderNo]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating delivery:', error);
        res.status(500).json({ error: 'Failed to update delivery' });
    }
});
// ============ HOLIDAYS ============
app.get('/api/holidays', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM holidays ORDER BY date');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays' });
    }
});
app.post('/api/holidays', async (req, res) => {
    try {
        const h = req.body;
        await (0, db_1.execute)('INSERT INTO holidays (id, date, name, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type)', [h.id, h.date, h.name, h.type]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save holiday' });
    }
});
app.delete('/api/holidays/:id', async (req, res) => {
    try {
        await (0, db_1.execute)('DELETE FROM holidays WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete holiday' });
    }
});
// ============ KPI CONFIGS ============
app.get('/api/kpi-configs', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM kpi_configs');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch KPI configs' });
    }
});
app.post('/api/kpi-configs', async (req, res) => {
    try {
        const c = req.body;
        await (0, db_1.execute)('INSERT INTO kpi_configs (id, branch, province, district, on_time_limit, is_draft) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE branch = VALUES(branch), province = VALUES(province), district = VALUES(district), on_time_limit = VALUES(on_time_limit), is_draft = VALUES(is_draft)', [c.id, c.branch, c.province, c.district, c.onTimeLimit, c.isDraft ? 1 : 0]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save KPI config' });
    }
});
app.delete('/api/kpi-configs/:id', async (req, res) => {
    try {
        await (0, db_1.execute)('DELETE FROM kpi_configs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete KPI config' });
    }
});
// ============ STORE CLOSURES ============
app.get('/api/store-closures', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM store_closures ORDER BY date');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch store closures' });
    }
});
app.post('/api/store-closures', async (req, res) => {
    try {
        const s = req.body;
        await (0, db_1.execute)('INSERT INTO store_closures (id, store_id, date, close_rule, reason) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), date = VALUES(date), close_rule = VALUES(close_rule), reason = VALUES(reason)', [s.id, s.storeId, s.date, s.closeRule, s.reason]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save store closure' });
    }
});
app.delete('/api/store-closures/:id', async (req, res) => {
    try {
        await (0, db_1.execute)('DELETE FROM store_closures WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete store closure' });
    }
});
// ============ DELAY REASONS ============
app.get('/api/delay-reasons', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM delay_reasons');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch delay reasons' });
    }
});
app.post('/api/delay-reasons', async (req, res) => {
    try {
        const d = req.body;
        await (0, db_1.execute)('INSERT INTO delay_reasons (code, label, category) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)', [d.code, d.label, d.category]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save delay reason' });
    }
});
app.delete('/api/delay-reasons/:code', async (req, res) => {
    try {
        await (0, db_1.execute)('DELETE FROM delay_reasons WHERE code = ?', [req.params.code]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete delay reason' });
    }
});
// ============ STORE MAPPINGS ============
app.get('/api/store-mappings', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM store_mappings');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch store mappings' });
    }
});
app.post('/api/store-mappings', async (req, res) => {
    try {
        const m = req.body;
        await (0, db_1.execute)('INSERT INTO store_mappings (store_id, district, province, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE district = VALUES(district), province = VALUES(province)', [m.storeId, m.district, m.province, m.createdAt]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save store mapping' });
    }
});
// ============ BRANCH RESOURCES ============
app.get('/api/branch-resources', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM branch_resources');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch branch resources' });
    }
});
app.post('/api/branch-resources', async (req, res) => {
    try {
        const r = req.body;
        await (0, db_1.execute)(`
      INSERT INTO branch_resources (id, branch_name, trucks, trips_per_day, loaders, checkers, admin, work_hours_per_day, loader_wage, checker_wage, admin_wage, truck_cost_per_day, calculated_capacity, calculated_speed, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE branch_name = VALUES(branch_name), trucks = VALUES(trucks), trips_per_day = VALUES(trips_per_day), loaders = VALUES(loaders), checkers = VALUES(checkers), admin = VALUES(admin), work_hours_per_day = VALUES(work_hours_per_day), loader_wage = VALUES(loader_wage), checker_wage = VALUES(checker_wage), admin_wage = VALUES(admin_wage), truck_cost_per_day = VALUES(truck_cost_per_day), calculated_capacity = VALUES(calculated_capacity), calculated_speed = VALUES(calculated_speed), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)
    `, [r.id, r.branchName, r.trucks, r.tripsPerDay, r.loaders, r.checkers, r.admin, r.workHoursPerDay, r.loaderWage, r.checkerWage, r.adminWage, r.truckCostPerDay, r.calculatedCapacity, r.calculatedSpeed, r.updatedAt, r.updatedBy]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[branch-resources] save error:', error);
        res.status(500).json({ error: 'Failed to save branch resource' });
    }
});
// ============ IMPORT LOGS ============
app.get('/api/import-logs', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM import_logs ORDER BY timestamp DESC LIMIT 200');
        const logs = rows.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            fileName: r.file_name,
            userId: r.user_id,
            userName: r.user_name,
            recordsProcessed: r.records_processed,
            created: r.created,
            updated: r.updated,
            skipped: r.skipped,
            errors: r.errors,
            errorDetails: safeJsonParse(r.error_details),
            skippedDetails: safeJsonParse(r.skipped_details),
        }));
        res.json(logs);
    }
    catch (error) {
        console.error('[import-logs] fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch import logs' });
    }
});
app.post('/api/import-logs', async (req, res) => {
    try {
        const l = req.body;
        await (0, db_1.execute)('INSERT INTO import_logs (id, timestamp, file_name, user_id, user_name, records_processed, created, updated, skipped, errors, error_details, skipped_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE timestamp=VALUES(timestamp)', [l.id, l.timestamp, l.fileName, l.userId, l.userName,
            l.recordsProcessed || 0, l.created || 0, l.updated || 0, l.skipped || 0, l.errors || 0,
            l.errorDetails ? JSON.stringify(l.errorDetails) : null,
            l.skippedDetails ? JSON.stringify(l.skippedDetails) : null]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[import-logs] save error:', error);
        res.status(500).json({ error: 'Failed to save import log' });
    }
});
// ============ DOCUMENT IMPORT LOGS ============
app.get('/api/document-import-logs', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM document_import_logs ORDER BY timestamp DESC LIMIT 200');
        const logs = rows.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            fileNames: r.file_names ? JSON.parse(r.file_names) : [],
            returnDate: r.return_date,
            confirmedCount: r.confirmed_count,
            pdfCount: r.pdf_count,
            manualCount: r.manual_count,
        }));
        res.json(logs);
    }
    catch (error) {
        console.error('[document-import-logs] fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch document import logs' });
    }
});
app.post('/api/document-import-logs', async (req, res) => {
    try {
        const l = req.body;
        await (0, db_1.execute)('INSERT INTO document_import_logs (id, timestamp, file_names, return_date, confirmed_count, pdf_count, manual_count) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE timestamp=VALUES(timestamp)', [l.id, l.timestamp, JSON.stringify(l.fileNames || []), l.returnDate || '', l.confirmedCount || 0, l.pdfCount || 0, l.manualCount || 0]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[document-import-logs] save error:', error);
        res.status(500).json({ error: 'Failed to save document import log' });
    }
});
// ============ BRANCH RESOURCE HISTORY ============
app.get('/api/branch-resource-history/:branchId', async (req, res) => {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM branch_resource_history WHERE branch_id = ? ORDER BY updated_at DESC', [req.params.branchId]);
        res.json(rows);
    }
    catch (error) {
        console.error('[branch-resource-history] fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch branch resource history' });
    }
});
// Helper: camelCase to snake_case
function toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Logistics KPI API running on port ${PORT}`);
});
