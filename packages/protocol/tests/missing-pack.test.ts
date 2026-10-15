import { describe, expect, it } from "vitest";
import { MissingPackError, missingPackDetailsOf, missingPackDetailsSchema, type MissingPackDetails } from "../src/missing-pack.js";
import { jobUpdateSchema } from "../src/messages.js";

const details: MissingPackDetails = { error: "missing_pack", packs: [{ id: "fal", npm: "@nodetool-ai/fal-nodes", version: "1.2.3", installBytes: 42, requires: [] }],
  runtimeLibraries: ["imaging"], nodeTypes: ["fal.Fixture"], install: { supported: true, reason: null, command: "nodetool packs add fal" }, restartRequired: false };

describe("missing pack transport", () => {
  it("recovers details from an error cause and from a serialized payload", () => {
    expect(missingPackDetailsOf(new Error("outer", { cause: new MissingPackError(details) }))).toEqual(details);
    expect(missingPackDetailsOf(JSON.parse(JSON.stringify(details)))).toEqual(details);
    const cycle = Object.assign(new Error("ordinary"), { cause: {} });
    cycle.cause = cycle;
    expect(missingPackDetailsOf(cycle)).toBeNull();
  });
  it("keeps details on a WebSocket job update and accepts the MCP restart marker", () => {
    expect(jobUpdateSchema.parse({ type: "job_update", status: "failed", missing_pack: details }).missing_pack).toEqual(details);
    expect(missingPackDetailsSchema.parse({ ...details, restartRequired: true }).restartRequired).toBe(true);
  });
  it("rejects malformed details instead of treating an ordinary failure as install-required", () => {
    expect(missingPackDetailsOf({ error: "missing_pack", packs: [] })).toBeNull();
  });
});
