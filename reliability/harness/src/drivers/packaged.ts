/**
 * Packaged driver (§12) — stages the backend bundle the same way
 * `npm run backend:smoke` does (`scripts/bundle-backend.mjs` +
 * `scripts/smoke-backend-bundle.mjs`'s packaged-module-layout trick), boots
 * the staged `server.mjs` on a free port, and runs the journey against it
 * over the real WS protocol — the same msgpack codec `ws-server.ts` uses
 * (`@nodetool-ai/websocket`'s `packWebSocketMessage`/`unpackWebSocketMessage`
 * is the wire protocol itself, not an internal seam). Journey 15 (§5): "the
 * packaged-backend journey ring".
 *
 * EXPENSIVE: staging alone copies/rewrites hundreds of MB and takes minutes,
 * so `stageBackendBundle` is opt-in — callers (tests, the CLI) gate it behind
 * an env flag (`RELIABILITY_PACKAGED=1`) and otherwise point `bundleDir` at
 * an already-staged tree. The driver itself has no such gate: given a bundle,
 * `run()` always boots it for real.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { packWebSocketMessage, unpackWebSocketMessage } from "@nodetool-ai/websocket";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { AnchorWaiter } from "./anchors.js";
import { isConnectionControlMessage, stripRelayOnlyFields } from "./relay-fields.js";
import { findRepoRoot } from "./repo-root.js";
import type { RunDriver } from "./types.js";

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled", "suspended"]);
const DEFAULT_HEALTH_TIMEOUT_MS = 120_000;

function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      srv.close(() => resolvePromise(port));
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Stages the backend bundle via the exact entry point `npm run backend:smoke`
 * uses (`npm run prepare-backend --workspace=electron`, i.e.
 * `scripts/bundle-backend.mjs`). Expensive (minutes) — call once per journey
 * session, not per journey.
 */
export async function stageBackendBundle(repoRoot: string = findRepoRoot()): Promise<string> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("npm", ["run", "prepare-backend", "--workspace=electron"], {
      cwd: repoRoot,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`prepare-backend exited with code ${code}`));
    });
    child.on("error", reject);
  });
  return join(repoRoot, "electron", "backend-bundle");
}

/**
 * Electron-builder's `afterPack` promotes the staged `_modules/` to
 * `node_modules/` in the packed app — `_modules` only exists pre-pack to
 * dodge electron-builder's own `node_modules` exclusion rule
 * (`scripts/smoke-backend-bundle.mjs`'s exact comment). Node needs the real
 * name to resolve `server.mjs`'s externals, so this driver does the same
 * rename, and restores it afterward so a staged tree round-trips through a
 * driver run unchanged.
 */
async function withPackagedModuleLayout(bundleDir: string): Promise<() => Promise<void>> {
  const staged = join(bundleDir, "_modules");
  const packaged = join(bundleDir, "node_modules");
  if (existsSync(packaged)) return async () => {};
  if (!existsSync(staged)) {
    throw new Error(
      `neither _modules/ nor node_modules/ exists in ${bundleDir} — stage it first ` +
        `(npm run prepare-backend --workspace=electron, or stageBackendBundle())`
    );
  }
  await rename(staged, packaged);
  return async () => {
    await rename(packaged, staged);
  };
}

function resolveNodeBinary(bundleDir: string, override?: string): string {
  if (override) return override;
  const bundled = join(bundleDir, "runtime", process.platform === "win32" ? "node.exe" : "node");
  return existsSync(bundled) ? bundled : process.execPath;
}

interface BootedServer {
  child: ChildProcess;
  port: number;
  output: string[];
  restoreModuleLayout: () => Promise<void>;
  dataDir: string;
}

