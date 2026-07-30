/**
 * Browser driver (§12) — wraps the existing `e2e_runner` Playwright harness
 * (`web/tests/debug-harness/debug.spec.ts`, the same spec `nodetool debug
 * --browser` and `npm run test:debug-harness` drive) to run a journey's
 * workflow through the real web stack: real ReactFlow canvas, real
 * `GlobalWebSocketManager`, real WS protocol, hermetic backend
 * (`packages/websocket/src/e2e-server.ts`, spawned by the spec's
 * `globalSetup`).
 *
 * Spawns Playwright directly (root `node_modules/.bin/playwright`, `cwd:
 * web/`) rather than importing `packages/cli/src/debug/browser-runner.ts`:
 * that module lives in `@nodetool-ai/cli`, which depends on this package for
 * the `reliability` command (item 6), so importing it here would be a
 * circular workspace dependency — and going through the real Playwright
 * binary is what "drivers speak entry points, never internals" (§12) means
 * for a non-oracle surface anyway.
 *
 * Scripted interactions (`cancel`/`stream_input`/`end_input_stream`) are not
 * yet wired through `NODETOOL_DEBUG_*` env — the spec runs one `runGraph`
 * call start-to-finish, same limitation as the CLI driver. `supports()`
 * reflects that.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Journey } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { findRepoRoot } from "./repo-root.js";
import type { RunDriver } from "./types.js";

const CONFIG_REL = "playwright.debug-harness.config.ts";
const DEFAULT_TIMEOUT_MS = 6 * 60_000;
const GROUP_KILL_GRACE_MS = 5_000;

/** Minimal shape this driver needs from a decoded `browser/record.json`
 * (`web/src/e2e_runner/types.ts`'s `RunRecord`). */
export interface BrowserRunRecordLike {
  status?: string;
  error?: string | null;
  durationMs?: number | null;
  jobId?: string | null;
  events?: Array<Record<string, unknown>>;
}

/** Locates the workspace-hoisted Playwright binary a fresh `web/`
 * `node_modules/.bin` doesn't necessarily carry (root `npm install` hoists
 * it), falling back to `web`'s own copy when present. */
function resolvePlaywrightBin(repoRoot: string, webDir: string): string | null {
  const local = join(webDir, "node_modules", ".bin", "playwright");
  if (existsSync(local)) return local;
  const hoisted = join(repoRoot, "node_modules", ".bin", "playwright");
  return existsSync(hoisted) ? hoisted : null;
}

function killChild(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    const pgid = child.pid;
    try {
      process.kill(-pgid, "SIGTERM");
    } catch {
      // Process group may already be gone.
    }
    setTimeout(() => {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // Process group may already be gone.
      }
    }, GROUP_KILL_GRACE_MS).unref();
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Already exited.
  }
}

/** Folds a decoded `browser/record.json` into a `RunRecord`. Pure — the IO
 * (spawning Playwright, reading the file back) lives in {@link BrowserDriver},
 * so a captured fixture round-trips through this without a browser. */
export function runRecordFromBrowserRecord(
  record: BrowserRunRecordLike,
  options: { journeyId?: string; startedAt?: number } = {}
): RunRecord {
  const startedAt = options.startedAt ?? 0;
  const events = record.events ?? [];
  const frames: RunFrame[] = events.map((message, index) =>
    makeFrame(index, "browser", "server_to_client", message, startedAt + index)
  );

  return {
    journeyId: options.journeyId,
    surface: "browser",
    jobId: record.jobId ?? null,
    workflowId: null,
    startedAt: frames.length > 0 ? startedAt : null,
    finishedAt: frames.length > 0 ? startedAt + (frames.length - 1) : null,
    durationMs: record.durationMs ?? null,
    status: record.status ?? "unknown",
    error: record.error ?? null,
    params: {},
    frames
  };
}

export class BrowserDriver implements RunDriver {
  readonly name = "browser";

  /** A single, unscripted `run` (see the module doc comment) AND Playwright
   * actually available in this environment. Folding `isAvailable()` in here
   * — rather than leaving it a separate check `run()` fails on — is what lets
   * `compare.ts` report a sandbox without a matching Chromium build as "not
   * applicable" instead of a false "diverges from the oracle" failure. */
  supports(journey: Journey): boolean {
    const interactions =
      journey.interactions.length > 0 ? journey.interactions : [{ action: "run" as const }];
    const shapeOk = interactions.length === 1 && interactions[0].action === "run";
    return shapeOk && this.isAvailable();
  }

  /** True when Playwright and its Chromium binary are actually available in
   * this environment — lets callers (`compare.ts`, tests) skip cleanly
   * instead of failing the whole run. */
  isAvailable(): boolean {
    const repoRoot = findRepoRoot();
    const webDir = join(repoRoot, "web");
    return (
      existsSync(join(webDir, CONFIG_REL)) &&
      resolvePlaywrightBin(repoRoot, webDir) !== null
    );
  }

  async run(journey: Journey): Promise<RunRecord> {
    if (!this.supports(journey)) {
      throw new Error(
        `journey "${journey.manifest.name}": browser driver only supports a ` +
          `single, unscripted "run" interaction`
      );
    }

    const repoRoot = findRepoRoot();
    const webDir = join(repoRoot, "web");
    const playwrightBin = resolvePlaywrightBin(repoRoot, webDir);
    if (!playwrightBin || !existsSync(join(webDir, CONFIG_REL))) {
      throw new Error(
        `journey "${journey.manifest.name}": browser driver unavailable — ` +
          `Playwright is not installed (root and web node_modules/.bin both ` +
          `missing "playwright") or ${CONFIG_REL} is missing from web/`
      );
    }

    const outDir = await mkdtemp(join(tmpdir(), "nodetool-reliability-browser-"));
    try {
      const graphPath = join(outDir, "_graph.json");
      await writeFile(graphPath, JSON.stringify({ graph: journey.workflow }), "utf8");

      const timeoutMs = journey.manifest.timeoutMs;
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODETOOL_DEBUG_GRAPH: graphPath,
        NODETOOL_DEBUG_OUT: outDir,
        NODETOOL_DEBUG_PARAMS: JSON.stringify(journey.manifest.params ?? {}),
        NODETOOL_DEBUG_TIMEOUT: String(timeoutMs)
      };
      const killTimeoutMs = Math.max(timeoutMs + 60_000, DEFAULT_TIMEOUT_MS);

      const isWindows = process.platform === "win32";
      let output = "";
      await new Promise<void>((resolvePromise) => {
        const child = spawn(playwrightBin, ["test", "-c", CONFIG_REL], {
          cwd: webDir,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          ...(isWindows ? { shell: true } : { detached: true })
        });
        const onChunk = (buf: Buffer) => (output += buf.toString());
        child.stdout?.on("data", onChunk);
        child.stderr?.on("data", onChunk);
        const timer = setTimeout(() => {
          killChild(child);
          resolvePromise();
        }, killTimeoutMs);
        child.on("error", () => {
          clearTimeout(timer);
          resolvePromise();
        });
        child.on("exit", () => {
          clearTimeout(timer);
          resolvePromise();
        });
      });

      const recordPath = join(outDir, "record.json");
      if (!existsSync(recordPath)) {
        throw new Error(
          `journey "${journey.manifest.name}": browser driver produced no ` +
            `record.json — check that the web app builds and Chromium is ` +
            `installed\n--- playwright output ---\n${output.trimEnd()}`
        );
      }

      const record = JSON.parse(
        await readFile(recordPath, "utf8")
      ) as BrowserRunRecordLike;
      return runRecordFromBrowserRecord(record, { journeyId: journey.manifest.name });
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
