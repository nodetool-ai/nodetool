/**
 * Cross-surface differential compare (§12): runs one journey on N drivers,
 * normalizes every record, diffs each non-oracle surface against the kernel
 * oracle (§12: "the kernel surface is the oracle... every-surface-vs-kernel,
 * not all-pairs"), and aggregates the journey's declared §6 invariant checks
 * per surface. Produces one structured report plus a human-readable
 * formatter for `nodetool reliability run`.
 */
import type { Journey, JourneyFault } from "./core/journey.js";
import { diffNormalizedRecords, formatStreamDiff, streamDiffIsEmpty, type StreamDiff } from "./core/diff.js";
import { checkGoldens, type GoldenCheckResult } from "./core/golden.js";
import { INVARIANT_CHECKS, type Violation } from "./core/invariants/index.js";
import { normalizeRunRecord, type NormalizedRunRecord } from "./core/normalize.js";
import type { RunRecord } from "./core/record.js";
import type { RunDriver } from "./drivers/types.js";
import { getFaultModule } from "./faults/registry.js";
import type { FaultTeardown } from "./faults/types.js";
// Side-effecting import: registers every built-in fault module (task D1's
// "faults/index.ts registers on import" contract) so `getFaultModule` below
// resolves journey-declared fault names without every caller of
// `compareJourney` remembering to import the fault barrel itself.
import "./faults/index.js";

/** A `RunDriver` that additionally knows whether it applies to a given
 * journey (added additively by C4 — `supports` is optional on the base
 * `RunDriver` interface so C2's kernel/ws-server drivers need no change). */
export interface CompareDriver extends RunDriver {
  supports?(journey: Journey): boolean;
}

interface SurfaceCompareResult {
  surface: string;
  /** False when the driver declared (via `supports`) that this journey does
   * not apply to it, or when the driver's `run()` threw. */
  ran: boolean;
  /** Why this surface didn't run — either "not applicable" (`supports`
   * returned false) or the driver's thrown error. Only set when `!ran`. */
  skipReason?: string;
  status?: string;
  error?: string | null;
  /** §6 invariant violations from the journey's declared `assertions.invariants`. */
  violations: Violation[];
  /**
   * Golden comparisons the journey declared (`assertions.outputs`,
   * `assertions.streamShape`), one entry each. A skipped entry (faulted run)
   * carries its reason — the fixtures are never silently ignored.
   */
  goldens: GoldenCheckResult[];
  /** Diff against the oracle's normalized `server_to_client` frames — `null`
   * for the oracle surface itself, or when the surface didn't run. */
  diffVsOracle: StreamDiff | null;
  diffVsOracleEmpty: boolean;
  /** True when this surface is not applicable to the journey (a `supports`
   * check said no) — distinct from a real failure so a report can render it
   * as "n/a" rather than "FAIL". */
  notApplicable: boolean;
  /** Fault names actually configured for this surface's run (task D1) — a
   * subset of the journey's declared/`--faults`-selected faults, filtered by
   * each fault's optional `surface` restriction and by module availability. */
  faultsApplied: string[];
  ok: boolean;
}

export interface CompareReport {
  journeyId: string;
  oracle: string;
  /** Invariant names the journey declared that no `INVARIANT_CHECKS` entry
   * recognizes — a journey-authoring mistake, surfaced instead of silently
   * skipped. */
  unknownInvariants: string[];
  /** Fault names requested (via the journey's `faults` block or `--faults`)
   * that no `FaultModule` is registered for (task D1) — surfaced the same
   * way `unknownInvariants` is, instead of silently no-oping the fault. */
  unknownFaults: string[];
  surfaces: SurfaceCompareResult[];
  verdict: { ok: boolean; issues: string[] };
}

function onlyServerToClient(record: NormalizedRunRecord): NormalizedRunRecord {
  return {
    ...record,
    frames: record.frames.filter((f) => f.direction === "server_to_client")
  };
}

/**
 * Applies every fault in `faults` whose optional `surface` restriction either
 * matches `surfaceName` or is unset (applies everywhere), in order, and
 * returns one teardown that undoes them all in reverse — so a single
 * `finally` block at each call site fully unwinds the fault's process-global
 * side effects (today: the provider registry) regardless of how the driver
 * run in between went. A fault name with no registered `FaultModule` is
 * skipped and reported back via `unknownFaults` (its own return value), never
 * silently ignored or thrown.
 */
