# User acceptance tests (UAT)

Run with `npm start`, browser at 1440 px unless stated. "Auto" = also covered by `npm test`.

| ID | Area | Steps | Expected | Auto |
|---|---|---|---|:--:|
| UAT-01 | Load | Open `/` | Overview shows 6 KPI cards, 5-sentence summary, map with 4 tiles, scorecard with 8 branches; header says "Live" | ✔ |
| UAT-02 | Reconciliation | Period = All time | Net revenue 1,487,953,549; target attainment 97.55%; on-time 82.73%; SLA 81.55% | ✔ |
| UAT-03 | Period filter | Choose Last 6 months, then custom From/To | All tabs follow; preset shows "Custom" | |
| UAT-04 | Region filter | Region = Eastern | Scorecard 2 branches; branch list = All + 2 | ✔ |
| UAT-05 | Category filter | Category = Networking | Attainment shows n/a; note explains scope | ✔ |
| UAT-06 | Reset | Click Reset filters | Defaults restored, 8 branches | ✔ |
| UAT-07 | Drill-down | Click a branch row; then a map tile | Drawer with KPIs + 2 charts; Esc closes; focus returns | ✔ |
| UAT-08 | Export CSV | Click Export CSV | File downloads: header + 8 rows, opens in Excel with Arabic names correct | ✔ |
| UAT-09 | Export PDF | Print / PDF | Current tab only, no filters/buttons, charts visible | |
| UAT-10 | Tabs | Visit all 5 tabs | Every chart draws; delivery heatmap 4 rows; risks tab lists critical items | ✔ |
| UAT-11 | Arabic | Click العربية | Whole page in Arabic, `dir=rtl`, no horizontal overflow; signs next to numbers correct; charts readable | ✔ |
| UAT-12 | Mobile | 390 px width | No horizontal page scroll; tabs scroll; tables scroll inside card | ✔ |
| UAT-13 | Live update | Copy `sample_inbox/fact_sales_new_orders.csv` into `inbox/` | Open page changes without reload within ~5 s; log shows Accepted | ✔ |
| UAT-14 | Upsert | Copy the same file again | Row counts show updated, not inserted; revenue unchanged | ✔ |
| UAT-15 | Bad file | Copy `bad_schema_example.csv` | Moved to `rejected/`; red entry in ingestion log with reason | ✔ |
| UAT-16 | SQL file | Copy `export_from_db.sql` | Rejected with message that .sql is never executed | |
| UAT-17 | JSON | Copy `fact_target_monthly_oct.json` | Targets for Oct 2026 appear; log Accepted | |
| UAT-18 | Data quality | Risks & data | 938 lines with issue (2.66%), 176 duplicates removed | ✔ |
| UAT-19 | Risk register | Risks & data | 4 critical (Eastern delivery, Western SLA, Networking below-cost, Western CSAT) and 5 watch | ✔ |
| UAT-20 | Accessibility | Keyboard only | Tab reaches filters, tabs, rows; status never colour-only | |
| UAT-21 | Security | `/server/ingest.js`, `/inbox/`, `/data/raw/` in URL | 404 | |
| UAT-22 | Static fallback | Serve folder with any static server | Shows "Static" and data from dashboard.json | |

Sign-off: ____________  Date: ________  Open defects: ________
