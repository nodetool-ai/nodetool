/**
 * Types for sketch segmentation.
 *
 * One implementation runs them: {@link SegmentationService} submits a
 * `nodetool.image.Segment` node, which routes to whichever provider the picked
 * model names. Nothing here knows about a provider.
 */

import type {
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationMask,
  SegmentationSourceMetadata,
  SegmentSettings
} from "../types";

export {
  DEFAULT_SAM_MODEL_ID,
  DEFAULT_SAM_MODEL_NAME,
  DEFAULT_SAM_MODEL_PROVIDER
} from "./SamConstants";

/** Whether the sketch can run segmentation right now. */
export type SamModelStatus = "unknown" | "checking" | "available" | "not-installed" | "error";

export interface SamModelInfo {
  status: SamModelStatus;
  /** Model identifier that will run. */
  modelId: string;
  /** Human-readable model name. */
  modelName: string;
  /** Node type that runs it. */
  nodeType?: string;
  /** Why it cannot run (when status is not "available"). */
  errorMessage?: string;
}

// ─── Inference ────────────────────────────────────────────────────────────────

export interface SegmentationRequest {
  /** PNG data URL of the source image to segment. */
  imageDataUrl: string;
  /** Point prompts (positive and negative clicks). */
  pointPrompts: SegmentPointPrompt[];
  /** Optional bounding box prompt. */
  boxPrompt: SegmentBoxPrompt | null;
  /** Tool settings controlling the model and output filtering. */
  settings: SegmentSettings;
  /** Original source-layer metadata when available. */
  sourceMetadata?: SegmentationSourceMetadata;
}

export interface SegmentationResponse {
  masks: SegmentationMask[];
  modelId?: string;
  nodeType?: string;
  sourceMetadata?: SegmentationSourceMetadata;
}
