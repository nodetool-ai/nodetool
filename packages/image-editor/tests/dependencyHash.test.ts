import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeDependencyHash } from "../src/dependencyHash.js";

describe("computeDependencyHash", () => {
  const baseInput = {
    workflowId: "workflow-1",
    workflowUpdatedAt: "2026-05-05T14:00:00.000Z",
    paramOverrides: {
      prompt: "hello",
      steps: 25,
      nested: {
        b: 2,
        a: 1
      }
    },
    inputAssetHashes: ["hash-z", "hash-a", "hash-m"]
  };

  it("returns the same hash for the same input", () => {
    const first = computeDependencyHash(baseInput);
    const second = computeDependencyHash(baseInput);
    expect(first).toBe(second);
  });

  it("is stable when param override keys are reordered", () => {
    const reordered = {
      ...baseInput,
      paramOverrides: {
        nested: {
          a: 1,
          b: 2
        },
        steps: 25,
        prompt: "hello"
      }
    };

    expect(computeDependencyHash(baseInput)).toBe(computeDependencyHash(reordered));
  });

  it("is stable when input asset hash order changes", () => {
    const reorderedAssets = {
      ...baseInput,
      inputAssetHashes: ["hash-m", "hash-z", "hash-a"]
    };

    expect(computeDependencyHash(baseInput)).toBe(computeDependencyHash(reorderedAssets));
  });

  it("changes when workflowUpdatedAt changes", () => {
    const changedUpdatedAt = {
      ...baseInput,
      workflowUpdatedAt: "2026-05-05T15:00:00.000Z"
    };

    expect(computeDependencyHash(baseInput)).not.toBe(
      computeDependencyHash(changedUpdatedAt)
    );
  });

  it("hashes a payload prefixed with the version marker", () => {
    const normalizedPayload =
      '{"inputAssetHashes":["hash-a","hash-m","hash-z"],"paramOverrides":{"nested":{"a":1,"b":2},"prompt":"hello","steps":25},"workflowId":"workflow-1","workflowUpdatedAt":"2026-05-05T14:00:00.000Z"}';
    const expected = createHash("sha256")
      .update(`v1:${normalizedPayload}`, "utf8")
      .digest("hex");

    expect(computeDependencyHash(baseInput)).toBe(expected);
  });
});
