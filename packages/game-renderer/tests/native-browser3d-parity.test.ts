import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { native3DConformanceFixture } from "./fixtures/nativeBrowser3DConformance.js";
const execute = promisify(execFile);
const player = process.env.NODETOOL_NATIVE_GAME_PLAYER;
async function readPixels(path: string): Promise<Uint8ClampedArray> {
  const image = await loadImage(path),
    canvas = createCanvas(image.width, image.height),
    context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

it.skipIf(!player)(
  "compares installed Qt and browser native3D materials, hierarchy, skinning, animation and shadows",
  async () => {
    if (!player) {
      throw new Error("NODETOOL_NATIVE_GAME_PLAYER is required");
    }
    const root = await mkdtemp(join(tmpdir(), "a84-3d-parity-"));
    const fixture = native3DConformanceFixture();
    const document = nativeGame3dDocument.parse(fixture.document);
    document.assets = [
      {
        id: "model",
        kind: "model",
        digest: createHash("sha256").update(fixture.bytes).digest("hex"),
        path: "model.glb",
        size: fixture.bytes.length,
        dependencies: []
      }
    ];
    await writeFile(`${root}/model.glb`, fixture.bytes);
    await writeFile(`${root}/game.json`, JSON.stringify(document));
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        contents: `
    import {createNativeRenderer3D} from "./src/native-cpp/renderer3d.ts";
    import {nativeFrame3D} from "@nodetool-ai/protocol/native-game";
    import {createNativeAssetBroker} from "./src/native-cpp/assets.ts";
    const document=${JSON.stringify(document)},model=${JSON.stringify(fixture.prepared)};
    window.captureNativeParity=async()=>{const canvas=window.document.createElement("canvas");window.document.body.append(canvas);const bytes=new Uint8Array(${JSON.stringify(Array.from(fixture.bytes))});const assets=createNativeAssetBroker({assets:document.assets,fetchBytes:async()=>bytes});await assets.get("model");const owner=await createNativeRenderer3D({canvas,assets,prepareModel:async()=>model});owner.resize(192,128);
    const base={dimension:"3d",generation:0,sceneId:"scene",events:[],presentationEvents:[],hostRequests:[],queryResults:[],music:[],score:0,health:100,logs:[],hud:[],lighting:{},backgrounds:[],camera:document.camera,entities:document.scenes[0].entities};const captures=[];for(const tick of [0,30]){const frame=nativeFrame3D.parse({...base,tick});owner.render(frame);owner.render(frame);captures.push(canvas.toDataURL())}owner.render(nativeFrame3D.parse({...base,tick:0,entities:base.entities.filter(entity=>entity.id==="floor")}));captures.push(canvas.toDataURL());owner.dispose();return captures;};
  `
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      write: false,
      conditions: ["nodetool-dev"]
    });
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) =>
        route.request().url() === "http://127.0.0.1/"
          ? route.fulfill({
              contentType: "text/html",
              body: "<!doctype html><body>"
            })
          : route.abort()
      );
      await page.goto("http://127.0.0.1/");
      const output = bundle.outputFiles?.[0];
      if (!output) {
        throw new Error("Missing native3D parity browser bundle");
      }
      await page.addScriptTag({ content: output.text });
      const captures: string[] = await page.evaluate(() =>
        Reflect.get(window, "captureNativeParity")()
      );
      const report = [];
      for (const [index, tick] of [0, 30].entries()) {
        await writeFile(
          `${root}/browser-${tick}.png`,
          Buffer.from(captures[index].split(",")[1], "base64")
        );
        const args = [
          `${root}/game.json`,
          "--assets-dir",
          root,
          "--capture",
          `${root}/native-${tick}.png`,
          "--tick",
          String(tick),
          "--width",
          "192",
          "--height",
          "128"
        ];
        const result = await execute(player, args, {
          env: {
            ...process.env,
            QSG_RHI_BACKEND: "vulkan",
            TMPDIR: tmpdir()
          },
          timeout: 60000
        });
        await writeFile(
          `${root}/native-${tick}.log`,
          result.stdout + result.stderr
        );
        const native = await readPixels(`${root}/native-${tick}.png`),
          web = await readPixels(`${root}/browser-${tick}.png`);
        let error = 0,
          changed = 0;
        for (let i = 0; i < native.length; i += 4) {
          let max = 0;
          for (let channel = 0; channel < 3; channel++) {
            const delta = Math.abs(native[i + channel] - web[i + channel]);
            error += delta;
            max = Math.max(max, delta);
          }
          if (max > 16) {
            changed++;
          }
        }
        let texturedError = 0,
          texturedPixels = 0;
        const textured = (offset: number): boolean =>
          native[offset] > 20 &&
          native[offset + 2] > 20 &&
          native[offset + 1] < 5;
        for (let y = 1; y < 127; y++) {
          for (let x = 1; x < 191; x++) {
            const offset = (y * 192 + x) * 4;
            if (
              textured(offset) &&
              textured(offset - 4) &&
              textured(offset + 4) &&
              textured(offset - 192 * 4) &&
              textured(offset + 192 * 4)
            ) {
              texturedPixels++;
              for (let channel = 0; channel < 3; channel++) {
                texturedError += Math.abs(
                  native[offset + channel] - web[offset + channel]
                );
              }
            }
          }
        }
        expect(texturedPixels).toBeGreaterThan(10);
        expect(texturedError / texturedPixels / 3).toBeLessThanOrEqual(5);
        const metrics = {
          tick,
          texturedInteriorMeanError: texturedError / texturedPixels / 3,
          meanChannelError: error / (native.length / 4) / 3,
          changedPixelFraction: changed / (native.length / 4)
        };
        report.push(metrics);
        expect(metrics.meanChannelError).toBeLessThanOrEqual(1);
        expect(metrics.changedPixelFraction).toBeLessThanOrEqual(0.02);
      }
      expect(captures[0]).not.toEqual(captures[1]);
      const floorOnly = {
        ...document,
        scenes: document.scenes.map((scene) => ({
          ...scene,
          entities: scene.entities.filter((entity) => entity.id === "floor")
        }))
      };
      await writeFile(`${root}/floor.json`, JSON.stringify(floorOnly));
      await execute(
        player,
        [
          `${root}/floor.json`,
          "--assets-dir",
          root,
          "--capture",
          `${root}/native-floor.png`,
          "--width",
          "192",
          "--height",
          "128"
        ],
        {
          env: {
            ...process.env,
            QSG_RHI_BACKEND: "vulkan",
            TMPDIR: tmpdir()
          },
          timeout: 60000
        }
      );
      await writeFile(
        `${root}/browser-floor.png`,
        Buffer.from(captures[2].split(",")[1], "base64")
      );
      for (const target of ["native", "browser"]) {
        const full = await readPixels(`${root}/${target}-0.png`),
          floor = await readPixels(`${root}/${target}-floor.png`);
        let shadowPixels = 0;
        for (let index = 0; index < floor.length; index += 4) {
          if (
            floor[index] > 100 &&
            full[index] < floor[index] * 0.8 &&
            Math.abs(full[index] - full[index + 2]) < 3
          ) {
            shadowPixels++;
          }
        }
        expect(shadowPixels).toBeGreaterThan(3);
      }
      await writeFile(
        `${root}/comparison.json`,
        JSON.stringify(
          {
            tolerances: {
              texturedInteriorMeanError: 5,
              meanChannelError: 1,
              channelDelta: 16,
              changedPixelFraction: 0.02
            },
            report
          },
          null,
          2
        )
      );
      console.info(
        `Native3D Qt/browser conformance: ${root} ${JSON.stringify(report)}`
      );
    } finally {
      await browser.close();
    }
  },
  120000
);
