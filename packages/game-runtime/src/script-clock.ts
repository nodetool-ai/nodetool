/** A millisecond reading from an arbitrary origin. Only differences between readings are meaningful. */
export interface ScriptCallClock {
  readonly kind: "thread-cpu" | "wall";
  now(): number;
}

type ThreadCpuUsage = () => { readonly user: number; readonly system: number };

export const wallScriptCallClock: ScriptCallClock = { kind: "wall", now: () => performance.now() };

/**
 * The calling thread's CPU time on hosts with sufficiently current accounting.
 * Linux getrusage can advance in scheduler-tick-sized steps, so it cannot enforce
 * the supported 1 ms limit or reliably separate adjacent calls. Linux uses wall time.
 */
export function threadCpuScriptCallClock(): ScriptCallClock | undefined {
  const host = (globalThis as { process?: { platform?: string; threadCpuUsage?: ThreadCpuUsage } }).process;
  if (host?.platform === "linux") { return undefined; }
  const usage = host?.threadCpuUsage;
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
 * wall check skips the clock read for most calls. The CPU source must include current work, since
 * a stale cumulative reading can charge a previous call's work to this one.
 */
export function startScriptCallTimer(clock: ScriptCallClock, limitMs: number): () => boolean {
  const wallStarted = performance.now();
  const started = clock.now();
  return () => performance.now() - wallStarted >= limitMs && clock.now() - started >= limitMs;
}
