/* Pure calculation layer: filters, KPIs, series, risk rules. No DOM access. */
(function () {
  const CFG = window.MIS_CONFIG;
  const toObjects = (cube) => cube.rows.map((r) => { const o = {}; cube.cols.forEach((c, i) => { o[c] = r[i]; }); return o; });

  /** Index the raw dashboard JSON for fast lookups. */
  function prepare(raw) {
    const D = { raw, sales: toObjects(raw.sales), tickets: toObjects(raw.tickets), targets: raw.targets, dq: raw.data_quality, meta: raw.meta, log: raw.ingest_log || [], openBacklog: raw.open_backlog };
    D.regions = raw.dims.regions; D.branches = raw.dims.branches; D.categories = raw.dims.categories; D.reps = raw.dims.reps;
    D.regionById = new Map(D.regions.map((r) => [r.id, r]));
    D.branchById = new Map(D.branches.map((b) => [b.id, b]));
    D.catById = new Map(D.categories.map((c) => [c.id, c]));
    D.repById = new Map(D.reps.map((r) => [r.id, r]));
    const months = new Set();
    for (const r of D.sales) months.add(r.ym);
    for (const r of D.tickets) months.add(r.ym);
    for (const r of D.targets) months.add(r.ym);
    D.months = [...months].sort();
    // a branch's region
    for (const b of D.branches) b.region = D.regionById.get(b.region_id);
    return D;
  }

  const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };
  const quarterOf = (ym) => `${ym.slice(0, 4)}-Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;

  /** Branch ids allowed by region/branch filters. */
  function branchSet(D, F) {
    return new Set(D.branches.filter((b) => (!F.region || b.region_id === F.region) && (!F.branch || b.id === F.branch)).map((b) => b.id));
  }

  /** Select rows for a month window under the current dimension filters (month range overridden by from/to). */
  function select(D, F, from, to, opts = {}) {
    const bs = branchSet(D, F);
    const inWin = (ym) => ym >= from && ym <= to;
    const sales = D.sales.filter((r) => inWin(r.ym) && bs.has(r.branch_id) && (!F.category || r.category_id === F.category) && (!opts.rep || r.rep_id === opts.rep));
    const tickets = D.tickets.filter((r) => inWin(r.ym) && bs.has(r.branch_id));
    const targets = D.targets.filter((r) => inWin(r.ym) && bs.has(r.branch_id));
    return { sales, tickets, targets, categoryFiltered: !!F.category };
  }

  const sum = (rows, k) => { let s = 0; for (const r of rows) s += r[k]; return s; };
  const div = (a, b) => (b ? a / b : null);

  /** All KPIs for a selection. Percentages are expressed 0-100. */
  function kpis(sel) {
    const S = sel.sales, T = sel.tickets;
    const net = sum(S, 'net'), cost = sum(S, 'cost'), gross = sum(S, 'gross');
    const target = sum(sel.targets, 'target');
    const delivered = sum(S, 'delivered'), tk = sum(T, 'tickets'), res = sum(T, 'resolved');
    const k = {
      net, gross, cost, target,
      gm: net ? ((net - cost) / net) * 100 : null,
      disc: gross ? ((gross - net) / gross) * 100 : null,
      attain: !sel.categoryFiltered && target ? (net / target) * 100 : null,
      gap: !sel.categoryFiltered && target ? net - target : null,
      lines: sum(S, 'lines_valid'),
      onTime: delivered ? (sum(S, 'on_time') / delivered) * 100 : null,
      days: delivered ? sum(S, 'days_sum') / delivered : null,
      cancelled: sum(S, 'lines_all') ? (sum(S, 'cancelled') / sum(S, 'lines_all')) * 100 : null,
      returned: sum(S, 'lines_all') ? (sum(S, 'returned') / sum(S, 'lines_all')) * 100 : null,
      belowCost: sum(S, 'lines_valid') ? (sum(S, 'below_cost_lines') / sum(S, 'lines_valid')) * 100 : null,
      belowCostLoss: sum(S, 'below_cost_loss'),
      tickets: tk, open: tk - res,
      sla: res ? (sum(T, 'sla_ok') / res) * 100 : null,
      csat: sum(T, 'csat_n') ? sum(T, 'csat_sum') / sum(T, 'csat_n') : null,
      resHours: res ? sum(T, 'res_hours') / res : null,
      dqLines: sum(S, 'lines_all'), dqIssues: sum(S, 'dq_issue_lines'),
    };
    return k;
  }

  /** Status of a higher-is-better KPI. */
  function status(kind, v) {
    if (v == null) return null;
    const [g, a] = CFG.kpiThresholds[kind];
    return v >= g ? 'green' : v >= a ? 'amber' : 'red';
  }

  /** The window immediately before [from,to] with the same length; null if it would start before the data. */
  function previousWindow(D, from, to) {
    const n = monthsBetween(from, to);
    const pf = addMonths(from, -n), pt = addMonths(from, -1);
    return pf < D.months[0] ? null : { from: pf, to: pt };
  }

  /** Monthly series of one metric function across the months of a window. */
  function monthRange(from, to) { const out = []; for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m); return out; }

  function groupBy(rows, keyFn) { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }

  /* ----------------------------------------------------------------- risks */
  function riskStatus(rule, cur, base, higherIsBetter = true) {
    // returns 'green'|'amber'|'red' for rules with absolute floors and drops
    if (cur == null) return null;
    const drop = base == null ? 0 : higherIsBetter ? base - cur : cur - base;
    if ((rule.redBelow != null && cur < rule.redBelow) || (rule.redDrop != null && drop >= rule.redDrop)) return 'red';
    if ((rule.amberBelow != null && cur < rule.amberBelow) || (rule.amberDrop != null && drop >= rule.amberDrop)) return 'amber';
    return 'green';
  }

  /** Rule-based risk register for the latest N months of the selected period vs the M months before them. */
  function risks(D, F, from, to) {
    const R = CFG.risk;
    const curTo = to, curFrom = addMonths(to, -(R.currentMonths - 1)) < from ? from : addMonths(to, -(R.currentMonths - 1));
    let baseTo = addMonths(curFrom, -1), baseFrom = addMonths(baseTo, -(R.baselineMonths - 1));
    if (baseFrom < D.months[0]) baseFrom = D.months[0];
    const hasBase = baseTo >= D.months[0] && baseFrom <= baseTo;
    const cur = select(D, F, curFrom, curTo);
    const base = hasBase ? select(D, F, baseFrom, baseTo) : null;
    const items = [];
    const add = (o) => { if (o.status) items.push(o); };

    // per region: delivery, SLA, CSAT, target attainment
    const regionIds = F.region ? [F.region] : D.regions.map((r) => r.id);
    const byRegion = (sel) => {
      const m = {};
      for (const id of regionIds) {
        const bs = new Set(D.branches.filter((b) => b.region_id === id && (!F.branch || b.id === F.branch)).map((b) => b.id));
        m[id] = kpis({ sales: sel.sales.filter((r) => bs.has(r.branch_id)), tickets: sel.tickets.filter((r) => bs.has(r.branch_id)), targets: sel.targets.filter((r) => bs.has(r.branch_id)), categoryFiltered: sel.categoryFiltered });
      }
      return m;
    };
    const cr = byRegion(cur), br = base ? byRegion(base) : {};
    for (const id of regionIds) {
      const reg = D.regionById.get(id);
      const c = cr[id], b = br[id] || {};
      add({ type: 'delivery', scope: { region: id }, label: reg, cur: c.onTime, base: b.onTime, unit: '%', delta: b.onTime != null && c.onTime != null ? c.onTime - b.onTime : null, status: riskStatus(R.onTime, c.onTime, b.onTime), action: 'aDelivery', title: 'rDelivery' });
      add({ type: 'sla', scope: { region: id }, label: reg, cur: c.sla, base: b.sla, unit: '%', delta: b.sla != null && c.sla != null ? c.sla - b.sla : null, status: riskStatus(R.sla, c.sla, b.sla), action: 'aSla', title: 'rSla' });
      add({ type: 'csat', scope: { region: id }, label: reg, cur: c.csat, base: b.csat, unit: '', dec: 2, delta: b.csat != null && c.csat != null ? c.csat - b.csat : null, status: riskStatus(R.csat, c.csat, b.csat), action: 'aCsat', title: 'rCsat' });
      if (c.attain != null) {
        const st = c.attain < R.attainment.redBelow ? 'red' : c.attain < R.attainment.amberBelow ? 'amber' : 'green';
        add({ type: 'attain', scope: { region: id }, label: reg, cur: c.attain, base: null, unit: '%', delta: null, status: st, action: 'aAttain', title: 'rAttain' });
      }
    }
    // per category: margin, discount, below-cost
    const catIds = F.category ? [F.category] : D.categories.map((c) => c.id);
    for (const id of catIds) {
      const cat = D.catById.get(id);
      const kc = kpis({ sales: cur.sales.filter((r) => r.category_id === id), tickets: [], targets: [], categoryFiltered: true });
      const kb = base ? kpis({ sales: base.sales.filter((r) => r.category_id === id), tickets: [], targets: [], categoryFiltered: true }) : {};
      if (kc.gm != null) {
        const drop = kb.gm != null ? kb.gm - kc.gm : 0;
        const st = drop >= R.margin.redDrop ? 'red' : drop >= R.margin.amberDrop ? 'amber' : 'green';
        add({ type: 'margin', scope: { category: id }, label: cat, cur: kc.gm, base: kb.gm, unit: '%', delta: kb.gm != null ? kc.gm - kb.gm : null, status: st, action: 'aMargin', title: 'rMargin' });
      }
      if (kc.disc != null) {
        const rise = kb.disc != null ? kc.disc - kb.disc : 0;
        const st = rise >= R.discount.redRise ? 'red' : rise >= R.discount.amberRise ? 'amber' : 'green';
        add({ type: 'discount', scope: { category: id }, label: cat, cur: kc.disc, base: kb.disc, unit: '%', delta: kb.disc != null ? kc.disc - kb.disc : null, status: st, action: 'aDiscount', title: 'rDiscount' });
      }
      if (kc.belowCost != null) {
        const rise = kb.belowCost != null ? kc.belowCost - kb.belowCost : 0;
        const st = kc.belowCost >= R.belowCost.redAt || rise >= R.belowCost.redRise ? 'red' : kc.belowCost >= R.belowCost.amberAt || rise >= R.belowCost.amberRise ? 'amber' : 'green';
        add({ type: 'belowCost', scope: { category: id }, label: cat, cur: kc.belowCost, base: kb.belowCost, unit: '%', delta: kb.belowCost != null ? kc.belowCost - kb.belowCost : null, status: st, action: 'aBelowCost', title: 'rBelowCost' });
      }
    }
    // data quality (whole selection)
    const kall = kpis(select(D, F, from, to));
    if (kall.dqLines) {
      const p = (kall.dqIssues / kall.dqLines) * 100;
      add({ type: 'dq', scope: {}, label: null, cur: p, base: null, unit: '%', delta: null, status: p >= R.dataQuality.redAt ? 'red' : p >= R.dataQuality.amberAt ? 'amber' : 'green', action: 'aDq', title: 'rDq', dec: 2 });
    }
    const rank = { red: 0, amber: 1, green: 2 };
    items.sort((a, b) => rank[a.status] - rank[b.status] || Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
    return { items, curFrom, curTo, baseFrom: hasBase ? baseFrom : null, baseTo: hasBase ? baseTo : null };
  }

  window.CALC = { prepare, select, kpis, status, previousWindow, monthRange, groupBy, addMonths, monthsBetween, quarterOf, risks, sum, div, branchSet };
})();
