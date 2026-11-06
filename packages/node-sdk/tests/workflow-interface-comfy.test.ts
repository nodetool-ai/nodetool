import { describe, expect, it } from "vitest";
import { comfyPromptToGraph } from "@nodetool-ai/protocol";
import { deriveWorkflowInterfaceV1 } from "../src/workflow-interface.js";

describe("deriveWorkflowInterfaceV1 on a stored Comfy graph", () => {
  it("derives the save output without the Comfy catalog", () => {
    const graph = comfyPromptToGraph(
      {
        "1": { class_type: "EmptyImage", inputs: {} },
        "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } }
      },
      () => undefined
    );
    const result = deriveWorkflowInterfaceV1({
      workflowId: "w",
      graph,
      registry: { resolveMetadata: () => undefined }
    });
    expect(result.outputs.map((o) => [o.name, o.type.type])).toEqual([["output", "image"]]);
    expect(result.diagnostics).toEqual([]);
  });
});
