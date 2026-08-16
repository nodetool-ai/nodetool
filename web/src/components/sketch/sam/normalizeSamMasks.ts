import { resolveMediaUri } from "../../../utils/resolveMediaUri";
import type { SegmentBackend, SegmentationMask, SegmentationSourceMetadata } from "../types";
import type { SegmentationResponse } from "./SamService";

interface SamMaskImageRef {
  uri?: string;
  url?: string;
  width?: unknown;
  height?: unknown;
  label?: string;
  name?: string;
}

interface NormalizeSamMasksParams {
  rawOutput: unknown;
  backendId: SegmentBackend;
  modelId: string;
  nodeType: string;
  scale?: number;
  sourceMetadata?: SegmentationSourceMetadata;
}

function isSamMaskImageRef(value: unknown): value is SamMaskImageRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as SamMaskImageRef;
  return typeof candidate.uri === "string" || typeof candidate.url === "string";
}

function getNormalizedMaskEntries(rawOutput: unknown): Array<{
  entry: SamMaskImageRef;
  rawIndex: number;
}> {
  const candidates = Array.isArray(rawOutput)
    ? rawOutput
    : rawOutput && typeof rawOutput === "object" && Array.isArray((rawOutput as { output?: unknown }).output)
      ? (rawOutput as { output: unknown[] }).output
      : isSamMaskImageRef(rawOutput)
        ? [rawOutput]
        : [];

  return candidates.flatMap((entry, rawIndex) =>
    isSamMaskImageRef(entry) ? [{ entry, rawIndex }] : []
  );
}

/**
 * A node-provider mask arrives as an `asset://` locator, which resolves only
 * through the asset's own `get_url`; a hosted provider (fal) returns an http
 * URL, which passes through untouched.
 */
function getResolvedMaskUri(entry: SamMaskImageRef): Promise<string> {
  return resolveMediaUri(entry.uri ?? entry.url ?? null);
}

function getNormalizedDimension(
  value: unknown,
  fallback: number | undefined,
  scale: number
): number {
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const invScale = 1 / effectiveScale;
    return Math.max(0, Math.round(value * invScale));
  }

  // Fallback dimensions come from sketch source metadata, which is already in
  // target document space and should not be re-scaled.
  return Math.max(0, Math.round(fallback ?? 0));
}

function getMaskLabel(entry: SamMaskImageRef, rawIndex: number): string {
  const explicitLabel = (entry.label ?? entry.name ?? "").trim();

  return explicitLabel.length > 0 ? explicitLabel : `Mask ${rawIndex + 1}`;
}

export async function normalizeSamMasks({
  rawOutput,
  backendId,
  modelId,
  nodeType,
  scale = 1,
  sourceMetadata
}: NormalizeSamMasksParams): Promise<SegmentationResponse> {
  const masks: SegmentationMask[] = [];
  for (const { entry, rawIndex } of getNormalizedMaskEntries(rawOutput)) {
    const maskUri = await getResolvedMaskUri(entry);
    if (!maskUri) {
      continue;
    }

    masks.push({
      id: `mask_${rawIndex}`,
      kind: "mask",
      label: getMaskLabel(entry, rawIndex),
      maskDataUrl: maskUri,
      confidence: 1,
      bounds: {
        x: 0,
        y: 0,
        width: getNormalizedDimension(
          entry.width,
          sourceMetadata?.contentBounds.width,
          scale
        ),
        height: getNormalizedDimension(
          entry.height,
          sourceMetadata?.contentBounds.height,
          scale
        )
      },
      backendId,
      modelId,
      nodeType,
      sourceMetadata
    });
  }

  return {
    masks,
    modelId,
    backendId,
    nodeType,
    sourceMetadata
  };
}
