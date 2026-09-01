/**
 * SAM module barrel export.
 */

export {
  SegmentationService,
  getSegmentationService
} from "./SegmentationService";

export {
  DEFAULT_SAM_MODEL_ID,
  DEFAULT_SAM_MODEL_NAME,
  DEFAULT_SAM_MODEL_PROVIDER
} from "./SamConstants";

export type {
  SamModelStatus,
  SamModelInfo,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";

export {
  resizeForInference,
  MAX_INFERENCE_DIMENSION
} from "./resizeForInference";

export { normalizeSamMasks } from "./normalizeSamMasks";
export {
  rasterizeSegmentationToDocumentSpace,
  projectSegmentationMasksToDocumentSpace
} from "./segmentationDocumentSpace";

export {
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  generateCutoutDataUrl,
  toAlphaMaskDataUrl,
  generateSegmentationRunId
} from "./segmentMaskOverlay";
