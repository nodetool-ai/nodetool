/**
 * The local `ace-server` process the acestep provider runs (MUSIC-MODE.md
 * section 12.3).
 *
 * It follows `sdcpp-server.ts`: one child process on a free port on
 * `127.0.0.1`, a readiness wait on `GET /health`, the last 30 log lines kept
 * for error messages, and an exit after 10 idle minutes. Two things differ.
 * The process is not restarted to change models, because `ace-server` takes
 * the model per request. And the supervisor holds no lock around calls:
 * `ace-server` runs its jobs from its own FIFO queue, and the provider orders
 * its own requests (`acestep-provider.ts`).
 *
 * The child runs at a lowered priority, so the editor's decode worker keeps
 * its share of the CPU during a generation (PF-3).
 */
import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.acestep");

/** The model scan reads GGUF metadata only, so startup is short. */
const READY_TIMEOUT_MS = 2 * 60 * 1000;
export const ACESTEP_IDLE_SHUTDOWN_MS = 10 * 60 * 1000;
/** A positive niceness: lower priority than the NodeTool server. */
const CHILD_PRIORITY = 10;
const LOG_TAIL_LINES = 30;
/**
 * `--max-batch` bounds `lm_batch_size` (`ace-server.cpp:668-674`), and the
 * music request allows up to four candidates.
 */
const MAX_BATCH = 4;

export interface AceServerLaunch {
  binary: string;
  modelsDir: string;
  /** Pass `--keep-loaded`, which keeps every module resident (MR4). */
  keepLoaded?: boolean;
}

/** One started child. A new one is created after an exit. */
export interface AceServerInstance {
  readonly baseUrl: string;
  /** Counts starts, so a caller can tell a restarted process from its own. */
  readonly generation: number;
  readonly pid: number | undefined;
  alive(): boolean;
  /** Resolves true when the child exits within `ms`, false otherwise. */
  waitForExit(ms: number): Promise<boolean>;
}

export interface AceServerTimer {
  cancel(): void;
}

export interface AceServerSupervisorOptions {
  idleMs?: number;
  readyTimeoutMs?: number;
  /** Schedules the idle exit. Tests inject a clock here. */
  schedule?: (callback: () => void, ms: number) => AceServerTimer;
}

interface RunningServer extends AceServerInstance {
  key: string;
  child: import("node:child_process").ChildProcess;
  exited: Promise<void>;
}

const defaultSchedule = (callback: () => void, ms: number): AceServerTimer => {
  const timer = setTimeout(callback, ms);
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
};

const supervisors = new Set<AceServerSupervisor>();
let exitHookInstalled = false;

/** Kill every child when the server process exits, so none outlives it. */
function installExitHook(): void {
  if (exitHookInstalled || typeof process === "undefined") {
    return;
  }
  exitHookInstalled = true;
  process.once("exit", () => {
    for (const supervisor of supervisors) {
      supervisor.killNow();
    }
  });
}

export class AceServerSupervisor {
  private static created = 0;
  /** Tells supervisors apart, so each local server has its own job queue. */
  readonly id: number;
  private readonly idleMs: number;
  private readonly readyTimeoutMs: number;
  private readonly schedule: (callback: () => void, ms: number) => AceServerTimer;
  private running: RunningServer | null = null;
  private starting: Promise<RunningServer> | null = null;
  private idleTimer: AceServerTimer | null = null;
  private holds = 0;
  private generation = 0;
  private tail: string[] = [];

  constructor(options: AceServerSupervisorOptions = {}) {
    AceServerSupervisor.created += 1;
    this.id = AceServerSupervisor.created;
    this.idleMs = options.idleMs ?? ACESTEP_IDLE_SHUTDOWN_MS;
    this.readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
    this.schedule = options.schedule ?? defaultSchedule;
    supervisors.add(this);
  }

  /**
   * Mark a job as using the server. The idle exit waits until every hold is
   * released. Call {@link release} once for each hold.
   */
  hold(): void {
    this.holds += 1;
    this.idleTimer?.cancel();
    this.idleTimer = null;
  }

  release(): void {
    this.holds = Math.max(0, this.holds - 1);
    if (this.holds === 0) {
      this.idleTimer?.cancel();
      this.idleTimer = this.schedule(() => {
        this.idleTimer = null;
        if (this.holds === 0) {
          log.info("Stopping idle ace-server");
          void this.stop();
        }
      }, this.idleMs);
    }
  }

