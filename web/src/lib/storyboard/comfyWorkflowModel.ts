/**
 * The storyboard's ComfyUI workflow clip models: pinned open-weights graphs
 * the `comfy_cloud` provider runs through the Comfy API v2. Shots render with
 * them like any other clip model; this module names them for the render
 * dialog and finds the editable copy of each graph among the examples.
 */
import type { Workflow } from "../../stores/ApiTypes";

/** Mirrors the model ids in `comfy-workflow-models.ts` in `@nodetool-ai/runtime`. */
export const COMFY_WORKFLOW_MODEL_ID = "comfyui-workflow/wan2.2-ti2v-5b";
export const COMFY_WORKFLOW_PROVIDER = "comfy_cloud";
const COMFY_WORKFLOW_PREFIX = "comfyui-workflow/";

/** The example workflow that ships each model's graph, editable. */
const EXAMPLE_NAMES: Readonly<Record<string, string>> = {
  "comfyui-workflow/wan2.2-ti2v-5b": "Shot Director",
  "comfyui-workflow/wan2.2-i2v-a14b": "Shot Director (Wan 2.2 14B)",
  "comfyui-workflow/ltx-2.3-i2v": "Shot Director (LTX-2.3)"
};

export const COMFY_WORKFLOW_EXAMPLE_NAME = EXAMPLE_NAMES[COMFY_WORKFLOW_MODEL_ID];

export const isComfyWorkflowModel = (
  model: { id?: string | null; provider?: string | null } | null | undefined
): boolean =>
  Boolean(model?.id?.startsWith(COMFY_WORKFLOW_PREFIX)) &&
  model?.provider === COMFY_WORKFLOW_PROVIDER;

/** The example name for a workflow model, or null when none ships. */
export const comfyWorkflowExampleName = (modelId: string | null | undefined): string | null =>
  (modelId && EXAMPLE_NAMES[modelId]) || null;

/** The named example among the template search results, if listed. */
export const findComfyWorkflowExample = (
  examples: readonly Workflow[],
  name: string = COMFY_WORKFLOW_EXAMPLE_NAME
): Workflow | undefined => examples.find((example) => example.name === name);
