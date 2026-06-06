/**
 * @jest-environment node
 */
import { rank, scoreItem, searchTermsFromQuery, type RankConfig } from "../ranking";

type Item = {
  id: string;
  name: string;
  description?: string;
  kind?: string;
};

const baseConfig: RankConfig<Item> = {
  fields: [
    { get: (i) => i.name, weight: 6 },
    { get: (i) => i.id, weight: 4 },
    { get: (i) => i.description, weight: 1 }
  ],
  keyFn: (i) => i.id
};

const items: Item[] = [
  { id: "alpha", name: "Alpha", description: "the first one" },
  { id: "beta", name: "Beta", description: "the second one" },
  { id: "gamma", name: "Gamma", description: "the third one" }
];

describe("searchTermsFromQuery", () => {
  it("returns empty for whitespace", () => {
    expect(searchTermsFromQuery("")).toEqual([]);
    expect(searchTermsFromQuery("   ")).toEqual([]);
  });

  it("includes the full query and individual tokens", () => {
    const terms = searchTermsFromQuery("hello world");
    expect(terms).toContain("hello world");
    expect(terms).toContain("hello");
    expect(terms).toContain("world");
  });

  it("deduplicates", () => {
    const terms = searchTermsFromQuery("foo");
    expect(terms).toEqual(["foo"]);
  });
});

describe("scoreItem", () => {
  it("returns 0 when no terms", () => {
    expect(scoreItem(items[0], [], baseConfig)).toBe(0);
  });

  it("scores name matches higher than description matches", () => {
    const nameMatch = scoreItem(items[0], ["alpha"], baseConfig);
    const descMatch = scoreItem(items[0], ["first"], baseConfig);
    expect(nameMatch).toBeGreaterThan(descMatch);
  });

  it("applies the per-item multiplier", () => {
    const cfg: RankConfig<Item> = {
      ...baseConfig,
      multiplier: (i) => (i.kind === "core" ? 2 : 1)
    };
    const normal = scoreItem({ ...items[0] }, ["alpha"], cfg);
    const boosted = scoreItem({ ...items[0], kind: "core" }, ["alpha"], cfg);
    expect(boosted).toBe(normal * 2);
  });

  it("respects the prefilter", () => {
    const cfg: RankConfig<Item> = {
      ...baseConfig,
      prefilter: (i) => i.id !== "alpha"
    };
    expect(scoreItem(items[0], ["alpha"], cfg)).toBe(0);
    expect(scoreItem(items[1], ["beta"], cfg)).toBeGreaterThan(0);
  });

  it("gives exact-subtoken matches an extra bonus", () => {
    const item: Item = { id: "x", name: "image to image" };
    const cfg: RankConfig<Item> = {
      ...baseConfig,
      fields: [{ get: (i) => i.name, weight: 6 }]
    };
    // "image" is an exact subtoken → weight*(1 + exactTokenBonus)
    expect(scoreItem(item, ["image"], cfg)).toBe(6 + 6 * 2);
    // "mage" is a substring but not a subtoken → just weight
    expect(scoreItem(item, ["mage"], cfg)).toBe(6);
  });
});

describe("rank", () => {
  it("returns only items that match the terms, sorted by score", () => {
    const terms = searchTermsFromQuery("alpha");
    const results = rank(items, terms, baseConfig);
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe("alpha");
  });

  it("returns all items (after prefilter) when no terms", () => {
    const results = rank(items, [], baseConfig);
    expect(results.length).toBe(3);
  });

  it("boosts recent items", () => {
    const terms = searchTermsFromQuery("the");
    const without = rank(items, terms, baseConfig);
    const with_ = rank(items, terms, {
      ...baseConfig,
      recentKeys: ["gamma"]
    });
    const gammaWithout = without.find((r) => r.item.id === "gamma")!;
    const gammaWith = with_.find((r) => r.item.id === "gamma")!;
    expect(gammaWith.score).toBeGreaterThan(gammaWithout.score);
  });

  it("boosts curated/boosted items", () => {
    const terms = searchTermsFromQuery("the");
    const without = rank(items, terms, baseConfig);
    const with_ = rank(items, terms, {
      ...baseConfig,
      boostedKeys: ["beta"]
    });
    const betaWithout = without.find((r) => r.item.id === "beta")!;
    const betaWith = with_.find((r) => r.item.id === "beta")!;
    expect(betaWith.score).toBeGreaterThan(betaWithout.score);
  });

  it("applies candidate boosts", () => {
    const terms = searchTermsFromQuery("alpha");
    const results = rank(items, terms, {
      ...baseConfig,
      candidateBoosts: new Map([["beta", 100]]),
      includeCandidateOnlyMatches: true
    });
    expect(results[0].item.id).toBe("beta");
  });

  it("excludes candidate-only matches when the flag is off", () => {
    const terms = searchTermsFromQuery("alpha");
    const results = rank(items, terms, {
      ...baseConfig,
      candidateBoosts: new Map([["beta", 100]])
    });
    expect(results.map((r) => r.item.id)).toEqual(["alpha"]);
  });

  it("uses the supplied tie-break", () => {
    const results = rank(items, [], {
      ...baseConfig,
      tieBreak: (a, b) => b.name.localeCompare(a.name)
    });
    expect(results.map((r) => r.item.id)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("recency bonus decays with index", () => {
    const cfg: RankConfig<Item> = {
      ...baseConfig,
      recentKeys: ["alpha", "beta", "gamma"]
    };
    const results = rank(items, [], cfg);
    // alpha is most recent → highest recency bonus
    expect(results[0].item.id).toBe("alpha");
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });
});
