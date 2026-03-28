/**
 * SamServiceNode – SAM service that uses nodetool nodes for inference.
 *
 * Instead of calling the fal.ai API directly, this service builds a
 * mini-workflow graph with a SAM segmentation node and runs it through
 * the NodeExecutor abstraction.
 *
 * Benefits:
 * - Supports any SAM backend that has a nodetool node (fal.ai, HuggingFace local, etc.)
 * - Reuses the existing node execution infrastructure
 * - Can be swapped to API calls when sketch editor is standalone
 *
 * Supported node types:
 * - "fal.image_to_image.Sam2Image" – fal.ai cloud SAM 2 (requires FAL_API_KEY)
 * - "huggingface.image_segmentation.SAM2Segmentation" – local HuggingFace SAM 2
 */

import type {
  SamService,
  SamModelInfo,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";
import { DEFAULT_SAM_MODEL_ID } from "./SamService";
import type { SegmentationMask } from "../types";
import { getNodeExecutor } from "./NodeExecutor";
import type { GraphNode, GraphEdge } from "./NodeExecutor";
import { resizeForInference, MAX_INFERENCE_DIMENSION } from "./SamServiceFal";

// ─── Supported Node Backends ──────────────────────────────────────────────────

export interface SamNodeConfig {
  /** The nodetool node type to use for segmentation. */
  nodeType: string;
  /** Human-readable name for UI display. */
  displayName: string;
  /** Whether this backend runs locally (no API key needed). */
  isLocal: boolean;
  /** Required secret key name (e.g. "FAL_API_KEY"), or null for local. */
  requiredSecret: string | null;
}

/** Available SAM node backends. */
export const SAM_NODE_CONFIGS: Record<string, SamNodeConfig> = {
  "fal-sam2": {
    nodeType: "fal.image_to_image.Sam2Image",
    displayName: "SAM 2 (fal.ai Cloud)",
    isLocal: false,
    requiredSecret: "FAL_API_KEY"
  },
  "hf-sam2": {
    nodeType: "huggingface.image_segmentation.SAM2Segmentation",
    displayName: "SAM 2 (Local HuggingFace)",
    isLocal: true,
    requiredSecret: null
  }
};

export const DEFAULT_SAM_NODE_BACKEND = "fal-sam2";

// ─── SamServiceNode Implementation ───────────────────────────────────────────

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
    // For cloud models, check if the required API key is configured
    if (this.config.requiredSecret) {
      const hasKey = await this.checkSecret(this.config.requiredSecret);
      if (!hasKey) {
        return {
          status: "not-installed",
          modelId: DEFAULT_SAM_MODEL_ID,
          modelName: this.config.displayName,
          errorMessage: `${this.config.requiredSecret} not configured. Add it in Settings → Secrets.`
        };
      }
    }

    // For local models, assume availability if the backend is running
    return {
      status: "available",
      modelId: DEFAULT_SAM_MODEL_ID,
      modelName: this.config.displayName
    };
  }

  async runSegmentation(
    request: SegmentationRequest,
    signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    // 1. Resize image if needed (large image guardrail)
    const { dataUrl: resizedUrl, scale } = await resizeForInference(
      request.imageDataUrl,
      MAX_INFERENCE_DIMENSION
    );

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // 2. Build the graph for this specific node type
    const { nodes, edges } = this.buildGraph(resizedUrl, request, scale);

    // 3. Execute via NodeExecutor
    const executor = getNodeExecutor();
    const result = await executor.execute({ nodes, edges }, {}, signal);

    if (!result.success) {
      throw new Error(result.error ?? "Segmentation failed");
    }

    // 4. Parse the result into masks
    return this.parseResult(result.outputs, scale);
  }

  // ─── Graph Building ─────────────────────────────────────────────────────────

  private buildGraph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (this.config.nodeType === "fal.image_to_image.Sam2Image") {
      return this.buildFalSam2Graph(imageDataUrl, request, scale);
    }
    if (
      this.config.nodeType ===
      "huggingface.image_segmentation.SAM2Segmentation"
    ) {
      return this.buildHfSam2Graph(imageDataUrl);
    }
    throw new Error(`No graph builder for node type: ${this.config.nodeType}`);
  }

  /**
   * Build a graph for the fal.ai SAM 2 node.
   * Node type: fal.image_to_image.Sam2Image
   * Inputs: image, prompts, box_prompts, sync_mode, output_format, apply_mask
   * Output: output (image)
   */
  private buildFalSam2Graph(
    imageDataUrl: string,
    request: SegmentationRequest,
    scale: number
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    // Convert point prompts to fal format
    const falPrompts = request.pointPrompts.map((p) => ({
      x: Math.round(p.x * scale),
      y: Math.round(p.y * scale),
      label: p.label === "positive" ? 1 : 0
    }));

    // Convert box prompts to fal format
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

    // Extract base64 data from data URL
    const base64Data = imageDataUrl.includes(",")
      ? imageDataUrl.split(",")[1]
      : imageDataUrl;

    const samNode: GraphNode = {
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
    };

    return {
      nodes: [samNode],
      edges: []
    };
  }

  /**
   * Build a graph for the HuggingFace local SAM 2 node.
   * Node type: huggingface.image_segmentation.SAM2Segmentation
   * Inputs: image
   * Output: output (list of images/masks)
   */
  private buildHfSam2Graph(
    imageDataUrl: string
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const base64Data = imageDataUrl.includes(",")
      ? imageDataUrl.split(",")[1]
      : imageDataUrl;

    const samNode: GraphNode = {
      id: "sam_node",
      type: "huggingface.image_segmentation.SAM2Segmentation",
      data: {
        image: { type: "image", uri: "", data: base64Data }
      }
    };

    return {
      nodes: [samNode],
      edges: []
    };
  }

  // ─── Result Parsing ─────────────────────────────────────────────────────────

  private parseResult(
    outputs: Record<string, unknown>,
    scale: number
  ): SegmentationResponse {
    // The SAM node output is keyed by node ID
    const samOutput = outputs["sam_node"];
    if (!samOutput) {
      return { masks: [] };
    }

    // Output can be:
    // - { output: { type: "image", uri: "..." } }  (single image from fal)
    // - { output: [{ type: "image", uri: "..." }, ...] }  (list from hf)
    // - { type: "image", uri: "..." }  (direct image ref)
    // - [{ type: "image", uri: "..." }, ...]  (direct list)

    const raw = samOutput as Record<string, unknown>;
    let images: Array<{
      uri?: string;
      url?: string;
      width?: number;
      height?: number;
    }> = [];

    if (raw.output) {
      if (Array.isArray(raw.output)) {
        images = raw.output;
      } else if (typeof raw.output === "object" && raw.output !== null) {
        images = [
          raw.output as {
            uri?: string;
            width?: number;
            height?: number;
          }
        ];
      }
    } else if (Array.isArray(raw)) {
      images = raw;
    } else if (raw.uri || raw.url) {
      images = [
        raw as {
          uri?: string;
          url?: string;
          width?: number;
          height?: number;
        }
      ];
    }

    if (images.length === 0) {
      return { masks: [] };
    }

    const invScale = scale > 0 ? 1 / scale : 1;

    const masks: SegmentationMask[] = images.map((img, i) => {
      const uri = img.uri ?? img.url ?? "";
      const width = img.width ? Math.round(img.width * invScale) : 0;
      const height = img.height ? Math.round(img.height * invScale) : 0;

      return {
        id: `mask_${i}`,
        label: `Object ${i + 1}`,
        maskDataUrl: uri,
        confidence: 1.0,
        bounds: {
          x: 0,
          y: 0,
          width,
          height
        }
      };
    });

    return { masks };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async checkSecret(secretKey: string): Promise<boolean> {
    try {
      // Dynamic import to avoid circular deps
      const SecretsStore = (await import("../../../stores/SecretsStore"))
        .default;
      const secrets = SecretsStore.getState().secrets;
      return secrets.some(
        (s: { key: string; value?: string }) =>
          s.key === secretKey && s.value !== undefined && s.value !== ""
      );
    } catch {
      // Store not available (e.g., in tests)
      return false;
    }
  }
}
