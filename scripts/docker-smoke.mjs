#!/usr/bin/env node
// Loads the web app served by a running NodeTool container and fails if it
// does not come up clean. Pairs with .github/workflows/docker-smoke.yml, which
// builds the image and starts the container before calling this.
//
// The container must be reachable on loopback — run it with `--network host`.
// In `local` auth mode the server only trusts requests whose source is
// loopback *inside* the container, so a published port (-p 7777:7777) arrives
// from the bridge gateway and every API call answers 401.
//
// Run locally against any server:
//   node scripts/docker-smoke.mjs http://localhost:7777

import { chromium } from "playwright";

function report() {
  if (failures.length > 0) {
    console.error(`\nDocker smoke failed with ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Docker smoke passed — ${baseUrl} served the app with no errors.`);
  process.exit(0);
}

const baseUrl = process.argv[2] ?? "http://localhost:7777";
const failures = [];

// The app's own console output is verbose (tRPC logs every query with multi-line
// CSS formatting), so a failing run has to stay readable: one line each, deduped.
const summarize = (text) => {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 180)}…` : oneLine;
};

const get = async (path) => {
  try {
    return await fetch(new URL(path, baseUrl));
  } catch (cause) {
    failures.push(`GET ${path} — no response from ${baseUrl} (${cause.message})`);
    return null;
  }
};

const config = await get("/api/config");
if (config && !config.ok) {
  failures.push(`GET /api/config -> ${config.status}`);
}

// The app renders fine from an empty library, so an authenticated read is what
// separates "server up" from "server up and answering".
const workflows = await get("/api/workflows");
if (workflows && !workflows.ok) {
  failures.push(
    `GET /api/workflows -> ${workflows.status} (401 means the request did ` +
      `not reach the server over loopback — run the container with --network host)`
  );
}

// Nothing below can succeed if the server never answered.
if (failures.length > 0) {
  report();
}

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`uncaught: ${err.message}`));
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
});

const response = await page.goto(baseUrl, {
  waitUntil: "networkidle",
  timeout: 90_000,
});

if (response?.status() !== 200) {
  failures.push(`GET / -> ${response?.status()}`);
}

// index.html ships a #boot-spinner inside #root that React replaces on mount,
// so its removal is the signal that the bundle ran rather than merely loaded.
await page
  .waitForSelector("#boot-spinner", { state: "detached", timeout: 60_000 })
  .catch(() => failures.push("#boot-spinner never cleared — the app did not mount"));

const rootMarkup = await page.locator("#root").innerHTML();
if (rootMarkup.length < 500) {
  failures.push(`#root rendered only ${rootMarkup.length} chars of markup`);
}

for (const error of new Set(consoleErrors.map(summarize))) {
  failures.push(`console: ${error}`);
}
for (const request of new Set(failedRequests.map(summarize))) {
  failures.push(`request failed: ${request}`);
}

await page.screenshot({ path: "docker-smoke.png" }).catch(() => {});
await browser.close();

report();
