/**
 * Task D3 (docs/RELIABILITY_ARCHITECTURE.md §9 "Process/host": "SIGKILL the
 * server mid-run then restart"). Implemented as a harness-level test, not a
 * `FaultModule` — killing and relaunching a real OS process is a one-shot
 * scenario around a whole driver run, not a "configure the next spawn's env"
 * fault `compareJourney` applies per-surface.
 *
 * Spawns two real, separate Node processes running the hermetic test server
 * entry point (`packages/websocket/src/test-ui-server.ts`'s own
 * `if (import.meta.url === ...)` block — the same tsx-from-source door every
 * other driver here uses, see `drivers/spawn-cli.ts`) against ONE shared
 * SQLite file (`DB_PATH`), so the second process picks up the first's Job
 * row. Deliberately not the full production `packages/websocket/src/
 * server.ts` — that entry point bootstraps the Python bridge, worker
 * manager, and telemetry, which would make "kill and relaunch" minutes-slow
 * instead of a hermetic-harness-appropriate few seconds.
 *
 * What this test asserts (hermetically true, every run):
 *   - The server process can be SIGKILLed and a fresh one relaunched.
 *   - The relaunched process comes back healthy (`/api/examples`) and a
 *     brand-new run against it completes normally.
 *   - Nothing silently "fixes" the killed run's Job row on the new process's
 *     startup: its status right after the kill and its status once the new
 *     process is healthy are identical — because no reconciliation code
 *     exists (confirmed by reading `websocket-client-session.ts`/
 *     `server.ts` — there is no startup pass that revisits `running` Job
 *     rows). This is the "document what isn't assertable hermetically" half
 *     of the task: if the row was "running" the instant the process died, it
 *     stays "running" forever — this test cannot force that exact race
 *     (there's no slow/delay node fixture to pin the timing), so it only
 *     asserts the row's status doesn't change across the restart, whichever
 *     status it happened to land on.
 *
 * NOT assertable hermetically (documented, not implemented here): whether a
 * *production* deployment's supervisor (systemd/Fly/Docker) actually detects
 * the crash and restarts the process — this test supplies its own relaunch,
 * it doesn't exercise any auto-restart mechanism.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { WebSocket } from "ws";
import { packWebSocketMessage, unpackWebSocketMessage } from "@nodetool-ai/websocket";
import { initDb, closeDb, Job } from "@nodetool-ai/models";
import { findRepoRoot, resolveTsxBin } from "../../src/drivers/repo-root.js";

// This journey boots the server twice (once fresh, once after the SIGKILL),
// and each boot pays `tsx`'s runtime TypeScript compile. On an idle machine the
// whole test runs in ~29s; on a loaded CI runner doing a cold, fully-parallel
// package run, a single boot alone overran the old 20s cap and the suite failed
// with "never became healthy within 20000ms". Budget for the slow case rather
// than the fast one — this is still a hard cap, just one wide enough that
// tripping it means the server genuinely did not come up.
const BOOT_TIMEOUT_MS = 60_000;

function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      srv.close((err) => (err ? reject(err) : resolvePromise(port)));
    });
    srv.on("error", reject);
  });
}

/** GET /api/examples — the cheapest 200 this server ever returns, used as a
 * liveness probe (this hermetic entry point has no dedicated /health route,
 * unlike the full production `server.ts`). */
function probe(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/examples", timeout: 1000 }, (res) => {
      res.resume();
      resolvePromise(res.statusCode === 200);
    });
    req.on("error", () => resolvePromise(false));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(false);
    });
  });
}

async function waitForHealthy(port: number, timeoutMs = BOOT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(port)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server on port ${port} never became healthy within ${timeoutMs}ms`);
}

/** Spawns one hermetic test-server process (`test-ui-server.ts`'s own
 * runnable-as-entry-point block) with a fixed port + shared DB file.
 *
 * `detached: true` makes this child the leader of its own process group —
 * required because `tsx`'s bin (`node_modules/.bin/tsx` → `tsx/dist/cli.mjs`)
 * re-execs itself as a SEPARATE grandchild node process (the one that
 * actually runs `test-ui-server.ts`) rather than staying as the running
 * process itself; a plain `child.kill()` on the tracked handle only reaches
 * the thin cli.mjs wrapper, which this test observed exiting on its own and
 * leaving the real server behind as a PPID-1 orphan. Killing the whole
 * process GROUP (`killProcessGroup` below) reaches both. */
function spawnServer(port: number, dbPath: string): ChildProcess {
  const repoRoot = findRepoRoot();
  const tsxBin = resolveTsxBin(repoRoot);
  const entry = join(repoRoot, "packages", "websocket", "src", "test-ui-server.ts");
  return spawn(tsxBin, [entry], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DB_PATH: dbPath },
    detached: true
  });
}

/** Kills a `spawnServer()` child's entire process group (see that function's
 * doc comment for why a plain `child.kill()` isn't enough). Best-effort: a
 * group that's already gone throws ESRCH, which is exactly "already dead". */
function killProcessGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // already exited
  }
}

/** Waits until `probe(port)` stops answering — see `spawnServer`'s doc
 * comment for why "the tracked handle exited" isn't the right signal. */
async function waitForDown(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await probe(port))) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server on port ${port} still answering ${timeoutMs}ms after SIGKILL`);
}

/** Submits a run_job over a real msgpack WS connection and returns immediately
 * once the socket is open and the command is sent — deliberately not waiting
 * for any reply, since this test wants to kill the server WHILE the run is
 * likely still in flight, not after it settles. */
