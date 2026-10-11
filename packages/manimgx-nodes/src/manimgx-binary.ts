/**
 * ManimGX executable discovery.
 *
 * Order: the user's `MANIMGX_PATH` setting, the process `MANIMGX_PATH`, then
 * `manimgx` on PATH, then `~/.local/bin/manimgx` (where `uv tool install`
 * and `pip install --user` put it, which an app started from the desktop
 * often lacks on PATH). The desktop Package Manager installs it into a
 * directory the server's PATH already holds. The first candidate whose
 * `--version` runs wins. Nothing found throws a `MissingRuntimePackageError`
 * for `manimgx`, so the editor offers the install.
 *
 * The result is cached per process and invalidated when the configured path
 * changes, so tests pointing `MANIMGX_PATH` at a fake re-resolve.
 */

import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { MissingRuntimePackageError } from "@nodetool-ai/protocol";
import { HostBinaryMissingError } from "@nodetool-ai/runtime";

const execFileAsync = promisify(execFile);

export interface ManimgxBinary {
  path: string;
  version: string;
}

/** What to do when no ManimGX is found. */
export const MANIMGX_INSTALL_HINT =
  "Install ManimGX from the Package Manager in the desktop app. Elsewhere, run " +
  "`uv tool install manimgx` or `pip install manimgx` (Python 3.13 or newer), " +
  "or set MANIMGX_PATH to the manimgx executable.";

function parseVersion(output: string): string | null {
  const match = /manimgx\s+(\S+)/i.exec(output);
  return match ? match[1] : null;
}

function firstLine(text: string): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

async function probe(
  candidate: string
): Promise<{ binary: ManimgxBinary } | { failure: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["--version"], {
      timeout: 30000,
      windowsHide: true
    });
    const version = parseVersion(`${stdout}\n${stderr}`);
    if (version === null) return { failure: firstLine(`${stdout}\n${stderr}`) };
    return { binary: { path: candidate, version } };
  } catch (err) {
    return {
      failure: firstLine(err instanceof Error ? err.message : String(err))
    };
  }
}

function candidates(configuredPath: string | null | undefined): string[] {
  const list: string[] = [];
  if (configuredPath) list.push(configuredPath);
  const envPath = process.env["MANIMGX_PATH"];
  if (envPath !== undefined && envPath !== "") list.push(envPath);
  list.push("manimgx");
  const exe = process.platform === "win32" ? "manimgx.exe" : "manimgx";
  list.push(path.join(os.homedir(), ".local", "bin", exe));
  return [...new Set(list)];
}

let cached: { key: string; binary: ManimgxBinary } | null = null;

/**
 * Resolve the ManimGX executable. `configuredPath` is the user's
 * `MANIMGX_PATH` setting; callers pass null under the cloud profile.
 */
export async function resolveManimgxBinary(
  options: { configuredPath?: string | null } = {}
): Promise<ManimgxBinary> {
  const key = `${options.configuredPath ?? ""}\0${process.env["MANIMGX_PATH"] ?? ""}`;
  if (cached && cached.key === key) return cached.binary;

  const failures: string[] = [];
  for (const candidate of candidates(options.configuredPath)) {
    const result = await probe(candidate);
    if ("binary" in result) {
      cached = { key, binary: result.binary };
      return result.binary;
    }
    if (candidate === options.configuredPath || candidate === process.env["MANIMGX_PATH"]) {
      failures.push(` MANIMGX_PATH=${JSON.stringify(candidate)} failed: ${result.failure}`);
    }
  }
  throw new MissingRuntimePackageError(
    `manimgx was not found. ${MANIMGX_INSTALL_HINT}${failures.join("")}`,
    "manimgx",
    { cause: new HostBinaryMissingError("manimgx") }
  );
}

/** Forget the cached resolution. Tests use this after mutating the environment. */
export function resetManimgxBinaryCache(): void {
  cached = null;
}
