/**
 * The boundary around `ffmpeg` and `yt-dlp` — the two capabilities that hand a
 * model's own strings to a process on the host.
 *
 * The argv arrives from guest JavaScript or from an LLM tool call, and the
 * child runs with the server's identity. In the managed cloud that server also
 * holds every other tenant's database handle and secret store, so an unbounded
 * `ffmpeg` is an arbitrary-file reader (`-i /etc/passwd`), an arbitrary-file
 * writer (`-y ../../app/backend/server.mjs`), and an SSRF client — measured,
 * not assumed: `ffmpeg -i http://169.254.169.254/…` opens the socket and
 * reports what came back.
 *
 * Three rules, in the order they are cheapest to check:
 *
 * 1. **No opener but the filesystem.** Anything naming a protocol or a
 *    pseudo-file — `://`, `concat:`, `pipe:`, `/dev/…` — is refused, and
 *    `-protocol_whitelist file,crypto,data` is injected before *every* input
 *    so a playlist inside the workspace cannot reach the network either.
 *    ffmpeg applies that option per input, so one copy at the front covers
 *    only the first `-i` (verified against ffmpeg 6.1).
 * 2. **Nothing outside the workspace.** Every non-flag argument is resolved
 *    against the workspace root and refused when it lands outside, symlinks
 *    resolved. A filter value carries its path inside the token
 *    (`subtitles=../../etc/x`), and resolving the whole token catches that
 *    without parsing filter syntax.
 * 3. **No stdin.** `-nostdin` keeps a child from inheriting and blocking on
 *    the server's stdin, which outlives any single run.
 *
 * The CPU/memory/disk half of the boundary lives in `host-binaries.ts`:
 * bounded output capture, a concurrency cap, the wall-clock timeout, and the
 * artifact-size watchdog.
 */

import path from "node:path";

import { isCreatableWithinRoot } from "./workspace-paths.js";

/** What every `-i` gets: local files, plus the two openers that read bytes we already hold. */
export const FFMPEG_PROTOCOL_WHITELIST = "file,crypto,data";

/**
 * Substrings that name an opener other than a plain path. `://` covers every
 * network protocol at once; the rest are ffmpeg's own pseudo-files and the
 * filter sources that read a file without looking like a path.
 */
const DENIED_TOKENS: readonly string[] = [
  "://",
  "concat:",
  "subfile:",
  "async:",
  "cache:",
  "pipe:",
  "fd:",
  "movie=",
  "amovie=",
  "/dev/",
  "/proc/",
  "/sys/"
];

/**
 * yt-dlp's download ceiling. It is the binary's own `--max-filesize`, which —
 * unlike ffmpeg's `-fs` — aborts before writing: measured against yt-dlp
 * 2026.07.04, a 20 MB file under `--max-filesize 1M` produced no output file.
 */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** An argument the caller must not set: it would widen rule 1. */
const RESERVED_FLAGS: readonly string[] = ["-protocol_whitelist"];

export interface ArgvRefusal {
  error: string;
}

/** The token that made an argument unacceptable, or undefined when it is fine. */
function deniedToken(arg: string): string | undefined {
  const lowered = arg.toLowerCase();
  return DENIED_TOKENS.find((token) => lowered.includes(token));
}

