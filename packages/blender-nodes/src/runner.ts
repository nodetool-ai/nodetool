/**
 * The runner interface and its local implementation (D6).
 *
 * The runner works on logical files and nothing else. No scratch directory,
 * no argv, and no path crosses the interface, so the local and worker
 * implementations differ only in where the bytes go.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger } from "@nodetool-ai/config";
import { runHostBinary } from "@nodetool-ai/runtime";

import { resolveBlenderBinary } from "./blender-binary.js";
import {
  blenderResultSchema,
  type BlenderJob,
  type BlenderResultStats
} from "./job.js";

const log = createLogger("nodetool.blender-nodes.runner");

/** Per-output byte cap, overridable per call. */
export const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
/** Cap on the sum of all outputs, overridable per call. */
export const MAX_TOTAL_OUTPUT_BYTES = 1024 * 1024 * 1024;
/** Ceiling on declared outputs. */
export const MAX_OUTPUT_COUNT = 32;

/** Last bytes of stderr carried on a `bad_result`. */
const STDERR_TAIL_BYTES = 4 * 1024;

/** Exit code `run_job.py` uses for "the script raised" (D5). */
const PYTHON_EXIT_CODE = 64;

export type BlenderJobErrorCode =
  | "import_failed"
  | "no_geometry"
  | "no_camera"
  | "unsupported_format"
  | "render_failed"
  | "export_failed"
  | "bad_job"
  | "bad_result"
  | "missing_output"
  | "output_too_large"
  | "timeout";

export class BlenderJobError extends Error {
  readonly code: BlenderJobErrorCode;
  constructor(code: BlenderJobErrorCode, message: string) {
    super(message);
    this.name = "BlenderJobError";
    this.code = code;
  }
}

export interface BlenderRunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (frame: number, total: number) => void;
  /** Per-output byte cap. Default MAX_OUTPUT_BYTES (512 MiB). */
  maxOutputBytes?: number;
  /** Cap on the sum of all outputs. Default MAX_TOTAL_OUTPUT_BYTES (1 GiB). */
  maxTotalOutputBytes?: number;
  /**
   * Parent directory for the per-run scratch directory. `runBlenderJob`
   * derives this from `context.workspace.scratchDir()` (D6 step 1), so the
   * run stages through the workspace seam instead of a bare temp path. The
   * constructor option below is only a test override.
   */
  scratchParent?: string;
}

export interface BlenderRunResult {
  /** Keyed by `job.outputs` name. Only declared outputs are ever read. */
  outputs: Record<string, Uint8Array>;
  stats: BlenderResultStats;
  /** Blender's exit code. Present on local runs. */
  exitCode?: number;
  /**
   * How long the run waited for the `render` concurrency slot, in
   * milliseconds. The local runner copies it from `runHostBinary`; fakes
   * leave it unset.
   */
  queuedMs?: number;
}

export interface BlenderRunner {
  readonly kind: "local" | "worker";
  run(
    job: BlenderJob,
    inputs: Record<string, Uint8Array>,
    options: BlenderRunOptions
  ): Promise<BlenderRunResult>;
}

export interface LocalBlenderRunnerOptions {
  /**
   * Parent directory for the per-run scratch directory. Test-only override:
   * production always arrives through `BlenderRunOptions.scratchParent`,
   * which `runBlenderJob` derives from `context.workspace.scratchDir()`.
   */
  scratchParent?: string;
}

/**
 * Directory holding the vendored `run_job.py` op script, which differs by
 * deployment and is checked rather than assumed (same shape as
 * `bundledFontsDir` in `@nodetool-ai/timeline`):
 *
 * - a checkout or an npm install resolves `packages/blender-nodes/blender_ops/`,
 *   one level above this module's `dist/` output;
 * - the packaged backend is one flat `server.mjs`, so `import.meta.url` is the
 *   bundle root and `bundle-backend.mjs` stages the directory beside it as
 *   `_blender_ops/`.
 *
 * Throws naming the expected entry point when neither exists, so a missing
 * stage fails here with the fix instead of inside Blender's stderr tail.
 */
export function resolveOpScriptDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "..", "blender_ops"),
    path.join(here, "_blender_ops")
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "run_job.py"))) return dir;
  }
  throw new BlenderJobError(
    "bad_result",
    `Blender op scripts not found. Tried ${candidates.join(" and ")}. ` +
      `In dev, check packages/blender-nodes/blender_ops/ exists; in the ` +
      `packaged app, check bundle-backend.mjs staged _blender_ops/.`
  );
}

/** Env keys the Blender child inherits. Everything else stays out. */
const ALLOWED_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "SYSTEMROOT",
  "CUDA_VISIBLE_DEVICES"
] as const;

