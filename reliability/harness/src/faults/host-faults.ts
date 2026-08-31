/**
 * Host-seam fault modules (docs/RELIABILITY_ARCHITECTURE.md §9; task D3).
 *
 * Of the three §9 "process/host" faults, only `host-disk-full` is a
 * `FaultModule` here:
 *
 * - `host-disk-full`: an injectable `StorageAdapter` whose writes fail with
 *   ENOSPC. Wired into the **kernel driver only** (`drivers/kernel.ts`
 *   consults {@link getInjectedHostStorage} when building the run's
 *   `ProcessingContext`) — the ws-server driver's asset storage comes from
 *   `websocket-client-session.ts`'s own module-level `getTempAdapter()`
 *   singleton (`lib/storage.ts`), which task A5 explicitly reserves for a
 *   later `ExecutionSession` migration ("do not refactor
 *   `websocket-client-session.ts`... pin behavior with tests around it").
 *   Journeys exercising this fault must scope it to `"surface": "kernel"`.
 * - `host-db-locked` has no `FaultModule`: the swallowed failure it pins
 *   (`websocket-client-session.ts` ~2868) is job-table persistence, which
 *   neither driver's hermetic runs touch (both run with `persistence:
 *   "session"`/no persistence hook) — see
 *   `packages/websocket/tests/job-persistence-failure.test.ts` for the
 *   dedicated pin instead. `--faults host-db-locked` correctly reports
 *   "unknown fault" from this harness until a journey exists that actually
 *   exercises job persistence.
 * - `host-sigkill-restart` has no `FaultModule`: killing and restarting the
 *   server process is a harness-level *test* (spawns/kills a real process),
 *   not a per-run "configure/teardown around one driver call" fault — see
 *   `tests/journeys/host-sigkill-restart.test.ts`.
 */
import { InMemoryStorageAdapter, type StorageAdapter } from "@nodetool-ai/runtime";
import { registerFaultModule } from "./registry.js";

// `StorageListResult`/`StorageStat` aren't re-exported from
// `@nodetool-ai/runtime`'s public surface (only the `StorageAdapter`
// interface and its concrete adapters are) — derive them from the interface
// itself rather than reaching into the package's internals.
type StorageListResult = Awaited<ReturnType<StorageAdapter["list"]>>;
type StorageStat = Awaited<ReturnType<StorageAdapter["stat"]>>;
import type { FaultContext, FaultModule, FaultTeardown } from "./types.js";

function enospcError(key: string): NodeJS.ErrnoException {
  const err = new Error(
    `ENOSPC: no space left on device, write '${key}'`
  ) as NodeJS.ErrnoException;
  err.code = "ENOSPC";
  return err;
}

/** Wraps a real adapter, failing every WRITE op with an ENOSPC-shaped error —
 * reads still work (a full disk doesn't un-write what's already on it),
 * matching what an actual write failure looks like mid-run. */
class EnospcStorageAdapter implements StorageAdapter {
  constructor(private readonly inner: StorageAdapter) {}

  store(key: string): Promise<string> {
    throw enospcError(key);
  }

  retrieve(uri: string): Promise<Uint8Array | null> {
    return this.inner.retrieve(uri);
  }

  exists(uri: string): Promise<boolean> {
    return this.inner.exists(uri);
  }

  uriForKey(key: string): string {
    return this.inner.uriForKey(key);
  }

  list(
    prefix: string,
    opts?: { delimiter?: string }
  ): Promise<StorageListResult> {
    return this.inner.list(prefix, opts);
  }

  delete(uri: string): Promise<boolean> {
    throw enospcError(uri);
  }

  stat(uri: string): Promise<StorageStat | null> {
    return this.inner.stat(uri);
  }
}

let injectedStorage: StorageAdapter | null = null;

/** Consulted by the kernel driver when building a run's `ProcessingContext` —
 * non-null only while `host-disk-full` is configured for the current
 * `compareJourney` call. */
export function getInjectedHostStorage(): StorageAdapter | null {
  return injectedStorage;
}

function configureDiskFullFault(_ctx: FaultContext): FaultTeardown {
  const previous = injectedStorage;
  injectedStorage = new EnospcStorageAdapter(new InMemoryStorageAdapter());
  return () => {
    injectedStorage = previous;
  };
}

export const HOST_FAULT_MODULES: readonly FaultModule[] = [
  {
    name: "host-disk-full",
    seam: "host",
    configure: configureDiskFullFault
  }
];

/** Registers every host-seam fault module this harness implements. Called
 * once from `faults/index.ts`'s module-load side effect — safe to call
 * again, last-write-wins. */
export function registerHostFaultModules(): void {
  for (const module of HOST_FAULT_MODULES) {
    registerFaultModule(module);
  }
}
