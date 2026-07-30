/**
 * Bridge-seam fault modules (docs/RELIABILITY_ARCHITECTURE.md §9; task D3).
 *
 * Each of the five `bridge-*` fault names in `cli.ts`'s `KNOWN_FAULT_TYPES`
 * drives E2's faithful stdio fake worker
 * (`packages/runtime/tests/fixtures/fake-python-stdio-worker.ts`) with the
 * `FAKE_WORKER_*` env var it already understands — the exact same knobs
 * `packages/runtime/tests/python-stdio-bridge.test.ts` uses directly against
 * `PythonStdioBridge`. `configure()` sets the env vars ambient (the fake
 * interpreter shim spawns with `env: process.env`, see
 * `python-stdio-bridge.ts`'s `_spawnCandidate`), and the teardown restores
 * whatever was there before — same "process-global side effect, always
 * undone" contract `provider-faults.ts` uses for the provider registry.
 *
 * The driver-side wiring that actually spawns the fake worker for a graph
 * that needs one lives in `drivers/python-bridge.ts` (shared by the kernel
 * and ws-server drivers) — these fault modules never touch a driver or a
 * bridge instance directly, only the env vars the next spawn will read.
 */
import { registerFaultModule } from "./registry.js";
import type { FaultContext, FaultModule, FaultTeardown } from "./types.js";

/** `cli.ts`'s `KNOWN_FAULT_TYPES` `bridge-*` entries, mapped to the
 * `FAKE_WORKER_*` env vars that reproduce each fault against E2's fake
 * (see that fixture's own doc comment for the full knob list). */
const FAULT_ENV_BY_NAME: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Worker exits without responding once it receives an `execute` request —
  // `PythonStdioBridge.execute()` rejects the pending request when the
  // process exits (`python-stdio-bridge.test.ts`: "rejects pending requests
  // when the worker exits mid-request").
  "bridge-exit-mid-request": { FAKE_WORKER_EXIT_ON_TYPE: "execute" },
  // Worker replies to `execute` with an absurd length prefix instead of a
  // real frame — `FrameDecoder` fails the whole connection
  // (`FrameSizeError`), same path a real desynced/corrupted stream hits.
  "bridge-framing-violation": { FAKE_WORKER_BAD_LENGTH_ON_TYPE: "execute" },
  // Worker never emits "NODETOOL_STDIO_READY" — `connect()`'s startup timer
  // (`FAKE_BRIDGE_STARTUP_TIMEOUT_MS` in `drivers/python-bridge.ts`) fires
  // instead of a normal ready signal.
  "bridge-never-ready": { FAKE_WORKER_MODE: "never-ready" },
  // Worker's stdin read end is closed immediately (before `discover` is even
  // sent, given the ready-signal head start), so the bridge's very first
  // write hits a genuinely broken pipe — the same EPIPE path
  // `python-stdio-bridge.test.ts`'s "fails connect() with EPIPE" test drives.
  "bridge-epipe": {
    FAKE_WORKER_CLOSE_STDIN_AFTER_MS: "0",
    FAKE_WORKER_READY_DELAY_MS: "400"
  },
  // Worker reports a `protocol_version` below `MIN_BRIDGE_PROTOCOL_VERSION`
  // (1, `@nodetool-ai/protocol/bridge-protocol`) — the bridge's hard-floor
  // check in `python-bridge-base.ts`'s discover handler rejects the connect.
  "bridge-version-mismatch": { FAKE_WORKER_PROTOCOL_VERSION: "0" }
};

function applyEnvOverrides(env: Readonly<Record<string, string>>): FaultTeardown {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  return () => {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function configureBridgeFault(name: string, _ctx: FaultContext): FaultTeardown {
  const env = FAULT_ENV_BY_NAME[name];
  if (!env) {
    throw new Error(`bridge-faults.ts: no env mapping for fault "${name}"`);
  }
  return applyEnvOverrides(env);
}

function makeBridgeFaultModule(name: string): FaultModule {
  return {
    name,
    seam: "bridge",
    configure: (ctx) => configureBridgeFault(name, ctx)
  };
}

export const BRIDGE_FAULT_MODULES: readonly FaultModule[] = Object.keys(
  FAULT_ENV_BY_NAME
).map(makeBridgeFaultModule);

/** Registers every bridge-seam fault module. Called once from
 * `faults/index.ts`'s module-load side effect (task D1's "call once, own
 * module state" contract) — safe to call again, last-write-wins. */
export function registerBridgeFaultModules(): void {
  for (const module of BRIDGE_FAULT_MODULES) {
    registerFaultModule(module);
  }
}
