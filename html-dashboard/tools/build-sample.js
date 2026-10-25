'use strict';
/**
 * Build the sample dashboard data from the raw MIS CSV files in data/raw.
 *   node tools/build-sample.js
 * Writes:
 *   data/processed/dashboard.json   (what the server and the static page load)
 *   js/sample-data.js               (so index.html also works when opened from disk)
 */
const fs = require('fs');
const path = require('path');
const { newStore, ingestRows, buildDashboard, TABLES } = require('../server/aggregate');
const { readCsv } = require('./csv');

const root = path.join(__dirname, '..');
const store = newStore();
const log = [];
for (const t of TABLES) {
  const f = path.join(root, 'data', 'raw', `${t}.csv`);
  if (!fs.existsSync(f)) continue;
  const { rows } = readCsv(f);
  const st = ingestRows(store, t, rows);
  log.push({ at: new Date().toISOString(), file: `${t}.csv`, ...st, status: st.rejected ? 'accepted_with_rejects' : 'accepted' });
  console.log(t.padEnd(22), 'read', st.rows_read, 'new', st.inserted, 'dup', st.duplicates_in_file, 'rejected', st.rejected);
}
const dash = buildDashboard(store, log);
fs.mkdirSync(path.join(root, 'data', 'processed'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'processed', 'dashboard.json'), JSON.stringify(dash));
fs.writeFileSync(path.join(root, 'js', 'sample-data.js'), 'window.__MIS_SAMPLE__=' + JSON.stringify(dash) + ';\n');
console.log('dashboard.json bytes:', fs.statSync(path.join(root, 'data', 'processed', 'dashboard.json')).size);
