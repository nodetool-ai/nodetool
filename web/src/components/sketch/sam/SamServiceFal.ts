/**
 * SamServiceFal – real FAL AI backend integration for SAM 3.1 segmentation.
 *
 * Calls the fal-ai/sam-3-1/image endpoint via its REST queue API.
 * FAL_API_KEY is loaded via GET /api/settings/secrets/FAL_API_KEY?decrypt=true (not in list payload).
 *
 * This service handles:
 * - Model availability checking (via queue health)
 * - Image resizing for large images (guardrails)
 * - Point and box prompt translation to FAL format
 * - Mask response parsing into SegmentationMask[]
 */

import type { SamService, SamModelInfo, SegmentationRequest, SegmentationResponse } from "./SamService";
import {
  DEFAULT_SAM_MODEL_ID,
  DEFAULT_SAM_MODEL_NAME,
  FAL_SAM_CAPABILITIES,
  resolveSamPromptCapabilityInputs
} from "./SamService";
import type { SegmentationMask } from "../types";
import useMetadataStore from "../../../stores/MetadataStore";
import useSecretsStore from "../../../stores/SecretsStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const FAL_API_BASE = "https://queue.fal.run";
const FAL_RESULT_BASE = "https://queue.fal.run";
const SAM31_ENDPOINT = "fal-ai/sam-3-1/image";
const SAM31_RLE_ENDPOINT = "fal-ai/sam-3-1/image-rle";
const FAL_SAM_NODE_TYPE = "fal.image_to_image.Sam3Image";
const FAL_SAM_RLE_NODE_TYPE = "fal.image_to_image.Sam3ImageRle";
const FAL_SAM_TEXT_PROMPT_INPUTS = ["prompt"] as const;
const FAL_SAM_POINT_PROMPT_INPUTS = ["point_prompts"] as const;
const FAL_SAM_BOX_PROMPT_INPUTS = ["box_prompts"] as const;
const FAL_SAM_METADATA_FALLBACK_CAPABILITIES = {
  ...FAL_SAM_CAPABILITIES,
  textPrompts: false,
  pointPrompts: false,
  boxPrompts: false
} as const;

/**
 * Maximum image dimension (width or height) sent to the model.
 * Images larger than this are downscaled to fit before submission.
 */
export const MAX_INFERENCE_DIMENSION = 2048;

/** Maximum time to wait for inline execution before timing out (ms). */
const _EXECUTION_TIMEOUT_MS = 120_000;

/** Polling interval for queue status (ms). */
const QUEUE_POLL_INTERVAL_MS = 1000;

/** Maximum time to wait for a queued job (ms). */
const QUEUE_TIMEOUT_MS = 120_000;

interface FalPointPrompt {
  x: number;
  y: number;
  label: number; // 1 = positive, 0 = negative
}

interface FalBoxPrompt {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FalQueueResponse {
  request_id: string;
  status: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_url?: string;
  logs?: Array<{ message: string }>;
}

interface FalResultImage {
  url: string;
  width: number;
  height: number;
  content_type?: string;
}

interface FalMaskMetadata {
  label?: string;
  name?: string;
  score?: number;
  box?: unknown;
  bbox?: unknown;
  bounds?: unknown;
}

interface FalSam3Result {
  masks?: FalResultImage[];
  image?: FalResultImage;
  metadata?: unknown;
  scores?: unknown;
  boxes?: unknown;
  rle?: unknown;
}

interface FalNormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJsonValue<T>(value: unknown): T | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      // Provider SAM fields may arrive as JSON-encoded strings or already-parsed
      // objects; treat invalid JSON payloads as absent optional metadata and
      // return null for invalid JSON or null/undefined inputs.
      return null;
    }
  }
  return value as T;
}

/**
 * Normalize provider confidence scores from either a JSON string payload or an
 * already-parsed array, discarding invalid or non-finite entries.
 */
function normalizeFalScores(value: unknown): number[] {
  const parsed = parseJsonValue<unknown>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : null))
    .filter((entry): entry is number => entry !== null);
}

