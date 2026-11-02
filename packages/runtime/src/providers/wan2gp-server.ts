/**
 * The Wan2GP server NodeTool runs from the Package Manager's install.
 *
 * With no `WAN2GP_MCP_URL` configured and Wan2GP installed, the `wangp`
 * provider and the `lib.wan2gp` nodes start `wgp.py --mcp` on a free loopback
 * port and share that one process. It stays up while calls use it and exits
 * after a quiet period, which frees the GPU memory Wan2GP holds. Without an
 * install the default address is used, for a server the user runs.
 */
import {
  createLogger,
  importNodeBuiltin,
  runtimeLocations,
  wan2gpInstallStatus,
  type Wan2GPInstallStatus
} from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";
import {
  WAN2GP_DEFAULT_SERVER_URL,
  Wan2GPClient,
  Wan2GPError,
  type Wan2GPClientOptions
} from "./wan2gp-client.js";

const log = createLogger("nodetool.runtime.providers.wan2gp-server");

/** Wan2GP imports PyTorch and scans its model registry before it listens. */
const READY_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_SHUTDOWN_MS = 15 * 60 * 1000;

export interface Wan2GPLaunch {
  python: string;
  sourceDir: string;
}

interface RunningServer {
  launch: Wan2GPLaunch;
  url: string;
  child: import("node:child_process").ChildProcess;
  exited: Promise<void>;
  ready: Promise<void>;
}

let running: RunningServer | null = null;
let starting: Promise<RunningServer> | null = null;
let active = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let exitHookInstalled = false;

/** The Wan2GP the Package Manager installed: the desktop app's, then the CLI's. */
export async function findInstalledWan2GP(): Promise<Wan2GPInstallStatus | null> {
  const env = typeof process === "undefined" ? {} : process.env;
  const dirs = new Set<string>();
  try {
    const own = runtimeLocations().wan2gp;
    if (own) dirs.add(own);
  } catch {
    // The host has no runtime locations, such as a Docker image.
  }
  if (env["NODETOOL_HOST"] === "desktop" || env["NODETOOL_HOST"] === "source") {
    try {
      const cli = runtimeLocations({ ...env, NODETOOL_HOST: "cli" }).wan2gp;
      if (cli) dirs.add(cli);
    } catch {
      // No CLI install location on this host.
    }
  }
  const platform = typeof process === "undefined" ? "linux" : process.platform;
  for (const dir of dirs) {
    const status = await wan2gpInstallStatus(dir, platform);
    if (status.installed) return status;
  }
  return null;
}

export interface Wan2GPConnection {
  /** The node's or the setting's URL. Empty uses the managed server, then the default. */
  serverUrl?: string;
  token?: string;
  maxTransferBytes?: number;
  signal?: AbortSignal;
}

/**
 * Connect to the Wan2GP server for this call and run `work` with the client.
 * A configured URL is used as is. Otherwise the installed Wan2GP is started,
 * or the default address is tried; a server that does not answer there means
 * Wan2GP is not installed, which the error says so the editor can offer it.
 */
export async function withWan2GPClient<T>(
  connection: Wan2GPConnection,
  work: (client: Wan2GPClient) => Promise<T>
): Promise<T> {
  const options: Wan2GPClientOptions = {
    signal: connection.signal,
    ...(connection.maxTransferBytes !== undefined && { maxTransferBytes: connection.maxTransferBytes }),
    ...(connection.token && { token: connection.token })
  };
  const explicit = connection.serverUrl?.trim();
  if (explicit) {
    return runWith(await Wan2GPClient.connect(explicit, options), work);
  }
  const install = await findInstalledWan2GP();
  if (!install?.python || !install.sourceDir) {
    let client: Wan2GPClient;
    try {
      client = await Wan2GPClient.connect(WAN2GP_DEFAULT_SERVER_URL, options);
    } catch (error) {
      if (error instanceof Wan2GPError && error.message.startsWith("Could not reach")) {
        throw missingRuntimePackageError("Wan2GP", "wan2gp", error);
      }
      throw error;
    }
    return runWith(client, work);
  }
  hold();
  try {
    const server = await ensureServer({ python: install.python, sourceDir: install.sourceDir }, connection.signal);
    return await runWith(await Wan2GPClient.connect(server.url, options), work);
  } finally {
    release();
  }
}

