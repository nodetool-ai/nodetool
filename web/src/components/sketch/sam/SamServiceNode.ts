/**
 * SamServiceNode – SAM service backed by NodeTool node execution.
 *
 * Phase 3 starts with a curated Local SAM3 backend that reuses existing
 * NodeTool metadata, model download, and execution infrastructure.
 */

import useMetadataStore from "../../../stores/MetadataStore";
import type { HuggingFaceModel } from "../../../stores/ApiTypes";
import { useAssetStore } from "../../../stores/AssetStore";
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
  LOCAL_SAM3_MODEL_NAME,
  SAM_INLINE_IMAGE_MAX_BYTES
} from "./SamService";
import type { SegmentBackend } from "../types";
import { getNodeExecutor } from "./NodeExecutor";
import type { GraphNode, GraphEdge } from "./NodeExecutor";
import { resizeForInference, MAX_INFERENCE_DIMENSION } from "./SamServiceFal";
import { normalizeSamMasks } from "./normalizeSamMasks";
import { CoordinateMapper } from "../painting/CoordinateMapper";

const LOCAL_SAM3_NODE_TYPE = "huggingface.image_segmentation.MaskGeneration";
const LOCAL_SAM3_DOWNLOAD_TYPE = "hf.model";
const LOCAL_SAM3_REQUIRED_INPUTS = [
  "image",
  "model",
  "points_per_side",
  "pred_iou_thresh"
] as const;
const LOCAL_SAM3_TEXT_PROMPT_INPUTS = ["prompt"] as const;
const LOCAL_SAM3_POINT_PROMPT_INPUTS = ["point_prompts", "points"] as const;
const LOCAL_SAM3_BOX_PROMPT_INPUTS = ["box_prompts", "boxes"] as const;
const ACTIVE_DOWNLOAD_STATUSES = new Set([
  // ModelDownloadStore uses both lifecycle states and streaming event statuses.
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
    nodeType: "fal.image_to_image.Sam3Image",
    displayName: "SAM 3.1 (fal.ai Cloud)",
    modelId: DEFAULT_SAM_MODEL_ID,
    capabilities: FAL_SAM_CAPABILITIES,
    isLocal: false,
    requiredSecret: "FAL_API_KEY"
  }
};

export const DEFAULT_SAM_NODE_BACKEND = "local-sam3";

interface NodeMetadataLike {
  properties?: Array<{ name?: string | null }>;
}

interface LocalSam3PromptMetadata {
  capabilities: SamBackendCapabilities;
  pointPromptsInputName: string | null;
  boxPromptsInputName: string | null;
  textPromptInputName: string | null;
}

