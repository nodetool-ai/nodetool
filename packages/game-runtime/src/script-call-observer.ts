/** Temporary CI diagnostic branch only. Not a production fix. */
const capacity = 2000;
export const boundaries = ["begin", "shell-complete", "call-started", "source-complete", "world-complete",
  "input-complete", "guest-complete", "validation-complete", "teardown-begin", "teardown-complete",
  "final-check-begin", "final-check-complete", "end", "first-failure"] as const;
export const sourceKeys = [...Array.from({ length: 32 }, (_, index) => JSON.stringify(["bench", `sprite-${index}`, 0])), JSON.stringify(["scene", "level", "crate", 0])];
export const sources = ["input => ({ state: (input.state || 0) + 1, commands: [] })", "input => ({ state: input.state, commands: input.tick === 0 ? [{ kind: 'addForce', force: { x: 120, y: 0, z: 0 } }, { kind: 'addTorque', torque: { x: 0, y: 60, z: 0 } }, { kind: 'addForceAtPoint', force: { x: 0, y: 0, z: 120 }, point: { x: 20, y: 11, z: 20 } }] : [] })"];
const header = 20;
const stride = header + boundaries.length * 2;
const observerIdentity = JSON.stringify({ version: 3, sourceKeys, sources, boundaries, header, stride });
const usage = typeof process === "undefined" ? undefined : process.threadCpuUsage;

export function createCallObserver(maximum = capacity) {
  let enabled = false;
  const values = new Float64Array(maximum * stride);
  values.fill(Number.NaN);
  const keys: string[] = new Array(maximum);
  const errors: unknown[] = new Array(maximum);
  const outerErrors: unknown[] = new Array(maximum);
  const variants = new Uint32Array(sources.length);
  let count = 0;
  let active = -1;
  let overflow = 0;
  let nested = 0;
  let cpuFailures = 0;
  const cpu = (): number => {
    if (typeof usage !== "function") { return Number.NaN; }
    try { const value = usage(); return (value.user + value.system) / 1000; }
    catch { cpuFailures++; return Number.NaN; }
  };
  const mark = (boundary: number): void => {
    if (active < 0) { return; }
    const offset = active * stride;
    values[offset + 5] = boundary;
    values[offset + header + boundary * 2] = performance.now();
    values[offset + header + boundary * 2 + 1] = cpu();
  };
  const failure = (error: unknown): void => {
    if (active < 0) { return; }
    const offset = active * stride;
    outerErrors[active] = error;
    if (values[offset + 6] === 1) { return; }
    values[offset + 6] = 1;
    values[offset + 7] = values[offset + 5];
    values[offset + 16] = values[offset + 14];
    errors[active] = error;
    mark(13);
  };
  return {
    identity: observerIdentity,
    start(): void {
      count = 0; active = -1; overflow = 0; nested = 0; cpuFailures = 0;
      variants.fill(0); values.fill(Number.NaN); errors.fill(undefined); outerErrors.fill(undefined);
      enabled = true;
    },
    stop(): void { enabled = false; },
    begin(key: string, source: string, tick: number, limit: number, kind: string): number {
      if (!enabled) { return -1; }
      const keyIndex = sourceKeys.indexOf(key);
      if (keyIndex < 0) { return -1; }
      const variant = keyIndex === 32 ? 1 : 0;
      if (source !== sources[variant]) { return -1; }
      if (active >= 0) { nested++; return -1; }
      if (count >= maximum) { overflow++; return -1; }
      active = count++;
      keys[active] = key;
      const offset = active * stride;
      values[offset] = active + 1;
      values[offset + 1] = tick;
      values[offset + 2] = variant;
      values[offset + 3] = kind === "thread-cpu" ? 1 : 0;
      values[offset + 4] = limit;
      values[offset + 6] = 0;
      values[offset + 8] = 0;
      values[offset + 14] = -1;
      values[offset + 17] = ++variants[variant];
      mark(0);
      return active;
    },
    mark,
    realm(persistent: boolean, retained: boolean): void {
      if (active >= 0) { values[active * stride + 12] = Number(persistent); values[active * stride + 13] = Number(retained); }
    },
    started(wall: number, selected: number): void {
      if (active >= 0) { values[active * stride + 18] = wall; values[active * stride + 19] = selected; }
    },
    site(site: number): void { if (active >= 0) { values[active * stride + 14] = site; } },
    batch(expired: boolean): boolean {
      if (active >= 0 && expired && values[active * stride + 8] === 0) {
        values[active * stride + 8] = 2;
        values[active * stride + 15] = values[active * stride + 14];
      }
      return expired;
    },
    timer(wallElapsed: number, clockElapsed: number, expired: boolean): void {
      if (active < 0 || !expired) { return; }
      const offset = active * stride;
      if (values[offset + 8] === 0) {
        values[offset + 8] = 1;
        values[offset + 9] = wallElapsed;
        values[offset + 10] = clockElapsed;
        values[offset + 11] = values[offset + 5];
        values[offset + 15] = values[offset + 14];
      }
    },
    failure,
    teardown(): void {
      if (active >= 0 && Number.isNaN(values[active * stride + header + 8 * 2])) { mark(8); }
    },
    end(record: number): void {
      if (record < 0) { return; }
      if (active !== record) { nested++; return; }
      mark(12);
      active = -1;
    },
    snapshot() {
      const describe = (value: unknown) => value instanceof Error ? {name:value.name,message:value.message,stack:value.stack} : value;
      return { enabled, capacity: maximum, count, overflow, nested, cpuFailures, active,
        threadCpuUsagePresent: typeof usage === "function", boundaries, header, stride,
        records: Array.from({length:count}, (_, index) => ({
          sourceKey: keys[index],
          numeric: Array.from(values.subarray(index * stride, (index + 1) * stride), (value) => Number.isNaN(value) ? null : value),
          firstError: describe(errors[index]), outerError: describe(outerErrors[index])
        })) };
    }
  };
}

// Diagnostic-only loader bridge. Both compiled CLI runtime and setup must observe this exact instance.
const sharedKey = Symbol.for("nodetool.temporary.ci-call-budget-observer.v3");
// The temporary source and compiled modules share one private, versioned observer instance.
const scope = globalThis as unknown as typeof globalThis & Record<symbol, ReturnType<typeof createCallObserver> | undefined>;
const existing = scope[sharedKey];
if (existing && existing.identity !== observerIdentity) { throw new Error("Diagnostic observer schema/filter mismatch between source and dist"); }
export const callObserver = existing ?? (scope[sharedKey] = createCallObserver());
