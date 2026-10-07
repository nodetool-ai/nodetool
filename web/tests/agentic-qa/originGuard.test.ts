/**
 * Offline checks for the participant runner's origin guard.
 *
 * Run (from web/): npx tsx --test tests/agentic-qa/originGuard.test.ts
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "@playwright/test";
import { installOriginGuard } from "./originGuard";

const ALLOWED = "https://allowed.test";
const PAGE = `<!doctype html>
<a id="same" href="${ALLOWED}/next">same origin</a>
<a id="away" href="https://blocked.test/">same tab, other origin</a>
<a id="tab" href="https://blocked.test/docs" target="_blank">new tab, other origin</a>`;

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

async function openGuardedPage(blocked: string[]) {
  const context = await browser.newContext();
  // Serves the allowed origin offline. Registered first, so it runs after the
  // guard: Playwright runs the newest route handler first, and the guard falls
  // back to this one for every request it permits.
  await context.route(`${ALLOWED}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: PAGE })
  );
  await installOriginGuard(context, [ALLOWED], (url) => {
    blocked.push(url);
  });
  const page = await context.newPage();
  await page.goto(`${ALLOWED}/`);
  return { context, page };
}

test("a link that opens another origin in a new tab is blocked, not fatal", async () => {
  const blocked: string[] = [];
  const { context, page } = await openGuardedPage(blocked);
  const popup = context.waitForEvent("page");
  await page.click("#tab");
  await (await popup).waitForLoadState().catch(() => undefined);
  assert.deepEqual(blocked, ["https://blocked.test/docs"]);
  await context.close();
});

test("a same-tab navigation to another origin is blocked", async () => {
  const blocked: string[] = [];
  const { context, page } = await openGuardedPage(blocked);
  await page.click("#away").catch(() => undefined);
  await page.waitForTimeout(300);
  assert.deepEqual(blocked, ["https://blocked.test/"]);
  await context.close();
});

test("a navigation within the permitted origin is not blocked", async () => {
  const blocked: string[] = [];
  const { context, page } = await openGuardedPage(blocked);
  await page.click("#same");
  await page.waitForURL(`${ALLOWED}/next`);
  assert.deepEqual(blocked, []);
  await context.close();
});
