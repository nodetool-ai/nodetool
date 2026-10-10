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
 * Starts the per-call limit. A thread's CPU time cannot exceed the wall time that passed, so the
 * wall check skips the clock read for most calls. It also stops coarse CPU accounting from ending a
 * call before `limitMs` of wall time has passed.
 */
export function startScriptCallTimer(clock: ScriptCallClock, limitMs: number): () => boolean {
  const wallStarted = performance.now();
  const started = clock.now();
  return () => performance.now() - wallStarted >= limitMs && clock.now() - started >= limitMs;
}
