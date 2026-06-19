# PythonBridge Interface + SwappableBridge — Design Spec

**Date:** 2026-06-09
**Status:** Draft for implementation
**Related:** the worker-model-management feature and the attach→bridge reroute fix (server swaps a `WebsocketPythonBridge` in on attach). This refactor replaces the ad-hoc `getPythonBridge()` live-read holder with a proper abstraction.

## Problem

`PythonBridge` is a type alias to an **abstract class**, not an interface:

```ts
// packages/runtime/src/index.ts
export type PythonBridge = PythonBridgeBase;
```

To make "attach a worker" reroute all Python work to the worker, the server currently keeps a mutable `activeBridge` and hands consumers a `getPythonBridge()` getter that they must remember to call **live** at every use site (per-request in the tRPC context, per-node in `resolveExecutor`, per-message in `/ws/download`). That works but it is leaky: the "swap" concept lives in `server.ts`, every consumer must opt into the live-read discipline, and the server wires bridge event listeners onto *two* separate bridge instances (`pythonBridge` and each worker bridge) to keep diagnostics and the idle-touch working across a swap.

A cleaner seam: make `PythonBridge` a real **interface**, and provide a `SwappableBridge` that implements it by delegating to a current target. Consumers then hold **one stable reference** whose behavior follows the active worker automatically — no live getter, no double-wired listeners.

## Goal

1. Extract a `PythonBridge` **interface** describing the public bridge surface; make `PythonBridgeBase implements PythonBridge`. No behavior change to existing bridges.
2. Add a `SwappableBridge` class that `implements PythonBridge` by delegating every method to a current target bridge and re-emitting its events. Swapping the target is transparent to holders of the reference.
3. Rewire `server.ts` to construct one `SwappableBridge` (wrapping the local bridge), pass that single stable reference to the tRPC context and the WebSocket plugin, and implement attach/detach as `swap`. Remove the `getPythonBridge()` getter, the `activeBridge`/`workerBridge` module vars, and the duplicated `attachWorkerBridgeListeners`.

This is a structural refactor: **no user-visible behavior change**. Attaching still reroutes execution + model management to the worker; detaching still returns to local.

## Design

### 1. The `PythonBridge` interface (`packages/runtime/src/python-bridge-types.ts`)

Declare an interface that **extends `EventEmitter`** (so `on`/`off`/`once`/`emit`/`removeAllListeners` are part of the contract, and both the abstract base and the swappable wrapper — each already an `EventEmitter` — satisfy it for free):

```ts
import { EventEmitter } from "node:events";

export interface PythonBridge extends EventEmitter {
  // copy the EXACT public signatures from PythonBridgeBase:
  connect(): Promise<void>;
  ensureConnected(): Promise<void>;
  execute(/* …exact params… */): Promise</* … */>;
  executeStream(/* …exact params… */): AsyncGenerator</* … */>;
  cancel(requestId: string): void;
  getNodeMetadata(): PythonNodeMetadata[];
  getLoadErrors(): /* exact return */;
  getWorkerStatus(): Promise</* exact */>;
  hasNodeType(nodeType: string): boolean;
  readonly isConnected: boolean;
  isAvailable(): boolean;
  listProviders(): Promise<PythonProviderInfo[]>;
  getProviderModels(/* … */): Promise</* … */>;
  providerGenerate(/* … */): Promise</* … */>;
  providerTextToImage(/* … */): Promise</* … */>;
  providerImageToImage(/* … */): Promise</* … */>;
  providerASR(/* … */): Promise</* … */>;
  providerEmbedding(/* … */): Promise</* … */>;
  listCachedModels(): Promise<UnifiedModelLike[]>;
  downloadModel(
    req: ModelDownloadRequest,
    onProgress: (update: ModelDownloadUpdate) => void,
    requestId?: string
  ): Promise<void>;
  cancelModelDownload(requestId: string): void;
  deleteCachedModel(repoId: string): Promise<boolean>;
  supportsModelManagement(): boolean;
  getRecentStderrSummary(limit?: number): string | null;
  close(): void;
}
```