/**
 * Start the installed Wan2GP's server ahead of a generation, such as right
 * after a model download, so the generation does not wait for Wan2GP to
 * start. The server stops after the usual quiet period if nothing uses it.
 * Does nothing without an install or with a server already running.
 */
export async function warmWan2GPServer(): Promise<void> {
  const install = await findInstalledWan2GP();
  if (!install?.python || !install.sourceDir) return;
  hold();
  try {
    await ensureServer({ python: install.python, sourceDir: install.sourceDir });
  } catch (error) {
    // The generation starts the server again and reports why it failed.
    log.warn("Could not start the Wan2GP server ahead of a generation", { error: String(error) });
  } finally {
    release();
  }
}

async function runWith<T>(client: Wan2GPClient, work: (client: Wan2GPClient) => Promise<T>): Promise<T> {
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

function hold(): void {
  active += 1;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function release(): void {
  active -= 1;
  if (active === 0) {
    idleTimer = setTimeout(() => void stopWan2GPServer(), IDLE_SHUTDOWN_MS);
    idleTimer.unref?.();
  }
}

/** Stop the managed server, if one runs. */
export async function stopWan2GPServer(): Promise<void> {
  const server = running;
  running = null;
  if (!server) return;
  server.child.kill();
  await server.exited;
}

async function ensureServer(launch: Wan2GPLaunch, signal?: AbortSignal): Promise<RunningServer> {
  if (
    running &&
    running.child.exitCode === null &&
    running.launch.python === launch.python &&
    running.launch.sourceDir === launch.sourceDir
  ) {
    await abortable(running.ready, signal);
    return running;
  }
  if (!starting) {
    starting = startServer(launch).finally(() => {
      starting = null;
    });
  }
  const server = await abortable(starting, signal);
  await abortable(server.ready, signal);
  return server;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function startServer(launch: Wan2GPLaunch): Promise<RunningServer> {
  await stopWan2GPServer();
  const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
  if (!childProcess) throw new Error("Wan2GP needs Node.js to start its server");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/mcp`;
  const args = [
    "wgp.py",
    "--mcp",
    "--mcp-async",
    "--mcp-transport",
    "streamable-http",
    "--mcp-host",
    "127.0.0.1",
    "--mcp-port",
    String(port)
  ];
  log.info("Starting the Wan2GP server", { python: launch.python, cwd: launch.sourceDir, port });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"]) delete env[key];
  env.PYTHONUNBUFFERED = "1";
  const child = childProcess.spawn(launch.python, args, {
    cwd: launch.sourceDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const tail: string[] = [];
  const collect = (chunk: Buffer): void => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      tail.push(line);
      if (tail.length > 30) tail.shift();
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

  const ready = (async (): Promise<void> => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) {
        const reason = spawnError ? (spawnError as Error).message : `exit code ${child.exitCode ?? child.signalCode}`;
        throw new Wan2GPError(`The Wan2GP server stopped before it was ready (${reason}):\n${tail.join("\n")}`);
      }
      try {
        // A GET that accepts only JSON gets 406 at once from a listening MCP
        // server. Accepting an event stream would open one that never ends.
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(2000)
        });
        await response.body?.cancel();
        log.info("The Wan2GP server is ready", { url });
        return;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Wan2GPError(
      `The Wan2GP server was not ready after ${READY_TIMEOUT_MS / 60000} minutes:\n${tail.join("\n")}`
    );
  })();
  const server: RunningServer = { launch, url, child, exited, ready };
  running = server;
  ready.catch(() => {
    if (running === server) {
      running = null;
      child.kill();
    }
  });
  return server;
}

async function freePort(): Promise<number> {
  const net = await importNodeBuiltin<typeof import("node:net")>("node:net");
  if (!net) throw new Error("Wan2GP needs Node.js to pick a port");
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not pick a port for the Wan2GP server"));
      });
    });
  });
}

/** Kill the child when NodeTool exits, so no Wan2GP server outlives it. */
function installExitHook(): void {
  if (exitHookInstalled || typeof process === "undefined") return;
  exitHookInstalled = true;
  process.once("exit", () => {
    running?.child.kill();
  });
}