function getMetadataInputNames(metadata: NodeMetadataLike | undefined): Set<string> {
  if (!metadata?.properties) {
    return new Set();
  }
  return new Set(
    metadata.properties
      .map((property) => property.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
  );
}

function getFirstAvailableInputName(
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

function hasMetadataInputs(
  metadata: NodeMetadataLike | undefined,
  inputNames: readonly string[]
): boolean {
  const availableInputs = getMetadataInputNames(metadata);
  return inputNames.every((inputName) => availableInputs.has(inputName));
}

function getLocalSam3PromptMetadata(
  metadata: NodeMetadataLike | undefined
): LocalSam3PromptMetadata {
  const availableInputs = getMetadataInputNames(metadata);
  const textPromptInputName = getFirstAvailableInputName(
    availableInputs,
    LOCAL_SAM3_TEXT_PROMPT_INPUTS
  );
  const pointPromptsInputName = getFirstAvailableInputName(
    availableInputs,
    LOCAL_SAM3_POINT_PROMPT_INPUTS
  );
  const boxPromptsInputName = getFirstAvailableInputName(
    availableInputs,
    LOCAL_SAM3_BOX_PROMPT_INPUTS
  );

  return {
    capabilities: {
      ...LOCAL_SAM3_CAPABILITIES,
      textPrompts: textPromptInputName !== null,
      pointPrompts: pointPromptsInputName !== null,
      boxPrompts: boxPromptsInputName !== null
    },
    textPromptInputName,
    pointPromptsInputName,
    boxPromptsInputName
  };
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

    const promptMetadata = getLocalSam3PromptMetadata(metadata);

    if (isModelDownloadActive(this.config.modelId)) {
      return {
        status: "downloading",
        backendId: this.config.backendId,
        backendLabel: this.config.displayName,
        capabilities: promptMetadata.capabilities,
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
        capabilities: promptMetadata.capabilities,
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
      capabilities: promptMetadata.capabilities,
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
    const graph = await this.buildGraph(resizedUrl, request, scale);
    const result = await executor.execute(
      graph,
      {},
      signal
    );

    if (!result.success) {
      throw new Error(result.error ?? "Segmentation failed");
    }

    return normalizeSamMasks({
      rawOutput: result.outputs.sam_node,
      backendId: this.config.backendId,
      modelId: this.config.modelId,
      nodeType: this.config.nodeType,
      scale,
      sourceMetadata: request.sourceMetadata
    });
  }

  private buildGraph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    if (this.config.backendId === "local-sam3") {
      const metadata = useMetadataStore
        .getState()
        .getMetadata(this.config.nodeType);
      if (!metadata) {
        throw new Error("Local SAM3 node metadata is unavailable");
      }
      if (!hasMetadataInputs(metadata, LOCAL_SAM3_REQUIRED_INPUTS)) {
        throw new Error("Local SAM3 node metadata is missing required inputs");
      }
      return this.buildLocalSam3Graph(
        imageDataUrl,
        request,
        scale,
        getLocalSam3PromptMetadata(metadata)
      );
    }

    return Promise.resolve(this.buildFalSam2Graph(imageDataUrl, request, scale));
  }

  private async buildLocalSam3Graph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number,
    promptMetadata: LocalSam3PromptMetadata
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodeData: Record<string, unknown> = {
      image: await this.buildLocalSam3ImageInput(imageDataUrl),
      model: {
        type: "hf.model",
        repo_id: this.config.modelId
      } as HuggingFaceModel,
      points_per_side: request.settings.pointsPerSide,
      pred_iou_thresh: request.settings.predIouThresh
    };

    if (
      promptMetadata.textPromptInputName
    ) {
      const trimmedConceptPrompt = request.settings.conceptPrompt.trim();
      if (trimmedConceptPrompt.length > 0) {
        nodeData[promptMetadata.textPromptInputName] = trimmedConceptPrompt;
      }
    }

    if (
      promptMetadata.pointPromptsInputName &&
      request.pointPrompts.length > 0
    ) {
      nodeData[promptMetadata.pointPromptsInputName] = this.buildLocalSam3PointPrompts(
        request,
        scale
      );
    }

    if (promptMetadata.boxPromptsInputName && request.boxPrompt) {
      nodeData[promptMetadata.boxPromptsInputName] = [
        this.buildLocalSam3BoxPrompt(
          request.boxPrompt,
          request.sourceMetadata,
          scale
        )
      ];
    }

    return {
      nodes: [
        {
          id: "sam_node",
          type: this.config.nodeType,
          data: nodeData
        }
      ],
      edges: []
    };
  }

  private buildLocalSam3PointPrompts(
    request: SegmentationRequest,
    scale: number
  ): Array<{ x: number; y: number; label: 0 | 1 }> {
    const promptMapper = this.createPromptMapper(request.sourceMetadata);
    return request.pointPrompts.map((point) => {
      const mappedPoint = this.mapPromptPointToSourceImage(point, promptMapper);
      return {
        x: Math.round(mappedPoint.x * scale),
        y: Math.round(mappedPoint.y * scale),
        label: point.label === "positive" ? 1 : 0
      };
    });
  }

  private buildLocalSam3BoxPrompt(
    boxPrompt: NonNullable<SegmentationRequest["boxPrompt"]>,
    sourceMetadata: SegmentationRequest["sourceMetadata"],
    scale: number
  ): { x: number; y: number; width: number; height: number } {
    const promptMapper = this.createPromptMapper(sourceMetadata);
    // Map all four corners before taking min/max so rotated or affine-transformed
    // source layers still produce a correct axis-aligned box in source-image space.
    const corners = [
      this.mapPromptPointToSourceImage({ x: boxPrompt.x, y: boxPrompt.y }, promptMapper),
      this.mapPromptPointToSourceImage(
        { x: boxPrompt.x + boxPrompt.width, y: boxPrompt.y },
        promptMapper
      ),
      this.mapPromptPointToSourceImage(
        { x: boxPrompt.x, y: boxPrompt.y + boxPrompt.height },
        promptMapper
      ),
      this.mapPromptPointToSourceImage(
        { x: boxPrompt.x + boxPrompt.width, y: boxPrompt.y + boxPrompt.height },
        promptMapper
      )
    ];
    const minX = Math.min(...corners.map((corner) => corner.x));
    const minY = Math.min(...corners.map((corner) => corner.y));
    const maxX = Math.max(...corners.map((corner) => corner.x));
    const maxY = Math.max(...corners.map((corner) => corner.y));

    return {
      x: Math.round(minX * scale),
      y: Math.round(minY * scale),
      width: Math.round((maxX - minX) * scale),
      height: Math.round((maxY - minY) * scale)
    };
  }

  private mapPromptPointToSourceImage(
    point: { x: number; y: number },
    promptMapper: CoordinateMapper | null
  ): { x: number; y: number } {
    if (!promptMapper) {
      return point;
    }

    return promptMapper.docToLayer(point);
  }

  private createPromptMapper(
    sourceMetadata: SegmentationRequest["sourceMetadata"]
  ): CoordinateMapper | null {
    if (!sourceMetadata) {
      return null;
    }

    return new CoordinateMapper({
      layerTransform: sourceMetadata.layerTransform,
      rasterBounds: {
        x: sourceMetadata.contentBounds.x,
        y: sourceMetadata.contentBounds.y
      }
    });
  }

  private async buildLocalSam3ImageInput(imageDataUrl: string): Promise<{
    type: "image";
    uri?: string;
    asset_id?: string | null;
    data?: string | null;
    mimeType?: string;
  }> {
    const base64Data = imageDataUrl.includes(",")
      ? imageDataUrl.split(",")[1]
      : imageDataUrl;
    const mimeType = this.getDataUrlMimeType(imageDataUrl);
    const byteLength = this.getBase64ByteLength(base64Data);

    if (byteLength <= SAM_INLINE_IMAGE_MAX_BYTES) {
      return {
        type: "image",
        uri: "",
        data: base64Data,
        mimeType
      };
    }

    const asset = await useAssetStore
      .getState()
      .createAsset(await this.createFileFromDataUrl(imageDataUrl));

    return {
      type: "image",
      uri: asset.get_url ?? `asset://${asset.id}`,
      asset_id: asset.id,
      data: null,
      mimeType
    };
  }

  private async createFileFromDataUrl(dataUrl: string): Promise<File> {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error(
        "Invalid segmentation image data; expected data URL format: data:mime/type;base64,..."
      );
    }

    const [, mimeType] = match;
    const blob = await fetch(dataUrl).then((response) => {
      if (!response.ok) {
        throw new Error("Failed to convert segmentation image data into a blob");
      }
      return response.blob();
    });

    const extension = mimeType.split("/")[1] ?? "png";
    return new File([blob], `sam-input.${extension}`, {
      type: mimeType
    });
  }

  private getDataUrlMimeType(dataUrl: string): string | undefined {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match?.[1];
  }

  private getBase64ByteLength(base64Data: string): number {
    const padding =
      base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64Data.length * 3) / 4) - padding);
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
    const trimmedConceptPrompt = request.settings.conceptPrompt.trim();

    return {
      nodes: [
        {
          id: "sam_node",
          type: "fal.image_to_image.Sam3Image",
          data: {
            image: { type: "image", uri: "", data: base64Data },
            point_prompts: falPrompts,
            box_prompts: falBoxPrompts,
            sync_mode: true,
            output_format: "png",
            apply_mask: false,
            return_multiple_masks: request.settings.maxObjects > 1,
            max_masks: request.settings.maxObjects,
            include_scores: true,
            include_boxes: true,
            ...(trimmedConceptPrompt.length > 0
              ? { prompt: trimmedConceptPrompt }
              : {})
          }
        }
      ],
      edges: []
    };
  }
}