function normalizeFalMetadataEntries(value: unknown): FalMaskMetadata[] {
  const parsed = parseJsonValue<unknown>(value);
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (entry): entry is FalMaskMetadata =>
        entry !== null && typeof entry === "object"
    );
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as FalMaskMetadata];
  }
  return [];
}

function normalizeFalBoxes(
  value: unknown,
  fallbackMasks: FalResultImage[],
  scale: number
): FalNormalizedBox[] {
  const parsed = parseJsonValue<unknown>(value);
  if (!Array.isArray(parsed)) {
    return fallbackMasks.map((mask) => ({
      x: 0,
      y: 0,
      width: Math.round(mask.width * (scale > 0 ? 1 / scale : 1)),
      height: Math.round(mask.height * (scale > 0 ? 1 / scale : 1))
    }));
  }

  const invScale = scale > 0 ? 1 / scale : 1;
  return parsed.map((entry, index) => {
    const fallbackMask = fallbackMasks[index];
    const fallbackBox: FalNormalizedBox = {
      x: 0,
      y: 0,
      width: Math.round((fallbackMask?.width ?? 0) * invScale),
      height: Math.round((fallbackMask?.height ?? 0) * invScale)
    };

    if (Array.isArray(entry) && entry.length >= 4) {
      const [cx, cy, width, height] = entry;
      if (
        typeof cx === "number" &&
        Number.isFinite(cx) &&
        typeof cy === "number" &&
        Number.isFinite(cy) &&
        typeof width === "number" &&
        Number.isFinite(width) &&
        typeof height === "number" &&
        Number.isFinite(height)
      ) {
        const maskWidth = fallbackMask?.width ?? 0;
        const maskHeight = fallbackMask?.height ?? 0;
        return {
          // fal SAM 3.1 returns normalized [0..1] [cx, cy, w, h]; e.g.
          // [0.5, 0.5, 0.5, 0.5] covers the centered middle quarter. Convert
          // that center-based box back to top-left pixel bounds in the resized
          // mask image before undoing resizeForInference's scale factor.
          x: Math.round((cx - width / 2) * maskWidth * invScale),
          y: Math.round((cy - height / 2) * maskHeight * invScale),
          width: Math.round(width * maskWidth * invScale),
          height: Math.round(height * maskHeight * invScale)
        };
      }
    }

    if (entry && typeof entry === "object") {
      const candidate = entry as Record<string, unknown>;
      if (
        isFiniteNumber(candidate.x) &&
        isFiniteNumber(candidate.y) &&
        isFiniteNumber(candidate.width) &&
        isFiniteNumber(candidate.height)
      ) {
        return {
          x: Math.round(candidate.x * invScale),
          y: Math.round(candidate.y * invScale),
          width: Math.round(candidate.width * invScale),
          height: Math.round(candidate.height * invScale)
        };
      }
    }

    return fallbackBox;
  });
}

function normalizeFalRle(value: unknown): string | string[] | null {
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "string" && parsed.length > 0) {
        return parsed;
      }
      if (Array.isArray(parsed)) {
        const entries = parsed.filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0
        );
        return entries.length > 0 ? entries : value;
      }
      return value;
    } catch {
      return value;
    }
  }
  const parsed = parseJsonValue<unknown>(value);
  if (typeof parsed === "string" && parsed.length > 0) {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    const entries = parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    return entries.length > 0 ? entries : null;
  }
  return null;
}

