import { comfyPromptToGraph } from "@nodetool-ai/protocol";
import { extractWorkflowIO } from "../workflowIO";
import { extractDynamicIO } from "../../node/WorkflowNode/WorkflowLoader.helpers";
import type { Workflow } from "../../../stores/ApiTypes";

const graph = comfyPromptToGraph(
  {
    "1": { class_type: "LoadImage", inputs: { image: "a.png" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a fox" } },
    "3": { class_type: "KSampler", inputs: { positive: ["2", 0] } },
    "4": { class_type: "SaveImage", inputs: { images: ["3", 0] } }
  },
  () => undefined
);

describe("a stored Comfy graph", () => {
  it("offers its derived contract to mini apps and transforms", () => {
    const io = extractWorkflowIO({ graph } as unknown as Workflow);
    expect(io.inputs.map((input) => input.name)).toEqual(["prompt", "image"]);
    expect(io.outputs.map((output) => output.name)).toEqual(["output"]);
  });

  it("offers the same contract to the Workflow node", () => {
    const io = extractDynamicIO({ graph });
    expect(Object.keys(io.dynamic_inputs)).toEqual(["prompt", "image"]);
    expect(Object.keys(io.dynamic_outputs)).toEqual(["output"]);
  });
});
