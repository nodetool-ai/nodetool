/**
 * Two boundaries around a model's own strings reaching the host's files.
 *
 * `yt_dlp` hands a model's output template to a process on the host, and the
 * media capabilities (`media_edit`, `media_probe`) hand a model's paths to
 * libav, which opens whatever path it is given. The strings arrive from guest
 * JavaScript or from an LLM tool call, and the reader runs with the server's
 * identity. In the managed cloud that server also holds every other tenant's
 * database handle and secret store, so an unconfined path is an
 * arbitrary-file reader and writer, and an opener with a protocol in it is an
 * SSRF client.
 *
 * Two rules, in the order they are cheapest to check:
 *
 * 1. **No opener but the filesystem.** Anything naming a protocol or a
 *    pseudo-file — `://`, `concat:`, `pipe:`, `/dev/…` — is refused.
 * 2. **Nothing outside the workspace.** Every path is resolved against the
 *    workspace root and refused when it lands outside, symlinks resolved.
 *
 * The CPU/memory/disk half of the yt-dlp boundary lives in `host-binaries.ts`:
 * bounded output capture, a concurrency cap, the wall-clock timeout, and the
 * artifact-size watchdog.
 */

import path from "node:path";

import { isCreatableWithinRoot } from "./workspace-paths.js";

/**
 * Substrings that name an opener other than a plain path. `://` covers every
 * network protocol at once; the rest are libav's own pseudo-files and the
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
 * yt-dlp's download ceiling. It is the binary's own `--max-filesize`, which
 * aborts before writing: measured against yt-dlp
 * 2026.07.04, a 20 MB file under `--max-filesize 1M` produced no output file.
 */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

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
 * The strings in one argument that a host binary could open as a file.
 *
 * The argument itself is always one, but it is not the only one: a binary
 * may resolve a path *inside* a token against its own working directory, so
 * `subtitles=../../etc/passwd` opens `../../etc/passwd` while the whole token
 * resolves to `<workspace>/etc/passwd` — inside the workspace, and the wrong
 * question. Splitting on the value separators asks the right one.
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
 * Flags are skipped: a leading `-` is an option marker, so such an argument
 * is never a path; `yt_dlp` refuses a flag-like value separately
 * ({@link refuseFlagLikeValue}). Everything else — and every path-shaped piece of it, see
 * {@link pathCandidates} — is resolved against the workspace root, so an
 * absolute path, a `..` chain, and a path inside a filter token all land
 * outside it the same way.
 *
 * `remedy` is the one sentence the refusal ends on. It defaults to something
 * true of every host binary; a caller with a way to put the file where the
 * binary can see it names that instead, so the refusal points at a parameter
 * rather than at an errand the caller cannot run.
 */
export async function confineArgvToWorkspace(
  argv: readonly string[],
  workspace: string,
  remedy = "Stage it in the workspace first, then pass the local path."
): Promise<ArgvRefusal | undefined> {
  for (const arg of argv) {
    const token = deniedToken(arg);
    if (token !== undefined) {
      return {
        error:
          `"${token}" is not allowed in a host media argument (in "${arg}"). ` +
          `Only workspace files are readable. ${remedy}`
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
 * Refuse a media path that names an opener or lands outside the workspace,
 * or `undefined` when every path stays inside it.
 *
 * Unlike {@link confineArgvToWorkspace} this takes whole paths, never argv,
 * so nothing is skipped as a flag: `-x/../../etc/passwd` is a path here.
 */
export async function confineMediaPaths(
  paths: readonly string[],
  workspace: string,
  remedy: string
): Promise<ArgvRefusal | undefined> {
  for (const file of paths) {
    if (file.trim() === "") return { error: "A media path cannot be empty." };
    const token = deniedToken(file);
    if (token !== undefined) {
      return {
        error:
          `"${token}" is not allowed in a media path (in "${file}"). ` +
          `Only workspace files are readable. ${remedy}`
      };
    }
    const resolved = path.resolve(workspace, file);
    if (!(await isCreatableWithinRoot(workspace, resolved))) {
      return {
        error:
          `"${file}" resolves outside the workspace. Paths are ` +
          `workspace-relative and cannot escape it.`
      };
    }
  }
  return undefined;
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
 * download. `format` must hold no top-level `+`: the caller splits a merge
 * with `splitYtDlpFormat` and muxes in process, since a merge runs ffmpeg.
 * `printFormatId` prints the format id on the line before the file path.
 */
export function buildYtDlpArgv(options: {
  url: string;
  outputFile: string;
  format?: string;
  maxBytes?: number;
  printFormatId?: boolean;
}): string[] {
  const argv = [
    "--ignore-config",
    "--no-exec",
    "--no-playlist",
    "--no-warnings",
    "--max-filesize",
    String(options.maxBytes ?? MAX_DOWNLOAD_BYTES),
    ...(options.printFormatId ? ["--print", "after_move:format_id"] : []),
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
