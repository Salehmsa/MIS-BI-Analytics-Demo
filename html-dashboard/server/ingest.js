'use strict';
/**
 * MIS dashboard server: static files + automatic ingestion folder.
 *
 *   node server/ingest.js            (default http://127.0.0.1:8080)
 *
 * Drop CSV / XLSX / JSON files into ./inbox. Every few seconds the server:
 *   1. waits until a file has stopped growing,
 *   2. detects which table it holds (file name, sheet name, or column signature),
 *   3. validates it (missing columns => whole file rejected; bad rows => rejected row by row),
 *   4. upserts the rows into the store (new keys inserted, existing keys updated),
 *   5. rebuilds data/processed/dashboard.json and tells open dashboards via Server-Sent Events,
 *   6. moves the file to ./processed (or ./rejected with a .reason.txt next to it).
 *
 * .sql files are deliberately NOT executed (arbitrary SQL from a shared folder is unsafe);
 * load databases through a read-only connector and export tables instead (see docs/DEPLOYMENT.md).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const ExcelJS = require('exceljs');
const { readCsv } = require('../tools/csv');
const { newStore, ingestRows, detectTable, buildDashboard, TABLES, SCHEMAS, normHeader } = require('./aggregate');

const ROOT = path.join(__dirname, '..');
const WORK = process.env.MIS_WORKDIR ? path.resolve(process.env.MIS_WORKDIR) : ROOT;   // where inbox/store/output live
const DIRS = {
  inbox: path.join(WORK, 'inbox'),
  processed: path.join(WORK, 'processed'),
  rejected: path.join(WORK, 'rejected'),
  store: path.join(WORK, 'data', 'store'),
  out: path.join(WORK, 'data', 'processed'),
};
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';          // localhost only by default; see docs for exposing it safely
const SCAN_MS = Number(process.env.SCAN_MS || 2000);
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set(['.csv', '.xlsx', '.json']);

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------------ store */

let store = newStore();
let fileLog = [];
let version = 0;

function loadStore() {
  const f = path.join(DIRS.store, 'store.json');
  if (!fs.existsSync(f)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    store = newStore();
    for (const t of TABLES) for (const row of j.tables[t] || []) {
      store.tables[t].set(SCHEMAS[t].pk.map((c) => row[c]).join('|'), row);
    }
    store.meta = { ...store.meta, ...j.meta };
    fileLog = j.fileLog || [];
    return true;
  } catch (e) { console.error('Could not read store.json, starting from the sample build:', e.message); return false; }
}

function saveStore() {
  const j = { meta: store.meta, fileLog: fileLog.slice(-200), tables: {} };
  for (const t of TABLES) j.tables[t] = [...store.tables[t].values()];
  const tmp = path.join(DIRS.store, 'store.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(j));
  fs.renameSync(tmp, path.join(DIRS.store, 'store.json'));
}

function rebuildOutput() {
  const dash = buildDashboard(store, fileLog);
  version += 1;
  dash.meta.version = version;
  const tmp = path.join(DIRS.out, 'dashboard.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(dash));
  fs.renameSync(tmp, path.join(DIRS.out, 'dashboard.json'));
  return dash;
}

function seedFromRaw() {
  const rawDir = path.join(ROOT, 'data', 'raw');
  if (!fs.existsSync(rawDir)) return;
  for (const t of TABLES) {
    const f = path.join(rawDir, `${t}.csv`);
    if (!fs.existsSync(f)) continue;
    const st = ingestRows(store, t, readCsv(f).rows);
    fileLog.push({ at: new Date().toISOString(), file: `${t}.csv (initial load)`, ...st, status: 'accepted' });
  }
}

/* ---------------------------------------------------------------- parsing */

async function readXlsx(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = [];
    let headers = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1).map((v) => {
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          if ('result' in v) return v.result;           // formula cell: use the cached result
          if ('text' in v) return v.text;               // hyperlink / rich text
        }
        return v;
      });
      if (!headers) { headers = vals.map((h) => String(h == null ? '' : h)); return; }
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = vals[i]; });
      rows.push(o);
    });
    if (headers) sheets.push({ name: ws.name, headers, rows });
  });
  return sheets;
}

/** Return [{name, headers, rows}] for a file, or throw with a human-readable reason. */
async function parseFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv') { const { headers, rows } = readCsv(file); return [{ name: path.basename(file), headers, rows }]; }
  if (ext === '.xlsx') return readXlsx(file);
  if (ext === '.json') {
    const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (Array.isArray(j)) return [{ name: path.basename(file), headers: Object.keys(j[0] || {}), rows: j }];
    if (j && typeof j === 'object') {
      return Object.keys(j).filter((k) => Array.isArray(j[k])).map((k) => ({ name: k, headers: Object.keys(j[k][0] || {}), rows: j[k] }));
    }
    throw new Error('JSON must be an array of rows or an object of {table: rows}');
  }
  throw new Error(`Unsupported file type ${ext}`);
}

/* --------------------------------------------------------------- ingestion */

const pending = new Map(); // file -> last seen size
let busy = false;

