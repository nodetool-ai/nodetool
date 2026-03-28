/**
 * SamServiceFal – real FAL AI backend integration for SAM 2 segmentation.
 *
 * Calls the fal-ai/sam2/image endpoint via its REST queue API.
 * The API key is retrieved from the NodetoolSecretsStore at call time.
 *
 * This service handles:
 * - Model availability checking (via queue health)
 * - Image resizing for large images (guardrails)
 * - Point and box prompt translation to FAL format
 * - Mask response parsing into SegmentationMask[]
 */

import type { SamService, SamModelInfo, SegmentationRequest, SegmentationResponse } from "./SamService";
import { DEFAULT_SAM_MODEL_ID, DEFAULT_SAM_MODEL_NAME } from "./SamService";
import type { SegmentationMask } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const FAL_API_BASE = "https://queue.fal.run";
const FAL_RESULT_BASE = "https://queue.fal.run";
const SAM2_ENDPOINT = "fal-ai/sam2/image";

/**
 * Maximum image dimension (width or height) sent to the model.
 * Images larger than this are downscaled to fit before submission.
 */
export const MAX_INFERENCE_DIMENSION = 2048;

/** Polling interval for queue status (ms). */
const QUEUE_POLL_INTERVAL_MS = 1000;

/** Maximum time to wait for a queued job (ms). */
const QUEUE_TIMEOUT_MS = 120_000;

// ─── Types for FAL API ────────────────────────────────────────────────────────

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

interface FalSam2Result {
  images?: FalResultImage[];
  image?: FalResultImage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the FAL API key from the NodetoolSecretsStore.
 * Returns null if the key is not set.
 */
function getFalApiKey(): string | null {
  try {
    // Dynamic import to avoid circular deps — works because zustand stores are singletons
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const useSecretsStore = require("../../../stores/SecretsStore").default;
    const secrets = useSecretsStore.getState().secrets;
    const falSecret = secrets.find(
      (s: { key: string; value?: string }) => s.key === "FAL_API_KEY"
    );
    return falSecret?.value ?? null;
  } catch {
    // Store not available (e.g., in tests)
    return null;
  }
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
  return uploadData.url ?? uploadData.access_url ?? uploadData.file_url;
}

// ─── SamServiceFal Implementation ─────────────────────────────────────────────

export class SamServiceFal implements SamService {
  async checkModelAvailability(): Promise<SamModelInfo> {
    const apiKey = getFalApiKey();

    if (!apiKey) {
      return {
        status: "not-installed",
        modelId: DEFAULT_SAM_MODEL_ID,
        modelName: DEFAULT_SAM_MODEL_NAME,
        errorMessage: "FAL_API_KEY not configured. Add it in Settings → Secrets."
      };
    }

    // Test connectivity by checking the queue endpoint
    try {
      const res = await fetch(`${FAL_API_BASE}/${SAM2_ENDPOINT}`, {
        method: "OPTIONS",
        headers: { Authorization: `Key ${apiKey}` }
      });
      // Any non-error response means the endpoint exists
      if (res.ok || res.status === 405 || res.status === 200) {
        return {
          status: "available",
          modelId: DEFAULT_SAM_MODEL_ID,
          modelName: DEFAULT_SAM_MODEL_NAME
        };
      }
      return {
        status: "error",
        modelId: DEFAULT_SAM_MODEL_ID,
        modelName: DEFAULT_SAM_MODEL_NAME,
        errorMessage: `FAL API returned ${res.status}`
      };
    } catch (err) {
      return {
        status: "error",
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
    const apiKey = getFalApiKey();
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
      output_format: "png"
    };

    if (falPrompts.length > 0) {
      falInput.prompts = falPrompts;
    }
    if (falBoxPrompts.length > 0) {
      falInput.box_prompts = falBoxPrompts;
    }

    // 4. Submit to FAL queue
    const submitRes = await fetch(`${FAL_API_BASE}/${SAM2_ENDPOINT}`, {
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
    if (submitData.images || submitData.image) {
      return this.parseResult(submitData as FalSam2Result, scale);
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
        `${FAL_RESULT_BASE}/${SAM2_ENDPOINT}/requests/${requestId}/status`,
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
          `${FAL_RESULT_BASE}/${SAM2_ENDPOINT}/requests/${requestId}`,
          {
            headers: { Authorization: `Key ${apiKey}` },
            signal
          }
        );
        if (!resultRes.ok) {
          throw new Error(`Failed to fetch result: ${resultRes.status}`);
        }
        const resultData: FalSam2Result = await resultRes.json();
        return this.parseResult(resultData, scale);
      }

      if (statusData.status === "FAILED") {
        throw new Error("FAL segmentation job failed");
      }
    }

    throw new Error("FAL segmentation timed out");
  }

  private parseResult(
    data: FalSam2Result,
    scale: number
  ): SegmentationResponse {
    const images = data.images ?? (data.image ? [data.image] : []);

    if (images.length === 0) {
      return { masks: [] };
    }

    // Each image from SAM2 is a mask or a combined masked output
    // Convert to our SegmentationMask format
    const masks: SegmentationMask[] = images.map((img, i) => {
      const invScale = scale !== 0 ? 1 / scale : 1;
      return {
        id: `mask_${i}`,
        label: `Object ${i + 1}`,
        maskDataUrl: img.url,
        confidence: 1.0, // FAL doesn't return confidence per mask
        bounds: {
          x: 0,
          y: 0,
          width: Math.round(img.width * invScale),
          height: Math.round(img.height * invScale)
        }
      };
    });

    return { masks };
  }
}
