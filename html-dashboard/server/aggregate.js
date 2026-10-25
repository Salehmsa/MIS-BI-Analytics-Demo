'use strict';
/**
 * aggregate.js — pure data logic (no I/O). Used by the ingestion server, the
 * sample builder and the verification test.
 *
 * 1. SCHEMAS            what each accepted table must look like
 * 2. ingestRows()       validate + normalise + upsert rows into a store
 * 3. detectTable()      decide which table a file/sheet/array belongs to
 * 4. buildDashboard()   apply the cleaning rules and pre-aggregate into cubes
 *
 * The cleaning rules and measure definitions mirror the SQL views and DAX
 * measures of the Power BI project (vw_fact_sales_clean, Net Revenue, On-Time
 * Delivery %, SLA Compliance % ...), so both tools show the same numbers.
 */

const SCHEMAS = {
  dim_region: { pk: ['region_id'], required: ['region_id', 'region_name_en', 'region_name_ar'], optional: ['manager_email'],
    types: { region_id: 'int', region_name_en: 'str', region_name_ar: 'str', manager_email: 'str' } },
  dim_branch: { pk: ['branch_id'], required: ['branch_id', 'branch_name', 'region_id'], optional: ['city'],
    types: { branch_id: 'int', branch_name: 'str', city: 'str', region_id: 'int' } },
  dim_category: { pk: ['category_id'], required: ['category_id', 'category_name'], optional: [],
    types: { category_id: 'int', category_name: 'str' } },
  dim_subcategory: { pk: ['subcategory_id'], required: ['subcategory_id', 'subcategory_name', 'category_id'], optional: [],
    types: { subcategory_id: 'int', subcategory_name: 'str', category_id: 'int' } },
  dim_product: { pk: ['product_id'], required: ['product_id', 'product_name', 'subcategory_id'], optional: ['list_price', 'unit_cost', 'is_active'],
    types: { product_id: 'int', product_name: 'str', subcategory_id: 'int', list_price: 'num', unit_cost: 'num', is_active: 'bool' } },
  dim_sales_rep: { pk: ['rep_id'], required: ['rep_id', 'rep_name', 'branch_id'], optional: ['hire_date'],
    types: { rep_id: 'int', rep_name: 'str', branch_id: 'int', hire_date: 'date' } },
  dim_customer: { pk: ['customer_id'], required: ['customer_id', 'customer_name'], optional: ['segment', 'city', 'region_id', 'signup_date'],
    types: { customer_id: 'int', customer_name: 'str', segment: 'str', city: 'str', region_id: 'int', signup_date: 'date' } },
  dim_date: { pk: ['date'], required: ['date'], optional: ['year', 'quarter', 'month', 'month_name', 'year_month', 'week_of_year', 'day_name', 'is_weekend'],
    types: { date: 'date' }, ignored: true },
  fact_sales: { pk: ['order_line_id'],
    required: ['order_id', 'order_line_id', 'order_date', 'customer_id', 'product_id', 'branch_id', 'rep_id', 'quantity', 'unit_price', 'unit_cost', 'order_status'],
    optional: ['delivery_date', 'promised_date', 'discount_pct'],
    types: { order_id: 'int', order_line_id: 'int', order_date: 'date', delivery_date: 'date', promised_date: 'date', customer_id: 'int', product_id: 'int',
      branch_id: 'int', rep_id: 'int', quantity: 'int', unit_price: 'num', discount_pct: 'num', unit_cost: 'num', order_status: 'str' } },
  fact_support_ticket: { pk: ['ticket_id'], required: ['ticket_id', 'created_at', 'branch_id', 'ticket_category', 'priority', 'sla_hours'],
    optional: ['resolved_at', 'customer_id', 'csat_score'],
    types: { ticket_id: 'int', created_at: 'datetime', resolved_at: 'datetime', branch_id: 'int', customer_id: 'int', ticket_category: 'str',
      priority: 'str', sla_hours: 'num', csat_score: 'num' } },
  fact_target_monthly: { pk: ['branch_id', 'month_start'], required: ['branch_id', 'month_start', 'target_net_revenue'], optional: [],
    types: { branch_id: 'int', month_start: 'date', target_net_revenue: 'num' } },
};

