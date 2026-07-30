/**
 * `nodetool reliability` orchestration (§12's package-diagram `cli.ts`).
 * `packages/cli/src/commands/reliability.ts` is a thin Commander wrapper over
 * this module — same split as the debug harness (`packages/cli/src/debug/`
 * does the work, `commands/debug.ts` just parses flags and prints).
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJourney, type Journey } from "./core/journey.js";
import { compareJourney, formatCompareReport, type CompareDriver, type CompareReport } from "./compare.js";
import { KernelDriver } from "./drivers/kernel.js";
import { WsServerDriver } from "./drivers/ws-server.js";
import { CliDriver } from "./drivers/cli.js";
import { BrowserDriver } from "./drivers/browser.js";
import { AppHeadlessDriver } from "./drivers/app-headless.js";
import { PackagedDriver } from "./drivers/packaged.js";

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
 * §9's fault seams, named. Track D (docs/RELIABILITY_TASKS.md) implements the
 * actual fault modules; `--faults` here only validates the name and reports
 * that injection isn't wired yet, per C4 item 6.
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

export interface JourneySummary {
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

export interface RunJourneyOptions {
  journeysDir?: string;
  /** Overrides the journey manifest's own `surfaces` list. The oracle
   * (`kernel`) is always included even if omitted — `compareJourney` needs it
   * present to diff against. */
  surfaces?: string[];
  /** Fault names to inject (§9) — validated against `KNOWN_FAULT_TYPES` only;
   * Track D wires the actual fault modules. */
  faults?: string[];
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
  const report = await compareJourney(journey, drivers);

  if ((options.faults ?? []).length > 0) {
    report.verdict.issues.push(
      `fault injection requested (${options.faults!.join(", ")}) but no fault modules are ` +
        `implemented yet — ran without faults (Track D)`
    );
  }

  return report;
}

export { formatCompareReport, type CompareReport };
