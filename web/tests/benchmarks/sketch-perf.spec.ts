/**
 * Sketch editor performance benchmark.
 *
 * Loads perf-sketch.html (the production SketchEditor on a synthetic
 * 2048×2048, many-layer document, no backend), drives real input through
 * Playwright, and reports per scenario:
 *
 *  - frame intervals while the scenario runs
 *  - display composites: count and time per composite
 *  - React commits and render time, with the components that rendered most
 *  - main-thread script time from the CDP Performance domain
 *
 * Plus a direct compositor benchmark without React or input.
 *
 * Run: npx playwright test -c playwright.sketch-benchmark.config.ts
 * SKETCH_PERF_OUT=<file.json> writes the report to a file.
 */
import { writeFileSync } from "node:fs";
import { test, type CDPSession, type Page } from "@playwright/test";

const STROKE_MOVES = 120;
const PAN_MOVES = 90;
const ZOOM_STEPS = 40;

type Report = Record<string, unknown>;

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  );
}

async function scriptMs(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const script = metrics.find((m) => m.name === "ScriptDuration")?.value ?? 0;
  return script * 1000;
}

async function runScenario(
  page: Page,
  cdp: CDPSession,
  drive: () => Promise<void>
): Promise<Report> {
  await page.evaluate(() => window.__sketchPerf!.startCapture());
  const scriptBefore = await scriptMs(cdp);
  await drive();
  const result = await page.evaluate(() => window.__sketchPerf!.stopCapture());
  const scriptAfter = await scriptMs(cdp);
  return { ...result, mainThreadScriptMs: Math.round(scriptAfter - scriptBefore) };
}

test("sketch editor perf", async ({ page }) => {
  test.setTimeout(300_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  await page.goto("/perf-sketch.html");
  await page.waitForFunction(() => window.__sketchPerf !== undefined);
  const mounted = await page.evaluate(() =>
    window.__sketchPerf!.mount({ width: 2048, height: 2048, layers: 12 })
  );

  const canvas = page.locator(".sketch-editor__canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("sketch canvas is not visible");
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const report: Report = { layers: mounted.layers };

  // Brush stroke: one pointer move per frame along a wave.
  await page.evaluate(() => window.__sketchPerf!.setTool("brush"));
  await nextFrame(page);
  report.brushStroke = await runScenario(page, cdp, async () => {
    await page.mouse.move(cx - 200, cy);
    await page.mouse.down();
    for (let i = 0; i < STROKE_MOVES; i++) {
      const t = i / STROKE_MOVES;
      await page.mouse.move(cx - 200 + t * 400, cy + Math.sin(t * Math.PI * 4) * 120);
      await nextFrame(page);
    }
    await page.mouse.up();
  });

  // Pan: middle-button drag.
  report.pan = await runScenario(page, cdp, async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "middle" });
    for (let i = 0; i < PAN_MOVES; i++) {
      await page.mouse.move(cx + Math.sin(i / 10) * 150, cy + i);
      await nextFrame(page);
    }
    await page.mouse.up({ button: "middle" });
  });

  // Zoom: Ctrl+wheel in, then out.
  report.zoom = await runScenario(page, cdp, async () => {
    await page.mouse.move(cx, cy);
    await page.keyboard.down("Control");
    for (let i = 0; i < ZOOM_STEPS; i++) {
      await page.mouse.wheel(0, i < ZOOM_STEPS / 2 ? -20 : 20);
      await nextFrame(page);
    }
    await page.keyboard.up("Control");
  });

  report.compositor = await page.evaluate(() =>
    window.__sketchPerf!.compositorBench({ width: 2048, height: 2048, layers: 12, iterations: 30 })
  );

  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.SKETCH_PERF_OUT) {
    writeFileSync(process.env.SKETCH_PERF_OUT, json);
  }
});
