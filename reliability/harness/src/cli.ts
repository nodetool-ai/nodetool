/**
 * `nodetool reliability` orchestration (§12's package-diagram `cli.ts`).
 * `packages/cli/src/commands/reliability.ts` is a thin Commander wrapper over
 * this module — same split as the debug harness (`packages/cli/src/debug/`
 * does the work, `commands/debug.ts` just parses flags and prints).
 */
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJourney, type Journey, type JourneyFault } from "./core/journey.js";
import { streamShapeOf, terminalOutputsOf } from "./core/golden.js";
import { compareJourney, formatCompareReport, type CompareDriver, type CompareReport } from "./compare.js";
import { KernelDriver } from "./drivers/kernel.js";
import { WsServerDriver } from "./drivers/ws-server.js";
import { CliDriver } from "./drivers/cli.js";
import { BrowserDriver } from "./drivers/browser.js";
import { AppHeadlessDriver } from "./drivers/app-headless.js";
import { PackagedDriver } from "./drivers/packaged.js";
import { listFaultModuleNames } from "./faults/registry.js";
// Side-effecting import: registers every built-in fault module, same
// contract as `compare.ts`'s own import — needed here too since
// `listFaultModuleNames()`/name validation below run before `compareJourney`
// would otherwise trigger it.
import "./faults/index.js";

/** Every surface `nodetool reliability run --surface` accepts, keyed to a
 * fresh driver instance — fresh per call so two `runJourney` calls (e.g. the
 * CLI's own `--json` and human-readable paths, or a test loop) never share
 * driver-local state. */
export const DRIVER_FACTORIES: Readonly<Record<string, () => CompareDriver>> = {
  kernel: () => new KernelDriver(),
  "ws-server": () => new WsServerDriver(),
  cli: () => new CliDriver(),
  browser: () => new BrowserDriver(),
  "app-headless": () => new AppHeadlessDriver(),
  packaged: () => new PackagedDriver()
};

/**
 * §9's fault seams, named — the full target vocabulary across D1 (provider,
 * shipped)/D2 (ws)/D3 (bridge, host, client). `--faults` validates a
 * requested name against this list (a typo is a CLI error, not a silent
 * no-op); whether the name actually does anything at runtime depends on
 * whether a `FaultModule` is registered for it (`faults/registry.ts`) — see
 * `runJourney`'s `unknownFaults` handling for names in this list a module
 * hasn't shipped for yet.
 */
export const KNOWN_FAULT_TYPES: readonly string[] = [
  "provider-429",
  "provider-500",
  "provider-timeout",
  "provider-truncated-stream",
  "provider-malformed-sse",
  "provider-slow-drip",
  "provider-cost-omission",
  "ws-drop-no-fin",
  "ws-delay",
  "ws-reorder",
  "ws-fragment",
  "ws-stall-reads",
  "ws-abrupt-close",
  "bridge-exit-mid-request",
  "bridge-framing-violation",
  "bridge-never-ready",
  "bridge-epipe",
  "bridge-version-mismatch",
  "host-sigkill-restart",
  "host-disk-full",
  "host-db-locked",
  "client-cancel-storm",
  "client-reconnect-storm",
  "client-duplicate-command",
  "client-out-of-order-end-stream"
];

export class ReliabilityCliError extends Error {}

/** Walks up from this module to the checkout's `reliability/journeys` — works
 * from both `src/` (tsx dev) and `dist/` (built) locations. */
export function findJourneysDir(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "reliability", "journeys");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ReliabilityCliError(
    `could not locate reliability/journeys above ${start} — pass journeysDir explicitly`
  );
}

interface JourneySummary {
  name: string;
  description?: string;
  surfaces: string[];
  invariants: string[];
  timeoutMs: number;
}

/** Every journey directory under `journeysDir` (default: the repo's
 * `reliability/journeys`), loaded and summarized for `nodetool reliability
 * list`. */
export async function listJourneys(journeysDir: string = findJourneysDir()): Promise<JourneySummary[]> {
  const entries = await readdir(journeysDir, { withFileTypes: true });
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const summaries: JourneySummary[] = [];
  for (const name of names) {
    const dir = join(journeysDir, name);
    if (!existsSync(join(dir, "journey.json"))) continue;
    const journey = await loadJourney(dir);
    summaries.push({
      name: journey.manifest.name,
      description: journey.manifest.description,
      surfaces: journey.manifest.surfaces,
      invariants: journey.manifest.assertions.invariants,
      timeoutMs: journey.manifest.timeoutMs
    });
  }
  return summaries;
}

