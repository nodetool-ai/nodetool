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
 * helper threads get no CPU, so pauses it records during the call are not charged to the script.
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