Implementation notes:
- **Copy the exact signatures** from `PythonBridgeBase` — do not approximate. Run a typecheck; if `PythonBridgeBase implements PythonBridge` fails, the interface is wrong, fix it to match the class (the class is the source of truth).
- `setTarget` is intentionally **excluded** — it exists only on `WebsocketPythonBridge`, not on every bridge. `SwappableBridge` supersedes it.
- Keep `export type PythonBridge` working for downstream imports by exporting the interface under the same name. Update `packages/runtime/src/index.ts`: it currently does `export type PythonBridge = PythonBridgeBase;` — change to re-export the interface (`export type { PythonBridge } from "./python-bridge-types.js";`). `PythonBridgeBase` stays exported as the concrete base.
- Add `implements PythonBridge` to the `PythonBridgeBase` class declaration. The two concretes (`PythonStdioBridge`, `WebsocketPythonBridge`) extend the base, so they satisfy the interface automatically.

### 2. `SwappableBridge` (`packages/runtime/src/swappable-python-bridge.ts`, new)

```ts
export class SwappableBridge extends EventEmitter implements PythonBridge {
  private _target: PythonBridge;
  // bound forwarders kept so listeners can be removed on swap:
  private readonly _forwarders = new Map<string, (...args: unknown[]) => void>();

  constructor(initial: PythonBridge) {
    super();
    this._target = initial;
    this._subscribe(initial);
  }

  /** The currently-delegated target (server compares this to the local bridge). */
  get target(): PythonBridge { return this._target; }

  /** Swap the delegate. Re-points event forwarding; does NOT close either bridge. */
  swap(next: PythonBridge): void {
    if (next === this._target) return;
    this._unsubscribe(this._target);
    this._target = next;
    this._subscribe(next);
  }

  // every PythonBridge method delegates to this._target:
  connect() { return this._target.connect(); }
  ensureConnected() { return this._target.ensureConnected(); }
  execute(...a) { return this._target.execute(...a); }
  executeStream(...a) { return this._target.executeStream(...a); } // async generator: just return it
  cancel(id) { return this._target.cancel(id); }
  // …delegate ALL remaining interface methods identically…
  get isConnected() { return this._target.isConnected; }
  close() { this._target.close(); }
}
```

**Event forwarding.** The forwarded event list is the set the bridges emit plus the ones consumers listen for:

```ts
const FORWARDED_EVENTS = [
  "stderr", "stdout", "error", "exit", "activity", "progress", "reconnected"
] as const;
```

(Derive/confirm this list by grepping `this.emit(` across `python-bridge-base.ts`, `python-websocket-bridge.ts`, `python-stdio-bridge.ts`.)

`_subscribe(target)` attaches one bound listener per event that re-emits on `this`; `_unsubscribe(target)` removes them (using the stored bound refs in `_forwarders`). Special case `"error"`: re-emitting `"error"` on an `EventEmitter` with no listener **throws** — guard with `if (this.listenerCount("error") > 0) this.emit("error", err);` else swallow (or log via a passed logger). Every other event re-emits unconditionally.

`swap()` only re-points listeners; it never connects or closes a bridge — the caller owns lifecycle (the server connects the worker bridge before swapping and closes it after swapping away).

Export `SwappableBridge` from `packages/runtime/src/index.ts`.

### 3. Server rewiring (`packages/websocket/src/server.ts`)

Replace the current holder with a single swappable bridge:

```ts
const localBridge = createPythonBridge({ /* …existing args… */ });
const pythonBridge = new SwappableBridge(localBridge);   // the ONE stable reference
```

- **Listeners wired once.** Keep the existing `pythonBridge.on("stderr"|"error"|"exit"|"activity", …)` blocks exactly as they are, now attached to the `SwappableBridge`. They fire across swaps via re-emission. **Delete `attachWorkerBridgeListeners`** and the per-worker-bridge listener wiring added by the previous fix — it is now redundant.
- **`repointPythonBridge(target)`** becomes the swap:
  - attach: build `next = new WebsocketPythonBridge({ wsUrl, workerToken })`, `await next.connect()`, then `pythonBridge.swap(next)`. Track the previous worker bridge so it can be closed: `if (prevWorker) prevWorker.close()`. On connect failure, `next.close()` and rethrow (so the tRPC attach rolls back — keep the existing rollback in the worker router).
  - detach: `pythonBridge.swap(localBridge)`, then close the worker bridge.
  - Keep a module-level `let workerBridge: WebsocketPythonBridge | null` for the close-on-swap bookkeeping.
- **Readiness.** `pythonBridgeReady` stays the local-bridge node-registration flag. Replace `getActivePythonBridgeReady` with:
  ```ts
  const isLocalActive = () => pythonBridge.target === localBridge;
  const getPythonBridgeReady = () =>
    isLocalActive() ? pythonBridgeReady : pythonBridge.isConnected;
  ```