function stderrTail(stderr: string): string {
  return Buffer.from(stderr, "utf8").subarray(-STDERR_TAIL_BYTES).toString("utf8");
}

/** Blender prints `Fra:<n>` lines on stderr during animation renders. */
function parseProgressFrame(line: string): number | null {
  const match = /^Fra:(\d+)\b/.exec(line.trim());
  return match ? Number(match[1]) : null;
}

function progressTotal(job: BlenderJob, frame: number): number {
  if (job.job.op === "render_animation") {
    const { frame_start, frame_end } = job.job.params;
    if (
      Number.isInteger(frame_start) &&
      Number.isInteger(frame_end) &&
      frame_end >= frame_start
    ) {
      return frame_end - frame_start + 1;
    }
  }
  return frame;
}

export class LocalBlenderRunner implements BlenderRunner {
  readonly kind = "local" as const;
  private readonly scratchParent: string | undefined;

  constructor(options: LocalBlenderRunnerOptions = {}) {
    this.scratchParent = options.scratchParent;
  }

  async run(
    job: BlenderJob,
    inputs: Record<string, Uint8Array>,
    options: BlenderRunOptions
  ): Promise<BlenderRunResult> {
    // Refuse before resolving a binary: without a scratch parent there is
    // no seam to stage through, and no tmpdir fallback exists.
    const parent = options.scratchParent ?? this.scratchParent;
    if (parent === undefined) {
      throw new BlenderJobError(
        "bad_job",
        `LocalBlenderRunner has no scratch directory: pass scratchParent ` +
          `in BlenderRunOptions (runBlenderJob derives it from ` +
          `context.workspace.scratchDir()).`
      );
    }
    const binary = await resolveBlenderBinary();
    const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    const maxTotalOutputBytes =
      options.maxTotalOutputBytes ?? MAX_TOTAL_OUTPUT_BYTES;

    // Step 1: own a scratch directory under the workspace seam; write each
    // input under its declared bare file name, then `job.json`. Only the
    // per-run directory the runner creates is deleted in step 6 — never the
    // parent, which on a local workspace is the workspace itself.
    const cwd = await mkdtemp(path.join(parent, "nodetool-blender-"));
    try {
      for (const [name, bytes] of Object.entries(inputs)) {
        const file = job.inputs[name as keyof typeof job.inputs];
        if (file === undefined) {
          throw new BlenderJobError(
            "bad_job",
            `Input "${name}" is not declared in job.inputs.`
          );
        }
        await writeFile(path.join(cwd, file), bytes);
      }
      await writeFile(path.join(cwd, "job.json"), JSON.stringify(job));

      // The user's add-ons and startup scripts never load: the BLENDER_USER_*
      // dirs point at an empty directory the runner owns.
      const userDir = path.join(cwd, "blender-user");
      await mkdir(path.join(userDir, "config"), { recursive: true });
      await mkdir(path.join(userDir, "scripts"), { recursive: true });
      await mkdir(path.join(userDir, "extensions"), { recursive: true });
      const env: Record<string, string> = {};
      for (const key of ALLOWED_ENV_KEYS) {
        const value = process.env[key];
        if (value !== undefined) env[key] = value;
      }
      env["BLENDER_USER_CONFIG"] = path.join(userDir, "config");
      env["BLENDER_USER_SCRIPTS"] = path.join(userDir, "scripts");
      env["BLENDER_USER_EXTENSIONS"] = path.join(userDir, "extensions");

      // Step 2: spawn through the bounded host binary runner.
      const argv = [
        "-b",
        "--factory-startup",
        "--disable-autoexec",
        "--python-exit-code",
        String(PYTHON_EXIT_CODE),
        "--python",
        path.join(resolveOpScriptDir(), "run_job.py"),
        "--",
        "job.json"
      ];
      const onProgress = options.onProgress;
      let result: Awaited<ReturnType<typeof runHostBinary>>;
      try {
        result = await runHostBinary(binary.path, argv, {
          cwd,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
          concurrencyClass: "render",
          env,
          onStderrLine:
            onProgress === undefined
              ? undefined
              : (line: string) => {
                  const frame = parseProgressFrame(line);
                  if (frame !== null) onProgress(frame, progressTotal(job, frame));
                }
        });
      } catch (err) {
        // Cancellation rejects with the abort reason: pass it through
        // unwrapped so the node rejects with the abort reason.
        if (options.signal?.aborted) throw err;
        throw new BlenderJobError(
          "bad_result",
          `Blender run failed before producing a result: ${messageOf(err)}`
        );
      }

      if (isTimeout(result)) {
        throw new BlenderJobError(
          "timeout",
          `Blender render timed out after ${options.timeoutMs}ms. ` +
            `Lower the samples, use EEVEE, or raise the timeout.`
        );
      }

      // Step 3: read `result.json`. A missing or unparsable file is
      // `bad_result` carrying the last 4 KiB of stderr (plus the `.crash.txt`
      // Blender leaves on a segfault, when present).
      const parsed = await readResult(cwd, result.stderr);

      // Step 4: the op's own failure.
      if (!parsed.ok) {
        throw new BlenderJobError(parsed.error.code, parsed.error.message);
      }

      // Step 5: read only the outputs `job.outputs` declared. A name in
      // `produced` the job did not declare is ignored at warn; a path inside
      // `result.json` is never opened — the result carries no paths at all.
      const declared = Object.entries(job.outputs);
      const produced = new Set(parsed.produced);
      for (const name of parsed.produced) {
        if (!(name in job.outputs)) {
          log.warn(`Blender produced undeclared output "${name}"; ignoring.`);
        }
      }
      // Stat every declared output before reading any byte, so both caps
      // throw before a file is read into memory.
      let total = 0;
      for (const [name, file] of declared) {
        if (!produced.has(name)) {
          throw new BlenderJobError(
            "missing_output",
            `Blender did not produce declared output "${name}" (file "${file}").`
          );
        }
        let size: number;
        try {
          size = (await stat(path.join(cwd, file))).size;
        } catch {
          throw new BlenderJobError(
            "missing_output",
            `Blender did not produce declared output "${name}": file "${file}" is missing.`
          );
        }
        if (size > maxOutputBytes) {
          throw new BlenderJobError(
            "output_too_large",
            `Output "${name}" is ${size} bytes, above the ${maxOutputBytes}-byte per-output cap.`
          );
        }
        total += size;
        if (total > maxTotalOutputBytes) {
          throw new BlenderJobError(
            "output_too_large",
            `Outputs total ${total} bytes, above the ${maxTotalOutputBytes}-byte total cap (reached at "${name}").`
          );
        }
      }
      const outputs: Record<string, Uint8Array> = {};
      for (const [name, file] of declared) {
        outputs[name] = new Uint8Array(
          await readFile(path.join(cwd, file))
        );
      }
      return {
        outputs,
        stats: parsed.stats,
        exitCode: result.exitCode,
        queuedMs: result.queuedMs
      };
    } finally {
      // Step 6: the scratch directory goes away on every path — abort,
      // timeout, and the cap errors included.
      await rm(cwd, { recursive: true, force: true });
    }
  }
}

