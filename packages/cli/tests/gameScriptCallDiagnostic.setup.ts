import { afterAll, afterEach, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PerformanceObserver, performance as nativePerformance } from "node:perf_hooks";
import { threadId } from "node:worker_threads";
interface CallObserver {
  readonly identity: string;
  start(): void;
  stop(): void;
  snapshot(): unknown;
}
function currentObserver(): CallObserver | undefined {
  const value: unknown = Reflect.get(globalThis, Symbol.for("nodetool.temporary.ci-call-budget-observer.v3"));
  if (value === null || typeof value !== "object" || !("identity" in value) || typeof value.identity !== "string"
    || !("start" in value) || typeof value.start !== "function" || !("stop" in value) || typeof value.stop !== "function"
    || !("snapshot" in value) || typeof value.snapshot !== "function") { return undefined; }
  // The temporary runtime module owns this versioned bridge. Check its callable shape before crossing the test boundary.
  return value as unknown as CallObserver;
}

const targets = new Map([
  ["game-command-golden.test.ts", "captures bench-2d-500 at the fixed tick within the stored pixel tolerance"],
  ["game-command3d.test.ts", "validates and simulates public force-script edits for 120 ticks with exact replay"]
]);
const artifactRoot = process.env.NODETOOL_GAME_GOLDEN_ARTIFACTS;
const capacity = 8192;
const fields = ["startTime", "duration", "kind", "flags", "deliveredAt"];
interface ActiveDiagnostic {
  readonly file: string;
  readonly test: string;
  readonly directory: string;
  readonly startedAt: number;
  readonly memoryBefore: NodeJS.MemoryUsage;
  readonly gc: Float64Array;
  readonly calls: CallObserver | undefined;
  readonly errors: string[];
  observer?: PerformanceObserver;
  count: number;
  overflow: number;
  malformed: number;
  turns: number;
}
let active: ActiveDiagnostic | undefined;

function writeRaw(diagnostic: ActiveDiagnostic, phase: string, testState?: string, testErrors?: unknown): void {
  try {
    const data = {
      phase, file: diagnostic.file, test: diagnostic.test, testState, testErrors,
      pid: process.pid, threadId, project: "real-packages", node: process.version, versions: process.versions,
      execArgv: process.execArgv, observerIdentity: diagnostic.calls?.identity,
      startedAt: diagnostic.startedAt, recordedAt: performance.now(),
      clock: { sameObject: performance === nativePerformance, globalOrigin: performance.timeOrigin,
        nativeOrigin: nativePerformance.timeOrigin, globalNow: performance.now(), nativeNow: nativePerformance.now(),
        threadCpuUsagePresent: typeof process.threadCpuUsage === "function" },
      trace: diagnostic.calls?.snapshot(),
      gc: { supported: PerformanceObserver.supportedEntryTypes.includes("gc"), fields,
        count: diagnostic.count, overflow: diagnostic.overflow, malformed: diagnostic.malformed,
        terminalTurns: diagnostic.turns, capacity,
        records: Array.from({ length: diagnostic.count }, (_, index) => Array.from(diagnostic.gc.subarray(index * fields.length, (index + 1) * fields.length))) },
      memoryBefore: diagnostic.memoryBefore, memoryAfter: process.memoryUsage(), diagnosticErrors: diagnostic.errors,
      qualification: "Temporary diagnostic instrumentation. Extra scalar writes and thread-CPU reads are inside charged calls and are not subtracted. Original tests and budgets are unchanged. CPU/fallback and incomplete data are observations. Thread-CPU readings may be coarsely quantized. GC overlap alone does not prove causation. After-drain GC may include diagnostic serialization, so interpret event timestamps against raw call/test bounds. Hard termination may prevent artifact flush."
    };
    mkdirSync(diagnostic.directory, { recursive: true });
    writeFileSync(join(diagnostic.directory, `${phase}.json`), `${JSON.stringify(data)}\n`);
  } catch (error) {
    diagnostic.errors.push(String(error));
    process.stderr.write(`Game call diagnostic could not write ${phase}: ${String(error)}\n`);
  }
}

beforeEach((test) => {
  const file = basename(test.task.file.filepath);
  if (!artifactRoot || targets.get(file) !== test.task.name) { return; }
  const diagnostic: ActiveDiagnostic = {
    file, test: test.task.name, directory: join(artifactRoot, "script-call-diagnostics", `${file}-${process.pid}-${threadId}`),
    startedAt: performance.now(), memoryBefore: process.memoryUsage(), gc: new Float64Array(capacity * fields.length),
    calls: currentObserver(), errors: [], count: 0, overflow: 0, malformed: 0, turns: 0
  };
  active = diagnostic;
  diagnostic.calls?.start();
  if (!diagnostic.calls) { diagnostic.errors.push("Temporary runtime observer bridge is missing"); }
  if (PerformanceObserver.supportedEntryTypes.includes("gc")) {
    try {
      diagnostic.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const detail = "detail" in entry ? entry.detail : undefined;
          const kind = detail !== null && typeof detail === "object" && "kind" in detail ? detail.kind : Number.NaN;
          const flags = detail !== null && typeof detail === "object" && "flags" in detail ? detail.flags : Number.NaN;
          if (!Number.isFinite(entry.startTime) || !Number.isFinite(entry.duration) || typeof kind !== "number" || typeof flags !== "number"
            || !Number.isFinite(kind) || !Number.isFinite(flags)) {
            diagnostic.malformed += 1; continue;
          }
          if (diagnostic.count === capacity) { diagnostic.overflow += 1; continue; }
          diagnostic.gc.set([entry.startTime, entry.duration, kind, flags, performance.now()], diagnostic.count++ * fields.length);
        }
      });
      diagnostic.observer.observe({ entryTypes: ["gc"] });
    } catch (error) { diagnostic.errors.push(String(error)); }
  }
});

afterEach(async (test) => {
  const diagnostic = active;
  if (!diagnostic) { return; }
  // Preserve the raw call prefix before draining pending GC notifications.
  writeRaw(diagnostic, "after-test", test.task.result?.state, test.task.result?.errors);
  try {
    for (let turn = 0; turn < 2; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      diagnostic.turns += 1;
    }
    writeRaw(diagnostic, "after-drain", test.task.result?.state, test.task.result?.errors);
  } finally {
    diagnostic.observer?.disconnect();
    diagnostic.calls?.stop();
    active = undefined;
  }
});

afterAll(() => {
  if (!active) { return; }
  writeRaw(active, "after-all-incomplete");
  active.observer?.disconnect();
  active.calls?.stop();
  active = undefined;
});
