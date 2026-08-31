/**
 * D1 done-when (docs/RELIABILITY_TASKS.md Track D): journey #8
 * (`provider-failure-mid-stream`) passes every §6 invariant it declares under
 * every fault in its matrix.
 *
 * Two layers are exercised:
 *   - Direct driver + `FaultModule.configure()` calls, mirroring what
 *     `compare.ts` itself does — this is what proves the fault actually
 *     reaches the node (a real `context.getProvider("reliability-fault-llm")`
 *     call resolving to the fault-scripted `CassetteProvider`).
 *   - `runJourney` (the `nodetool reliability run --faults` entry point) for
 *     one fault, proving the CLI-level wiring end to end.
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
const JOURNEY_NAME = "provider-failure-mid-stream";

async function load(): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, JOURNEY_NAME));
}

/** Every fault in the journey's declared matrix, and the terminal status it
 * is expected to produce: the three immediate faults and the two mid-stream
 * faults end the run `failed`; `slow-drip`/`cost-omission` let it complete. */
const EXPECTED_STATUS: Readonly<Record<string, string>> = {
  "provider-429": "failed",
  "provider-500": "failed",
  "provider-timeout": "failed",
  "provider-truncated-stream": "failed",
  "provider-malformed-sse": "failed",
  "provider-slow-drip": "completed",
  "provider-cost-omission": "completed"
};

/**
 * The ws-server driver's asset-autosave path
 * (`websocket-client-session.ts`'s `Asset.paginate` warm-up on a completed
 * generation) assumes an initialized DB the hermetic test server never sets
 * up — a pre-existing gap in `packages/websocket`, outside D1's scope
 * (reliability/harness, packages/runtime, packages/cli). Every fault that
 * fails the node before a generation completes never reaches that path;
 * `slow-drip`/`cost-omission` do (the run actually completes), so those two
 * only run on the kernel driver until that gap is closed separately.
 */
const WS_SERVER_UNSUPPORTED = new Set(["provider-slow-drip", "provider-cost-omission"]);

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

describe("journey provider-failure-mid-stream (task D1)", () => {
  it("declares exactly the fault matrix this suite covers", async () => {
    const journey = await load();
    expect(journey.manifest.faults.map((f) => f.type).sort()).toEqual(
      Object.keys(EXPECTED_STATUS).sort()
    );
  });

  describe.each(Object.entries(EXPECTED_STATUS))("fault %s", (faultName, expectedStatus) => {
    it(
      "kernel driver: expected terminal status, zero invariant violations",
      { timeout: 30000 },
      async () => {
        const journey = await load();
        const record = await runWithFault(new KernelDriver(), journey, faultName);
        expect(record.status).toBe(expectedStatus);
        assertZeroViolations(journey, record);
      }
    );

    it.skipIf(WS_SERVER_UNSUPPORTED.has(faultName))(
      "ws-server driver: expected terminal status, zero invariant violations",
      { timeout: 30000 },
      async () => {
        const journey = await load();
        const record = await runWithFault(new WsServerDriver(), journey, faultName);
        expect(record.status).toBe(expectedStatus);
        assertZeroViolations(journey, record);
      }
    );
  });

  it(
    "`nodetool reliability run provider-failure-mid-stream --faults provider-429` (the CLI/compare.ts wiring) reports the fault applied and a clean verdict",
    { timeout: 30000 },
    async () => {
      const report = await runJourney(JOURNEY_NAME, {
        journeysDir: JOURNEYS_DIR,
        surfaces: ["kernel"],
        faults: ["provider-429"]
      });
      expect(report.unknownFaults).toEqual([]);
      expect(report.unknownInvariants).toEqual([]);
      const kernel = report.surfaces.find((s) => s.surface === "kernel");
      expect(kernel?.faultsApplied).toEqual(["provider-429"]);
      expect(kernel?.status).toBe("failed");
      expect(kernel?.violations).toEqual([]);
      expect(report.verdict.ok).toBe(true);
    }
  );

  it("an unregistered fault name is reported, not silently ignored", async () => {
    // "ws-drop-no-fin" was this fixture's stand-in for an unimplemented
    // fault when D1 wrote this test; task D2 has since shipped a
    // `FaultModule` for every `ws-*` name. The "client" seam (§9) has no
    // shipped module yet, so `client-cancel-storm` is today's still-genuinely-
    // unregistered example — swap again whenever that seam ships too.
    const report = await runJourney(JOURNEY_NAME, {
      journeysDir: JOURNEYS_DIR,
      surfaces: ["kernel"],
      faults: ["client-cancel-storm"]
    });
    expect(report.unknownFaults).toEqual(["client-cancel-storm"]);
    expect(report.verdict.ok).toBe(false);
  });
});
