/**
 * SamServiceNode – SAM service backed by NodeTool node execution.
 *
 * Phase 3 starts with a curated Local SAM3 backend that reuses existing
 * NodeTool metadata, model download, and execution infrastructure.
 */

import useMetadataStore from "../../../stores/MetadataStore";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import type {
  SamBackendCapabilities,
  SamModelInfo,
  SamService,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";
import {
  DEFAULT_SAM_MODEL_ID,
  FAL_SAM_CAPABILITIES,
  LOCAL_SAM3_CAPABILITIES,
  LOCAL_SAM3_MODEL_ID,
  LOCAL_SAM3_MODEL_NAME
} from "./SamService";
import type { SegmentationMask, SegmentBackend } from "../types";
import { getNodeExecutor } from "./NodeExecutor";
import type { GraphNode, GraphEdge } from "./NodeExecutor";
import { resizeForInference, MAX_INFERENCE_DIMENSION } from "./SamServiceFal";

const LOCAL_SAM3_NODE_TYPE = "huggingface.image_segmentation.MaskGeneration";
const LOCAL_SAM3_DOWNLOAD_TYPE = "hf.model";
const LOCAL_SAM3_REQUIRED_INPUTS = [
  "image",
  "model",
  "points_per_side",
  "pred_iou_thresh"
] as const;
const ACTIVE_DOWNLOAD_STATUSES = new Set([
  "pending",
  "running",
  "start",
  "progress"
]);

export interface SamNodeConfig {
  backendId: SegmentBackend;
  nodeType: string;
  displayName: string;
  modelId: string;
  capabilities: SamBackendCapabilities;
  isLocal: boolean;
  requiredSecret: string | null;
}

export const SAM_NODE_CONFIGS: Record<string, SamNodeConfig> = {
  "local-sam3": {
    backendId: "local-sam3",
    nodeType: LOCAL_SAM3_NODE_TYPE,
    displayName: LOCAL_SAM3_MODEL_NAME,
    modelId: LOCAL_SAM3_MODEL_ID,
    capabilities: LOCAL_SAM3_CAPABILITIES,
    isLocal: true,
    requiredSecret: null
  },
  "fal-sam2": {
    backendId: "fal",
    nodeType: "fal.image_to_image.Sam2Image",
    displayName: "SAM 2 (fal.ai Cloud)",
    modelId: DEFAULT_SAM_MODEL_ID,
    capabilities: FAL_SAM_CAPABILITIES,
    isLocal: false,
    requiredSecret: "FAL_API_KEY"
  }
};

export const DEFAULT_SAM_NODE_BACKEND = "local-sam3";

function hasMetadataInputs(
  metadata: { properties?: Array<{ name?: string | null }> } | undefined,
  inputNames: readonly string[]
): boolean {
  if (!metadata?.properties) {
    return false;
  }
  const availableInputs = new Set(
    metadata.properties
      .map((property) => property.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
  );
  return inputNames.every((inputName) => availableInputs.has(inputName));
}

function getDownloadProgress(modelId: string): number | undefined {
  const download = useModelDownloadStore.getState().downloads[modelId];
  if (!download || download.totalBytes <= 0) {
    return undefined;
  }
  return Math.max(
    0,
    Math.min(1, download.downloadedBytes / download.totalBytes)
  );
}

function isModelDownloadActive(modelId: string): boolean {
  const download = useModelDownloadStore.getState().downloads[modelId];
  return download ? ACTIVE_DOWNLOAD_STATUSES.has(download.status) : false;
}

export class SamServiceNode implements SamService {
  private config: SamNodeConfig;

  constructor(backendId: string = DEFAULT_SAM_NODE_BACKEND) {
    const config = SAM_NODE_CONFIGS[backendId];
    if (!config) {
      throw new Error(
        `Unknown SAM backend: ${backendId}. Available: ${Object.keys(SAM_NODE_CONFIGS).join(", ")}`
      );
    }
    this.config = config;
  }

  async checkModelAvailability(): Promise<SamModelInfo> {
    if (this.config.backendId !== "local-sam3") {
      return {
        status: "available",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: this.config.capabilities,
        nodeType: this.config.nodeType,
        modelId: this.config.modelId,
        modelName: this.config.displayName
      };
    }

    const metadata = useMetadataStore
      .getState()
      .getMetadata(this.config.nodeType);

    if (!metadata) {
      return {
        status: "not-installed",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: this.config.capabilities,
        nodeType: this.config.nodeType,
        modelId: this.config.modelId,
        modelName: this.config.displayName,
        errorMessage: "Install or enable the HuggingFace node pack"
      };
    }

    if (!hasMetadataInputs(metadata, LOCAL_SAM3_REQUIRED_INPUTS)) {
      return {
        status: "error",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: this.config.capabilities,
        nodeType: this.config.nodeType,
        modelId: this.config.modelId,
        modelName: this.config.displayName,
        errorMessage: "Local SAM3 node metadata is missing required inputs"
      };
    }

    if (isModelDownloadActive(this.config.modelId)) {
      return {
        status: "downloading",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: this.config.capabilities,
        nodeType: this.config.nodeType,
        modelId: this.config.modelId,
        modelName: this.config.displayName,
        downloadProgress: getDownloadProgress(this.config.modelId),
        errorMessage: "Local SAM3 is not ready"
      };
    }

    await useHfCacheStatusStore.getState().ensureStatuses([
      {
        key: this.config.modelId,
        repo_id: this.config.modelId,
        model_type: LOCAL_SAM3_DOWNLOAD_TYPE
      }
    ]);

    const isCached = Boolean(
      useHfCacheStatusStore.getState().statuses[this.config.modelId]
    );

    if (!isCached) {
      return {
        status: "not-installed",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: this.config.capabilities,
        nodeType: this.config.nodeType,
        modelId: this.config.modelId,
        modelName: this.config.displayName,
        errorMessage: "Local SAM3 is not ready"
      };
    }

    return {
      status: "available",
      backendId: this.config.backendId,
      backendLabel: this.config.displayName,
      capabilities: this.config.capabilities,
      nodeType: this.config.nodeType,
      modelId: this.config.modelId,
      modelName: this.config.displayName
    };
  }

  async runSegmentation(
    request: SegmentationRequest,
    signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    const { dataUrl: resizedUrl, scale } = await resizeForInference(
      request.imageDataUrl,
      MAX_INFERENCE_DIMENSION
    );

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const executor = getNodeExecutor();
    const result = await executor.execute(
      this.buildGraph(resizedUrl, request, scale),
      {},
      signal
    );

    if (!result.success) {
      throw new Error(result.error ?? "Segmentation failed");
    }

    return this.parseResult(result.outputs, scale);
  }

  private buildGraph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (this.config.backendId === "local-sam3") {
      return this.buildLocalSam3Graph(imageDataUrl, request);
    }

    return this.buildFalSam2Graph(imageDataUrl, request, scale);
  }

  private buildLocalSam3Graph(
    imageDataUrl: string,
    request: SegmentationRequest
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const base64Data = imageDataUrl.includes(",")
      ? imageDataUrl.split(",")[1]
      : imageDataUrl;

    return {
      nodes: [
        {
          id: "sam_node",
          type: this.config.nodeType,
          data: {
            image: { type: "image", uri: "", data: base64Data },
            model: this.config.modelId,
            points_per_side: request.settings.pointsPerSide,
            pred_iou_thresh: request.settings.predIouThresh
          }
        }
      ],
      edges: []
    };
  }

  private buildFalSam2Graph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const falPrompts = request.pointPrompts.map((point) => ({
      x: Math.round(point.x * scale),
      y: Math.round(point.y * scale),
      label: point.label === "positive" ? 1 : 0
    }));

    const falBoxPrompts = request.boxPrompt
      ? [
          {
            x: Math.round(request.boxPrompt.x * scale),
            y: Math.round(request.boxPrompt.y * scale),
            width: Math.round(request.boxPrompt.width * scale),
            height: Math.round(request.boxPrompt.height * scale)
          }
        ]
      : [];

    const base64Data = imageDataUrl.includes(",")
      ? imageDataUrl.split(",")[1]
      : imageDataUrl;

    return {
      nodes: [
        {
          id: "sam_node",
          type: "fal.image_to_image.Sam2Image",
          data: {
            image: { type: "image", uri: "", data: base64Data },
            prompts: falPrompts,
            box_prompts: falBoxPrompts,
            sync_mode: true,
            output_format: "png",
            apply_mask: false
          }
        }
      ],
      edges: []
    };
  }

  private parseResult(
    outputs: Record<string, unknown>,
    scale: number
  ): SegmentationResponse {
    const rawOutput = outputs.sam_node;
    if (!rawOutput) {
      return {
        masks: [],
        modelId: this.config.modelId,
        backendId: this.config.backendId
      };
    }

    const imageRecords = this.normalizeOutputImages(rawOutput);
    const invScale = scale > 0 ? 1 / scale : 1;

    const masks: SegmentationMask[] = imageRecords.map((image, index) => ({
      id: `mask_${index}`,
      label: `Mask ${index + 1}`,
      maskDataUrl: image.uri ?? image.url ?? "",
      confidence: 1,
      bounds: {
        x: 0,
        y: 0,
        width: image.width ? Math.round(image.width * invScale) : 0,
        height: image.height ? Math.round(image.height * invScale) : 0
      }
    })).filter((mask) => mask.maskDataUrl.length > 0);

    return {
      masks,
      modelId: this.config.modelId,
      backendId: this.config.backendId
    };
  }

  private normalizeOutputImages(rawOutput: unknown): Array<{
    uri?: string;
    url?: string;
    width?: number;
    height?: number;
  }> {
    if (Array.isArray(rawOutput)) {
      return rawOutput.filter(
        (entry): entry is { uri?: string; url?: string; width?: number; height?: number } =>
          Boolean(entry) && typeof entry === "object"
      );
    }

    if (typeof rawOutput !== "object" || rawOutput === null) {
      return [];
    }

    const record = rawOutput as Record<string, unknown>;
    if (Array.isArray(record.output)) {
      return record.output.filter(
        (entry): entry is { uri?: string; url?: string; width?: number; height?: number } =>
          Boolean(entry) && typeof entry === "object"
      );
    }

    if (record.uri || record.url) {
      return [
        record as {
          uri?: string;
          url?: string;
          width?: number;
          height?: number;
        }
      ];
    }

    return [];
  }
}
