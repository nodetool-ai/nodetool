import { describe, expect, it } from "vitest";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import { WorkflowRunner, type NodeValidator } from "../src/runner.js";

const selectedModel = {
  type: "video_model",
  provider: "test",
  id: "image-to-video",
  name: "Test video model"
};

const validateModel: NodeValidator = (node) => {
  const value = node.properties?.value;
  if (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    value.id
  ) {
    return [];
  }
  return [{ property: "value", message: "Select a video model" }];
};

const runWith = (
  value: unknown,
  params: Record<string, unknown>,
  nodeType = "nodetool.input.VideoModelInput"
) => {
  const node: NodeDescriptor = {
    id: "model-input",
    type: nodeType,
    properties: { name: "video_model", value }
  };
  const runner = new WorkflowRunner("validation", {
    validateNode: validateModel,
    resolveExecutor: () => ({
      async process(inputs) {
        return { value: inputs.value };
      }
    })
  });
  return {
    node,
    result: runner.run(
      { job_id: "validation", params },
      { nodes: [node], edges: [] }
    )
  };
};

describe("runtime model input validation", () => {
  it("validates the selected runtime model instead of the blank template value", async () => {
    const blank = { type: "video_model", provider: "", id: "", name: "" };
    const { node, result } = runWith(blank, { video_model: selectedModel });
    expect((await result).status).toBe("completed");
    expect(node.properties?.value).toEqual(blank);
  });

  it("rejects an explicitly empty runtime model even when the template has a default", async () => {
    const { result } = runWith(selectedModel, { video_model: null });
    expect((await result).status).toBe("failed");
  });

  it("keeps the saved model when no runtime value was supplied", async () => {
    const { result } = runWith(selectedModel, {});
    expect((await result).status).toBe("completed");
  });

  it("treats undefined as an omitted runtime value", async () => {
    const { result } = runWith(selectedModel, { video_model: undefined });
    expect((await result).status).toBe("completed");
  });

  it("does not use workflow parameters to validate an ordinary node's properties", async () => {
    const { result } = runWith(
      null,
      { video_model: selectedModel },
      "test.Source"
    );
    expect((await result).status).toBe("failed");
  });

  it("does not apply runtime parameters to a control-driven input node", async () => {
    const runner = new WorkflowRunner("controlled", {
      validateNode: (node) =>
        node.id === "model-input" ? validateModel(node, new Set()) : [],
      resolveExecutor: () => ({
        async process() {
          return {};
        }
      })
    });
    const result = await runner.run(
      { job_id: "controlled", params: { video_model: selectedModel } },
      {
        nodes: [
          { id: "controller", type: "test.Controller" },
          {
            id: "model-input",
            type: "nodetool.input.VideoModelInput",
            properties: { name: "video_model", value: null }
          }
        ],
        edges: [
          {
            source: "controller",
            sourceHandle: "trigger",
            target: "model-input",
            targetHandle: "__control__",
            edge_type: "control"
          }
        ]
      }
    );
    expect(result.status).toBe("failed");
  });
});
