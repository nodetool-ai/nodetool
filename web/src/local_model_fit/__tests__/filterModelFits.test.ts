import {
  filterBySearch,
  filterByTags,
  filterByFamilies,
  filterByTiers,
  filterByFits,
} from "../filterModelFits";
import type { RankedModelFit } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
  makeResult({ id: "a", name: "Alpha Model", family: "Llama", tags: ["chat", "code"], tier: "S", score: 95, fits: true }),
  makeResult({ id: "b", name: "Beta Model", family: "Qwen", tags: ["code"], tier: "A", score: 80, fits: true }),
  makeResult({ id: "c", name: "Gamma Model", family: "Llama", tags: ["vision"], tier: "D", score: 25, fits: true }),
  makeResult({ id: "d", name: "Delta Model", family: "DeepSeek", tags: ["chat"], tier: "F", score: 5, fits: false }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filterBySearch", () => {
  it("returns all results for empty query", () => {
    expect(filterBySearch(results, "")).toHaveLength(4);
  });

  it("filters by name (case insensitive)", () => {
    expect(filterBySearch(results, "alpha")).toHaveLength(1);
  });

  it("filters by family", () => {
    expect(filterBySearch(results, "qwen")).toHaveLength(1);
  });

  it("filters by tag", () => {
    expect(filterBySearch(results, "vision")).toHaveLength(1);
  });
});

describe("filterByTags", () => {
  it("returns all when no tags selected", () => {
    expect(filterByTags(results, [])).toHaveLength(4);
  });

  it("keeps entries that have any of the selected tags", () => {
    expect(filterByTags(results, ["code"])).toHaveLength(2); // a + b
  });

  it("is case-insensitive", () => {
    expect(filterByTags(results, ["CHAT"])).toHaveLength(2); // a + d
  });
});

describe("filterByFamilies", () => {
  it("returns all when no families selected", () => {
    expect(filterByFamilies(results, [])).toHaveLength(4);
  });

  it("filters to matching families", () => {
    expect(filterByFamilies(results, ["Llama"])).toHaveLength(2);
  });
});

describe("filterByTiers", () => {
  it("returns all when no tiers selected", () => {
    expect(filterByTiers(results, [])).toHaveLength(4);
  });

  it("keeps only entries in selected tiers", () => {
    expect(filterByTiers(results, ["S", "A"])).toHaveLength(2);
  });
});

describe("filterByFits", () => {
  it("returns all when fitsOnly is false", () => {
    expect(filterByFits(results, false)).toHaveLength(4);
  });

  it("removes non-fitting entries when fitsOnly is true", () => {
    const filtered = filterByFits(results, true);
    expect(filtered).toHaveLength(3);
    expect(filtered.every((r) => r.fits)).toBe(true);
  });
});
