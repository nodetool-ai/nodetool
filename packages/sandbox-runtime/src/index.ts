import type { Workspace } from "@nodetool-ai/runtime-core";
import { safeFetch } from "@nodetool-ai/runtime-core/safe-url";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol";
import { runInWorker } from "./js-sandbox-worker/host.js";
import { deriveBridgeShape } from "./js-sandbox-worker/protocol.js";
import {
  SANDBOX_INPUT_TAKE_BINDING,
  SANDBOX_STREAM_OPEN_BINDING,
  NO_INPUT_STREAM_MESSAGE
} from "./js-sandbox-worker/interpreter.js";
import {
  resolveSandboxLimits,
  DEFAULT_TIMEOUT_MS,
  MAX_LOOP_ITERATIONS,
  type SandboxLimits
} from "./limits.js";
import { toGuestBytes, SANDBOX_BYTES_MARKER } from "./sandbox-bytes.js";
export { resolveSandboxLimits, type SandboxLimits } from "./limits.js";

export interface SandboxOptions {
  readonly code: string;
  readonly globals?: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly limits?: SandboxLimits;
  readonly workspace?: Workspace;
  readonly getSecret?: (name: string) => Promise<string | undefined>;
  readonly readAsset?: (reference: unknown) => Promise<Uint8Array>;
  readonly onLog?: (level: string, text: string) => void;
  readonly onProgress?: (percent: number, text?: string) => void;
  /** Already-resolved guest JavaScript only. Host/WASM capabilities require explicit adapters. */
  readonly modules?: SandboxModuleResolution;
}
export interface SandboxResult {
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: string;
  readonly logs: readonly string[];
  readonly outputs?: Record<string, unknown>;
  readonly emitted?: readonly { name: string; value: unknown }[];
}

function nativeBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    SANDBOX_BYTES_MARKER in value &&
    typeof value[SANDBOX_BYTES_MARKER] === "string"
  ) {
    return new Uint8Array(Buffer.from(value[SANDBOX_BYTES_MARKER], "base64"));
  }
  throw new Error("Expected binary bytes");
}

