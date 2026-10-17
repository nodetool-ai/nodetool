import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import type { compareParticleOrder, checkSubmittedParticles } from "./fixtures/particle-ordering3d.js";

declare global { interface Window { compareParticleOrder: typeof compareParticleOrder; checkSubmittedParticles: typeof checkSubmittedParticles; } }

it("matches individually sorted WebGL particle draws and counts submitted soft depth work", async () => {
  const bundle = await build({ stdin: { contents: 'import {compareParticleOrder,checkSubmittedParticles} from "./tests/fixtures/particle-ordering3d.ts"; window.compareParticleOrder = compareParticleOrder; window.checkSubmittedParticles = checkSubmittedParticles;',
    resolveDir: resolve("."), sourcefile: "particle-ordering3d.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0];
  if (!script) { throw new Error("Particle renderer bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<title>Particle ordering control</title>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(() => window.compareParticleOrder());
    await writeFile(join(tmpdir(), "particle-ordering3d.json"), JSON.stringify(result, null, 2));
    expect(result.comparisons).toHaveLength(12);
    for (const comparison of result.comparisons) {
      expect(comparison.referenceLitPixels, JSON.stringify(comparison)).toBeGreaterThan(0);
      expect(comparison.differences, JSON.stringify(comparison)).toBe(0);
      expect(comparison.calls).toBe(comparison.mode === "billboards" ? 1 : 3);
    }
    expect(result.soft).toEqual({ calls: 3, triangles: 26 });
    expect(await page.evaluate(() => window.checkSubmittedParticles())).toEqual({ differences: 0, triangles: 4, alphas: [0.5] });
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
