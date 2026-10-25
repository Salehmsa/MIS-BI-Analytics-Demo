/* MIS executive dashboard: UI, charts, data loading, live updates. Data-derived text is always inserted with textContent (never innerHTML). */
(function () {
  'use strict';
  const { t, fmt } = window.I18N;
  const C = window.CALC;
  const CFG = window.MIS_CONFIG;
  const $ = (id) => document.getElementById(id);

  const st = { D: null, conn: 'embedded', tab: 'overview', sort: { key: 'net', dir: -1 }, riskAll: false, mapMetric: 'attain', drill: null, lastFocus: null,
    F: { preset: 'all', from: null, to: null, region: null, branch: null, category: null } };
  const charts = {};

  /* ------------------------------------------------------------ small helpers */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const isAr = () => window.I18N.state.lang === 'ar';
  const STATUS_SYM = { green: '●', amber: '▲', red: '■' };
  const statusLabel = (s) => (s ? t(s === 'green' ? 'statusGreen' : s === 'amber' ? 'statusAmber' : 'statusRed') : t('na'));
  const regionName = (r) => (isAr() ? r.ar : r.en);
  const catName = (c) => window.I18N.cat(c.name);
  const branchName = (b) => window.I18N.branch(b.name);
  const catColors = { 1: '#2F6FDB', 2: '#E8742B', 3: '#159A86', 4: '#8E6BD1' };
  const catColor = (id) => catColors[id] || '#6B7280';
  const regColor = (id) => CFG.regionColors[id] || '#6B7280';

  function chip(status, text) {
    return el('span', { class: 'chip ' + (status || 'none') }, status ? STATUS_SYM[status] + ' ' : '', text || statusLabel(status));
  }

  /* ------------------------------------------------------------------- data */
  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function loadData() {
    try { return { raw: await fetchJson('/api/data'), conn: 'live' }; } catch (e) { /* not served by the ingestion server */ }
    try { return { raw: await fetchJson('data/processed/dashboard.json'), conn: 'static' }; } catch (e) { /* opened from disk */ }
    if (window.__MIS_SAMPLE__) return { raw: window.__MIS_SAMPLE__, conn: 'embedded' };
    throw new Error('No data available');
  }

  function applyData(raw, conn) {
    const first = !st.D;
    st.D = C.prepare(raw);
    st.conn = conn;
    const D = st.D, F = st.F;
    if (first || !D.months.includes(F.from) || !D.months.includes(F.to)) setPreset(F.preset === 'custom' ? 'all' : F.preset);
    else if (F.preset !== 'custom') setPreset(F.preset); // moves the window forward when new months arrive
    if (F.region && !D.regionById.has(F.region)) F.region = null;
    if (F.branch && !D.branchById.has(F.branch)) F.branch = null;
    if (F.category && !D.catById.has(F.category)) F.category = null;
    buildSelects();
    renderAll();
  }

  function setPreset(p) {
    const D = st.D, F = st.F, n = D.months.length;
    F.preset = p;
    if (p === 'all') { F.from = D.months[0]; F.to = D.months[n - 1]; }
    else if (p !== 'custom') { const k = Number(p); F.to = D.months[n - 1]; F.from = D.months[Math.max(0, n - k)]; }
  }

  let es = null, pollTimer = null, reloadTimer = null;
  function startLive() {
    if (st.conn === 'live' && window.EventSource) {
      if (es) es.close();
      es = new EventSource('/events');
      let seen = null;
      es.onmessage = (ev) => {
        const v = JSON.parse(ev.data).version;
        if (seen !== null && v !== seen) { clearTimeout(reloadTimer); reloadTimer = setTimeout(refresh, 300); }
        seen = v;
      };
    } else if (st.conn === 'static') {
      clearInterval(pollTimer);
      pollTimer = setInterval(refresh, CFG.pollSeconds * 1000);
    }
  }
  async function refresh() {
    try {
      const { raw, conn } = await loadData();
      if (st.D && raw.meta.generated_at === st.D.meta.generated_at && conn === st.conn) return;
      applyData(raw, conn);
    } catch (e) { /* keep showing the last good data */ }
  }

  /* --------------------------------------------------------------------- i18n */
  function applyI18n() {
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')); });
    $('skipLink').textContent = isAr() ? 'تخطَّ إلى المحتوى' : 'Skip to content';
    $('langBtn').textContent = t('lang');
    $('langBtn').setAttribute('aria-label', isAr() ? 'Switch to English' : 'التبديل إلى العربية');
    const t0 = document.querySelector('.tab[data-tab="risks"]');
    if (t0) t0.textContent = t('tabRisks');
  }

  /* ------------------------------------------------------------------ filters */
  function buildSelects() {
    const D = st.D, F = st.F;
    const fill = (sel, opts, value) => { clear(sel); for (const [v, label] of opts) sel.append(el('option', { value: v, text: label })); sel.value = value == null ? '' : String(value); };
    const months = D.months.map((m) => [m, fmt.month(m)]);
    fill($('fFrom'), months, F.from); fill($('fTo'), months, F.to);
    fill($('fRegion'), [['', t('all')], ...D.regions.map((r) => [r.id, regionName(r)])], F.region);
    const branches = D.branches.filter((b) => !F.region || b.region_id === F.region);
    fill($('fBranch'), [['', t('all')], ...branches.map((b) => [b.id, branchName(b)])], F.branch);
    fill($('fCategory'), [['', t('all')], ...D.categories.map((c) => [c.id, catName(c)])], F.category);
    $('fPreset').value = F.preset;
    $('optCustom').textContent = F.preset === 'custom' ? `${fmt.month(F.from)} – ${fmt.month(F.to)}` : '–';
    $('catNote').hidden = !F.category;
  }

  function onFilter() {
    const F = st.F;
    F.region = $('fRegion').value ? Number($('fRegion').value) : null;
    F.branch = $('fBranch').value ? Number($('fBranch').value) : null;
    F.category = $('fCategory').value ? Number($('fCategory').value) : null;
    // a branch that does not belong to the chosen region is dropped
    if (F.branch && F.region && st.D.branchById.get(F.branch).region_id !== F.region) F.branch = null;
    buildSelects(); renderAll();
  }

  /* ------------------------------------------------------------------ context */
  function context() {
    const D = st.D, F = st.F;
    let from = F.from, to = F.to;
    if (from > to) [from, to] = [to, from];
    const sel = C.select(D, F, from, to);
    const prevWin = C.previousWindow(D, from, to);
    const prevSel = prevWin ? C.select(D, F, prevWin.from, prevWin.to) : null;
    return { from, to, sel, k: C.kpis(sel), prevWin, prevSel, kp: prevSel ? C.kpis(prevSel) : null, months: C.monthRange(from, to) };
  }
  const monthSel = (ctx, ym, extra = {}) => C.select(st.D, { ...st.F, ...extra }, ym, ym);
  const kpiOver = (rows) => C.kpis({ sales: rows.sales || [], tickets: rows.tickets || [], targets: rows.targets || [], categoryFiltered: !!rows.categoryFiltered });

  /** Rows of a selection that belong to one region. */
  function regionRows(sel, regionId) {
    const bs = new Set(st.D.branches.filter((b) => b.region_id === regionId).map((b) => b.id));
    return { sales: sel.sales.filter((r) => bs.has(r.branch_id)), tickets: sel.tickets.filter((r) => bs.has(r.branch_id)), targets: sel.targets.filter((r) => bs.has(r.branch_id)), categoryFiltered: sel.categoryFiltered };
  }
  const visibleRegions = () => st.D.regions.filter((r) => !st.F.region || r.id === st.F.region);

  /* ------------------------------------------------------------------- charts */
  function opts(extra) {
    const text = css('--text'), muted = css('--muted'), line = css('--line');
    const base = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { rtl: isAr(), labels: { color: text, usePointStyle: true, boxWidth: 8, font: { family: css('--font') } } },
        tooltip: { rtl: isAr(), textDirection: isAr() ? 'rtl' : 'ltr', titleFont: { family: css('--font') }, bodyFont: { family: css('--font') } },
      },
      scales: {
        x: { ticks: { color: muted, font: { family: css('--font') }, maxRotation: 0, autoSkip: true }, grid: { color: line } },
        y: { ticks: { color: muted, font: { family: css('--font') } }, grid: { color: line } },
      },
    };
    return merge(base, extra || {});
  }
  function merge(a, b) {
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]); else a[k] = b[k];
    }
    return a;
  }
  function mk(id, config, alt) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const cv = $(id); if (!cv) return;
    const wrap = cv.parentElement;
    let msg = wrap.querySelector('.nodata');
    const empty = !config.data.labels || !config.data.labels.length || config.data.datasets.every((d) => d.data.every((v) => v == null || v === 0));
    if (empty) {
      cv.style.display = 'none';
      if (!msg) { msg = el('p', { class: 'note nodata', style: 'padding:2rem;text-align:center' }); wrap.append(msg); }
      msg.textContent = t('noData'); msg.hidden = false; return;
    }
    cv.style.display = ''; if (msg) msg.hidden = true;
    cv.setAttribute('aria-label', alt || '');
    charts[id] = new Chart(cv, config);
    return charts[id];
  }
  const pctTick = (v) => fmt.pct(v, 0);

  /* --------------------------------------------------------------- KPI cards */
  function sparkline(values) {
    const v = values.filter((x) => x != null);
    if (v.length < 2) return null;
    const mn = Math.min(...v), mx = Math.max(...v), w = 100, h = 26;
    const pts = values.map((x, i) => (x == null ? null : `${(i / (values.length - 1)) * w},${h - 2 - ((x - mn) / (mx - mn || 1)) * (h - 4)}`)).filter(Boolean).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts); svg.append(pl);
    return svg;
  }
  /** spec: {label, value (formatted), status, delta:{text, good}, spark} */
  function kpiCard(spec) {
    return el('div', { class: 'kpi ' + (spec.status || '') },
      el('div', { class: 'label', text: spec.label }),
      el('div', { class: 'value', text: spec.value }),
      spec.status ? el('div', { class: 'status ' + spec.status, text: STATUS_SYM[spec.status] + ' ' + statusLabel(spec.status) }) : null,
      el('div', { class: 'delta ' + (spec.delta ? (spec.delta.good === true ? 'good' : spec.delta.good === false ? 'bad' : '') : ''), text: spec.delta ? spec.delta.text : `${t('vsPrev')}: ${t('na')}` }),
      spec.spark || null);
  }
  function deltaPct(cur, prev) { if (cur == null || prev == null || !prev) return null; return ((cur - prev) / prev) * 100; }
  function mkDelta(kind, cur, prev, ctx) {
    if (!ctx.kp || cur == null || prev == null) return null;
    let d, text;
    if (kind === 'pct') { d = deltaPct(cur, prev); if (d == null) return null; text = fmt.signed(d, 1, '%'); }
    else if (kind === 'pp') { d = cur - prev; text = fmt.signed(d, 1, ' ' + t('pp')); }
    else if (kind === 'abs2') { d = cur - prev; text = fmt.signed(d, 2); }
    else { d = cur - prev; text = fmt.signed(d, 1); }
    return { text: `${text} ${t('vsPrev')}`, good: Math.abs(d) < 0.05 ? null : d > 0 };
  }
  function monthlyValues(ctx, fn) { return ctx.months.map((m) => fn(kpiOver(monthSel(ctx, m)))); }

  function overviewKpis(ctx) {
    const { k, kp } = ctx;
    const host = clear($('kpis'));
    const sp = (key) => sparkline(monthlyValues(ctx, (x) => x[key]));
    host.append(
      kpiCard({ label: t('kpiRevenue'), value: fmt.sar(k.net), delta: mkDelta('pct', k.net, kp && kp.net, ctx), spark: sp('net') }),
      kpiCard({ label: t('kpiAttain'), value: k.attain == null ? t('na') : fmt.pct(k.attain), status: C.status('attainment', k.attain), delta: k.attain == null ? { text: `${t('na')}` } : mkDelta('pp', k.attain, kp && kp.attain, ctx), spark: sp('attain') }),
      kpiCard({ label: t('kpiMargin'), value: fmt.pct(k.gm), status: C.status('grossMargin', k.gm), delta: mkDelta('pp', k.gm, kp && kp.gm, ctx), spark: sp('gm') }),
      kpiCard({ label: t('kpiOnTime'), value: fmt.pct(k.onTime), status: C.status('onTime', k.onTime), delta: mkDelta('pp', k.onTime, kp && kp.onTime, ctx), spark: sp('onTime') }),
      kpiCard({ label: t('kpiSla'), value: fmt.pct(k.sla), status: C.status('sla', k.sla), delta: mkDelta('pp', k.sla, kp && kp.sla, ctx), spark: sp('sla') }),
      kpiCard({ label: t('kpiCsat'), value: fmt.dec(k.csat, 2), status: C.status('csat', k.csat), delta: mkDelta('abs2', k.csat, kp && kp.csat, ctx), spark: sp('csat') }));
  }

  /* --------------------------------------------------------- executive summary */
  function summary(ctx) {
    const { k, kp, sel, prevSel } = ctx, D = st.D, F = st.F;
    const L = [];
    const dRev = kp ? fmt.signed(deltaPct(k.net, kp.net), 1, '%') : t('na');
    if (k.attain != null) L.push(t('sum1', { rev: `${t('sar')} ${fmt.sar(k.net)}`, dRev, att: fmt.pct(k.attain), gap: (k.gap >= 0 ? '+' : '−') + fmt.sar(Math.abs(k.gap)) }));
    else L.push(t('sum1na', { rev: `${t('sar')} ${fmt.sar(k.net)}` }));
    // margin: biggest category decline vs the previous period
    const dGm = kp && k.gm != null && kp.gm != null ? fmt.signed(k.gm - kp.gm, 1, ' ' + t('pp')) : t('na');
    let worst = null;
    if (prevSel) {
      for (const c of D.categories) {
        if (F.category && c.id !== F.category) continue;
        const a = C.kpis({ sales: sel.sales.filter((r) => r.category_id === c.id), tickets: [], targets: [], categoryFiltered: true });
        const b = C.kpis({ sales: prevSel.sales.filter((r) => r.category_id === c.id), tickets: [], targets: [], categoryFiltered: true });
        if (a.gm == null || b.gm == null) continue;
        const drop = b.gm - a.gm;
        if (!worst || drop > worst.drop) worst = { c, drop, from: b.gm, to: a.gm, disc: a.disc };
      }
    }
    if (worst && worst.drop >= 2) L.push(t('sum2', { gm: fmt.pct(k.gm), dGm, worst: catName(worst.c), wFrom: fmt.pct(worst.from), wTo: fmt.pct(worst.to), wDisc: fmt.pct(worst.disc) }));
    else if (prevSel) L.push(t('sum2b', { gm: fmt.pct(k.gm), dGm }));
    else L.push(t('sum2c', { gm: fmt.pct(k.gm) }));
    // regions: weakest delivery, weakest support
    const regs = visibleRegions().map((r) => ({ r, k: kpiOver(regionRows(sel, r.id)) }));
    const wOt = regs.filter((x) => x.k.onTime != null).sort((a, b) => a.k.onTime - b.k.onTime)[0];
    const dOt = kp && k.onTime != null && kp.onTime != null ? fmt.signed(k.onTime - kp.onTime, 1, ' ' + t('pp')) : t('na');
    if (wOt) L.push(t('sum3', { ot: fmt.pct(k.onTime), dOt, reg: regionName(wOt.r), regOt: fmt.pct(wOt.k.onTime) }));
    const wSla = regs.filter((x) => x.k.sla != null).sort((a, b) => a.k.sla - b.k.sla)[0];
    if (wSla) L.push(t('sum4', { sla: fmt.pct(k.sla), csat: fmt.dec(k.csat, 2), reg: regionName(wSla.r), regSla: fmt.pct(wSla.k.sla), regCsat: fmt.dec(wSla.k.csat, 2) }));
    const rk = C.risks(D, F, ctx.from, ctx.to);
    const red = rk.items.filter((i) => i.status === 'red').length, amber = rk.items.filter((i) => i.status === 'amber').length;
    L.push(t('sum5', { r: fmt.int(red), a: fmt.int(amber), c: CFG.risk.currentMonths }));
    const ul = clear($('summaryList'));
    for (const line of L) ul.append(el('li', { text: line }));
    return rk;
  }

  /* ------------------------------------------------------------ overview charts */
  function chartRevTarget(ctx) {
    const labels = ctx.months, net = [], target = [];
    for (const m of labels) { const s = monthSel(ctx, m); const k = kpiOver(s); net.push(k.net); target.push(s.categoryFiltered ? null : k.target); }
    const ds = [{ type: 'bar', label: t('chRevenue'), data: net, backgroundColor: css('--accent'), borderRadius: 4, order: 2 }];
    if (!st.F.category) ds.push({ type: 'line', label: t('chTarget'), data: target, borderColor: '#E8742B', backgroundColor: '#E8742B', borderWidth: 2.5, pointRadius: 2, tension: 0, order: 1 });
    mk('cRevTarget', { type: 'bar', data: { labels: labels.map(fmt.month), datasets: ds }, options: opts({ scales: { y: { ticks: { callback: (v) => fmt.sar(v) }, beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${t('sar')} ${fmt.sar(c.parsed.y)}` } } } }) }, t('chRevTarget'));
  }
  function chartMarginCat(ctx) {
    const cats = st.D.categories.filter((c) => !st.F.category || c.id === st.F.category);
    const gm = (sel, id) => C.kpis({ sales: sel.sales.filter((r) => r.category_id === id), tickets: [], targets: [], categoryFiltered: true }).gm;
    const ds = [];
    if (ctx.prevSel) ds.push({ label: `${t('chPrev')}`, data: cats.map((c) => gm(ctx.prevSel, c.id)), backgroundColor: css('--line'), borderColor: css('--muted'), borderWidth: 1, borderRadius: 4 });
    ds.push({ label: t('chCur'), data: cats.map((c) => gm(ctx.sel, c.id)), backgroundColor: css('--accent'), borderRadius: 4 });
    mk('cMarginCat', { type: 'bar', data: { labels: cats.map(catName), datasets: ds }, options: opts({ indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { callback: pctTick } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.x)}` } } } }) }, t('chMarginCat'));
  }

  /* --------------------------------------------------------------------- map */
  const metricDef = {
    attain: { kind: 'attainment', get: (k) => k.attain, f: (v) => fmt.pct(v) }, gm: { kind: 'grossMargin', get: (k) => k.gm, f: (v) => fmt.pct(v) },
    onTime: { kind: 'onTime', get: (k) => k.onTime, f: (v) => fmt.pct(v) }, sla: { kind: 'sla', get: (k) => k.sla, f: (v) => fmt.pct(v) }, csat: { kind: 'csat', get: (k) => k.csat, f: (v) => fmt.dec(v, 2) },
  };
  function renderMap(ctx) {
    const def = metricDef[st.mapMetric];
    const host = clear($('map'));
    for (const r of st.D.regions) {
      const k = kpiOver(regionRows(ctx.sel, r.id));
      const v = def.get(k), s = C.status(def.kind, v);
      const dim = st.F.region && st.F.region !== r.id;
      const tile = el('button', { type: 'button', class: `tile ${s || ''} ${st.F.region === r.id ? 'sel' : ''}`, 'data-region': r.id, style: dim ? 'opacity:.55' : null,
        'aria-pressed': String(st.F.region === r.id), 'aria-label': `${regionName(r)}: ${v == null ? t('na') : def.f(v)}, ${statusLabel(s)}`,
        onclick: () => { st.F.region = st.F.region === r.id ? null : r.id; st.F.branch = null; buildSelects(); renderAll(); } },
        el('span', { class: 'name', text: regionName(r) }), el('span', { class: 'val', text: v == null ? t('na') : def.f(v) }), el('span', { class: 'st', text: s ? STATUS_SYM[s] + ' ' + statusLabel(s) : '' }));
      host.append(tile);
    }
    host.append(el('div', { class: 'map-legend' },
      el('div', { class: 'note', text: t('mapHint') }),
      ['green', 'amber', 'red'].map((x) => el('div', { class: 'note' }, chip(x)))));
  }

  /* ---------------------------------------------------------------- scorecard */
  function branchRows(ctx) {
    const bs = C.branchSet(st.D, st.F);
    return st.D.branches.filter((b) => bs.has(b.id)).map((b) => {
      const one = { sales: ctx.sel.sales.filter((r) => r.branch_id === b.id), tickets: ctx.sel.tickets.filter((r) => r.branch_id === b.id), targets: ctx.sel.targets.filter((r) => r.branch_id === b.id), categoryFiltered: ctx.sel.categoryFiltered };
      const k = kpiOver(one);
      const worst = ['attainment:attain', 'grossMargin:gm', 'onTime:onTime', 'sla:sla', 'csat:csat'].map((p) => { const [kind, key] = p.split(':'); return C.status(kind, k[key]); }).filter(Boolean);
      const overall = worst.includes('red') ? 'red' : worst.includes('amber') ? 'amber' : worst.length ? 'green' : null;
      return { b, k, overall, name: branchName(b), region: regionName(b.region) };
    });
  }
  function renderScorecard(ctx) {
    const rows = branchRows(ctx);
    const { key, dir } = st.sort;
    const val = (r) => (key === 'name' ? r.name : key === 'region' ? r.region : key === 'overall' ? { red: 0, amber: 1, green: 2 }[r.overall] ?? 3 : r.k[key]);
    rows.sort((a, b) => { const x = val(a), y = val(b); if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
    const cols = [['name', 'colBranch'], ['region', 'colRegion'], ['net', 'colRevenue', 1], ['attain', 'colAttain', 1], ['gm', 'colMargin', 1], ['onTime', 'colOnTime', 1], ['sla', 'colSla', 1], ['csat', 'colCsat', 1], ['overall', 'colStatus']];
    const tbl = clear($('scorecard'));
    tbl.append(el('thead', {}, el('tr', {}, cols.map(([k, lab, num]) => el('th', { class: 'sortable ' + (num ? 'num' : ''), scope: 'col', tabindex: '0', role: 'button', 'aria-sort': st.sort.key === k ? (st.sort.dir > 0 ? 'ascending' : 'descending') : 'none',
      onclick: () => sortBy(k), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(k); } } }, t(lab), st.sort.key === k ? (st.sort.dir > 0 ? ' ▲' : ' ▼') : '')))));
    const body = el('tbody');
    for (const r of rows) {
      body.append(el('tr', { class: 'click', tabindex: '0', onclick: () => openDrill({ type: 'branch', id: r.b.id }), onkeydown: (e) => { if (e.key === 'Enter') openDrill({ type: 'branch', id: r.b.id }); } },
        el('td', { text: r.name }), el('td', { text: r.region }), el('td', { class: 'num', text: fmt.sar(r.k.net) }),
        el('td', { class: 'num', text: r.k.attain == null ? t('na') : fmt.pct(r.k.attain) }), el('td', { class: 'num', text: fmt.pct(r.k.gm) }), el('td', { class: 'num', text: fmt.pct(r.k.onTime) }),
        el('td', { class: 'num', text: fmt.pct(r.k.sla) }), el('td', { class: 'num', text: fmt.dec(r.k.csat, 2) }), el('td', {}, chip(r.overall))));
    }
    tbl.append(body);
    return rows;
  }
  function sortBy(k) { st.sort = { key: k, dir: st.sort.key === k ? -st.sort.dir : (k === 'name' || k === 'region' ? 1 : -1) }; renderAll(); }

  function exportCsv() {
    const ctx = context();
    const rows = branchRows(ctx);
    const head = ['Branch', 'Region', 'Net revenue (SAR)', 'Target (SAR)', 'Target attainment %', 'Gross margin %', 'On-time delivery %', 'SLA compliance %', 'Avg CSAT', 'Status', 'From', 'To'];
    const safe = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const r1 = (x, d = 2) => (x == null ? '' : Number(x.toFixed(d)));
    const lines = [head.join(',')].concat(rows.map((r) => [r.b.name, r.b.region.en, r1(r.k.net, 0), r.k.attain == null ? '' : r1(r.k.target, 0), r1(r.k.attain), r1(r.k.gm), r1(r.k.onTime), r1(r.k.sla), r1(r.k.csat), r.overall || '', ctx.from, ctx.to].map(safe).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `mis_branch_scorecard_${ctx.from}_${ctx.to}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------------------------- sales tab */
  function chartRevRegion(ctx) {
    const qs = [...new Set(ctx.months.map(C.quarterOf))];
    const ds = visibleRegions().map((r) => ({ label: regionName(r), backgroundColor: regColor(r.id), borderRadius: 3,
      data: qs.map((q) => { const rows = regionRows(ctx.sel, r.id).sales.filter((x) => C.quarterOf(x.ym) === q); return C.sum(rows, 'net'); }) }));
    mk('cRevRegion', { type: 'bar', data: { labels: qs, datasets: ds }, options: opts({ scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => fmt.sar(v) } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${t('sar')} ${fmt.sar(c.parsed.y)}` } } } }) }, t('chRevRegion'));
  }
  function chartDiscount(ctx) {
    const cats = st.D.categories.filter((c) => !st.F.category || c.id === st.F.category);
    const ds = cats.map((c) => ({ label: catName(c), borderColor: catColor(c.id), backgroundColor: catColor(c.id), borderWidth: 2.5, pointRadius: 2, tension: 0,
      data: ctx.months.map((m) => { const rows = monthSel(ctx, m).sales.filter((r) => r.category_id === c.id); const g = C.sum(rows, 'gross'); return g ? ((g - C.sum(rows, 'net')) / g) * 100 : null; }) }));
    mk('cDiscount', { type: 'line', data: { labels: ctx.months.map(fmt.month), datasets: ds }, options: opts({ scales: { y: { beginAtZero: true, ticks: { callback: pctTick } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } } }) }, t('chDiscount'));
  }
  function chartReps(ctx) {
    const by = C.groupBy(ctx.sel.sales, (r) => r.rep_id);
    const list = [...by.entries()].map(([id, rows]) => ({ id, k: kpiOver({ sales: rows }), rep: st.D.repById.get(id) })).sort((a, b) => b.k.net - a.k.net).slice(0, 10);
    const chart = mk('cReps', { type: 'bar', data: { labels: list.map((x) => `${x.rep.name} · ${branchName(st.D.branchById.get(x.rep.branch_id))}`), datasets: [{ label: t('chRevenue'), data: list.map((x) => x.k.net), backgroundColor: list.map((x) => regColor(st.D.branchById.get(x.rep.branch_id).region_id)), borderRadius: 4 }] },
      options: opts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${t('chRevenue')}: ${t('sar')} ${fmt.sar(c.parsed.x)}`, afterLabel: (c) => `${t('chRepMargin')}: ${fmt.pct(list[c.dataIndex].k.gm)}` } } }, scales: { x: { ticks: { callback: (v) => fmt.sar(v) } } },
        onClick: (e, els) => { if (els.length) openDrill({ type: 'rep', id: list[els[0].index].id }); } }) }, t('chReps'));
    if (chart) chart.canvas.style.cursor = 'pointer';
  }

  /* ---------------------------------------------------------------- delivery tab */
  function deliveryKpis(ctx) {
    const { k, kp } = ctx, host = clear($('kpisDelivery'));
    const lab = isAr() ? { days: 'متوسط أيام التسليم', can: 'نسبة الإلغاء', ret: 'نسبة المرتجعات', dl: 'السطور المسلَّمة' } : { days: 'Avg delivery days', can: 'Cancelled lines', ret: 'Returned lines', dl: 'Delivered lines' };
    const sp = (fn) => sparkline(monthlyValues(ctx, fn));
    host.append(
      kpiCard({ label: t('kpiOnTime'), value: fmt.pct(k.onTime), status: C.status('onTime', k.onTime), delta: mkDelta('pp', k.onTime, kp && kp.onTime, ctx), spark: sp((x) => x.onTime) }),
      kpiCard({ label: lab.days, value: fmt.dec(k.days, 2), delta: kp && k.days != null && kp.days != null ? { text: `${fmt.signed(k.days - kp.days, 2)} ${t('vsPrev')}`, good: Math.abs(k.days - kp.days) < 0.05 ? null : k.days < kp.days } : null, spark: sp((x) => x.days) }),
      kpiCard({ label: lab.can, value: fmt.pct(k.cancelled, 2), delta: kp && k.cancelled != null && kp.cancelled != null ? { text: `${fmt.signed(k.cancelled - kp.cancelled, 2, ' ' + t('pp'))} ${t('vsPrev')}`, good: Math.abs(k.cancelled - kp.cancelled) < 0.05 ? null : k.cancelled < kp.cancelled } : null }),
      kpiCard({ label: lab.ret, value: fmt.pct(k.returned, 2), delta: kp && k.returned != null && kp.returned != null ? { text: `${fmt.signed(k.returned - kp.returned, 2, ' ' + t('pp'))} ${t('vsPrev')}`, good: Math.abs(k.returned - kp.returned) < 0.05 ? null : k.returned < kp.returned } : null }),
      kpiCard({ label: lab.dl, value: fmt.int(C.sum(ctx.sel.sales, 'delivered')) }));
  }
  function chartOnTime(ctx) {
    const ds = visibleRegions().map((r) => ({ label: regionName(r), borderColor: regColor(r.id), backgroundColor: regColor(r.id), borderWidth: 2.5, pointRadius: 2, tension: 0, spanGaps: true,
      data: ctx.months.map((m) => kpiOver(regionRows(monthSel(ctx, m), r.id)).onTime) }));
    mk('cOnTime', { type: 'line', data: { labels: ctx.months.map(fmt.month), datasets: ds }, options: opts({ scales: { y: { min: 0, max: 100, ticks: { callback: pctTick } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } } }) }, t('chOnTime'));
  }
  function chartDays(ctx) {
    const regs = visibleRegions();
    const ds = [];
    if (ctx.prevSel) ds.push({ label: t('chPrev'), data: regs.map((r) => kpiOver(regionRows(ctx.prevSel, r.id)).days), backgroundColor: css('--line'), borderColor: css('--muted'), borderWidth: 1, borderRadius: 4 });
    ds.push({ label: t('chCur'), data: regs.map((r) => kpiOver(regionRows(ctx.sel, r.id)).days), backgroundColor: regs.map((r) => regColor(r.id)), borderRadius: 4 });
    mk('cDays', { type: 'bar', data: { labels: regs.map(regionName), datasets: ds }, options: opts({ scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.dec(c.parsed.y, 2)}` } } } }) }, t('chDays'));
  }
  function heatTable(host, rowItems, colItems, cellFn) {
    const tbl = clear(host);
    tbl.append(el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: '' }), colItems.map((c) => el('th', { scope: 'col', class: 'num', text: c.label })))));
    const body = el('tbody');
    for (const r of rowItems) {
      body.append(el('tr', {}, el('th', { scope: 'row', text: r.label }), colItems.map((c) => {
        const { text, status } = cellFn(r, c);
        return el('td', { class: 'cell ' + (status || 'none'), title: `${r.label} · ${c.label}: ${text} (${statusLabel(status)})` }, status ? el('span', { class: 'sym', 'aria-hidden': 'true', text: STATUS_SYM[status] }) : null, text);
      })));
    }
    tbl.append(body);
  }
  function renderHeatOnTime(ctx) {
    const rowItems = visibleRegions().map((r) => ({ label: regionName(r), id: r.id }));
    const colItems = ctx.months.map((m) => ({ label: fmt.month(m), ym: m }));
    heatTable($('heatOnTime'), rowItems, colItems, (r, c) => {
      const v = kpiOver(regionRows(monthSel(ctx, c.ym), r.id)).onTime;
      return { text: v == null ? '–' : fmt.pct(v, 0), status: C.status('onTime', v) };
    });
  }

  /* ----------------------------------------------------------------- support tab */
  function supportKpis(ctx) {
    const { k, kp } = ctx, host = clear($('kpisSupport'));
    const lab = isAr() ? { tk: 'التذاكر', open: 'التذاكر المفتوحة', hrs: 'متوسط ساعات الحل' } : { tk: 'Tickets', open: 'Open tickets', hrs: 'Avg resolution hours' };
    const sp = (fn) => sparkline(monthlyValues(ctx, fn));
    host.append(
      kpiCard({ label: lab.tk, value: fmt.int(k.tickets), delta: kp ? { text: `${fmt.signed(deltaPct(k.tickets, kp.tickets), 1, '%')} ${t('vsPrev')}`, good: null } : null, spark: sp((x) => x.tickets) }),
      kpiCard({ label: lab.open, value: fmt.int(k.open) }),
      kpiCard({ label: t('kpiSla'), value: fmt.pct(k.sla), status: C.status('sla', k.sla), delta: mkDelta('pp', k.sla, kp && kp.sla, ctx), spark: sp((x) => x.sla) }),
      kpiCard({ label: t('kpiCsat'), value: fmt.dec(k.csat, 2), status: C.status('csat', k.csat), delta: mkDelta('abs2', k.csat, kp && kp.csat, ctx), spark: sp((x) => x.csat) }),
      kpiCard({ label: lab.hrs, value: fmt.dec(k.resHours, 1), delta: kp && k.resHours != null && kp.resHours != null ? { text: `${fmt.signed(k.resHours - kp.resHours, 1)} ${t('vsPrev')}`, good: Math.abs(k.resHours - kp.resHours) < 0.05 ? null : k.resHours < kp.resHours } : null }));
  }
  function chartSla(ctx) {
    const ds = visibleRegions().map((r) => ({ label: regionName(r), borderColor: regColor(r.id), backgroundColor: regColor(r.id), borderWidth: 2.5, pointRadius: 2, tension: 0, spanGaps: true,
      data: ctx.months.map((m) => kpiOver(regionRows(monthSel(ctx, m), r.id)).sla) }));
    mk('cSla', { type: 'line', data: { labels: ctx.months.map(fmt.month), datasets: ds }, options: opts({ scales: { y: { min: 0, max: 100, ticks: { callback: pctTick } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } } }) }, t('chSla'));
  }
  function chartCsat(ctx) {
    const regs = visibleRegions();
    const ds = [];
    if (ctx.prevSel) ds.push({ label: t('chPrev'), data: regs.map((r) => kpiOver(regionRows(ctx.prevSel, r.id)).csat), backgroundColor: css('--line'), borderColor: css('--muted'), borderWidth: 1, borderRadius: 4 });
    ds.push({ label: t('chCur'), data: regs.map((r) => kpiOver(regionRows(ctx.sel, r.id)).csat), backgroundColor: regs.map((r) => regColor(r.id)), borderRadius: 4 });
    mk('cCsat', { type: 'bar', data: { labels: regs.map(regionName), datasets: ds }, options: opts({ scales: { y: { min: 1, max: 5 } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.dec(c.parsed.y, 2)}` } } } }) }, t('chCsat'));
  }
  function chartTicketCat(ctx) {
    const by = C.groupBy(ctx.sel.tickets, (r) => r.category);
    const list = [...by.entries()].map(([name, rows]) => ({ name, n: C.sum(rows, 'tickets') })).sort((a, b) => b.n - a.n);
    mk('cTicketCat', { type: 'bar', data: { labels: list.map((x) => window.I18N.ticketCat(x.name)), datasets: [{ label: t('chTicketCat'), data: list.map((x) => x.n), backgroundColor: css('--accent'), borderRadius: 4 }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } }) }, t('chTicketCat'));
  }
  function chartPriority(ctx) {
    const order = ['Critical', 'High', 'Medium', 'Low'];
    const by = C.groupBy(ctx.sel.tickets, (r) => r.priority);
    const data = order.map((p) => C.sum(by.get(p) || [], 'tickets'));
    mk('cPriority', { type: 'doughnut', data: { labels: order.map((p) => window.I18N.priority(p)), datasets: [{ data, backgroundColor: ['#D64550', '#E8742B', '#2F6FDB', '#9AA5BA'], borderColor: css('--surface'), borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '58%', plugins: { legend: { position: 'right', rtl: isAr(), labels: { color: css('--text'), usePointStyle: true, font: { family: css('--font') } } }, tooltip: { rtl: isAr() } } } }, t('chPriority'));
  }

  /* ------------------------------------------------------------------ risks tab */
  function scopeLabel(item) {
    if (item.scope.region) return regionName(item.label);
    if (item.scope.category) return catName(item.label);
    return t('all');
  }
  function renderRisks(ctx, rk) {
    rk = rk || C.risks(st.D, st.F, ctx.from, ctx.to);
    const F = st.F;
    // heatmap: regions x (delivery, SLA, CSAT, attainment), then categories x (margin, discount, below-cost)
    const cell = (type, scopeKey, id) => rk.items.find((i) => i.type === type && i.scope[scopeKey] === id);
    const tbl = clear($('riskHeat'));
    const cols1 = [['delivery', 'rDelivery'], ['sla', 'rSla'], ['csat', 'rCsat'], ['attain', 'rAttain']];
    const cols2 = [['margin', 'rMargin'], ['discount', 'rDiscount'], ['belowCost', 'rBelowCost']];
    const fmtItem = (i) => (i ? (i.type === 'csat' ? fmt.dec(i.cur, 2) : fmt.pct(i.cur, i.dec || 1)) : '–');
    const section = (title, cols, rowsData, key) => {
      tbl.append(el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: title }), cols.map(([, k]) => el('th', { scope: 'col', class: 'num', text: t(k) })))));
      const body = el('tbody');
      for (const r of rowsData) {
        body.append(el('tr', {}, el('th', { scope: 'row', text: r.name }), cols.map(([type]) => {
          const i = cell(type, key, r.id);
          return el('td', { class: 'cell ' + (i ? i.status : 'none'), title: i ? `${r.name} · ${t(i.title)}: ${fmtItem(i)} (${statusLabel(i.status)})` : '' }, i ? el('span', { class: 'sym', 'aria-hidden': 'true', text: STATUS_SYM[i.status] }) : null, fmtItem(i));
        })));
      }
      tbl.append(body);
    };
    section(t('colRegion'), cols1, visibleRegions().map((r) => ({ id: r.id, name: regionName(r) })), 'region');
    section(t('category'), cols2, st.D.categories.filter((c) => !F.category || c.id === F.category).map((c) => ({ id: c.id, name: catName(c) })), 'category');

    const red = rk.items.filter((i) => i.status === 'red').length, amber = rk.items.filter((i) => i.status === 'amber').length;
    $('riskNote').textContent = t('riskNote', { c: CFG.risk.currentMonths, b: CFG.risk.baselineMonths }) + (rk.baseFrom ? ` (${fmt.month(rk.curFrom)}–${fmt.month(rk.curTo)} vs ${fmt.month(rk.baseFrom)}–${fmt.month(rk.baseTo)})` : '');
    $('riskCount').textContent = t('rulesChecked', { n: rk.items.length, r: red, a: amber });
    $('riskToggle').textContent = st.riskAll ? t('showFlagged') : t('showAll');
    const shown = rk.items.filter((i) => st.riskAll || i.status !== 'green');
    const rt = clear($('riskTable'));
    rt.append(el('thead', {}, el('tr', {}, ['colRisk', 'colScope', 'colCurrent', 'colBaseline', 'colChange', 'colStatus', 'colAction'].map((k) => el('th', { scope: 'col', text: t(k) })))));
    const body = el('tbody');
    for (const i of shown) {
      const f = (v) => (v == null ? '–' : i.type === 'csat' ? fmt.dec(v, 2) : fmt.pct(v, i.dec || 1));
      body.append(el('tr', {}, el('td', { text: t(i.title) }), el('td', { text: scopeLabel(i) }), el('td', { class: 'num', text: f(i.cur) }), el('td', { class: 'num', text: f(i.base) }),
        el('td', { class: 'num', text: i.delta == null ? '–' : i.type === 'csat' ? fmt.signed(i.delta, 2) : fmt.signed(i.delta, 1, ' ' + t('pp')) }), el('td', {}, chip(i.status)), el('td', { class: 'wrap', text: i.status === 'green' ? '' : t(i.action) })));
    }
    if (!shown.length) body.append(el('tr', {}, el('td', { colspan: '7', class: 'note', text: t('noData') })));
    rt.append(body);

    // data quality
    const dq = st.D.dq, pct = dq.lines ? (dq.any_issue / dq.lines) * 100 : null;
    const dqt = clear($('dqTable'));
    const rowsDq = [['dqLines', dq.lines], ['dqMissingDisc', dq.missing_discount], ['dqBadDate', dq.bad_delivery_date], ['dqNegQty', dq.negative_qty], ['dqDup', dq.duplicates_dropped], ['dqAny', `${fmt.int(dq.any_issue)} (${fmt.pct(pct, 2)})`], ['dqOrphan', dq.orphan_rows]];
    dqt.append(el('tbody', {}, rowsDq.map(([k, v]) => el('tr', {}, el('th', { scope: 'row', text: t(k) }), el('td', { class: 'num', text: typeof v === 'number' ? fmt.int(v) : v })))));
    // ingestion log
    const it = clear($('ingestTable'));
    const log = (st.D.log || []).slice().reverse().slice(0, 12);
    it.append(el('thead', {}, el('tr', {}, ['colTime', 'colFile', 'colTable', 'colResult'].map((k) => el('th', { scope: 'col', text: t(k) })))));
    const lb = el('tbody');
    for (const l of log) {
      const s = l.status === 'rejected' ? 'red' : l.status === 'accepted' ? 'green' : 'amber';
      const label = l.status === 'accepted' ? t('accepted') : l.status === 'accepted_with_rejects' ? t('acceptedRejects') : l.status === 'rejected' ? t('rejected') : t('skipped');
      const detail = l.reason ? l.reason : l.table ? `+${fmt.int(l.inserted)} / ~${fmt.int(l.updated)}${l.rejected ? ` / ✕${fmt.int(l.rejected)}` : ''}` : '';
      lb.append(el('tr', {}, el('td', { text: l.at ? fmt.dateTime(l.at) : '' }), el('td', { text: l.file || '' }), el('td', { text: l.table || '' }),
        el('td', { class: 'wrap' }, chip(s, label), detail ? el('div', { class: 'note', text: detail }) : null)));
    }
    if (!log.length) lb.append(el('tr', {}, el('td', { colspan: '4', class: 'note', text: t('ingestEmpty') })));
    it.append(lb);
  }

  /* ---------------------------------------------------------------------- drill */
  function openDrill(target) {
    st.drill = target; st.lastFocus = document.activeElement;
    $('drawer').hidden = false; $('scrim').hidden = false;
    renderDrill();
    $('drawerClose').focus();
  }
  function closeDrill() {
    st.drill = null; $('drawer').hidden = true; $('scrim').hidden = true;
    for (const id of ['cDrillMonthly', 'cDrillMix']) if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (st.lastFocus && st.lastFocus.focus) st.lastFocus.focus();
  }
  function renderDrill() {
    const d = st.drill; if (!d) return;
    const ctx = context(), D = st.D;
    const isBranch = d.type === 'branch';
    const F = { ...st.F, region: null, branch: isBranch ? d.id : null, category: null };
    const sel = C.select(D, F, ctx.from, ctx.to, { rep: isBranch ? null : d.id });
    const prevWin = ctx.prevWin, prevSel = prevWin ? C.select(D, F, prevWin.from, prevWin.to, { rep: isBranch ? null : d.id }) : null;
    const k = C.kpis(sel), kp = prevSel ? C.kpis(prevSel) : null;
    const entity = isBranch ? D.branchById.get(d.id) : D.repById.get(d.id);
    $('drawerTitle').textContent = isBranch ? `${t('drillBranch')}: ${branchName(entity)}` : `${t('drillRep')}: ${entity.name} · ${branchName(D.branchById.get(entity.branch_id))}`;
    const host = clear($('drawerKpis'));
    const c2 = { kp };
    host.append(kpiCard({ label: t('kpiRevenue'), value: fmt.sar(k.net), delta: mkDelta('pct', k.net, kp && kp.net, c2) }));
    if (isBranch) host.append(kpiCard({ label: t('kpiAttain'), value: fmt.pct(k.attain), status: C.status('attainment', k.attain), delta: mkDelta('pp', k.attain, kp && kp.attain, c2) }));
    host.append(kpiCard({ label: t('kpiMargin'), value: fmt.pct(k.gm), status: C.status('grossMargin', k.gm), delta: mkDelta('pp', k.gm, kp && kp.gm, c2) }),
      kpiCard({ label: t('kpiOnTime'), value: fmt.pct(k.onTime), status: C.status('onTime', k.onTime), delta: mkDelta('pp', k.onTime, kp && kp.onTime, c2) }));
    if (isBranch) host.append(kpiCard({ label: t('kpiSla'), value: fmt.pct(k.sla), status: C.status('sla', k.sla), delta: mkDelta('pp', k.sla, kp && kp.sla, c2) }), kpiCard({ label: t('kpiCsat'), value: fmt.dec(k.csat, 2), status: C.status('csat', k.csat), delta: mkDelta('abs2', k.csat, kp && kp.csat, c2) }));
    const net = ctx.months.map((m) => C.kpis(C.select(D, F, m, m, { rep: isBranch ? null : d.id })));
    const ds = [{ type: 'bar', label: t('chRevenue'), data: net.map((x) => x.net), backgroundColor: css('--accent'), borderRadius: 4 }];
    if (isBranch) ds.push({ type: 'line', label: t('chTarget'), data: net.map((x) => x.target), borderColor: '#E8742B', backgroundColor: '#E8742B', borderWidth: 2.5, pointRadius: 2, tension: 0 });
    mk('cDrillMonthly', { type: 'bar', data: { labels: ctx.months.map(fmt.month), datasets: ds }, options: opts({ scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmt.sar(v) } } } }) }, t('monthly'));
    const mix = D.categories.map((c) => ({ c, v: C.sum(sel.sales.filter((r) => r.category_id === c.id), 'net') }));
    mk('cDrillMix', { type: 'doughnut', data: { labels: mix.map((x) => catName(x.c)), datasets: [{ data: mix.map((x) => x.v), backgroundColor: mix.map((x) => catColor(x.c.id)), borderColor: css('--surface'), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '55%', plugins: { legend: { position: 'right', rtl: isAr(), labels: { color: css('--text'), usePointStyle: true, font: { family: css('--font') } } }, tooltip: { rtl: isAr(), callbacks: { label: (c) => `${c.label}: ${t('sar')} ${fmt.sar(c.parsed)}` } } } } }, t('mix'));
  }

  /* ------------------------------------------------------------------ render all */
  function renderMeta() {
    const D = st.D;
    $('asOf').textContent = D.meta.as_of ? fmt.date(D.meta.as_of) : '–';
    $('updatedAt').textContent = D.meta.generated_at ? fmt.dateTime(D.meta.generated_at) : '–';
    $('connDot').className = 'dot ' + (st.conn === 'live' ? 'live' : st.conn === 'static' ? 'static' : '');
    $('connText').textContent = t(st.conn === 'live' ? 'live' : st.conn === 'static' ? 'staticFile' : 'embedded');
  }
  function renderAll() {
    if (!st.D) return;
    renderMeta();
    const ctx = context();
    let rk = null;
    if (st.tab === 'overview') { overviewKpis(ctx); rk = summary(ctx); chartRevTarget(ctx); chartMarginCat(ctx); renderMap(ctx); renderScorecard(ctx); }
    if (st.tab === 'sales') { chartRevRegion(ctx); chartDiscount(ctx); chartReps(ctx); }
    if (st.tab === 'delivery') { deliveryKpis(ctx); chartOnTime(ctx); chartDays(ctx); renderHeatOnTime(ctx); }
    if (st.tab === 'support') { supportKpis(ctx); chartSla(ctx); chartCsat(ctx); chartTicketCat(ctx); chartPriority(ctx); }
    if (st.tab === 'risks') renderRisks(ctx, rk);
    if (st.drill) renderDrill();
    window.__MIS_STATE__ = { tab: st.tab, from: ctx.from, to: ctx.to, kpis: ctx.k }; // read by the automated tests
  }

  function showTab(name) {
    st.tab = name;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    renderAll();
  }

  /* ------------------------------------------------------------------------ init */
  function setLang(l) {
    window.I18N.setLang(l);
    try { localStorage.setItem('mis_lang', l); } catch (e) { /* storage unavailable: fine */ }
    applyI18n();
    if (st.D) { buildSelects(); renderAll(); }
  }

  async function init() {
    let lang = 'en';
    try { lang = localStorage.getItem('mis_lang') || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en'); } catch (e) { lang = (navigator.language || '').startsWith('ar') ? 'ar' : 'en'; }
    window.I18N.setLang(lang);
    applyI18n();
    // events
    $('langBtn').addEventListener('click', () => setLang(isAr() ? 'en' : 'ar'));
    $('printBtn').addEventListener('click', () => window.print());
    $('csvBtn').addEventListener('click', exportCsv);
    $('resetBtn').addEventListener('click', () => { Object.assign(st.F, { region: null, branch: null, category: null }); setPreset('all'); buildSelects(); renderAll(); });
    $('fPreset').addEventListener('change', () => { setPreset($('fPreset').value); buildSelects(); renderAll(); });
    for (const id of ['fFrom', 'fTo']) $(id).addEventListener('change', () => { st.F.from = $('fFrom').value; st.F.to = $('fTo').value; st.F.preset = 'custom'; buildSelects(); renderAll(); });
    $('fRegion').addEventListener('change', () => { $('fBranch').value = ''; onFilter(); });   // changing region clears the branch
    $('fBranch').addEventListener('change', onFilter);
    $('fCategory').addEventListener('change', onFilter);
    $('mapMetric').addEventListener('change', () => { st.mapMetric = $('mapMetric').value; renderAll(); });
    $('riskToggle').addEventListener('click', () => { st.riskAll = !st.riskAll; renderAll(); });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('drawerClose').addEventListener('click', closeDrill);
    $('scrim').addEventListener('click', closeDrill);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.drill) closeDrill(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderAll());
    try {
      const { raw, conn } = await loadData();
      applyData(raw, conn);
      startLive();
    } catch (e) {
      $('summaryList').append(el('li', { text: 'Could not load data: ' + e.message }));
    }
  }
  init();
})();
