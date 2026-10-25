# MIS Executive Performance Dashboard — Proposal

*Bilingual (Arabic / English) interactive HTML dashboard with an automatic ingestion folder.*
*Status: working prototype built on the MIS sales, delivery, support and target data (synthetic demo data).*

## 0. Summary

| | |
|---|---|
| Problem | Executives and managers need one view of sales vs target, delivery, support and risks, in Arabic and English, that updates when new data arrives. |
| Solution | A static web front end (HTML/CSS/vanilla JS + Chart.js) plus a small Node service that watches an `inbox/` folder, validates and merges CSV/XLSX/JSON files, and pushes the update to open browsers. |
| Result | Five tabs (Overview, Sales & targets, Delivery, Support, Risks & data), 6 filters, drill-down, CSV export, print-to-PDF, EN/AR with RTL. |
| Verified | Totals reconcile to the Power BI model (17 checks), ingestion (11 checks), browser behaviour (30+ checks). |

**Mapping from a generic "project" dashboard to the data we actually have.** The brief mentions progress, budget and Gantt charts. The MIS data is commercial, not project-management data, so the closest honest equivalents are used:

| Brief | Used here |
|---|---|
| Project progress | Target attainment (net revenue ÷ target) |
| Budget variance | Net revenue vs monthly target, by branch/region |
| Risks | Rule-based register (thresholds in `js/config.js`) |
| Gantt chart | **Not possible** (no task start/end dates). Replaced by month × region heatmaps. |
| Map | Schematic region tiles, **not** a geographic map (no coordinates in the data). |

## 1. Data nature and source

**Tables (11 CSV files, ~44,000 rows in total)**

| Type | Table | Rows | Role |
|---|---|---:|---|
| Fact | `fact_sales` | 35,225 after de-duplication (35,401 raw) | order lines: dates, quantity, price, discount, cost, status |
| Fact | `fact_support_ticket` | 7,666 | tickets: created/resolved, SLA hours, priority, CSAT |
| Fact | `fact_target_monthly` | 192 | monthly net-revenue target per branch (8 × 24) |
| Dimension | `dim_branch`, `dim_region`, `dim_sales_rep`, `dim_customer`, `dim_product`, `dim_subcategory`, `dim_category`, `dim_date` | 8 / 4 / 16 / 300 / 48 / 12 / 4 / 730 | hierarchy: region → branch → rep; category → subcategory → product |

**Accepted input formats:** CSV (UTF-8, BOM tolerated), XLSX (sheet name = table name), JSON (array of rows, or `{ "table": [...] }`). `.sql` is deliberately rejected: running SQL from a shared folder is unsafe. Export tables from the database instead, or use a read-only connector (see `DEPLOYMENT.md`).

**Core fields**

- `fact_sales`: `order_id, order_line_id (PK), order_date, delivery_date, promised_date, customer_id, product_id, branch_id, rep_id, quantity, unit_price, discount_pct, unit_cost, order_status`
- `fact_support_ticket`: `ticket_id (PK), created_at, resolved_at, branch_id, customer_id, ticket_category, priority, sla_hours, csat_score`
- `fact_target_monthly`: `branch_id, month_start (PK), target_net_revenue`

**Update frequency:** on file arrival (the folder is scanned every 2 seconds; configurable). Re-sending a file is safe: rows are upserted by primary key.

**Known data-quality issues handled (same rules as the SQL views):** 176 duplicate order lines removed, 704 missing discounts treated as 0, 101 delivery dates before order date set blank, 141 negative quantities excluded from revenue, 938 lines (2.66%) with at least one issue — shown on the Risks & data tab.

## 2. Objectives and business questions

**Objectives:** one trusted version of the numbers; early warning of problems; the same view for executives, managers and analysts; no manual refresh.

| # | Business question | Where answered |
|---|---|---|
| 1 | Are we on target, and which branches are behind? | Overview KPIs, scorecard, Net revenue vs target |
| 2 | Where is margin eroding, and is discounting the cause? | Gross margin by category; Average discount by category |
| 3 | Which sales reps and branches drive revenue? | Sales rep leaderboard; branch scorecard |
| 4 | Are orders delivered on time, and where not? | Delivery tab: on-time trend, heatmap, average days |
| 5 | Is support meeting its SLA, and are customers satisfied? | Support tab: SLA, CSAT, ticket mix, priority |
| 6 | What needs attention this month? | Executive summary (5 sentences) and Risk register |
| 7 | Can I trust the data? | Data quality panel and ingestion log |

**KPIs:** Net revenue, Target attainment, Gross margin %, On-time delivery %, SLA compliance %, Average CSAT (plus cancelled %, returned %, average delivery days, backlog, below-cost %).

