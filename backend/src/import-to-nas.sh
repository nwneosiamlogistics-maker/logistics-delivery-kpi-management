#!/bin/bash
# Import Firebase JSON data to MariaDB on NAS
# Usage: bash import-to-nas.sh

MYSQL_CMD="/usr/local/mariadb10/bin/mysql"
DB_USER="logistics_api"
DB_PASS="LogisticsKPI2026!"
DB_NAME="logistics_kpi"
JSON_FILE="/volume1/docker/logistics-api/firebase-export.json"

echo "============================================================"
echo "Firebase JSON to MariaDB Import"
echo "============================================================"

if [ ! -f "$JSON_FILE" ]; then
    echo "Error: $JSON_FILE not found"
    exit 1
fi

echo "Reading: $JSON_FILE"

# Use Node.js to parse JSON and generate SQL (Node.js is available on NAS)
/usr/local/bin/node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$JSON_FILE', 'utf8'));

const escape = (s) => {
  if (s === null || s === undefined) return 'NULL';
  return \"'\" + String(s).replace(/'/g, \"''\").replace(/\\\\/g, '\\\\\\\\') + \"'\";
};

let sql = '';
let counts = { kpiConfigs: 0, holidays: 0, storeClosures: 0, delayReasons: 0, storeMappings: 0, branchResources: 0 };

// KPI Configs
if (data.kpiConfigs) {
  for (const [key, c] of Object.entries(data.kpiConfigs)) {
    sql += \`INSERT INTO kpi_configs (id, branch, province, district, on_time_limit, is_draft)
      VALUES (\${escape(c.id || key)}, \${escape(c.branch)}, \${escape(c.province)}, \${escape(c.district || '')}, \${c.onTimeLimit || 3}, \${c.isDraft ? 1 : 0})
      ON DUPLICATE KEY UPDATE branch=VALUES(branch), province=VALUES(province), district=VALUES(district), on_time_limit=VALUES(on_time_limit), is_draft=VALUES(is_draft);\n\`;
    counts.kpiConfigs++;
  }
}

// Holidays
if (data.holidays) {
  for (const [key, h] of Object.entries(data.holidays)) {
    sql += \`INSERT INTO holidays (id, date, name, type)
      VALUES (\${escape(h.id || key)}, \${escape(h.date)}, \${escape(h.name || '')}, \${escape(h.type || 'public')})
      ON DUPLICATE KEY UPDATE date=VALUES(date), name=VALUES(name), type=VALUES(type);\n\`;
    counts.holidays++;
  }
}

// Store Closures
if (data.storeClosures) {
  for (const [key, s] of Object.entries(data.storeClosures)) {
    sql += \`INSERT INTO store_closures (id, store_id, date, close_rule, reason)
      VALUES (\${escape(s.id || key)}, \${escape(s.storeId || '')}, \${escape(s.date)}, \${escape(s.closeRule)}, \${escape(s.reason || '')})
      ON DUPLICATE KEY UPDATE store_id=VALUES(store_id), date=VALUES(date), close_rule=VALUES(close_rule), reason=VALUES(reason);\n\`;
    counts.storeClosures++;
  }
}

// Delay Reasons
if (data.delayReasons) {
  for (const [key, d] of Object.entries(data.delayReasons)) {
    sql += \`INSERT INTO delay_reasons (code, label, category)
      VALUES (\${escape(d.code || key)}, \${escape(d.label || '')}, \${escape(d.category || 'internal')})
      ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category);\n\`;
    counts.delayReasons++;
  }
}

// Store Mappings
if (data.storeMappings) {
  for (const [key, m] of Object.entries(data.storeMappings)) {
    sql += \`INSERT INTO store_mappings (store_id, district, province)
      VALUES (\${escape(m.storeId || key)}, \${escape(m.district || '')}, \${escape(m.province)})
      ON DUPLICATE KEY UPDATE district=VALUES(district), province=VALUES(province);\n\`;
    counts.storeMappings++;
  }
}

// Branch Resources
if (data.branchResources) {
  for (const [key, b] of Object.entries(data.branchResources)) {
    sql += \`INSERT INTO branch_resources (id, branch_name, trucks, trips_per_day, loaders, checkers, admin, work_hours_per_day, loader_wage, checker_wage, admin_wage, truck_cost_per_day)
      VALUES (\${escape(b.id || key)}, \${escape(b.branchName || '')}, \${b.trucks || 0}, \${b.tripsPerDay || 0}, \${b.loaders || 0}, \${b.checkers || 0}, \${b.admin || 0}, \${b.workHoursPerDay || 8}, \${b.loaderWage || 0}, \${b.checkerWage || 0}, \${b.adminWage || 0}, \${b.truckCostPerDay || 0})
      ON DUPLICATE KEY UPDATE branch_name=VALUES(branch_name), trucks=VALUES(trucks), trips_per_day=VALUES(trips_per_day), loaders=VALUES(loaders), checkers=VALUES(checkers), admin=VALUES(admin);\n\`;
    counts.branchResources++;
  }
}

console.log(sql);
console.error('--- Summary ---');
console.error('KPI Configs: ' + counts.kpiConfigs);
console.error('Holidays: ' + counts.holidays);
console.error('Store Closures: ' + counts.storeClosures);
console.error('Delay Reasons: ' + counts.delayReasons);
console.error('Store Mappings: ' + counts.storeMappings);
console.error('Branch Resources: ' + counts.branchResources);
console.error('Total: ' + Object.values(counts).reduce((a,b) => a+b, 0));
" 2>&1 | tee /tmp/import-sql.log | grep -v "^---" | grep -v "^KPI" | grep -v "^Holidays" | grep -v "^Store" | grep -v "^Delay" | grep -v "^Branch" | grep -v "^Total" | $MYSQL_CMD -u"$DB_USER" -p"$DB_PASS" "$DB_NAME"

echo ""
echo "============================================================"
echo "✅ Import Complete!"
echo "============================================================"
grep "^---\|^KPI\|^Holidays\|^Store\|^Delay\|^Branch\|^Total" /tmp/import-sql.log
