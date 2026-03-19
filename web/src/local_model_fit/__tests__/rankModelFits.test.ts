import { rankModelFits } from "../rankModelFits";
import type { HardwareProfile, ModelCatalogEntry } from "../types";

const hw: HardwareProfile = {
  id: "rtx-3060",
  label: "RTX 3060",
  vramGb: 12,
  ramGb: 16,
  platform: "windows",
  detected: false,
};

const catalog: ModelCatalogEntry[] = [
  {
    id: "big-70b",
    name: "Big 70B",
    family: "Big",
    provider: "ollama",
    paramLabel: "70B",
    tags: ["chat"],
    paramsBillion: 70,
    activeParamsBillion: 70,
    contextLength: 131072,
    variants: [
      { id: "q4", label: "Q4", memoryGb: 40, bits: 4 },
    ],
  },
  {
    id: "small-1b",
    name: "Small 1B",
    family: "Small",
    provider: "ollama",
    paramLabel: "1B",
    tags: ["chat"],
    paramsBillion: 1,
    activeParamsBillion: 1,
    contextLength: 8192,
    variants: [
      { id: "q4", label: "Q4", memoryGb: 0.8, bits: 4 },
      { id: "q8", label: "Q8", memoryGb: 1.3, bits: 8 },
    ],
  },
];

describe("rankModelFits", () => {
  it("returns one result per (entry, variant) pair", () => {
    const results = rankModelFits(catalog, hw);
    // 1 variant for big + 2 variants for small = 3
    expect(results).toHaveLength(3);
  });

  it("sorts by score descending (best first)", () => {
    const results = rankModelFits(catalog, hw);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("places fitting models before non-fitting in practice", () => {
    const results = rankModelFits(catalog, hw);
    const smallIdx = results.findIndex((r) => r.modelId === "small-1b");
    const bigIdx = results.findIndex((r) => r.modelId === "big-70b");
    expect(smallIdx).toBeLessThan(bigIdx);
  });
});
