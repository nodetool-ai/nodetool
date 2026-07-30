/**
 * D2 done-when (docs/RELIABILITY_TASKS.md Track D): journey `ws-transport-
 * faults` (§5 item 14's transport half, §9's "WS transport" row) passes on
 * every ws-* fault in its declared matrix.
 *
 * `ws-delay`/`ws-fragment` never corrupt a length-prefixed WS byte stream —
 * they complete normally, with a real terminal `job_update` observed and
 * zero declared-invariant violations. `ws-drop-no-fin`/`ws-stall-reads`/
 * `ws-abrupt-close` black-hole the client's socket by design: this driver's
 * client legitimately never observes a terminal `job_update`, so the
 * ws-server driver's own timeout race (not a hang — see `ws-server.ts`) ends
 * the run `"timeout"`, and `terminal-uniqueness` legitimately reports
 * `terminal-uniqueness.missing` — a faithful client-side symptom of the
 * fault, not evidence of server-side corruption. What *would* be evidence of
 * corruption — the server itself going unhealthy — is checked separately:
 * a fresh, unfaulted connection can still run this exact workflow to
 * completion right after each black-hole fault.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../../src/core/journey.js";
import { INVARIANT_CHECKS } from "../../src/core/invariants/index.js";
import type { RunRecord } from "../../src/core/record.js";
import { WsServerDriver } from "../../src/drivers/ws-server.js";
import { getFaultModule } from "../../src/faults/registry.js";
import "../../src/faults/index.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const JOURNEY_NAME = "ws-transport-faults";

async function load(): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, JOURNEY_NAME));
}

async function runWithFault(journey: Journey, faultName: string): Promise<RunRecord> {
  const fault = journey.manifest.faults.find((f) => f.type === faultName);
  if (!fault) {
    throw new Error(`journey "${journey.manifest.name}" doesn't declare fault "${faultName}"`);
  }
  const module = getFaultModule(faultName);
  if (!module) {
    throw new Error(`no FaultModule registered for "${faultName}"`);
  }
  const teardown = await module.configure({ journey, surface: "ws-server", fault });
  try {
    return await new WsServerDriver().run(journey);
  } finally {
    await teardown();
  }
}

function declaredViolations(journey: Journey, record: RunRecord) {
  return journey.manifest.assertions.invariants.flatMap((name) => {
    const check = INVARIANT_CHECKS[name];
    expect(check, `no INVARIANT_CHECKS entry for "${name}"`).toBeDefined();
    return check(record);
  });
}

const BLACK_HOLE_FAULTS = ["ws-drop-no-fin", "ws-stall-reads", "ws-abrupt-close"] as const;

describe("journey ws-transport-faults (task D2)", () => {
  it("declares exactly the fault matrix this suite covers", async () => {
    const journey = await load();
    expect(journey.manifest.faults.map((f) => f.type).sort()).toEqual(
      ["ws-abrupt-close", "ws-delay", "ws-drop-no-fin", "ws-fragment", "ws-stall-reads"].sort()
    );
  });

  it(
    "ws-delay: completes normally, zero declared-invariant violations",
    { timeout: 15000 },
    async () => {
      const journey = await load();
      const record = await runWithFault(journey, "ws-delay");
      expect(record.status).toBe("completed");
      expect(declaredViolations(journey, record)).toEqual([]);
      expect(INVARIANT_CHECKS["terminal-uniqueness"](record)).toEqual([]);
    }
  );

  it(
    "ws-fragment: completes normally even with 3-byte TCP writes",
    { timeout: 15000 },
    async () => {
      const journey = await load();
      const record = await runWithFault(journey, "ws-fragment");
      expect(record.status).toBe("completed");
      expect(declaredViolations(journey, record)).toEqual([]);
      expect(INVARIANT_CHECKS["terminal-uniqueness"](record)).toEqual([]);
    }
  );

  describe.each(BLACK_HOLE_FAULTS)("%s (black-holes the client)", (faultName) => {
    it(
      "ends the run \"timeout\" — never hangs — and terminal-uniqueness legitimately flags the missing terminal",
      { timeout: 15000 },
      async () => {
        const journey = await load();
        const record = await runWithFault(journey, faultName);
        expect(record.status).toBe("timeout");
        // This journey's own declared matrix (lifecycle-pairing,
        // cleanup-leaks) tolerates a sparse/absent record by design (see
        // each module's doc comment) — it holds even here.
        expect(declaredViolations(journey, record)).toEqual([]);
        // terminal-uniqueness is deliberately NOT in this journey's declared
        // matrix — asserted here instead, because it is *expected* to fire:
        // the client's view of this run really did never reach a terminal.
        expect(INVARIANT_CHECKS["terminal-uniqueness"](record)).toEqual([
          expect.objectContaining({ invariant: "terminal-uniqueness.missing" })
        ]);
      }
    );

    it(
      "leaves the server healthy: a fresh unfaulted connection still runs this workflow to completion afterward",
      { timeout: 20000 },
      async () => {
        const journey = await load();
        await runWithFault(journey, faultName);
        const clean = await new WsServerDriver().run(journey);
        expect(clean.status).toBe("completed");
        expect(INVARIANT_CHECKS["terminal-uniqueness"](clean)).toEqual([]);
      }
    );
  });
});
