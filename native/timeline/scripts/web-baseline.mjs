#!/usr/bin/env node
// Web baseline (PLAN.md M0): plays the native fixtures in the web editor's
// preview, in headless Chromium, and records the counters the native bench
// records, each with its method.
//
// Everything runs from this worktree and touches nothing of the user's:
//   - a scratch NodeTool server (scratch-server.mjs: own HOME, database,
//     assets, SECRETS_MASTER_KEY; never port 7777) with the fixtures imported;
//   - the web app's Vite dev server on its own port, proxying the API to the
//     scratch server only (PROXY_API_TARGET);
//   - headless Chromium from Playwright with a fresh temporary profile. No
//     window opens.
// Runs are niced, and a measurement waits while the 1-minute load average is
// above --max-load (default 10); the load is recorded next to every number.
//
// Counters, per fixture, over --play-seconds of playback from 0:
//   submitIntervalMs  between `compositor-submit` diagnostics: frames the
//                     preview composited. Native: renderIntervalMs.
//   rafIntervalMs     between requestAnimationFrame callbacks: the page's
//                     frame clock. Native: presentIntervalMs (vsync). In
//                     headless Chromium there is no display, so this is a
//                     timer, not vsync.
//   frameWorkMs       from the rAF callback to the compositor submit of the
//                     same frame: the main-thread work of one preview frame.
//                     Native: cpuMs (render() body).
//   frameError        per submitted frame, the largest |shown - expected|
//                     source frame index over its WebCodecs layers
//                     (`frame-presented`: frameSec against targetSec, the D17
//                     rule at the clip's frame rate). Native: frameError.
//   heldFrames        submitted frames with a layer showing an older frame
//                     than its target. Native: heldFrames.
//   lateFrames        `frame-late` diagnostics (a newer decoded frame was
//                     available). Native: none.
// Each fixture plays once per preview decoder (`timelinePreviewDecoder`):
// `element` (<video>, the shipped default) and `webcodecs` (D11, opt-in).
// The element path emits no per-frame diagnostic, so frameError, heldFrames
// and lateFrames exist for `webcodecs` only.
// A mapped counter with no samples fails the run (fail closed), and so does
// a fixture that composited no frame.
//
// Chromium runs in its new headless mode (Playwright channel "chromium"),
// which gets the Metal WebGPU adapter. The default headless shell gets only
// SwiftShader, a software rasterizer.
//
// Usage: node native/timeline/scripts/web-baseline.mjs [--port 7799] [--web-port 3799]
//          [--play-seconds 10] [--max-load 10] [--fixtures a,b]
//          [--decoders element,webcodecs] [--headed] [--json] [--keep]
// --headed opens a real Chromium window (vsync, real frame pacing). Only
// window-checks.sh passes it; it writes build-m5/web-baseline-headed.json.
// Writes build-m5/web-baseline.json. Needs `npm run build:packages`, the
// fixture media (scripts/make-fixtures.sh) and Playwright's Chromium.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { USER_PORT, createScratchSession } from "./scratch-server.mjs";
import {
  assertInWork as assertInWorkIn,
  groupOwnsPort,
  listenerPids,
  makeScratch,
  noRedirectFetch,
  stopGroups,
  verifiedBuildDir
} from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..", "..");

function parseArgs(argv) {
  const a = {
    port: 7799,
    webPort: 3799,
    playSeconds: 10,
    maxLoad: 10,
    fixtures: ["video-4tracks", "video-8tracks", "example:serein"],
    decoders: ["element", "webcodecs"],
    json: false,
    headed: false,
    keep: false
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--port") a.port = Number(argv[++i]);
    else if (v === "--web-port") a.webPort = Number(argv[++i]);
    else if (v === "--play-seconds") a.playSeconds = Number(argv[++i]);
    else if (v === "--max-load") a.maxLoad = Number(argv[++i]);
    else if (v === "--fixtures") a.fixtures = argv[++i].split(",");
    else if (v === "--decoders") a.decoders = argv[++i].split(",");
    else if (v === "--json") a.json = true;
    else if (v === "--headed") a.headed = true;
    else if (v === "--keep") a.keep = true;
    else throw new Error(`unknown argument ${v}`);
  }
  for (const d of a.decoders) if (d !== "element" && d !== "webcodecs") throw new Error(`unknown decoder ${d}`);
  for (const p of [a.port, a.webPort]) if (p === USER_PORT) throw new Error("port 7777 belongs to the user's server");
  return a;
}

