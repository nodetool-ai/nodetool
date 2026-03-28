/**
 * SAM module barrel export.
 */

export { SamServiceStub, getSamService, setSamService } from "./SamService";
export { DEFAULT_SAM_MODEL_ID, DEFAULT_SAM_MODEL_NAME } from "./SamService";

export type {
  SamService,
  SamModelStatus,
  SamModelInfo,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";

export { SamServiceFal, resizeForInference, MAX_INFERENCE_DIMENSION } from "./SamServiceFal";

export { SamServiceNode, SAM_NODE_CONFIGS, DEFAULT_SAM_NODE_BACKEND } from "./SamServiceNode";
export type { SamNodeConfig } from "./SamServiceNode";

export { WebSocketNodeExecutor, getNodeExecutor, setNodeExecutor } from "./NodeExecutor";
export type { NodeExecutor, GraphNode, GraphEdge, InlineGraph, NodeExecutionResult } from "./NodeExecutor";

export {
  getMaskOverlayColor,
  getMaskOutlineColor,
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  generateCutoutDataUrl,
  generateSegmentationRunId
} from "./segmentMaskOverlay";
