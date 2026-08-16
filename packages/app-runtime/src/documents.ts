/**
 * Reading sketch and timeline refs out of a bound value.
 *
 * A node emits these documents as a ref — `{ type: "sketch", id }` — but the
 * payload can also arrive inline, wrapped in a `document`/`sketch`/`sequence`
 * envelope depending on which node produced it. These helpers unwrap both
 * shapes and describe what they found, so a surface that cannot render the
 * document itself still has something true to show.
 */

/** What a widget needs to know about a bound sketch/timeline value. */
export interface DocumentBinding<TDoc> {
  /** The inline document, when the value carried one. */
  document: TDoc | null;
  /** The persisted document's id, when the value carried one. */
  id: string | null;
}

export interface SketchSummary {
  width: number;
  height: number;
  layerCount: number;
}

export interface TimelineSummary {
  name: string;
  durationMs: number;
  trackCount: number;
  clipCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A bound output holds one value or an accumulated list of streamed items. */
const lastItem = <TItem>(value: TItem | TItem[]): TItem | undefined =>
  Array.isArray(value) ? value[value.length - 1] : value;

const refId = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.id === "string" && value.id.length > 0 ? value.id : null;
};

/**
 * Walk the envelopes a document can arrive in. Depth is bounded because these
 * values come off the wire, where a self-referential object is possible.
 */
// HOLDOUT (anti-slop/no-unknown-returns): the walk ends on whatever envelope
// key held the document, and what a bound output carries is the open
// workflow-value domain — NodeTool has no named union for it. `isDoc` is the
// caller's own check on the result.
const unwrap = (
  value: unknown,
  keys: ReadonlyArray<string>,
  refType: string,
  isDoc: (candidate: unknown) => boolean,
  depth = 0
): unknown => {
  if (depth > 4 || isDoc(value) || !isRecord(value)) {
    return value;
  }
  for (const key of keys) {
    if (key in value) {
      return unwrap(value[key], keys, refType, isDoc, depth + 1);
    }
  }
  if (value.type === refType && "data" in value) {
    return unwrap(value.data, keys, refType, isDoc, depth + 1);
  }
  return value;
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
    Array.isArray(value.layers)
  );
};

export const isTimelineSequenceLike = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.durationMs === "number" &&
  Array.isArray(value.tracks) &&
  Array.isArray(value.clips);

/** Read a bound value as a sketch: its inline document, its id, or neither. */
export const readSketchBinding = (
  value: unknown
): DocumentBinding<Record<string, unknown>> => {
  const bound = lastItem(value);
  const candidate = unwrap(
    bound,
    ["document", "sketch"],
    "sketch",
    isSketchDocumentLike
  );
  return {
    document: isSketchDocumentLike(candidate)
      ? (candidate as Record<string, unknown>)
      : null,
    id: refId(bound)
  };
};

/** Read a bound value as a timeline: its inline sequence, its id, or neither. */
export const readTimelineBinding = (
  value: unknown
): DocumentBinding<Record<string, unknown>> => {
  const bound = lastItem(value);
  const candidate = unwrap(
    bound,
    ["sequence", "document", "timeline"],
    "timeline",
    isTimelineSequenceLike
  );
  return {
    document: isTimelineSequenceLike(candidate)
      ? (candidate as Record<string, unknown>)
      : null,
    id: refId(bound)
  };
};

export const sketchSummary = (document: unknown): SketchSummary | null => {
  if (!isSketchDocumentLike(document)) {
    return null;
  }
  const doc = document as Record<string, unknown>;
  const canvas = doc.canvas as Record<string, unknown>;
  return {
    width: canvas.width as number,
    height: canvas.height as number,
    layerCount: (doc.layers as unknown[]).length
  };
};

export const timelineSummary = (document: unknown): TimelineSummary | null => {
  if (!isTimelineSequenceLike(document)) {
    return null;
  }
  const doc = document as Record<string, unknown>;
  return {
    name: typeof doc.name === "string" ? doc.name : "",
    durationMs: doc.durationMs as number,
    trackCount: (doc.tracks as unknown[]).length,
    clipCount: (doc.clips as unknown[]).length
  };
};

/** `m:ss` for a clip/sequence duration, the form the timeline editor uses. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
