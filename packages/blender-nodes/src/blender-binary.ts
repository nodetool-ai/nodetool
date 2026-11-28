/**
 * Blender executable discovery (D3).
 *
 * Order: `BLENDER_PATH`, then the Blender the Package Manager installed
 * (`runtimeLocations().blender`), then `blender` on PATH, then the well-known
 * locations for macOS, Linux, and Windows. The first candidate whose
 * `--version` runs wins. Below the 5.2 floor throws `BlenderVersionError`
 * naming both versions; nothing found throws a `MissingRuntimePackageError`
 * for `blender`, so the editor offers the install. Its cause is a
 * `HostBinaryMissingError`.
 *
 * The result is cached per process and invalidated when `BLENDER_PATH`
 * changes, so tests pointing `BLENDER_PATH` at a fake re-resolve.
 */

import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { installedAppBinary } from "@nodetool-ai/config/app-binary-runtime";
import { runtimeLocations } from "@nodetool-ai/config";
import {
  type MissingRuntimePackageError,
  missingRuntimePackageError
} from "@nodetool-ai/protocol";
import { HostBinaryMissingError } from "@nodetool-ai/runtime";

const execFileAsync = promisify(execFile);

/**
 * Minimum supported Blender version: 5.2 LTS. The ops use
 * `scene.compositing_node_group` and `image_settings.media_type`, neither of
 * which exists on 4.2, so the 4.2 floor the design first named was never
 * runnable. See the Revision note under A1 in
 * `docs/blender-headless-integration-design.md`.
 */
export const BLENDER_MIN_VERSION: readonly [number, number, number] = [5, 2, 0];

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
        `Install Blender from the Package Manager, or point BLENDER_PATH at a newer one.`
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

/** The Package Manager's Blender, or null on a host without one (Docker). */
async function managedBlender(): Promise<string | null> {
  try {
    return await installedAppBinary("blender", runtimeLocations().blender);
  } catch {
    // An unknown NODETOOL_HOST has no runtime root; the other candidates remain.
    return null;
  }
}

async function candidates(): Promise<string[]> {
  const list: string[] = [];
  const envPath = process.env["BLENDER_PATH"];
  if (envPath !== undefined && envPath !== "") list.push(envPath);
  const managed = await managedBlender();
  if (managed) list.push(managed);
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

function missingError(failures: ProbeFailure[], configuredPath?: string | null): MissingRuntimePackageError {
  const err = missingRuntimePackageError("blender", "blender", new HostBinaryMissingError("blender"));
  const envPath = process.env["BLENDER_PATH"];
  const probeNote = failures
    .filter((f) => f.candidate === envPath || f.candidate === configuredPath)
    .map((f) => ` BLENDER_PATH=${JSON.stringify(f.candidate)} failed: ${f.detail}`)
    .join("");
  err.message += probeNote;
  return err;
}

/**
 * Resolve the Blender executable per D3. Cached per process; the cache is
 * invalidated when `BLENDER_PATH` changes.
 */
export async function resolveBlenderBinary(options: {
  configuredPath?: string | null;
} = {}): Promise<BlenderBinary> {
  const blenderPathEnv = options.configuredPath ?? process.env["BLENDER_PATH"];
  if (cached && cached.blenderPathEnv === blenderPathEnv) return cached.binary;

  const failures: ProbeFailure[] = [];
  const candidateList = options.configuredPath
    ? [options.configuredPath, ...(await candidates())]
    : await candidates();
  for (const candidate of candidateList) {
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
  throw missingError(failures, options.configuredPath);
}

/** Forget the cached resolution. Tests use this after mutating the environment. */
export function resetBlenderBinaryCache(): void {
  cached = null;
}
