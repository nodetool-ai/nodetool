/** A millisecond reading from an arbitrary origin. Only differences between readings are meaningful. */
export interface ScriptCallClock {
  readonly kind: "thread-cpu" | "wall";
  now(): number;
}

type ThreadCpuUsage = () => { readonly user: number; readonly system: number };

export const wallScriptCallClock: ScriptCallClock = { kind: "wall", now: () => performance.now() };

/**
 * The CPU time of the calling thread, so time spent waiting for a processor does not count.
 * Node reports it through `process.threadCpuUsage`, in microseconds. Browsers have no thread CPU clock.
 */
export function threadCpuScriptCallClock(): ScriptCallClock | undefined {
  const usage = (globalThis as { process?: { threadCpuUsage?: ThreadCpuUsage } }).process?.threadCpuUsage;
  if (typeof usage !== "function") { return undefined; }
  const now = (): number => { const { user, system } = usage(); return (user + system) / 1000; };
  try { now(); } catch {
    // A host that declares the function but cannot read the thread's usage keeps the wall clock.
    return undefined;
  }
  return { kind: "thread-cpu", now };
}

export const defaultScriptCallClock: ScriptCallClock = threadCpuScriptCallClock() ?? wallScriptCallClock;

/**
 * Multiplies the per-call and per-batch script time limits. Tests on shared CI runners set
 * `NODETOOL_GAME_SCRIPT_BUDGET_SCALE`, because a contended runner can stretch a call that takes a few
 * milliseconds past its 20 ms limit. Unset or empty means 1. Players and replays never set it.
 */
export function scriptBudgetScale(): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["NODETOOL_GAME_SCRIPT_BUDGET_SCALE"];
  if (raw === undefined || raw === "") { return 1; }
  const scale = Number(raw);
  if (!Number.isFinite(scale) || scale < 1) {
    throw new Error(`NODETOOL_GAME_SCRIPT_BUDGET_SCALE must be a number of at least 1, got "${raw}"`);
  }
  return scale;
}

interface GcProfiler {
  start(): void;
  stop(): { readonly statistics: readonly { readonly cost: number }[] } | undefined;
}

type BuiltinModuleLoader = (id: string) => { GCProfiler?: new () => GcProfiler } | undefined;

/** V8's GC profiler on Node. Browsers have none, so their call limit keeps counting collector pauses. */
const gcProfiler: GcProfiler | undefined = (() => {
  const load = (globalThis as { process?: { getBuiltinModule?: BuiltinModuleLoader } }).process?.getBuiltinModule;
  const Profiler = typeof load === "function" ? load("node:v8")?.GCProfiler : undefined;
  return Profiler === undefined ? undefined : new Profiler();
})();

/** Milliseconds of collector pauses since the profiler last started, then restarts it. */
function collectedMs(profiler: GcProfiler): number {
  const statistics = profiler.stop()?.statistics ?? [];
  profiler.start();
  let micros = 0;
  for (const entry of statistics) { micros += entry.cost; }
  return micros / 1000;
}

/**
 * Starts the per-call limit. A thread's CPU time cannot exceed the wall time that passed, so the
 * wall check skips the clock read for most calls. It also stops coarse CPU accounting from ending a
 * call before `limitMs` of wall time has passed. V8 runs its collector on the calling thread when its
 * helper threads get no CPU, so pauses it records during the call are not charged to the script. A
 * pause can include time the thread waited for a processor, so a call may run past `limitMs` by that
 * much. The wall-clock batch budget still bounds it.
 */
export function startScriptCallTimer(clock: ScriptCallClock, limitMs: number): () => boolean {
  if (gcProfiler !== undefined) { collectedMs(gcProfiler); }
  let gcMs = 0;
  const wallStarted = performance.now();
  const started = clock.now();
  return () => {
    if (performance.now() - wallStarted - gcMs < limitMs || clock.now() - started - gcMs < limitMs) { return false; }
    if (gcProfiler === undefined) { return true; }
    gcMs += collectedMs(gcProfiler);
    return performance.now() - wallStarted - gcMs >= limitMs && clock.now() - started - gcMs >= limitMs;
  };
}
