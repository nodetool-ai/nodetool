/**
 * Journey #10, provider half (docs/RELIABILITY_ARCHITECTURE.md §5, item 10;
 * task D1 step 4): "concurrent jobs where one provider call fails mid-stream
 * while a sibling job streams successfully — assert isolation."
 *
 * There is no dedicated `reliability/journeys/<name>/` directory for this —
 * the journey format (`core/journey.ts`) is one workflow per directory, and
 * isolation is inherently a two-job property, so this runs
 * `provider-failure-mid-stream` (journey 8, faulted) concurrently with
 * `linear-text-pipeline` (journey 1, unfaulted) on two independent
 * `KernelDriver` instances and asserts neither job's `RunRecord` leaks into
 * the other's: the failing job's terminal is `failed` with the fault's own
 * error and passes its own invariants; the sibling's terminal is `completed`,
 * carries none of the fault's error text, and passes its own invariants too.
 *
 * The queue-slot half of journey 10 (`MAX_CONCURRENT_JOBS` queuing/draining,
 * `startingJobs`→`activeJobs` handoff) needs the WS runner's real job queue —
 * out of scope for D1 (it belongs to the ws-server/packaged drivers' own
 * concurrency story, not the provider seam) and is left for whichever task
 * picks up journey 10's queue half.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../../src/core/journey.js";
import { INVARIANT_CHECKS } from "../../src/core/invariants/index.js";
import { KernelDriver } from "../../src/drivers/kernel.js";
import { getFaultModule } from "../../src/faults/registry.js";
import "../../src/faults/index.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");

async function load(name: string): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, name));
}

describe("journey 10 (provider half): concurrent jobs isolate a provider fault", () => {
  it(
    "a failing job's fault never leaks into a concurrently-running sibling job's record",
    { timeout: 30000 },
    async () => {
      const faultedJourney = await load("provider-failure-mid-stream");
      const cleanJourney = await load("linear-text-pipeline");

      const fault = faultedJourney.manifest.faults.find((f) => f.type === "provider-500")!;
      const module = getFaultModule("provider-500")!;
      const teardown = await module.configure({
        journey: faultedJourney,
        surface: "kernel",
        fault
      });

      let faultedRecord;
      let cleanRecord;
      try {
        // Both jobs run concurrently against independent ExecutionSessions
        // (two fresh KernelDriver instances, each with its own registry) —
        // the fault is scoped to the "reliability-fault-llm" provider id,
        // which the clean journey's workflow never references.
        [faultedRecord, cleanRecord] = await Promise.all([
          new KernelDriver().run(faultedJourney),
          new KernelDriver().run(cleanJourney)
        ]);
      } finally {
        await teardown();
      }

      // The faulted job actually failed, with the fault's own error.
      expect(faultedRecord.status).toBe("failed");
      expect(faultedRecord.error).toMatch(/500/);
      const faultedViolations = faultedJourney.manifest.assertions.invariants.flatMap(
        (name) => INVARIANT_CHECKS[name](faultedRecord)
      );
      expect(faultedViolations).toEqual([]);

      // The sibling completed normally and carries no trace of the fault.
      expect(cleanRecord.status).toBe("completed");
      expect(cleanRecord.error).toBeNull();
      const cleanRecordText = JSON.stringify(cleanRecord.frames);
      expect(cleanRecordText).not.toMatch(/CassetteProvider fault/);
      expect(cleanRecordText).not.toContain("reliability-fault-llm");
      const cleanViolations = cleanJourney.manifest.assertions.invariants.flatMap(
        (name) => INVARIANT_CHECKS[name](cleanRecord)
      );
      expect(cleanViolations).toEqual([]);

      // Distinct jobs, never conflated.
      expect(faultedRecord.jobId).not.toBe(cleanRecord.jobId);
    }
  );
});
