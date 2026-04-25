/**
 * Scan a nodetool Python node package by invoking `nodetool.package_tools`
 * (shipped inside `nodetool-core`) as a one-shot subprocess.
 *
 * Produces a `PackageMetadata` (same shape as what `loadPythonPackageMetadata`
 * reads back from disk). Does not require a running server.
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { PackageMetadata } from "./metadata.js";

export interface PythonScanOptions {
  /** Path to the Python package (must contain pyproject.toml). */
  packageDir: string;
  /** Python executable. Default: env NODETOOL_PYTHON, else auto-detected. */
  python?: string;
  /** Fetch HF model metadata for recommended models (slow). */
  enrich?: boolean;
  /** Also write the JSON into the package's own package_metadata dir. */
  write?: boolean;
  /** Forwarded to the Python process. */
  verbose?: boolean;
  /** Called for each `SCAN ...` line on stderr. */
  onProgress?: (line: string) => void;
  /** AbortSignal to cancel. */
  signal?: AbortSignal;
}

export interface PythonScanResult {
  metadata: PackageMetadata;
  stderr: string;
}

export class PythonScanError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(message);
    this.name = "PythonScanError";
  }
}

/**
 * Run `python -m nodetool.package_tools scan` and return the parsed result.
 *
 * Requires `nodetool-core` to be installed in the target Python environment.
 */
export async function scanPythonPackage(
  opts: PythonScanOptions
): Promise<PythonScanResult> {
  const python = opts.python ?? resolvePythonBin();

  const args = [
    "-m",
    "nodetool.package_tools",
    "scan",
    "--package-dir",
    opts.packageDir
  ];
  if (opts.enrich) args.push("--enrich");
  if (opts.write) args.push("--write");
  if (opts.verbose) args.push("--verbose");

  return await new Promise<PythonScanResult>((resolve, reject) => {
    const child = spawn(python, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal: opts.signal
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stderrBuffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (opts.onProgress) {
        stderrBuffer += chunk.toString("utf8");
        let idx: number;
        while ((idx = stderrBuffer.indexOf("\n")) !== -1) {
          const line = stderrBuffer.slice(0, idx).trimEnd();
          stderrBuffer = stderrBuffer.slice(idx + 1);
          if (line.startsWith("SCAN")) opts.onProgress(line);
        }
      }
    });

    child.once("error", (err) => {
      reject(
        new PythonScanError(
          `Failed to spawn python: ${err.message}`,
          null,
          Buffer.concat(stderrChunks).toString("utf8")
        )
      );
    });

    child.once("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code !== 0) {
        reject(
          new PythonScanError(
            `nodetool-pkg scan exited with code ${code}`,
            code,
            stderr
          )
        );
        return;
      }

      try {
        let metadata: PackageMetadata;
        if (opts.write) {
          // --write: no JSON on stdout; read the file the scanner wrote.
          const name = findWrittenMetadataName(stderr);
          if (!name) {
            throw new Error(
              "scanner did not report a SCAN write path line"
            );
          }
          const metadataPath = join(
            opts.packageDir,
            "src",
            "nodetool",
            "package_metadata",
            `${name}.json`
          );
          metadata = JSON.parse(
            readFileSync(metadataPath, "utf8")
          ) as PackageMetadata;
        } else {
          const stdout = Buffer.concat(stdoutChunks).toString("utf8");
          metadata = JSON.parse(stdout) as PackageMetadata;
        }
        resolve({ metadata, stderr });
      } catch (e) {
        reject(
          new PythonScanError(
            `Failed to parse scanner output: ${String(e)}`,
            code,
            stderr
          )
        );
      }
    });
  });
}

/**
 * Parse "SCAN write path=/.../<name>.json" and return "<name>".
 */
function findWrittenMetadataName(stderr: string): string | null {
  const match = stderr.match(/SCAN write path=(.+\/([^/\\]+)\.json)\s*$/m);
  return match?.[2] ?? null;
}

/**
 * Resolve a Python executable, matching the convention used by
 * `PythonStdioBridge` in `@nodetool/runtime`.
 */
export function resolvePythonBin(): string {
  const explicit = process.env["NODETOOL_PYTHON"];
  if (explicit) return explicit;

  const condaPrefix = process.env["CONDA_PREFIX"];
  if (condaPrefix && looksLikeNodetoolEnv(condaPrefix)) {
    const bin =
      process.platform === "win32"
        ? join(condaPrefix, "python.exe")
        : join(condaPrefix, "bin", "python");
    if (existsSync(bin)) return bin;
  }

  for (const candidate of managedCandidates()) {
    if (existsSync(candidate)) return candidate;
  }

  return "python";
}

function looksLikeNodetoolEnv(envPath: string): boolean {
  const normalized = envPath.replaceAll("\\", "/").toLowerCase();
  const name = basename(envPath).toLowerCase();
  return (
    name === "nodetool" ||
    name === "conda_env" ||
    normalized.includes("/nodetool/conda_env")
  );
}

function managedCandidates(): string[] {
  const home = homedir();
  if (process.platform === "darwin") {
    return [
      join(home, "nodetool_env", "bin", "python"),
      join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
      join(home, "anaconda3", "envs", "nodetool", "bin", "python"),
      join(home, "conda", "envs", "nodetool", "bin", "python")
    ];
  }
  if (process.platform === "linux") {
    return [
      join(home, ".local", "share", "nodetool", "conda_env", "bin", "python"),
      "/opt/nodetool/conda_env/bin/python",
      join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
      join(home, "anaconda3", "envs", "nodetool", "bin", "python")
    ];
  }
  return [
    join(home, "Miniconda3", "envs", "nodetool", "python.exe"),
    join(home, "miniconda3", "envs", "nodetool", "python.exe"),
    join(home, "Anaconda3", "envs", "nodetool", "python.exe")
  ];
}
