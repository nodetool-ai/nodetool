/**
 * Test helpers around pause points
 * (docs/plans/native-cloud-sync/technical-design.md, "Harnesses", WP2.6).
 *
 * - {@link PauseGate} holds callers that reach named steps in this process
 *   and releases them in an order the test chooses, for races inside one
 *   process.
 * - {@link repeatUnordered} runs the same concurrent tasks many times with
 *   their start order shuffled, for races whose order the test cannot pin.
 * - {@link startPausableProcess} starts a child process that pauses at a
 *   named step, waits until it reports the step, and kills it, for crash
 *   tests and races between processes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setPauseHandler, PAUSED_MARKER } from "../pause-points.js";

interface Arrival {
  name: string;
  release: () => void;
}

/**
 * Holds every caller that reaches one of `names` until the test releases it.
 * Steps not named pass through. Install it before the code under test runs
 * and uninstall it in `afterEach`.
 */
export class PauseGate {
  private readonly held: Arrival[] = [];
  private readonly waiters: Array<() => void> = [];
  private readonly counts = new Map<string, number>();

  constructor(private readonly names: readonly string[]) {}

  install(): this {
    setPauseHandler((name) => this.arrive(name));
    return this;
  }

  uninstall(): void {
    setPauseHandler(null);
    for (const arrival of this.held.splice(0)) arrival.release();
  }

  private arrive(name: string): Promise<void> | void {
    if (!this.names.includes(name)) return;
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
    const done = new Promise<void>((resolve) => {
      this.held.push({ name, release: resolve });
    });
    for (const wake of this.waiters.splice(0)) wake();
    return done;
  }

  /** How many callers have reached `name` so far, held or released. */
  reached(name: string): number {
    return this.counts.get(name) ?? 0;
  }

  /** Resolves once `count` callers have reached `name`. */
  async waitFor(name: string, count = 1): Promise<void> {
    while (this.reached(name) < count) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  /**
   * Releases a caller held at `name`: by default the one that arrived first,
   * or the one at `position` in arrival order among those still held. Throws
   * when there is none, so a test cannot release a step that was never
   * reached.
   */
  release(name: string, position = 0): void {
    const atStep = this.held.filter((arrival) => arrival.name === name);
    const arrival = atStep[position];
    if (!arrival) throw new Error(`No caller is held at "${name}" in position ${position}`);
    this.held.splice(this.held.indexOf(arrival), 1);
    arrival.release();
  }
}

/**
 * Runs `tasks` concurrently `runs` times, each time starting them in a
 * shuffled order with a yield between starts. `check` runs after each round
 * with the round's results. Each task's outcome is settled as it starts, so
 * a task that fails before the later ones start is never an unhandled
 * rejection.
 */
export async function repeatUnordered<T>(
  runs: number,
  tasks: ReadonlyArray<() => Promise<T>>,
  check: (results: PromiseSettledResult<T>[], round: number) => Promise<void> | void,
  random: () => number = Math.random
): Promise<void> {
  for (let round = 0; round < runs; round++) {
    const order = tasks
      .map((task, index) => ({ task, index, key: random() }))
      .sort((a, b) => a.key - b.key);
    const started: Array<{ index: number; result: Promise<PromiseSettledResult<T>> }> = [];
    for (const { task, index } of order) {
      started.push({ index, result: settle(task) });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    started.sort((a, b) => a.index - b.index);
    await check(await Promise.all(started.map((entry) => entry.result)), round);
  }
}

/** Starts `task` and settles its outcome at once, a synchronous throw included. */
function settle<T>(task: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  let running: Promise<T>;
  try {
    running = task();
  } catch (error) {
    running = Promise.reject(error);
  }
  return running.then(
    (value): PromiseSettledResult<T> => ({ status: "fulfilled", value }),
    (reason: unknown): PromiseSettledResult<T> => ({ status: "rejected", reason })
  );
}

export interface PausableProcess {
  readonly child: ChildProcess;
  /** Resolves with the step name when the process reports a pause. */
  readonly paused: Promise<string>;
  /** Resolves when the process has exited, however it ended. */
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Everything the process wrote to stdout and stderr so far. */
  output(): string;
  /** Ends the process with SIGKILL and waits for it to exit. */
  kill(): Promise<void>;
}

export interface PausableProcessOptions {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** The step to pause at, passed as `NODETOOL_PAUSE_AT`. */
  pauseAt?: string;
  /** How long to wait for the pause before failing. Default 30 s. */
  pauseTimeoutMs?: number;
}

/**
 * Starts a child process that pauses at `pauseAt`. `paused` rejects when the
 * process exits or the timeout passes before it reports the step.
 */
export function startPausableProcess(options: PausableProcessOptions): PausableProcess {
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  delete env["NODETOOL_PAUSE_AT"];
  if (options.pauseAt) env["NODETOOL_PAUSE_AT"] = options.pauseAt;
  if (env["NODE_ENV"] === "production") env["NODE_ENV"] = "test";
  const child = spawn(options.command, [...(options.args ?? [])], {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let text = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const paused = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`No pause within ${options.pauseTimeoutMs ?? 30_000} ms. Output:\n${text}`));
    }, options.pauseTimeoutMs ?? 30_000);
    child.stderr?.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
      const match = new RegExp(`^${PAUSED_MARKER} (.+)$`, "m").exec(text);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    void exited.then(({ code, signal }) => {
      clearTimeout(timeout);
      reject(new Error(`The process exited (code ${code}, signal ${signal}) before a pause. Output:\n${text}`));
    });
  });
  // A test that only awaits `exited` must not see an unhandled rejection.
  paused.catch(() => {});
  return {
    child,
    paused,
    exited,
    output: () => text,
    async kill() {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    }
  };
}
