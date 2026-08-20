/**
 * SAM module barrel export.
 */

export { SamServiceStub, getSamService } from "./SamService";
export {
  FAL_SAM_CAPABILITIES,
  DEFAULT_SAM_MODEL_ID,
  DEFAULT_SAM_MODEL_NAME,
  getDefaultSamModelId,
  LOCAL_SAM3_MODEL_ID,
  LOCAL_SAM3_MODEL_NAME,
  LOCAL_SAM3_CAPABILITIES
} from "./SamService";

export type {
  SamService,
  SamModelStatus,
  SamModelInfo,
  SamBackendCapabilities,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";

export { SamServiceFal, resizeForInference, MAX_INFERENCE_DIMENSION } from "./SamServiceFal";

export { SamServiceNode } from "./SamServiceNode";
export { normalizeSamMasks } from "./normalizeSamMasks";
export {
  rasterizeSegmentationToDocumentSpace,
  projectSegmentationMasksToDocumentSpace
} from "./segmentationDocumentSpace";

export {
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  generateCutoutDataUrl,
  generateSegmentationRunId
} from "./segmentMaskOverlay";
