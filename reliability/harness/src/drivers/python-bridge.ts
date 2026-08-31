/**
 * Shared Python-bridge wiring for journey 7 (`python-node-workflow`) and
 * task D3's `bridge-*` fault modules (`faults/bridge-faults.ts`).
 *
 * Both the kernel driver and the ws-server driver route any graph node type
 * the TS registry can't resolve to E2's faithful stdio fake
 * (`packages/runtime/tests/fixtures/fake-python-stdio-worker.ts`) — the same
 * fake `python-stdio-bridge.test.ts` drives directly — launched through the
 * same `fake-python-interpreter.mjs` shim, never the real
 * `python -m nodetool.worker --stdio`. `connectPythonBridgeForGraph`
 * (`@nodetool-ai/runtime`) already gates the spawn on "does this graph
 * actually contain an unresolved node type", so wiring this factory in as
 * the default for every journey (not just journey 7) costs nothing: a graph
 * built entirely from real TS nodes never triggers a spawn.
 *
 * Fault modules act purely by setting the `FAKE_WORKER_*` env vars the fake
 * fixture reads (ambient, exactly like `python-stdio-bridge.test.ts`'s own
 * `makeBridge` helper) — this factory never changes.
 */
import { join } from "node:path";
import { connectPythonBridgeForGraph } from "@nodetool-ai/runtime";
import type { BridgeFactory } from "@nodetool-ai/execution";
import { findRepoRoot } from "./repo-root.js";

/** The interpreter shim `PythonStdioBridge` spawns in place of a real
 * `python` (see `packages/runtime/tests/fixtures/fake-python-interpreter.mjs`
 * for why the indirection over the fixture worker exists). */
export function fakePythonInterpreterPath(): string {
  return join(
    findRepoRoot(),
    "packages",
    "runtime",
    "tests",
    "fixtures",
    "fake-python-interpreter.mjs"
  );
}

/** Journeys never wait on a real Python install, so a misbehaving (or
 * deliberately never-ready) fake should fail fast instead of eating a
 * journey's `timeoutMs` budget. */
export const FAKE_BRIDGE_STARTUP_TIMEOUT_MS = 3000;

/**
 * `BridgeFactory` (`@nodetool-ai/execution`'s facade hook) that spawns the
 * faithful stdio fake instead of a real Python worker whenever a journey's
 * graph contains a node type the TS registry can't resolve. Reused
 * unmodified by every `bridge-*` fault — those faults act by setting the
 * `FAKE_WORKER_*` env vars the fake fixture reads, not by changing this
 * factory. Both the kernel driver (directly, as `ExecutionSession`'s
 * `bridgeFactory`) and the ws-server driver (via its own `resolveExecutor`,
 * `connectPythonBridgeForGraph` isn't wired into `WebSocketClientSession`
 * automatically the way it is into `ExecutionSession`) use this one factory.
 */
export const journeyPythonBridgeFactory: BridgeFactory = (
  nodes,
  hasTsExecutor
) =>
  connectPythonBridgeForGraph(nodes, hasTsExecutor, {
    pythonPath: fakePythonInterpreterPath(),
    startupTimeoutMs: FAKE_BRIDGE_STARTUP_TIMEOUT_MS
  });
