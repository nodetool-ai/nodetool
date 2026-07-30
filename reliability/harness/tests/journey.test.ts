import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  JourneyValidationError,
  loadJourney,
  parseJourneyManifest
} from "../src/core/journey.js";

const SEED_JOURNEY_DIR = resolve(
  __dirname,
  "../../journeys/linear-text-pipeline"
);

describe("loadJourney", () => {
  it("accepts the seed journey (linear-text-pipeline)", async () => {
    const journey = await loadJourney(SEED_JOURNEY_DIR);
    expect(journey.manifest.name).toBe("linear-text-pipeline");
    expect(journey.manifest.surfaces).toContain("kernel");
    expect(journey.workflow.nodes).toBeInstanceOf(Array);
    expect(journey.interactions).toEqual([{ action: "run" }]);
    expect(journey.expected.outputs).toEqual({ result: "HELLO RELIABILITY" });
    expect(journey.expected.streamShape).not.toBeNull();
  });

  it("rejects a journey that asserts nothing beyond completed", async () => {
    await expect(
      loadJourney(resolve(__dirname, "fixtures/assert-nothing-journey"))
    ).rejects.toThrow(/asserts nothing beyond "completed"/);
  });

  it("rejects a malformed manifest (schema failure)", async () => {
    await expect(
      loadJourney(resolve(__dirname, "fixtures/malformed-journey"))
    ).rejects.toThrow(JourneyValidationError);
  });

  it("rejects a manifest with no journey.json", async () => {
    await expect(
      loadJourney(resolve(__dirname, "fixtures/does-not-exist"))
    ).rejects.toThrow(/no journey\.json/);
  });
});

describe("parseJourneyManifest", () => {
  it("accepts a manifest that declares only invariants", () => {
    const manifest = parseJourneyManifest({
      name: "x",
      workflow: { ref: "workflow.json" },
      surfaces: ["kernel"],
      assertions: { invariants: ["lifecycle-pairing"] }
    });
    expect(manifest.assertions.invariants).toEqual(["lifecycle-pairing"]);
  });

  it("accepts a manifest that declares only outputs", () => {
    const manifest = parseJourneyManifest({
      name: "x",
      workflow: { ref: "workflow.json" },
      surfaces: ["kernel"],
      assertions: { outputs: true }
    });
    expect(manifest.assertions.outputs).toBe(true);
  });

  it("rejects a manifest that asserts nothing", () => {
    expect(() =>
      parseJourneyManifest({
        name: "x",
        workflow: { ref: "workflow.json" },
        surfaces: ["kernel"],
        assertions: {}
      })
    ).toThrow(JourneyValidationError);
  });
});
