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
  SegmentationSourceMetadata,
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

export interface NodeMetadataInputLike {
  name?: string | null;
}

export interface NodeMetadataLike {
  properties?: NodeMetadataInputLike[];
}

interface ResolveSamPromptCapabilityInputsParams {
  metadata: NodeMetadataLike | undefined;
  baseCapabilities: SamBackendCapabilities;
  textPromptInputs?: readonly string[];
  pointPromptInputs?: readonly string[];
  boxPromptInputs?: readonly string[];
}

export interface ResolvedSamPromptCapabilityInputs {
  capabilities: SamBackendCapabilities;
  textPromptInputName: string | null;
  pointPromptsInputName: string | null;
  boxPromptsInputName: string | null;
}

export function getMetadataInputNames(metadata: NodeMetadataLike | undefined): Set<string> {
  if (!metadata?.properties) {
    return new Set();
  }
  return new Set(
    metadata.properties
      .map((property) => property.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
  );
}

export function getFirstAvailableInputName(
  availableInputs: Set<string>,
  inputNames: readonly string[]
): string | null {
  for (const inputName of inputNames) {
    if (availableInputs.has(inputName)) {
      return inputName;
    }
  }
  return null;
}

export function hasMetadataInputs(
  metadata: NodeMetadataLike | undefined,
  inputNames: readonly string[]
): boolean {
  const availableInputs = getMetadataInputNames(metadata);
  return inputNames.every((inputName) => availableInputs.has(inputName));
}

export function resolveSamPromptCapabilityInputs({
  metadata,
  baseCapabilities,
  textPromptInputs = [],
  pointPromptInputs = [],
  boxPromptInputs = []
}: ResolveSamPromptCapabilityInputsParams): ResolvedSamPromptCapabilityInputs {
  const availableInputs = getMetadataInputNames(metadata);
  const textPromptInputName = getFirstAvailableInputName(
    availableInputs,
    textPromptInputs
  );
  const pointPromptsInputName = getFirstAvailableInputName(
    availableInputs,
    pointPromptInputs
  );
  const boxPromptsInputName = getFirstAvailableInputName(
    availableInputs,
    boxPromptInputs
  );

  return {
    capabilities: {
      ...baseCapabilities,
      textPrompts: textPromptInputName !== null,
      pointPrompts: pointPromptsInputName !== null,
      boxPrompts: boxPromptsInputName !== null
    },
    textPromptInputName,
    pointPromptsInputName,
    boxPromptsInputName
  };
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

export function getDefaultSamModelId(
  backend: SegmentBackend | undefined
): string {
  return backend === "local-sam3"
    ? LOCAL_SAM3_MODEL_ID
    : DEFAULT_SAM_MODEL_ID;
}

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
  /** Original source-layer metadata when available. */
  sourceMetadata?: SegmentationSourceMetadata;
}

export interface SegmentationResponse {
  masks: SegmentationMask[];
  modelId?: string;
  backendId?: SegmentBackend;
  nodeType?: string;
  sourceMetadata?: SegmentationSourceMetadata;
  previewImageUrl?: string;
  providerMetadata?: unknown;
  providerRle?: string | string[] | null;
  providerScores?: number[];
  providerBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
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

    return {
      masks: [],
      modelId: DEFAULT_SAM_MODEL_ID,
      backendId: "fal"
    };
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
