import {
  isComfyWorkflowJson,
  isNodetoolWorkflowJson,
  isComfyPromptJson
} from "../dropHandlerUtils";

describe("isComfyWorkflowJson", () => {
  it("returns true for valid ComfyUI workflow", () => {
    const workflow = {
      last_node_id: 5,
      last_link_id: 3,
      nodes: [{ id: 1 }],
      links: [[1, 2]]
    };
    expect(isComfyWorkflowJson(workflow)).toBe(true);
  });

  it("returns false when missing last_node_id", () => {
    expect(
      isComfyWorkflowJson({
        last_link_id: 3,
        nodes: [],
        links: []
      })
    ).toBe(false);
  });

  it("returns false when missing last_link_id", () => {
    expect(
      isComfyWorkflowJson({
        last_node_id: 5,
        nodes: [],
        links: []
      })
    ).toBe(false);
  });

  it("returns false when nodes is not an array", () => {
    expect(
      isComfyWorkflowJson({
        last_node_id: 5,
        last_link_id: 3,
        nodes: "not-array",
        links: []
      })
    ).toBe(false);
  });

  it("returns false when links is not an array", () => {
    expect(
      isComfyWorkflowJson({
        last_node_id: 5,
        last_link_id: 3,
        nodes: [],
        links: "not-array"
      })
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isComfyWorkflowJson(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isComfyWorkflowJson("workflow")).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isComfyWorkflowJson([1, 2, 3])).toBe(false);
  });
});

describe("isNodetoolWorkflowJson", () => {
  it("returns true for valid NodeTool workflow", () => {
    const workflow = {
      name: "My Workflow",
      graph: {
        nodes: [{ id: "n1" }],
        edges: [{ source: "n1", target: "n2" }]
      }
    };
    expect(isNodetoolWorkflowJson(workflow)).toBe(true);
  });

  it("returns true without name field", () => {
    const workflow = {
      graph: {
        nodes: [],
        edges: []
      }
    };
    expect(isNodetoolWorkflowJson(workflow)).toBe(true);
  });

  it("returns false when graph is missing", () => {
    expect(isNodetoolWorkflowJson({ name: "test" })).toBe(false);
  });

  it("returns false when graph.nodes is not an array", () => {
    expect(
      isNodetoolWorkflowJson({
        graph: { nodes: "not-array", edges: [] }
      })
    ).toBe(false);
  });

  it("returns false when graph.edges is not an array", () => {
    expect(
      isNodetoolWorkflowJson({
        graph: { nodes: [], edges: "not-array" }
      })
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNodetoolWorkflowJson(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isNodetoolWorkflowJson(42)).toBe(false);
  });
});

describe("isComfyPromptJson", () => {
  it("returns true for valid ComfyUI prompt (API format)", () => {
    const prompt = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" } },
      "2": { class_type: "KSampler", inputs: { seed: 42, steps: 20 } }
    };
    expect(isComfyPromptJson(prompt)).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isComfyPromptJson({})).toBe(false);
  });

  it("returns false when keys are not numeric", () => {
    expect(
      isComfyPromptJson({
        node1: { class_type: "Test", inputs: {} }
      })
    ).toBe(false);
  });

  it("returns false when class_type is missing", () => {
    expect(
      isComfyPromptJson({
        "1": { inputs: {} }
      })
    ).toBe(false);
  });

  it("returns false when inputs is missing", () => {
    expect(
      isComfyPromptJson({
        "1": { class_type: "Test" }
      })
    ).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isComfyPromptJson([1, 2])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isComfyPromptJson(null)).toBe(false);
  });

  it("returns false when a value is not an object", () => {
    expect(
      isComfyPromptJson({
        "1": "not-an-object"
      })
    ).toBe(false);
  });
});
