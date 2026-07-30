/**
 * Cross-surface differential compare (§12): runs one journey on N drivers,
 * normalizes every record, diffs each non-oracle surface against the kernel
 * oracle (§12: "the kernel surface is the oracle... every-surface-vs-kernel,
 * not all-pairs"), and aggregates the journey's declared §6 invariant checks
 * per surface. Produces one structured report plus a human-readable
 * formatter for `nodetool reliability run`.
 */
import type { Journey } from "./core/journey.js";
import { diffNormalizedRecords, formatStreamDiff, streamDiffIsEmpty, type StreamDiff } from "./core/diff.js";
import { INVARIANT_CHECKS, type Violation } from "./core/invariants/index.js";
import { normalizeRunRecord, type NormalizedRunRecord } from "./core/normalize.js";
import type { RunRecord } from "./core/record.js";
import type { RunDriver } from "./drivers/types.js";

/** A `RunDriver` that additionally knows whether it applies to a given
 * journey (added additively by C4 — `supports` is optional on the base
 * `RunDriver` interface so C2's kernel/ws-server drivers need no change). */
export interface CompareDriver extends RunDriver {
  supports?(journey: Journey): boolean;
}

export interface SurfaceCompareResult {
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
  /** Diff against the oracle's normalized `server_to_client` frames — `null`
   * for the oracle surface itself, or when the surface didn't run. */
  diffVsOracle: StreamDiff | null;
  diffVsOracleEmpty: boolean;
  /** True when this surface is not applicable to the journey (a `supports`
   * check said no) — distinct from a real failure so a report can render it
   * as "n/a" rather than "FAIL". */
  notApplicable: boolean;
  ok: boolean;
}

export interface CompareReport {
  journeyId: string;
  oracle: string;
  /** Invariant names the journey declared that no `INVARIANT_CHECKS` entry
   * recognizes — a journey-authoring mistake, surfaced instead of silently
   * skipped. */
  unknownInvariants: string[];
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
 * Runs `journey` on every driver in `drivers`, diffing each non-oracle
 * surface's normalized `server_to_client` stream against the oracle's (the
 * one driver named `options.oracleName`, default `"kernel"` — §12's "the
 * kernel surface is the oracle"). `drivers` must include the oracle driver
 * itself; it both anchors the diff and is reported as its own (trivially
 * clean) surface.
 */
export async function compareJourney(
  journey: Journey,
  drivers: CompareDriver[],
  options: { oracleName?: string } = {}
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

  // Run the oracle first — every other surface's diff needs its normalized
  // record, and running it once (not per-surface) keeps an N-driver compare
  // to N+1 runs, not 2N.
  const oracleRecord = await oracleDriver.run(journey);
  const oracleNormalized = onlyServerToClient(normalizeRunRecord(oracleRecord));

  const surfaces: SurfaceCompareResult[] = [];

  for (const driver of drivers) {
    if (driver.supports && !driver.supports(journey)) {
      surfaces.push({
        surface: driver.name,
        ran: false,
        skipReason: "not applicable to this journey",
        violations: [],
        diffVsOracle: null,
        diffVsOracleEmpty: true,
        notApplicable: true,
        ok: true
      });
      continue;
    }

    let record: RunRecord;
    if (driver.name === oracleDriver.name) {
      record = oracleRecord;
    } else {
      try {
        record = await driver.run(journey);
      } catch (err) {
        const skipReason = `run failed: ${err instanceof Error ? err.message : String(err)}`;
        surfaces.push({
          surface: driver.name,
          ran: false,
          skipReason,
          violations: [],
          diffVsOracle: null,
          diffVsOracleEmpty: false,
          notApplicable: false,
          ok: false
        });
        issues.push(`${driver.name}: ${skipReason}`);
        continue;
      }
    }

    const violations = checks.flatMap((c) => c.check(record));

    let diff: StreamDiff | null = null;
    let diffEmpty = true;
    if (driver.name !== oracleDriver.name) {
      const normalized = onlyServerToClient(normalizeRunRecord(record));
      diff = diffNormalizedRecords(oracleNormalized, normalized);
      diffEmpty = streamDiffIsEmpty(diff);
    }

    const ok = violations.length === 0 && diffEmpty;
    if (violations.length > 0) {
      issues.push(`${driver.name}: ${violations.length} invariant violation(s)`);
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
      diffVsOracle: diff,
      diffVsOracleEmpty: diffEmpty,
      notApplicable: false,
      ok
    });
  }

  return {
    journeyId: journey.manifest.name,
    oracle: oracleDriver.name,
    unknownInvariants,
    surfaces,
    verdict: { ok: surfaces.every((s) => s.ok), issues }
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
    if (s.violations.length > 0) bits.push(`${s.violations.length} violation(s)`);
    if (!s.diffVsOracleEmpty) {
      bits.push(
        showDiff ? `diverges from ${report.oracle}` : `diverges from ${report.oracle} (--diff for detail)`
      );
    }
    lines.push(`  ${mark} ${s.surface}: ${bits.join(" — ")}`);
    for (const v of s.violations) {
      lines.push(`      [${v.invariant}] ${v.message}`);
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
  lines.push(
    report.verdict.ok
      ? "verdict: OK"
      : `verdict: FAIL — ${report.verdict.issues.join("; ")}`
  );
  return lines.join("\n");
}