const args = parseArgs(process.argv.slice(2));
const log = (...m) => {
  if (!args.json) console.error(...m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = makeScratch(verifiedBuildDir(root, "build-m5"), "web-baseline-");
const assertInWork = (p) => assertInWorkIn(work, p);
const scratch = createScratchSession({ work, repo, assertInWork, log });

// ── load ──────────────────────────────────────────────────────────────────

/** Waits until the 1-minute load average is at most --max-load (up to 20 min); returns it. */
async function settledLoad() {
  const deadline = Date.now() + 20 * 60_000;
  while (os.loadavg()[0] > args.maxLoad && Date.now() < deadline) {
    log(`load ${os.loadavg()[0].toFixed(1)} > ${args.maxLoad}: waiting`);
    await sleep(15_000);
  }
  return Number(os.loadavg()[0].toFixed(2));
}

// ── the web app ───────────────────────────────────────────────────────────

let vite = null;

async function startVite(apiBase) {
  if (listenerPids(args.webPort).length > 0) throw new Error(`port ${args.webPort} is in use`);
  const logPath = assertInWork(path.join(work, "vite.log"));
  const out = fs.openSync(logPath, "w");
  vite = spawn("nice", ["-n", "10", process.execPath, path.join(repo, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1",
    "--port", String(args.webPort), "--strictPort", "--clearScreen", "false"], {
    cwd: path.join(repo, "web"),
    env: { ...process.env, PROXY_API_TARGET: apiBase, BROWSER: "none" },
    detached: true,
    stdio: ["ignore", out, out]
  });
  const base = `http://127.0.0.1:${args.webPort}`;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`vite exited, see ${logPath}`);
    try {
      if ((await noRedirectFetch(base)).ok) break;
    } catch {
      /* not up */
    }
    await sleep(1000);
  }
  if (!groupOwnsPort(vite.pid, args.webPort)) throw new Error(`the listener on ${args.webPort} is not this run's Vite`);
  log(`web app: ${base} (API proxy to ${apiBase})`);
  return base;
}

// ── seeding ───────────────────────────────────────────────────────────────

async function seedFixture(server, name) {
  if (name.startsWith("example:")) {
    const slug = name.slice(8);
    const seq = await scratch.mutate(server.base, "timeline.installExample", { slug });
    return { id: seq.id, label: name, fps: seq.fps, localFile: path.join(root, "build-m5", "plan-examples", `${slug}.json`) };
  }
  const fixture = path.join(root, "fixtures", `${name}.json`);
  const doc = JSON.parse(fs.readFileSync(fixture, "utf8"));
  const byPath = new Map();
  for (const clip of doc.clips) {
    if (!clip.mediaPath) continue;
    const file = path.resolve(path.dirname(fixture), clip.mediaPath);
    if (!byPath.has(file)) byPath.set(file, (await scratch.upload(server, file)).id);
    clip.currentAssetId = byPath.get(file);
    clip.status = "generated";
    delete clip.mediaPath;
  }
  return { id: await scratch.createTimeline(server.base, `web baseline ${name}`, doc), label: name, fps: doc.fps, localFile: fixture };
}

// ── the browser side ──────────────────────────────────────────────────────

/** Runs in the page before the app: the perf sink and the frame clock. */
function instrument() {
  const state = { rafs: [], submits: [], presented: [], late: 0, uploads: 0, decoders: [], recording: false };
  window.__webBaseline = state;
  window.__nodetoolTimelinePerf = (event) => {
    // The decode path opens before playback starts: kept outside the window.
    if (event.kind === "decoder-open") state.decoders.push({ source: event.sourceId, implementation: event.implementation, reason: event.reason });
    if (!state.recording) return;
    if (event.kind === "compositor-submit") state.submits.push({ at: event.at, layers: event.layerCount ?? 0, drawn: event.drawnLayers ?? 0 });
    else if (event.kind === "frame-presented") state.presented.push({ at: event.at, target: event.targetSec, shown: event.frameSec, source: event.sourceId });
    else if (event.kind === "frame-late") state.late += 1;
    else if (event.kind === "source-upload") state.uploads += 1;
  };
  const tick = (now) => {
    if (state.recording) state.rafs.push(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function summarize(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const round = (v) => Math.round(v * 1000) / 1000;
  return { count: s.length, p50: round(q(0.5)), p95: round(q(0.95)), max: round(s.at(-1)) };
}

/** Per submitted frame: the presented layers between it and the previous submit. */
function frameCorrectness(state, fps) {
  const errors = [];
  let held = 0;
  let p = 0;
  let prevAt = -Infinity;
  for (const submit of state.submits) {
    let worst = null;
    let older = false;
    while (p < state.presented.length && state.presented[p].at <= submit.at) {
      const e = state.presented[p++];
      if (e.at <= prevAt || typeof e.target !== "number" || typeof e.shown !== "number") continue;
      const expected = Math.floor(e.target * fps + 1e-6);
      const shown = Math.round(e.shown * fps);
      const error = shown - expected;
      if (error < 0) older = true;
      worst = Math.max(worst ?? 0, Math.abs(error));
    }
    prevAt = submit.at;
    if (worst !== null) errors.push(worst);
    if (older) held += 1;
  }
  return { errors, held };
}

/** The `decoder-open` events by implementation, with the fallback reasons. */
function decoderSummary(decoders) {
  const out = {};
  for (const d of decoders) {
    const key = d.implementation ?? "unknown";
    out[key] ??= { count: 0, reasons: [] };
    out[key].count += 1;
    if (d.reason && !out[key].reasons.includes(d.reason)) out[key].reasons.push(d.reason);
  }
  return out;
}

async function measure(page, baseUrl, seed) {
  const load = await settledLoad();
  await page.goto(`${baseUrl}/timeline/${seed.id}`, { waitUntil: "domcontentloaded" });
  const play = page.getByRole("button", { name: "Play" }).first();
  await play.waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForSelector("[data-preview-ready=true]", { state: "attached", timeout: 300_000 });
  await page.evaluate(() => {
    const s = window.__webBaseline;
    Object.assign(s, { rafs: [], submits: [], presented: [], late: 0, uploads: 0, recording: true });
    // decoders: kept, it covers the page from its load.
  });
  await play.click();
  await sleep(args.playSeconds * 1000);
  const state = await page.evaluate(() => {
    window.__webBaseline.recording = false;
    return window.__webBaseline;
  });
  await page.keyboard.press("Space");
  const loadAfter = Number(os.loadavg()[0].toFixed(2));

  const intervals = (times) => times.slice(1).map((t, i) => t - times[i]);
  // The frame work: each submit against the latest rAF at or before it.
  const work = [];
  let r = 0;
  for (const s of state.submits) {
    while (r + 1 < state.rafs.length && state.rafs[r + 1] <= s.at) r++;
    if (state.rafs[r] !== undefined && state.rafs[r] <= s.at) work.push(s.at - state.rafs[r]);
  }
  const { errors, held } = frameCorrectness(state, seed.fps);
  return {
    fixture: seed.label,
    loadAverage: { before: load, after: loadAfter },
    playSeconds: args.playSeconds,
    submittedFrames: state.submits.length,
    layersPerFrameMax: Math.max(0, ...state.submits.map((s) => s.layers)),
    submitIntervalMs: summarize(intervals(state.submits.map((s) => s.at))),
    rafIntervalMs: summarize(intervals(state.rafs)),
    frameWorkMs: summarize(work),
    frameError: summarize(errors),
    frameErrorZeroFraction: errors.length ? Math.round((errors.filter((e) => e === 0).length / errors.length) * 1000) / 1000 : null,
    heldFrames: errors.length ? held : null,
    lateFrames: state.late,
    sourceUploads: state.uploads,
    presentedLayerFrames: state.presented.length,
    decoders: decoderSummary(state.decoders)
  };
}

// ── native counterparts that need no window ──────────────────────────────

const nativeCache = new Map();

/**
 * The native numbers that need no window, once per fixture:
 *   sceneEvalMs  bench_scene: SceneEval of one frame plan (CPU).
 *   uiBench      `--ui-bench` (QQuickRenderControl on Metal into a texture,
 *                no vsync, no window, hw decode): frameMs is the whole GUI
 *                frame (input, polish, sync, render), renderMs the render
 *                pass. A throughput number, not a presentation rate: the
 *                vsync counters need window-checks.sh.
 */
function nativeOffscreen(seed) {
  if (nativeCache.has(seed.label)) return nativeCache.get(seed.label);
  const result = { sceneEvalMs: null, uiBench: null };
  const bench = path.join(root, "build-m5", "bench_scene");
  if (fs.existsSync(bench) && fs.existsSync(seed.localFile)) {
    try {
      const out = JSON.parse(execFileSync("nice", ["-n", "10", bench, seed.localFile], { encoding: "utf8" }));
      result.sceneEvalMs = { p50: out.medianMs, p95: out.p95Ms, frames: out.frames };
    } catch {
      /* stays null */
    }
  }
  // Only fixtures with local media: an example's assets live on the server.
  const app = path.join(root, "build-m5", "nodetool-timeline");
  if (fs.existsSync(app) && seed.label.startsWith("video-")) {
    const load = Number(os.loadavg()[0].toFixed(2));
    let stdout = "";
    let exit = 0;
    try {
      stdout = execFileSync("nice", ["-n", "10", app, seed.localFile, "--ui-bench", "--size", "1920x1080", "--decode", "hw"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch (err) {
      stdout = String(err.stdout ?? "");
      exit = err.status ?? -1;
    }
    try {
      const u = JSON.parse(stdout).uiBench;
      result.uiBench = {
        exit,
        loadAverage: { before: load, after: Number(os.loadavg()[0].toFixed(2)) },
        mode: u.mode,
        frames: u.frames,
        frameMs: u.frameMs,
        renderMs: u.renderMs,
        guiMs: u.guiMs,
        compositedFrames: u.preview?.compositedFrames,
        drawnMediaFraction: u.preview?.drawnMediaFraction
      };
    } catch {
      result.uiBench = { exit, error: "no uiBench JSON" };
    }
  }
  nativeCache.set(seed.label, result);
  return result;
}

// ── the run ───────────────────────────────────────────────────────────────

const failures = [];
const results = [];
let environment = null;

async function main() {
  const server = await scratch.startServer("server", args.port, {
    NODETOOL_ALLOWED_ORIGINS: `http://127.0.0.1:${args.webPort}`
  });
  const seeds = [];
  for (const name of args.fixtures) seeds.push(await seedFixture(server, name));
  const baseUrl = await startVite(server.base);

  const { chromium } = await import(path.join(repo, "node_modules", "playwright", "index.mjs"));
  const browser = await chromium.launch({
    headless: !args.headed,
    channel: "chromium",
    args: ["--enable-unsafe-webgpu", "--enable-webgpu-developer-features"]
  });
  try {
    for (const decoder of args.decoders) await measureDecoder(browser, baseUrl, seeds, decoder);
  } finally {
    await browser.close();
  }
}

/** Plays every fixture with one preview decoder, in a fresh browser context. */
async function measureDecoder(browser, baseUrl, seeds, decoder) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    // Only the app and its proxied API: any other host is refused.
    await context.route(/^https?:\/\//, (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" && Number(url.port) === args.webPort ? route.continue() : route.abort();
    });
    // The settings store reads this before the app renders (zustand persist).
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("settings-storage", JSON.stringify({ state: { settings: { timelinePreviewDecoder: value } }, version: 0 }));
      } catch {
        /* no storage: the default decoder */
      }
    }, decoder);
    await context.addInitScript(instrument);
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    environment = await page.evaluate(async () => {
      const adapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
      return {
        userAgent: navigator.userAgent,
        webgpu: Boolean(adapter),
        adapter: adapter ? { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, description: adapter.info?.description, fallback: adapter.isFallbackAdapter ?? null } : null,
        webCodecs: typeof VideoDecoder !== "undefined",
        devicePixelRatio: window.devicePixelRatio
      };
    });
    environment.headless = args.headed ? false : "new (channel chromium)";
    environment.browserVersion = browser.version();
    for (const seed of seeds) {
      const tag = `${seed.label} [${decoder}]`;
      log(`measuring ${tag}`);
      const web = await measure(page, baseUrl, seed);
      const native = nativeOffscreen(seed);
      results.push({ fixture: seed.label, decoder, web, native });
      if (web.submittedFrames === 0) failures.push(`${tag}: the web preview composited no frame`);
      for (const k of ["submitIntervalMs", "rafIntervalMs", "frameWorkMs"]) {
        if (!web[k]) failures.push(`${tag}: ${k} has no samples`);
      }
      if (decoder === "webcodecs" && seed.label.startsWith("video-")) {
        if (!web.decoders.webcodecs) failures.push(`${tag}: no WebCodecs decoder opened (${JSON.stringify(web.decoders)})`);
        if (!web.frameError) failures.push(`${tag}: frameError has no samples (no frame-presented diagnostics)`);
      }
    }
  } finally {
    await context.close();
  }
}

try {
  await main();
} catch (err) {
  failures.push(`run: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  try {
    if (vite) await stopGroups([vite.pid]);
    await scratch.stopServers();
  } catch (err) {
    failures.push(`cleanup: ${String(err)}`);
  }
}
const verdict = failures.length === 0 ? "pass" : "fail";
const report = { kind: "native-timeline-web-baseline-v1", verdict, failures, environment, host: { os: `${os.platform()} ${os.release()}`, cpus: os.cpus()[0]?.model }, results };
const outPath = path.join(root, "build-m5", args.headed ? "web-baseline-headed.json" : "web-baseline.json");
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
if (verdict === "pass" && !args.keep) fs.rmSync(work, { recursive: true, force: true });
console.log(args.json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
process.exit(verdict === "pass" ? 0 : 1);
