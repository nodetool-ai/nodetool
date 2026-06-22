// Generate Open Graph images by screenshotting each marketing route at the
// standard 1200×630 OG size. Output PNGs land in `public/og/<name>.png`.
//
// Why screenshots instead of the programmatic next/og cards in
// `src/app/**/opengraph-image.tsx`: a real render of the page (hero, product
// canvas, real type) is a stronger social/Google card than a text-only card.
// These files do NOT auto-replace the route handlers — wire them in via each
// route's `openGraph.images` if you want them to take over (see the README at
// the bottom of this file / the PR description).
//
// Usage:
//   npm run og:screenshots                 # build, start prod server, capture all
//   OG_BASE_URL=http://localhost:3001 node scripts/generate-og-screenshots.mjs
//                                          # reuse an already-running server (e.g. `next dev`)
//   OG_ROUTES=/,/pricing node scripts/generate-og-screenshots.mjs
//                                          # capture only specific routes
//
// Env:
//   OG_BASE_URL   Reuse this server instead of spawning one (skips `next start`).
//   OG_PORT       Port to spawn `next start` on (default 3210).
//   OG_ROUTES     Comma-separated route subset (default: all routes below).
//   OG_SCALE      deviceScaleFactor for the screenshot (default 1 → exactly 1200×630).

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(MARKETING_ROOT, "public", "og");

// The routes worth a distinct social card — mirrors the sitemap's indexable set
// (legal pages are intentionally excluded; they don't need a custom card).
const ALL_ROUTES = [
  "/",
  "/studio",
  "/cloud",
  "/agents",
  "/creatives",
  "/developers",
  "/pricing",
  "/vs/comfyui",
  "/vs/weavy",
  "/use-cases/product-video",
  "/use-cases/movie-poster",
];

/** "/" → "home", "/vs/comfyui" → "vs-comfyui". */
function routeToFileName(route) {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  return (trimmed === "" ? "home" : trimmed.replace(/\//g, "-")) + ".png";
}

function waitForServer(baseUrl, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  return (async function poll() {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(baseUrl, { method: "HEAD" });
        if (res.ok || res.status < 500) return;
      } catch {
        // server not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Server at ${baseUrl} did not become reachable in ${timeoutMs}ms`);
  })();
}

async function main() {
  const routes = (process.env.OG_ROUTES?.split(",").map((r) => r.trim()).filter(Boolean)) ?? ALL_ROUTES;
  const scale = Number(process.env.OG_SCALE ?? "1");
  const port = process.env.OG_PORT ?? "3210";

  const reuseUrl = process.env.OG_BASE_URL;
  const baseUrl = (reuseUrl ?? `http://localhost:${port}`).replace(/\/+$/, "");

  await mkdir(OUT_DIR, { recursive: true });

  let server;
  if (!reuseUrl) {
    console.log(`▶ starting \`next start -p ${port}\` (set OG_BASE_URL to reuse a running server)`);
    server = spawn("npx", ["next", "start", "-p", port], {
      cwd: MARKETING_ROOT,
      stdio: ["ignore", "inherit", "inherit"],
    });
    server.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(
          `\n✖ \`next start\` exited with code ${code}. Run \`npm run build\` first, or pass OG_BASE_URL.`
        );
      }
    });
  } else {
    console.log(`▶ reusing server at ${baseUrl}`);
  }

  const browser = await chromium.launch();
  try {
    await waitForServer(baseUrl);

    const context = await browser.newContext({
      viewport: { width: OG_WIDTH, height: OG_HEIGHT },
      deviceScaleFactor: Number.isFinite(scale) && scale > 0 ? scale : 1,
      // Freeze the reveal/fly-in animations: page.tsx skips its IntersectionObserver
      // reveals and framer-motion loops entirely when reduced motion is requested,
      // so sections render at full opacity immediately.
      reducedMotion: "reduce",
    });

    const page = await context.newPage();

    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      const fileName = routeToFileName(route);
      const outPath = path.join(OUT_DIR, fileName);

      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      // Kill CSS transitions/animations so nothing is mid-flight at capture, and
      // force the scroll-reveal sections (.fly-in) to their visible state — under
      // emulated reduced motion some pages add the hidden class but never fire the
      // IntersectionObserver that reveals it, leaving whole sections at opacity:0.
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}" +
          ".fly-in{opacity:1!important;transform:none!important;}",
      });
      // Wait for fonts and every in-viewport image to actually paint.
      await page.evaluate(() => document.fonts.ready);
      await page
        .waitForFunction(
          () =>
            Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
          undefined,
          { timeout: 15_000 }
        )
        .catch(() => {});
      // framer-motion fade-ins (e.g. the hero) run on rAF and ignore the
      // reduced-motion media query, so a CSS reset can't stop them — give the
      // longest one (~0.85s) time to settle to its final opacity/transform.
      await page.waitForTimeout(1200);

      await page.screenshot({
        path: outPath,
        clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
      });
      console.log(`✓ ${route}  →  public/og/${fileName}`);
    }
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }

  console.log(`\nDone. ${routes.length} image(s) written to public/og/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
