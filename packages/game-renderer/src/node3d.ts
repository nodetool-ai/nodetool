import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { GameCaptureBrowser, GameCaptureChromium } from "./renderer3d/capture-driver-types.js";
import { importOptionalModule, resolvePackageAssetPath } from "@nodetool-ai/config";
import { gameRenderFrame3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { GameModelSource3D } from "./renderer3d/index.js";
import type { GameCapturePageInput3D, GameCapturePageReport3D } from "./renderer3d/capture-page.js";

export class GameRendererUnavailableError3D extends Error {
  readonly code = "renderer_unavailable";
  constructor(message: string, readonly missingFeatures: readonly string[], options?: ErrorOptions) { super(message, options); this.name = "GameRendererUnavailableError3D"; }
}

export interface CaptureGameFrame3DOptions {
  readonly resolveAsset?: (logicalId: string, signal: AbortSignal) => Promise<GameModelSource3D | Uint8Array | null>;
  readonly signal?: AbortSignal;
  readonly interpolation?: number;
  readonly width?: number;
  readonly height?: number;
  readonly stateHash?: string;
  readonly camera?: GameRenderFrame3D["camera"];
  readonly boundsOverlay?: boolean;
  readonly benchmarkFrames?: number;
  readonly timeoutMs?: number;
  readonly executablePath?: string;
}
export interface CapturedGameFrame3D extends GameCapturePageReport3D {
  readonly png: Uint8Array;
  readonly tick: number;
  readonly stateHash: string | null;
}

let captureBundle: Promise<string> | undefined;
async function loadCaptureBundle(): Promise<string> {
  if (!captureBundle) {
    captureBundle = (async () => {
      const source = fileURLToPath(new URL("./renderer3d/capture-page.ts", import.meta.url));
      const compiled = fileURLToPath(new URL("./renderer3d/capture-page.js", import.meta.url));
      if (!existsSync(source) && !existsSync(compiled)) {
        return readFile(resolvePackageAssetPath({ pkg: "@nodetool-ai/game-renderer", path: "game3d-capture-page.js" }, import.meta.url), "utf8");
      }
      const bundle = await build({ entryPoints: [existsSync(source) ? source : compiled], bundle: true,
        format: "iife", platform: "browser", target: "es2022", minify: true, write: false,
        conditions: ["nodetool-dev"], logLevel: "silent" });
      const output = bundle.outputFiles?.[0];
      if (!output) { throw new Error("3D capture bundle is empty"); }
      return output.text;
    })().catch((error) => { captureBundle = undefined; throw error; });
  }
  return captureBundle;
}

/** Captures the actual browser renderer with a closed, pre-resolved asset set. */
export async function captureGameFrame3D(value: GameRenderFrame3D, options: CaptureGameFrame3DOptions = {}): Promise<CapturedGameFrame3D> {
  const frame = gameRenderFrame3D.parse(value);
  const width = options.width ?? Math.round(frame.presentation.hudWidth);
  const height = options.height ?? Math.round(width / frame.presentation.aspectRatio);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) { throw new Error("3D capture dimensions must be integers between 1 and 4096"); }
  if (options.benchmarkFrames !== undefined && (!Number.isInteger(options.benchmarkFrames) || options.benchmarkFrames < 1 || options.benchmarkFrames > 10_000)) { throw new Error("Benchmark frames must be an integer between 1 and 10000"); }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) { throw new Error("3D capture timeout must be between 1 and 120000 milliseconds"); }
  const controller = new AbortController();
  const abort = (): void => controller.abort(options.signal?.reason);
  options.signal?.throwIfAborted();
  options.signal?.addEventListener("abort", abort, { once: true });
  let browser: GameCaptureBrowser | undefined;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = (): void => {
    rejectAbort?.(controller.signal.reason);
    void browser?.close();
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`3D capture timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const capture = async (): Promise<CapturedGameFrame3D> => {
      const bundle = await loadCaptureBundle();
      const assets: Record<string, { readonly base64: string; readonly digest?: string }> = {};
      let totalBytes = 0;
      for (const logicalId of new Set([...frame.entities.flatMap((entity) => entity.model ? [entity.model.assetId] : []), ...Object.keys(frame.fonts ?? {})])) {
        controller.signal.throwIfAborted();
        const source = await options.resolveAsset?.(logicalId, controller.signal);
        if (!source) {
          if (frame.fonts?.[logicalId]?.required === false) { continue; }
          throw new Error(`Missing capture asset ${logicalId}`);
        }
        const bytes = source instanceof Uint8Array ? source : source.bytes;
        totalBytes += bytes.length;
        if (bytes.length > 64 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) { throw new Error("3D capture model byte budget exceeded"); }
        const stagedAsset: { base64: string; digest?: string } = { base64: Buffer.from(bytes).toString("base64") };
        if (!(source instanceof Uint8Array) && source.digest !== undefined) { stagedAsset.digest = source.digest; }
        assets[logicalId] = stagedAsset;
      }
      controller.signal.throwIfAborted();
      // The installed SDK bridge is checked against this interface in playwright-contract.ts.
      // The desktop app installs Playwright through the Package Manager, so it can live in the optional-node root.
      let playwright: { readonly chromium: GameCaptureChromium };
      try { playwright = await importOptionalModule<{ readonly chromium: GameCaptureChromium }>("playwright", { commonJs: true }); }
      catch (error) { throw new GameRendererUnavailableError3D("3D capture requires the locally installed Playwright browser runtime", ["playwright"], { cause: error }); }
      const launchOptions: Parameters<GameCaptureChromium["launch"]>[0] = { headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
      if (options.executablePath) { launchOptions.executablePath = options.executablePath; }
      browser = await playwright.chromium.launch(launchOptions);
      if (controller.signal.aborted) { await browser.close(); controller.signal.throwIfAborted(); }
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (url === "http://127.0.0.1/") {
          await route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; connect-src blob:; img-src blob:; style-src \'unsafe-inline\'"></head><body style="margin:0"><canvas></canvas><script src="/capture.js"></script></body></html>' });
        } else if (url === "http://127.0.0.1/capture.js") {
          await route.fulfill({ status: 200, contentType: "text/javascript", body: bundle });
        } else { await route.abort("blockedbyclient"); }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.goto("http://127.0.0.1/");
      const input: { -readonly [Key in keyof GameCapturePageInput3D]: GameCapturePageInput3D[Key] } = { frame, interpolation: options.interpolation ?? 1, width, height, assets };
      if (options.camera) { input.camera = options.camera; }
      if (options.benchmarkFrames) { input.benchmarkFrames = options.benchmarkFrames; }
      if (options.boundsOverlay) { input.boundsOverlay = true; }
      const report = await page.evaluate(async (request) => window.captureNativeGame3D(request), input);
      const png = await page.locator("canvas").screenshot({ type: "png" });
      return { ...report, png: new Uint8Array(png), tick: frame.tick, stateHash: options.stateHash ?? null };
    };
    return await Promise.race([capture(), cancelled]);
  } catch (error) {
    if (controller.signal.aborted) { controller.signal.throwIfAborted(); }
    if (error instanceof Error && (/Executable doesn't exist|Failed to launch|error while loading shared libraries|Missing X server/i.test(error.message))) {
      throw new GameRendererUnavailableError3D("3D capture requires a locally installed Chromium with WebGL2 support", ["chromium"], { cause: error });
    }
    if (error instanceof Error && /3D play requires WebGL2|WebGL2 render probe failed/.test(error.message)) {
      throw new GameRendererUnavailableError3D("3D capture requires WebGL2 support", ["webgl2"], { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
    await browser?.close();
  }
}
