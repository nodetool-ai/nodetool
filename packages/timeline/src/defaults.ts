/**
 * Factory functions for timeline types.
 *
 * Each factory provides a fully-populated default value for its type.
 * Required fields must be supplied by the caller; optional fields are
 * omitted (their absence equals the documented default).
 *
 * IDs use `randomUUID` from `node:crypto` — the same underlying mechanism
 * as `createTimeOrderedUuid` in `@nodetool-ai/models` — without
 * introducing a cross-package dependency on models.
 */

import { randomUUID } from "node:crypto";
import type {
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineMarker,
  ClipVersion
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

// ── Factories ─────────────────────────────────────────────────────────

/**
 * Create a minimal {@link TimelineMarker} with defaults applied.
 *
 * Defaults:
 * - `id`: new UUID
 * - `timeMs`: 0
 */
export function makeMarker(
  overrides: Partial<TimelineMarker> = {}
): TimelineMarker {
  return {
    id: randomUUID(),
    timeMs: 0,
    label: "",
    ...overrides
  };
}

/**
 * Create a minimal {@link ClipVersion} with defaults applied.
 *
 * Defaults:
 * - `id`: new UUID
 * - `createdAt`: current ISO timestamp
 * - `status`: "success"
 * - `paramOverridesSnapshot`: `{}`
 * - `dependencyHash`: `""`
 */
export function makeClipVersion(
  overrides: Partial<ClipVersion> = {}
): ClipVersion {
  return {
    id: randomUUID(),
    createdAt: nowIso(),
    jobId: "",
    assetId: "",
    workflowUpdatedAt: nowIso(), // placeholder — callers should supply the actual workflow updated-at timestamp
    dependencyHash: "",
    paramOverridesSnapshot: {},
    status: "success",
    ...overrides
  };
}

/**
 * Create a minimal {@link TimelineTrack} with defaults applied.
 *
 * Defaults:
 * - `id`: new UUID
 * - `type`: "video"
 * - `index`: 0
 * - `visible`: true
 * - `locked`: false
 */
export function makeTrack(
  overrides: Partial<TimelineTrack> = {}
): TimelineTrack {
  return {
    id: randomUUID(),
    name: "",
    type: "video",
    index: 0,
    visible: true,
    locked: false,
    ...overrides
  };
}

/**
 * Create a minimal {@link TimelineClip} with defaults applied.
 *
 * Defaults:
 * - `id`: new UUID
 * - `startMs`: 0
 * - `durationMs`: 0
 * - `mediaType`: "video"
 * - `sourceType`: "generated"
 * - `status`: "draft"
 * - `locked`: false
 * - `versions`: []
 */
export function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: randomUUID(),
    trackId: "",
    name: "",
    startMs: 0,
    durationMs: 0,
    mediaType: "video",
    sourceType: "generated",
    status: "draft",
    locked: false,
    versions: [],
    ...overrides
  };
}

/**
 * Create a minimal {@link TimelineSequence} with defaults applied.
 *
 * Defaults:
 * - `id`: new UUID
 * - `fps`: 30
 * - `width`: 1920
 * - `height`: 1080
 * - `durationMs`: 0
 * - `tracks`: []
 * - `clips`: []
 * - `markers`: []
 * - `createdAt` / `updatedAt`: current ISO timestamp
 */
export function makeSequence(
  overrides: Partial<TimelineSequence> = {}
): TimelineSequence {
  const now = nowIso();
  return {
    id: randomUUID(),
    projectId: "",
    name: "",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 0,
    tracks: [],
    clips: [],
    markers: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
