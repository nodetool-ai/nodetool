import type { Workflow } from "../../../stores/ApiTypes";
import {
  COMFY_WORKFLOW_MODEL_ID,
  findComfyWorkflowExample,
  isComfyWorkflowModel
} from "../comfyWorkflowModel";

describe("comfyWorkflowModel", () => {
  it("recognises the pinned workflow model and not Router models", () => {
    expect(isComfyWorkflowModel({ provider: "comfy_cloud", id: COMFY_WORKFLOW_MODEL_ID })).toBe(true);
    expect(isComfyWorkflowModel({ provider: "comfy_cloud", id: "wan/wan2.6-i2v" })).toBe(false);
    expect(isComfyWorkflowModel(null)).toBe(false);
  });

  it("finds the Shot Director example by exact name", () => {
    const examples = [
      { id: "1", name: "Shot Director Extras" },
      { id: "2", name: "Shot Director" }
    ] as Workflow[];
    expect(findComfyWorkflowExample(examples)?.id).toBe("2");
    expect(findComfyWorkflowExample([])).toBeUndefined();
  });
});
