'use strict';
/**
 * End-to-end test of the ingestion folder, in an isolated temp work directory.
 *   node tests/ingest_test.js
 * Starts the server, drops files into the inbox, and checks what happens.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mis-ingest-'));
const PORT = 8099;
const get = (p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = async () => JSON.parse((await get('/api/data')).body);
const sum = (d, col) => d.sales.rows.reduce((a, r) => a + r[d.sales.cols.indexOf(col)], 0);
const targetOf = (d, ym, b) => (d.targets.find((t) => t.ym === ym && t.branch_id === b) || {}).target;

let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const srv = spawn('node', [path.join(ROOT, 'server', 'ingest.js')], { env: { ...process.env, PORT, SCAN_MS: 300, MIS_WORKDIR: WORK }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; srv.stdout.on('data', (d) => (logs += d)); srv.stderr.on('data', (d) => (logs += d));
  try {
    for (let i = 0; i < 50; i++) { try { if ((await get('/api/data')).status === 200) break; } catch { /* not up yet */ } await sleep(200); }
    const inbox = path.join(WORK, 'inbox');
    const d0 = await data();
    const rev0 = sum(d0, 'net');
    check('server starts with the sample data loaded', Math.abs(rev0 - 1487953549.41) < 5, `(net revenue ${Math.round(rev0).toLocaleString()})`);

    // 1) CSV with new sales lines (+ one repeated line inside the file)
    const hdr = 'order_id,order_line_id,order_date,delivery_date,promised_date,customer_id,product_id,branch_id,rep_id,quantity,unit_price,discount_pct,unit_cost,order_status';
    const line = (id, qty) => `9${id},9${id}1,2026-09-15,2026-09-17,2026-09-18,1001,1,1,1,${qty},1000,0.10,600,Delivered`;
    fs.writeFileSync(path.join(inbox, 'fact_sales_update.csv'), [hdr, line(1, 10), line(2, 20), line(2, 20)].join('\n'));
    await sleep(1500);
    const d1 = await data();
    check('CSV: new sales lines change net revenue by exactly +27,000', Math.abs(sum(d1, 'net') - rev0 - 27000) < 0.01, `(delta ${(sum(d1, 'net') - rev0).toFixed(2)})`);
    check('CSV: repeated line inside the file counted as duplicate', d1.data_quality.duplicates_dropped === d0.data_quality.duplicates_dropped + 1);

    // 2) JSON that UPDATES an existing target (upsert, not append)
    const t0 = targetOf(d1, '2026-09', 1);
    fs.writeFileSync(path.join(inbox, 'targets_revision.json'), JSON.stringify({ fact_target_monthly: [{ branch_id: 1, month_start: '2026-09-01', target_net_revenue: 1 }] }));
    await sleep(1500);
    const d2 = await data();
    check('JSON: existing target is updated in place', targetOf(d2, '2026-09', 1) === 1 && d2.targets.length === d1.targets.length, `(was ${t0})`);

    // 3) XLSX with a ticket sheet
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('fact_support_ticket');
    ws.addRow(['ticket_id', 'created_at', 'resolved_at', 'branch_id', 'customer_id', 'ticket_category', 'priority', 'sla_hours', 'csat_score']);
    ws.addRow([990001, new Date(Date.UTC(2026, 8, 20, 9, 0, 0)), new Date(Date.UTC(2026, 8, 20, 12, 0, 0)), 1, 1001, 'Billing', 'Low', 24, 5]);
    await wb.xlsx.writeFile(path.join(inbox, 'tickets_extra.xlsx'));
    await sleep(1800);
    const d3 = await data();
    const tk = (d) => d.tickets.rows.reduce((a, r) => a + r[d.tickets.cols.indexOf('tickets')], 0);
    check('XLSX: new ticket added', tk(d3) === tk(d2) + 1, `(${tk(d2)} -> ${tk(d3)})`);

    // 4) bad files are rejected with a reason and do not change the data
    fs.writeFileSync(path.join(inbox, 'fact_sales_bad.csv'), 'order_id,order_line_id\n1,2\n');
    fs.writeFileSync(path.join(inbox, 'dump.sql'), 'DROP TABLE fact_sales;');
    fs.writeFileSync(path.join(inbox, 'notes.txt'), 'hello');
    await sleep(1800);
    const rej = fs.readdirSync(path.join(WORK, 'rejected')).filter((n) => n.endsWith('.reason.txt'));
    check('bad files moved to rejected/ with a reason (3 files)', rej.length === 3, `(${rej.length})`);
    const d4 = await data();
    check('rejected files did not change the data', Math.abs(sum(d4, 'net') - sum(d3, 'net')) < 0.01 && tk(d4) === tk(d3));
    check('processed/ holds the 3 accepted files', fs.readdirSync(path.join(WORK, 'processed')).length === 3);
    check('ingest log recorded the activity', d4.ingest_log.some((l) => l.status === 'rejected') && d4.ingest_log.some((l) => l.status === 'accepted'));

    // 5) the store survives a restart
    srv.kill(); await sleep(500);
    const srv2 = spawn('node', [path.join(ROOT, 'server', 'ingest.js')], { env: { ...process.env, PORT, SCAN_MS: 300, MIS_WORKDIR: WORK }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { if ((await get('/api/data')).status === 200) break; } catch { /* wait */ } await sleep(200); }
    const d5 = await data();
    check('after restart the ingested data is still there', Math.abs(sum(d5, 'net') - sum(d4, 'net')) < 0.01 && tk(d5) === tk(d4));

    // 6) security: only public folders are served
    const s1 = await get('/server/ingest.js'), s2 = await get('/data/store/store.json'), s3 = await get('/..%2Fpackage.json'), s4 = await get('/data/raw/fact_sales.csv');
    check('server code / store / raw data / traversal are not served', [s1, s2, s3, s4].every((r) => r.status === 404), `(${[s1, s2, s3, s4].map((r) => r.status).join(',')})`);
    srv2.kill();
  } catch (e) {
    failed++; console.error('TEST ERROR', e, '\n--- server log ---\n' + logs);
  } finally {
    srv.kill();
    fs.rmSync(WORK, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll ingestion checks passed');
  process.exit(failed ? 1 : 0);
})();
