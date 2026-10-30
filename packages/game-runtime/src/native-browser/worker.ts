import { z } from "zod";
import { nativeRuntimeRequest } from "@nodetool-ai/protocol/native-game";
import { nativeAssetPath } from "./assets.js";
import { NativeWasmDispatcher, nativeWasmResponse, type NativeWasmModule } from "./wasm.js";
import type { NativeBrowserMetrics } from "./session.js";

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}
type ModuleFactory = (options: { locateFile: (path: string) => string; noInitialRun: boolean }) => Promise<NativeWasmModule>;
const factorySchema = z.custom<ModuleFactory>((value) => typeof value === "function");
const initialization = z.strictObject({
  type: z.literal("initialize"), moduleUrl: z.url(), wasmUrl: z.url(),
  assets: z.array(z.strictObject({ path: z.string(), bytes: z.instanceof(Uint8Array) })).max(4096)
});

/** Worker scope injection permits transport tests without importing Node hosting. */
export function installNativeBrowserWorker(scope: WorkerScope): void {
  let dispatcher: NativeWasmDispatcher | undefined;
  let initializing = false;
  let failed = false;
  let releaseAssets: () => void = () => {};
  let observeMetrics: (dispatchMs: number) => NativeBrowserMetrics = () => { throw new Error("Native module is not ready"); };
  scope.addEventListener("message", (event) => {
    void (async () => {
      if (failed) { return; }
      try {
        const value = event.data;
        if (typeof value !== "object" || value === null || !("type" in value)) { throw new Error("Malformed native worker command"); }
        if (value.type === "initialize") {
          if (initializing || dispatcher) { throw new Error("Native worker already initialized"); }
          initializing = true;
          const input = initialization.parse(value);
          const moduleUrl = new URL(input.moduleUrl), wasmUrl = new URL(input.wasmUrl);
          if (!["http:", "https:"].includes(moduleUrl.protocol) || moduleUrl.origin !== wasmUrl.origin || moduleUrl.origin !== location.origin) { throw new Error("Native module and WASM require same-origin HTTP URLs"); }
          const paths = new Set<string>(); let total = 0;
          for (const asset of input.assets) {
            const path = nativeAssetPath(asset.path);
            if (paths.has(path)) { throw new Error("Duplicate staged asset path"); }
            paths.add(path); total += asset.bytes.byteLength;
          }
          if (total > 256 * 1024 * 1024) { throw new Error("Staged assets exceed byte budget"); }
          // Emscripten uses actual worker crypto for snapshot entropy. No deterministic substitute is installed.
          if (!globalThis.crypto?.getRandomValues) { throw new Error("Secure browser entropy is unavailable"); }
          const imported: unknown = await import(/* @vite-ignore */ input.moduleUrl);
          const factory = z.object({ default: factorySchema }).parse(imported).default;
          const moduleStarted = performance.now();
          const module = await factory({ locateFile: (path) => {
            if (path.endsWith(".wasm")) { return input.wasmUrl; }
            throw new Error(`Undeclared native runtime fetch ${path}`);
          }, noInitialRun: true });
          let metrics: NativeBrowserMetrics = { initialLinearMemoryBytes: module.HEAPU8.byteLength,
            linearMemoryBytes: module.HEAPU8.byteLength, peakLinearMemoryBytes: module.HEAPU8.byteLength,
            observedGrowthCount: 0, moduleInitializationMs: performance.now() - moduleStarted, lastDispatchMs: 0 };
          observeMetrics = (dispatchMs) => {
            const bytes = module.HEAPU8.byteLength;
            metrics = { ...metrics, linearMemoryBytes: bytes, peakLinearMemoryBytes: Math.max(metrics.peakLinearMemoryBytes, bytes),
              observedGrowthCount: metrics.observedGrowthCount + Number(bytes > metrics.linearMemoryBytes), lastDispatchMs: dispatchMs };
            return metrics;
          };
          for (const asset of input.assets) {
            const path = nativeAssetPath(asset.path);
            module.FS.mkdirTree(path.slice(0, path.lastIndexOf("/"))); module.FS.writeFile(path, asset.bytes);
          }
          // FS owns its copy. Do not retain the staging message's byte arrays in the live module closure.
          input.assets.length = 0;
          releaseAssets = () => { for (const path of paths) { module.FS.unlink(path); } paths.clear(); };
          dispatcher = new NativeWasmDispatcher(module);
          scope.postMessage({ type: "ready", metrics: observeMetrics(0) }); return;
        }
        if (value.type === "releaseAssets" && "requestId" in value && typeof value.requestId === "string" && dispatcher) {
          releaseAssets(); scope.postMessage({ type: "assetsReleased", requestId: value.requestId }); return;
        }
        if (value.type !== "request" || !("request" in value) || !dispatcher) { throw new Error("Native worker is not ready"); }
        const request = nativeRuntimeRequest.parse(value.request);
        const started = performance.now();
        const response = nativeWasmResponse(dispatcher.dispatch(request), request.requestId);
        scope.postMessage({ type: "response", response, metrics: observeMetrics(performance.now() - started) });
      } catch (error) {
        failed = true; dispatcher?.close();
        scope.postMessage({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
}

// This entry point is bundled only as a dedicated module worker.
installNativeBrowserWorker(globalThis);
