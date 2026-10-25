# MIS Executive Performance Dashboard

Bilingual (Arabic / English) interactive dashboard with an **automatic ingestion folder**. Built on the MIS sales, delivery, support and target data (synthetic; "MIS" is a placeholder).

```bash
npm install
npm start            # http://127.0.0.1:8080
npm test             # reconciliation + ingestion + browser tests
```

Drop CSV / XLSX / JSON files into `inbox/`: the open dashboard updates by itself. Try the files in `sample_inbox/`.

| Doc | What |
|---|---|
| `docs/PROPOSAL.md` | data, objectives, requirements, audience, deliverables, limitations |
| `docs/DEPLOYMENT.md` | run, ingestion folder, hosting, security, troubleshooting |
| `docs/UAT.md` | 22 acceptance tests |
| `docs/DATA_DICTIONARY.md` | accepted tables, keys, types, cleaning rules |

**Not included, by design or data limits:** Gantt chart (no task dates), geographic map (schematic tiles instead), login/RLS (must be added server-side), `.sql` execution (rejected for safety).
