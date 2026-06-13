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
  tmux: "tmux",
  claude: "Claude Code CLI",
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
  tmux: "tmux",
  claude: "claude",
};

/**
 * Cache runtime statuses across all instances so we don't call IPC per-node.
 * Refreshed once per mount cycle (first component to mount triggers the fetch).
 */
let cachedStatuses: Record<string, boolean> | null = null;
let fetchPromise: Promise<void> | null = null;

export async function refreshRuntimeStatuses(): Promise<void> {
  const api = window.api;
  if (!api?.packages?.getRuntimeStatuses) {return;}
  try {
    const statuses: Array<{ id: string; installed: boolean }> =
      await api.packages.getRuntimeStatuses();
    const map: Record<string, boolean> = {};
    for (const s of statuses) {
      map[s.id] = s.installed;
    }
    cachedStatuses = map;
  } catch {
    // If IPC fails, assume nothing is installed so warnings stay visible.
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