async function fireRunJob(port: number, jobId: string): Promise<void> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolvePromise, reject) => {
    ws.once("open", () => resolvePromise());
    ws.once("error", reject);
  });
  // A longer chain than the happy-path journeys use, purely to widen the
  // window this run spends "running" before this test's immediate SIGKILL —
  // best-effort, not a guarantee (see this file's own doc comment).
  const nodes: Array<Record<string, unknown>> = [
    { id: "n0", type: "nodetool.constant.String", name: "n0", properties: { value: "x" } }
  ];
  const edges: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 40; i++) {
    nodes.push({ id: `n${i}`, type: "nodetool.text.ToUppercase", name: `n${i}`, properties: {} });
    edges.push({
      id: `e${i}`,
      source: `n${i - 1}`,
      sourceHandle: "output",
      target: `n${i}`,
      targetHandle: "text"
    });
  }
  ws.send(
    packWebSocketMessage({
      command: "run_job",
      data: {
        job_id: jobId,
        workflow_id: "sigkill-restart-probe",
        graph: { nodes, edges },
        execution_options: { persistence: "job" }
      }
    })
  );
  // Give the send a tick to actually leave this process before we kill the
  // server it's headed to.
  await new Promise((r) => setImmediate(r));
  ws.close();
}

describe("host-sigkill-restart (task D3)", () => {
  let dbDir: string | null = null;
  let servers: ChildProcess[] = [];

  afterEach(async () => {
    for (const child of servers) {
      killProcessGroup(child);
    }
    servers = [];
    try {
      await closeDb();
    } catch {
      // not initialized in this test — fine
    }
    if (dbDir) {
      await rm(dbDir, { recursive: true, force: true });
      dbDir = null;
    }
  });

  it(
    "SIGKILL mid-run + relaunch: the new process is healthy, a fresh run succeeds, and the killed run's Job row is never silently rewritten by the restart",
    // Two boots at up to BOOT_TIMEOUT_MS each, plus the run itself — the old
    // 60s budget could not fit even two worst-case boots.
    { timeout: 180_000 },
    async () => {
      dbDir = await mkdtemp(join(tmpdir(), "reliability-sigkill-"));
      const dbPath = join(dbDir, "nodetool.sqlite3");

      const portA = await freePort();
      const serverA = spawnServer(portA, dbPath);
      servers.push(serverA);
      await waitForHealthy(portA);

      const killedJobId = "sigkill-victim";
      await fireRunJob(portA, killedJobId);
      // Give the command time to actually cross the loopback socket, land in
      // the server's application layer, and (this journey's fixture has no
      // slow/delay node available in the real production registry — see this
      // file's doc comment) very likely run to completion before we kill —
      // long enough that the row is reliably persisted at all, short enough
      // that this stays a fast test. Without this, `fireRunJob`'s single
      // `setImmediate` tick can race the SIGKILL ahead of the command even
      // arriving, leaving nothing to observe (a `null` row either way, which
      // proves nothing about restart behavior).
      await new Promise((r) => setTimeout(r, 500));

      killProcessGroup(serverA);
      // Confirm the server is actually down by port, not by the tracked
      // handle's own "exit" event — see `spawnServer`'s doc comment: that
      // handle is `tsx`'s thin re-exec wrapper, which can exit well before
      // (or independently of) the real server process dying.
      await waitForDown(portA);

      // Read the killed run's row with our own connection to the shared file
      // — independent of either server process.
      initDb(dbPath);
      const statusAfterKill = (await Job.get<Job>(killedJobId))?.status ?? null;
      await closeDb();
      expect(statusAfterKill).not.toBeNull();

      const portB = await freePort();
      const serverB = spawnServer(portB, dbPath);
      servers.push(serverB);
      await waitForHealthy(portB);

      initDb(dbPath);
      const statusAfterRestart = (await Job.get<Job>(killedJobId))?.status ?? null;
      await closeDb();

      // The core "no reconciliation exists" invariant this test pins: the
      // restart itself never changes the row, whichever status it landed on.
      expect(statusAfterRestart).toBe(statusAfterKill);

      // The system actually comes back healthy: a brand-new run against the
      // relaunched process completes normally.
      const freshJobId = "sigkill-fresh";
      const ws = new WebSocket(`ws://127.0.0.1:${portB}/ws`);
      await new Promise<void>((resolvePromise, reject) => {
        ws.once("open", () => resolvePromise());
        ws.once("error", reject);
      });
      const terminal = await new Promise<Record<string, unknown>>((resolvePromise, reject) => {
        const timer = setTimeout(
          () => reject(new Error("fresh run against the restarted server never terminated")),
          15_000
        );
        ws.on("message", (data: Buffer, isBinary: boolean) => {
          const message = (
            isBinary ? unpackWebSocketMessage(data) : JSON.parse(data.toString("utf8"))
          ) as Record<string, unknown>;
          if (
            message.type === "job_update" &&
            message.job_id === freshJobId &&
            ["completed", "failed", "cancelled"].includes(String(message.status))
          ) {
            clearTimeout(timer);
            resolvePromise(message);
          }
        });
        ws.send(
          packWebSocketMessage({
            command: "run_job",
            data: {
              job_id: freshJobId,
              workflow_id: "sigkill-restart-probe",
              graph: {
                nodes: [
                  {
                    id: "n1",
                    type: "nodetool.constant.String",
                    name: "n1",
                    properties: { value: "healthy again" }
                  }
                ],
                edges: []
              },
              execution_options: { persistence: "session" }
            }
          })
        );
      });
      ws.close();

      expect(terminal.status).toBe("completed");
    }
  );
});
