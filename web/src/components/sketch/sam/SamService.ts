/**
 * SamService – abstraction layer for sketch SAM backends.
 *
 * Handles model availability checks, downloading, and running segmentation.
 * Sketch owns the UI contract; each backend reports only the capabilities the
 * editor actually needs.
 *
 * Service is stateless; all mutable state lives in the useSegmentation hook.
 */

import type {
  SegmentBackend,
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationMask,
  SegmentSettings
} from "../types";
import { SamServiceFal } from "./SamServiceFal";

// ─── Model Availability ───────────────────────────────────────────────────────

/** Status of the SAM model on the current backend. */
export type SamModelStatus =
  | "unknown"
  | "checking"
  | "available"
  | "not-installed"
  | "downloading"
  | "error";

export interface SamBackendCapabilities {
  automaticSplit: boolean;
  maskImages: boolean;
  textPrompts: boolean;
  pointPrompts: boolean;
  boxPrompts: boolean;
  labels: boolean;
  confidence: boolean;
  boxes: boolean;
  rle: boolean;
}

export interface SamModelInfo {
  status: SamModelStatus;
  backendId: SegmentBackend;
  backendLabel: string;
  capabilities: SamBackendCapabilities;
  nodeType?: string;
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
export const LOCAL_SAM3_MODEL_ID = "facebook/sam3";
export const LOCAL_SAM3_MODEL_NAME = "Local SAM3";

export const FAL_SAM_CAPABILITIES: SamBackendCapabilities = {
  automaticSplit: true,
  maskImages: true,
  textPrompts: false,
  pointPrompts: true,
  boxPrompts: true,
  labels: true,
  confidence: false,
  boxes: false,
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
  modelId?: string;
  backendId?: SegmentBackend;
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
      backendId: "fal",
      backendLabel: "fal.ai",
      capabilities: FAL_SAM_CAPABILITIES,
      modelId: DEFAULT_SAM_MODEL_ID,
      modelName: DEFAULT_SAM_MODEL_NAME
    };
  }

  /** Simulate a delay for the stub */
  private static readonly STUB_DELAY_MS = 200;

  async runSegmentation(
    _request: SegmentationRequest,
    _signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    await new Promise((resolve) => setTimeout(resolve, SamServiceStub.STUB_DELAY_MS));

    return { masks: [] };
  }
}

/** Singleton service instance. Replace with real implementation when available. */
let serviceInstance: SamService | null = null;
let currentBackend: SegmentBackend | null = null;
/** True when the instance was set explicitly via setSamService. */
let manualOverride = false;

export function getSamService(backend?: SegmentBackend): SamService {
  const requestedBackend = backend ?? "fal";

  // Return manually-overridden instance unless a specific backend was requested
  if (serviceInstance && manualOverride && backend === undefined) {
    return serviceInstance;
  }

  // Return cached instance if backend matches
  if (serviceInstance && currentBackend === requestedBackend) {
    return serviceInstance;
  }

  let newService: SamService;

  if (requestedBackend === "fal") {
    newService = new SamServiceFal();
  } else {
    // Node-based execution. Falls back to stub if SamServiceNode can't be loaded.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SamServiceNode } = require("./SamServiceNode");
      newService = new SamServiceNode(requestedBackend);
    } catch {
      // Fallback to stub if SamServiceNode can't be loaded
      newService = new SamServiceStub();
    }
  }

  serviceInstance = newService;
  currentBackend = requestedBackend;
  manualOverride = false;
  return newService;
}

/**
 * Override the service instance (useful for testing or switching to a real backend).
 */
export function setSamService(service: SamService): void {
  serviceInstance = service;
  currentBackend = null;
  manualOverride = true;
}
