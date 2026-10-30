import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { resolvePackageAssetPath } from "@nodetool-ai/config";
import { nativeGameDocument, nativeFrame, type NativeGameDocument, type NativeJsonSaveStorage } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker } from "./native-worker.js";
import { NativeJsonSaveHost, createNativeMemorySaveStorage } from "./native-browser/saves.js";
export { NativeGameWorker, NativeGameWorkerError, type NativeGameWorkerOptions } from "./native-worker.js";

const frameSchema = nativeFrame;
export const nativeCppAssertion = z.strictObject({ tick: z.number().int().nonnegative(), path: z.array(z.union([z.string(), z.number().int().nonnegative()])).min(1).max(16), equals: z.json() });
export type NativeCppAssertion = z.infer<typeof nativeCppAssertion>;
export interface NativeCppRunOptions {
  readonly ticks: number;
  readonly seed?: number;
  readonly inputs?: readonly Readonly<Record<string, unknown>>[];
  readonly assertions?: readonly NativeCppAssertion[];
  readonly verifyReplay?: boolean;
  readonly signal?: AbortSignal;
  readonly executable?: string;
  readonly storage?: NativeJsonSaveStorage;
  readonly replay?: boolean;
}
function count(value: number, name: string, max = 100_000): number {
  const result = z.number().int().min(0).max(max).safeParse(value);
  if (!result.success) { throw new Error(`${name} must be an integer between 0 and ${max}`); }
  return result.data;
}
export function nativeCppExecutable(kind: "worker" | "player", override?: string): string {
  const value = override ?? process.env[kind === "worker" ? "NODETOOL_NATIVE_GAME_WORKER" : "NODETOOL_NATIVE_GAME_PLAYER"];
  if (value) { return value; }
  if (kind === "player" && process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR) { return join(process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR, "bin", process.platform === "win32" ? "game-player.exe" : "game-player"); }
  if (kind === "worker") {
    try { return resolvePackageAssetPath({ pkg: "@nodetool-ai/game-runtime", path: process.platform === "win32" ? "native-game-worker.exe" : "native-game-worker" }, import.meta.url); } catch { /* The installed profile may omit native execution. */ }
  }
  throw new Error(`Native C++ ${kind} is unavailable. Configure ${kind === "worker" ? "NODETOOL_NATIVE_GAME_WORKER" : "NODETOOL_NATIVE_GAME_PLAYER"} with the installed executable.`);
}
export function nativeCppIdentity(document: NativeGameDocument): Readonly<Record<string, unknown>> {
  return { engine: document.engine, dimension: document.dimension, schemaVersion: document.schemaVersion, revision: document.revision,
    documentDigest: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
    manifestDigest: createHash("sha256").update(JSON.stringify(document.assets)).digest("hex"),
    sourceDigests: document.scripts.map((script) => ({ id: script.id, digest: createHash("sha256").update(script.source).digest("hex") })) };
}
function atPath(value: unknown, path: NativeCppAssertion["path"]): unknown {
  let cursor = value;
  for (const segment of path) {
    if (Array.isArray(cursor) && Number.isInteger(segment)) { cursor = cursor[Number(segment)]; }
    else { const parsed = z.record(z.string(), z.unknown()).safeParse(cursor); cursor = parsed.success ? parsed.data[String(segment)] : undefined; }
  }
  return cursor;
}
export function nativeCppFrameDigest(value: unknown): string {
  const frame = z.record(z.string(), z.unknown()).parse(value);
  const comparable = Object.fromEntries(Object.entries(frame).filter(([name]) => name !== "generation"));
  if (frame.presentationEvents !== undefined) {
    comparable.presentationEvents = z.array(z.record(z.string(), z.unknown())).parse(frame.presentationEvents)
      .map((event) => Object.fromEntries(Object.entries(event).filter(([name]) => name !== "generation")));
  }
  if (frame.hostRequests !== undefined) {
    comparable.hostRequests = z.array(z.record(z.string(), z.unknown())).parse(frame.hostRequests)
      .map((request) => Object.fromEntries(Object.entries(request).filter(([name]) => name !== "generation")));
  }
  return createHash("sha256").update(JSON.stringify(comparable)).digest("hex");
}
export async function simulateNativeCppGame(input: NativeGameDocument, options: NativeCppRunOptions): Promise<Readonly<Record<string, unknown>>> {
  const document = nativeGameDocument.parse(input), ticks = count(options.ticks, "ticks"), seed = count(options.seed ?? 1, "seed", 0xffff_ffff);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
  const assertions = z.array(nativeCppAssertion).max(10_000).parse(options.assertions ?? []);
  if (assertions.some((assertion) => assertion.tick > ticks)) { throw new Error("Assertion tick is outside the simulated run"); }
  const assertionsByTick = new Map<number, NativeCppAssertion[]>();
  for (const assertion of assertions) { const group = assertionsByTick.get(assertion.tick) ?? []; group.push(assertion); assertionsByTick.set(assertion.tick, group); }
  const worker = new NativeGameWorker({ executable: nativeCppExecutable("worker", options.executable) });
  const sessionId = "simulation";
  try {
    const capabilities = z.record(z.string(), z.unknown()).parse(await worker.request("hello", {}, { signal }));
    await worker.request("open", { sessionId, document }, { signal });
    let frame = frameSchema.parse(await worker.request("start", { sessionId, seed }, { signal }));
    const saves = new NativeJsonSaveHost(options.storage ?? createNativeMemorySaveStorage(), { replay: options.replay });
    saves.reset(frame.generation);
    const recordedInputs: Readonly<Record<string, unknown>>[] = [];
    const initialSnapshot = z.record(z.string(), z.unknown()).parse(await worker.request("snapshot", { sessionId }, { signal }));
    const failures: Array<Readonly<Record<string, unknown>>> = [], recorded: string[] = [];
    let snapshot: unknown;
    const midpoint = Math.floor(ticks / 2);
    const check = (): void => {
      for (const assertion of assertionsByTick.get(frame.tick) ?? []) {
        const actual = atPath(frame, assertion.path);
        if (!isDeepStrictEqual(actual, assertion.equals)) { failures.push({ ...assertion, actual: actual ?? null }); }
      }
    };
    check();
    if (options.verifyReplay && midpoint === 0) { snapshot = await worker.request("snapshot", { sessionId }, { signal }); }
    for (let tick = 0; tick < ticks; tick++) {
      await saves.drain();
      const supplied = options.inputs?.[tick] ?? {};
      if (!options.replay && supplied.loaded !== undefined) { throw new Error("Recorded loaded input requires replay mode"); }
      const loaded = saves.takeLoaded(frame.generation);
      const inputFrame: Record<string, unknown> = { ...supplied };
      if (!options.replay && loaded.length) { inputFrame.loaded = loaded; }
      recordedInputs.push(structuredClone(inputFrame));
      const previousGeneration = frame.generation;
      frame = frameSchema.parse(await worker.request("step", { sessionId, input: inputFrame }, { signal }));
      if (frame.generation !== previousGeneration) { saves.reset(frame.generation); }
      saves.consume(frame.hostRequests, frame.generation);
      check();
      if (options.verifyReplay && frame.tick === midpoint) { snapshot = await worker.request("snapshot", { sessionId }, { signal }); }
      if (options.verifyReplay && frame.tick > midpoint) { recorded.push(nativeCppFrameDigest(frame)); }
    }
    await saves.drain();
    if (options.verifyReplay) {
      const restored = frameSchema.parse(await worker.request("restore", { sessionId, snapshot }, { signal }));
      saves.reset(restored.generation);
      for (let tick = midpoint; tick < ticks; tick++) {
        const resumed = frameSchema.parse(await worker.request("step", { sessionId, input: recordedInputs[tick] ?? {} }, { signal }));
        if (nativeCppFrameDigest(resumed) !== recorded[tick - midpoint]) { failures.push({ tick: tick + 1, path: ["replay"], message: "Resumed frame differs" }); break; }
      }
    }
    await saves.drain();
    return { storagePersistence: options.storage?.persistence ?? "memory", recordedInputs, ...nativeCppIdentity(document), engineBuild: initialSnapshot.build, capabilities, tick: frame.tick, frameDigest: nativeCppFrameDigest(frame), frame, failures, valid: failures.length === 0, replayVerified: options.verifyReplay === true && failures.length === 0 };
  } finally { worker.close(); }
}
export async function benchmarkNativeCppGame(document: NativeGameDocument, options: NativeCppRunOptions & { readonly warmup?: number }): Promise<Readonly<Record<string, unknown>>> {
  const normalized = nativeGameDocument.parse(document), ticks = count(options.ticks, "ticks"), warmup = count(options.warmup ?? 60, "warmup");
  if (ticks === 0) { throw new Error("Benchmark requires at least one measured tick"); }
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
  const worker = new NativeGameWorker({ executable: nativeCppExecutable("worker", options.executable) });
  try {
    const engineBuild = await worker.request("hello");
    await worker.request("open", { sessionId: "bench", document: normalized }, { signal });
    let frame = nativeFrame.parse(await worker.request("start", { sessionId: "bench", seed: options.seed ?? 1 }, { signal }));
    const saves = new NativeJsonSaveHost(options.storage ?? createNativeMemorySaveStorage(), { replay: options.replay });
    saves.reset(frame.generation);
    const checkpoint = z.record(z.string(), z.unknown()).parse(await worker.request("snapshot", { sessionId: "bench" }, { signal }));
    const samples: number[] = [];
    for (let tick = 0; tick < ticks + warmup; tick++) {
      await saves.drain();
      const loaded = saves.takeLoaded(frame.generation), supplied = options.inputs?.[tick] ?? {};
      if (!options.replay && supplied.loaded !== undefined) { throw new Error("Recorded loaded input requires replay mode"); }
      const inputFrame: Record<string, unknown> = { ...supplied };
      if (!options.replay && loaded.length) { inputFrame.loaded = loaded; }
      const generation = frame.generation;
      const start = performance.now();
      frame = nativeFrame.parse(await worker.request("step", { sessionId: "bench", input: inputFrame }, { signal }));
      if (tick >= warmup) { samples.push(performance.now() - start); }
      if (frame.generation !== generation) { saves.reset(frame.generation); }
      saves.consume(frame.hostRequests, frame.generation);
    }
    await saves.drain();
    samples.sort((a, b) => a - b);
    return { ...nativeCppIdentity(normalized), engineBuild: checkpoint.build, capabilities: engineBuild, ticks, warmup, metric: "host-roundtrip-ms", tickMs: { p50: samples[Math.floor((samples.length - 1) * .5)], p95: samples[Math.floor((samples.length - 1) * .95)], max: samples[samples.length - 1] } };
  } finally { worker.close(); }
}
export async function runNativeCppProcess(executable: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const environment: NodeJS.ProcessEnv = {};
    for (const name of ["PATH", "SystemRoot", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "XDG_RUNTIME_DIR", "DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "QT_QPA_PLATFORM", "QT_PLUGIN_PATH", "QML_IMPORT_PATH", "QSG_RHI_BACKEND", "VK_ICD_FILENAMES", "VK_DRIVER_FILES", "LIBGL_ALWAYS_SOFTWARE"]) {
      if (process.env[name] !== undefined) { environment[name] = process.env[name]; }
    }
    const child = spawn(executable, [...args], { signal, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Native process exceeded 120 second budget")); }, 120_000);
    let abortKill: ReturnType<typeof setTimeout> | undefined;
    const abort = (): void => { abortKill = setTimeout(() => child.kill("SIGKILL"), 250); };
    signal?.addEventListener("abort", abort, { once: true });
    child.once("close", () => { clearTimeout(timeout); clearTimeout(abortKill); signal?.removeEventListener("abort", abort); });
    let output = "", diagnostics = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(output) + chunk.length > 1_048_576) { child.kill("SIGKILL"); reject(new Error("Native process output exceeds limit")); return; }
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-8192); });
    child.on("error", reject);
    child.on("exit", (code, exitSignal) => code === 0 ? resolve(output) : reject(new Error(`Native process failed (${exitSignal ?? code}): ${diagnostics}`)));
  });
}
export async function captureNativeCppGame(document: NativeGameDocument, options: { readonly assetsDir?: string; readonly out: string; readonly ticks?: number; readonly seed?: number; readonly inputs?: readonly Readonly<Record<string, unknown>>[]; readonly signal?: AbortSignal; readonly executable?: string }): Promise<Readonly<Record<string, unknown>>> {
  if (options.seed !== undefined && options.seed !== 1) { throw new Error("Native player capture currently supports seed 1 only"); }
  const normalized = nativeGameDocument.parse(document), directory = await mkdtemp(join(tmpdir(), "native-game-capture-"));
  try {
    const source = join(directory, "game.json"), report = join(directory, "report.json"), inputs = join(directory, "inputs.json");
    await writeFile(source, JSON.stringify(normalized)); await writeFile(inputs, JSON.stringify(options.inputs ?? []));
    const args = [source, "--capture", options.out, "--tick", String(count(options.ticks ?? 0, "ticks")), "--report", report, "--inputs", inputs];
    if (options.assetsDir) { args.push("--assets-dir", options.assetsDir); }
    await runNativeCppProcess(nativeCppExecutable("player", options.executable), args, options.signal);
    return { ...nativeCppIdentity(normalized), ...z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(report, "utf8"))), out: options.out };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function exportNativeCppGame(document: NativeGameDocument, options: { readonly assetsDir?: string; readonly out: string; readonly target?: "web" | "desktop"; readonly buildDir?: string; readonly signal?: AbortSignal }): Promise<Readonly<Record<string, unknown>>> {
  if (options.target !== undefined && options.target !== "web" && options.target !== "desktop") { throw new Error("Native export target must be web or desktop"); }
  if (options.target === "web") {
    if (options.buildDir) { throw new Error("Native --build-dir applies to the desktop export target. Web export uses the installed browser runtime profile."); }
    const runtime: Record<string, string> = {};
    try {
      for (const path of ["native-game.mjs", "native-game.wasm", "native-game-worker.js", "native-game-player.js", "native-game-browser.json"]) {
        runtime[path] = resolvePackageAssetPath({ pkg: "@nodetool-ai/game-renderer", path }, import.meta.url);
      }
      runtime["native-game-notices.txt"] = resolvePackageAssetPath({ pkg: "@nodetool-ai/game-runtime", path: "native-game-notices.txt" }, import.meta.url);
    } catch (error) { throw new Error("Native browser capability unavailable: install the browser runtime profile", { cause: error }); }
    const script = resolvePackageAssetPath({ pkg: "@nodetool-ai/game-runtime", path: "native-game-web-export.mjs" }, import.meta.url);
    const directory = await mkdtemp(join(tmpdir(), "native-game-web-export-"));
    try {
      const source = join(directory, "game.json");
      await writeFile(source, JSON.stringify(nativeGameDocument.parse(document)));
      return z.record(z.string(), z.unknown()).parse(JSON.parse(await runNativeCppProcess(process.execPath, [script, JSON.stringify({ document: source, output: options.out, assetsRoot: options.assetsDir, runtime, validationRoot: directory })], options.signal)));
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  const exporter = process.env.NODETOOL_NATIVE_GAME_EXPORTER ?? resolvePackageAssetPath({ pkg: "@nodetool-ai/game-runtime", path: "native-game-export.mjs" }, import.meta.url);
  const directory = await mkdtemp(join(tmpdir(), "native-game-export-"));
  try {
    const source = join(directory, "game.json"); await writeFile(source, JSON.stringify(nativeGameDocument.parse(document)));
    const args = [exporter, "--document", source, "--output", options.out];
    if (options.assetsDir) { args.push("--assets-root", options.assetsDir); }
    if (options.buildDir) { args.push("--build-dir", options.buildDir); }
    else if (process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR) { args.push("--runtime-dir", process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR); }
    return z.record(z.string(), z.unknown()).parse(JSON.parse(await runNativeCppProcess(process.execPath, args, options.signal)));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export { createNativeCppCourse, createNativeCpp2dCourse } from "./native-template.js";
export { requestNativeEditor, NativeEditorError, nativeEditorRequest, type NativeEditorRequest, type NativeEditorResult } from "./native-editor-client.js";

export { createNativeAtomicFileSaveStorage } from "./native-json-save-files.js";
export { NativeJsonSaveHost, createNativeMemorySaveStorage } from "./native-browser/saves.js";
