/**
 * Boot-time measurement harness (CDP).
 *
 * Loads the app in Chromium with a raw CDP session attached and reports what
 * the boot path actually costs: navigation milestones (FCP/LCP/DCL/load), the
 * moment the app becomes usable, the bytes and requests that crossed the wire
 * before that moment, and where main-thread time went.
 *
 * Usage:
 *   node scripts/measure-boot.mjs [url] [--runs N] [--json out.json] [--label name]
 *
 * The app is considered booted when the boot spinner and the "Loading NodeTool"
 * status are gone and real workspace chrome is in the DOM. That is the number
 * a user feels, and it is what regressions should be judged against.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const url = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ??
  "http://localhost:4173/";
const RUNS = Number(flag("runs", 3));
const JSON_OUT = flag("json", null);
const LABEL = flag("label", "run");
const BOOT_TIMEOUT = Number(flag("timeout", 60000));

/**
 * Booted = the workspace chrome the user actually interacts with is on screen:
 * the boot spinner and both loading states are gone and the tab bar has
 * rendered. Anything earlier is a paint the user cannot use.
 */
const BOOTED_JS = `
  (() => {
    if (document.getElementById("boot-spinner")) return false;
    if (document.querySelector('[aria-label="Loading NodeTool"]')) return false;
    if (document.querySelector('[aria-label="Loading"]')) return false;
    return !!document.querySelector('[aria-label="Open or create a tab"]');
  })()
`;

async function measureOnce(browser, index) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send("Network.enable");
  await client.send("Page.enable");
  await client.send("Performance.enable");
  await client.send("Network.clearBrowserCache");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });

  /** requestId -> { url, type, encoded } */
  const requests = new Map();
  client.on("Network.requestWillBeSent", (e) => {
    requests.set(e.requestId, {
      url: e.request.url,
      type: e.type,
      encoded: 0,
      startMs: e.timestamp * 1000
    });
  });
  client.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.type = e.type;
  });
  client.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    if (r) {
      r.encoded = e.encodedDataLength;
      r.endMs = e.timestamp * 1000;
    }
  });

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit", timeout: BOOT_TIMEOUT });
  await page.waitForFunction(BOOTED_JS, undefined, {
    timeout: BOOT_TIMEOUT,
    polling: 50
  });
  const bootedWallMs = Date.now() - t0;

  // Let LCP settle.
  await page.waitForTimeout(500);

  const timings = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((p) => [p.name, p.startTime])
    );
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const resources = performance.getEntriesByType("resource");
    const jsEval = resources
      .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
      .reduce((sum, r) => sum + r.duration, 0);
    return {
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
      responseEnd: nav?.responseEnd ?? null,
      firstPaint: paints["first-paint"] ?? null,
      firstContentfulPaint: paints["first-contentful-paint"] ?? null,
      largestContentfulPaint: lcpEntries.length
        ? lcpEntries[lcpEntries.length - 1].startTime
        : null,
      resourceCount: resources.length,
      jsResourceDurationMs: jsEval
    };
  });

  const perfMetrics = Object.fromEntries(
    (await client.send("Performance.getMetrics")).metrics.map((m) => [
      m.name,
      m.value
    ])
  );

  const byType = {};
  let totalBytes = 0;
  for (const r of requests.values()) {
    const key = r.type ?? "Other";
    byType[key] = byType[key] ?? { count: 0, bytes: 0 };
    byType[key].count += 1;
    byType[key].bytes += r.encoded;
    totalBytes += r.encoded;
  }

  const scripts = [...requests.values()]
    .filter((r) => r.type === "Script")
    .sort((a, b) => b.encoded - a.encoded)
    .slice(0, 15)
    .map((r) => ({
      file: r.url.split("/").pop().split("?")[0],
      kb: +(r.encoded / 1024).toFixed(1)
    }));

  const fonts = [...requests.values()].filter((r) => r.type === "Font");
  const stylesheets = [...requests.values()]
    .filter((r) => r.type === "Stylesheet")
    .map((r) => ({
      file: r.url.split("/").pop().split("?")[0],
      kb: +(r.encoded / 1024).toFixed(1)
    }));

  await context.close();

  return {
    index,
    bootedWallMs,
    ...timings,
    scriptEvalMs: +(perfMetrics.ScriptDuration * 1000).toFixed(1),
    layoutMs: +(perfMetrics.LayoutDuration * 1000).toFixed(1),
    recalcStyleMs: +(perfMetrics.RecalcStyleDuration * 1000).toFixed(1),
    taskMs: +(perfMetrics.TaskDuration * 1000).toFixed(1),
    jsHeapMB: +(perfMetrics.JSHeapUsedSize / 1024 / 1024).toFixed(1),
    totalKB: +(totalBytes / 1024).toFixed(1),
    requestCount: requests.size,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [
        k,
        { count: v.count, kb: +(v.bytes / 1024).toFixed(1) }
      ])
    ),
    fontCount: fonts.length,
    fontKB: +(fonts.reduce((s, f) => s + f.encoded, 0) / 1024).toFixed(1),
    stylesheets,
    topScripts: scripts,
    consoleErrors: consoleErrors.slice(0, 5)
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const runs = [];
for (let i = 0; i < RUNS; i += 1) {
  runs.push(await measureOnce(browser, i));
  process.stderr.write(`  run ${i + 1}/${RUNS} done\n`);
}
await browser.close();

const pick = (key) => {
  const vals = runs.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? +median(vals).toFixed(1) : null;
};
const summary = {
  label: LABEL,
  url,
  runs: RUNS,
  median: {
    bootedWallMs: pick("bootedWallMs"),
    firstContentfulPaint: pick("firstContentfulPaint"),
    largestContentfulPaint: pick("largestContentfulPaint"),
    domContentLoaded: pick("domContentLoaded"),
    loadEvent: pick("loadEvent"),
    scriptEvalMs: pick("scriptEvalMs"),
    recalcStyleMs: pick("recalcStyleMs"),
    taskMs: pick("taskMs"),
    totalKB: pick("totalKB"),
    requestCount: pick("requestCount"),
    fontCount: pick("fontCount"),
    fontKB: pick("fontKB"),
    jsHeapMB: pick("jsHeapMB")
  },
  last: runs[runs.length - 1]
};

console.log(JSON.stringify(summary, null, 2));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ summary, runs }, null, 2));
