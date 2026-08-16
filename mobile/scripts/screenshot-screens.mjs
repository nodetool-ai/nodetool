#!/usr/bin/env node
/**
 * Screenshot every mobile screen through the Expo web build.
 *
 * Prerequisites (the script checks both and exits with instructions if missing):
 *   1. A NodeTool API server on http://localhost:7777  (`npm run dev:server`)
 *   2. The Expo web dev server on http://localhost:8081 (`npm --prefix mobile run web`)
 *
 * Auth: `App.tsx` treats an unconfigured Supabase as "logged in" (see
 * `isSupabaseConfigured`), so run the web server with `extra.supabaseUrl` /
 * `extra.supabaseAnonKey` absent from app.json to reach the real screens
 * instead of the login wall.
 *
 * Screens are reached by their deep-link paths from `src/navigation/linking.ts`.
 * Routes with parameters read their ids from a seed file (`--ids <file.json>`)
 * so the shots show populated screens; without it those routes are skipped.
 *
 *   node mobile/scripts/screenshot-screens.mjs --out ./mobile-shots
 *   node mobile/scripts/screenshot-screens.mjs --ids seed-ids.json --width 320
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const OUT = path.resolve(flag('out', 'mobile-shots'));
const WEB = flag('url', 'http://localhost:8081');
const API = flag('api', 'http://localhost:7777');
const WIDTH = Number(flag('width', 390));
const HEIGHT = Number(flag('height', 844));
const IDS_FILE = flag('ids', null);
const ONLY = flag('only', null);
const SETTLE_MS = Number(flag('settle', 3500));

const ids = IDS_FILE && fs.existsSync(IDS_FILE)
  ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'))
  : {};

/**
 * name → deep-link path. `needs` names a key in the ids file; the route is
 * skipped when it is missing so a partial seed still produces a full run.
 */
const ROUTES = [
  { name: 'workflows-list', path: '' },
  { name: 'threads', path: 'threads' },
  { name: 'chat-new', path: 'chat' },
  { name: 'chat-thread', path: (v) => `chat/${v}`, needs: 'threadId' },
  { name: 'documents', path: 'documents' },
  { name: 'apps', path: 'apps' },
  { name: 'app', path: (v) => `app/${v}`, needs: 'applicationId' },
  // Metro's dev server owns `/assets/*`, so this one is reached by tapping the
  // header button instead of by URL.
  { name: 'assets', path: '', click: 'Open assets' },
  { name: 'asset-viewer', path: (v) => `asset/${v}`, needs: 'assetId' },
  { name: 'jobs', path: 'jobs' },
  { name: 'job-detail', path: (v) => `job/${v}`, needs: 'jobId' },
  { name: 'job-detail-failed', path: (v) => `job/${v}`, needs: 'failedJobId' },
  { name: 'triggers', path: 'triggers' },
  { name: 'collections', path: 'collections' },
  { name: 'settings', path: 'settings' },
  { name: 'secrets', path: 'settings/secrets' },
  { name: 'model-selection', path: 'settings/models' },
  { name: 'graph-editor', path: (v) => `workflow/${v}`, needs: 'workflowId' },
  { name: 'script-editor', path: (v) => `document/script/${v}`, needs: 'scriptId' },
  { name: 'jsscript-editor', path: (v) => `document/jsscript/${v}`, needs: 'jsScriptId' },
  { name: 'storyboard-editor', path: (v) => `document/storyboard/${v}`, needs: 'storyboardId' },
  { name: 'timeline-viewer', path: (v) => `document/timeline/${v}`, needs: 'timelineId' },
  { name: 'sketch-viewer', path: (v) => `document/sketch/${v}`, needs: 'sketchId' },
  { name: 'document-viewer', path: (v) => `document/note/${v}`, needs: 'noteId' },
];

async function assertUp(url, hint) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`Not reachable: ${url} (${err.message})\n  → ${hint}`);
    process.exit(1);
  }
}

await assertUp(`${API}/health`, 'start the API with: npm run dev:server');
await assertUp(WEB, 'start the web build with: npm --prefix mobile run web');

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // Set when the installed Chromium doesn't match this Playwright build's
  // expected revision (e.g. a pre-provisioned browser in CI containers).
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  colorScheme: flag('theme', 'dark') === 'light' ? 'light' : 'dark',
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push({ route: current, text: msg.text() });
});
page.on('pageerror', (err) => consoleErrors.push({ route: current, text: `pageerror: ${err.message}` }));

let current = 'boot';
// First load pays the Metro bundle cost; later navigations are client-side.
await page.goto(`${WEB}/`, { waitUntil: 'load', timeout: 300_000 });
await page.waitForTimeout(20_000);

const results = [];
let index = 0;
for (const route of ROUTES) {
  if (ONLY && !route.name.includes(ONLY)) continue;
  if (route.needs && !ids[route.needs]) {
    results.push({ name: route.name, skipped: `no ids.${route.needs}` });
    continue;
  }
  const rel = typeof route.path === 'function' ? route.path(ids[route.needs]) : route.path;
  current = route.name;
  const file = `${String(++index).padStart(2, '0')}-${route.name}.png`;
  await page.goto(`${WEB}/${rel}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(SETTLE_MS);
  if (route.click) {
    await page.getByLabel(route.click).first().click({ timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
  }
  await page.screenshot({ path: path.join(OUT, file) });
  const text = await page.locator('body').innerText().catch(() => '');
  // A horizontally scrollable body means something is wider than the viewport.
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  results.push({
    name: route.name,
    url: `/${rel}`,
    file,
    overflowsX: overflow.scrollWidth > overflow.clientWidth + 1,
    ...overflow,
    text: text.slice(0, 600),
  });
  console.log(`${file}${overflow.scrollWidth > overflow.clientWidth + 1 ? '  ⚠ x-overflow' : ''}`);
}

fs.writeFileSync(
  path.join(OUT, 'report.json'),
  JSON.stringify({ width: WIDTH, height: HEIGHT, results, consoleErrors }, null, 2)
);
console.log(`\n${results.filter((r) => r.file).length} shots → ${OUT}`);
if (consoleErrors.length) console.log(`${consoleErrors.length} console errors (see report.json)`);
await browser.close();
