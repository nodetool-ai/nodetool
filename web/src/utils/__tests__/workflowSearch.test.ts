import Fuse from "fuse.js";
import { Workflow } from "../../stores/ApiTypes";
import { searchWorkflowsWithFuse } from "../workflowSearch";

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Untitled",
    description: "",
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    graph: { nodes: [], edges: [] },
    ...overrides
  } as Workflow;
}

const workflows: Workflow[] = [
  makeWorkflow({ id: "wf-1", name: "Image Generator", description: "Creates images from text prompts" }),
  makeWorkflow({ id: "wf-2", name: "Text Summarizer", description: "Summarizes long text" }),
  makeWorkflow({ id: "wf-3", name: "Audio Processor", description: "Processes audio files" })
];

function buildFuse(items: Workflow[]): Fuse<Workflow> {
  return new Fuse(items, {
    includeScore: true,
    includeMatches: true,
    threshold: 0.1,
    distance: 100,
    minMatchCharLength: 2,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 2 },
      { name: "description", weight: 1 }
    ]
  });
}

describe("searchWorkflowsWithFuse", () => {
  it("returns all workflows with fuseScore 1 when query is empty", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "");
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.fuseScore).toBe(1);
      expect(r.matches).toEqual([]);
    });
  });

  it("returns all workflows when query is only whitespace", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "   ");
    expect(results).toHaveLength(3);
  });

  it("returns matching workflows for a name query", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "Image");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].workflow.name).toBe("Image Generator");
  });

  it("returns matching workflows for a description query", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "audio");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.workflow.id === "wf-3")).toBe(true);
  });

  it("returns empty array when nothing matches", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "zzzznotfound");
    expect(results).toHaveLength(0);
  });

  it("returns fuseScore between 0 and 1 for matches", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "Text");
    for (const r of results) {
      expect(r.fuseScore).toBeGreaterThanOrEqual(0);
      expect(r.fuseScore).toBeLessThanOrEqual(1);
    }
  });

  it("populates matches array for results", () => {
    const fuse = buildFuse(workflows);
    const results = searchWorkflowsWithFuse(fuse, workflows, "Summarizer");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results[0];
    expect(match.matches.length).toBeGreaterThanOrEqual(1);
    match.matches.forEach((m) => {
      expect(typeof m.text).toBe("string");
      expect(m.text.length).toBeGreaterThan(0);
    });
  });

  it("works with empty workflow list", () => {
    const fuse = buildFuse([]);
    const results = searchWorkflowsWithFuse(fuse, [], "test");
    expect(results).toHaveLength(0);
  });

  it("returns all workflows for empty query even when list is empty", () => {
    const fuse = buildFuse([]);
    const results = searchWorkflowsWithFuse(fuse, [], "");
    expect(results).toHaveLength(0);
  });
});
