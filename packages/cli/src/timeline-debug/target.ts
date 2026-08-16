/**
 * Resolves a timeline debug target into a document plus its sequence settings.
 *
 * A timeline is named two ways, and both end up in the same shape:
 *
 * - a **JSON file** — either a bare `TimelineDocument` (`tracks`/`clips`/
 *   `markers`) or a wrapper carrying one under `document`, as the
 *   `timeline_sequences` row and the `GET /api/timeline/:id` response do;
 * - a **timeline_sequences row id**, read through an injected loader so this
 *   module needs no database.
 *
 * A path that exists on disk wins over an id, so a file named like an id is
 * still readable.
 */
import { existsSync, readFileSync } from "node:fs";
import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineDebugTarget } from "@nodetool-ai/execution/timeline-debug";
import {
  isBoolean,
  isFiniteNumber,
  isRecord,
  isString
} from "../predicates.js";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A `timeline_sequences` row as the harness needs it. */
export interface TimelineSequenceRecord {
  id: string;
  name?: string;
  fps?: number;
  width?: number;
  height?: number;
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
}

export interface TimelineTargetDeps {
  /** Load a timeline sequence by DB id. */
  loadSequence: (id: string) => Promise<TimelineSequenceRecord | null>;
}

/** The sequence settings a document does not carry itself. */
export interface TimelineSequenceSettings {
  fps?: number;
  width?: number;
  height?: number;
}

export interface ResolvedTimelineTarget {
  target: TimelineDebugTarget;
  /** The document exactly as loaded — validation's input, unrepaired. */
  raw: unknown;
  /** The same document, read as tracks + clips + markers. */
  document: TimelineDocument;
  meta: TimelineSequenceSettings;
}

const numberOr = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

/** Read fps/width/height off whatever wrapper carried the document. */
function settingsOf(raw: unknown): TimelineSequenceSettings {
  if (!isRecord(raw)) return {};
  const settings: TimelineSequenceSettings = {};
  const fps = numberOr(raw.fps);
  const width = numberOr(raw.width);
  const height = numberOr(raw.height);
  if (fps !== undefined) settings.fps = fps;
  if (width !== undefined) settings.width = width;
  if (height !== undefined) settings.height = height;
  return settings;
}

/** A document is anything with `tracks` and `clips` arrays. */
const looksLikeDocument = (value: JsonValue): boolean =>
  isRecord(value) && Array.isArray(value.tracks) && Array.isArray(value.clips);

/**
 * The document a target carries, unwrapping a `document` field (string or
 * object) when there is one. Never throws — an unreadable document is a
 * validation finding, not a crash.
 */
function documentOf(raw: unknown): JsonValue {
  // SAFETY: a target is read from a JSON file or a json column, so every
  // branch below carries decoded JSON.
  if (!isRecord(raw)) return raw as JsonValue;
  const inner = raw.document;
  if (isString(inner)) {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  // SAFETY: same JSON provenance as the branch above.
  if (inner !== undefined) return inner as JsonValue;
  return raw as JsonValue;
}

/** Read a document as tracks + clips + markers, defaulting what is missing. */
function asDocument(raw: JsonValue): TimelineDocument {
  const record = isRecord(raw) ? raw : {};
  const document: TimelineDocument = {
    tracks: Array.isArray(record.tracks)
      ? (record.tracks as TimelineDocument["tracks"])
      : [],
    clips: Array.isArray(record.clips)
      ? (record.clips as TimelineDocument["clips"])
      : [],
    markers: Array.isArray(record.markers)
      ? (record.markers as TimelineDocument["markers"])
      : []
  };
  if (Array.isArray(record.transcript)) {
    document.transcript = record.transcript as TimelineDocument["transcript"];
  }
  if (isBoolean(record.scriptEnabled)) {
    document.scriptEnabled = record.scriptEnabled;
  }
  return document;
}

/** Resolve a timeline target: a JSON file path or a sequence row id. */
export async function resolveTimelineTarget(
  ref: string,
  deps: TimelineTargetDeps
): Promise<ResolvedTimelineTarget> {
  if (existsSync(ref)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ref, "utf8"));
    } catch (e) {
      throw new Error(`${ref} is not valid JSON: ${(e as Error).message}`);
    }
    const raw = documentOf(parsed);
    if (!looksLikeDocument(raw)) {
      throw new Error(
        `${ref} is not a timeline document (no \`tracks\`/\`clips\` arrays, and no \`document\` field carrying them).`
      );
    }
    const name =
      isRecord(parsed) && isString(parsed.name)
        ? parsed.name
        : undefined;
    const target: TimelineDebugTarget = { kind: "file", ref };
    if (name) {
      target.name = name;
    }
    return {
      target,
      raw,
      document: asDocument(raw),
      meta: { ...settingsOf(parsed), ...settingsOf(raw) }
    };
  }

  const record = await deps.loadSequence(ref);
  if (!record) {
    throw new Error(`Timeline sequence not found: ${ref}`);
  }
  const raw = documentOf(record);
  const target: TimelineDebugTarget = { kind: "id", ref };
  if (record.name) {
    target.name = record.name;
  }
  return {
    target,
    raw,
    document: asDocument(raw),
    meta: settingsOf(record)
  };
}
