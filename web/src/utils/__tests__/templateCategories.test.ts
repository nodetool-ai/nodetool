/**
 * @jest-environment node
 */
import {
  TOP_CATEGORIES,
  GETTING_STARTED_TAGS,
  isGettingStarted,
  matchesCategory,
  workflowsForCategory,
  overflowTagsWithCounts,
  categoryCounts,
} from "../templateCategories";
import type { Workflow } from "../../stores/ApiTypes";

const makeWorkflow = (tags: string[], name = "Test"): Workflow =>
  ({
    id: `wf-${name}`,
    name,
    description: "",
    tags,
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  }) as Workflow;

describe("TOP_CATEGORIES", () => {
  it("is a non-empty array", () => {
    expect(TOP_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("each category has id, label, and tags", () => {
    for (const cat of TOP_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.tags.length).toBeGreaterThan(0);
    }
  });
});

describe("isGettingStarted", () => {
  it("returns true for workflows with getting-started tag", () => {
    expect(isGettingStarted(makeWorkflow(["getting-started"]))).toBe(true);
  });

  it("returns true for workflows with start tag", () => {
    expect(isGettingStarted(makeWorkflow(["start"]))).toBe(true);
  });

  it("returns false for workflows without getting-started tags", () => {
    expect(isGettingStarted(makeWorkflow(["image", "video"]))).toBe(false);
  });

  it("returns false for workflows with no tags", () => {
    expect(isGettingStarted(makeWorkflow([]))).toBe(false);
  });

  it("handles workflow with null/undefined tags", () => {
    const wf = makeWorkflow([]);
    (wf as unknown as Record<string, unknown>).tags = undefined;
    expect(isGettingStarted(wf)).toBe(false);
  });
});

describe("matchesCategory", () => {
  const imageCategory = TOP_CATEGORIES.find((c) => c.id === "image")!;

  it("returns true when workflow has a matching tag", () => {
    expect(matchesCategory(makeWorkflow(["image"]), imageCategory)).toBe(true);
  });

  it("returns false when no tags match", () => {
    expect(matchesCategory(makeWorkflow(["audio"]), imageCategory)).toBe(false);
  });

  it("returns false for empty tags", () => {
    expect(matchesCategory(makeWorkflow([]), imageCategory)).toBe(false);
  });
});

describe("workflowsForCategory", () => {
  const workflows = [
    makeWorkflow(["image"], "img1"),
    makeWorkflow(["image", "design"], "img2"),
    makeWorkflow(["video"], "vid1"),
    makeWorkflow(["audio"], "aud1"),
  ];

  it("returns workflows matching the category", () => {
    const result = workflowsForCategory(workflows, "image");
    expect(result.length).toBe(2);
  });

  it("returns empty array for unknown category", () => {
    expect(workflowsForCategory(workflows, "nonexistent")).toEqual([]);
  });

  it("returns workflows for video category", () => {
    const result = workflowsForCategory(workflows, "video");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("vid1");
  });
});

describe("overflowTagsWithCounts", () => {
  it("excludes tags that belong to top categories", () => {
    const grouped: Record<string, Workflow[]> = {
      image: [makeWorkflow(["image"]), makeWorkflow(["image"])],
      "custom-tag": [makeWorkflow(["custom-tag"]), makeWorkflow(["custom-tag"])],
    };
    const result = overflowTagsWithCounts(grouped);
    expect(result.find((r) => r.tag === "image")).toBeUndefined();
    expect(result.find((r) => r.tag === "custom-tag")).toBeDefined();
  });

  it("excludes hidden tags (getting-started, start)", () => {
    const grouped: Record<string, Workflow[]> = {
      "getting-started": [makeWorkflow([]), makeWorkflow([])],
      start: [makeWorkflow([]), makeWorkflow([])],
      other: [makeWorkflow([]), makeWorkflow([])],
    };
    const result = overflowTagsWithCounts(grouped);
    expect(result.find((r) => r.tag === "getting-started")).toBeUndefined();
    expect(result.find((r) => r.tag === "start")).toBeUndefined();
  });

  it("excludes tags with fewer than 2 workflows", () => {
    const grouped: Record<string, Workflow[]> = {
      rare: [makeWorkflow([])],
      common: [makeWorkflow([]), makeWorkflow([])],
    };
    const result = overflowTagsWithCounts(grouped);
    expect(result.find((r) => r.tag === "rare")).toBeUndefined();
    expect(result.find((r) => r.tag === "common")).toBeDefined();
  });

  it("sorts by count descending, then alphabetically", () => {
    const grouped: Record<string, Workflow[]> = {
      beta: [makeWorkflow([]), makeWorkflow([]), makeWorkflow([])],
      alpha: [makeWorkflow([]), makeWorkflow([]), makeWorkflow([])],
      gamma: [makeWorkflow([]), makeWorkflow([])],
    };
    const result = overflowTagsWithCounts(grouped);
    expect(result[0].tag).toBe("alpha");
    expect(result[1].tag).toBe("beta");
    expect(result[2].tag).toBe("gamma");
  });
});

describe("categoryCounts", () => {
  it("returns counts for each top category", () => {
    const workflows = [
      makeWorkflow(["image"]),
      makeWorkflow(["image"]),
      makeWorkflow(["video"]),
    ];
    const counts = categoryCounts(workflows);
    expect(counts["image"]).toBe(2);
    expect(counts["video"]).toBe(1);
  });

  it("returns 0 for categories with no matches", () => {
    const counts = categoryCounts([]);
    for (const cat of TOP_CATEGORIES) {
      expect(counts[cat.id]).toBe(0);
    }
  });
});
