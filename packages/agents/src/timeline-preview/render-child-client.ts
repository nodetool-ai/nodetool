import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serialize, deserialize } from "node:v8";
import type { FrameLayer, FramePrecomposite, FrameAdjustment } from "@nodetool-ai/timeline/render";

export const MAX_RENDER_BYTES = 64 * 1024 * 1024;
let activeChildren = 0;

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

/** Own one bounded renderer process for a pass. dispose waits for its exit. */
export function createRenderChild(signal?: AbortSignal, entry = renderChildEntry(), timeoutMs = 30_000) {
  signal?.throwIfAborted();
  if (activeChildren >= 2) throw new Error("Timeline renderer busy: two render passes are already active. Retry after they complete.");
  const child = fork(fileURLToPath(entry), {
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    execArgv: entry.pathname.endsWith(".ts") ? ["--import", "tsx"] : [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  activeChildren++;
  let failure: Error | undefined;
  let closed = false;
  let stopping = false;
  let stderr = "";
  let pending: { resolve: (pixels: Uint8Array) => void; reject: (error: Error) => void } | undefined;
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
      activeChildren--;
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
    if (!Buffer.isBuffer(message) || message.byteLength > MAX_RENDER_BYTES) {
      fail(new Error("Invalid timeline render child response"));
      return;
    }
    try {
      const reply = deserialize(message) as { pixels?: Uint8Array; error?: string };
      if (reply.error) { fail(new Error(reply.error)); return; }
      if (!(reply.pixels instanceof Uint8Array)) throw new Error("Missing render pixels");
      pending.resolve(reply.pixels);
      pending = undefined;
    } catch (error) {
      fail(new Error("Invalid timeline render child response", { cause: error }));
    }
  });
  if (signal?.aborted) abort();
  return {
    async render(request: RenderChildRequest): Promise<Uint8Array> {
      if (failure) throw failure;
      if (stopping) throw new Error("Timeline renderer is disposed");
      if (pending) throw new Error("Timeline renderer already has a frame in flight");
      const bytes = serialize(request);
      if (bytes.byteLength > MAX_RENDER_BYTES) throw new Error("Timeline render frame exceeds the 64 MiB transfer limit");
      return new Promise<Uint8Array>((resolve, reject) => {
        pending = { resolve, reject };
        timer = setTimeout(() => fail(new Error(`Timeline render child timed out after ${timeoutMs} ms`)), timeoutMs);
        child.send(bytes, (error) => { if (error) fail(new Error(`Timeline render IPC failed: ${error.message}`)); });
      });
    },
    async dispose(): Promise<void> { stop(); await exited; }
  };
}
