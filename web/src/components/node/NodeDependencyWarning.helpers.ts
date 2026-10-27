import { trpcClient } from "../../trpc/client";
import useRuntimeStatusStore from "../../stores/RuntimeStatusStore";

export const RUNTIME_LABELS: Record<string, string> = {
  python: "Python",
  nodejs: "Node.js",
  "yt-dlp": "yt-dlp",
  manimgx: "ManimGX",
  pandoc: "Pandoc",
};

/** Maps required_runtimes values to RuntimePackageId values used by the Electron API. */
export const RUNTIME_TO_PACKAGE_ID: Record<string, string> = {
  python: "python",
  nodejs: "nodejs",
  pandoc: "pandoc",
  "yt-dlp": "yt-dlp",
  manimgx: "manimgx",
};

// Concurrent loads share one request. A forced refresh queues behind an
// in-flight load rather than reusing its (possibly pre-install) answer.
let fetchPromise: Promise<void> | null = null;

function toStatusMap(
  statuses: Array<{ id: string; installed: boolean }>
) {
  const map: Record<string, boolean> = {};
  for (const s of statuses) {
    map[s.id] = s.installed;
    // The Electron API keys by package id, the server by runtime id; index
    // both so lookups don't have to know which source answered.
    const pkgId = RUNTIME_TO_PACKAGE_ID[s.id];
    if (pkgId) {map[pkgId] = s.installed;}
  }
  return map;
}

/**
 * Load runtime statuses from the desktop app when it's there, otherwise from
 * the server — which is the machine that would spawn the runtime anyway, so
 * its PATH is the one that decides whether a node can run.
 */
export async function refreshRuntimeStatuses(): Promise<void> {
  const store = useRuntimeStatusStore.getState();
  const api = window.api;
  if (api?.packages?.getRuntimeStatuses) {
    try {
      store.setStatuses(toStatusMap(await api.packages.getRuntimeStatuses()));
    } catch {
      // If IPC fails, assume nothing is installed so warnings stay visible.
      store.markLoaded();
    }
    return;
  }
  try {
    const res = await trpcClient.packs.runtimeStatuses.query();
    store.setStatuses(toStatusMap(res.statuses));
  } catch {
    // Server unreachable or too old for the endpoint: leave the statuses
    // empty, which keeps the warnings visible.
    store.markLoaded();
  }
}

export function getCachedRuntimeStatuses(): Record<string, boolean> | null {
  return useRuntimeStatusStore.getState().statuses;
}

function startFetch(after: Promise<void> | null): Promise<void> {
  const promise: Promise<void> = (after ?? Promise.resolve())
    .then(refreshRuntimeStatuses)
    .finally(() => {
      if (fetchPromise === promise) {
        fetchPromise = null;
      }
    });
  fetchPromise = promise;
  return promise;
}

/**
 * Ensure runtime statuses are loaded, deduping concurrent fetches across
 * all mounted warnings. Only refreshes when the cache is empty or forced.
 */
export async function ensureRuntimeStatuses(
  forceRefresh = false
): Promise<void> {
  if (forceRefresh) {
    await startFetch(fetchPromise);
    return;
  }
  if (useRuntimeStatusStore.getState().statuses) {
    return;
  }
  await (fetchPromise ?? startFetch(null));
}
