import type { Workflow } from "../../../stores/ApiTypes";
import {
  COMFY_WORKFLOW_MODEL_ID,
  comfyWorkflowExampleName,
  findComfyWorkflowExample,
  isComfyWorkflowModel
} from "../comfyWorkflowModel";

describe("comfyWorkflowModel", () => {
  it("recognises the pinned workflow models and not Router models", () => {
    expect(isComfyWorkflowModel({ provider: "comfy_cloud", id: COMFY_WORKFLOW_MODEL_ID })).toBe(true);
    expect(isComfyWorkflowModel({ provider: "comfy_cloud", id: "comfyui-workflow/ltx-2.3-i2v" })).toBe(
      true
    );
    expect(isComfyWorkflowModel({ provider: "comfy_cloud", id: "wan/wan2.6-i2v" })).toBe(false);
    expect(isComfyWorkflowModel({ provider: "fal_ai", id: COMFY_WORKFLOW_MODEL_ID })).toBe(false);
    expect(isComfyWorkflowModel(null)).toBe(false);
  });

  it("names the editable example for each model that ships one", () => {
    expect(comfyWorkflowExampleName(COMFY_WORKFLOW_MODEL_ID)).toBe("Shot Director");
    expect(comfyWorkflowExampleName("comfyui-workflow/wan2.2-i2v-a14b")).toBe(
      "Shot Director (Wan 2.2 14B)"
    );
    expect(comfyWorkflowExampleName("comfyui-workflow/ltx-2.3-i2v")).toBe("Shot Director (LTX-2.3)");
    expect(comfyWorkflowExampleName("comfyui-workflow/minimax-h3-i2v")).toBeNull();
  });

  it("finds an example by exact name", () => {
    const examples = [
      { id: "1", name: "Shot Director (LTX-2.3)" },
      { id: "2", name: "Shot Director" }
    ] as Workflow[];
    expect(findComfyWorkflowExample(examples)?.id).toBe("2");
    expect(findComfyWorkflowExample(examples, "Shot Director (LTX-2.3)")?.id).toBe("1");
    expect(findComfyWorkflowExample([])).toBeUndefined();
  });
});
