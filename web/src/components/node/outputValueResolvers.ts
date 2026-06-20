/**
 * Pure value-shape resolvers for OutputRenderer.
 *
 * These helpers recognize and unwrap sketch-document and timeline-sequence
 * shapes from arbitrary output values (which may be wrapped in `document`,
 * `sketch`, `sequence`, `timeline`, or `{ type, data }` envelopes). Extracted
 * from OutputRenderer.tsx so the component file stays focused on rendering.
 */
import { fromPersistedSketchEditorState } from "../../stores/sketch/persistence";
import type { SketchDocument } from "../sketch/types";
import type { TimelineSequence } from "@nodetool-ai/timeline";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getSketchId = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.id === "string" && value.id.length > 0 ? value.id : null;
};

export const isSketchDocumentLike = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const canvas = value.canvas;
  return (
    isRecord(canvas) &&
    typeof canvas.width === "number" &&
    typeof canvas.height === "number" &&
    Array.isArray(value.layers) &&
    typeof value.activeLayerId === "string"
  );
};

export const unwrapSketchDocumentCandidate = (
  value: unknown,
  depth = 0
): unknown => {
  if (depth > 4 || isSketchDocumentLike(value) || !isRecord(value)) {
    return value;
  }
  if (isRecord(value.document)) {
    return unwrapSketchDocumentCandidate(value.document, depth + 1);
  }
  if ("sketch" in value) {
    return unwrapSketchDocumentCandidate(value.sketch, depth + 1);
  }
  if (value.type === "sketch" && "data" in value) {
    return unwrapSketchDocumentCandidate(value.data, depth + 1);
  }
  return value;
};

export const resolveSketchDocument = (value: unknown): SketchDocument | null => {
  const candidate = unwrapSketchDocumentCandidate(value);
  if (!isSketchDocumentLike(candidate)) {
    return null;
  }
  try {
    return fromPersistedSketchEditorState(candidate).document;
  } catch (error) {
    console.warn("Could not render sketch document", error);
    return null;
  }
};

export const getTimelineId = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.id === "string" && value.id.length > 0 ? value.id : null;
};

export const isTimelineSequenceLike = (
  value: unknown
): value is TimelineSequence => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.fps === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.durationMs === "number" &&
    Array.isArray(value.tracks) &&
    Array.isArray(value.clips) &&
    Array.isArray(value.markers)
  );
};

export const unwrapTimelineSequenceCandidate = (
  value: unknown,
  depth = 0
): unknown => {
  if (depth > 4 || isTimelineSequenceLike(value) || !isRecord(value)) {
    return value;
  }
  if (isRecord(value.sequence)) {
    return unwrapTimelineSequenceCandidate(value.sequence, depth + 1);
  }
  if (isRecord(value.document)) {
    return unwrapTimelineSequenceCandidate(value.document, depth + 1);
  }
  if ("timeline" in value) {
    return unwrapTimelineSequenceCandidate(value.timeline, depth + 1);
  }
  if (value.type === "timeline" && "data" in value) {
    return unwrapTimelineSequenceCandidate(value.data, depth + 1);
  }
  return value;
};

export const resolveTimelineSequence = (
  value: unknown
): TimelineSequence | null => {
  const candidate = unwrapTimelineSequenceCandidate(value);
  return isTimelineSequenceLike(candidate) ? candidate : null;
};
