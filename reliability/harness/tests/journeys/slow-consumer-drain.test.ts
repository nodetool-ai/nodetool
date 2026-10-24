/**
 * Journey `slow-consumer-drain`: the `client-slow-consumer` fault holds every
 * message in the kernel driver's pump, so the run closes its message stream
 * while the consumer still holds one. Every message must still arrive, and
 * the outputs golden is compared because the fault preserves the outcome.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { runJourney } from "../../src/cli.js";
import { getInjectedConsumerDelayMs } from "../../src/faults/client-faults.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const JOURNEY_NAME = "slow-consumer-drain";

describe("journey slow-consumer-drain", () => {
  it(
    "delivers the terminal job_update and outputs to a slow kernel consumer",
    { timeout: 30000 },
    async () => {
      const report = await runJourney(JOURNEY_NAME, {
        journeysDir: JOURNEYS_DIR,
        surfaces: ["kernel"]
      });
      const kernel = report.surfaces.find((s) => s.surface === "kernel");
      expect(kernel?.faultsApplied).toEqual(["client-slow-consumer"]);
      expect(kernel?.status).toBe("completed");
      expect(kernel?.violations).toEqual([]);
      expect(kernel?.goldens).toEqual([
        { kind: "outputs", checked: true, failures: [] }
      ]);
      expect(report.verdict.ok).toBe(true);
    }
  );

  it(
    "matches the unfaulted ws-server stream and restores the pump afterwards",
    { timeout: 30000 },
    async () => {
      const report = await runJourney(JOURNEY_NAME, { journeysDir: JOURNEYS_DIR });
      const ws = report.surfaces.find((s) => s.surface === "ws-server");
      expect(ws?.faultsApplied).toEqual([]);
      expect(ws?.diffVsOracleEmpty).toBe(true);
      expect(report.verdict.ok, report.verdict.issues.join("; ")).toBe(true);
      expect(getInjectedConsumerDelayMs()).toBeNull();
    }
  );
});
