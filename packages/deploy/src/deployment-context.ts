/**
 * DeploymentContext — the per-operation isolation envelope for a single
 * deployment action (plan / apply / status / logs / destroy).
 *
 * Multi-tenant safety hinges on one rule: a user's provider credentials must
 * NEVER touch `process.env` or any host auth file. Instead they are resolved
 * from the per-user Secret store into `ctx.credentials` and handed to child
 * processes through an explicitly-constructed child env (`runScopedCommand`)
 * or, for in-process HTTP providers (RunPod, HuggingFace token), passed as
 * explicit function arguments.
 *
 * Each context owns a call-scoped `scratchDir` (mkdtemp, 0700) for ephemeral
 * credential files — a scratch docker config, a gcloud config dir, a GCP
 * service-account key, an SSH private key. The manager creates the context
 * before the call and removes the scratch dir recursively in a `finally`
 * afterwards, on both success and failure.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Per-operation deployment context. Constructed fresh by the manager for every
 * plan/apply/status/logs/destroy call and torn down afterwards.
 */
export interface DeploymentContext {
  /** The user this operation runs on behalf of. Scopes every DB read/write. */
  userId: string;
  /**
   * Decrypted provider credentials for THIS call only, keyed by the env-var
   * name the tool expects (e.g. `RUNPOD_API_KEY`, `DOCKER_PASSWORD`,
   * `GCP_SERVICE_ACCOUNT_KEY`). NEVER written to `process.env`. Passed into the
   * child env by `runScopedCommand`, or handed to in-process fetch() providers
   * as explicit arguments. Treat as transient — never log or persist it.
   */
  credentials: Record<string, string>;
  /**
   * Call-scoped temp directory for ephemeral credential files (scratch docker
   * config, gcloud config dir, SA key, SSH key). Created by the manager via
   * mkdtemp at mode 0700 before the call and recursively removed in a `finally`
   * after the call, on both success and failure paths.
   */
  scratchDir: string;
}

/**
 * Curated, NON-SECRET base environment for child processes.
 *
 * This is an explicit allowlist, NOT a blind `{ ...process.env }` spread —
 * spreading process.env would leak the host's ambient credentials (a stray
 * `RUNPOD_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `AWS_*`, etc.) into a
 * user-scoped child process and defeat tenant isolation. We pass only the
 * minimum the CLI tools need to function:
 *
 *   PATH                      — locate the tool binaries (docker, gcloud, ...).
 *   HOME                      — tools expect a home dir; we override the
 *                               AUTH-bearing subdirs (DOCKER_CONFIG,
 *                               CLOUDSDK_CONFIG) per-call so HOME's ambient
 *                               ~/.docker / ~/.config/gcloud are never used.
 *   LANG / LC_ALL             — stable locale so parsed CLI output is
 *                               deterministic.
 *   XDG_CONFIG_HOME           — XDG base dir some tools read; auth subdirs are
 *                               still overridden per-call.
 *   NODETOOL_CONTAINER_RUNTIME — selects docker vs podman (read by
 *                               self-hosted.ts); non-secret config.
 *   SYSTEMROOT / TEMP / TMP   — required on Windows for child processes to
 *                               spawn at all; harmless elsewhere.
 *
 * Secret material (RUNPOD_API_KEY, HF_TOKEN, FLY_API_TOKEN, DOCKER_PASSWORD,
 * GCP_SERVICE_ACCOUNT_KEY, SSH_PRIVATE_KEY, ...) is deliberately ABSENT here
 * and only ever enters the child via `ctx.credentials`.
 */
const MINIMAL_BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "XDG_CONFIG_HOME",
  "NODETOOL_CONTAINER_RUNTIME",
  // Windows-only essentials for spawning child processes.
  "SYSTEMROOT",
  "TEMP",
  "TMP"
] as const;

/**
 * Build the curated, non-secret base env from the current process env.
 *
 * Only keys in {@link MINIMAL_BASE_ENV_KEYS} are copied; everything else (in
 * particular any ambient secret) is dropped.
 */
