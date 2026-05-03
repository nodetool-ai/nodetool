import type { SamBackendCapabilities } from "./SamService";

/** Default fal SAM provider target. */
export const DEFAULT_SAM_MODEL_ID = "fal-ai/sam-3-1/image";
export const DEFAULT_SAM_MODEL_NAME = "SAM 3.1 (fal.ai Cloud)";
export const LOCAL_SAM3_MODEL_ID = "facebook/sam3";
export const LOCAL_SAM3_MODEL_NAME = "Local SAM3";
export const SAM_INLINE_IMAGE_MAX_BYTES = 1024 * 1024;

export const FAL_SAM_CAPABILITIES: SamBackendCapabilities = {
  automaticSplit: true,
  maskImages: true,
  textPrompts: true,
  pointPrompts: true,
  boxPrompts: true,
  labels: false,
  confidence: true,
  boxes: true,
  rle: false
};

export const LOCAL_SAM3_CAPABILITIES: SamBackendCapabilities = {
  automaticSplit: true,
  maskImages: true,
  textPrompts: false,
  pointPrompts: false,
  boxPrompts: false,
  labels: false,
  confidence: false,
  boxes: false,
  rle: false
};
