import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")(
  "native WASM browser 2D GPU pixels",
  () => {
    let browser: Browser;
    let script: string;
    let moduleBytes: Buffer;
    let wasmBytes: Buffer;
    beforeAll(async () => {
      const directory =
        process.env.NATIVE_GAME_BROWSER_BUILD ?? resolve("dist");
      [moduleBytes, wasmBytes] = await Promise.all([
        readFile(resolve(directory, "native-game.mjs")),
        readFile(resolve(directory, "native-game.wasm"))
      ]);
      const bundle = await build({
        stdin: {
          contents:
            'import {nativePixels} from "./tests/fixtures/native2dBrowserHarness.ts";window.nativePixels=nativePixels;',
          resolveDir: resolve("."),
          sourcefile: "native2d.ts"
        },
        bundle: true,
        platform: "browser",
        format: "iife",
        write: false,
        conditions: ["nodetool-dev"]
      });
      const output = bundle.outputFiles?.[0];
      if (!output) {
        throw new Error("Missing native2D bundle");
      }
      script = output.text;
      browser = await chromium.launch({
        headless: true,
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      });
    });
    afterAll(async () => {
      await browser?.close();
    });
    it("renders committed animation, restores same-session pixels, resizes and rebuilds a lost GPU context", async () => {
      const page = await browser.newPage({
        viewport: { width: 64, height: 64 },
        deviceScaleFactor: 1
      });
      try {
        page.on("console", (msg) => console.info(msg.text()));
        page.on("pageerror", (error) => console.error(error.message));
        await page.route("**/*", (route) => {
          const path = new URL(route.request().url()).pathname;
          return path === "/native-game.mjs"
            ? route.fulfill({
                contentType: "text/javascript",
                body: moduleBytes
              })
            : path === "/native-game.wasm"
              ? route.fulfill({
                  contentType: "application/wasm",
                  body: wasmBytes
                })
              : path === "/"
                ? route.fulfill({
                    contentType: "text/html",
                    body: "<!doctype html><body></body>"
                  })
                : route.abort();
        });
        await page.goto("http://127.0.0.1/");
        await page.addScriptTag({ content: script });
        await page.addScriptTag({
          type: "module",
          content:
            'import factory from "http://127.0.0.1/native-game.mjs"; window.nativePixelsResult = window.nativePixels(factory);'
        });
        await page.waitForFunction(() => !!window.nativePixelsResult);
        const result = await page.evaluate(() => window.nativePixelsResult);
        const center = (pixels: number[]): number[] =>
          pixels.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4);
        expect(center(result.initial)).toEqual([255, 0, 0, 255]);
        expect(center(result.animated)).toEqual([0, 0, 255, 255]);
        expect(result.restored).toEqual(result.initial);
        expect(result.resized).toEqual(result.initial);
        expect(result.lostRestored).toEqual(result.initial);
        expect(result.textureGrowth).toBe(0);
        expect(result.liveTexturesAfterDispose).toBe(0);
        expect(result.completion.defaultCalls).toBe(0);
        expect(result.completion.explicitCalls).toBe(1);
        expect(result.completion.lostError).toContain("context lost");
        expect(result.completion.disposedError).toContain("disposed");
        const pixel = (name: string, x: number, y: number): number[] => {
          const pixels = result.cases[name];
          if (!pixels) {
            throw new Error(`Missing native case ${name}`);
          }
          const offset =
            (Math.floor((y + 4) * 8) * 64 + Math.floor((x + 4) * 8)) * 4;
          return pixels.slice(offset, offset + 4);
        };
        expect(pixel("ties", 0, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel("facing", -1, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel("zoom", 1.5, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("aspect", 0, 2)).toEqual([255, 0, 0, 255]);
        expect(pixel("flip", -1, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel("flip", 1, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("rotation", 0, -1)).toEqual([255, 0, 0, 255]);
        expect(pixel("rotation", 0, 1)).toEqual([0, 0, 255, 255]);
        for (const name of ["trim", "pivot"]) {
          expect(pixel(name, -2, 0)).toEqual([18, 22, 30, 255]);
          expect(pixel(name, 1, 0)).toEqual([255, 0, 0, 255]);
          expect(pixel(name, 3, 0)).toEqual([0, 0, 255, 255]);
        }
        expect(pixel("alpha", 0, 0)).toEqual([128, 0, 128, 255]);
        expect(pixel("tintAlpha", 0, 0)).toEqual([128, 0, 127, 255]);
        expect(pixel("alphaTexture", 0, 0)[0]).toBeLessThan(12);
        expect(pixel("alphaTexture", 0, 0)[1]).toBeGreaterThan(100);
        expect(pixel("alphaTexture", 0, 0)[2]).toBeLessThan(20);
        expect(pixel("additive", 0, 0)).toEqual([128, 0, 255, 255]);
        expect(pixel("ambient", 0, 0)).toEqual([128, 0, 0, 255]);
        expect(pixel("unlit", 0, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("point", 0, 0)[0]).toBeGreaterThan(240);
        expect(pixel("tile", 2, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("tile", -2, 0)).toEqual([18, 22, 30, 255]);
        expect(pixel("nearest", 0, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel("linear", 0, 0)[0]).toBeGreaterThan(0);
        expect(pixel("linear", 0, 0)[2]).toBeLessThan(255);
        expect(pixel("background", -3, 0)).not.toEqual([18, 22, 30, 255]);
        expect(pixel("background", 0, 3)).toEqual([18, 22, 30, 255]);
        expect(pixel("mirror", 0, 3)).not.toEqual([18, 22, 30, 255]);
        expect(pixel("scrolling", -2, 0)).toEqual([18, 22, 30, 255]);
        expect(pixel("scrolling", 1.5, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("parallax", -0.5, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel("parent", 1, 2)).toEqual([255, 0, 0, 255]);
        const nativePlayer = process.env.NATIVE_GAME_PIXEL_PLAYER;
        if (nativePlayer) {
          const directory = process.env.TMPDIR;
          if (!directory) {
            throw new Error("Native parity requires TMPDIR for artifacts");
          }
          const parityDirectory = resolve(directory, "native-browser2d-parity");
          await mkdir(parityDirectory, { recursive: true });
          await writeFile(
            resolve(parityDirectory, "atlas.png"),
            new Uint8Array(result.assetBytes)
          );
          await writeFile(
            resolve(parityDirectory, "alpha.png"),
            new Uint8Array(result.alphaBytes)
          );
          for (const [name, document] of Object.entries(result.documents)) {
            const path = resolve(parityDirectory, `${name}.json`),
              png = resolve(parityDirectory, `${name}-native.png`);
            await writeFile(path, JSON.stringify(document));
            await promisify(execFile)(
              "xvfb-run",
              [
                "-a",
                nativePlayer,
                path,
                "--capture",
                png,
                "--width",
                "64",
                "--height",
                "64",
                "--tick",
                String(result.ticks[name] ?? 0),
                "--assets-dir",
                parityDirectory
              ],
              {
                env: { ...process.env, QSG_RHI_BACKEND: "vulkan" },
                timeout: 20000
              }
            );
            const canvas = createCanvas(64, 64),
              ctx = canvas.getContext("2d");
            ctx.drawImage(await loadImage(png), 0, 0);
            const native = ctx.getImageData(0, 0, 64, 64).data,
              browser = result.cases[name];
            if (!browser) {
              throw new Error(`Missing browser parity case ${name}`);
            }
            let differentPixels = 0;
            for (let y = 0; y < 64; y++) {
              for (let x = 0; x < 64; x++) {
                const nativeOffset = (y * 64 + x) * 4,
                  browserOffset = ((63 - y) * 64 + x) * 4;
                if (
                  [0, 1, 2].some(
                    (channel) =>
                      Math.abs(
                        (native[nativeOffset + channel] ?? 0) -
                          (browser[browserOffset + channel] ?? 0)
                      ) > 3
                  )
                ) {
                  differentPixels++;
                }
              }
            }
            // Up to one percent of edge pixels can differ between Vulkan and WebGL rasterization.
            expect(
              differentPixels,
              `${name}: native/browser pixels beyond RGB tolerance 3`
            ).toBeLessThanOrEqual(40);
          }
        }
        expect(result.order["z-authored-first"]).toBeLessThan(
          result.order["a-authored-last"]!
        );
      } finally {
        await page.close();
      }
    }, 120000);
  }
);

declare global {
  interface Window {
    nativePixelsResult: ReturnType<
      typeof import("./fixtures/native2dBrowserHarness.js").nativePixels
    >;
    nativePixels: typeof import("./fixtures/native2dBrowserHarness.js").nativePixels;
  }
}