function isTimeout(result: { exitCode: number; stderr: string }): boolean {
  return result.exitCode === 124 && result.stderr.includes("timed out after");
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readResult(
  cwd: string,
  stderr: string
): Promise<
  | { ok: true; produced: string[]; stats: BlenderResultStats }
  | { ok: false; error: { code: BlenderJobErrorCode; message: string } }
> {
  let raw: string;
  try {
    raw = await readFile(path.join(cwd, "result.json"), "utf8");
  } catch {
    throw new BlenderJobError(
      "bad_result",
      await badResultMessage(cwd, stderr)
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BlenderJobError(
      "bad_result",
      await badResultMessage(cwd, stderr)
    );
  }
  const parsed = blenderResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new BlenderJobError(
      "bad_result",
      await badResultMessage(cwd, stderr)
    );
  }
  const result = parsed.data;
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, produced: result.produced, stats: result.stats };
}

async function badResultMessage(cwd: string, stderr: string): Promise<string> {
  let message =
    `Blender finished without a parsable result.json. ` +
    `Stderr tail: ${stderrTail(stderr)}`;
  const crash = await readCrashLog(cwd);
  if (crash) message += ` Crash log: ${crash}`;
  return message;
}

/**
 * Contents of the `.crash.txt` Blender leaves on a segfault, when present.
 *
 * Blender writes `<name>.crash.txt` into its temp directory (`$TMPDIR`,
 * which the env allowlist forwards to the child), never into the run's
 * cwd — a run with no `.blend` file open leaves `blender.crash.txt` there.
 * Both places are checked, the temp directory first, since that is where
 * Blender really writes.
 */
async function readCrashLog(cwd: string): Promise<string | null> {
  const tmpdir =
    process.env["TMPDIR"] ?? process.env["TEMP"] ?? process.env["TMP"] ??
    os.tmpdir();
  for (const dir of [tmpdir, cwd]) {
    if (dir === undefined || dir === "") continue;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const crashFile = entries
      .filter((name) => name.endsWith(".crash.txt"))
      .sort()[0];
    if (!crashFile) continue;
    try {
      const text = await readFile(path.join(dir, crashFile), "utf8");
      return Buffer.from(text, "utf8").subarray(0, STDERR_TAIL_BYTES).toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}
