/**
 * Detects which external runtimes (ffmpeg, pandoc, yt-dlp, …) are present on
 * the machine running the server.
 *
 * The desktop app answers this over Electron IPC, because it also installs the
 * runtimes. A browser client — the web build, and every Docker/Fly deployment —
 * has no such channel, so without this it assumed nothing was installed and
 * showed "Requires FFmpeg" on nodes that run fine, since the container ships
 * ffmpeg.
 *
 * Detection is a PATH scan for an executable file, not a spawn: it costs a few
 * `access()` calls, cannot hang, and cannot run client-supplied strings.
 * Results are cached briefly so a canvas full of video nodes probes once.
 */
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

/**
 * Runtime ids whose executable is named differently from the id. Ids not
 * listed here are probed under their own name (`ffmpeg`, `pandoc`, `yt-dlp`, …).
 */
const RUNTIME_COMMANDS: Record<string, string> = {
  nodejs: "node",
  pdftotext: "pdftotext",
  pdftoppm: "pdftoppm"
};

/** The runtimes a client gets when it asks for no particular ones. */
export const KNOWN_RUNTIMES = [
  "python",
  "nodejs",
  "ffmpeg",
  "ffprobe",
  "pandoc",
  "pdftotext",
  "pdftoppm",
  "yt-dlp"
] as const;

/** Ids that are safe to probe: a bare command name, nothing path-like. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { installed: boolean; at: number }>();

function candidateNames(command: string): string[] {
  if (process.platform !== "win32") return [command];
  const exts = (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";");
  return [command, ...exts.filter(Boolean).map((ext) => command + ext)];
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Whether `command` resolves to an executable on PATH. */
export async function hasExecutable(command: string): Promise<boolean> {
  const dirs = (process.env["PATH"] ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidateNames(command)) {
      if (await isExecutable(path.join(dir, name))) return true;
    }
  }
  return false;
}

export interface RuntimeStatus {
  id: string;
  installed: boolean;
}

/**
 * Report install status for each runtime id. Unknown-but-safe ids are probed
 * under their own name; an id that isn't a bare command name reports
 * `installed: false` rather than touching the filesystem with it.
 */
export async function detectRuntimes(
  ids: readonly string[] = KNOWN_RUNTIMES
): Promise<RuntimeStatus[]> {
  const now = Date.now();
  return Promise.all(
    ids.map(async (id) => {
      if (!SAFE_ID.test(id)) return { id, installed: false };
      const cached = cache.get(id);
      if (cached && now - cached.at < CACHE_TTL_MS) {
        return { id, installed: cached.installed };
      }
      const installed = await hasExecutable(RUNTIME_COMMANDS[id] ?? id);
      cache.set(id, { installed, at: now });
      return { id, installed };
    })
  );
}

/** Drop cached probe results (tests, and after an install changes PATH). */
export function clearRuntimeDetectionCache(): void {
  cache.clear();
}
