/**
 * The one `sd-server` process the stable-diffusion.cpp provider runs.
 *
 * `sd-server` loads one model at start and keeps it in memory. The provider
 * asks for a model per generation: the same model reuses the running server,
 * another model restarts it. Generations run one at a time, so a restart
 * never cuts off a job in flight. An idle server exits after a while to free
 * the model's memory.
 */
import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.sdcpp");

/** A first load of a large model from a cold disk can take minutes. */
const READY_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000;

export interface SdServerLaunch {
  binary: string;
  /** Model flags and paths, e.g. `["--model", "/path/x.gguf"]`. */
  args: string[];
}

interface RunningServer {
  key: string;
  baseUrl: string;
  child: import("node:child_process").ChildProcess;
  exited: Promise<void>;
}

let running: RunningServer | null = null;
let queue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let exitHookInstalled = false;

/**
 * Run `work` against a server that has `launch` loaded. Calls are serialized,
 * so one generation finishes before another can swap the model.
 */
export function withSdServer<T>(
  launch: SdServerLaunch,
  signal: AbortSignal | undefined,
  work: (baseUrl: string) => Promise<T>
): Promise<T> {
  const next = queue.then(async () => {
    signal?.throwIfAborted();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    try {
      const server = await ensureServer(launch, signal);
      return await work(server.baseUrl);
    } finally {
      idleTimer = setTimeout(() => void stopSdServer(), IDLE_SHUTDOWN_MS);
      idleTimer.unref?.();
    }
  });
  queue = next.catch(() => undefined);
  return next;
}

/** Stop the running server, if any. */
export async function stopSdServer(): Promise<void> {
  const server = running;
  running = null;
  if (!server) {
    return;
  }
  server.child.kill();
  await server.exited;
}

async function ensureServer(launch: SdServerLaunch, signal?: AbortSignal): Promise<RunningServer> {
  const key = JSON.stringify([launch.binary, ...launch.args]);
  if (running?.key === key && running.child.exitCode === null) {
    return running;
  }
  await stopSdServer();

  const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
  if (!childProcess) {
    throw new Error("stable-diffusion.cpp needs Node.js to start sd-server");
  }
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const args = [...launch.args, "--listen-ip", "127.0.0.1", "--listen-port", String(port)];
  log.info("Starting sd-server", { binary: launch.binary, args });
  const child = childProcess.spawn(launch.binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const tail: string[] = [];
  const collect = (chunk: Buffer): void => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (line.trim()) {
        tail.push(line);
        if (tail.length > 30) {
          tail.shift();
        }
      }
    }
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", () => resolve());
  });
  let spawnError: Error | null = null;
  child.once("error", (error) => {
    spawnError = error;
  });
  installExitHook();

  const server: RunningServer = { key, baseUrl, child, exited };
  running = server;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (spawnError || child.exitCode !== null || child.signalCode !== null) {
      running = null;
      const reason = spawnError ? (spawnError as Error).message : `exit code ${child.exitCode ?? child.signalCode}`;
      throw new Error(`sd-server stopped before it was ready (${reason}):\n${tail.join("\n")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/sdcpp/v1/capabilities`, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        log.info("sd-server is ready", { baseUrl });
        return server;
      }
    } catch {
      // Not listening yet: the model is still loading.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stopSdServer();
  throw new Error(`sd-server did not become ready in ${READY_TIMEOUT_MS / 60000} minutes:\n${tail.join("\n")}`);
}

async function freePort(): Promise<number> {
  const net = await importNodeBuiltin<typeof import("node:net")>("node:net");
  if (!net) {
    throw new Error("stable-diffusion.cpp needs Node.js to pick a port");
  }
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not pick a port for sd-server"));
        }
      });
    });
  });
}

/** Kill the child when the server process exits, so no sd-server outlives it. */
function installExitHook(): void {
  if (exitHookInstalled || typeof process === "undefined") {
    return;
  }
  exitHookInstalled = true;
  process.once("exit", () => {
    running?.child.kill();
  });
}