function normalizeFalMetadataBox(
  value: unknown,
  fallbackMask: FalResultImage | undefined,
  scale: number
): FalNormalizedBox | null {
  const invScale = scale > 0 ? 1 / scale : 1;
  if (Array.isArray(value) && value.length >= 4) {
    const [cx, cy, width, height] = value;
    if (
      isFiniteNumber(cx) &&
      isFiniteNumber(cy) &&
      isFiniteNumber(width) &&
      isFiniteNumber(height)
    ) {
      const maskWidth = fallbackMask?.width ?? 0;
      const maskHeight = fallbackMask?.height ?? 0;
      return {
        x: Math.round((cx - width / 2) * maskWidth * invScale),
        y: Math.round((cy - height / 2) * maskHeight * invScale),
        width: Math.round(width * maskWidth * invScale),
        height: Math.round(height * maskHeight * invScale)
      };
    }
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const x = candidate.x;
    const y = candidate.y;
    const width = candidate.width;
    const height = candidate.height;
    if (
      isFiniteNumber(x) &&
      isFiniteNumber(y) &&
      isFiniteNumber(width) &&
      isFiniteNumber(height)
    ) {
      return {
        x: Math.round(x * invScale),
        y: Math.round(y * invScale),
        width: Math.round(width * invScale),
        height: Math.round(height * invScale)
      };
    }
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load FAL_API_KEY via GET /api/settings/secrets/{key}?decrypt=true.
 * The secrets list endpoint never includes decrypted values (metadata only).
 */
async function resolveFalApiKey(): Promise<string | null> {
  try {
    return await useSecretsStore.getState().fetchDecryptedSecret("FAL_API_KEY");
  } catch {
    return null;
  }
}

async function isFalApiKeyConfigured(): Promise<boolean> {
  const store = useSecretsStore.getState();
  const secrets = Array.isArray(store.secrets) ? store.secrets : [];
  const currentSecret = secrets.find((secret) => secret.key === "FAL_API_KEY");
  if (currentSecret) {
    return currentSecret.is_configured;
  }
  try {
    const secrets = await store.fetchSecrets();
    return Boolean(secrets.find((secret) => secret.key === "FAL_API_KEY")?.is_configured);
  } catch {
    return false;
  }
}

function getFalSamCapabilities() {
  const metadata = useMetadataStore.getState().getMetadata(FAL_SAM_NODE_TYPE);
  if (!metadata) {
    return FAL_SAM_METADATA_FALLBACK_CAPABILITIES;
  }
  return resolveSamPromptCapabilityInputs({
    metadata,
    baseCapabilities: FAL_SAM_CAPABILITIES,
    textPromptInputs: FAL_SAM_TEXT_PROMPT_INPUTS,
    pointPromptInputs: FAL_SAM_POINT_PROMPT_INPUTS,
    boxPromptInputs: FAL_SAM_BOX_PROMPT_INPUTS
  }).capabilities;
}

/**
 * Resize an image data URL if it exceeds MAX_INFERENCE_DIMENSION.
 * Returns the (possibly resized) data URL and the scale factor applied.
 */
export async function resizeForInference(
  dataUrl: string,
  maxDim: number = MAX_INFERENCE_DIMENSION
): Promise<{ dataUrl: string; scale: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve({ dataUrl, scale: 1 });
        return;
      }

      const scale = maxDim / Math.max(width, height);
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to create canvas context for resize"));
        return;
      }
      ctx.drawImage(img, 0, 0, newW, newH);
      resolve({ dataUrl: canvas.toDataURL("image/png"), scale });
    };
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = dataUrl;
  });
}

/**
 * Upload a data URL to fal.ai storage and return the CDN URL.
 */
