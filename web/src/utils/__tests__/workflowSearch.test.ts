import Fuse from "fuse.js";
import { searchWorkflowsWithFuse } from "../workflowSearch";
import { Workflow } from "../../stores/ApiTypes";

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "",
    access: "private",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    graph: { nodes: [], edges: [] },
    ...overrides
  } as Workflow;
}

describe("searchWorkflowsWithFuse", () => {
  const workflows = [
    makeWorkflow({
      id: "1",
      name: "Image Generator",
      description: "Creates images from text"
    }),
    makeWorkflow({
      id: "2",
      name: "Text Summarizer",
      description: "Summarizes long documents"
    }),
    makeWorkflow({
      id: "3",
      name: "Audio Transcriber",
      description: "Converts speech to text"
    })
  ];

  const fuse = new Fuse(workflows, {
    keys: [
      { name: "name", weight: 2 },
      { name: "description", weight: 1 }
    ],
    includeScore: true,
    includeMatches: true,
    threshold: 0.1
  });

  it("returns all workflows with fuseScore 1 when query is empty", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "");
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.fuseScore).toBe(1);
      expect(r.matches).toEqual([]);
    });
  });

  it("returns all workflows when query is only whitespace", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "   ");
    expect(results).toHaveLength(3);
  });

  it("filters workflows matching the query by name", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "image");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].workflow.name).toBe("Image Generator");
  });

  it("matches workflows by description", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "speech");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].workflow.id).toBe("3");
  });

  it("returns fuseScore between 0 and 1 for matched results", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "text");
    results.forEach((r) => {
      expect(r.fuseScore).toBeGreaterThanOrEqual(0);
      expect(r.fuseScore).toBeLessThanOrEqual(1);
    });
  });

  it("returns empty array when nothing matches", () => {
    const results = searchWorkflowsWithFuse(
      fuse,
      workflows,
      "xyznonexistent"
    );
    expect(results).toHaveLength(0);
  });

  it("returns workflow objects in results", () => {
    const results = searchWorkflowsWithFuse(fuse, workflows, "image");
    expect(results[0].workflow).toBeDefined();
    expect(results[0].workflow.id).toBe("1");
  });

  it("handles empty workflow list", () => {
    const emptyFuse = new Fuse([] as Workflow[], {
      keys: [{ name: "name", weight: 2 }],
      includeScore: true,
      includeMatches: true
    });
    const results = searchWorkflowsWithFuse(emptyFuse, [], "anything");
    expect(results).toHaveLength(0);
  });

  it("returns all workflows from empty list when query is empty", () => {
    const emptyFuse = new Fuse([] as Workflow[], {
      keys: [{ name: "name", weight: 2 }]
    });
    const results = searchWorkflowsWithFuse(emptyFuse, [], "");
    expect(results).toHaveLength(0);
  });
});
