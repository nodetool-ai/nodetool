/**
 * D3 done-when (docs/RELIABILITY_TASKS.md Track D): journey #7
 * (`python-node-workflow`) passes every §6 invariant it declares on both
 * surfaces on the happy path, and every `bridge-*` fault in its matrix ends
 * in a sane failed terminal with zero invariant violations. Mirrors D1's
 * `provider-failure-mid-stream.test.ts` structure.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../../src/core/journey.js";
import { INVARIANT_CHECKS } from "../../src/core/invariants/index.js";
import type { RunRecord } from "../../src/core/record.js";
import { KernelDriver } from "../../src/drivers/kernel.js";
import { WsServerDriver } from "../../src/drivers/ws-server.js";
import type { RunDriver } from "../../src/drivers/types.js";
import { getFaultModule } from "../../src/faults/registry.js";
import "../../src/faults/index.js";
import { runJourney } from "../../src/cli.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const JOURNEY_NAME = "python-node-workflow";

async function load(): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, JOURNEY_NAME));
}

/** Every fault in the journey's declared matrix ends the run `failed` —
 * either the bridge never connects (never-ready/epipe/version-mismatch,
 * swallowed by `connectPythonBridgeForGraph` to a `null` bridge, so the
 * Python node type reports "Unknown node type"), or it connects and breaks
 * mid-run (exit-mid-request/framing-violation, surfaced as the node's own
 * execute() rejection). */
const EXPECTED_STATUS: Readonly<Record<string, string>> = {
  "bridge-exit-mid-request": "failed",
  "bridge-framing-violation": "failed",
  "bridge-never-ready": "failed",
  "bridge-epipe": "failed",
  "bridge-version-mismatch": "failed"
};

async function runWithFault(
  driver: RunDriver,
  journey: Journey,
  faultName: string
): Promise<RunRecord> {
  const fault = journey.manifest.faults.find((f) => f.type === faultName);
  if (!fault) {
    throw new Error(`journey "${journey.manifest.name}" doesn't declare fault "${faultName}"`);
  }
  const module = getFaultModule(faultName);
  if (!module) {
    throw new Error(`no FaultModule registered for "${faultName}"`);
  }
  const teardown = await module.configure({ journey, surface: driver.name, fault });
  try {
    return await driver.run(journey);
  } finally {
    await teardown();
  }
}

function assertZeroViolations(journey: Journey, record: RunRecord): void {
  const violations = journey.manifest.assertions.invariants.flatMap((name) => {
    const check = INVARIANT_CHECKS[name];
    expect(check, `no INVARIANT_CHECKS entry for "${name}"`).toBeDefined();
    return check(record);
  });
  expect(violations, JSON.stringify(violations)).toEqual([]);
}

describe("journey python-node-workflow (task D3)", () => {
  it("declares exactly the fault matrix this suite covers", async () => {
    const journey = await load();
    expect(journey.manifest.faults.map((f) => f.type).sort()).toEqual(
      Object.keys(EXPECTED_STATUS).sort()
    );
  });

  it(
    "kernel driver: happy path completes and round-trips the value through the fake bridge",
    { timeout: 20000 },
    async () => {
      const journey = await load();
      const record = await new KernelDriver().run(journey);
      expect(record.status).toBe("completed");
      assertZeroViolations(journey, record);
    }
  );

  it(
    "ws-server driver: happy path completes and round-trips the value through the fake bridge",
    { timeout: 20000 },
    async () => {
      const journey = await load();
      const record = await new WsServerDriver().run(journey);
      expect(record.status).toBe("completed");
      assertZeroViolations(journey, record);
    }
  );

  describe.each(Object.entries(EXPECTED_STATUS))("fault %s", (faultName, expectedStatus) => {
    it(
      "kernel driver: expected terminal status, zero invariant violations",
      { timeout: 20000 },
      async () => {
        const journey = await load();
        const record = await runWithFault(new KernelDriver(), journey, faultName);
        expect(record.status).toBe(expectedStatus);
        assertZeroViolations(journey, record);
      }
    );

    it(
      "ws-server driver: expected terminal status, zero invariant violations",
      { timeout: 20000 },
      async () => {
        const journey = await load();
        const record = await runWithFault(new WsServerDriver(), journey, faultName);
        expect(record.status).toBe(expectedStatus);
        assertZeroViolations(journey, record);
      }
    );
  });

  it(
    "`nodetool reliability run python-node-workflow --faults bridge-exit-mid-request` (the CLI/compare.ts wiring) reports the fault applied and a clean verdict",
    { timeout: 20000 },
    async () => {
      const report = await runJourney(JOURNEY_NAME, {
        journeysDir: JOURNEYS_DIR,
        surfaces: ["kernel"],
        faults: ["bridge-exit-mid-request"]
      });
      expect(report.unknownFaults).toEqual([]);
      expect(report.unknownInvariants).toEqual([]);
      const kernel = report.surfaces.find((s) => s.surface === "kernel");
      expect(kernel?.faultsApplied).toEqual(["bridge-exit-mid-request"]);
      expect(kernel?.status).toBe("failed");
      expect(kernel?.violations).toEqual([]);
      expect(report.verdict.ok).toBe(true);
    }
  );

  it("an unregistered fault name is reported, not silently ignored", async () => {
    // `host-db-locked` is a known KNOWN_FAULT_TYPES name (cli.ts) with no
    // registered FaultModule (`faults/host-faults.ts`'s doc comment explains
    // why) — exactly the "known name, no module yet" case this asserts.
    const report = await runJourney(JOURNEY_NAME, {
      journeysDir: JOURNEYS_DIR,
      surfaces: ["kernel"],
      faults: ["host-db-locked"]
    });
    expect(report.unknownFaults).toEqual(["host-db-locked"]);
    expect(report.verdict.ok).toBe(false);
  });
});