/** Where a filtergraph or an option value ends and the next one begins. */
const VALUE_SEPARATORS = /[=:,;[\]'"\s|]+/;

/**
 * The strings in one argument that ffmpeg could open as a file.
 *
 * The argument itself is always one, but it is not the only one: ffmpeg
 * resolves a path *inside* a filter token against its own working directory,
 * so `subtitles=../../etc/passwd` opens `../../etc/passwd` while the whole
 * token resolves to `<workspace>/etc/passwd` — inside the workspace, and the
 * wrong question. Splitting on the filtergraph separators asks the right one.
 *
 * A part is only a candidate when it carries a separator or names the parent
 * directory; `scale=1280:-2` yields nothing, which is why filter *values* do
 * not have to be understood to be judged.
 */
function pathCandidates(arg: string): string[] {
  const candidates = [arg];
  for (const part of arg.split(VALUE_SEPARATORS)) {
    if (part === "" || part === arg) continue;
    if (part.includes("/") || part === "..") candidates.push(part);
  }
  return candidates;
}

/**
 * Refuse argv that reaches past the workspace, or `undefined` when every
 * argument stays inside it.
 *
 * Flags are skipped: a leading `-` is ffmpeg's option marker, so such an
 * argument is never a path, and a file named `-x` is unusable by ffmpeg
 * anyway. Everything else — and every path-shaped piece of it, see
 * {@link pathCandidates} — is resolved against the workspace root, so an
 * absolute path, a `..` chain, and a path inside a filter token all land
 * outside it the same way.
 */
export async function confineArgvToWorkspace(
  argv: readonly string[],
  workspace: string
): Promise<ArgvRefusal | undefined> {
  for (const arg of argv) {
    const token = deniedToken(arg);
    if (token !== undefined) {
      return {
        error:
          `"${token}" is not allowed in a host media argument (in "${arg}"). ` +
          `Only workspace files are readable; download first, then pass the ` +
          `local path.`
      };
    }
    if (arg === "" || arg.startsWith("-")) continue;
    for (const candidate of pathCandidates(arg)) {
      const resolved = path.resolve(workspace, candidate);
      if (!(await isCreatableWithinRoot(workspace, resolved))) {
        return {
          error:
            `"${candidate}" resolves outside the workspace. Paths are ` +
            `workspace-relative and cannot escape it.`
        };
      }
    }
  }
  return undefined;
}

/**
 * The argv actually spawned: `-nostdin`, then the caller's arguments with
 * `-protocol_whitelist` in front of every input.
 *
 * Refuses a caller who sets `-protocol_whitelist` themselves rather than
 * silently dropping it — the refusal says which flag the host owns.
 */
export function hardenFfmpegArgv(
  argv: readonly string[]
): { argv: string[] } | ArgvRefusal {
  const reserved = argv.find((arg) => RESERVED_FLAGS.includes(arg));
  if (reserved !== undefined) {
    return {
      error:
        `${reserved} is set by NodeTool and cannot be passed. Inputs may ` +
        `only open workspace files (${FFMPEG_PROTOCOL_WHITELIST}).`
    };
  }
  const hardened: string[] = ["-nostdin"];
  for (const arg of argv) {
    if (arg === "-i") {
      hardened.push("-protocol_whitelist", FFMPEG_PROTOCOL_WHITELIST);
    }
    hardened.push(arg);
  }
  return { argv: hardened };
}


/**
 * The argv `yt_dlp` spawns.
 *
 * Three of these flags are the boundary rather than configuration:
 *
 * - **`--ignore-config`** is the one that matters most. yt-dlp reads a
 *   *portable* config file — `yt-dlp.conf` in its working directory — and its
 *   working directory is the workspace, which guest code writes freely. A
 *   guest that writes `--exec "curl … | sh"` into that file and then calls this
 *   capability gets arbitrary command execution as the server. Reproduced
 *   against yt-dlp 2026.07.04, and refused with this flag.
 * - **`--no-exec`** clears any post-processing command from a source
 *   `--ignore-config` does not cover.
 * - **`--`** ends the options, so a URL cannot be read as a flag.
 *
 * `--max-filesize` is the disk bound, and `--no-playlist` keeps one URL to one
 * download.
 */
export function buildYtDlpArgv(options: {
  url: string;
  outputFile: string;
  format?: string;
  maxBytes?: number;
}): string[] {
  const argv = [
    "--ignore-config",
    "--no-exec",
    "--no-playlist",
    "--no-warnings",
    "--max-filesize",
    String(options.maxBytes ?? MAX_DOWNLOAD_BYTES),
    "--print",
    "after_move:filepath",
    "-o",
    options.outputFile
  ];
  if (options.format) {
    argv.push("-f", options.format);
  }
  argv.push("--", options.url);
  return argv;
}

/**
 * Refuse a value that would arrive as another flag rather than as the value of
 * the option it follows. `label` names the field in the refusal.
 */
export function refuseFlagLikeValue(
  value: string,
  label: string
): ArgvRefusal | undefined {
  if (!value.startsWith("-")) return undefined;
  return {
    error: `${label} cannot start with "-": it would be read as an option, not a value.`
  };
}