const TABLES = Object.keys(SCHEMAS);

/* ------------------------------------------------------------------ parsing */

const pad = (n) => String(n).padStart(2, '0');

function isBlank(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

/** Parse one value to its declared type. Returns {ok, value}. Blank -> {ok:true, value:null}. */
function parseValue(v, type) {
  if (isBlank(v)) return { ok: true, value: null };
  switch (type) {
    case 'int': {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      return Number.isFinite(n) && Number.isInteger(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'num': {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'bool': {
      if (typeof v === 'boolean') return { ok: true, value: v };
      const s = String(v).trim().toLowerCase();
      if (['true', '1', 'yes'].includes(s)) return { ok: true, value: true };
      if (['false', '0', 'no'].includes(s)) return { ok: true, value: false };
      return { ok: false };
    }
    case 'date':
    case 'datetime': {
      let d = null;
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return { ok: false };
        d = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
        const hms = `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
        d = type === 'datetime' ? `${d} ${hms}` : d;
        return { ok: true, value: d };
      }
      const s = String(v).trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
      if (!m) return { ok: false };
      const mo = Number(m[2]), da = Number(m[3]);
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return { ok: false };
      const dpart = `${m[1]}-${m[2]}-${m[3]}`;
      if (type === 'date') return { ok: true, value: dpart };
      return { ok: true, value: `${dpart} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}` };
    }
    default: // str
      return { ok: true, value: String(v).trim() };
  }
}

const normHeader = (h) => String(h == null ? '' : h).replace(/^﻿/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Decide which table a set of column headers (and optionally a name) belongs to. */
function detectTable(headers, nameHint) {
  const hs = new Set(headers.map(normHeader));
  const hint = String(nameHint || '').toLowerCase();
  // 1) name hint, e.g. "fact_sales_2026-10.csv" or sheet "fact_support_ticket" (longest match wins)
  const byName = TABLES.filter((t) => hint.includes(t)).sort((a, b) => b.length - a.length)[0];
  if (byName) return byName;
  // 2) header signature: the table whose required columns are all present (most specific wins)
  const candidates = TABLES.filter((t) => SCHEMAS[t].required.every((c) => hs.has(c)))
    .sort((a, b) => SCHEMAS[b].required.length - SCHEMAS[a].required.length);
  return candidates[0] || null;
}

/* ------------------------------------------------------------------- ingest */

function newStore() {
  const tables = {};
  for (const t of TABLES) tables[t] = new Map();
  return { tables, meta: { duplicates_dropped: 0, created_at: new Date().toISOString() } };
}

const keyOf = (table, row) => SCHEMAS[table].pk.map((c) => row[c]).join('|');

/**
 * Validate, normalise and upsert rows into store.tables[table].
 * Rows with a bad/missing required value are rejected (never silently fixed).
 * Rows repeating a key already seen in the same batch are dropped (last wins) and counted.
 */
function ingestRows(store, table, rawRows) {
  const schema = SCHEMAS[table];
  if (!schema) throw new Error(`Unknown table: ${table}`);
  const stats = { table, rows_read: rawRows.length, inserted: 0, updated: 0, duplicates_in_file: 0, rejected: 0, errors: [] };
  const seen = new Set();
  const map = store.tables[table];
  const cols = [...schema.required, ...schema.optional];
  for (let i = 0; i < rawRows.length; i++) {
    const src = {};
    for (const k of Object.keys(rawRows[i])) src[normHeader(k)] = rawRows[i][k];
    const row = {};
    let bad = null;
    for (const c of cols) {
      const p = parseValue(src[c], schema.types[c]);
      if (!p.ok) { bad = `row ${i + 2}: invalid ${schema.types[c]} in "${c}": ${JSON.stringify(src[c])}`; break; }
      if (p.value === null && schema.required.includes(c)) { bad = `row ${i + 2}: required "${c}" is empty`; break; }
      row[c] = p.value;
    }
    if (bad) {
      stats.rejected++;
      if (stats.errors.length < 20) stats.errors.push(bad);
      continue;
    }
    const k = keyOf(table, row);
    if (seen.has(k)) stats.duplicates_in_file++;          // repeated key inside this batch: last copy wins
    else if (map.has(k)) stats.updated++;                  // key already in the store: update
    else stats.inserted++;                                 // new key
    seen.add(k);
    map.set(k, row);
  }
  if (table === 'fact_sales') store.meta.duplicates_dropped += stats.duplicates_in_file;
  return stats;
}

/* --------------------------------------------------------------- aggregation */

const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const hoursBetween = (a, b) => (Date.parse(b.replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 3600000;
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

function buildDashboard(store, fileLog) {
  const T = (n) => [...store.tables[n].values()];
  const regions = T('dim_region'), branches = T('dim_branch'), categories = T('dim_category');
  const subcats = new Map(T('dim_subcategory').map((s) => [s.subcategory_id, s]));
  const products = new Map(T('dim_product').map((p) => [p.product_id, p]));
  const reps = T('dim_sales_rep');
  const branchSet = new Set(branches.map((b) => b.branch_id));
  const repSet = new Set(reps.map((r) => r.rep_id));

  /* ---- sales cube: (ym, branch, rep, category) ---- */
  const sales = new Map();
  const dq = { lines: 0, missing_discount: 0, bad_delivery_date: 0, negative_qty: 0, any_issue: 0, orphan_rows: 0 };
  let minDate = null, maxDate = null;
  const M = ['lines_all', 'cancelled', 'returned', 'lines_valid', 'gross', 'net', 'cost', 'below_cost_lines', 'below_cost_loss',
    'delivered', 'on_time', 'days_sum', 'dq_issue_lines'];
  for (const s of store.tables.fact_sales.values()) {
    const prod = products.get(s.product_id);
    const sub = prod && subcats.get(prod.subcategory_id);
    if (!prod || !sub || !branchSet.has(s.branch_id) || !repSet.has(s.rep_id)) { dq.orphan_rows++; continue; }
    dq.lines++;
    const disc = s.discount_pct == null ? 0 : s.discount_pct;
    const badDelivery = s.delivery_date && s.delivery_date < s.order_date;
    const delivery = badDelivery ? null : s.delivery_date;
    const negQty = s.quantity < 0;
    const issues = (s.discount_pct == null ? 1 : 0) + (badDelivery ? 1 : 0) + (negQty ? 1 : 0);
    if (s.discount_pct == null) dq.missing_discount++;
    if (badDelivery) dq.bad_delivery_date++;
    if (negQty) dq.negative_qty++;
    if (issues) dq.any_issue++;
    const ym = s.order_date.slice(0, 7);
    if (!minDate || s.order_date < minDate) minDate = s.order_date;
    if (!maxDate || s.order_date > maxDate) maxDate = s.order_date;
    const key = `${ym}|${s.branch_id}|${s.rep_id}|${sub.category_id}`;
    let c = sales.get(key);
    if (!c) { c = { ym, branch_id: s.branch_id, rep_id: s.rep_id, category_id: sub.category_id }; for (const m of M) c[m] = 0; sales.set(key, c); }
    c.lines_all++;
    if (issues) c.dq_issue_lines++;
    if (s.order_status === 'Cancelled') c.cancelled++;
    if (s.order_status === 'Returned') c.returned++;
    if (delivery) {
      c.delivered++;
      if (s.promised_date && delivery <= s.promised_date) c.on_time++;
      c.days_sum += daysBetween(s.order_date, delivery);
    }
    if (s.order_status !== 'Cancelled' && s.quantity > 0) {
      const net = s.quantity * s.unit_price * (1 - disc);
      c.lines_valid++;
      c.gross += s.quantity * s.unit_price;
      c.net += net;
      c.cost += s.quantity * s.unit_cost;
      const netUnit = s.unit_price * (1 - disc);
      if (netUnit < s.unit_cost) { c.below_cost_lines++; c.below_cost_loss += (s.unit_cost - netUnit) * s.quantity; }
    }
  }

  /* ---- tickets cube: (ym created, branch, category, priority) ---- */
  const tickets = new Map();
  const TM = ['tickets', 'resolved', 'sla_ok', 'res_hours', 'csat_sum', 'csat_n'];
  for (const t of store.tables.fact_support_ticket.values()) {
    if (!branchSet.has(t.branch_id)) continue;
    const ym = t.created_at.slice(0, 7);
    const key = `${ym}|${t.branch_id}|${t.ticket_category}|${t.priority}`;
    let c = tickets.get(key);
    if (!c) { c = { ym, branch_id: t.branch_id, category: t.ticket_category, priority: t.priority }; for (const m of TM) c[m] = 0; tickets.set(key, c); }
    c.tickets++;
    if (t.resolved_at) {
      const h = hoursBetween(t.created_at, t.resolved_at);
      c.resolved++; c.res_hours += h;
      if (h <= t.sla_hours) c.sla_ok++;
    }
    if (t.csat_score != null) { c.csat_sum += t.csat_score; c.csat_n++; }
  }

  /* ---- targets: (ym, branch) ---- */
  const targets = T('fact_target_monthly').filter((t) => branchSet.has(t.branch_id))
    .map((t) => ({ ym: t.month_start.slice(0, 7), branch_id: t.branch_id, target: t.target_net_revenue }));

  const pack = (map, ints, nums) => ({
    cols: [...ints, ...nums],
    rows: [...map.values()].map((c) => [...ints.map((k) => c[k]), ...nums.map((k) => (k === 'gross' || k === 'net' || k === 'cost' || k === 'below_cost_loss' || k === 'res_hours' || k === 'csat_sum' ? r2(c[k]) : c[k]))]),
  });

  const salesCube = pack(sales, ['ym', 'branch_id', 'rep_id', 'category_id'], M);
  const ticketCube = pack(tickets, ['ym', 'branch_id', 'category', 'priority'], TM);
  const openBacklog = T('fact_support_ticket').filter((t) => !t.resolved_at && branchSet.has(t.branch_id)).length;

  const out = {
    meta: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      as_of: maxDate,
      first_order_date: minDate,
      rows: { fact_sales: store.tables.fact_sales.size, fact_support_ticket: store.tables.fact_support_ticket.size, fact_target_monthly: store.tables.fact_target_monthly.size },
      sales_cube_rows: salesCube.rows.length,
      ticket_cube_rows: ticketCube.rows.length,
    },
    dims: {
      regions: regions.map((r) => ({ id: r.region_id, en: r.region_name_en, ar: r.region_name_ar })),
      branches: branches.map((b) => ({ id: b.branch_id, name: b.branch_name, city: b.city || '', region_id: b.region_id })),
      categories: categories.map((c) => ({ id: c.category_id, name: c.category_name })),
      reps: reps.map((r) => ({ id: r.rep_id, name: r.rep_name, branch_id: r.branch_id })),
    },
    sales: salesCube,
    tickets: ticketCube,
    targets,
    open_backlog: openBacklog,
    data_quality: { ...dq, duplicates_dropped: store.meta.duplicates_dropped },
    ingest_log: (fileLog || []).slice(-30),
  };
  return out;
}

module.exports = { SCHEMAS, TABLES, newStore, ingestRows, detectTable, buildDashboard, normHeader, parseValue };
