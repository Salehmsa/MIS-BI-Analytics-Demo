[النسخة العربية](README.ar.md)

# MIS Business Performance Dashboard — SQL Server + Power BI

 **Live demo:** https://salehmsa.github.io/MIS-BI-Analytics-Demo/

End-to-end BI project built for a **Data Analyst / BI Developer** role: a cleaned SQL Server layer, a Power BI star-schema model with 46 documented DAX measures, a five-page executive dashboard, row-level security, and a data-quality log.

> **Synthetic data.** All data is generated for this portfolio project. "MIS" is a placeholder company; nothing here describes a real organisation.

![Executive Overview](images/page1.png)

---

## 1. Business questions

| # | Question | Where answered |
|---|---|---|
| 1 | Are we growing, and are we hitting target? | Page 1 – Executive Overview |
| 2 | Is growth profitable? Where is margin leaking? | Page 2 – Sales & Margin |
| 3 | Is delivery reliable, and where is it failing? | Page 3 – Delivery & Operations |
| 4 | Is customer support keeping up? | Page 4 – Customer Support |
| 5 | Can the numbers be trusted? | Page 5 – Data Quality & Governance |

## 2. Key findings

All figures are verified against independent SQL queries (see `sql/MIS_interview_queries.sql`).

1. **Revenue is growing, margin is not.** Net revenue reached 214.2M in 2026-Q3 (+21.0% YoY; 1.49bn over the full period). Gross margin fell from 28.1% (2024-Q4) to 25.7% (2026-Q3).
2. **The margin problem is one category: Networking.** Average Networking discount rose from 4.85% (2025-Q4) to 17.0%, and Networking gross margin fell from 17.7% to 5.7%. Networking is ~28.8% of revenue (428.0M of 1,488.0M). Hardware sits near 17.5% in every quarter, so its low margin is structural, not a new problem. Excluding Networking, margin is flat.
3. **Eastern delivery collapsed from March 2026 and has not recovered.** On-time delivery: 93.5% (Jan) → 83.4% (Feb) → 8.1% (Mar), then 6–13% every month through September. Average delivery time in the East went from 3.3 to 8.4 days; other regions are unchanged at ~3.3. Eastern delay-related tickets rose from 13.7 to 32.1 per month (×2.3).
4. **No visible commercial impact in the East yet.** Eastern cancellation rate is unchanged (4.6% before and after). This is a leading-indicator risk, not a realised loss.
5. **Western support deteriorated sharply.** SLA compliance fell from 90.4% (2025-Q4) to 43.8% (2026-Q3); average CSAT from 4.06 to 3.41.
6. **Western growth has stalled:** +2.7% YoY versus +21% to +33% in the other regions.

What the data does **not** show: *why* these changes happened. They are patterns to investigate (pricing policy, carrier or logistics change in the East, staffing in the West), not established causes.

## 3. Dashboard pages

| Page | Headline | Preview |
|---|---|---|
| 1. Executive Overview | Revenue is up 21% YoY (2026-Q3), but gross margin slipped from 28.1% to 25.7% | ![](images/page1.png) |
| 2. Sales & Margin | Networking discounts jumped from 4.9% to 17.0%, cutting its margin from 17.7% to 5.7% | ![](images/page2.png) |
| 3. Delivery & Operations | Eastern on-time delivery fell from 93.5% (Jan) to 8.1% (Mar 2026) and has not recovered | ![](images/page3.png) |
| 4. Customer Support | Western SLA fell from 90% to 44% and CSAT to 3.41; Eastern delay complaints up 2.3x | ![](images/page4.png) |
| 5. Data Quality & Governance | Only 2.7% of sales lines had quality issues, all documented and treated before analysis | ![](images/page5.png) |

Design choices: one headline per page that states the finding; status colours driven by DAX measures (green / amber / red); chart type matched to the question (trend = line, comparison = bars, region × time = heatmap, composition = treemap); no chart type repeated on a page.

## 4. Architecture

```
Synthetic data  →  SQL Server (MIS_BI)  →  Cleaning views  →  Power BI (Import)  →  Dashboard + RLS
                   fact / dim tables       vw_fact_sales_clean   star schema          5 pages
                                           vw_sales_enriched     46 DAX measures
```

**SQL layer**
- `vw_fact_sales_clean` – cleaning layer: removes 176 duplicate rows, sets invalid delivery dates (delivery before order) to NULL, fills missing discount with 0 and flags it. Result: 35,225 sales lines.
- `vw_sales_enriched` – analysis view that joins product, category, branch, region and date for SQL-side analysis and for verifying DAX results.
- `sql/MIS_interview_queries.sql` – the business questions answered in SQL (CTEs, window functions, joins) plus data-quality checks.

**Power BI model**
- Tables: `vw_fact_sales_clean` (sales facts through the cleaning view), `fact_support_ticket`, `fact_target_monthly`, and dimensions for date, region, branch, product, subcategory, category, customer and sales rep.
- `dim_date` has an **active** relationship on order date and an **inactive** one on delivery date, used through `USERELATIONSHIP` in delivery measures.
- Measures live in a dedicated `_Measures` table, organised into display folders: Sales, Target, Time Intelligence, Operations, Profitability Risk, Support, Data Quality, plus a Formatting folder for the status-colour measures.
- `powerbi/MIS_DAX_Measures.md` documents the 46 core measures: type, business question, format and code. (The catalogue is written in Arabic. The status-colour and data-quality-log helper measures were added afterwards and are not in it yet.)