/** Execute on the canonical isolated QuickJS worker, with explicitly supplied bridges. */
export async function runInSandbox(
  options: SandboxOptions
): Promise<SandboxResult> {
  const limits = resolveSandboxLimits(options.limits);
  const timeoutMs = Math.min(
    Math.max(Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS), 1),
    10 * 60 * 1000
  );
  if (!Number.isFinite(timeoutMs)) {
    throw new Error("Sandbox timeout must be finite");
  }
  if (options.modules?.modules.some((module) => module.kind !== "js")) {
    throw new Error(
      "Sandbox host and WASM modules require an explicitly installed capability adapter"
    );
  }
  const logs: string[] = [];
  const outputs: Record<string, unknown> = {};
  const emitted: Array<{ name: string; value: unknown }> = [];
  let logBytes = 0;
  let outputBytes = 0;
  let fetchCalls = 0;
  let progressCalls = 0;
  let lastProgress = 0;
  const assertOutput = (name: unknown, value: unknown): string => {
    if (typeof name !== "string" || !name) {
      throw new Error("Output names must be nonempty strings");
    }
    const serialized = JSON.stringify(value);
    outputBytes += Buffer.byteLength(serialized ?? "null");
    if (outputBytes > limits.maxOutputSize) {
      throw new Error("Sandbox output size limit exceeded");
    }
    return name;
  };
  const unavailable = async (): Promise<never> => {
    throw new Error("This capability is not installed in the sandbox host");
  };
  const requiredWorkspace = (): Workspace => {
    if (!options.workspace) {
      throw new Error("Workspace is unavailable for this run");
    }
    return options.workspace;
  };
  const console = Object.fromEntries(
    ["log", "info", "warn", "error"].map((level) => [
      level,
      (...args: unknown[]) => {
        if (logs.length >= 5000 || logBytes >= 1_000_000) {
          return;
        }
        const text = args
          .map((value) =>
            typeof value === "string" ? value : JSON.stringify(value)
          )
          .join(" ")
          .slice(0, 4000);
        logBytes += text.length;
        logs.push(text);
        try {
          options.onLog?.(level, text);
        } catch {
          /* Reporting cannot break execution. */
        }
      }
    ])
  );
  const bridges: Record<string, unknown> = {
    console,
    __maxIter: MAX_LOOP_ITERATIONS,
    __secretScope: limits.secretScope,
    [SANDBOX_INPUT_TAKE_BINDING]: async () => {
      throw new Error(NO_INPUT_STREAM_MESSAGE);
    },
    [SANDBOX_STREAM_OPEN_BINDING]: () => false,
    crypto: {
      randomUUID: () => globalThis.crypto.randomUUID(),
      getRandomValues: (length: number) =>
        toGuestBytes(
          globalThis.crypto.getRandomValues(
            new Uint8Array(Math.min(Math.max(Math.floor(length), 0), 65536))
          )
        ),
      digest: async (algorithm: string, data: unknown) =>
        toGuestBytes(
          new Uint8Array(
            await globalThis.crypto.subtle.digest(
              algorithm,
              new Uint8Array(nativeBytes(data))
            )
          )
        ),
      hmac: unavailable
    },
    sleep: async (milliseconds: number) => {
      const delay = Math.min(Math.max(Number(milliseconds), 0), timeoutMs);
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => {
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", abort);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", abort);
          resolve();
        }, delay);
        if (options.signal?.aborted) {
          abort();
        } else {
          options.signal?.addEventListener("abort", abort, { once: true });
        }
      });
    },
    getSecret: async (name: string) => {
      if (limits.secretScope !== null && !limits.secretScope.includes(name)) {
        throw new Error(`Secret ${name} is outside this run's scope`);
      }
      if (!options.getSecret) {
        throw new Error("Secret access is unavailable for this run");
      }
      return options.getSecret(name);
    },
    workspace: {
      read: async (path: string) => {
        const text = await requiredWorkspace().readText(path);
        if (text === null) {
          throw new Error("File not found");
        }
        return text;
      },
      write: (path: string, text: string) =>
        requiredWorkspace().write(path, text),
      readBytes: async (path: string) => {
        const bytes = await requiredWorkspace().read(path);
        if (!bytes) {
          throw new Error("File not found");
        }
        return toGuestBytes(bytes);
      },
      writeBytes: (path: string, value: unknown) =>
        requiredWorkspace().write(path, nativeBytes(value)),
      list: async (path: string) =>
        (await requiredWorkspace().list(path)).map((entry) => entry.name),
      stat: async (path: string) => {
        const stat = await requiredWorkspace().stat(path);
        return stat
          ? {
              exists: true,
              size: stat.size,
              isDirectory: stat.isDirectory,
              isFile: !stat.isDirectory,
              isSymlink: false,
              modifiedMs: stat.modifiedAt
            }
          : { exists: false };
      },
      mkdir: (path: string) => requiredWorkspace().mkdir(path),
      remove: (path: string) => requiredWorkspace().delete(path),
      copy: (from: string, to: string) => requiredWorkspace().copy(from, to),
      move: (from: string, to: string) => requiredWorkspace().move(from, to),
      root: async () => "/workspace"
    },
    progress: (percent: number, message?: string) => {
      const now = Date.now();
      if (
        progressCalls >= 1000 ||
        (progressCalls > 0 && now - lastProgress < 100)
      ) {
        return;
      }
      progressCalls++;
      lastProgress = now;
      try {
        options.onProgress?.(
          Math.min(Math.max(Number(percent) || 0, 0), 100),
          message?.slice(0, 500)
        );
      } catch {
        /* Reporting cannot break execution. */
      }
    },
    emit: async (name: unknown, value: unknown) => {
      if (emitted.length >= 10000) {
        throw new Error("Sandbox emit limit exceeded");
      }
      emitted.push({ name: assertOutput(name, value), value });
    },
    output: async (name: unknown, value: unknown) => {
      const handle = assertOutput(name, value);
      if (Object.hasOwn(outputs, handle)) {
        throw new Error(`Output ${handle} was already set`);
      }
      Object.defineProperty(outputs, handle, { value, enumerable: true });
    },
    fetch: async (url: string, init?: RequestInit) => {
      if (++fetchCalls > limits.maxFetchCalls) {
        throw new Error("Sandbox fetch call limit exceeded");
      }
      const signal = options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(limits.fetchTimeoutMs)
          ])
        : AbortSignal.timeout(limits.fetchTimeoutMs);
      const response = await safeFetch(url, { ...init, signal });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) {
              break;
            }
            size += next.value.byteLength;
            if (size > limits.maxResponseBodyBytes) {
              throw new Error("Sandbox response size limit exceeded");
            }
            chunks.push(next.value);
          }
        } finally {
          await reader.cancel();
        }
      }
      const bytes = Buffer.concat(chunks);
      const body = bytes.toString("utf8");
      let json: unknown = null;
      try {
        json = JSON.parse(body);
      } catch {
        /* A non-JSON response remains text. */
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        body,
        json,
        bodyBytes: toGuestBytes(bytes)
      };
    },
    assetToSandbox: unavailable,
    sandboxToAsset: unavailable,
    image: {},
    audio: {},
    video: {},
    canvas: {},
    format: {},
    media: {
      bytes: async (reference: unknown) => {
        if (!options.readAsset) {
          throw new Error("Asset access is unavailable for this run");
        }
        return toGuestBytes(await options.readAsset(reference));
      },
      text: async (reference: unknown) => {
        if (!options.readAsset) {
          throw new Error("Asset access is unavailable for this run");
        }
        return new TextDecoder().decode(await options.readAsset(reference));
      }
    }
  };
  const globals: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(options.globals ?? {})) {
    if (!Object.hasOwn(bridges, name) && /^[A-Za-z_$][\w$]*$/.test(name)) {
      globals[name] = value;
    }
  }
  const message = await runInWorker({
    run: {
      runId: globalThis.crypto.randomUUID(),
      code: options.code,
      timeoutMs,
      limits,
      suspendAllowanceMs: 0,
      hasClock: false,
      engineTimeoutMs: timeoutMs,
      streamOpenSeed: null,
      bridgeShape: deriveBridgeShape({ bridges, dispatchers: [], globals }),
      modules: options.modules
    },
    dispatch: bridges,
    signal: options.signal,
    onLog: () => {},
    onProgress: () => {}
  });
  if (!message) {
    return { success: false, error: "QuickJS worker is unavailable", logs };
  }
  for (const [name, value] of Object.entries(message.syncedGlobals ?? {})) {
    const target = options.globals?.[name];
    if (
      target &&
      typeof target === "object" &&
      value &&
      typeof value === "object"
    ) {
      for (const key of Object.keys(target)) {
        Reflect.deleteProperty(target, key);
      }
      Object.assign(target, value);
    }
  }
  if (options.signal?.aborted || message.failure === "cancelled") {
    return { success: false, error: "Execution cancelled", logs };
  }
  if (!message.evalOk) {
    return {
      success: false,
      error: message.errorMessage ?? "Sandbox execution failed",
      logs
    };
  }
  if (
    Buffer.byteLength(JSON.stringify(message.data) ?? "null") >
    limits.maxOutputSize
  ) {
    return {
      success: false,
      error: "Sandbox output size limit exceeded",
      logs
    };
  }
  return { success: true, result: message.data, logs, outputs, emitted };
}
