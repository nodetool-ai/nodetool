import type { NativeFrame } from "@nodetool-ai/protocol/native-game";
import type { NativeRenderer } from "./contracts.js";
import type { NativeAudio } from "./audio.js";
import type { NativeHud } from "./hud.js";

export interface NativePresentationHost {
  subscribe(listener: (frame: NativeFrame) => void): () => void;
  pause(): void;
  resume(): void;
  close(): Promise<void>;
}
export interface NativePresentationPlayer {
  resize(width: number, height: number, pixelRatio?: number): void;
  unlockAudio(): Promise<void>;
  contextLost(): void;
  contextRestored(): void;
  dispose(): Promise<void>;
}

/** Presentation consumes every commit even when only the latest frame is drawn. */
export function createNativePresentationPlayer(options: {
  readonly host: NativePresentationHost;
  readonly renderer: NativeRenderer;
  readonly hud?: NativeHud;
  readonly audio?: NativeAudio;
  /** Receives every commit, including particle output, before visual coalescing. */
  readonly onCommittedFrame?: (frame: NativeFrame) => void;
  readonly benchmarkGpuCompletion?: boolean;
  readonly onPresentedFrame?: (frame: NativeFrame, elapsedMs: number, gpuComplete: boolean) => void;
  readonly onError: (error: Error) => void;
}): NativePresentationPlayer {
  let latest: NativeFrame | undefined;
  let lost = false;
  let disposed = false;
  let scheduled: number | undefined;
  const draw = (): void => {
    scheduled = undefined;
    if (!latest || disposed || lost) { return; }
    try {
      const start = performance.now();
      options.renderer.render(latest);
      if (options.benchmarkGpuCompletion) {
        if (!options.renderer.finishFrame) { throw new Error("Native renderer does not support GPU completion measurement"); }
        options.renderer.finishFrame();
      }
      options.onPresentedFrame?.(latest, performance.now() - start, options.benchmarkGpuCompletion === true);
    }
    catch (error) { lost = true; options.host.pause(); options.onError(error instanceof Error ? error : new Error(String(error))); }
  };
  const unsubscribe = options.host.subscribe((frame) => {
    if (disposed) { return; }
    options.audio?.consume(frame);
    options.hud?.render(frame);
    options.onCommittedFrame?.(frame);
    latest = frame;
    if (!lost && scheduled === undefined) { scheduled = requestAnimationFrame(draw); }
  });
  return {
    resize(width, height, ratio) { options.renderer.resize(width, height, ratio); options.hud?.resize(width, height); },
    async unlockAudio() { await options.audio?.unlock(); },
    contextLost() {
      if (disposed || lost) { return; }
      lost = true; options.host.pause();
      void options.audio?.suspend().catch((error: unknown) => options.onError(error instanceof Error ? error : new Error(String(error))));
    },
    contextRestored() {
      if (disposed || !lost) { return; }
      lost = false; draw(); if (!lost) { options.host.resume(); }
      if (!lost) {
        void options.audio?.resume().catch((error: unknown) => options.onError(error instanceof Error ? error : new Error(String(error))));
      }
    },
    async dispose() {
      if (disposed) { return; }
      disposed = true; unsubscribe();
      if (scheduled !== undefined) { cancelAnimationFrame(scheduled); }
      options.renderer.dispose(); options.hud?.dispose();
      await Promise.all([options.audio?.dispose(), options.host.close()]);
    }
  };
}

import { nativeGameDocument, nativeFrame, nativeRuntimeInput, type NativeRuntimeRequest } from "@nodetool-ai/protocol/native-game";
import { createNativeBrowserSession, NativeBrowserInput, NativeFixedTickClock, attachNativeBrowserInput,
  NativeJsonSaveHost, NativeInputRecording, createNativeIndexedDbSaveStorage, type NativeRecordedInput } from "@nodetool-ai/game-runtime/native-browser";