  /** A ready server for `launch`, started when none runs. */
  async ensure(launch: AceServerLaunch, signal?: AbortSignal): Promise<AceServerInstance> {
    const key = launchKey(launch);
    for (;;) {
      signal?.throwIfAborted();
      const current = this.running;
      if (current && current.alive()) {
        if (current.key === key) {
          return current;
        }
        await this.stop();
        continue;
      }
      if (!this.starting) {
        const start = this.start(launch, key, signal);
        this.starting = start;
        void start
          .catch(() => undefined)
          .finally(() => {
            if (this.starting === start) {
              this.starting = null;
            }
          });
      }
      const instance = await abortable(this.starting, signal);
      if (instance.key === key && instance.alive()) {
        return instance;
      }
    }
  }

  /** The last log lines of the most recent child, for error messages. */
  logTail(): string {
    return this.tail.join("\n");
  }

  /** The running child, or null. */
  current(): AceServerInstance | null {
    return this.running?.alive() ? this.running : null;
  }

  /** Stop the running server, if any. */
  async stop(): Promise<void> {
    const server = this.running;
    this.running = null;
    if (!server) {
      return;
    }
    if (server.alive()) {
      server.child.kill();
    }
    await server.exited;
  }

  /** Synchronous kill for the process exit hook. */
  killNow(): void {
    if (this.running?.alive()) {
      this.running.child.kill();
    }
  }

  private async start(launch: AceServerLaunch, key: string, signal?: AbortSignal): Promise<RunningServer> {
    const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
    const os = await importNodeBuiltin<typeof import("node:os")>("node:os");
    if (!childProcess) {
      throw new Error("ACE-Step needs Node.js to start ace-server");
    }
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    // ace-server.cpp:1646-1691 parses these flags. --host defaults to
    // 127.0.0.1 already (ace-server.cpp:1635); it is passed so the loopback
    // bind never depends on that default (BE-6).
    const args = [
      "--models",
      launch.modelsDir,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--max-batch",
      String(MAX_BATCH),
      ...(launch.keepLoaded ? ["--keep-loaded"] : [])
    ];
    log.info("Starting ace-server", { binary: launch.binary, args });
    const child = childProcess.spawn(launch.binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const tail: string[] = [];
    this.tail = tail;
    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) {
          tail.push(line);
          if (tail.length > LOG_TAIL_LINES) {
            tail.shift();
          }
        }
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    let spawnError: Error | null = null;
    child.once("error", (error) => {
      spawnError = error;
    });
    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.once("error", () => resolve());
    });
    const alive = (): boolean => !spawnError && child.exitCode === null && child.signalCode === null;
    if (child.pid !== undefined && os) {
      try {
        os.setPriority(child.pid, CHILD_PRIORITY);
      } catch (error) {
        log.warn("Could not lower the ace-server priority", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    installExitHook();

    this.generation += 1;
    const server: RunningServer = {
      key,
      baseUrl,
      generation: this.generation,
      pid: child.pid,
      child,
      exited,
      alive,
      waitForExit: (ms) =>
        Promise.race([
          exited.then(() => true),
          new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(!alive()), ms);
            timer.unref?.();
          })
        ])
    };
    this.running = server;
    const deadline = Date.now() + this.readyTimeoutMs;
    try {
      while (Date.now() < deadline) {
        signal?.throwIfAborted();
        if (!alive()) {
          const reason = spawnError
            ? (spawnError as Error).message
            : `exit code ${child.exitCode ?? child.signalCode}`;
          throw new Error(`ace-server stopped before it was ready (${reason}):\n${tail.join("\n")}`);
        }
        try {
          // ace-server.cpp:1801-1803 answers {"status":"ok"}.
          const response = await fetch(`${baseUrl}/health`, {
            redirect: "error",
            signal: AbortSignal.timeout(2000)
          });
          if (response.ok) {
            log.info("ace-server is ready", { baseUrl });
            return server;
          }
        } catch {
          // Not listening yet: the model scan is still running.
        }
        await sleep(200, signal);
      }
      throw new Error(
        `ace-server did not become ready in ${this.readyTimeoutMs / 1000} seconds:\n${tail.join("\n")}`
      );
    } catch (error) {
      if (this.running === server) {
        await this.stop();
      }
      throw error;
    }
  }
}

function launchKey(launch: AceServerLaunch): string {
  return JSON.stringify([launch.binary, launch.modelsDir, Boolean(launch.keepLoaded)]);
}

async function freePort(): Promise<number> {
  const net = await importNodeBuiltin<typeof import("node:net")>("node:net");
  if (!net) {
    throw new Error("ACE-Step needs Node.js to pick a port");
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
          reject(new Error("Could not pick a port for ace-server"));
        }
      });
    });
  });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** `promise`, rejected early with the abort reason when `signal` fires. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
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
