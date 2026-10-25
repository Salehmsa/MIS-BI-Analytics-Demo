'use strict';
/**
 * Reconciliation test: the dashboard's pre-aggregated cubes must reproduce the
 * numbers already verified in the Power BI project (and against SQL).
 *   node tests/verify_totals.js
 */
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'processed', 'dashboard.json'), 'utf8'));

const sc = d.sales.cols, tc = d.tickets.cols;
const S = (name) => d.sales.rows.reduce((a, r) => a + r[sc.indexOf(name)], 0);
const Tt = (name) => d.tickets.rows.reduce((a, r) => a + r[tc.indexOf(name)], 0);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const netRevenue = S('net');
const checks = [
  // the scorecard shows each region rounded to whole riyals, so the sum of 4 rounded values can differ by up to 2
  ['Net Revenue (SAR)', netRevenue, 1487953548, 2.0, 'sum of the 4 rounded regions in the Power BI scorecard'],
  ['Gross Margin %', (S('net') - S('cost')) / S('net') * 100, 27.1, 0.05, 'card: 27.1%'],
  ['Target Revenue (SAR)', d.targets.reduce((a, t) => a + t.target, 0), 1525376000, 1, 'fact_target_monthly total'],
  ['Target Attainment %', netRevenue / d.targets.reduce((a, t) => a + t.target, 0) * 100, 97.55, 0.01, 'card: 97.55%'],
  ['Delivered Lines', S('delivered'), 33630, 0, 'page 3 card'],
  ['On-Time Delivery %', S('on_time') / S('delivered') * 100, 82.73, 0.01, 'card: 82.73%'],
  ['Avg Delivery Days', S('days_sum') / S('delivered'), 3.70, 0.01, 'page 3 card'],
  ['Cancelled Lines %', S('cancelled') / S('lines_all') * 100, 4.24, 0.01, 'page 3 card'],
  ['Returned Lines %', S('returned') / S('lines_all') * 100, 2.78, 0.01, 'page 3 card'],
  ['Below-Cost Lines %', S('below_cost_lines') / S('lines_valid') * 100, 2.85, 0.01, 'page 2 card'],
  ['Below-Cost Loss (SAR)', S('below_cost_loss'), 1260000, 10000, 'page 2 card: 1.26M'],
  ['Tickets', Tt('tickets'), 7666, 0, 'page 4 card'],
  ['Open Backlog', d.open_backlog, 161, 0, 'page 4 card (all periods)'],
  ['SLA Compliance %', Tt('sla_ok') / Tt('resolved') * 100, 81.55, 0.01, 'card: 81.55%'],
  ['CSAT response rate %', Tt('csat_n') / Tt('tickets') * 100, 74.25, 0.01, 'page 4 card'],
  ['Lines with any DQ issue', d.data_quality.any_issue, 938, 0, 'page 5 card'],
  ['Duplicate rows removed', d.data_quality.duplicates_dropped, 176, 0, 'SQL view'],
];

let failed = 0;
for (const [name, got, want, tol, note] of checks) {
  const ok = near(got, want, tol);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} got ${Number(got).toLocaleString('en', { maximumFractionDigits: 2 })}  expected ${Number(want).toLocaleString('en')}  (${note})`);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll reconciliation checks passed');
process.exit(failed ? 1 : 0);
