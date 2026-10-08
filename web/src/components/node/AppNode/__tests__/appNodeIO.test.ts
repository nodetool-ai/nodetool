import {
  createEmptyDocument,
  type ApplicationDocument,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import {
  extractAppNodeIO,
  workflowOperations,
  type AppNodeMetadataLookup
} from "../appNodeIO";

const CORRELATIONS: Record<string, Record<string, OutputCorrelation>> = {
  "nodetool.control.ForEach": {
    output: { kind: "iteration", source: "__execution__", group: "items" }
  },
  "nodetool.control.Collect": {
    output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
  }
};

const lookup: AppNodeMetadataLookup = {
  inputType: (nodeType) =>
    nodeType === "nodetool.input.ImageInput"
      ? { type: "image", optional: false, type_args: [] }
      : undefined,
  outputCorrelation: (nodeType, handle) => CORRELATIONS[nodeType]?.[handle]
};

const operation = (
  inputs: OperationBinding["inputs"] = {}
): OperationBinding => ({
  id: "main",
  name: "Run",
  workflowId: "wf-1",
  inputs,
  outputs: {},
  policy: "replace"
});

const documentWith = (
  operations: OperationBinding[],
  variables: ApplicationDocument["variables"] = []
): ApplicationDocument => ({
  ...createEmptyDocument("Test"),
  operations,
  variables
});

const workflow = {
  id: "wf-1",
  graph: {
    nodes: [
      {
        id: "prompt",
        type: "nodetool.input.StringInput",
        data: { name: "prompt", value: "a cat", description: "What to draw" }
      },
      {
        id: "style",
        type: "nodetool.input.StringInput",
        data: { name: "style", value: "" }
      },
      {
        id: "photo",
        type: "nodetool.input.ImageInput",
        data: { name: "photo", value: null }
      },
      {
        id: "tone",
        type: "nodetool.input.StringInput",
        data: { name: "tone", value: "" }
      },
      { id: "each", type: "nodetool.control.ForEach", data: {} },
      { id: "collect", type: "nodetool.control.Collect", data: {} },
      {
        id: "items",
        type: "nodetool.output.Output",
        data: { name: "items", value: null }
      },
      {
        id: "all",
        type: "nodetool.output.Output",
        data: { name: "all", value: null }
      },
      {
        id: "summary",
        type: "nodetool.output.Output",
        data: { name: "summary", value: null }
      }
    ],
    edges: [
      { source: "prompt", sourceHandle: "output", target: "each", targetHandle: "input_list" },
      { source: "each", sourceHandle: "output", target: "items", targetHandle: "value" },
      { source: "each", sourceHandle: "output", target: "collect", targetHandle: "input_item" },
      { source: "collect", sourceHandle: "output", target: "all", targetHandle: "value" },
      { source: "prompt", sourceHandle: "output", target: "summary", targetHandle: "value" }
    ]
  }
};

describe("extractAppNodeIO", () => {
  it("turns the app's open inputs into ports and keeps fixed ones out", () => {
    const io = extractAppNodeIO(
      "Drawer",
      documentWith(
        [
          operation({
            style: { from: "constant", value: "watercolor" },
            tone: { from: "variable", variableId: "v-tone" }
          })
        ],
        [{ id: "v-tone", name: "tone", default: "calm", scope: "instance", persist: false }]
      ),
      operation({
        style: { from: "constant", value: "watercolor" },
        tone: { from: "variable", variableId: "v-tone" }
      }),
      workflow,
      lookup
    );

    expect(Object.keys(io.dynamic_inputs).sort()).toEqual(["photo", "prompt", "tone"]);
    expect(io.dynamic_inputs.photo.type.type).toBe("image");
    expect(io.dynamic_inputs.prompt.description).toBe("What to draw");
    expect(io.dynamic_properties).toEqual({ prompt: "a cat", photo: null, tone: "calm" });
    expect(io.app_json).toMatchObject({
      name: "Drawer",
      operation_id: "main",
      workflow_id: "wf-1",
      constants: { style: "watercolor" }
    });
    expect(Object.keys(io.dynamic_outputs).sort()).toEqual(["all", "items", "summary"]);
  });

  it("marks only outputs that can emit more than once as streamed", () => {
    const op = operation();
    const io = extractAppNodeIO("Drawer", documentWith([op]), op, workflow, lookup);
    expect(io.dynamic_output_correlation).toEqual({
      items: { kind: "chunk", source: "__execution__" }
    });
  });

  it("follows a nested app's streamed outputs", () => {
    const op = operation();
    const nested = {
      id: "wf-1",
      graph: {
        nodes: [
          {
            id: "inner_app",
            type: "nodetool.workflows.app_node.App",
            data: {},
            dynamic_output_correlation: {
              frames: { kind: "chunk", source: "__execution__" }
            }
          },
          { id: "out", type: "nodetool.output.Output", data: { name: "frames" } }
        ],
        edges: [
          { source: "inner_app", sourceHandle: "frames", target: "out", targetHandle: "value" }
        ]
      }
    };
    const io = extractAppNodeIO("Outer", documentWith([op]), op, nested, lookup);
    expect(io.dynamic_output_correlation).toEqual({
      frames: { kind: "chunk", source: "__execution__" }
    });
  });
});

describe("workflowOperations", () => {
  it("drops script operations", () => {
    const script: OperationBinding = {
      ...operation(),
      id: "script",
      workflowId: "",
      target: { kind: "script", scriptId: "s1", scriptVersion: 1 }
    };
    expect(workflowOperations(documentWith([operation(), script])).map((o) => o.id)).toEqual([
      "main"
    ]);
  });
});
