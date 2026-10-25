/* Dashboard configuration. Thresholds are illustrative: replace them with agreed business targets. */
window.MIS_CONFIG = {
  // Status colours are chosen to stay distinguishable with colour-vision deficiency; every status also has a text label and a symbol.
  colors: { green: '#1F9D55', amber: '#D9930D', red: '#D64550', neutral: '#6B7280' },
  regionColors: { 1: '#2F6FDB', 2: '#7C5CC4', 3: '#E8742B', 4: '#159A86' },
  // higher-is-better KPIs: [green at or above, amber at or above]; below amber = red
  kpiThresholds: {
    attainment: [100, 95],     // %
    grossMargin: [28, 25],     // %
    onTime: [85, 70],          // %
    sla: [80, 70],             // %
    csat: [3.9, 3.7],          // 1-5 score
  },
  // risk rules: current window = last N months of the selected period, baseline = the M months before it
  risk: {
    currentMonths: 3,
    baselineMonths: 6,
    onTime: { redBelow: 70, amberBelow: 85, redDrop: 15, amberDrop: 5 },
    sla: { redBelow: 70, amberBelow: 80, redDrop: 15, amberDrop: 5 },
    csat: { redBelow: 3.7, amberBelow: 3.9, redDrop: 0.3, amberDrop: 0.1 },
    margin: { redDrop: 5, amberDrop: 2 },            // percentage points of gross margin
    discount: { redRise: 5, amberRise: 2 },          // percentage points of average discount
    belowCost: { redAt: 10, amberAt: 3, redRise: 5, amberRise: 2 },  // % of valid lines sold below cost
    attainment: { redBelow: 95, amberBelow: 100 },
    dataQuality: { redAt: 5, amberAt: 3 },           // % of sales lines with any issue
  },
  pollSeconds: 60,   // static-file fallback: how often to check for a new dashboard.json
};
