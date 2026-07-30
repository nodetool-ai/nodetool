/**
 * `CliDriver` integration test — spawns the real `nodetool debug` command via
 * `tsx` against the checked-out source. Slower than the in-process drivers
 * (a fresh Node process + DB init per run), so it gets a generous timeout.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney } from "../../src/core/journey.js";
import { CliDriver, cliDriverSupports } from "../../src/drivers/cli.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");

describe("CliDriver", () => {
  it(
    "runs linear-text-pipeline via the real nodetool debug command",
    { timeout: 60_000 },
    async () => {
      const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
      const record = await new CliDriver().run(journey);
      expect(record.surface).toBe("cli");
      expect(record.status).toBe("completed");
      expect(record.error).toBeNull();
      expect(record.frames.length).toBeGreaterThan(0);
      const outputFrame = record.frames.find(
        (f) => (f.message as Record<string, unknown>)["type"] === "job_update"
      );
      expect(outputFrame).toBeDefined();
    }
  );

  it("supports() rejects scripted (non-single-run) journeys", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "mid-run-cancel-node"));
    expect(cliDriverSupports(journey)).toBe(false);
    await expect(new CliDriver().run(journey)).rejects.toThrow(/only supports a single/);
  });
});