import { createNativeAssetBroker } from "./assets.js";
import { createNativeAudio } from "./audio.js";
import { createNativeHud } from "./hud.js";
import { createNativeRenderer2D } from "./renderer2d.js";
import { createNativeRenderer3D } from "./renderer3d.js";
import { parseNativePreparedModel } from "./model3d-types.js";

/** Start a closed, installed native browser export. */
export interface NativeBrowserPlayer extends NativePresentationPlayer {
  recordedInputs(): readonly NativeRecordedInput[];
  recordingStatus(): "disabled" | "recording" | "failed";
}
export function createNativePlayerInputRecording(options: { readonly enabled?: boolean; readonly maxTicks?: number; readonly maxBytes?: number } = {}): NativeInputRecording | undefined {
  return options.enabled ? new NativeInputRecording(options.maxTicks, options.maxBytes) : undefined;
}
/** Reserve recording capacity before the simulation can mutate. */
export async function stepWithNativeInputRecording<T>(recording: NativeInputRecording | undefined, entry: NativeRecordedInput, step: () => Promise<T>): Promise<T> {
  const reservation = recording?.prepare(entry);
  try {
    const result = await step();
    reservation?.commit();
    return result;
  } catch (error) { reservation?.cancel(); throw error; }
}
export async function startNativeBrowserPlayer(options: {
  readonly canvas: HTMLCanvasElement;
  readonly hud: HTMLElement;
  readonly status: HTMLElement;
  readonly baseUrl: string | URL;
  readonly onCommittedFrame?: (frame: NativeFrame) => void;
  readonly onRecordedInput?: (input: NativeRecordedInput) => void;
  readonly benchmarkGpuCompletion?: boolean;
  readonly recordInputs?: boolean;
  readonly recordingLimits?: { readonly maxTicks?: number; readonly maxBytes?: number };
}): Promise<NativeBrowserPlayer> {
  const controller = new AbortController();
  const cleanup: Array<() => void | Promise<void>> = [];
  try {
  const base = new URL(options.baseUrl, location.href);
  const fetchFile = async (path: string): Promise<Response> => {
    const response = await fetch(new URL(path, base), { signal: controller.signal, redirect: "error" });
    if (!response.ok) { throw new Error(`Native player could not load ${path}`); }
    return response;
  };
  const document = nativeGameDocument.parse(await (await fetchFile("game.json")).json());
  const assets = createNativeAssetBroker({ assets: document.assets,
    fetchBytes: async (path) => {
      const entry = document.assets.find((asset) => asset.path === path);
      if (!entry) { throw new Error("Undeclared native asset path"); }
      const response = await fetchFile(`assets/${path}`);
      const reader = response.body?.getReader();
      if (!reader) { throw new Error("Native asset response has no byte stream"); }
      const bytes = new Uint8Array(entry.size);
      let offset = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) { break; }
          if (chunk.value.byteLength > bytes.length - offset) { throw new Error("Native asset response exceeds declared size"); }
          bytes.set(chunk.value, offset); offset += chunk.value.byteLength;
        }
      } catch (error) { await reader.cancel(); throw error; }
      if (offset !== bytes.length) { throw new Error("Native asset response is truncated"); }
      return bytes;
    } });
  cleanup.push(() => assets.dispose());
  const staged = [];
  for (const entry of assets.entries) { staged.push({ path: entry.path, bytes: await assets.get(entry.id) }); }
  const session = await createNativeBrowserSession({ workerUrl: new URL("native-game-worker.js", base),
    moduleUrl: new URL("native-game.mjs", base), wasmUrl: new URL("native-game.wasm", base), assets: staged });
  cleanup.push(() => session.close());
  staged.length = 0;
  let sequence = 0;
  const request = async (value: NativeRuntimeRequest): Promise<unknown> => {
    const response = await session.request(value, controller.signal);
    if (response.status === "error") { throw new Error(response.error.message); }
    return response.result;
  };
  const envelope = (): { protocolVersion: 1; requestId: string; sessionId: string } => ({ protocolVersion: 1, requestId: `browser-${sequence++}`, sessionId: "browser" });
  const onError = (error: Error): void => { options.status.textContent = error.message; };
  const owner: { presentation?: NativePresentationPlayer } = {};
  let graphicsLost = false;
  const callbacks = { canvas: options.canvas, assets, onContextLost: () => { graphicsLost = true; owner.presentation?.contextLost(); },
    onContextRestored: () => { graphicsLost = false; owner.presentation?.contextRestored(); }, onError };
  const renderer = document.dimension === "2d" ? await createNativeRenderer2D(callbacks, document) : await createNativeRenderer3D({ ...callbacks,
    prepareModel: async (id) => parseNativePreparedModel(await request({ ...envelope(), operation: "prepareModel", manifest: document.assets, id })) }, document);
  cleanup.push(() => renderer.dispose());
  await request({ ...envelope(), operation: "open", document });
  await session.releaseAssets();
  const storage = await createNativeIndexedDbSaveStorage({ gameId: document.id, engineContract: document.engine });
  cleanup.push(() => storage.close());
  const saves = new NativeJsonSaveHost(storage, { onDiagnostic: (message) => onError(new Error(message)) });
  const input = new NativeBrowserInput(document.dimension);
  options.canvas.tabIndex = 0;
  const bindings = attachNativeBrowserInput(input, options.canvas, document.inputActions.flatMap((action) => action.bindings.map((binding) => ({ action: action.id, binding: binding.includes(":") ? binding : `key:${binding}` }))));
  cleanup.push(() => bindings.dispose());
  const hud = createNativeHud({ container: options.hud, onAction: (action, pressed) => input.set(action, pressed), onCancel: () => bindings.releaseAll() });
  cleanup.push(() => hud.dispose());
  const audio = await createNativeAudio({ assets, ticksPerSecond: 60, onError });
  cleanup.push(() => audio.dispose());
  for (const entry of assets.entries) { assets.release(entry.id); }
  const listeners = new Set<(frame: NativeFrame) => void>();
  const clock = new NativeFixedTickClock();
  const recordInputs = options.recordInputs ?? (Boolean(options.onRecordedInput) || new URL(location.href).searchParams.get("record") === "1");
  const recording = createNativePlayerInputRecording({ enabled: recordInputs, ...options.recordingLimits });
  let recordingStatus: "disabled" | "recording" | "failed" = recording ? "recording" : "disabled";
  options.canvas.dataset.nativeRecordingStatus = recordingStatus;
  let generation = 0;
  let tick = 0;
  let closed = false;
  let paused = false;
  let animation = 0;
  const commit = (value: unknown): void => {
    const frame = nativeFrame.parse(value);
    if (frame.generation !== generation) { saves.reset(frame.generation); bindings.releaseAll(); }
    generation = frame.generation;
    tick = frame.tick;
    saves.consume(frame.hostRequests, generation);
    for (const listener of listeners) { listener(frame); }
    options.canvas.dataset.nativeTick = String(frame.tick);
    options.canvas.dataset.nativeGeneration = String(frame.generation);
    options.canvas.dataset.nativeFrames = String(Number(options.canvas.dataset.nativeFrames ?? 0) + 1);
    const metrics = session.metrics();
    if (metrics) {
      options.canvas.dataset.nativeLinearMemoryBytes = String(metrics.linearMemoryBytes);
      options.canvas.dataset.nativePeakLinearMemoryBytes = String(metrics.peakLinearMemoryBytes);
      options.canvas.dataset.nativeMemoryGrowthCount = String(metrics.observedGrowthCount);
      options.canvas.dataset.nativeModuleInitializationMs = String(metrics.moduleInitializationMs);
      options.canvas.dataset.nativeDispatchMs = String(metrics.lastDispatchMs);
    }
  };
  const host: NativePresentationHost = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    pause() { paused = true; clock.pause(); bindings.releaseAll(); void audio.suspend().catch(onError); },
    resume() { if (!graphicsLost && !options.canvas.ownerDocument.hidden) { paused = false; clock.pause(false); void audio.resume().catch(onError); } },
    async close() { closed = true; cancelAnimationFrame(animation); controller.abort(); bindings.dispose(); observer.disconnect(); storage.close(); assets.dispose(); await session.close(); }
  };
  const presentation = createNativePresentationPlayer({ host, renderer, hud, audio, onError,
    benchmarkGpuCompletion: options.benchmarkGpuCompletion ?? new URL(location.href).searchParams.get("benchmark") === "1",
    onPresentedFrame: (_frame, elapsedMs, gpuComplete) => {
      const data = options.canvas.dataset;
      data.nativeSubmittedFrames = String(Number(data.nativeSubmittedFrames ?? 0) + 1);
      if (!gpuComplete) { data.nativeRenderCpuMs = String(elapsedMs); }
      if (gpuComplete) {
        data.nativeCompletedFrames = String(Number(data.nativeCompletedFrames ?? 0) + 1);
        data.nativeCanvasCompletionMs = String(elapsedMs);
        data.nativeCompletionScope = "canvas CPU+GPU completion, excludes DOM compositor/presentation";
        options.canvas.dispatchEvent(new CustomEvent("native-game-frame-complete", { detail: { elapsedMs } }));
      }
    },
    onCommittedFrame: (frame) => {
      options.onCommittedFrame?.(frame);
      options.canvas.dispatchEvent(new CustomEvent("native-game-commit", { detail: frame }));
    } });
  owner.presentation = presentation;
  const resize = (): void => presentation.resize(options.canvas.clientWidth, options.canvas.clientHeight, devicePixelRatio);
  const observer = new ResizeObserver(resize); observer.observe(options.canvas); resize();
  options.canvas.addEventListener("pointerdown", () => { void presentation?.unlockAudio().catch(onError); options.canvas.focus(); }, { signal: controller.signal });
  options.canvas.ownerDocument.addEventListener("visibilitychange", () => {
    if (options.canvas.ownerDocument.hidden) { host.pause(); } else { host.resume(); }
  }, { signal: controller.signal });
  window.addEventListener("blur", () => host.pause(), { signal: controller.signal });
  window.addEventListener("focus", () => { if (!options.canvas.ownerDocument.hidden) { host.resume(); } }, { signal: controller.signal });
  const loop = async (now: number): Promise<void> => {
    if (closed) { return; }
    try {
      const due = clock.advance(now);
      for (let index = 0; index < due && !paused; index++) {
        bindings.pollGamepads();
        const sampled = nativeRuntimeInput.parse({ ...input.sample(), loaded: saves.takeLoaded(generation) });
        const entry = { generation, tick: tick + 1, input: sampled };
        try {
          const frame = await stepWithNativeInputRecording(recording, entry, () => request({ ...envelope(), operation: "step", input: sampled }));
          options.onRecordedInput?.(structuredClone(entry));
          options.canvas.dispatchEvent(new CustomEvent("native-game-input", { detail: structuredClone(entry) }));
          commit(frame);
        } catch (error) {
          if (recording) { recordingStatus = "failed"; options.canvas.dataset.nativeRecordingStatus = recordingStatus; }
          throw error;
        }
      }
    } catch (error) { host.pause(); onError(error instanceof Error ? error : new Error(String(error))); }
    if (!closed) { animation = requestAnimationFrame((time) => { void loop(time); }); }
  };
  commit(await request({ ...envelope(), operation: "start" }));
  options.status.textContent = "";
  animation = requestAnimationFrame((time) => { void loop(time); });
  return { ...presentation, recordedInputs: () => recording?.entries() ?? [], recordingStatus: () => recordingStatus };
  } catch (error) {
    controller.abort();
    const failures = await Promise.allSettled(cleanup.reverse().map((dispose) => Promise.resolve().then(dispose)));
    for (const result of failures) {
      if (result.status === "rejected") { options.status.textContent = "Native player resource cleanup failed"; }
    }
    throw error;
  }
}