async function applyFaults(
  journey: Journey,
  surfaceName: string,
  faults: JourneyFault[]
): Promise<{ applied: string[]; unknown: string[]; teardown: FaultTeardown }> {
  const applicable = faults.filter(
    (f) => f.surface === undefined || f.surface === surfaceName
  );
  const applied: string[] = [];
  const unknown: string[] = [];
  const teardowns: FaultTeardown[] = [];

  for (const fault of applicable) {
    const module = getFaultModule(fault.type);
    if (!module) {
      unknown.push(fault.type);
      continue;
    }
    const teardown = await module.configure({ journey, surface: surfaceName, fault });
    teardowns.push(teardown);
    applied.push(fault.type);
  }

  return {
    applied,
    unknown,
    teardown: async () => {
      for (const teardown of teardowns.reverse()) {
        await teardown();
      }
    }
  };
}

/**
 * Runs `journey` on every driver in `drivers`, diffing each non-oracle
 * surface's normalized `server_to_client` stream against the oracle's (the
 * one driver named `options.oracleName`, default `"kernel"` — §12's "the
 * kernel surface is the oracle"). `drivers` must include the oracle driver
 * itself; it both anchors the diff and is reported as its own (trivially
 * clean) surface.
 *
 * `options.faults` (task D1) selects the fault matrix for this run — default
 * is the journey's own declared `faults` block (`journey.json`), so callers
 * that don't care about fault injection get the journey's authored behavior
 * unchanged. Each applicable fault (its `surface` restriction, if any,
 * matched against the driver about to run) is configured immediately before
 * that driver's `run()` and torn down immediately after, so faults never
 * leak across drivers or across `compareJourney` calls.
 */
export async function compareJourney(
  journey: Journey,
  drivers: CompareDriver[],
  options: { oracleName?: string; faults?: JourneyFault[] } = {}
): Promise<CompareReport> {
  const oracleName = options.oracleName ?? "kernel";
  const oracleDriver = drivers.find((d) => d.name === oracleName);
  if (!oracleDriver) {
    throw new Error(
      `compareJourney: no driver named "${oracleName}" among [${drivers
        .map((d) => d.name)
        .join(", ")}] — the oracle driver must be included`
    );
  }

  const faults = options.faults ?? journey.manifest.faults;

  const invariantNames = journey.manifest.assertions.invariants;
  const checks = invariantNames
    .map((name) => ({ name, check: INVARIANT_CHECKS[name] }))
    .filter((c): c is { name: string; check: NonNullable<(typeof c)["check"]> } => !!c.check);
  const unknownInvariants = invariantNames.filter((name) => !INVARIANT_CHECKS[name]);

  const issues: string[] = [];
  if (unknownInvariants.length > 0) {
    issues.push(
      `journey declares unknown invariant(s), skipped: ${unknownInvariants.join(", ")}`
    );
  }

  const unknownFaultsSeen = new Set<string>();

  /** Runs one driver with its applicable faults configured/torn down around
   * the call — shared by the oracle (run once, up front) and every other
   * surface's loop iteration below. */
  const runWithFaults = async (driver: CompareDriver): Promise<{ record: RunRecord; faultsApplied: string[] }> => {
    const { applied, unknown, teardown } = await applyFaults(journey, driver.name, faults);
    for (const name of unknown) unknownFaultsSeen.add(name);
    try {
      const record = await driver.run(journey);
      return { record, faultsApplied: applied };
    } finally {
      await teardown();
    }
  };

  // Run the oracle first — every other surface's diff needs its normalized
  // record, and running it once (not per-surface) keeps an N-driver compare
  // to N+1 runs, not 2N.
  const { record: oracleRecord, faultsApplied: oracleFaultsApplied } =
    await runWithFaults(oracleDriver);
  const oracleNormalized = onlyServerToClient(normalizeRunRecord(oracleRecord));

  const surfaces: SurfaceCompareResult[] = [];

  for (const driver of drivers) {
    if (driver.supports && !driver.supports(journey)) {
      surfaces.push({
        surface: driver.name,
        ran: false,
        skipReason: "not applicable to this journey",
        violations: [],
        goldens: [],
        diffVsOracle: null,
        diffVsOracleEmpty: true,
        notApplicable: true,
        faultsApplied: [],
        ok: true
      });
      continue;
    }

    let record: RunRecord;
    let faultsApplied: string[];
    if (driver.name === oracleDriver.name) {
      record = oracleRecord;
      faultsApplied = oracleFaultsApplied;
    } else {
      try {
        const result = await runWithFaults(driver);
        record = result.record;
        faultsApplied = result.faultsApplied;
      } catch (err) {
        const skipReason = `run failed: ${err instanceof Error ? err.message : String(err)}`;
        surfaces.push({
          surface: driver.name,
          ran: false,
          skipReason,
          violations: [],
          goldens: [],
          diffVsOracle: null,
          diffVsOracleEmpty: false,
          notApplicable: false,
          faultsApplied: [],
          ok: false
        });
        issues.push(`${driver.name}: ${skipReason}`);
        continue;
      }
    }

    const violations = checks.flatMap((c) => c.check(record));
    // §4's golden fixtures: the only assertion on what the run actually
    // produced. Every surface is held to them, not just the oracle — a
    // surface can agree with the oracle frame-for-frame and still be wrong.
    const goldens = checkGoldens(journey, record, { faultsApplied });
    const goldenFailures = goldens.flatMap((g) => g.failures);

    let diff: StreamDiff | null = null;
    let diffEmpty = true;
    if (driver.name !== oracleDriver.name) {
      const normalized = onlyServerToClient(normalizeRunRecord(record));
      diff = diffNormalizedRecords(oracleNormalized, normalized);
      diffEmpty = streamDiffIsEmpty(diff);
    }

    const ok = violations.length === 0 && diffEmpty && goldenFailures.length === 0;
    if (violations.length > 0) {
      issues.push(`${driver.name}: ${violations.length} invariant violation(s)`);
    }
    for (const golden of goldens) {
      if (golden.failures.length === 0) continue;
      issues.push(
        `${driver.name}: ${golden.kind} golden mismatch (${golden.failures.length})`
      );
    }
    if (!diffEmpty) {
      issues.push(`${driver.name}: diverges from ${oracleDriver.name}`);
    }

    surfaces.push({
      surface: driver.name,
      ran: true,
      status: record.status,
      error: record.error,
      violations,
      goldens,
      diffVsOracle: diff,
      diffVsOracleEmpty: diffEmpty,
      notApplicable: false,
      faultsApplied,
      ok
    });
  }

  const unknownFaults = Array.from(unknownFaultsSeen);
  if (unknownFaults.length > 0) {
    issues.push(`fault(s) requested with no registered module: ${unknownFaults.join(", ")}`);
  }

  return {
    journeyId: journey.manifest.name,
    oracle: oracleDriver.name,
    unknownInvariants,
    unknownFaults,
    surfaces,
    verdict: { ok: surfaces.every((s) => s.ok) && unknownFaults.length === 0, issues }
  };
}

