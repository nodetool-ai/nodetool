import {
  extractDynamicIO,
  INPUT_TYPE_MAP,
  OUTPUT_TYPE_MAP,
  WORKFLOW_NODE_TYPE
} from "../WorkflowLoader";
import { Workflow } from "../../../../stores/ApiTypes";

// Helper to create a minimal Workflow object for testing
function makeWorkflow(nodes: unknown[]): Workflow {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "A test workflow",
    access: "private",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    graph: {
      nodes,
      edges: []
    }
  } as Workflow;
}

describe("WORKFLOW_NODE_TYPE", () => {
  it("has the correct value", () => {
    expect(WORKFLOW_NODE_TYPE).toBe(
      "nodetool.workflows.base_node.WorkflowNode"
    );
  });
});

describe("INPUT_TYPE_MAP", () => {
  it("maps standard input node types to type strings", () => {
    expect(INPUT_TYPE_MAP["nodetool.input.StringInput"]).toBe("str");
    expect(INPUT_TYPE_MAP["nodetool.input.IntegerInput"]).toBe("int");
    expect(INPUT_TYPE_MAP["nodetool.input.FloatInput"]).toBe("float");
    expect(INPUT_TYPE_MAP["nodetool.input.BooleanInput"]).toBe("bool");
    expect(INPUT_TYPE_MAP["nodetool.input.ImageInput"]).toBe("image");
    expect(INPUT_TYPE_MAP["nodetool.input.AudioInput"]).toBe("audio");
    expect(INPUT_TYPE_MAP["nodetool.input.VideoInput"]).toBe("video");
    expect(INPUT_TYPE_MAP["nodetool.input.TextInput"]).toBe("str");
  });
});

describe("OUTPUT_TYPE_MAP", () => {
  it("maps standard output node types to type strings", () => {
    expect(OUTPUT_TYPE_MAP["nodetool.output.StringOutput"]).toBe("str");
    expect(OUTPUT_TYPE_MAP["nodetool.output.IntegerOutput"]).toBe("int");
    expect(OUTPUT_TYPE_MAP["nodetool.output.FloatOutput"]).toBe("float");
    expect(OUTPUT_TYPE_MAP["nodetool.output.BooleanOutput"]).toBe("bool");
    expect(OUTPUT_TYPE_MAP["nodetool.output.ImageOutput"]).toBe("image");
    expect(OUTPUT_TYPE_MAP["nodetool.output.AudioOutput"]).toBe("audio");
    expect(OUTPUT_TYPE_MAP["nodetool.output.VideoOutput"]).toBe("video");
    expect(OUTPUT_TYPE_MAP["nodetool.output.TextOutput"]).toBe("str");
    expect(OUTPUT_TYPE_MAP["nodetool.output.Output"]).toBe("any");
  });
});

describe("extractDynamicIO", () => {
  it("returns empty objects for a workflow with no graph", () => {
    const workflow = { id: "wf-1", name: "Empty" } as Workflow;
    const result = extractDynamicIO(workflow);

    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.dynamic_properties).toEqual({});
  });

  it("returns empty objects for a workflow with no nodes", () => {
    const workflow = makeWorkflow([]);
    const result = extractDynamicIO(workflow);

    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.dynamic_properties).toEqual({});
  });

  it("extracts input nodes as dynamic inputs", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.input.StringInput",
        data: {
          properties: { name: "prompt", value: "hello", description: "A prompt" }
        }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(result.dynamic_inputs).toEqual({
      prompt: {
        type: "str",
        optional: true,
        type_args: [],
        description: "A prompt"
      }
    });
    expect(result.dynamic_properties).toEqual({
      prompt: "hello"
    });
  });

  it("extracts output nodes as dynamic outputs", () => {
    const workflow = makeWorkflow([
      {
        id: "n2",
        type: "nodetool.output.ImageOutput",
        data: {
          properties: { name: "result_image" }
        }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(result.dynamic_outputs).toEqual({
      result_image: {
        type: "image",
        optional: false,
        type_args: []
      }
    });
  });

  it("extracts both input and output nodes", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.input.IntegerInput",
        data: { properties: { name: "count", value: 5 } }
      },
      {
        id: "n2",
        type: "nodetool.input.FloatInput",
        data: { properties: { name: "scale", value: 1.5 } }
      },
      {
        id: "n3",
        type: "nodetool.output.StringOutput",
        data: { properties: { name: "result" } }
      },
      {
        id: "n4",
        type: "openai.chat.GPT",
        data: { properties: { model: "gpt-4" } }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(Object.keys(result.dynamic_inputs)).toEqual(["count", "scale"]);
    expect(result.dynamic_inputs.count.type).toBe("int");
    expect(result.dynamic_inputs.scale.type).toBe("float");
    expect(Object.keys(result.dynamic_outputs)).toEqual(["result"]);
    expect(result.dynamic_outputs.result.type).toBe("str");
    expect(result.dynamic_properties).toEqual({ count: 5, scale: 1.5 });
  });

  it("falls back to node type name when properties.name is missing", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.input.BooleanInput",
        data: { properties: {} }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(Object.keys(result.dynamic_inputs)).toEqual(["BooleanInput"]);
    expect(result.dynamic_inputs.BooleanInput.type).toBe("bool");
  });

  it("falls back to title when name is missing", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.input.StringInput",
        data: { title: "My Input", properties: {} }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(Object.keys(result.dynamic_inputs)).toEqual(["My Input"]);
  });

  it("defaults missing value to empty string", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.input.StringInput",
        data: { properties: { name: "text" } }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(result.dynamic_properties.text).toBe("");
  });

  it("handles generic Output type", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "nodetool.output.Output",
        data: { properties: { name: "generic_out" } }
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(result.dynamic_outputs.generic_out.type).toBe("any");
  });

  it("ignores non-input/output node types", () => {
    const workflow = makeWorkflow([
      {
        id: "n1",
        type: "openai.chat.GPT",
        data: { properties: { model: "gpt-4" } }
      },
      {
        id: "n2",
        type: "nodetool.workflows.base_node.Group",
        data: {}
      }
    ]);

    const result = extractDynamicIO(workflow);

    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.dynamic_properties).toEqual({});
  });

  it("handles nodes as object (non-array)", () => {
    const workflow = {
      ...makeWorkflow([]),
      graph: {
        nodes: {
          n1: {
            id: "n1",
            type: "nodetool.input.AudioInput",
            data: { properties: { name: "audio_in", value: null } }
          }
        },
        edges: []
      }
    } as unknown as Workflow;

    const result = extractDynamicIO(workflow);

    expect(Object.keys(result.dynamic_inputs)).toEqual(["audio_in"]);
    expect(result.dynamic_inputs.audio_in.type).toBe("audio");
  });
});
