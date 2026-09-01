/**
 * SegmentationService – runs sketch segmentation as a direct provider call.
 *
 * The server dispatches `BaseProvider.segmentImage` for whichever provider the
 * picked model names, so no provider key reaches the browser, swapping
 * providers is a model id, and one click costs one request instead of a
 * workflow job.
 */

import useSecretsStore from "../../../stores/SecretsStore";
import { requiredSecretForProvider } from "../../../stores/ModelMenuStore";
import type {
  SamModelInfo,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";
import {
  DEFAULT_SAM_MODEL_ID,
  DEFAULT_SAM_MODEL_NAME,
  DEFAULT_SAM_MODEL_PROVIDER
} from "./SamConstants";
import type { SegmentModelSelection } from "../types";
import { trpcClient } from "../../../trpc/client";
import { resizeForInference, MAX_INFERENCE_DIMENSION } from "./resizeForInference";
import { normalizeSamMasks } from "./normalizeSamMasks";
import { CoordinateMapper } from "../painting/CoordinateMapper";

/** What a mask is attributed to, now that no node runs one. */
const SEGMENTATION_SOURCE = "provider.segmentImage";

/** The model a run uses when the user picked none. */
const DEFAULT_MODEL: SegmentModelSelection = {
  provider: DEFAULT_SAM_MODEL_PROVIDER,
  id: DEFAULT_SAM_MODEL_ID,
  name: DEFAULT_SAM_MODEL_NAME
};

/** Whether this install holds a value for `key`, without reading it. */
async function isSecretConfigured(key: string): Promise<boolean> {
  const store = useSecretsStore.getState();
  const known = store.secrets.find((secret) => secret.key === key);
  if (known) {
    return known.is_configured;
  }
  try {
    const fetched = await store.fetchSecrets();
    return Boolean(fetched.find((secret) => secret.key === key)?.is_configured);
  } catch {
    // The secrets list is unreachable — report the model as runnable rather
    // than blocking a run the server may well be able to make.
    return true;
  }
}

export class SegmentationService {
  /**
   * Whether the picked model can run: the server holds its provider's key.
   * The key itself stays there — only whether it is configured is read.
   */
  async checkModelAvailability(
    selection?: SegmentModelSelection | null
  ): Promise<SamModelInfo> {
    const model = resolveModel(selection);
    const info: SamModelInfo = {
      status: "available",
      nodeType: SEGMENTATION_SOURCE,
      modelId: model.id,
      modelName: model.name
    };
    // The secret follows the model's provider: picking a Replicate SAM must
    // ask for the Replicate token, not fal's key.
    const secret = requiredSecretForProvider(model.provider);
    if (!secret || (await isSecretConfigured(secret))) {
      return info;
    }
    return {
      ...info,
      status: "not-installed",
      errorMessage: `${secret} is not configured. Add it in Settings → Secrets.`
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

    const model = resolveModel(request.settings.model);
    const conceptPrompt = request.settings.conceptPrompt.trim();
    const response = await trpcClient.segmentation.segment.mutate(
      {
        image: getBase64Payload(resizedUrl),
        imageMimeType: getDataUrlMimeType(resizedUrl) ?? "image/png",
        provider: model.provider,
        model: model.id,
        prompt: conceptPrompt.length > 0 ? conceptPrompt : null,
        points:
          request.pointPrompts.length > 0
            ? this.buildPointPrompts(request, scale)
            : null,
        box: request.boxPrompt
          ? this.buildBoxPrompt(
              request.boxPrompt,
              request.sourceMetadata,
              scale
            )
          : null,
        maxMasks: request.settings.maxObjects,
        minConfidence: request.settings.confidenceThreshold
      },
      { signal }
    );

    return normalizeSamMasks({
      rawOutput: { masks: response.masks },
      modelId: model.id,
      nodeType: SEGMENTATION_SOURCE,
      scale,
      sourceMetadata: request.sourceMetadata
    });
  }

  private buildPointPrompts(
    request: SegmentationRequest,
    scale: number
  ): Array<{ x: number; y: number; include: boolean }> {
    const promptMapper = this.createPromptMapper(request.sourceMetadata);
    return request.pointPrompts.map((point) => {
      const mapped = this.mapPromptPointToSourceImage(point, promptMapper);
      return {
        x: Math.round(mapped.x * scale),
        y: Math.round(mapped.y * scale),
        include: point.label === "positive"
      };
    });
  }

  private buildBoxPrompt(
    boxPrompt: NonNullable<SegmentationRequest["boxPrompt"]>,
    sourceMetadata: SegmentationRequest["sourceMetadata"],
    scale: number
  ): { x: number; y: number; width: number; height: number } {
    const promptMapper = this.createPromptMapper(sourceMetadata);
    // Map all four corners before taking min/max so a rotated or affine-
    // transformed source layer still produces a correct axis-aligned box.
    const corners = [
      this.mapPromptPointToSourceImage(
        { x: boxPrompt.x, y: boxPrompt.y },
        promptMapper
      ),
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
}

/** The picked model, or the shipped default when none is picked. */
function resolveModel(
  selection: SegmentModelSelection | null | undefined
): SegmentModelSelection {
  return selection ?? DEFAULT_MODEL;
}

/** The raw base64 inside a data URL, or the string when it is already raw. */
function getBase64Payload(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}

function getDataUrlMimeType(dataUrl: string): string | undefined {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1];
}

let instance: SegmentationService | null = null;

/** The one segmentation service; stateless, so a singleton costs nothing. */
export function getSegmentationService(): SegmentationService {
  instance ??= new SegmentationService();
  return instance;
}
