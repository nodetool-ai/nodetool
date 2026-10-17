import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import type { compareParticleSceneOrder } from "./fixtures/particle-scene-order3d.js";

declare global { interface Window { compareParticleSceneOrder: typeof compareParticleSceneOrder; } }

it("matches individually depth-sorted particles and real transparent scene materials", async () => {
  const bundle = await build({ stdin: { contents: 'import {compareParticleSceneOrder} from "./tests/fixtures/particle-scene-order3d.ts"; window.compareParticleSceneOrder = compareParticleSceneOrder;',
    resolveDir: resolve("."), sourcefile: "particle-scene-order3d.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Particle scene ordering bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<title>Particle and scene transparency control</title>" }) : route.abort());
    await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(() => window.compareParticleSceneOrder());
    await writeFile(join(tmpdir(), "particle-scene-order3d.json"), JSON.stringify(result, null, 2));
    expect(result.cases).toHaveLength(16);
    for (const entry of result.cases) {
      expect(entry.lit, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(entry.depthWrite, JSON.stringify(entry)).toEqual([entry.kind === "primitive"]);
      expect(entry.differences, JSON.stringify(entry)).toBe(0);
      // Three draws the ordinary double-sided transparent plane in two passes.
      expect(entry.calls, JSON.stringify(entry)).toBe(entry.mode === "mixed" ? 5 : 4);
    }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