function reject(file, reason) {
  const base = path.basename(file);
  const dest = path.join(DIRS.rejected, `${Date.now()}_${base}`);
  fs.renameSync(file, dest);
  fs.writeFileSync(dest + '.reason.txt', reason + '\n');
  fileLog.push({ at: new Date().toISOString(), file: base, status: 'rejected', reason });
  console.log(`REJECTED ${base}: ${reason}`);
  // publish the rejection too, so people looking at the dashboard can see that a file was refused and why
  saveStore();
  rebuildOutput();
  broadcast({ version });
}

async function ingestFile(file) {
  const base = path.basename(file);
  const ext = path.extname(base).toLowerCase();
  const size = fs.statSync(file).size;
  if (ext === '.sql') return reject(file, '.sql files are not executed. Export the tables from the database as CSV/XLSX/JSON, or use a read-only connector (see docs/DEPLOYMENT.md).');
  if (!ALLOWED.has(ext)) return reject(file, `File type "${ext}" is not accepted. Allowed: ${[...ALLOWED].join(', ')}`);
  if (size > MAX_BYTES) return reject(file, `File is larger than ${MAX_BYTES / 1048576} MB`);
  if (size === 0) return reject(file, 'File is empty');

  let sheets;
  try { sheets = await parseFile(file); } catch (e) { return reject(file, `Could not read the file: ${e.message}`); }

  // Work on a copy so a failing file never leaves the store half-updated.
  const trial = newStore();
  for (const t of TABLES) trial.tables[t] = new Map(store.tables[t]);
  trial.meta = { ...store.meta };

  const results = [];
  const problems = [];
  for (const sh of sheets) {
    if (!sh.rows.length) { problems.push(`"${sh.name}": no data rows`); continue; }
    const table = detectTable(sh.headers, sh.name);
    if (!table) { problems.push(`"${sh.name}": cannot tell which table this is (columns: ${sh.headers.slice(0, 8).join(', ')})`); continue; }
    const have = new Set(sh.headers.map(normHeader));
    const missing = SCHEMAS[table].required.filter((c) => !have.has(c));
    if (missing.length) { problems.push(`"${sh.name}" looks like ${table} but is missing required column(s): ${missing.join(', ')}`); continue; }
    const st = ingestRows(trial, table, sh.rows);
    if (st.rejected === st.rows_read) { problems.push(`"${sh.name}" (${table}): all ${st.rows_read} rows were invalid. First problem: ${st.errors[0]}`); continue; }
    results.push(st);
  }
  if (!results.length) return reject(file, problems.join(' | ') || 'Nothing to import');

  store = trial;
  const at = new Date().toISOString();
  for (const st of results) fileLog.push({ at, file: base, ...st, status: st.rejected ? 'accepted_with_rejects' : 'accepted' });
  for (const p of problems) fileLog.push({ at, file: base, status: 'skipped_part', reason: p });
  saveStore();
  rebuildOutput();
  fs.renameSync(file, path.join(DIRS.processed, `${Date.now()}_${base}`));
  console.log(`INGESTED ${base}: ${results.map((r) => `${r.table} +${r.inserted} ~${r.updated} x${r.rejected}`).join(', ')}`);
  broadcast({ version });
}

async function scan() {
  if (busy) return;
  busy = true;
  try {
    const names = fs.readdirSync(DIRS.inbox).filter((n) => !n.startsWith('.') && !n.startsWith('~$'));
    for (const n of names) {
      const f = path.join(DIRS.inbox, n);
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (!st.isFile()) continue;
      // only process a file once its size has been stable across two scans (it may still be copying)
      if (pending.get(f) !== st.size) { pending.set(f, st.size); continue; }
      pending.delete(f);
      try { await ingestFile(f); } catch (e) { console.error('ingest error', n, e); try { reject(f, `Unexpected error: ${e.message}`); } catch { /* ignore */ } }
    }
  } finally { busy = false; }
}

/* -------------------------------------------------------------------- http */

const clients = new Set();
function broadcast(msg) { for (const res of clients) res.write(`data: ${JSON.stringify(msg)}\n\n`); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const headers = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  };
  if (url.pathname === '/events') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ version })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/data') {
    const f = path.join(DIRS.out, 'dashboard.json');
    res.writeHead(200, { ...headers, 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(res);
  }
  // static files, restricted to the public folders (never inbox, store, raw data, server code)
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const norm = path.normalize(rel).replace(/\\/g, '/');
  const top = norm.split('/')[0];
  const allowed = norm === 'index.html' || ['css', 'js', 'vendor'].includes(top) || norm.startsWith('data/processed/');
  const abs = norm.startsWith('data/processed/') ? path.join(DIRS.out, norm.slice('data/processed/'.length)) : path.join(ROOT, norm);
  const base = norm.startsWith('data/processed/') ? DIRS.out : ROOT;
  if (!allowed || norm.includes('..') || !abs.startsWith(base) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { ...headers, 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(abs).pipe(res);
});

/* ------------------------------------------------------------------- start */

if (!loadStore()) { seedFromRaw(); saveStore(); }
rebuildOutput();
setInterval(scan, SCAN_MS);
server.listen(PORT, HOST, () => {
  console.log(`MIS dashboard: http://${HOST}:${PORT}`);
  console.log(`Inbox (drop CSV/XLSX/JSON here): ${DIRS.inbox}`);
});
