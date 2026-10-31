import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { tmpdir, cpus, platform, release, arch } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createNativeCppCourse, createNativeCpp2dCourse, exportNativeCppGame } from "@nodetool-ai/game-runtime/native";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { expect, it } from "vitest";

declare global { interface Window { nativeExportMeasuredInputs: unknown[] } }

const invalidBase = { schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "invalid-export", title: "Invalid export", initialSceneId: "scene", scenes: [{ id: "scene", entities: [] }] };
const invalidDocuments = [
  { name: "QuickJS syntax", document: nativeGameDocument.parse({ ...invalidBase, scripts: [{ id: "broken", source: "input => ({" }] }) },
  { name: "expanded prefab collision", document: nativeGameDocument.parse({ ...invalidBase, prefabs: [{ id: "crate", entities: [{ id: "child" }] }], scenes: [{ id: "scene", entities: [{ id: "root", prefabId: "crate" }, { id: "root:child" }] }] }) },
  { name: "unsupported 2D physics", document: nativeGameDocument.parse({ ...invalidBase, schemaVersion: 5, dimension: "2d", scenes: [{ id: "scene", entities: [{ id: "body", transform: { rotation: 1 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 } }] }] }) }
];

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1").each(invalidDocuments)("rejects $name through installed native validation before publishing", async ({ document }) => {
  const root = await mkdtemp(join(tmpdir(), "native-browser-invalid-"));
  const output = join(root, "export");
  try {
    await expect(exportNativeCppGame(document, { assetsDir: root, out: output, target: "web" })).rejects.toThrow("Native browser document validation failed");
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(root)).filter(name => name.startsWith(".native-game-web-export-"))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1").each(["2d", "3d"] as const)("plays the installed native %s export using a closed static request set", async (dimension) => {
  const root = await mkdtemp(join(tmpdir(), "native-browser-installed-"));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const server = createServer();
  try {
    const fixture = dimension === "2d" ? createNativeCpp2dCourse("browser-course") : createNativeCppCourse("browser-course");
    const source = join(root, "source"), output = join(root, "export"); await mkdir(source);
    for (const [path, bytes] of Object.entries(fixture.files)) { await writeFile(join(source, path), bytes); }
    await exportNativeCppGame(fixture.document, { assetsDir: source, out: join(root, "registry-export"), target: "web" });
    const installed: Record<string, string> = {};
    for (const name of ["game-runtime", "game-renderer"]) {
      const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: fileURLToPath(new URL(`../../${name}/`, import.meta.url)), encoding: "utf8", env: { ...process.env, npm_config_cache: join(root, "npm-cache") } });
      if (packed.status !== 0) { throw new Error(`Installed package creation failed: ${packed.stderr}`); }
      const packages: { filename: string }[] = JSON.parse(packed.stdout);
      const archive = packages[0]; if (!archive) { throw new Error("npm pack returned no package"); }
      const destination = join(root, name); await mkdir(destination);
      const unpacked = spawnSync("tar", ["-xf", join(root, archive.filename), "-C", destination], { encoding: "utf8" });
      if (unpacked.status !== 0) { throw new Error(`Installed package extraction failed: ${unpacked.stderr}`); }
      installed[name] = join(destination, "package", "dist");
    }
    const runtime = Object.fromEntries(["native-game.mjs", "native-game.wasm", "native-game-worker.js", "native-game-player.js", "native-game-browser.json"].map(name => [name, join(installed["game-renderer"], name)]));
    runtime["native-game-notices.txt"] = join(installed["game-runtime"], "native-game-notices.txt");
    const documentPath = join(source, "game.json"); await writeFile(documentPath, JSON.stringify(fixture.document));
    const exported = spawnSync(process.execPath, [join(installed["game-runtime"], "native-game-web-export.mjs"), JSON.stringify({ document: documentPath, assetsRoot: source, output, runtime })], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR } });
    if (exported.status !== 0) { throw new Error(`Installed native browser export failed: ${exported.stderr}`); }
    await rm(source, { recursive: true });
    const inventory: { files: { path: string; digest: string }[] } = JSON.parse(await readFile(join(output, "bundle.json"), "utf8"));
    const runtimeBuild: { emscriptenVersion: string; files: { path: string; digest: string }[] } = JSON.parse(await readFile(join(output, "native-game-browser.json"), "utf8"));
    expect(inventory.files.length).toBeGreaterThan(6);
    const allowed = new Set(inventory.files.map(item => "/" + item.path)); allowed.add("/");
    const requests: string[] = [];
    let downloadedGzipBytes = 0;
    server.on("request", (request, response) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname; requests.push(path);
      if (!allowed.has(path)) { response.writeHead(404); response.end(); return; }
      const local = join(output, path === "/" ? "index.html" : path.slice(1));
      const type = local.endsWith(".wasm") ? "application/wasm" : /\.(?:mjs|js)$/.test(local) ? "text/javascript" : local.endsWith(".html") ? "text/html" : local.endsWith(".css") ? "text/css" : "application/octet-stream";
      void readFile(local).then(bytes => { const compressed = gzipSync(bytes); downloadedGzipBytes += compressed.length; response.writeHead(200, { "content-type": type, "content-encoding": "gzip", "content-length": compressed.length }); response.end(compressed); }, () => { response.writeHead(404); response.end(); });
    });
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const address = server.address(); if (!address || typeof address === "string") { throw new Error("Static fixture did not bind"); }
    browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.addInitScript(() => {
      window.nativeExportMeasuredInputs = [];
      document.addEventListener("native-game-input", (event) => { if ("detail" in event) { window.nativeExportMeasuredInputs.push(event.detail); } }, { capture: true });
    });
    const networkUrls: string[] = [];
    page.context().on("request", request => networkUrls.push(request.url()));
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const start = performance.now(); await page.goto("http://127.0.0.1:" + address.port + "/?benchmark=1");
    const failureState = async (): Promise<string> => JSON.stringify({ errors, requests, page: await page.evaluate(() => ({ status: document.querySelector("#status")?.textContent, dataset: { ...document.querySelector("canvas")?.dataset } })) });
    await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.nativeCompletedFrames) >= 1, undefined, { timeout: 30_000 }).catch(async (cause: unknown) => { throw new Error(await failureState(), { cause }); });
    const startupMs = performance.now() - start;
    expect(await page.locator("canvas").getAttribute("data-native-recording-status")).toBe("disabled");
    expect(errors).toEqual([]);
    expect(requests.filter(path => !allowed.has(path) && path !== "/favicon.ico")).toEqual([]);
    await page.locator("canvas").focus();
    const beforeRestart = await page.evaluate(() => Number(document.querySelector("canvas")?.dataset.nativeFrames));
    const generationBefore = await page.evaluate(() => Number(document.querySelector("canvas")?.dataset.nativeGeneration));
    await page.keyboard.down("r");
    await page.waitForTimeout(100);
    await page.keyboard.up("r");
    await page.waitForFunction((generation) => Number(document.querySelector("canvas")?.dataset.nativeGeneration) > generation, generationBefore, { timeout: 3_000 }).catch(async (cause: unknown) => { throw new Error(await failureState(), { cause }); });
    await page.waitForFunction((frames) => Number(document.querySelector("canvas")?.dataset.nativeFrames) >= frames + 10, beforeRestart, { timeout: 3_000 });
    expect(errors).toEqual([]);
    const generationBeforeClick = await page.evaluate(() => Number(document.querySelector("canvas")?.dataset.nativeGeneration));
    await page.getByRole("button", { name: "Restart" }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) { throw new Error("Restart HUD control is not a button"); }
      button.click();
    });
    await page.waitForFunction((generation) => Number(document.querySelector("canvas")?.dataset.nativeGeneration) > generation, generationBeforeClick, { timeout: 3_000 }).catch(async (cause: unknown) => { throw new Error(await failureState(), { cause }); });
    const firstSample = await page.evaluate(() => ({ ...document.querySelector("canvas")?.dataset }));
    const firstFrames = Number(firstSample.nativeCompletedFrames);
    const samples = await page.evaluate(() => new Promise<Array<{ completionMs: number; dispatchWholeCallMs: number; sampleTimeMs: number }>>((done, reject) => {
      const canvas = document.querySelector("canvas"); if (!canvas) { reject(new Error("Canvas disappeared")); return; }
      const values: Array<{ completionMs: number; dispatchWholeCallMs: number; sampleTimeMs: number }> = [];
      const cleanup = (): void => { clearTimeout(timer); canvas.removeEventListener("native-game-frame-complete", record); };
      const record = (event: Event): void => {
        if (!("detail" in event) || typeof event.detail !== "object" || event.detail === null || !("elapsedMs" in event.detail) || typeof event.detail.elapsedMs !== "number") { return; }
        values.push({ completionMs: event.detail.elapsedMs, dispatchWholeCallMs: Number(canvas.dataset.nativeDispatchMs), sampleTimeMs: performance.now() });
        if (values.length === 120) { cleanup(); done(values); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error("No 120 completed canvas frames")); }, 30_000);
      canvas.addEventListener("native-game-frame-complete", record);
    }));
    const completedFrameMeanMs = ((samples.at(-1)?.sampleTimeMs ?? 0) - (samples[0]?.sampleTimeMs ?? 0)) / (samples.length - 1);
    const diagnostics = await page.evaluate(() => ({ ...document.querySelector("canvas")?.dataset }));
    const measuredInputs = await page.evaluate(() => window.nativeExportMeasuredInputs);
    const inputDigest = createHash("sha256").update(JSON.stringify(measuredInputs)).digest("hex");
    const documentDigest = inventory.files.find(file => file.path === "game.json")?.digest;
    if (!documentDigest || measuredInputs.length < 120) { throw new Error("Measurement did not capture document identity and admitted inputs"); }
    const webgl = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      if (!gl) { throw new Error("Measurement has no WebGL2 context"); }
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return { vendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : "unavailable", renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : "unavailable", version: String(gl.getParameter(gl.VERSION)) };
    });
    expect(samples).toHaveLength(120);
    expect(networkUrls.filter(value => { const url = new URL(value); return url.origin !== `http://127.0.0.1:${address.port}` || (!allowed.has(url.pathname) && url.pathname !== "/favicon.ico"); })).toEqual([]);
    const summarize = (values: readonly number[]): { readonly p50: number; readonly p95: number; readonly max: number } => {
      const sorted = [...values].sort((left, right) => left - right);
      return { p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted.at(-1) ?? 0 };
    };
    const latency = { canvasCpuGpuCompletionMs: summarize(samples.map(sample => sample.completionMs)), nativeWholeCallMs: summarize(samples.map(sample => sample.dispatchWholeCallMs)), scriptOnly: "not instrumented" };
    const assetTransfers = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming && new URL(entry.name).pathname.startsWith("/assets/")).map(entry => ({ path: new URL(entry.name).pathname, startTime: entry.startTime, responseEnd: entry.responseEnd, durationMs: entry.duration, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })));
    const reportDir = resolve(process.env.NODETOOL_NATIVE_BROWSER_REPORT_DIR ?? join(tmpdir(), "native-browser-reports")); await mkdir(reportDir, { recursive: true });
    await page.screenshot({ path: join(reportDir, dimension + ".png") });
    let compressedBytes = 0;
    for (const item of inventory.files) { compressedBytes += gzipSync(await readFile(join(output, item.path))).length; }
    await writeFile(join(reportDir, dimension + ".json"), JSON.stringify({ dimension, seed: 1, documentDigest, inputDigest, measuredInputs, browser: browser.version(), cpu: cpus()[0]?.model, os: { platform: platform(), release: release(), architecture: arch() }, webgl, build: { mode: "Release", emscriptenVersion: runtimeBuild.emscriptenVersion, artifacts: runtimeBuild.files }, resolution: [960, 540], renderer: "software correctness only", method: "fresh browser process/context/page navigation to first completed canvas frame, then restart checks and 120 event-timestamped samples with benchmark=1 canvas CPU+GPU synchronization; HTTP gzip default per file including compression cost; OS caches uncontrolled", frameScope: "canvas CPU and GPU completion, excludes DOM compositor, display and GPU-only timing", warmupFrames: firstFrames, startupMs, compressedBundleBytes: compressedBytes, downloadedGzipBytes, completedFrameMeanMs, assetManifestBytes: fixture.document.assets.reduce((sum, entry) => sum + entry.size, 0), assetTransfers, latency, samples, firstSample, diagnostics, memoryMethod: "WASM linear-memory extent sampled after dispatch, excludes live allocation, GPU and JS heaps", decodedAssetMemory: "not instrumented", requests, gpuTiming: "unavailable" }, null, 2));
    await page.goto("http://127.0.0.1:" + address.port + "/?benchmark=1&record=1");
    await page.waitForFunction(() => document.querySelector("canvas")?.dataset.nativeRecordingStatus === "recording");
    const recordedInput = await page.evaluate(() => new Promise<unknown>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("No committed recorded input")), 3_000);
      document.querySelector("canvas")?.addEventListener("native-game-input", (event) => { if ("detail" in event) { clearTimeout(timer); done(event.detail); } }, { once: true });
    }));
    expect(recordedInput).toMatchObject({ tick: expect.any(Number), input: { actions: expect.any(Object), loaded: expect.any(Array) } });
    await writeFile(join(output, "native-game.wasm"), "damaged"); await page.reload();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("could not start"));
  } finally {
    await browser?.close();
    await new Promise<void>(done => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
}, 90_000);
