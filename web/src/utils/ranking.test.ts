import {
  searchTermsFromQuery,
  scoreItem,
  rank,
  type RankConfig,
  type RankField
} from "./ranking";

describe("searchTermsFromQuery", () => {
  it("returns empty array for empty string", () => {
    expect(searchTermsFromQuery("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(searchTermsFromQuery("   ")).toEqual([]);
  });

  it("returns the full query as the first term", () => {
    const terms = searchTermsFromQuery("image resize");
    expect(terms[0]).toBe("image resize");
  });

  it("includes individual words as separate terms", () => {
    const terms = searchTermsFromQuery("image resize");
    expect(terms).toContain("image");
    expect(terms).toContain("resize");
  });

  it("deduplicates single-word queries", () => {
    const terms = searchTermsFromQuery("image");
    expect(terms).toEqual(["image"]);
  });

  it("splits on commas", () => {
    const terms = searchTermsFromQuery("alpha,beta");
    expect(terms).toContain("alpha");
    expect(terms).toContain("beta");
  });
});

interface TestItem {
  key: string;
  title: string;
  description: string;
}

const fields: ReadonlyArray<RankField<TestItem>> = [
  { get: (item) => item.title, weight: 4 },
  { get: (item) => item.description, weight: 1 }
];

const baseConfig: RankConfig<TestItem> = {
  fields,
  keyFn: (item) => item.key
};

const item = (key: string, title: string, description = ""): TestItem => ({
  key,
  title,
  description
});

describe("scoreItem", () => {
  it("returns 0 for empty terms", () => {
    expect(scoreItem(item("a", "hello"), [], baseConfig)).toBe(0);
  });

  it("returns 0 when no fields match", () => {
    expect(scoreItem(item("a", "hello"), ["xyz"], baseConfig)).toBe(0);
  });

  it("scores substring matches using field weight", () => {
    const score = scoreItem(item("a", "hello world"), ["hello"], baseConfig);
    expect(score).toBeGreaterThan(0);
  });

  it("gives exact token match a bonus over substring", () => {
    const exactScore = scoreItem(
      item("a", "image resize"),
      ["image"],
      baseConfig
    );
    const substringScore = scoreItem(
      item("b", "imagery resize"),
      ["image"],
      baseConfig
    );
    expect(exactScore).toBeGreaterThan(substringScore);
  });

  it("applies multiplier", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      multiplier: () => 2
    };
    const normal = scoreItem(item("a", "test"), ["test"], baseConfig);
    const boosted = scoreItem(item("a", "test"), ["test"], config);
    expect(boosted).toBe(normal * 2);
  });

  it("returns 0 when prefilter rejects the item", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      prefilter: () => false
    };
    expect(scoreItem(item("a", "hello"), ["hello"], config)).toBe(0);
  });
});

describe("rank", () => {
  const items = [
    item("a", "image resize", "resize images quickly"),
    item("b", "text output", "output text values"),
    item("c", "image filter", "apply filters to images")
  ];

  it("returns empty when no items match", () => {
    expect(rank(items, ["zzzzz"], baseConfig)).toEqual([]);
  });

  it("sorts by score descending", () => {
    const results = rank(items, ["image"], baseConfig);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("filters out items that fail prefilter", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      prefilter: (it) => it.key !== "b"
    };
    const results = rank(items, ["output"], config);
    expect(results.find((r) => r.item.key === "b")).toBeUndefined();
  });

  it("applies recent keys bonus", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      recentKeys: ["b"]
    };
    const withoutRecent = rank(items, ["output"], baseConfig);
    const withRecent = rank(items, ["output"], config);
    const bWithout = withoutRecent.find((r) => r.item.key === "b")!;
    const bWith = withRecent.find((r) => r.item.key === "b")!;
    expect(bWith.score).toBeGreaterThan(bWithout.score);
  });

  it("applies boosted keys bonus", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      boostedKeys: ["c"]
    };
    const results = rank(items, ["image"], config);
    const cResult = results.find((r) => r.item.key === "c")!;
    const normalC = rank(items, ["image"], baseConfig).find(
      (r) => r.item.key === "c"
    )!;
    expect(cResult.score).toBeGreaterThan(normalC.score);
  });

  it("applies candidate boosts from a Map", () => {
    const boosts = new Map([["b", 100]]);
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      candidateBoosts: boosts,
      includeCandidateOnlyMatches: true
    };
    const results = rank(items, ["nonexistent"], config);
    expect(results.length).toBe(1);
    expect(results[0].item.key).toBe("b");
  });

  it("applies candidate boosts from a plain object", () => {
    const config: RankConfig<TestItem> = {
      ...baseConfig,
      candidateBoosts: { a: 50 },
      includeCandidateOnlyMatches: true
    };
    const results = rank(items, ["nonexistent"], config);
    expect(results[0].item.key).toBe("a");
  });

  it("breaks ties with keyFn lexicographic order by default", () => {
    const tied = [
      item("b_item", "same"),
      item("a_item", "same")
    ];
    const results = rank(tied, ["same"], baseConfig);
    expect(results[0].item.key).toBe("a_item");
    expect(results[1].item.key).toBe("b_item");
  });
});
