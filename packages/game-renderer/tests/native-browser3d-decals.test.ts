import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("draws native projected decal pixels with correct UVs, depth bias, cache and nonfatal diagnostics", async () => {
  const bundle = await build({
    stdin: {
      contents:
        'import {nativeDecalPixels} from "./tests/fixtures/nativeDecalsBrowserHarness.ts";window.nativeDecalPixels=nativeDecalPixels;',
      resolveDir: resolve("."),
      sourcefile: "native-decal.ts"
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
    conditions: ["nodetool-dev"]
  });
  const output = bundle.outputFiles?.[0];
  if (!output) {
    throw new Error("Native decal browser fixture bundle missing");
  }
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 64, height: 64 },
      deviceScaleFactor: 1
    });
    await page.route("**/*", (route) =>
      route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><body></body>"
          })
        : route.abort()
    );
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: output.text });
    const result = await page.evaluate(() => window.nativeDecalPixels());
    const artifactDirectory = process.env.NATIVE_GAME_DECAL_ARTIFACT_DIR;
    if (artifactDirectory) {
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        resolve(artifactDirectory, "browser-probe.png"),
        Buffer.from(result.png.slice(result.png.indexOf(",") + 1), "base64")
      );
      const enhanced = await page.evaluate(() =>
        window.nativeDecalPixels(true)
      );
      await writeFile(
        resolve(artifactDirectory, "browser-probe-agx.png"),
        Buffer.from(enhanced.png.slice(enhanced.png.indexOf(",") + 1), "base64")
      );
      await writeFile(
        resolve(artifactDirectory, "mark.png"),
        new Uint8Array(enhanced.assetBytes)
      );
    }
    expect(result.top[0]).toBeGreaterThan(240);
    expect(result.top[2]).toBeLessThan(20);
    expect(result.bottom[2]).toBeGreaterThan(240);
    expect(result.bottom[0]).toBeLessThan(20);
    expect(result.outside[0]).toBeLessThan(80);
    expect(result.steadyBuilds).toBe(0);
    expect(result.aggregate).toEqual({
      unsplit: true,
      split: true,
      checks: 2,
      boundsUntouched: true
    });
    expect(result.afterDespawn).toBe(0);
    expect(result.afterBadFrame).toBe(0);
    expect(result.liveGeometries).toBe(1);
    expect(result.diagnostics).toHaveLength(2);
    expect(
      result.diagnostics.some((message) =>
        message.includes("aggregate receiver triangle cap")
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((message) =>
        message.includes("Receiver unavailable")
      )
    ).toBe(true);
  } finally {
    await browser.close();
  }
});
declare global {
  interface Window {
    nativeDecalPixels: typeof import("./fixtures/nativeDecalsBrowserHarness.js").nativeDecalPixels;
  }
}
