import {
  extractDynamicIO,
  INPUT_TYPE_MAP,
  OUTPUT_TYPE_MAP
} from "../WorkflowLoader.helpers";
import type { Workflow } from "../../../../stores/ApiTypes";

function makeWorkflow(
  nodes: Array<{ type: string; data?: Record<string, unknown> }>
): Workflow {
  return {
    id: "wf-1",
    name: "Test",
    access: "private",
    description: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    graph: { nodes, edges: [] }
  } as unknown as Workflow;
}

describe("extractDynamicIO", () => {
  it("returns empty result for workflow without graph", () => {
    const wf = { id: "wf-1", name: "Test" } as Workflow;
    const result = extractDynamicIO(wf);
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.dynamic_properties).toEqual({});
  });

  it("returns empty result for workflow with no nodes", () => {
    const result = extractDynamicIO(makeWorkflow([]));
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
  });

  it("extracts string input from StringInput node", () => {
    const wf = makeWorkflow([
      {
        type: "nodetool.input.StringInput",
        data: { name: "prompt", value: "hello", description: "User prompt" }
      }
    ]);
    const result = extractDynamicIO(wf);
    expect(result.dynamic_inputs).toHaveProperty("prompt");
    expect(result.dynamic_inputs.prompt.type).toBe("str");
    expect(result.dynamic_inputs.prompt.description).toBe("User prompt");
    expect(result.dynamic_properties.prompt).toBe("hello");
  });

  it("extracts image output from ImageOutput node", () => {
    const wf = makeWorkflow([
      {
        type: "nodetool.output.ImageOutput",
        data: { name: "result" }
      }
    ]);
    const result = extractDynamicIO(wf);
    expect(result.dynamic_outputs).toHaveProperty("result");
    expect(result.dynamic_outputs.result.type).toBe("image");
  });

  it("extracts both inputs and outputs from mixed nodes", () => {
    const wf = makeWorkflow([
      { type: "nodetool.input.FloatInput", data: { name: "temperature", value: 0.7 } },
      { type: "nodetool.output.StringOutput", data: { name: "response" } },
      { type: "nodetool.input.IntegerInput", data: { name: "max_tokens", value: 100 } }
    ]);
    const result = extractDynamicIO(wf);
    expect(Object.keys(result.dynamic_inputs)).toHaveLength(2);
    expect(result.dynamic_inputs.temperature.type).toBe("float");
    expect(result.dynamic_inputs.max_tokens.type).toBe("int");
    expect(result.dynamic_outputs.response.type).toBe("str");
    expect(result.dynamic_properties.temperature).toBe(0.7);
    expect(result.dynamic_properties.max_tokens).toBe(100);
  });

  it("uses type name fallback when no name property", () => {
    const wf = makeWorkflow([
      { type: "nodetool.input.BooleanInput", data: {} }
    ]);
    const result = extractDynamicIO(wf);
    expect(result.dynamic_inputs).toHaveProperty("BooleanInput");
    expect(result.dynamic_inputs.BooleanInput.type).toBe("bool");
  });

  it("ignores nodes that are not input/output types", () => {
    const wf = makeWorkflow([
      { type: "nodetool.text.Concat", data: {} },
      { type: "nodetool.input.StringInput", data: { name: "text" } }
    ]);
    const result = extractDynamicIO(wf);
    expect(Object.keys(result.dynamic_inputs)).toHaveLength(1);
    expect(Object.keys(result.dynamic_outputs)).toHaveLength(0);
  });

  it("handles nodes with nested properties (ReactFlow format)", () => {
    const wf = makeWorkflow([
      {
        type: "nodetool.input.AudioInput",
        data: { properties: { name: "audio_clip", value: null } }
      }
    ]);
    const result = extractDynamicIO(wf);
    expect(result.dynamic_inputs).toHaveProperty("audio_clip");
    expect(result.dynamic_inputs.audio_clip.type).toBe("audio");
  });

  it("maps Output type to any", () => {
    const wf = makeWorkflow([
      { type: "nodetool.output.Output", data: { name: "generic_out" } }
    ]);
    const result = extractDynamicIO(wf);
    expect(result.dynamic_outputs.generic_out.type).toBe("any");
  });
});

describe("type maps", () => {
  it("INPUT_TYPE_MAP covers all expected input types", () => {
    expect(INPUT_TYPE_MAP["nodetool.input.StringInput"]).toBe("str");
    expect(INPUT_TYPE_MAP["nodetool.input.IntegerInput"]).toBe("int");
    expect(INPUT_TYPE_MAP["nodetool.input.FloatInput"]).toBe("float");
    expect(INPUT_TYPE_MAP["nodetool.input.BooleanInput"]).toBe("bool");
    expect(INPUT_TYPE_MAP["nodetool.input.ImageInput"]).toBe("image");
    expect(INPUT_TYPE_MAP["nodetool.input.AudioInput"]).toBe("audio");
    expect(INPUT_TYPE_MAP["nodetool.input.VideoInput"]).toBe("video");
    expect(INPUT_TYPE_MAP["nodetool.input.TextInput"]).toBe("str");
  });

  it("OUTPUT_TYPE_MAP covers all expected output types", () => {
    expect(OUTPUT_TYPE_MAP["nodetool.output.StringOutput"]).toBe("str");
    expect(OUTPUT_TYPE_MAP["nodetool.output.IntegerOutput"]).toBe("int");
    expect(OUTPUT_TYPE_MAP["nodetool.output.FloatOutput"]).toBe("float");
    expect(OUTPUT_TYPE_MAP["nodetool.output.BooleanOutput"]).toBe("bool");
    expect(OUTPUT_TYPE_MAP["nodetool.output.ImageOutput"]).toBe("image");
    expect(OUTPUT_TYPE_MAP["nodetool.output.AudioOutput"]).toBe("audio");
    expect(OUTPUT_TYPE_MAP["nodetool.output.VideoOutput"]).toBe("video");
    expect(OUTPUT_TYPE_MAP["nodetool.output.Output"]).toBe("any");
  });
});