async function bootServer(
  bundleDir: string,
  nodeBinary: string,
  healthTimeoutMs: number
): Promise<BootedServer> {
  const restoreModuleLayout = await withPackagedModuleLayout(bundleDir);
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), "nodetool-reliability-packaged-"));
  const output: string[] = [];

  const child = spawn(nodeBinary, ["server.mjs"], {
    cwd: bundleDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOME: dataDir,
      XDG_DATA_HOME: dataDir,
      APPDATA: dataDir,
      SECRETS_MASTER_KEY: randomBytes(32).toString("base64"),
      NODETOOL_LOG_LEVEL: process.env["NODETOOL_LOG_LEVEL"] ?? "warn"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (buf: Buffer) => output.push(buf.toString()));
  child.stderr?.on("data", (buf: Buffer) => output.push(buf.toString()));

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const deadline = Date.now() + healthTimeoutMs;
  let healthy = false;
  while (Date.now() < deadline && !exited && !healthy) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      healthy = res.ok;
    } catch {
      // Not up yet.
    }
  }

  if (!healthy) {
    if (!exited) child.kill("SIGKILL");
    await restoreModuleLayout();
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `packaged driver: server.mjs never answered /health within ${healthTimeoutMs}ms\n` +
        `--- server output ---\n${output.join("").trimEnd() || "(no output)"}`
    );
  }

  return { child, port, output, restoreModuleLayout, dataDir };
}

async function teardownServer(server: BootedServer): Promise<void> {
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill("SIGTERM");
    const hardKill = setTimeout(() => server.child.kill("SIGKILL"), 10_000);
    await new Promise<void>((resolvePromise) => {
      server.child.once("exit", () => resolvePromise());
    });
    clearTimeout(hardKill);
  }
  await server.restoreModuleLayout();
  await rm(server.dataDir, { recursive: true, force: true }).catch(() => {});
}

function requireJobId(jobId: string | null, journeyName: string, action: string): string {
  if (!jobId) {
    throw new Error(
      `journey "${journeyName}": "${action}" interaction fired before a job_id was observed`
    );
  }
  return jobId;
}

export interface PackagedDriverOptions {
  /** Staged bundle dir; defaults to `<repoRoot>/electron/backend-bundle`. */
  bundleDir?: string;
  /** Node binary to boot `server.mjs` with; defaults to the bundle's own
   * staged `runtime/node` when present, else the current interpreter. */
  nodeBinary?: string;
  /** How long to wait for `/health` before giving up, ms. */
  healthTimeoutMs?: number;
}

export class PackagedDriver implements RunDriver {
  readonly name = "packaged";

  constructor(private readonly options: PackagedDriverOptions = {}) {}

  /** True when a bundle is staged at the configured (or default) location. */
  isStaged(): boolean {
    const bundleDir = this.options.bundleDir ?? join(findRepoRoot(), "electron", "backend-bundle");
    return existsSync(join(bundleDir, "server.mjs"));
  }

