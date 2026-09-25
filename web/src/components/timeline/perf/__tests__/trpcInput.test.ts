import { describe, expect, it } from "@jest/globals";
import { readTrpcBatchId } from "../trpcInput";

describe("timeline perf tRPC fixture input", () => {
  it("reads the current unwrapped HTTP batch input", () => {
    expect(readTrpcBatchId({ "0": { id: "timeline-perf-l0" } }, 0)).toBe(
      "timeline-perf-l0"
    );
  });

  it("also accepts wrapped JSON batch input", () => {
    expect(readTrpcBatchId({ "1": { json: { id: "asset-1" } } }, 1)).toBe(
      "asset-1"
    );
  });

  it("rejects malformed input", () => {
    expect(readTrpcBatchId([], 0)).toBeUndefined();
    expect(readTrpcBatchId({ "0": { id: 1 } }, 0)).toBeUndefined();
  });
});
