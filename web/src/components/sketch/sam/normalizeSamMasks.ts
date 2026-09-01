import { resolveMediaUri } from "../../../utils/resolveMediaUri";
import type { SegmentationMask, SegmentationSourceMetadata } from "../types";
import type { SegmentationResponse } from "./SamService";
import { isNumber, isObjectLike } from "../../../utils/typePredicates";

interface SamMaskImageRef {
  uri?: string;
  url?: string;
  /** Base64 payload, or a data URL, for a mask the node emitted inline. */
  data?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  confidence?: unknown;
  label?: string;
  name?: string;
}

interface NormalizeSamMasksParams {
  rawOutput: unknown;
  modelId: string;
  nodeType: string;
  scale?: number;
  sourceMetadata?: SegmentationSourceMetadata;
}

function isSamMaskImageRef(value: unknown): value is SamMaskImageRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  // SAFETY: the assertion makes the probes expressible on a value the guard
  // has only proven to be a non-null object; the returned predicate is decided
  // by the checks below, not by this line.
  const candidate = value as SamMaskImageRef;
  return (
    isNonEmptyString(candidate.uri) ||
    isNonEmptyString(candidate.url) ||
    // A node emits its masks as base64 on the ref's `data` field — there is no
    // locator until something saves them as assets, and rejecting those left
    // every run reporting zero masks.
    isNonEmptyString(candidate.data)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The array of mask images inside whatever handle the node emitted. */
function getMaskCandidates(rawOutput: unknown): unknown[] {
  if (Array.isArray(rawOutput)) {
    return rawOutput;
  }
  if (rawOutput && isObjectLike(rawOutput)) {
    const record = rawOutput as { output?: unknown; masks?: unknown };
    // `masks` is the segmentation node's own handle; `output` is what the
    // single-output provider nodes emit.
    if (Array.isArray(record.masks)) {
      return record.masks;
    }
    if (Array.isArray(record.output)) {
      return record.output;
    }
  }
  return isSamMaskImageRef(rawOutput) ? [rawOutput] : [];
}

/** A positional side-channel the node emits next to `masks`. */
function getSideChannel(rawOutput: unknown, handle: string): unknown[] {
  if (!rawOutput || !isObjectLike(rawOutput)) {
    return [];
  }
  const value = (rawOutput as Record<string, unknown>)[handle];
  return Array.isArray(value) ? value : [];
}

function getNormalizedMaskEntries(rawOutput: unknown): Array<{
  entry: SamMaskImageRef;
  rawIndex: number;
}> {
  return getMaskCandidates(rawOutput).flatMap((entry, rawIndex) =>
    isSamMaskImageRef(entry) ? [{ entry, rawIndex }] : []
  );
}

/**
 * A mask arrives one of three ways: an `asset://` locator, which resolves only
 * through the asset's own `get_url`; an http URL, which passes through
 * untouched; or base64 on `data`, which becomes a data URL here.
 */
function getResolvedMaskUri(entry: SamMaskImageRef): Promise<string> {
  const locator = entry.uri ?? entry.url;
  if (isNonEmptyString(locator)) {
    return resolveMediaUri(locator);
  }
  if (!isNonEmptyString(entry.data)) {
    return Promise.resolve("");
  }
  if (entry.data.startsWith("data:")) {
    return Promise.resolve(entry.data);
  }
  const mimeType = isNonEmptyString(entry.mimeType)
    ? entry.mimeType
    : "image/png";
  return Promise.resolve(`data:${mimeType};base64,${entry.data}`);
}

function getNormalizedDimension(
  value: unknown,
  fallback: number | undefined,
  scale: number
): number {
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (isNumber(value) && Number.isFinite(value) && value > 0) {
    const invScale = 1 / effectiveScale;
    return Math.max(0, Math.round(value * invScale));
  }

  // Fallback dimensions come from sketch source metadata, which is already in
  // target document space and should not be re-scaled.
  return Math.max(0, Math.round(fallback ?? 0));
}

function getMaskLabel(
  entry: SamMaskImageRef,
  rawIndex: number,
  labels: unknown[]
): string {
  const sideChannel = labels[rawIndex];
  const explicitLabel = (
    entry.label ??
    entry.name ??
    (typeof sideChannel === "string" ? sideChannel : "")
  ).trim();

  return explicitLabel.length > 0 ? explicitLabel : `Mask ${rawIndex + 1}`;
}

/**
 * The model's own score for this mask. A provider scores each mask on the mask
 * itself; a node emits the scores as a list beside the masks. A backend that
 * does not score them reports none, and every mask is then equally confident.
 */
function getMaskConfidence(
  entry: SamMaskImageRef,
  rawIndex: number,
  scores: unknown[]
): number {
  const own = entry.confidence;
  if (isNumber(own) && Number.isFinite(own)) {
    return own;
  }
  const score = scores[rawIndex];
  return isNumber(score) && Number.isFinite(score) ? score : 1;
}

export async function normalizeSamMasks({
  rawOutput,
  modelId,
  nodeType,
  scale = 1,
  sourceMetadata
}: NormalizeSamMasksParams): Promise<SegmentationResponse> {
  const labels = getSideChannel(rawOutput, "labels");
  const scores = getSideChannel(rawOutput, "scores");
  const masks: SegmentationMask[] = [];
  for (const { entry, rawIndex } of getNormalizedMaskEntries(rawOutput)) {
    const maskUri = await getResolvedMaskUri(entry);
    if (!maskUri) {
      continue;
    }

    masks.push({
      id: `mask_${rawIndex}`,
      kind: "mask",
      label: getMaskLabel(entry, rawIndex, labels),
      maskDataUrl: maskUri,
      confidence: getMaskConfidence(entry, rawIndex, scores),
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
      modelId,
      nodeType,
      sourceMetadata
    });
  }

  return {
    masks,
    modelId,
    nodeType,
    sourceMetadata
  };
}
