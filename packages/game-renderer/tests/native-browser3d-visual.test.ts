import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { createNativeVisual3DData } from "./fixtures/nativeVisual3DData.js";

it("draws admitted native PBR, environment, shadows and resolved particles with stable GPU resources", async () => {
  const fixture = await createNativeVisual3DData();
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      contents: `import {runNativeVisual3D} from "./tests/fixtures/nativeVisual3DHarness.ts";window.runNativeVisual3D=()=>runNativeVisual3D(${JSON.stringify(fixture)});`
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
    conditions: ["nodetool-dev"]
  });
  const output = bundle.outputFiles?.[0];
  if (!output) {
    throw new Error("Missing native visual feature bundle");
  }
  expect(output.text).not.toContain("class ParticleSimulator");
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 256, height: 192 },
      deviceScaleFactor: 1
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.route("**/*", (route) =>
      route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><body style=margin:0>"
          })
        : route.abort()
    );
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: output.text });
    const result = await page
      .evaluate(() => Reflect.get(window, "runNativeVisual3D")())
      .catch((error) => {
        throw new Error(
          `${String(error)} Browser diagnostics: ${errors.join(" | ")}`
        );
      });
    const artifacts = await mkdtemp(join(tmpdir(), "native-visual3d-"));
    for (const [name, png] of Object.entries(result.pngs)) {
      if (typeof png !== "string") {
        throw new Error("Invalid native visual capture");
      }
      await writeFile(
        join(artifacts, `${name}.png`),
        Buffer.from(png.split(",")[1], "base64")
      );
    }
    const fixtureRoot = join(artifacts, "native-fixture");
    await mkdir(fixtureRoot);
    const document = nativeGame3dDocument.parse(fixture.document);
    for (const [id, bytes] of Object.entries(fixture.bytes)) {
      await writeFile(join(fixtureRoot, `${id}.glb`), new Uint8Array(bytes));
    }
    await writeFile(
      join(fixtureRoot, "game.json"),
      JSON.stringify(document, null, 2)
    );
    for (const scene of document.scenes) {
      await writeFile(
        join(fixtureRoot, `${scene.id}.json`),
        JSON.stringify(
          { ...document, initialSceneId: scene.id, scenes: [scene] },
          null,
          2
        )
      );
    }
    await writeFile(
      join(artifacts, "report.json"),
      JSON.stringify(
        { ...result, pngs: undefined, fixture: undefined },
        null,
        2
      )
    );
    expect(errors).toEqual([]);
    for (const [feature, changed] of Object.entries(result.differences)) {
      expect(
        changed,
        `${feature} changed too few pixels; ${artifacts}`
      ).toBeGreaterThan(0.001);
    }
    expect(result.glError).toBe(0);
    expect(result.after.modelImageReferences).toBe(14);
    expect(result.after.decodedModelImages).toBe(2);
    expect(result.after.decodedModelImageBytes).toBe(128);
    expect(result.after.modelTextureVariants).toBe(2);
    expect(result.after.uploadedModelTextureVariants).toBe(2);
    expect(result.overlapDepthDifference).toBeGreaterThan(0.0015);
    expect(result.after.skyBuilds).toBe(result.before.skyBuilds);
    expect(result.after.programs).toBe(result.before.programs);
    expect(result.after.textures).toBe(result.before.textures);
    expect(result.after.geometries).toBe(result.before.geometries);
    expect(result.particlesDifference).toBeGreaterThan(0.001);
    expect(result.particleAfter.particles).toBe(3);
    expect(result.repeated).toBe(0);
    expect(
      result.particleAfter.softDepthPasses -
        result.particleBefore.softDepthPasses
    ).toBe(120);
    expect(result.particleAfter.programs).toBe(result.particleBefore.programs);
    expect(result.particleAfter.textures).toBe(result.particleBefore.textures);
    expect(result.particleAfter.geometries).toBe(
      result.particleBefore.geometries
    );
    console.info(`Native visual feature artifacts: ${artifacts}`);
  } finally {
    await browser.close();
  }
}, 120000);
