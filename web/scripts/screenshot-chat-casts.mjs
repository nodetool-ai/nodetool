// Captures a marketing screenshot of each chat cast in web/src/demo/chat/marketing.
//
// Boots the Vite dev server, opens /demo.html?chat=<id>&t=<ms>&bare=1 for every
// entry in CASTS, waits for the replayed thread to settle, and writes a retina
// screenshot of the chat panel to marketing/public/chat/<id>.webp.
//
//   node scripts/screenshot-chat-casts.mjs [--only id1,id2] [--out dir] [--headed]
//
// It also writes marketing/src/data/chatShots.generated.ts — the intrinsic size
// of each shot, which `next/image` needs and which changes whenever a cast's
// prose re-flows. A `--only` run merges into it rather than dropping the shots
// it did not take.
//
// The casts are authored, not recorded (see ../src/demo/chat/marketing), so a
// re-run reproduces the same frames without a backend, a model call, or credits.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

/**
 * One screenshot per entry. `atMs` is the frame — past the last event of the
 * cast, so the thread is fully settled. The height is measured from the
 * rendered thread rather than declared: the answers are prose and re-flow
 * whenever the wording or the chat CSS changes, and a fixed height would
 * either clip the last paragraph or leave dead space under it.
 */
const CASTS = [
  { id: "chat-capability-map", atMs: 9000 },
  { id: "chat-storyboard-stills", atMs: 16000 },
  { id: "chat-cost-preview", atMs: 14000 },
  { id: "chat-trailer-delivered", atMs: 15000 },
];

const WIDTH = 1180;
const PROBE_HEIGHT = 2200;
const MIN_HEIGHT = 620;
const MAX_HEIGHT = 2000;
/** Breathing room under the last message, before the composer. */
const TAIL_PAD = 4;

/**
 * How much taller or shorter the viewport must be for the thread to end just
 * under its last message. Measured inside the page: the thread pads its tail
 * to anchor a new turn at the top, so `scrollHeight` overstates the content.
 */
const measureHeightDelta = (tailPad) => {
  const scroller = document.querySelector("[data-scroll-mode]");
  if (!scroller) return null;
  const list =
    scroller.querySelector(".chat-messages-virtual") ??
    scroller.querySelector(".chat-messages-real-content");
  const items = Array.from(list?.children ?? []).filter(
    (el) => !el.classList.contains("chat-anchor-tail")
  );
  const last = items[items.length - 1];
  if (!last) return null;
  const bottom =
    last.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top;
  return Math.round(bottom + scroller.scrollTop + tailPad - scroller.clientHeight);
};

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = argValue("--only")?.split(",").map((s) => s.trim());
const OUT = path.resolve(argValue("--out") ?? path.join(ROOT, "marketing/public/chat"));
const entries = CASTS.filter((c) => !only || only.includes(c.id));
const MANIFEST = path.join(ROOT, "marketing/src/data/chatShots.generated.ts");

fs.mkdirSync(OUT, { recursive: true });

/** The sizes already recorded, so a `--only` run keeps the other shots. */
const recordedShots = () => {
  if (!fs.existsSync(MANIFEST)) return [];
  const body = /CHAT_SHOTS: ChatShot\[\] = (\[[\s\S]*?\]);/.exec(
    fs.readFileSync(MANIFEST, "utf8")
  );
  if (!body) throw new Error(`Cannot read sizes from ${MANIFEST}`);
  return JSON.parse(body[1]);
};

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Vite did not come up at ${url}`);
}

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: WEB,
  stdio: ["ignore", "pipe", "pipe"],
});
// Vite forwards the page's own console here, and a backend-free run logs a
// tRPC failure per blocked query. Kept for a crash, dropped otherwise.
const viteLog = [];
vite.stderr.on("data", (d) => viteLog.push(String(d)));

try {
  await waitForServer(BASE);
  const browser = await chromium.launch({ headless: !args.includes("--headed") });
  const kept = new Map(recordedShots().map((s) => [s.id, s]));
  const shots = [];

  for (const cast of entries) {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: PROBE_HEIGHT },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    page.on("pageerror", (e) => console.error(`[page] ${cast.id}: ${e.message}`));
    // The casts are backend-free by construction. Cut the tRPC calls so a
    // NodeTool server that happens to run on this machine cannot leak its own
    // workspaces into a screenshot that has to reproduce elsewhere. Matched by
    // pathname, not by glob: `/src/trpc/client.ts` is a module, not a call.
    await page.route(
      (url) => url.pathname.startsWith("/trpc/"),
      (route) => route.abort()
    );
    const url = `${BASE}/demo.html?chat=${cast.id}&t=${cast.atMs}&bare=1`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await page.waitForSelector("[data-demo-player]", { timeout: 30000 });
    // Every embedded still decoded, and the thread's scroll settled.
    await page.waitForFunction(
      () => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
      undefined,
      { timeout: 30000 }
    );
    await page.waitForTimeout(900);

    const delta = await page.evaluate(measureHeightDelta, TAIL_PAD);
    if (delta === null) throw new Error(`${cast.id}: no rendered thread to measure`);
    const height = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, PROBE_HEIGHT + delta)
    );
    await page.setViewportSize({ width: WIDTH, height });
    await page.waitForTimeout(500);

    const target = page.locator("[data-demo-player]");
    const file = path.join(OUT, `${cast.id}.webp`);
    const info = await sharp(await target.screenshot())
      .webp({ quality: 88 })
      .toFile(file);
    shots.push({ id: cast.id, width: info.width, height: info.height });
    console.log(`✓ ${path.relative(ROOT, file)} (${WIDTH}×${height})`);
    await page.close();
  }

  await browser.close();

  const taken = new Map(shots.map((s) => [s.id, s]));
  const merged = CASTS.map((c) => taken.get(c.id) ?? kept.get(c.id)).filter(
    Boolean
  );
  fs.writeFileSync(
    MANIFEST,
    "// Generated by web/scripts/screenshot-chat-casts.mjs. Do not edit.\n" +
      "export interface ChatShot {\n  id: string;\n  width: number;\n  height: number;\n}\n\n" +
      `export const CHAT_SHOTS: ChatShot[] = ${JSON.stringify(merged, null, 2)};\n`
  );
  console.log(`✓ ${path.relative(ROOT, MANIFEST)}`);
} catch (error) {
  process.stderr.write(viteLog.join(""));
  throw error;
} finally {
  vite.kill("SIGTERM");
}
