'use strict';
/**
 * Browser test (Playwright + Chromium) against the real server.
 *   node tests/ui_test.js [--shots dir]
 * Checks: no console errors, every tab renders, language switch + RTL, filters, drill-down, CSV export,
 * and that a file dropped into the inbox updates the open page without a reload.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mis-ui-'));
const PORT = 8098;
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const srv = spawn('node', [path.join(ROOT, 'server', 'ingest.js')], { env: { ...process.env, PORT, SCAN_MS: 300, MIS_WORKDIR: WORK }, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/data`); if (r.ok) break; } catch { /* wait */ } await sleep(200); }
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('#kpis .kpi');

    check('live connection detected', (await page.textContent('#connText')).includes('Live'));
    check('6 KPI cards on the overview', (await page.locator('#kpis .kpi').count()) === 6);
    check('executive summary has 5 sentences', (await page.locator('#summaryList li').count()) === 5);
    check('scorecard shows 8 branches', (await page.locator('#scorecard tbody tr').count()) === 8);
    check('map shows 4 region tiles', (await page.locator('#map .tile').count()) === 4);

    // full-period numbers must equal the Power BI cards
    await page.selectOption('#fPreset', 'all');
    const kp = await page.evaluate(() => window.__MIS_STATE__.kpis);
    check('All data: net revenue = 1,487,953,549', Math.abs(kp.net - 1487953549.41) < 5);
    check('All data: on-time 82.73%', Math.abs(kp.onTime - 82.73) < 0.01);
    check('All data: SLA 81.55%', Math.abs(kp.sla - 81.55) < 0.01);
    check('All data: target attainment 97.55%', Math.abs(kp.attain - 97.55) < 0.01);
    if (shots) await page.screenshot({ path: path.join(shots, 'overview_en_all.png'), fullPage: true });

    await page.selectOption('#fPreset', 'all');
    await sleep(300);
    if (shots) await page.screenshot({ path: path.join(shots, 'overview_en.png'), fullPage: true });

    // every tab renders its charts
    for (const [tab, ids] of [['sales', ['cRevRegion', 'cDiscount', 'cReps']], ['delivery', ['cOnTime', 'cDays']], ['support', ['cSla', 'cCsat', 'cTicketCat', 'cPriority']]]) {
      await page.click(`.tab[data-tab="${tab}"]`); await sleep(500);
      const ok = await page.evaluate((list) => list.every((id) => { const c = document.getElementById(id); return c && c.style.display !== 'none' && c.width > 0; }), ids);
      check(`tab ${tab}: charts drawn`, ok);
      if (shots) await page.screenshot({ path: path.join(shots, `${tab}_en.png`), fullPage: true });
    }
    await page.click('.tab[data-tab="delivery"]'); await sleep(300);
    check('delivery heatmap has 4 region rows', (await page.locator('#heatOnTime tbody tr').count()) === 4);
    await page.click('.tab[data-tab="risks"]'); await sleep(400);
    const red = await page.locator('#riskTable .chip.red').count();
    check('risk register flags critical items', red >= 4, `(${red} red)`);
    const regText = await page.textContent('#riskTable');
    check('register names Networking and Eastern/Western', /Networking/.test(regText) && /Eastern/.test(regText) && /Western/.test(regText));
    if (shots) await page.screenshot({ path: path.join(shots, 'risks_en.png'), fullPage: true });

    // filters
    await page.click('.tab[data-tab="overview"]'); await sleep(300);
    await page.selectOption('#fRegion', '3'); await sleep(300);
    check('region filter limits scorecard to Eastern branches (2)', (await page.locator('#scorecard tbody tr').count()) === 2);
    const brOpts = await page.locator('#fBranch option').count();
    check('branch list follows the region (All + 2)', brOpts === 3, `(${brOpts})`);
    await page.selectOption('#fCategory', '2'); await sleep(300);
    check('category filter hides target attainment (n/a)', /n\/a/i.test(await page.textContent('#kpis .kpi:nth-child(2)')));
    await page.click('#resetBtn'); await sleep(300);
    check('reset restores 8 branches', (await page.locator('#scorecard tbody tr').count()) === 8);

    // drill-down + CSV export
    await page.locator('#scorecard tbody tr').first().click(); await sleep(500);
    check('drill-down drawer opens with title', (await page.isVisible('#drawer')) && (await page.textContent('#drawerTitle')).length > 5);
    if (shots) await page.screenshot({ path: path.join(shots, 'drill_en.png') });
    await page.keyboard.press('Escape'); await sleep(200);
    check('Escape closes the drawer', !(await page.isVisible('#drawer')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csvBtn')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('CSV export has header + 8 rows', csv.trim().split(/\r?\n/).length === 9, `(${dl.suggestedFilename()})`);

    // Arabic / RTL
    await page.click('#langBtn'); await sleep(500);
    check('Arabic: html dir=rtl lang=ar', (await page.getAttribute('html', 'dir')) === 'rtl' && (await page.getAttribute('html', 'lang')) === 'ar');
    check('Arabic: title translated', /لوحة/.test(await page.textContent('#appTitle')));
    check('Arabic: summary in Arabic', /[؀-ۿ]/.test(await page.textContent('#summaryList')));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check('Arabic: no horizontal page overflow', !overflow);
    if (shots) {
      await page.screenshot({ path: path.join(shots, 'overview_ar.png'), fullPage: true });
      for (const tab of ['sales', 'delivery', 'support', 'risks']) { await page.click(`.tab[data-tab="${tab}"]`); await sleep(500); await page.screenshot({ path: path.join(shots, `${tab}_ar.png`), fullPage: true }); }
    }
    await page.click('#langBtn'); await sleep(300);
    await page.click('.tab[data-tab="overview"]'); await sleep(300);

    // mobile layout
    await page.setViewportSize({ width: 390, height: 800 }); await sleep(500);
    const mobOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check('mobile (390px): no horizontal page overflow', !mobOverflow);
    if (shots) await page.screenshot({ path: path.join(shots, 'overview_mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // live update: drop a file with new sales into the inbox and watch the open page change
    await page.selectOption('#fPreset', 'all'); await sleep(300);
    const before = (await page.evaluate(() => window.__MIS_STATE__.kpis)).net;
    const hdr = 'order_id,order_line_id,order_date,delivery_date,promised_date,customer_id,product_id,branch_id,rep_id,quantity,unit_price,discount_pct,unit_cost,order_status';
    fs.writeFileSync(path.join(WORK, 'inbox', 'fact_sales_live.csv'), [hdr, '8000001,80000011,2026-09-20,2026-09-22,2026-09-23,1001,1,1,1,100,1000,0.10,600,Delivered'].join('\n'));
    await page.waitForFunction((b) => window.__MIS_STATE__.kpis.net > b + 1, before, { timeout: 15000 });
    const after = (await page.evaluate(() => window.__MIS_STATE__.kpis)).net;
    check('live update: page changed without reload (+90,000)', Math.abs(after - before - 90000) < 0.01, `(+${(after - before).toFixed(2)})`);

    // a bad file must show up in the ingestion log on the Risks & data tab
    fs.writeFileSync(path.join(WORK, 'inbox', 'broken.csv'), 'a,b\n1,2\n');
    await sleep(2500);
    await page.click('.tab[data-tab="risks"]'); await sleep(500);
    check('rejected file visible in ingestion log', /broken\.csv/.test(await page.textContent('#ingestTable')) && (await page.locator('#ingestTable .chip.red').count()) >= 1);
    if (shots) await page.screenshot({ path: path.join(shots, 'risks_after_ingest.png'), fullPage: true });

    check('no console errors', errors.length === 0, errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : '');
  } catch (e) { failed++; console.error('TEST ERROR', e); }
  finally { await browser.close(); srv.kill(); fs.rmSync(WORK, { recursive: true, force: true }); }
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll UI checks passed');
  process.exit(failed ? 1 : 0);
})();