**Findings visible in the sample data (last 12 months):** Networking margin fell from 17.7% to 11.0% with discount rising to ~17%; Eastern on-time delivery collapsed to ~10% from March 2026; Western SLA 43.8% and CSAT 3.41. These are what the prototype is designed to surface.

## 3. Functional requirements

| Requirement | Status | Notes |
|---|---|---|
| Time filtering | Done | presets (3/6/12 months, all) + custom from/to month |
| Region / branch / category filters | Done | branch list follows region. **Category filters sales only**: targets are per branch and tickets have their own categories (a note is shown) |
| Drill-down | Done | click a branch row or a region tile → side drawer with KPIs, monthly trend and mix |
| Export | Done | scorecard → CSV (BOM, formula-injection guard); whole page → PDF via print stylesheet |
| Charts | Line, bar, stacked bar, combo (bar + target line), doughnut, heatmap, sparkline | Chart.js, vendored (no CDN) |
| Gantt | **Not delivered** | data has no task dates |
| Map | Schematic only | region tiles coloured by chosen KPI; click to filter |
| Bilingual | Done | EN/AR toggle, `dir=rtl`, Arabic text for all labels and generated sentences; Latin digits |
| Automatic updates | Done | folder watcher + Server-Sent Events; fallback polling of `dashboard.json` on static hosting |
| Executive summary | Done | five generated sentences, in the active language |
| Risk register | Done | 29 rules; critical/watch/ok; each with a suggested action |
| Accessibility | Done | status = colour + symbol + text; keyboard navigation; skip link; Escape closes drawer |

## 4. Technical and design requirements

- **Framework:** none at runtime — plain HTML, CSS, JS; Chart.js 4. Node ≥ 18 service with `exceljs` and `papaparse`.
- **Architecture:** inbox → detect table → validate rows → upsert into `store.json` → clean + pre-aggregate into cubes → `dashboard.json` (~280 KB) → SSE → browser recalculates. The browser never loads the 35k raw rows.
- **Responsive:** desktop, tablet, 390 px phone (tested, no horizontal page overflow; tables scroll inside their card). Light and dark theme follows the OS.
- **Performance:** first load ≈ 280 KB data + 228 KB library; filter changes recompute from cubes in the browser.
- **Security:** server binds to 127.0.0.1 by default; static allowlist (never serves inbox/store/raw/server code); CSP and security headers; all data written with `textContent` (no `innerHTML` for data); `.sql` never executed; atomic writes; rejected files moved to `rejected/` with a reason. **There is no login in the prototype** — see `DEPLOYMENT.md` for authentication and row-level security (must be server-side).
- **Integration:** database or API sources feed the same inbox as exported files, or a scheduled job writes JSON into it. Direct connectors are a next step, not in the prototype.
- **Colour:** status colours chosen for colour-vision deficiency; thresholds are illustrative and in one config file.

## 5. Audience and tone

| Audience | Needs | Where |
|---|---|---|
| Executives | 30-second read, status, what to do | Overview: summary sentences, 6 KPI cards, map, scorecard |
| Project / branch managers | Their region/branch, trend, drill-down | Filters, drawer, Delivery and Support tabs |
| Analysts | Data quality, rules, export | Risks & data tab, CSV export, config.js |

Tone: formal and neutral, short sentences, numbers first, no marketing language. Arabic text is written natively, not machine-glossed.

## 6. Deliverables and testable outputs

| Deliverable | Location |
|---|---|
| HTML / CSS / JS | `index.html`, `css/style.css`, `js/*.js` |
| Ingestion service | `server/ingest.js`, `server/aggregate.js` |
| Sample test data | `data/raw/*.csv` (11 files), `sample_inbox/` (CSV, JSON, bad file, .sql) |
| Deployment guide | `docs/DEPLOYMENT.md` |
| UAT list | `docs/UAT.md` |
| Data dictionary | `docs/DATA_DICTIONARY.md` |
| Automated tests | `tests/verify_totals.js`, `tests/ingest_test.js`, `tests/ui_test.js` (`npm test`) |

## Limitations (stated plainly)

1. No Gantt chart and no geographic map (data does not support them).
2. Category filter affects sales measures only.
3. Thresholds and risk rules are illustrative and need business approval.
4. Drag-and-drop upload in the browser is not included (files go to the folder on the server).
5. Static hosting shows the last built `dashboard.json`; live ingestion needs the Node service.
6. No authentication in the prototype; production access control must be added server-side.
7. Data is synthetic; MIS is a placeholder company name.
