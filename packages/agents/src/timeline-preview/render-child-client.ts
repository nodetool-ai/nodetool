import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serialize } from "node:v8";
import type { FrameLayer, FramePrecomposite, FrameAdjustment } from "@nodetool-ai/timeline/render";

export const MAX_RENDER_BYTES = 64 * 1024 * 1024;
let previousExit: Promise<void> = Promise.resolve();

export interface RenderChild {
  render(request: RenderChildRequest): Promise<RenderChildResult>;
  dispose(): Promise<void>;
}

export interface RenderChildResult { pixels: Uint8Array; skippedLayerIds: string[]; effectsNotApplied: string[]; }

export interface RenderChildRequest {
  width: number;
  height: number;
  referenceWidth: number;
  referenceHeight: number;
  layers: FrameLayer[];
  groups: FramePrecomposite[];
  adjustments: FrameAdjustment[];
}

/** Resolve a separate executable in source, compiled and flattened backend layouts. */
export function renderChildEntry(base = import.meta.url): URL {
  for (const name of ["render-child.ts", "render-child.js", "preview-render-child.mjs"]) {
    const candidate = new URL(name, base);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Timeline render child is missing. Rebuild or reinstall the backend.");
}

/** Wait for the preceding pass to exit before acquiring the only renderer. */
export async function createRenderChild(signal?: AbortSignal, entry = renderChildEntry(), timeoutMs = 30_000): Promise<RenderChild> {
  signal?.throwIfAborted();
  const predecessor = previousExit;
  let release = (): void => undefined;
  previousExit = new Promise<void>(resolve => { release = resolve; });
  let abort = (): void => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = (): void => reject(new DOMException("Timeline rendering cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    await Promise.race([predecessor, cancelled]);
    signal?.throwIfAborted();
    return startRenderChild(release, signal, entry, timeoutMs);
  } catch (error) {
    // A cancelled waiter must not release the next waiter ahead of its predecessor.
    void predecessor.then(release);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

function startRenderChild(release: () => void, signal: AbortSignal | undefined, entry: URL, timeoutMs: number): RenderChild {
  const child = fork(fileURLToPath(entry), {
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    execArgv: entry.pathname.endsWith(".ts") ? ["--import", "tsx"] : [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  let failure: Error | undefined;
  let closed = false;
  let stopping = false;
  let stderr = "";
  let pending: { resolve: (result: RenderChildResult) => void; reject: (error: Error) => void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    if (closed || stopping) return;
    stopping = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), 250);
  };
  const fail = (error: Error): void => {
    failure ??= error;
    stop();
  };
  const abort = (): void => fail(new DOMException("Timeline rendering cancelled", "AbortError"));
  signal?.addEventListener("abort", abort, { once: true });
  child.stderr?.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4096); });
  child.on("error", (error) => fail(new Error(`Timeline render child failed: ${error.message}`)));
  const exited = new Promise<void>((resolve) => {
    child.once("close", (code, exitSignal) => {
      closed = true;
      release();
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      failure ??= new Error(`Timeline render child exited (code=${code}, signal=${exitSignal}). ${stderr}`);
      pending?.reject(failure);
      pending = undefined;
      resolve();
    });
  });
  child.on("message", (message: unknown) => {
    if (!pending || stopping) return;
    clearTimeout(timer);
    if (!message || typeof message !== "object") {
      fail(new Error("Invalid timeline render child response"));
      return;
    }
    try {
      const reply = message;
      if (!("pixels" in reply) && !("error" in reply)) throw new Error("Missing render response");
      if ("error" in reply && typeof reply.error === "string") { fail(new Error(reply.error)); return; }
      if (!("pixels" in reply) || !(reply.pixels instanceof Uint8Array) || reply.pixels.byteLength > MAX_RENDER_BYTES) throw new Error("Missing render pixels");
      if (!("skippedLayerIds" in reply) || !Array.isArray(reply.skippedLayerIds) || !reply.skippedLayerIds.every(id => typeof id === "string")) throw new Error("Missing render diagnostics");
      if (!("effectsNotApplied" in reply) || !Array.isArray(reply.effectsNotApplied) || !reply.effectsNotApplied.every(type => typeof type === "string")) throw new Error("Missing effect diagnostics");
      pending.resolve({ effectsNotApplied: reply.effectsNotApplied, pixels: reply.pixels, skippedLayerIds: reply.skippedLayerIds });
      pending = undefined;
    } catch (error) {
      fail(new Error("Invalid timeline render child response", { cause: error }));
    }
  });
  if (signal?.aborted) abort();
  return {
    async render(request: RenderChildRequest): Promise<RenderChildResult> {
      if (failure) throw failure;
      if (stopping) throw new Error("Timeline renderer is disposed");
      if (pending) throw new Error("Timeline renderer already has a frame in flight");
      if (serialize(request).byteLength > MAX_RENDER_BYTES) throw new Error("Timeline render frame exceeds the 64 MiB transfer limit");
      return new Promise<RenderChildResult>((resolve, reject) => {
        pending = { resolve, reject };
        timer = setTimeout(() => fail(new Error(`Timeline render child timed out after ${timeoutMs} ms`)), timeoutMs);
        child.send(request, (error) => { if (error) fail(new Error(`Timeline render IPC failed: ${error.message}`)); });
      });
    },
    async dispose(): Promise<void> { stop(); await exited; }
  };
}
