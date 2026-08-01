/**
 * `compare.ts` unit tests against fake drivers (fast, no real IO) — proves
 * the every-surface-vs-kernel wiring, invariant aggregation, and
 * not-applicable/failed-run handling independently of any real driver.
 * `tests/reliability-run.test.ts` covers the real end-to-end path (kernel +
 * ws-server + cli) for the C4 done-when.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../src/core/journey.js";
import { makeFrame, type RunRecord } from "../src/core/record.js";
import { compareJourney, formatCompareReport, type CompareDriver } from "../src/compare.js";

const JOURNEYS_DIR = resolve(__dirname, "../../journeys");

function completedRecord(surface: string, extraFrames: RunRecord["frames"] = []): RunRecord {
  const frames = [
    makeFrame(0, surface, "server_to_client", { type: "job_update", status: "running" }),
    ...extraFrames,
    makeFrame(extraFrames.length + 1, surface, "server_to_client", {
      type: "job_update",
      status: "completed"
    })
  ];
  return {
    surface,
    jobId: `${surface}-job`,
    workflowId: "linear-text-pipeline",
    startedAt: 0,
    finishedAt: frames.length - 1,
    durationMs: null,
    status: "completed",
    error: null,
    params: {},
    frames
  };
}

function fakeDriver(name: string, record: RunRecord, opts: { supports?: boolean } = {}): CompareDriver {
  return {
    name,
    ...(opts.supports !== undefined ? { supports: () => opts.supports! } : {}),
    run: async () => record
  };
}

/**
 * These tests exercise `compareJourney`'s wiring against stub records that
 * carry only job_update frames, so the journey's golden assertions are turned
 * off here — a stub can't match a real run's fixtures, and the goldens have
 * their own coverage in `golden.test.ts`.
 */
async function loadLinear(): Promise<Journey> {
  const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
  journey.manifest.assertions.outputs = false;
  journey.manifest.assertions.streamShape = false;
  return journey;
}

describe("compareJourney", () => {
  it("throws when the oracle driver is not among the given drivers", async () => {
    const journey = await loadLinear();
    await expect(
      compareJourney(journey, [fakeDriver("ws-server", completedRecord("ws-server"))])
    ).rejects.toThrow(/no driver named "kernel"/);
  });

  it("reports an identical candidate as ok with an empty diff", async () => {
    const journey = await loadLinear();
    const kernelRecord = completedRecord("kernel");
    const candidateRecord = { ...completedRecord("ws-server") };
    const report = await compareJourney(journey, [
      fakeDriver("kernel", kernelRecord),
      fakeDriver("ws-server", candidateRecord)
    ]);

    expect(report.oracle).toBe("kernel");
    expect(report.surfaces).toHaveLength(2);
    const wsResult = report.surfaces.find((s) => s.surface === "ws-server")!;
    expect(wsResult.ran).toBe(true);
    expect(wsResult.diffVsOracleEmpty).toBe(true);
    expect(wsResult.ok).toBe(true);
    expect(report.verdict.ok).toBe(true);
  });

  it("flags a candidate whose stream diverges from the oracle", async () => {
    const journey = await loadLinear();
    const kernelRecord = completedRecord("kernel");
    const divergentRecord = completedRecord("ws-server", [
      makeFrame(1, "ws-server", "server_to_client", { type: "job_update", status: "extra" })
    ]);
    const report = await compareJourney(journey, [
      fakeDriver("kernel", kernelRecord),
      fakeDriver("ws-server", divergentRecord)
    ]);

    const wsResult = report.surfaces.find((s) => s.surface === "ws-server")!;
    expect(wsResult.diffVsOracleEmpty).toBe(false);
    expect(wsResult.ok).toBe(false);
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.some((i) => i.includes("diverges from kernel"))).toBe(true);
  });

  it("marks a driver not-applicable when supports() returns false, without failing the verdict", async () => {
    const journey = await loadLinear();
    const report = await compareJourney(journey, [
      fakeDriver("kernel", completedRecord("kernel")),
      fakeDriver("app-headless", completedRecord("app-headless"), { supports: false })
    ]);
    const appResult = report.surfaces.find((s) => s.surface === "app-headless")!;
    expect(appResult.ran).toBe(false);
    expect(appResult.notApplicable).toBe(true);
    expect(appResult.ok).toBe(true);
    expect(report.verdict.ok).toBe(true);
  });

  it("records a failed driver run as a non-ok surface without throwing", async () => {
    const journey = await loadLinear();
    const failingDriver: CompareDriver = {
      name: "cli",
      run: async () => {
        throw new Error("boom");
      }
    };
    const report = await compareJourney(journey, [
      fakeDriver("kernel", completedRecord("kernel")),
      failingDriver
    ]);
    const cliResult = report.surfaces.find((s) => s.surface === "cli")!;
    expect(cliResult.ran).toBe(false);
    expect(cliResult.skipReason).toMatch(/boom/);
    expect(report.verdict.ok).toBe(false);
  });

  it("surfaces unknown invariant names declared by the journey", async () => {
    const journey = await loadLinear();
    journey.manifest.assertions.invariants.push("no-such-invariant");
    const report = await compareJourney(journey, [fakeDriver("kernel", completedRecord("kernel"))]);
    expect(report.unknownInvariants).toEqual(["no-such-invariant"]);
    expect(report.verdict.issues.some((i) => i.includes("unknown invariant"))).toBe(true);
  });

  it("resolves the journey-authored invariant name aliases (lifecycle-pairing, cleanup-leaks)", async () => {
    const journey = await loadLinear();
    expect(journey.manifest.assertions.invariants).toContain("lifecycle-pairing");
    const report = await compareJourney(journey, [fakeDriver("kernel", completedRecord("kernel"))]);
    expect(report.unknownInvariants).toEqual([]);
  });

  it("formatCompareReport renders an OK verdict and per-surface lines", async () => {
    const journey = await loadLinear();
    const report = await compareJourney(journey, [
      fakeDriver("kernel", completedRecord("kernel")),
      fakeDriver("ws-server", completedRecord("ws-server"))
    ]);
    const text = formatCompareReport(report);
    expect(text).toContain("journey: linear-text-pipeline");
    expect(text).toContain("verdict: OK");
    expect(text).toContain("kernel:");
    expect(text).toContain("ws-server:");
  });
});
