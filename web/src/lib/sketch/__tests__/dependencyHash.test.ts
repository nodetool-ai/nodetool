import { describe, expect, it } from "@jest/globals";
import { computeLayerDependencyHash } from "../dependencyHash";

describe("computeLayerDependencyHash", () => {
  const baseInput = {
    workflowId: "workflow-1",
    workflowUpdatedAt: "2026-05-05T14:00:00.000Z",
    paramOverrides: {
      prompt: "hello",
      steps: 25,
      nested: { b: 2, a: 1 }
    },
    inputAssetHashes: ["hash-z", "hash-a", "hash-m"]
  };

  it("returns a 16-char hex digest", () => {
    const h = computeLayerDependencyHash(baseInput);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for identical inputs", () => {
    expect(computeLayerDependencyHash(baseInput)).toBe(
      computeLayerDependencyHash(baseInput)
    );
  });

  it("is stable when param override keys are reordered", () => {
    const reordered = {
      ...baseInput,
      paramOverrides: {
        nested: { a: 1, b: 2 },
        steps: 25,
        prompt: "hello"
      }
    };
    expect(computeLayerDependencyHash(baseInput)).toBe(
      computeLayerDependencyHash(reordered)
    );
  });

  it("is stable when input asset hash order changes", () => {
    const reorderedAssets = {
      ...baseInput,
      inputAssetHashes: ["hash-m", "hash-z", "hash-a"]
    };
    expect(computeLayerDependencyHash(baseInput)).toBe(
      computeLayerDependencyHash(reorderedAssets)
    );
  });

  it("changes when workflowUpdatedAt changes", () => {
    expect(computeLayerDependencyHash(baseInput)).not.toBe(
      computeLayerDependencyHash({
        ...baseInput,
        workflowUpdatedAt: "2026-05-05T15:00:00.000Z"
      })
    );
  });

  it("changes when a param override value changes", () => {
    expect(computeLayerDependencyHash(baseInput)).not.toBe(
      computeLayerDependencyHash({
        ...baseInput,
        paramOverrides: { ...baseInput.paramOverrides, prompt: "world" }
      })
    );
  });

  it("changes when an input asset hash is added", () => {
    expect(computeLayerDependencyHash(baseInput)).not.toBe(
      computeLayerDependencyHash({
        ...baseInput,
        inputAssetHashes: [...baseInput.inputAssetHashes, "hash-new"]
      })
    );
  });

  it("keeps NaN, Infinity, -Infinity and null distinct", () => {
    const base = {
      workflowId: "w",
      workflowUpdatedAt: "t",
      inputAssetHashes: [] as string[]
    };
    const h = (cfg: unknown) =>
      computeLayerDependencyHash({ ...base, paramOverrides: { cfg } });

    expect(
      new Set([h(NaN), h(Infinity), h(-Infinity), h(null), h(0)]).size
    ).toBe(5);
  });

  it("keeps an undefined member distinct from null and from an absent key", () => {
    const base = {
      workflowId: "w",
      workflowUpdatedAt: "t",
      inputAssetHashes: [] as string[]
    };
    const hUndef = computeLayerDependencyHash({
      ...base,
      paramOverrides: { a: undefined }
    });
    const hNull = computeLayerDependencyHash({
      ...base,
      paramOverrides: { a: null }
    });
    const hAbsent = computeLayerDependencyHash({ ...base, paramOverrides: {} });

    expect(new Set([hUndef, hNull, hAbsent]).size).toBe(3);
  });
});