## 5. KPIs

| KPI | Value (full period) | Status rule (illustrative) |
|---|---|---|
| Net Revenue | 1.49bn | – |
| Target Attainment % | 97.55% | green ≥ 100%, amber ≥ 95% |
| Gross Margin % | 27.1% | green ≥ 28%, amber ≥ 25% |
| On-Time Delivery % | 82.73% | green ≥ 85%, amber ≥ 70% |
| SLA Compliance % | 81.55% | green ≥ 80%, amber ≥ 70% |
| Avg CSAT | by region | green ≥ 3.9, amber ≥ 3.7 |

The thresholds are illustrative and are labelled as such on the dashboard. A real deployment would take them from agreed business targets.

## 6. Data quality

Every issue is detected by a rule, treated in a defined place, and listed on page 5.

| Issue | Rows | Treatment |
|---|---|---|
| Missing discount | 704 | Filled with 0 in the cleaning view; flagged |
| Delivery date before order date | 101 | Set to NULL in the view; flagged |
| Negative quantity | 141 | Kept and flagged; excluded from revenue and margin |
| Duplicate rows | 176 | Removed in the view |
| Inconsistent city spelling | – | Standardised in Power Query |
| Missing customer segment | 3 | Replaced with "Unknown" in Power Query |
| Missing CSAT score | 1,974 | Left blank on purpose (no survey response) |

Overall, 2.66% of sales lines carry at least one issue.

## 7. Row-level security (RLS)

Two roles, built and tested in **Power BI Desktop** with *Modeling → View as*.

| Role | Rule | Effect |
|---|---|---|
| Regional Manager | `dim_region[manager_email] = USERPRINCIPALNAME()` | Sees only their own region, across sales **and** support tickets |
| Executive | no filter | Sees all four regions |

Tests performed:

| Test | Result |
|---|---|
| `western.manager@example.com` + Regional Manager, page 1 | Scorecard shows Western only; Net Revenue 0.38bn |
| Same user, Customer Support page | Western only; 1,749 tickets |
| Cross-check: Region slicer = Western, no RLS | 1,749 tickets — identical |
| `executive@example.com` + Executive | All four regions; 1.49bn; 7,666 tickets |

![Western manager – page 1](images/rls_western_manager_page1.png)
![Western manager – support](images/rls_western_manager_support.png)
![Executive – all regions](images/rls_executive_all_regions.png)
![Cross-check: 1,749](images/rls_check_1749.png)

## 8. Limitations and honest notes

- **Not published.** The report was built and tested in Power BI Desktop only. It has **not** been published to Power BI Service, so no workspace, role assignment or scheduled refresh has been configured. In a real deployment, RLS members are assigned in the Service, and a local SQL Server source needs an on-premises data gateway for scheduled refresh.
- **Synthetic data.** Patterns were detected and verified, but the data cannot explain their causes.
- **Static headline.** Each page headline is fixed text describing the company-wide picture. A restricted user (RLS) sees their own region in the visuals but the same headline; the page subtitle says "Headline is company-wide". A dynamic headline measure would be the proper fix.
- **Thresholds are illustrative**, not agreed targets.
- **Fixed-period visuals.** The YoY-by-region and margin-by-category charts on page 1 are pinned to 2026-Q3 and ignore the year slicer; the page note says so.
- **Statistical caution.** Southern cancellations moved from 4.1% to 5.5% (~2.5σ). I treated it as likely noise and did not report it as a finding.

## 9. Repository contents

| File | Purpose |
|---|---|
| `README.md` | This document |
| `README.ar.md` | Arabic version |
| `sql/MIS_interview_queries.sql` | Cleaning views, business-question queries, data-quality checks |
| `powerbi/MIS_DAX_Measures.md` | The 46 DAX measures with business meaning |
| `images/` | Dashboard pages and RLS test screenshots |
| `powerbi/MIS_BI_Dashboard.pdf` | Exported report (5 pages) |
| `powerbi/MIS_BI_Analytics.pbix` | The Power BI report (Import mode, open in Power BI Desktop) |
| `html-dashboard/` | Bilingual (AR/EN) interactive HTML dashboard with an automatic ingestion folder (see section 11) |

## 10. Skills demonstrated

SQL Server (views, CTEs, window functions, data-quality checks) · Power BI data modelling (star schema, active/inactive relationships) · DAX (time intelligence, `CALCULATE`, `USERELATIONSHIP`, `SWITCH`, `DATATABLE`) · conditional formatting driven by measures · row-level security · KPI design · data-quality governance · verifying every measure against SQL.

## 11. Interactive HTML dashboard (bilingual, with automatic ingestion)

A second deliverable built on the same data: a bilingual (Arabic/English, RTL) HTML dashboard for executives, managers and analysts. Drop CSV / XLSX / JSON files into an `inbox/` folder and the open dashboard updates by itself. Its numbers match the Power BI report (129 values compared across regions, periods and categories, no differences). See [`html-dashboard/README.md`](html-dashboard/README.md) and `html-dashboard/docs/` (proposal, deployment guide, 22 acceptance tests, data dictionary).

```bash
cd html-dashboard
npm install
npm start        # http://127.0.0.1:8080
```

Honest limits: no Gantt chart (the data has no task dates), the map is schematic, there is no login in the prototype, and `.sql` files are never executed.

---

*Prepared by Saleh Mahbub — Data Analyst | BI.*
