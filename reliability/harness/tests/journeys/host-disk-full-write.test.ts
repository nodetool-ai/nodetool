/**
 * D3 done-when: journey `host-disk-full-write` — happy path writes
 * successfully through the kernel driver's default in-memory storage
 * adapter, and the `host-disk-full` fault (`faults/host-faults.ts`) makes the
 * same write fail with ENOSPC, ending the run in a sane failed terminal with
 * zero invariant violations. Kernel-surface only (see the journey's own
 * description for why the ws-server driver doesn't support this fault).
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../../src/core/journey.js";
import { INVARIANT_CHECKS } from "../../src/core/invariants/index.js";
import { KernelDriver } from "../../src/drivers/kernel.js";
import { getFaultModule } from "../../src/faults/registry.js";
import "../../src/faults/index.js";
import { runJourney } from "../../src/cli.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const JOURNEY_NAME = "host-disk-full-write";

async function load(): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, JOURNEY_NAME));
}

describe("journey host-disk-full-write (task D3)", () => {
  it("happy path: writes through the default in-memory storage adapter and completes", async () => {
    const journey = await load();
    const record = await new KernelDriver().run(journey);
    expect(record.status).toBe("completed");
    const violations = journey.manifest.assertions.invariants.flatMap((name) =>
      INVARIANT_CHECKS[name](record)
    );
    expect(violations).toEqual([]);
  });

  it("host-disk-full: the write fails with ENOSPC, run ends failed, zero violations", async () => {
    const journey = await load();
    const fault = journey.manifest.faults.find((f) => f.type === "host-disk-full");
    if (!fault) throw new Error("journey doesn't declare host-disk-full");
    const module = getFaultModule("host-disk-full");
    if (!module) throw new Error("no FaultModule registered for host-disk-full");

    const teardown = await module.configure({ journey, surface: "kernel", fault });
    let record;
    try {
      record = await new KernelDriver().run(journey);
    } finally {
      await teardown();
    }

    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/ENOSPC/);
    const violations = journey.manifest.assertions.invariants.flatMap((name) =>
      INVARIANT_CHECKS[name](record)
    );
    expect(violations).toEqual([]);
  });

  it("teardown actually restores the default adapter (no fault leaks into the next run)", async () => {
    const journey = await load();
    const fault = journey.manifest.faults.find((f) => f.type === "host-disk-full")!;
    const module = getFaultModule("host-disk-full")!;

    const teardown = await module.configure({ journey, surface: "kernel", fault });
    await new KernelDriver().run(journey);
    await teardown();

    const record = await new KernelDriver().run(journey);
    expect(record.status).toBe("completed");
  });

  it(
    "`nodetool reliability run host-disk-full-write --faults host-disk-full` reports the fault applied and a clean verdict",
    async () => {
      const report = await runJourney(JOURNEY_NAME, {
        journeysDir: JOURNEYS_DIR,
        surfaces: ["kernel"],
        faults: ["host-disk-full"]
      });
      expect(report.unknownFaults).toEqual([]);
      const kernel = report.surfaces.find((s) => s.surface === "kernel");
      expect(kernel?.faultsApplied).toEqual(["host-disk-full"]);
      expect(kernel?.status).toBe("failed");
      expect(kernel?.violations).toEqual([]);
      expect(report.verdict.ok).toBe(true);
    }
  );
});