interface RunJourneyOptions {
  journeysDir?: string;
  /** Overrides the journey manifest's own `surfaces` list. The oracle
   * (`kernel`) is always included even if omitted — `compareJourney` needs it
   * present to diff against. */
  surfaces?: string[];
  /**
   * Fault names to inject (§9), replacing the journey's own declared `faults`
   * block for this run — validated against `KNOWN_FAULT_TYPES`, then resolved
   * to `FaultModule`s by `compareJourney` (task D1). A name the journey
   * already declares (with a `surface` restriction or `params`) is reused
   * as-is; a name given here that the journey doesn't declare runs
   * unrestricted (every surface) with no params.
   */
  faults?: string[];
}

/** Resolves `--faults` names against the journey's own declared `faults`
 * block: reuse a matching entry (keeping its `surface`/`params`) when one
 * exists, else synthesize an unrestricted, param-less entry. Passing no
 * `--faults` at all keeps the journey's full declared matrix unchanged. */
function resolveFaultSelection(
  journey: Journey,
  requestedNames: string[] | undefined
): JourneyFault[] {
  if (!requestedNames || requestedNames.length === 0) {
    return journey.manifest.faults;
  }
  return requestedNames.map((type) => {
    const declared = journey.manifest.faults.find((f) => f.type === type);
    return declared ?? { type };
  });
}

async function resolveJourney(journeyName: string, journeysDir: string): Promise<Journey> {
  const dir = join(journeysDir, journeyName);
  if (!existsSync(join(dir, "journey.json"))) {
    throw new ReliabilityCliError(`no journey named "${journeyName}" in ${journeysDir}`);
  }
  return loadJourney(dir);
}

/** Runs one journey's differential compare across its (or the caller's
 * override) surfaces. This is what `nodetool reliability run <journey>`
 * calls. */
export async function runJourney(
  journeyName: string,
  options: RunJourneyOptions = {}
): Promise<CompareReport> {
  const journeysDir = options.journeysDir ?? findJourneysDir();
  const journey = await resolveJourney(journeyName, journeysDir);

  const requested = options.surfaces && options.surfaces.length > 0
    ? options.surfaces
    : journey.manifest.surfaces;
  const surfaceNames = requested.includes("kernel") ? requested : ["kernel", ...requested];

  for (const name of surfaceNames) {
    if (!DRIVER_FACTORIES[name]) {
      throw new ReliabilityCliError(
        `unknown surface "${name}" — valid surfaces: ${Object.keys(DRIVER_FACTORIES).join(", ")}`
      );
    }
  }
  for (const fault of options.faults ?? []) {
    if (!KNOWN_FAULT_TYPES.includes(fault)) {
      throw new ReliabilityCliError(
        `unknown fault "${fault}" — known fault names: ${KNOWN_FAULT_TYPES.join(", ")}`
      );
    }
  }

  const drivers = surfaceNames.map((name) => DRIVER_FACTORIES[name]());
  const faults = resolveFaultSelection(journey, options.faults);
  const report = await compareJourney(journey, drivers, { faults });

  return report;
}

/**
 * Rewrites a journey's `expected/` fixtures from a fresh, unfaulted oracle
 * (kernel) run — the maintainer path for a golden that legitimately moved.
 *
 * Only writes the fixtures the journey declares, and refuses a run that
 * didn't complete: a golden captured from a broken run bakes the breakage in.
 * Review the diff — that is what makes the fixture an assertion rather than a
 * transcript.
 */
export async function updateJourneyGoldens(
  journeyName: string,
  options: { journeysDir?: string } = {}
): Promise<{ written: string[] }> {
  const journeysDir = options.journeysDir ?? findJourneysDir();
  const journey = await resolveJourney(journeyName, journeysDir);
  const { assertions } = journey.manifest;
  if (!assertions.outputs && !assertions.streamShape) {
    throw new ReliabilityCliError(
      `journey "${journeyName}" declares no golden assertions to update`
    );
  }

  const record = await new KernelDriver().run(journey);
  if (record.status !== "completed") {
    throw new ReliabilityCliError(
      `journey "${journeyName}" ended "${record.status}" (${record.error ?? "no error"}) — ` +
        "refusing to capture goldens from a run that didn't complete"
    );
  }

  const expectedDir = join(journeysDir, journeyName, "expected");
  const written: string[] = [];
  if (assertions.outputs) {
    const file = join(expectedDir, "outputs.json");
    await writeFile(file, `${JSON.stringify(terminalOutputsOf(record), null, 2)}\n`);
    written.push(file);
  }
  if (assertions.streamShape) {
    const file = join(expectedDir, "stream.shape.json");
    await writeFile(file, `${JSON.stringify(streamShapeOf(record), null, 2)}\n`);
    written.push(file);
  }
  return { written };
}

/** Every fault name a `FaultModule` is actually registered for right now —
 * a subset of `KNOWN_FAULT_TYPES` until D2/D3 ship their seams. Exposed for
 * `nodetool reliability list --faults`-style introspection. */
export function listImplementedFaultTypes(): string[] {
  return listFaultModuleNames();
}

export { formatCompareReport, type CompareReport };
