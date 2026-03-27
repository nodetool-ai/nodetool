/**
 * SamService – abstraction layer for SAM 2 model inference.
 *
 * Handles model availability checks, downloading, and running segmentation.
 * The first version targets the backend service path via the existing
 * model management and workflow execution APIs.
 *
 * Service is stateless; all mutable state lives in the useSegmentation hook.
 */

import type {
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationMask,
  SegmentSettings
} from "../types";

// ─── Model Availability ───────────────────────────────────────────────────────

/** Status of the SAM model on the current backend. */
export type SamModelStatus =
  | "unknown"
  | "checking"
  | "available"
  | "not-installed"
  | "downloading"
  | "error";

export interface SamModelInfo {
  status: SamModelStatus;
  /** Model identifier used by the backend. */
  modelId: string;
  /** Human-readable model name. */
  modelName: string;
  /** Size on disk in bytes (when known). */
  sizeBytes?: number;
  /** Download progress 0–1 (only when status === "downloading"). */
  downloadProgress?: number;
  /** Error message (when status === "error"). */
  errorMessage?: string;
}

/** Default SAM 2 model target. */
export const DEFAULT_SAM_MODEL_ID = "facebook/sam2-hiera-large";
export const DEFAULT_SAM_MODEL_NAME = "SAM 2 (Hiera Large)";

// ─── Inference ────────────────────────────────────────────────────────────────

export interface SegmentationRequest {
  /** PNG data URL of the source image to segment. */
  imageDataUrl: string;
  /** Point prompts (positive and negative clicks). */
  pointPrompts: SegmentPointPrompt[];
  /** Optional bounding box prompt. */
  boxPrompt: SegmentBoxPrompt | null;
  /** Tool settings controlling output filtering. */
  settings: SegmentSettings;
}

export interface SegmentationResponse {
  masks: SegmentationMask[];
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface SamService {
  /** Check whether the SAM model is available on the backend. */
  checkModelAvailability(): Promise<SamModelInfo>;

  /** Run segmentation and return mask results. */
  runSegmentation(
    request: SegmentationRequest,
    signal?: AbortSignal
  ): Promise<SegmentationResponse>;
}

// ─── Stub Implementation ──────────────────────────────────────────────────────
//
// The first version returns a stub that reports the model as not-installed.
// This will be replaced with a real backend integration when the SAM 2
// inference endpoint is available.

export class SamServiceStub implements SamService {
  async checkModelAvailability(): Promise<SamModelInfo> {
    return {
      status: "not-installed",
      modelId: DEFAULT_SAM_MODEL_ID,
      modelName: DEFAULT_SAM_MODEL_NAME
    };
  }

  async runSegmentation(
    _request: SegmentationRequest,
    _signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    // Simulate a delay for the stub
    await new Promise((resolve) => setTimeout(resolve, 200));

    return { masks: [] };
  }
}

/** Singleton service instance. Replace with real implementation when available. */
let serviceInstance: SamService | null = null;

export function getSamService(): SamService {
  if (!serviceInstance) {
    serviceInstance = new SamServiceStub();
  }
  return serviceInstance;
}

/**
 * Override the service instance (useful for testing or switching to a real backend).
 */
export function setSamService(service: SamService): void {
  serviceInstance = service;
}
