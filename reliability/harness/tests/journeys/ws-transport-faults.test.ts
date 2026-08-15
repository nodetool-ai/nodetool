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

/**
 * The manifest's `timeoutMs` serves two opposite purposes here. For
 * `ws-delay`/`ws-fragment` it is a completion budget — it must be generous,
 * because a run that is merely slow would otherwise read as a corrupted
 * stream. For the three black-hole faults it is dead time: the frame it waits
 * for is never coming, so every second of it is suite runtime spent on a known
 * answer. One number cannot be both, and the number that was there (4000ms)
 * was picked for the second job: a contended CI runner missed it on the very
 * first run in this file — the one that pays the QuickJS worker's cold start,
 * since `nodetool.text.ToUppercase` executes as a Code node — and reported
 * `"timeout"` for a transport that was fine. The manifest now declares the
 * completion budget every other pipeline journey declares, and the black-hole
 * cases shorten it for themselves.
 */
const BLACK_HOLE_TIMEOUT_MS = 4000;

function withTimeout(journey: Journey, timeoutMs: number): Journey {
  return { ...journey, manifest: { ...journey.manifest, timeoutMs } };
}

describe("journey ws-transport-faults (task D2)", () => {
  it("declares exactly the fault matrix this suite covers", async () => {
    const journey = await load();
    expect(journey.manifest.faults.map((f) => f.type).sort()).toEqual(
      ["ws-abrupt-close", "ws-delay", "ws-drop-no-fin", "ws-fragment", "ws-stall-reads"].sort()
    );
  });

  it(
    "ws-delay: completes normally, zero declared-invariant violations",
    // Above the journey's own budget, so a slow-but-correct run is reported as
    // the driver's "timeout" verdict rather than cut short by vitest first.
    { timeout: 45000 },
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
    { timeout: 45000 },
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
        const journey = withTimeout(await load(), BLACK_HOLE_TIMEOUT_MS);
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
      { timeout: 45000 },
      async () => {
        const journey = await load();
        // Only the faulted half is dead time. The clean run afterwards is the
        // assertion, so it keeps the journey's own completion budget.
        await runWithFault(withTimeout(journey, BLACK_HOLE_TIMEOUT_MS), faultName);
        const clean = await new WsServerDriver().run(journey);
        expect(clean.status).toBe("completed");
        expect(INVARIANT_CHECKS["terminal-uniqueness"](clean)).toEqual([]);
      }
    );
  });
});
