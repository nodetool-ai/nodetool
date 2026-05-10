import { z } from "zod";

// ── Shared sub-schemas ───────────────────────────────────────────────────────

export const clipVersion = z.object({
  id: z.string(),
  createdAt: z.string(),
  jobId: z.string(),
  assetId: z.string(),
  workflowUpdatedAt: z.string(),
  dependencyHash: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]),
  favorite: z.boolean().optional()
});
export type ClipVersion = z.infer<typeof clipVersion>;

export const timelineMarker = z.object({
  id: z.string(),
  timeMs: z.number(),
  label: z.string(),
  color: z.string().optional(),
  note: z.string().optional()
});
export type TimelineMarker = z.infer<typeof timelineMarker>;

export const timelineTrack = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["video", "audio", "overlay", "subtitle"]),
  index: z.number().int(),
  visible: z.boolean(),
  locked: z.boolean(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  heightPx: z.number().optional()
});
export type TimelineTrack = z.infer<typeof timelineTrack>;

export const timelineClip = z
  .object({
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    startMs: z.number(),
    durationMs: z.number(),
    inPointMs: z.number().optional(),
    outPointMs: z.number().optional(),
    mediaType: z.enum(["image", "video", "audio", "overlay"]),
    sourceType: z.enum(["imported", "generated"]),
    workflowId: z.string().optional(),
    selectedOutputNodeId: z.string().optional(),
    paramOverrides: z.record(z.string(), z.unknown()).optional(),
    dependencyHash: z.string().optional(),
    lastGeneratedHash: z.string().optional(),
    currentAssetId: z.string().optional(),
    thumbnailAssetId: z.string().optional(),
    waveformAssetId: z.string().optional(),
    status: z.enum([
      "draft",
      "queued",
      "generating",
      "generated",
      "stale",
      "failed",
      "locked",
      "missing"
    ]),
    locked: z.boolean(),
    muted: z.boolean().optional(),
    hidden: z.boolean().optional(),
    versions: z.array(clipVersion),
    opacity: z.number().optional(),
    blendMode: z
      .enum(["normal", "screen", "multiply", "add", "overlay"])
      .optional(),
    speedMultiplier: z.number().optional(),
    speedBaked: z.boolean().optional(),
    volumeDb: z.number().optional(),
    fadeInMs: z.number().optional(),
    fadeOutMs: z.number().optional()
  });
export type TimelineClip = z.infer<typeof timelineClip>;

export const timelineDocument = z.object({
  tracks: z.array(timelineTrack),
  clips: z.array(timelineClip),
  markers: z.array(timelineMarker)
});
export type TimelineDocument = z.infer<typeof timelineDocument>;

// ── Sequence response ────────────────────────────────────────────────────────

export const timelineSequenceResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  workflowId: z.string().optional(),
  name: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationMs: z.number(),
  tracks: z.array(timelineTrack),
  clips: z.array(timelineClip),
  markers: z.array(timelineMarker),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type TimelineSequenceResponse = z.infer<typeof timelineSequenceResponse>;

// Minimal list item (id, name, updatedAt only)
export const timelineSequenceListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  updatedAt: z.string()
});
export type TimelineSequenceListItem = z.infer<typeof timelineSequenceListItem>;

// ── create (POST /api/timeline) ──────────────────────────────────────────────

export const createTimelineInput = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  fps: z.number().int().min(1).optional().default(30),
  width: z.number().int().min(1).optional().default(1920),
  height: z.number().int().min(1).optional().default(1080)
});
export type CreateTimelineInput = z.infer<typeof createTimelineInput>;

// ── patch (PATCH /api/timeline/:id) ─────────────────────────────────────────

export const patchTimelineInput = z
  .object({
    name: z.string().min(1).optional(),
    fps: z.number().int().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    document: timelineDocument.optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required"
  });
export type PatchTimelineInput = z.infer<typeof patchTimelineInput>;

// ── append clip version (POST /api/timeline/:id/clips/:clipId/versions) ──────

export const appendClipVersionInput = z.object({
  jobId: z.string(),
  assetId: z.string(),
  dependencyHash: z.string(),
  workflowUpdatedAt: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()).optional(),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]).optional().default("success")
});
export type AppendClipVersionInput = z.infer<typeof appendClipVersionInput>;

// ── create clip (POST /api/timeline/:id/clips) ────────────────────────────────

export const createClipInput = z.object({
  /** Timeline sequence that will own the clip. */
  id: z.string(),
  trackId: z.string(),
  startMs: z.number().int().min(0),
  /** The source workflow the clip will run. The clip references it directly; no clone is created. */
  sourceWorkflowId: z.string(),
  /**
   * Override which terminal node's output becomes the clip's media.
   * Required when the source workflow has multiple terminal output nodes;
   * optional (server auto-picks) when there is exactly one.
   */
  selectedOutputNodeId: z.string().optional(),
  /** If placed on an overlay track, pass `"overlay"` to override mediaType. */
  mediaTypeOverride: z.enum(["overlay"]).optional()
});
export type CreateClipInput = z.infer<typeof createClipInput>;

/** Response shape returned by `timeline.clips.create`. */
export const timelineClipResponse = timelineClip;
export type TimelineClipResponse = z.infer<typeof timelineClipResponse>;
