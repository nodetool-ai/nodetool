/**
 * Blender executable discovery (D3).
 *
 * Order: `BLENDER_PATH`, then `blender` on PATH, then the well-known
 * locations for macOS, Linux, and Windows. The first candidate whose
 * `--version` runs wins. Below the 4.2 floor throws `BlenderVersionError`
 * naming both versions; nothing found throws `HostBinaryMissingError`.
 *
 * The result is cached per process and invalidated when `BLENDER_PATH`
 * changes, so tests pointing `BLENDER_PATH` at a fake re-resolve.
 */

import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { HostBinaryMissingError } from "@nodetool-ai/runtime";

const execFileAsync = promisify(execFile);

/** Minimum supported Blender version: 4.2 LTS. */
export const BLENDER_MIN_VERSION: readonly [number, number, number] = [4, 2, 0];

export interface BlenderBinary {
  path: string;
  version: [number, number, number];
}

export class BlenderVersionError extends Error {
  readonly found: string;
  readonly minimum: string;
  constructor(found: string) {
    const minimum = BLENDER_MIN_VERSION.join(".");
    super(
      `Blender ${found} is too old: NodeTool needs Blender ${minimum} or newer. ` +
        `Install a newer Blender or point BLENDER_PATH at one.`
    );
    this.name = "BlenderVersionError";
    this.found = found;
    this.minimum = minimum;
  }
}

function isAtLeast(
  version: [number, number, number],
  floor: readonly [number, number, number]
): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] > floor[i]) return true;
    if (version[i] < floor[i]) return false;
  }
  return true;
}

function parseVersion(output: string): [number, number, number] | null {
  const match = /Blender\s+(\d+)\.(\d+)\.(\d+)/.exec(output);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

interface ProbeFailure {
  candidate: string;
  detail: string;
}

async function probe(candidate: string): Promise<{
  binary: BlenderBinary | null;
  failure: ProbeFailure | null;
}> {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["--version"], {
      timeout: 15000,
      windowsHide: true
    });
    const version = parseVersion(`${stdout}\n${stderr}`);
    if (!version) {
      return {
        binary: null,
        failure: {
          candidate,
          detail: firstLine(`${stdout}\n${stderr}`)
        }
      };
    }
    return { binary: { path: candidate, version }, failure: null };
  } catch (err) {
    return {
      binary: null,
      failure: {
        candidate,
        detail: firstLine(
          err instanceof Error ? (err.message ?? String(err)) : String(err)
        )
      }
    };
  }
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

async function windowsCandidates(): Promise<string[]> {
  const roots = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"]
  ].filter((root): root is string => root !== undefined && root !== "");
  const found: string[] = [];
  for (const root of roots) {
    const base = path.join(root, "Blender Foundation");
    let entries: string[];
    try {
      entries = await readdir(base);
    } catch {
      // No Blender install under this root.
      continue;
    }
    for (const entry of entries.sort().reverse()) {
      if (!entry.startsWith("Blender")) continue;
      found.push(path.join(base, entry, "blender.exe"));
    }
  }
  return found;
}

async function candidates(): Promise<string[]> {
  const list: string[] = [];
  const envPath = process.env["BLENDER_PATH"];
  if (envPath !== undefined && envPath !== "") list.push(envPath);
  list.push("blender");
  if (process.platform === "darwin") {
    list.push("/Applications/Blender.app/Contents/MacOS/Blender");
  } else if (process.platform === "win32") {
    list.push(...(await windowsCandidates()));
  } else {
    list.push("/usr/bin/blender", "/snap/bin/blender");
  }
  return list;
}

let cached: { blenderPathEnv: string | undefined; binary: BlenderBinary } | null =
  null;

function missingError(failures: ProbeFailure[]): HostBinaryMissingError {
  const err = new HostBinaryMissingError("blender");
  const envPath = process.env["BLENDER_PATH"];
  const probeNote = failures
    .filter((f) => f.candidate === envPath)
    .map((f) => ` BLENDER_PATH=${JSON.stringify(f.candidate)} failed: ${f.detail}`)
    .join("");
  err.message =
    `blender was not found. Install Blender 4.2 or newer and add it to PATH, ` +
    `or set BLENDER_PATH to the Blender executable.${probeNote}`;
  return err;
}

/**
 * Resolve the Blender executable per D3. Cached per process; the cache is
 * invalidated when `BLENDER_PATH` changes.
 */
export async function resolveBlenderBinary(): Promise<BlenderBinary> {
  const blenderPathEnv = process.env["BLENDER_PATH"];
  if (cached && cached.blenderPathEnv === blenderPathEnv) return cached.binary;

  const failures: ProbeFailure[] = [];
  for (const candidate of await candidates()) {
    const { binary, failure } = await probe(candidate);
    if (binary) {
      if (!isAtLeast(binary.version, BLENDER_MIN_VERSION)) {
        throw new BlenderVersionError(binary.version.join("."));
      }
      cached = { blenderPathEnv, binary };
      return binary;
    }
    if (failure) failures.push(failure);
  }
  throw missingError(failures);
}

/** Forget the cached resolution. Tests use this after mutating the environment. */
export function resetBlenderBinaryCache(): void {
  cached = null;
}
