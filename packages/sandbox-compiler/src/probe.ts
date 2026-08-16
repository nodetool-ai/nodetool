/**
 * Capability-free QuickJS admission probe.
 *
 * Bundling proves resolution, not compatibility, so admission ends by importing
 * the bundle in the engine that will run it. Importing executes top-level code,
 * which is why the probe context has nothing in it: no `fetch`, no filesystem,
 * no workspace or secret bridges, no tools, no env. Discovery must never hand a
 * package capabilities before a workflow imports it.
 *
 * What the probe proves is exactly one thing: the module initializes and its
 * exports object materializes. It cannot prove that every export works —
 * runtime loading stays authoritative after admission.
 */

import {
  getModuleLoader as createDefaultModuleLoader,
  loadQuickJs,
  modulePathNormalizer as defaultModulePathNormalizer
} from "@sebastianwessel/quickjs";
import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
/**
 * The variant package is CJS with a `default` export, so `ns.default` is the
 * variant at runtime.
 */
// SAFETY: TypeScript's CJS interop synthesizes `default` as the whole module
// object, contradicting the package's own `.d.ts`, which declares it as the
// `QuickJSSyncVariant` this reads.
const quickJsVariant = (
  quickJsVariantModule as unknown as {
    default: Parameters<typeof loadQuickJs>[0];
  }
).default;

import {
  NPM_PROBE_MAX_LOG_CHARS,
  NPM_PROBE_MAX_LOG_LINES,
  NPM_PROBE_MEMORY_BYTES,
  NPM_PROBE_STACK_BYTES,
  NPM_PROBE_TIMEOUT_MS
} from "./options.js";


/** The id the probe serves the bundle under. */
const PROBE_MODULE_ID = "nodetool-probe-module";
const DENIED_MODULE_ID = "nodetool-probe-denied";

export interface ProbeVerdict {
  readonly ok: boolean;
  /** Export names the module produced, sorted. Empty when the probe failed. */
  readonly exports: readonly string[];
  readonly error?: string;
  readonly logs: readonly string[];
}

let enginePromise: ReturnType<typeof loadQuickJs> | null = null;

function getEngine(): ReturnType<typeof loadQuickJs> {
  enginePromise ??= loadQuickJs(quickJsVariant);
  return enginePromise;
}

/** Import `source` in a bare QuickJS context and report whether it initialized. */
export async function probeBundle(source: string): Promise<ProbeVerdict> {
  const logs: string[] = [];
  const record = (message?: unknown): void => {
    if (logs.length >= NPM_PROBE_MAX_LOG_LINES) return;
    logs.push(String(message).slice(0, NPM_PROBE_MAX_LOG_CHARS));
  };
  const console = {
    log: record,
    error: record,
    warn: record,
    info: record,
    debug: record,
    trace: record
  };

  let phase: "bootstrap" | "guest" = "bootstrap";
  let denial = "";

  try {
    const { runSandboxed } = await getEngine();
    return await runSandboxed(
      async ({ ctx, evalCode }) => {
        phase = "guest";
        const deadline = Date.now() + NPM_PROBE_TIMEOUT_MS;
        ctx.runtime.setInterruptHandler(() => Date.now() > deadline);
        const result = await evalCode(
          `import * as probed from ${JSON.stringify(PROBE_MODULE_ID)};\n` +
            "export default Object.keys(probed).sort();\n"
        );
        if (result.ok) {
          const names = Array.isArray(result.data) ? result.data.map((name) => String(name)) : [];
          return { ok: true, exports: names, logs };
        }
        const failure = result.error;
        return {
          ok: false,
          exports: [],
          error: `${failure.name}: ${failure.message}`,
          logs
        };
      },
      {
        allowFetch: false,
        allowFs: false,
        enableTestUtils: false,
        env: {},
        // Milliseconds, despite the library typing it as seconds: it feeds the
        // value straight into `Date.now() + executionTimeout`.
        executionTimeout: NPM_PROBE_TIMEOUT_MS,
        memoryLimit: NPM_PROBE_MEMORY_BYTES,
        maxStackSize: NPM_PROBE_STACK_BYTES,
        maxTimeoutCount: 0,
        maxIntervalCount: 0,
        console,
        // The wrapper warms its own Node-compat modules before our function is
        // called, so only *guest*-phase resolution is restricted. After that the
        // bundle is the one and only module that resolves.
        modulePathNormalizer: (baseName, requestedName, context) => {
          if (phase === "bootstrap") {
            return defaultModulePathNormalizer(baseName, requestedName, context);
          }
          if (requestedName === PROBE_MODULE_ID) return PROBE_MODULE_ID;
          denial = `probe module requested "${requestedName}", which admission does not serve`;
          return DENIED_MODULE_ID;
        },
        getModuleLoader: (fs, runtimeOptions) => {
          const fallback = createDefaultModuleLoader(fs, runtimeOptions);
          return (moduleName, context) => {
            if (moduleName === DENIED_MODULE_ID) return { error: new Error(denial) };
            if (moduleName === PROBE_MODULE_ID) return { value: source };
            if (phase === "bootstrap") return fallback(moduleName, context);
            return { error: new Error(`Module "${moduleName}" is not available`) };
          };
        }
      }
    );
  } catch (error) {
    return {
      ok: false,
      exports: [],
      error: error instanceof Error ? error.message : String(error),
      logs
    };
  }
}
