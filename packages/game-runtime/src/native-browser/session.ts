import { nativeRuntimeRequest, nativeRuntimeResponse, type NativeRuntimeRequest, type NativeRuntimeResponse } from "@nodetool-ai/protocol/native-game";
import { NATIVE_BROWSER_MAX_MESSAGE_BYTES } from "./wasm.js";
import { nativeAssetPath } from "./assets.js";
import { z } from "zod";

const memoryBytes = z.number().int().nonnegative();
export const nativeBrowserMetrics = z.strictObject({
  initialLinearMemoryBytes: memoryBytes, linearMemoryBytes: memoryBytes, peakLinearMemoryBytes: memoryBytes,
  observedGrowthCount: z.number().int().nonnegative(), moduleInitializationMs: z.number().finite().nonnegative(),
  lastDispatchMs: z.number().finite().nonnegative()
});
export type NativeBrowserMetrics = z.infer<typeof nativeBrowserMetrics>;

export interface NativeBrowserSession {
  request(request: NativeRuntimeRequest, signal?: AbortSignal): Promise<NativeRuntimeResponse>;
  releaseAssets(): Promise<void>;
  /** Observed WASM linear-memory extent. This does not measure live C++ allocations or GPU memory. */
  metrics(): Readonly<NativeBrowserMetrics> | null;
  close(): Promise<void>;
}
export interface NativeBrowserWorkerTransport {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "error", listener: (event: Event) => void): void;
}
export interface NativeBrowserSessionOptions {
  readonly workerUrl: string | URL;
  readonly moduleUrl: string | URL;
  readonly wasmUrl: string | URL;
  readonly assets?: readonly { readonly path: string; readonly bytes: Uint8Array }[];
  readonly requestTimeoutMs?: number;
  readonly maxQueuedRequests?: number;
  readonly maxQueuedBytes?: number;
  readonly createWorker?: (url: string | URL) => NativeBrowserWorkerTransport;
}
export class NativeBrowserSessionError extends Error {
  constructor(readonly code: "closed" | "backpressure" | "protocol" | "session_lost" | "cancelled", message: string) {
    super(message); this.name = "NativeBrowserSessionError";
  }
}
interface Pending {
  readonly request: NativeRuntimeRequest;
  readonly bytes: number;
  readonly signal?: AbortSignal;
  readonly resolve: (value: NativeRuntimeResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly abort: () => void;
  readonly releaseAssets?: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** One live dispatcher, one in-flight call. Terminating it invalidates its authenticated snapshots. */
export async function createNativeBrowserSession(options: NativeBrowserSessionOptions): Promise<NativeBrowserSession> {
  const timeout = options.requestTimeoutMs ?? 30_000;
  const maxRequests = options.maxQueuedRequests ?? 64;
  const maxBytes = options.maxQueuedBytes ?? NATIVE_BROWSER_MAX_MESSAGE_BYTES;
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(maxRequests) || maxRequests < 1 ||
      maxRequests > 64 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > NATIVE_BROWSER_MAX_MESSAGE_BYTES) {
    throw new Error("Invalid native browser session limits");
  }
  let assetBytes = 0;
  const assetPaths = new Set<string>();
  if ((options.assets?.length ?? 0) > 4096) { throw new Error("Native staged asset count exceeds its budget"); }
  for (const asset of options.assets ?? []) {
    const path = nativeAssetPath(asset.path);
    if (assetPaths.has(path)) { throw new Error("Duplicate native staged asset path"); }
    assetPaths.add(path); assetBytes += asset.bytes.byteLength;
    if (assetBytes > 256 * 1024 * 1024) { throw new Error("Native staged assets exceed byte budget"); }
  }
  const worker: NativeBrowserWorkerTransport = options.createWorker?.(options.workerUrl) ?? new Worker(options.workerUrl, { type: "module" });
  const queue: Pending[] = [];
  let active: Pending | undefined;
  let queuedBytes = 0;
  let closed = false;
  let metrics: NativeBrowserMetrics | null = null;
  let readyResolve: () => void = () => {};
  let readyReject: (reason: unknown) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const dispose = (item: Pending): void => { clearTimeout(item.timer); item.signal?.removeEventListener("abort", item.abort); queuedBytes -= item.bytes; };
  const fail = (error: Error): void => {
    if (closed) { return; }
    closed = true; worker.terminate();
    worker.removeEventListener("message", message); worker.removeEventListener("error", workerError);
    readyReject(error);
    if (active) { dispose(active); active.reject(error); active = undefined; }
    for (const item of queue.splice(0)) { dispose(item); item.reject(error); }
  };
  const pump = (): void => {
    if (closed || active || !queue.length) { return; }
    active = queue.shift();
    if (!active) { return; }
    active.timer = setTimeout(() => fail(new NativeBrowserSessionError("session_lost", "Native call exceeded its deadline. The live session was lost.")), timeout);
    try { worker.postMessage(active.releaseAssets ? { type: "releaseAssets", requestId: active.request.requestId } : { type: "request", request: active.request }); }
    catch (error) { fail(new NativeBrowserSessionError("session_lost", `Worker dispatch failed: ${String(error)}`)); }
  };
  const message = (event: MessageEvent<unknown>): void => {
    const value = event.data;
    if (typeof value !== "object" || value === null || !("type" in value)) { fail(new NativeBrowserSessionError("protocol", "Malformed worker message")); return; }
    if ("metrics" in value) {
      const parsed = nativeBrowserMetrics.safeParse(value.metrics);
      if (!parsed.success) { fail(new NativeBrowserSessionError("protocol", "Invalid native worker metrics")); return; }
      metrics = parsed.data;
    }
    if (value.type === "ready") { readyResolve(); return; }
    if (value.type === "fatal") {
      const detail = "message" in value && typeof value.message === "string" ? value.message.slice(0, 4096) : "Unknown worker failure";
      fail(new NativeBrowserSessionError("session_lost", `${detail}. The live native browser session was lost.`)); return;
    }
    if (value.type === "assetsReleased" && "requestId" in value && active?.releaseAssets && value.requestId === active.request.requestId) {
      const item = active; active = undefined; dispose(item);
      item.resolve({ protocolVersion: 1, requestId: item.request.requestId, status: "ok", result: { closed: true } }); pump(); return;
    }
    if (value.type !== "response" || !("response" in value)) { fail(new NativeBrowserSessionError("protocol", "Unexpected worker message")); return; }
    try {
      if (new TextEncoder().encode(JSON.stringify(value.response)).byteLength > NATIVE_BROWSER_MAX_MESSAGE_BYTES) { throw new Error("Response exceeds byte budget"); }
      const response = nativeRuntimeResponse.parse(value.response);
      if (!active || active.request.requestId !== response.requestId) { throw new Error("Worker response request ID does not match the in-flight call"); }
      const item = active; active = undefined; dispose(item); item.resolve(response); pump();
    } catch (error) { fail(new NativeBrowserSessionError("protocol", String(error))); }
  };
  const workerError = (): void => fail(new NativeBrowserSessionError("session_lost", "Native worker crashed. The live session was lost."));
  worker.addEventListener("message", message); worker.addEventListener("error", workerError);
  const startupTimer = setTimeout(() => fail(new NativeBrowserSessionError("session_lost", "Native worker startup exceeded its deadline")), timeout);
  try {
    worker.postMessage({ type: "initialize", moduleUrl: String(options.moduleUrl), wasmUrl: String(options.wasmUrl), assets: options.assets ?? [] });
    await ready;
  } catch (error) {
    fail(new NativeBrowserSessionError("session_lost", String(error)));
    // A synchronous structured-clone failure occurs before the ready promise is awaited.
    await ready.catch(() => {});
    throw error;
  }
  finally { clearTimeout(startupTimer); }
  const enqueue = async (input: NativeRuntimeRequest, signal?: AbortSignal, releaseAssets = false): Promise<NativeRuntimeResponse> => {
      signal?.throwIfAborted();
      if (closed) { throw new NativeBrowserSessionError("closed", "Native browser session is closed"); }
      const request = nativeRuntimeRequest.parse(input);
      const bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
      if (queue.length + Number(Boolean(active)) >= maxRequests || bytes > maxBytes - queuedBytes) {
        throw new NativeBrowserSessionError("backpressure", "Native browser request queue is full");
      }
      if (active?.request.requestId === request.requestId || queue.some((item) => item.request.requestId === request.requestId)) {
        throw new NativeBrowserSessionError("protocol", "Native request ID is already pending");
      }
      return new Promise((resolve, reject) => {
        const item: Pending = { request, bytes, signal, resolve, reject, releaseAssets, abort: () => {
          if (active === item) { fail(new NativeBrowserSessionError("session_lost", "In-flight request cancelled. The live session was lost.")); }
          else { const index = queue.indexOf(item); if (index >= 0) { queue.splice(index, 1); dispose(item); reject(new NativeBrowserSessionError("cancelled", "Queued native request cancelled")); } }
        } };
        queuedBytes += bytes; queue.push(item); signal?.addEventListener("abort", item.abort, { once: true });
        if (signal?.aborted) { item.abort(); } else { pump(); }
      });
    };
  return {
    request: enqueue,
    metrics: () => metrics ? { ...metrics } : null,
    async releaseAssets() {
      await enqueue({ protocolVersion: 1, requestId: `release-${crypto.randomUUID()}`, operation: "hello" }, undefined, true);
    },
    async close() { fail(new NativeBrowserSessionError("closed", "Native browser session is closed")); }
  };
}
