import { readFileSync } from "fs";
import { join } from "path";
import { resolveOperationParams } from "@nodetool-ai/app-runtime";
import { extractWorkflowIO, workflowInputForScriptPort } from "../workflowIO";
import { PartialMembers, stub } from "../../../test-utils/doubles";
import { Node, Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (nodes: PartialMembers<Node>[]): Workflow =>
  stub<Workflow>({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes, edges: [] }
  });

describe("extractWorkflowIO", () => {
  it("returns empty IO for a workflow with no graph", () => {
    expect(extractWorkflowIO(undefined)).toEqual({ inputs: [], outputs: [] });
  });

  it("extracts input nodes keyed by name with defaults and ranges", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt", label: "Prompt", value: "hi" }
        },
        {
          id: "n2",
          type: "nodetool.input.IntegerInput",
          data: { name: "count", min: 1, max: 10, value: 3 }
        }
      ])
    );
    expect(io.inputs).toHaveLength(2);
    const prompt = io.inputs.find((i) => i.name === "prompt");
    expect(prompt?.kind).toBe("string");
    expect(prompt?.defaultValue).toBe("hi");
    const count = io.inputs.find((i) => i.name === "count");
    expect(count?.min).toBe(1);
    expect(count?.max).toBe(10);
  });

  it("treats a ValueInput as an input the app's variables feed", () => {
    // Study 14: Product Price Drop failed "Select a finishing model" with a
    // model picked, because its ValueInputs never reached the run.
    const bundle = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "../../../../../packages/base-nodes/nodetool/examples/apps/product-price-drop.app.json"
        ),
        "utf8"
      )
    );
    const operation = bundle.app.operations.find(
      (op: { id: string }) => op.id === "plan"
    );
    const workflow = bundle.workflows.find(
      (item: { key: string }) => item.key === operation.workflowId
    );
    const io = extractWorkflowIO(makeWorkflow(workflow.graph.nodes));
    const finishModel = {
      type: "language_model",
      provider: "openai",
      id: "test-chat-model",
      name: "Test Chat Model"
    };
    const params = resolveOperationParams({
      operation,
      state: {
        variables: { finishModel, headline: "Handmade lamps" },
        inputs: {}
      } as unknown as Parameters<typeof resolveOperationParams>[0]["state"],
      inputNodeIds: io.inputs.map((input) => input.nodeId),
      inputName: (nodeId) =>
        io.inputs.find((input) => input.nodeId === nodeId)?.name
    });
    expect(io.inputs.find((input) => input.name === "finishModel")?.kind).toBe(
      "value"
    );
    expect(params.finishModel).toEqual(finishModel);
    expect(params.headline).toBe("Handmade lamps");
  });

  it("extracts output nodes", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "o1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" }
        }
      ])
    );
    expect(io.outputs).toHaveLength(1);
    expect(io.outputs[0].name).toBe("result");
  });

  it("skips bypassed nodes", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" },
          ui_properties: { bypassed: true }
        }
      ])
    );
    expect(io.inputs).toHaveLength(0);
  });

  it("falls back to the node id when name is missing", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        { id: "n1", type: "nodetool.input.StringInput", data: {} }
      ])
    );
    expect(io.inputs[0].name).toBe("n1");
  });
});

describe("workflowInputForScriptPort", () => {
  it("maps a script port onto the InputNode the property widget uses", () => {
    expect(workflowInputForScriptPort({ name: "count", type: "int" })).toEqual({
      nodeId: "count",
      nodeType: "nodetool.input.IntegerInput",
      name: "count",
      label: "count",
      kind: "integer"
    });
  });
});