async function uploadToFal(
  dataUrl: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const uploadRes = await fetch("https://fal.run/fal-ai/file-storage/upload", {
    method: "PUT",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": blob.type || "image/png"
    },
    body: blob,
    signal
  });

  if (!uploadRes.ok) {
    throw new Error(`FAL upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
  }

  const uploadData = await uploadRes.json();
  const resultUrl = uploadData.url ?? uploadData.access_url ?? uploadData.file_url;
  if (!resultUrl) {
    throw new Error("FAL upload succeeded but no URL returned in response");
  }
  return resultUrl;
}

// ─── SamServiceFal Implementation ─────────────────────────────────────────────

export class SamServiceFal implements SamService {
  async checkModelAvailability(): Promise<SamModelInfo> {
    const capabilities = getFalSamCapabilities();
    const hasConfiguredSecret = await isFalApiKeyConfigured();

    if (!hasConfiguredSecret) {
      return {
        status: "not-installed",
        backendId: "fal",
        backendLabel: "fal.ai",
        capabilities,
        modelId: DEFAULT_SAM_MODEL_ID,
        modelName: DEFAULT_SAM_MODEL_NAME,
        errorMessage: "FAL_API_KEY not configured. Add it in Settings → Secrets."
      };
    }

    // Test connectivity by checking the queue endpoint
    try {
      const apiKey = await resolveFalApiKey();
      if (!apiKey) {
        return {
          status: "not-installed",
          backendId: "fal",
          backendLabel: "fal.ai",
          capabilities,
          modelId: DEFAULT_SAM_MODEL_ID,
          modelName: DEFAULT_SAM_MODEL_NAME,
          errorMessage: "FAL_API_KEY not configured. Add it in Settings → Secrets."
        };
      }
      const res = await fetch(`${FAL_API_BASE}/${SAM31_ENDPOINT}`, {
        method: "OPTIONS",
        headers: { Authorization: `Key ${apiKey}` }
      });
      // Any non-error response means the endpoint exists
      if (res.ok || res.status === 405 || res.status === 200) {
        return {
          status: "available",
          backendId: "fal",
          backendLabel: "fal.ai",
          capabilities,
          modelId: DEFAULT_SAM_MODEL_ID,
          modelName: DEFAULT_SAM_MODEL_NAME
        };
      }
      return {
        status: "error",
        backendId: "fal",
        backendLabel: "fal.ai",
        capabilities,
        modelId: DEFAULT_SAM_MODEL_ID,
        modelName: DEFAULT_SAM_MODEL_NAME,
        errorMessage: `FAL API returned ${res.status}`
      };
    } catch (err) {
      return {
        status: "error",
        backendId: "fal",
        backendLabel: "fal.ai",
        capabilities,
        modelId: DEFAULT_SAM_MODEL_ID,
        modelName: DEFAULT_SAM_MODEL_NAME,
        errorMessage: err instanceof Error ? err.message : "Connection failed"
      };
    }
  }

  async runSegmentation(
    request: SegmentationRequest,
    signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    const apiKey = await resolveFalApiKey();
    if (!apiKey) {
      throw new Error("FAL_API_KEY not configured");
    }

    // 1. Resize image if needed (large image guardrail)
    const { dataUrl: resizedUrl, scale } = await resizeForInference(
      request.imageDataUrl
    );

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // 2. Upload image to fal storage
    const imageUrl = await uploadToFal(resizedUrl, apiKey, signal);

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // 3. Build FAL request
    const falPrompts: FalPointPrompt[] = request.pointPrompts.map((p) => ({
      x: Math.round(p.x * scale),
      y: Math.round(p.y * scale),
      label: p.label === "positive" ? 1 : 0
    }));

    const falBoxPrompts: FalBoxPrompt[] = request.boxPrompt
      ? [
          {
            x: Math.round(request.boxPrompt.x * scale),
            y: Math.round(request.boxPrompt.y * scale),
            width: Math.round(request.boxPrompt.width * scale),
            height: Math.round(request.boxPrompt.height * scale)
          }
        ]
      : [];

    const falInput: Record<string, unknown> = {
      image_url: imageUrl,
      sync_mode: true,
      output_format: "png",
      return_multiple_masks: request.settings.maxObjects > 1,
      max_masks: request.settings.maxObjects,
      include_scores: true,
      include_boxes: true,
      apply_mask: false
    };

    const trimmedConceptPrompt = request.settings.conceptPrompt.trim();
    if (trimmedConceptPrompt.length > 0) {
      falInput.prompt = trimmedConceptPrompt;
    }
    if (falPrompts.length > 0) {
      falInput.point_prompts = falPrompts;
    }
    if (falBoxPrompts.length > 0) {
      falInput.box_prompts = falBoxPrompts;
    }

    // 4. Submit to FAL queue
    const submitRes = await fetch(`${FAL_API_BASE}/${SAM31_ENDPOINT}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(falInput),
      signal
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`FAL segmentation failed: ${submitRes.status} ${errorText}`);
    }

    const submitData = await submitRes.json();

    // If sync_mode returned the result directly
    if (submitData.masks || submitData.image || submitData.rle) {
      return this.parseResult(submitData as FalSam3Result, scale);
    }

    // Otherwise, poll the queue
    const requestId = (submitData as FalQueueResponse).request_id;
    if (!requestId) {
      throw new Error("FAL returned no request_id and no inline result");
    }

    return this.pollForResult(requestId, apiKey, scale, signal);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async pollForResult(
    requestId: string,
    apiKey: string,
    scale: number,
    signal?: AbortSignal
  ): Promise<SegmentationResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < QUEUE_TIMEOUT_MS) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_INTERVAL_MS));

      const statusRes = await fetch(
        `${FAL_RESULT_BASE}/${SAM31_ENDPOINT}/requests/${requestId}/status`,
        {
          headers: { Authorization: `Key ${apiKey}` },
          signal
        }
      );

      if (!statusRes.ok) {
        continue;
      }

      const statusData: FalStatusResponse = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        // Fetch the result
        const resultRes = await fetch(
          `${FAL_RESULT_BASE}/${SAM31_ENDPOINT}/requests/${requestId}`,
          {
            headers: { Authorization: `Key ${apiKey}` },
            signal
          }
        );
        if (!resultRes.ok) {
          throw new Error(`Failed to fetch result: ${resultRes.status}`);
        }
        const resultData: FalSam3Result = await resultRes.json();
        return this.parseResult(resultData, scale);
      }

      if (statusData.status === "FAILED") {
        throw new Error("FAL segmentation job failed");
      }
    }

    throw new Error("FAL segmentation timed out");
  }

  private parseResult(
    data: FalSam3Result,
    scale: number
  ): SegmentationResponse {
    const previewImageUrl = data.image?.url;
    const images = data.masks ?? (data.image ? [data.image] : []);
    const metadataEntries = normalizeFalMetadataEntries(data.metadata);
    const scores = normalizeFalScores(data.scores);
    const boxes = normalizeFalBoxes(data.boxes, images, scale);
    const providerRle = normalizeFalRle(data.rle);
    const providerNodeType =
      providerRle !== null && images.length === 0
        ? FAL_SAM_RLE_NODE_TYPE
        : FAL_SAM_NODE_TYPE;
    const providerModelId =
      providerRle !== null && images.length === 0
        ? SAM31_RLE_ENDPOINT
        : DEFAULT_SAM_MODEL_ID;

    if (images.length === 0) {
      return {
        masks: [],
        modelId: providerModelId,
        backendId: "fal",
        nodeType: providerNodeType,
        previewImageUrl,
        providerMetadata: data.metadata,
        providerRle,
        providerScores: scores,
        providerBoxes: boxes
      };
    }

    const masks: SegmentationMask[] = images.map((img, i) => {
      const metadataEntry = metadataEntries[i];
      const metadataBox = normalizeFalMetadataBox(
        metadataEntry?.box ?? metadataEntry?.bbox ?? metadataEntry?.bounds,
        img,
        scale
      );
      const fallbackBounds = boxes[i] ?? {
        x: 0,
        y: 0,
        width: Math.round(img.width * (scale > 0 ? 1 / scale : 1)),
        height: Math.round(img.height * (scale > 0 ? 1 / scale : 1))
      };
      return {
        id: `mask_${i}`,
        kind: "mask",
        label:
          metadataEntry?.label?.trim() ||
          metadataEntry?.name?.trim() ||
          `Object ${i + 1}`,
        maskDataUrl: img.url,
        confidence: metadataEntry?.score ?? scores[i] ?? 1,
        bounds: metadataBox ?? fallbackBounds,
        backendId: "fal",
        modelId: providerModelId,
        nodeType: providerNodeType
      };
    });

    return {
      masks,
      modelId: providerModelId,
      backendId: "fal",
      nodeType: providerNodeType,
      previewImageUrl,
      providerMetadata: data.metadata,
      providerRle,
      providerScores: scores,
      providerBoxes: boxes
    };
  }
}