- **Remove** `getPythonBridge`, `activeBridge`, and the `getActivePythonBridgeReady` name. Pass the single `pythonBridge` (the `SwappableBridge`) and `getPythonBridgeReady` to the context factory and the plugin.

### 4. Consumers revert to a plain reference

- **`trpc/context.ts`:** revert `getPythonBridge: () => PythonBridge` back to `pythonBridge: PythonBridge`; the factory returns `pythonBridge: deps.pythonBridge` (no per-request getter needed — the swappable ref is stable and self-updating).
- **`plugins/websocket.ts`:** revert the option to `pythonBridge: PythonBridge`; remove the per-handler `const pythonBridge = getPythonBridge()` reads — destructure `pythonBridge` from opts and use it directly in `resolveExecutor`, the runner construction, and the `/ws/download` handler. (The reference is the swappable bridge, so it already follows the active worker.)
- **`ensurePythonBridge`** (in `server.ts`): `await pythonBridge.ensureConnected()` (delegates to the active target). Keep the `if (active !== localBridge) return;`-style guard so node-metadata registration runs only for the local bridge — express it as `if (!isLocalActive()) return;` before setting `pythonBridgeReady = true` and registering nodes.
- **`test-ui-server.ts`** and the tests changed by the previous fix (`trpc-http.test.ts`, `trpc-integration.test.ts`) revert from `getPythonBridge: () => …` back to `pythonBridge: …`.

The `RepointPythonBridge` type stays `(target) => void | Promise<void>` (attach awaits the worker connect).

## Files

- `packages/runtime/src/python-bridge-types.ts` — add `PythonBridge` interface.
- `packages/runtime/src/python-bridge-base.ts` — `class PythonBridgeBase … implements PythonBridge`.
- `packages/runtime/src/swappable-python-bridge.ts` — **new**, `SwappableBridge`.
- `packages/runtime/src/index.ts` — export `SwappableBridge`; re-export `PythonBridge` interface (replacing the `= PythonBridgeBase` alias).
- `packages/websocket/src/server.ts` — wrap local bridge in `SwappableBridge`; `repoint` = swap; single listener wiring; drop `getPythonBridge`/`activeBridge`/`attachWorkerBridgeListeners`.
- `packages/websocket/src/trpc/context.ts` — back to `pythonBridge`.
- `packages/websocket/src/plugins/websocket.ts` — back to `pythonBridge` (stable ref).
- `packages/websocket/src/test-ui-server.ts`, `tests/trpc-http.test.ts`, `tests/trpc-integration.test.ts` — revert to `pythonBridge`.

## Testing

- **`SwappableBridge` unit tests** (`packages/runtime/tests/swappable-python-bridge.test.ts`, new), using two fake `PythonBridge`s (or two `startFakeWorker` websocket bridges):
  - delegates a method call (e.g. `listCachedModels`) to the current target; after `swap`, calls hit the new target.
  - `isConnected` reflects the current target.
  - events from the current target re-emit on the swappable bridge; after `swap`, events from the **old** target no longer fire and events from the **new** target do (assert listener re-pointing).
  - `"error"` is not re-emitted when there is no `"error"` listener (no throw); is forwarded when a listener exists.
  - `swap` to the same target is a no-op; `swap` does not connect or close either target.
- **Type-level:** `PythonBridgeBase implements PythonBridge`, `WebsocketPythonBridge`/`PythonStdioBridge` assignable to `PythonBridge`, `SwappableBridge implements PythonBridge` — all enforced by `npm run build:packages`.
- **Regression:** the full `packages/runtime` and `packages/websocket` suites pass unchanged (the previously-added attach/model-management tests still pass; behavior is identical).

## Acceptance criteria

- `npm run build:packages` → 55/55 (all package typechecks pass, including the `implements` checks).
- `npm run test --workspace=packages/runtime` and `--workspace=packages/websocket` green, including the new `SwappableBridge` tests.
- `npm run lint` exits 0.
- `server.ts` no longer contains `getPythonBridge`, `activeBridge`, or `attachWorkerBridgeListeners`; consumers take a plain `pythonBridge: PythonBridge` again.
- No behavior change: attach reroutes execution + model management to the worker; detach returns to local (verified by the existing tests, which must not be weakened to pass).

## Out of scope

- Changing the wire protocol, transports, or the lazy-connect / node-registration logic (only its plumbing moves).
- Making the local worker run over WebSocket.
- Any change to the web/Python layers — this is a TS-runtime + websocket-server refactor only.