  async run(journey: Journey): Promise<RunRecord> {
    const bundleDir = this.options.bundleDir ?? join(findRepoRoot(), "electron", "backend-bundle");
    if (!existsSync(join(bundleDir, "server.mjs"))) {
      throw new Error(
        `packaged driver: no staged bundle at ${bundleDir} — run ` +
          `stageBackendBundle() or 'npm run prepare-backend --workspace=electron' first`
      );
    }
    const nodeBinary = resolveNodeBinary(bundleDir, this.options.nodeBinary);
    const server = await bootServer(
      bundleDir,
      nodeBinary,
      this.options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS
    );

    const frames: RunFrame[] = [];
    let seq = 0;
    const waiter = new AnchorWaiter();
    let jobId: string | null = null;
    let terminalStatus: string | null = null;
    let terminalError: string | null = null;
    const seenJobUpdateStatuses = new Set<string>();
    let resolveTerminal!: () => void;
    const terminalPromise = new Promise<void>((resolvePromise) => {
      resolveTerminal = resolvePromise;
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      const raw = (
        isBinary ? unpackWebSocketMessage(data) : JSON.parse(data.toString("utf8"))
      ) as Record<string, unknown>;
      // The packaged server is a relay, exactly like `ws-server.ts`'s surface:
      // it boots the real `server.mjs`, whose Fastify plugin announces the
      // connection and whose `WebSocketClientSession` backfills run identity
      // onto frames the kernel oracle emits bare. Both are cancelled here so
      // the packaged stream is comparable to the oracle frame-for-frame.
      if (isConnectionControlMessage(raw)) return;
      const message = stripRelayOnlyFields(raw);
      waiter.notify(message);
      if (typeof message["job_id"] === "string") {
        jobId = message["job_id"] as string;
      }
      if (typeof message["type"] !== "string") return;

      if (message["type"] === "job_update") {
        const status = String(message["status"]);
        if (seenJobUpdateStatuses.has(status)) return;
        seenJobUpdateStatuses.add(status);
        if (TERMINAL_JOB_STATUSES.has(status)) {
          terminalStatus = status;
          terminalError =
            typeof message["error"] === "string" ? (message["error"] as string) : null;
          frames.push(makeFrame(seq++, "packaged", "server_to_client", message));
          resolveTerminal();
          return;
        }
      }
      frames.push(makeFrame(seq++, "packaged", "server_to_client", message));
    });

    try {
      await new Promise<void>((resolvePromise, reject) => {
        ws.once("open", () => resolvePromise());
        ws.once("error", reject);
      });

      const send = (command: string, data: Record<string, unknown>): void => {
        const envelope = { command, data };
        frames.push(makeFrame(seq++, "packaged", "client_to_server", envelope));
        ws.send(packWebSocketMessage(envelope));
      };

      const interactions: JourneyInteraction[] =
        journey.interactions.length > 0 ? journey.interactions : [{ action: "run" }];

      for (const interaction of interactions) {
        if (interaction.at) {
          await waiter.wait(interaction.at);
        }
        switch (interaction.action) {
          case "run":
            send("run_job", {
              graph: journey.workflow,
              workflow_id: journey.manifest.name,
              params: journey.manifest.params,
              execution_options: { persistence: "session" }
            });
            break;
          case "cancel":
            send("cancel_job", {
              job_id: requireJobId(jobId, journey.manifest.name, "cancel")
            });
            break;
          case "stream_input":
            if (!interaction.nodeId) {
              throw new Error(
                `journey "${journey.manifest.name}": "stream_input" interaction needs nodeId`
              );
            }
            send("stream_input", {
              job_id: requireJobId(jobId, journey.manifest.name, "stream_input"),
              input: interaction.nodeId,
              value: interaction.value
            });
            break;
          case "end_input_stream":
            if (!interaction.nodeId) {
              throw new Error(
                `journey "${journey.manifest.name}": "end_input_stream" interaction needs nodeId`
              );
            }
            send("end_input_stream", {
              job_id: requireJobId(jobId, journey.manifest.name, "end_input_stream"),
              input: interaction.nodeId
            });
            break;
          case "reconnect":
            throw new Error(
              `journey "${journey.manifest.name}": packaged driver does not support ` +
                `the "reconnect" interaction`
            );
        }
      }

      const timeoutMs = journey.manifest.timeoutMs + 30_000;
      await Promise.race([
        terminalPromise,
        sleep(timeoutMs).then(() => {
          throw new Error(
            `journey "${journey.manifest.name}": packaged driver timed out after ${timeoutMs}ms ` +
              `waiting for a terminal job_update`
          );
        })
      ]);
    } finally {
      ws.close();
      await teardownServer(server);
    }

    return {
      journeyId: journey.manifest.name,
      surface: this.name,
      jobId,
      workflowId: journey.manifest.name,
      startedAt: frames.length > 0 ? frames[0].ts : null,
      finishedAt: frames.length > 0 ? frames[frames.length - 1].ts : null,
      durationMs: null,
      status: terminalStatus ?? "unknown",
      error: terminalError,
      params: journey.manifest.params,
      frames
    };
  }
}
