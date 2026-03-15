import { computeTierCounts, bestAvailableTier, oneLinerSummary, TIER_ORDER } from "../summaries";
import type { RankedModelFit } from "../types";

const makeResult = (overrides: Partial<RankedModelFit>): RankedModelFit => ({
  id: "id",
  modelId: "model",
  variantId: "q4",
  name: "Model",
  provider: "ollama",
  family: "Family",
  tags: ["chat"],
  memoryGb: 4,
  memoryPercent: 50,
  contextLength: 8192,
  fitLabel: "Good",
  tier: "B",
  score: 65,
  fits: true,
  ...overrides,
});

const results: RankedModelFit[] = [
  makeResult({ tier: "S", fits: true }),
  makeResult({ tier: "S", fits: true }),
  makeResult({ tier: "A", fits: true }),
  makeResult({ tier: "F", fits: false }),
];

describe("computeTierCounts", () => {
  it("counts by tier", () => {
    const counts = computeTierCounts(results);
    expect(counts.S).toBe(2);
    expect(counts.A).toBe(1);
    expect(counts.B).toBe(0);
    expect(counts.F).toBe(1);
    expect(counts.total).toBe(4);
    expect(counts.fitting).toBe(3);
  });

  it("returns zeros for empty input", () => {
    const counts = computeTierCounts([]);
    expect(counts.total).toBe(0);
    expect(counts.fitting).toBe(0);
  });
});

describe("bestAvailableTier", () => {
  it("returns the best tier present", () => {
    expect(bestAvailableTier(results)).toBe("S");
  });

  it("returns null for empty array", () => {
    expect(bestAvailableTier([])).toBeNull();
  });
});

describe("oneLinerSummary", () => {
  it("includes fitting count and best tier", () => {
    const summary = oneLinerSummary(results);
    expect(summary).toContain("3 models fit");
    expect(summary).toContain("tier S");
  });

  it("handles empty input", () => {
    expect(oneLinerSummary([])).toBe("No models in catalog");
  });

  it("handles no-fit case", () => {
    const noFit = [makeResult({ tier: "F", fits: false })];
    expect(oneLinerSummary(noFit)).toBe("No models fit this hardware");
  });
});

describe("TIER_ORDER", () => {
  it("has 6 tiers from S to F", () => {
    expect(TIER_ORDER).toEqual(["S", "A", "B", "C", "D", "F"]);
  });
});
