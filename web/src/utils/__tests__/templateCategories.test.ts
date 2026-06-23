/**
 * @jest-environment node
 */
import {
  TOP_CATEGORIES,
  isGettingStarted,
  workflowsForCategory,
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

