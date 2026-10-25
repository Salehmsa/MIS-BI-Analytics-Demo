# Deployment guide

## 1. Run locally (2 minutes)

```bash
npm install            # exceljs, papaparse, chart.js, playwright (tests only)
npm start              # http://127.0.0.1:8080
```

Environment variables: `PORT` (8080), `HOST` (127.0.0.1), `SCAN_MS` (2000), `MIS_WORKDIR` (where `inbox/`, `processed/`, `rejected/`, store live; default = project folder).

On first start the server builds from `data/raw/*.csv` (the sample). After that it works from `store/store.json`.

## 2. Using the ingestion folder

1. Put CSV / XLSX / JSON files in `inbox/`.
2. Within ~2 seconds the file is detected, checked for a stable size (so half-copied files are not read), and identified by file name, sheet name, or header signature.
3. Rows are validated (required columns, types, dates). Valid rows are **upserted by primary key** — resending a file updates rows, it does not duplicate them.
4. Good files move to `processed/`; bad files move to `rejected/` with a reason, shown on **Risks & data → Latest ingestion activity**.
5. Open browsers update by themselves (header shows "Live").

Try it: copy files from `sample_inbox/` into `inbox/`. `bad_schema_example.csv` and `export_from_db.sql` must be rejected.

File naming: `<table>.csv`, `<table>_anything.csv`, or an XLSX with one sheet per table. Required columns per table are in `DATA_DICTIONARY.md`. Header names are case/space/underscore tolerant.

## 3. Static hosting (read-only fallback)

Run `npm run build:sample`, then publish `index.html`, `css/`, `js/`, `vendor/`, `data/processed/dashboard.json` on any static host. The page shows "Static" and polls `dashboard.json` every 60 s. No ingestion without the Node service.

## 4. Putting it on an internal server

- Run behind a reverse proxy (nginx/IIS/Caddy) with HTTPS; keep the Node process on `127.0.0.1`. Set `X-Accel-Buffering: no` / disable proxy buffering for `/api/events` (Server-Sent Events).
- Run as a service (systemd, PM2, or Windows service) so it restarts; back up `store/store.json`.
- Make the inbox a network share or SFTP target writable only by the data team. **Anyone who can write to the inbox can change the numbers.**

### Authentication and row-level security
The prototype has **no login**. Before showing real data:
- Put SSO / reverse-proxy authentication in front (e.g., oauth2-proxy, Azure AD App Proxy).
- Row-level security must be enforced **on the server** (filter the cubes per user before sending `dashboard.json`). Hiding data in the browser is not security. The Power BI project's RLS (tested in Desktop) shows the intended rules by region.

### Databases and APIs
`.sql` is not executed on purpose. Options: (a) a scheduled job exports tables to CSV/JSON into the inbox; (b) a small connector with a **read-only** account that runs fixed, reviewed queries and writes JSON into the inbox. Both reuse the same validation.

## 5. Changing rules
All thresholds and risk rules: `js/config.js`. Cleaning rules and measure definitions: `server/aggregate.js` (they mirror the SQL views and DAX measures; change both together or numbers will differ from Power BI).

## 6. Tests
`npm test` runs: totals reconciliation (17 checks), ingestion (11), browser (Playwright/Chromium, 30+). Add `--shots <dir>` to the UI test to save screenshots.

## 7. Troubleshooting
| Symptom | Check |
|---|---|
| File stays in inbox | still being copied? extension not csv/xlsx/json? name starts with `.` or `~$` |
| File in `rejected/` | reason is in the ingestion log (missing column, bad type, unknown table) |
| Header shows "Static" | page opened as a file or on static host; use `npm start` |
| Numbers differ from Power BI | same filters? Power BI default period vs "Last 12 months" here |
| Updates not live behind proxy | proxy buffering on `/api/events` |
