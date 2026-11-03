/**
 * The storyboard's ComfyUI workflow clip model: the pinned Wan 2.2 TI2V 5B
 * graph the `comfy_cloud` provider runs through the Comfy API v2. Shots render
 * with it like any other clip model; this module names it for the render
 * dialog and finds the editable copy of its graph among the examples.
 */
import type { Workflow } from "../../stores/ApiTypes";

/** Mirrors `COMFY_WAN22_TI2V_MODEL_ID` in `@nodetool-ai/runtime`. */
export const COMFY_WORKFLOW_MODEL_ID = "comfyui-workflow/wan2.2-ti2v-5b";
export const COMFY_WORKFLOW_PROVIDER = "comfy_cloud";

/** The example workflow that ships the same graph, editable. */
export const COMFY_WORKFLOW_EXAMPLE_NAME = "Shot Director";

export const isComfyWorkflowModel = (
  model: { id?: string | null; provider?: string | null } | null | undefined
): boolean =>
  model?.id === COMFY_WORKFLOW_MODEL_ID && model?.provider === COMFY_WORKFLOW_PROVIDER;

/** The Shot Director example among the template search results, if listed. */
export const findComfyWorkflowExample = (
  examples: readonly Workflow[]
): Workflow | undefined =>
  examples.find((example) => example.name === COMFY_WORKFLOW_EXAMPLE_NAME);
