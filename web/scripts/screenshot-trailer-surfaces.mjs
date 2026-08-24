// Captures the storyboard and timeline shots the movie-trailer use-case page uses.
//
//   node scripts/screenshot-trailer-surfaces.mjs [--only storyboard,timeline] [--headed]
//
// Set PLAYWRIGHT_CHROMIUM_PATH to use a Chromium already on the machine.
//
// Both frames come out of the real editor components, not a mockup: the
// storyboard cast drives `StoryboardBoard` and the timeline cast drives the
// timeline editor, replayed at a fixed millisecond through /demo.html. The
// media in both is the SCRAPHEART trailer already shipped on the marketing
// site — the six `trailer-shot-*.png` stills, and segments of
// `movie_trailer_example.mp4` pinned under demo/public/casts/promo.
//
// Backend-free by construction: the casts are authored, tRPC is cut, and the
// stills are inline data URIs, so a re-run reproduces the same frames on any
// machine with no server and no credits spent.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const OUT = path.join(ROOT, "marketing/public");
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

/** The pinned clips the timeline cast resolves, staged where the page looks. */
const PROMO_ASSETS = path.join(ROOT, "demo/public/casts/promo");
const STAGED_ASSETS = path.join(WEB, "public/demo-assets/promo-timeline");

/**
 * `atMs` is the frame. Storyboard: past the last keyframe, so all six cards
 * carry their still. Timeline: after the cut is assembled, so the four takes
 * sit on the video track with the score running under them.
 */
const SHOTS = [
  {
    id: "storyboard",
    url: `${BASE}/demo.html?doc=storyboard-assistant&t=24000&bare=1`,
    file: "trailer-storyboard.webp",
    // Tall enough for all six cards; the board is a vertical list.
    width: 1600,
    height: 1560,
  },
  {
    id: "timeline",
    url: `${BASE}/demo.html?timeline=promo-timeline&t=7500&bare=1&assets=/demo-assets/promo-timeline`,
    file: "trailer-timeline.webp",
    width: 1600,
    height: 1000,
  },
];

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = argValue("--only")?.split(",").map((s) => s.trim());
const entries = SHOTS.filter((s) => !only || only.includes(s.id));

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

fs.rmSync(STAGED_ASSETS, { recursive: true, force: true });
fs.cpSync(PROMO_ASSETS, STAGED_ASSETS, { recursive: true });

// A crashed earlier run can leave its dev server holding the port; without
// this the next run screenshots a stale bundle instead of failing.
spawnSync("pkill", ["-f", `vite --port ${PORT}`]);

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: WEB,
  stdio: ["ignore", "pipe", "pipe"],
});
const viteLog = [];
vite.stderr.on("data", (d) => viteLog.push(String(d)));

try {
  await waitForServer(BASE);
  // A sandbox whose Playwright browsers predate the installed version can
  // point at its own Chromium with PLAYWRIGHT_CHROMIUM_PATH.
  const browser = await chromium.launch({
    headless: !args.includes("--headed"),
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });

  for (const shot of entries) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    page.on("pageerror", (e) => console.error(`[page] ${shot.id}: ${e.message}`));
    // The casts need no backend. Cutting tRPC keeps a NodeTool server that
    // happens to run on this machine out of a frame that has to reproduce.
    await page.route(
      (url) => url.pathname.startsWith("/trpc/"),
      (route) => route.abort()
    );
    await page.goto(shot.url, { waitUntil: "domcontentloaded" });
    console.log(`· ${shot.id}: loaded, waiting for the surface`);
    const ready = await page.waitForSelector("[data-ready]", { timeout: 60000 });
    if ((await ready.getAttribute("data-ready")) === "error") {
      throw new Error(`${shot.id}: ${await page.locator("pre").innerText()}`);
    }
    await page.waitForSelector("[data-demo-player]", { timeout: 30000 });
    // Every still decoded before the capture.
    await page.waitForFunction(
      () => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
      undefined,
      { timeout: 30000 }
    );
    // Pinned clips too, when the surface has any. A clip whose codec this
    // browser refuses is reported rather than fatal: the tracks still render,
    // and the frame says plainly whether the preview came up.
    const unpainted = await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("video")).every((v) => v.readyState >= 2),
        undefined,
        { timeout: 20000 }
      )
      .then(() => 0)
      .catch(async () =>
        page.evaluate(
          () =>
            Array.from(document.querySelectorAll("video")).filter((v) => v.readyState < 2)
              .length
        )
      );
    if (unpainted) {
      console.warn(`! ${shot.id}: ${unpainted} clip(s) never painted`);
    }
    await page.waitForTimeout(1200);

    const file = path.join(OUT, shot.file);
    const info = await sharp(await page.locator("[data-demo-player]").screenshot())
      .webp({ quality: 88 })
      .toFile(file);
    console.log(`✓ ${path.relative(ROOT, file)} (${info.width}×${info.height})`);
    await page.close();
  }

  await browser.close();
} catch (error) {
  process.stderr.write(viteLog.join(""));
  throw error;
} finally {
  vite.kill("SIGTERM");
  fs.rmSync(STAGED_ASSETS, { recursive: true, force: true });
}
