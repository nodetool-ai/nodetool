/**
 * Canonical home for the `nodetool.*` node-type string identifiers the web UI
 * references by name (special-cased nodes, dynamic-schema nodes, image-editing
 * bodies, etc.).
 *
 * These strings originate in the Python/backend node definitions and are also
 * generated into `packages/dsl/src/generated`. Until the web app consumes that
 * generated metadata directly, this file is the single source of truth — define
 * a node type here once and import it everywhere rather than re-declaring the
 * literal (or, worse, the constant) in feature code.
 */

// --- Core workflow / base nodes -------------------------------------------
export const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";
export const COMMENT_NODE_TYPE = "nodetool.workflows.base_node.Comment";
export const PREVIEW_NODE_TYPE = "nodetool.workflows.base_node.Preview";
export const REROUTE_NODE_TYPE = "nodetool.control.Reroute";
export const WORKFLOW_NODE_TYPE = "nodetool.workflows.workflow_node.Workflow";
export const SUBGRAPH_NODE_TYPE = "nodetool.workflows.subgraph.Subgraph";

// --- Special editor nodes --------------------------------------------------
export const SKETCH_NODE_TYPE = "nodetool.constant.Sketch";
export const CODE_NODE_TYPE = "nodetool.code.Code";
export const STRING_NODE_TYPE = "nodetool.constant.String";
export const CONSTANT_IMAGE_NODE_TYPE = "nodetool.constant.Image";
export const CONSTANT_VIDEO_NODE_TYPE = "nodetool.constant.Video";

// --- Variable nodes --------------------------------------------------------
export const SET_VARIABLE_NODE_TYPE = "nodetool.variable.SetVariable";
export const GET_VARIABLE_NODE_TYPE = "nodetool.variable.GetVariable";

// --- Dynamic-schema nodes --------------------------------------------------
export const DYNAMIC_FAL_NODE_TYPE = "fal.DynamicFal";
export const DYNAMIC_KIE_NODE_TYPE = "kie.dynamic_schema.KieAI";
export const DYNAMIC_REPLICATE_NODE_TYPE = "replicate.DynamicReplicate";
export const DYNAMIC_COMFY_NODE_TYPE = "lib.comfy.RunWorkflow";

// --- Image segmentation (SAM) ----------------------------------------------
export const FAL_SAM_NODE_TYPE = "fal.image_to_image.Sam3Image";
export const LOCAL_SAM3_NODE_TYPE =
  "huggingface.image_segmentation.MaskGeneration";

// --- Image-editing node bodies ---------------------------------------------
export const BLUR_NODE_TYPE = "nodetool.image.Blur";
export const CHANNELS_NODE_TYPE = "nodetool.image.Channels";
export const COMPOSITOR_NODE_TYPE = "nodetool.image.Compositor";
export const CROP_NODE_TYPE = "nodetool.image.Crop";
export const CURVES_NODE_TYPE = "lib.image.color_grading.Curves";
export const FIT_NODE_TYPE = "nodetool.image.Fit";
export const HSL_ADJUST_NODE_TYPE = "lib.image.color_grading.HSLAdjust";
export const LEVELS_NODE_TYPE = "nodetool.image.Levels";
export const MASK_NODE_TYPE = "lib.image.Mask";
export const PAINTER_NODE_TYPE = "nodetool.image.Painter";
export const PASTE_NODE_TYPE = "nodetool.image.Paste";
export const PROMPT_NODE_TYPE = "nodetool.text.Prompt";
export const RESIZE_NODE_TYPE = "nodetool.image.Resize";
export const RESIZE_IMAGE_NODE_TYPE = "nodetool.image.ResizeImage";
export const CANVAS_RESIZE_NODE_TYPE = "nodetool.image.CanvasResize";
export const ROTATE_AND_FLIP_NODE_TYPE = "nodetool.image.RotateAndFlip";
export const SCALE_NODE_TYPE = "nodetool.image.Scale";

/** Human-readable label from a node_type string (e.g. ResizeImage → Resize Image). */
export function nodeTypeDisplayName(nodeType: string): string {
  const segment = nodeType.split(".").pop() ?? nodeType;
  return segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