/** Human-readable rendering of a `CompareReport` for `nodetool reliability run`.
 * `showDiff` (default `true`) controls whether a diverging surface's full
 * per-channel stream diff is inlined under its summary line, or just noted —
 * `nodetool reliability run`'s `--diff` flag maps straight to this. */
export function formatCompareReport(
  report: CompareReport,
  options: { showDiff?: boolean } = {}
): string {
  const showDiff = options.showDiff ?? true;
  const lines: string[] = [];
  lines.push(`journey: ${report.journeyId}  (oracle: ${report.oracle})`);
  for (const s of report.surfaces) {
    if (!s.ran) {
      const mark = s.notApplicable ? "·" : "✗";
      lines.push(`  ${mark} ${s.surface}: ${s.skipReason}`);
      continue;
    }
    const mark = s.ok ? "✓" : "✗";
    const bits = [String(s.status)];
    if (s.error) bits.push(`error: ${s.error}`);
    if (s.faultsApplied.length > 0) bits.push(`faults: ${s.faultsApplied.join(", ")}`);
    if (s.violations.length > 0) bits.push(`${s.violations.length} violation(s)`);
    for (const golden of s.goldens) {
      if (!golden.checked) bits.push(`${golden.kind} golden skipped`);
      else if (golden.failures.length > 0) {
        bits.push(`${golden.kind} golden: ${golden.failures.length} mismatch(es)`);
      }
    }
    if (!s.diffVsOracleEmpty) {
      bits.push(
        showDiff ? `diverges from ${report.oracle}` : `diverges from ${report.oracle} (--diff for detail)`
      );
    }
    lines.push(`  ${mark} ${s.surface}: ${bits.join(" — ")}`);
    for (const v of s.violations) {
      lines.push(`      [${v.invariant}] ${v.message}`);
    }
    for (const golden of s.goldens) {
      if (!golden.checked && golden.skipReason) {
        lines.push(`      [${golden.kind}] ${golden.skipReason}`);
      }
      for (const failure of golden.failures) {
        lines.push(`      [${golden.kind}] ${failure}`);
      }
    }
    if (showDiff && !s.diffVsOracleEmpty && s.diffVsOracle) {
      for (const line of formatStreamDiff(s.diffVsOracle).split("\n")) {
        lines.push(`      ${line}`);
      }
    }
  }
  if (report.unknownInvariants.length > 0) {
    lines.push(`  ! unknown invariant(s) declared: ${report.unknownInvariants.join(", ")}`);
  }
  if (report.unknownFaults.length > 0) {
    lines.push(`  ! unknown fault(s) requested: ${report.unknownFaults.join(", ")}`);
  }
  lines.push(
    report.verdict.ok
      ? "verdict: OK"
      : `verdict: FAIL — ${report.verdict.issues.join("; ")}`
  );
  return lines.join("\n");
}
