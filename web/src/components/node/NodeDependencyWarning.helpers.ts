import { trpcClient } from "../../trpc/client";

export const RUNTIME_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg & Codecs",
  python: "Python",
  nodejs: "Node.js",
  bash: "Bash",
  ruby: "Ruby",
  lua: "Lua",
  "yt-dlp": "yt-dlp",
  pandoc: "Pandoc",
  pdftotext: "PDF Tools (Poppler)",
};

/** Maps required_runtimes values to RuntimePackageId values used by the Electron API. */
export const RUNTIME_TO_PACKAGE_ID: Record<string, string> = {
  python: "python",
  nodejs: "nodejs",
  bash: "bash",
  ruby: "ruby",
  lua: "lua",
  ffmpeg: "ffmpeg",
  pandoc: "pandoc",
  pdftotext: "pdftotext",
  "yt-dlp": "yt-dlp",
};

/**
 * Cache runtime statuses across all instances so we don't call IPC per-node.
 * Refreshed once per mount cycle (first component to mount triggers the fetch).
 */
let cachedStatuses: Record<string, boolean> | null = null;
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
 * the server — which is the machine that would spawn ffmpeg anyway, so its
 * PATH is the one that decides whether a node can run.
 */
export async function refreshRuntimeStatuses(): Promise<void> {
  const api = window.api;
  if (api?.packages?.getRuntimeStatuses) {
    try {
      cachedStatuses = toStatusMap(await api.packages.getRuntimeStatuses());
    } catch {
      // If IPC fails, assume nothing is installed so warnings stay visible.
    }
    return;
  }
  try {
    const res = await trpcClient.packs.runtimeStatuses.query();
    cachedStatuses = toStatusMap(res.statuses);
  } catch {
    // Server unreachable or too old for the endpoint: leave the cache empty,
    // which keeps the warnings visible.
  }
}

export function getCachedRuntimeStatuses(): Record<string, boolean> | null {
  return cachedStatuses;
}

/**
 * Ensure runtime statuses are loaded, deduping concurrent fetches across
 * all mounted warnings. Only refreshes when the cache is empty or forced.
 */
export async function ensureRuntimeStatuses(
  forceRefresh = false
): Promise<void> {
  if (!cachedStatuses || forceRefresh) {
    if (!fetchPromise) {
      fetchPromise = refreshRuntimeStatuses().finally(() => {
        fetchPromise = null;
      });
    }
    await fetchPromise;
  }
}
