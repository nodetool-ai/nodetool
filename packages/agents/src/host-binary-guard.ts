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

import { isEditTargetWithinRoot } from "./workspace-paths.js";

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

/**
 * Refuse argv that reaches past the workspace, or `undefined` when every
 * argument stays inside it.
 *
 * Flags are skipped: a leading `-` is ffmpeg's option marker, so such an
 * argument is never a path, and a file named `-x` is unusable by ffmpeg
 * anyway. Everything else is resolved against the workspace root — an absolute
 * path, a `..` chain, and a path buried in a filter token all land outside it
 * the same way.
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
    const resolved = path.resolve(workspace, arg);
    if (!(await isEditTargetWithinRoot(workspace, resolved))) {
      return {
        error:
          `"${arg}" resolves outside the workspace. Paths are ` +
          `workspace-relative and cannot escape it.`
      };
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