export function minimalBaseEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MINIMAL_BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/** Options for {@link runScopedCommand}. */
export interface RunScopedCommandOptions {
  /** Working directory for the child process. */
  cwd?: string;
  /**
   * Extra env entries layered on top of `minimalBaseEnv` and `ctx.credentials`.
   * Use this for per-call auth-file redirection (DOCKER_CONFIG, CLOUDSDK_CONFIG,
   * GOOGLE_APPLICATION_CREDENTIALS pointing into `ctx.scratchDir`). Wins over
   * both base env and credentials on key collision.
   */
  env?: Record<string, string>;
  /** Optional stdin payload (e.g. a password for `--password-stdin`). */
  input?: string;
  /** Hard timeout in ms. Defaults to 10 minutes. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 64 * 1024 * 1024; // 64 MB — docker/gcloud output can be large.

/**
 * Central child-process exec helper for the deploy package.
 *
 * Builds the CHILD env EXPLICITLY and NEVER mutates `process.env`. The child
 * env is, in increasing precedence:
 *
 *   { ...minimalBaseEnv(), ...ctx.credentials, ...(opts?.env ?? {}) }
 *
 * so the user's decrypted credentials are visible to the tool, per-call
 * overrides (auth-file redirection) win last, and nothing leaks from the host
 * beyond the curated allowlist.
 *
 * @returns `{ stdout, stderr }` (UTF-8). Throws an Error on non-zero exit; the
 *   error message includes the tool, args, and captured stderr.
 */
export async function runScopedCommand(
  ctx: DeploymentContext,
  file: string,
  args: string[],
  opts?: RunScopedCommandOptions
): Promise<{ stdout: string; stderr: string }> {
  const childEnv: Record<string, string> = {
    ...minimalBaseEnv(),
    ...ctx.credentials,
    ...(opts?.env ?? {})
  };

  try {
    const child = execFileAsync(file, args, {
      cwd: opts?.cwd,
      env: childEnv,
      encoding: "utf-8",
      timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER
    });

    if (opts?.input !== undefined && child.child.stdin) {
      child.child.stdin.write(opts.input);
      child.child.stdin.end();
    }

    const { stdout, stderr } = await child;
    // encoding: "utf-8" guarantees string stdout/stderr.
    return { stdout: String(stdout), stderr: String(stderr) };
  } catch (err) {
    const e = err as {
      stderr?: string | Buffer;
      stdout?: string | Buffer;
      message?: string;
    };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : e.stderr
          ? e.stderr.toString("utf-8")
          : "";
    // Do NOT include args verbatim if a downstream caller put a secret there —
    // callers are required to keep secrets out of argv (stdin/scratch file),
    // so the arg list here is non-secret and safe to surface for debugging.
    throw new Error(
      `Command failed: ${file} ${args.join(" ")}${
        stderr ? `\n${stderr.trim()}` : ""
      }${e.message && !stderr ? `\n${e.message}` : ""}`
    );
  }
}

/**
 * Write a 0600 file into the context's scratch dir and return its absolute
 * path. Used for ephemeral credential material (GCP SA key, SSH private key,
 * docker config, gcloud config, env-vars files for `gcloud --env-vars-file`).
 *
 * `relPath` must be a relative path that stays inside the scratch dir — it may
 * not be absolute and may not contain `..` segments. Intermediate directories
 * are created at 0700.
 */
export async function writeScratchFile(
  ctx: DeploymentContext,
  relPath: string,
  contents: string
): Promise<string> {
  if (path.isAbsolute(relPath)) {
    throw new Error(
      `writeScratchFile: relPath must be relative, got ${JSON.stringify(relPath)}`
    );
  }
  const normalized = path.normalize(relPath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(
      `writeScratchFile: relPath must stay inside the scratch dir, got ${JSON.stringify(relPath)}`
    );
  }

  const target = path.resolve(ctx.scratchDir, normalized);
  const scratchRoot = path.resolve(ctx.scratchDir);
  if (target !== scratchRoot && !target.startsWith(scratchRoot + path.sep)) {
    throw new Error(
      `writeScratchFile: resolved path escapes the scratch dir: ${target}`
    );
  }

  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, contents, { encoding: "utf-8", mode: 0o600 });
  return target;
}

/**
 * Create a fresh scratch dir (mkdtemp, mode 0700) for a single deployment
 * operation. The caller MUST remove it in a `finally` (see
 * {@link removeScratchDir}).
 */
export async function createScratchDir(prefix = "nodetool-deploy-"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  // mkdtemp already creates at 0700 on POSIX, but make it explicit/portable.
  await fs.chmod(dir, 0o700).catch(() => {
    /* chmod may be a no-op on some platforms; ignore */
  });
  return dir;
}

/**
 * Recursively remove a scratch dir. Safe to call on a path that no longer
 * exists. Intended for the manager's `finally` block.
 */
export async function removeScratchDir(scratchDir: string): Promise<void> {
  await fs.rm(scratchDir, { recursive: true, force: true });
}

/**
 * Construct a context, run `fn`, and tear the scratch dir down in a `finally`
 * on BOTH success and failure. The manager uses this to guarantee scratch-dir
 * hygiene around every per-user operation.
 */
export async function withDeploymentContext<T>(
  init: { userId: string; credentials: Record<string, string> },
  fn: (ctx: DeploymentContext) => Promise<T>
): Promise<T> {
  const scratchDir = await createScratchDir();
  const ctx: DeploymentContext = {
    userId: init.userId,
    credentials: init.credentials,
    scratchDir
  };
  try {
    return await fn(ctx);
  } finally {
    await removeScratchDir(scratchDir);
  }
}

/**
 * A runner bound to a single context. Deployers build one of these and thread
 * it down into their module-level free functions so every child process runs
 * with the user's scoped child env — storing `ctx` on the deployer alone does
 * nothing; the credentials must reach the leaf exec calls.
 */
export type ScopedRunner = (
  file: string,
  args: string[],
  opts?: RunScopedCommandOptions
) => Promise<{ stdout: string; stderr: string }>;

/** Build a {@link ScopedRunner} bound to `ctx`. */
export function makeScopedRunner(ctx: DeploymentContext): ScopedRunner {
  return (file, args, opts) => runScopedCommand(ctx, file, args, opts);
}
