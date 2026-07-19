import { z } from "zod";

// ── Shot / screenplay ───────────────────────────────────────────────────────
// Mirrors the interfaces in `creative.ts`. Loose objects: the shapes evolve
// with the Director agent, and the storyboard document is a client-owned
// payload — the schema pins the structural keys and lets the rest travel.

const mediaRef = z
  .object({
    type: z.string(),
    uri: z.string().optional(),
    asset_id: z.string().nullable().optional()
  })
  .passthrough();

export const storyboardShot = z
  .object({
    type: z.literal("shot"),
    id: z.string(),
    index: z.number(),
    action: z.string(),
    status: z.string(),
    slug: z.string().optional(),
    motion: z.string().optional(),
    duration_seconds: z.number().optional(),
    keyframe: mediaRef.nullable().optional(),
    clip: mediaRef.nullable().optional()
  })
  .passthrough();
export type StoryboardShot = z.infer<typeof storyboardShot>;

export const storyboardScreenplay = z
  .object({
    type: z.literal("screenplay"),
    id: z.string(),
    title: z.string(),
    shots: z.array(storyboardShot)
  })
  .passthrough();

/** A model selection (language/image/video) as the pickers emit it. */
const modelSelection = z
  .object({
    type: z.string(),
    id: z.string(),
    provider: z.string(),
    name: z.string().optional()
  })
  .passthrough();

// ── Document ────────────────────────────────────────────────────────────────

export const storyboardDocument = z.object({
  screenplay: storyboardScreenplay.nullable(),
  shots: z.array(storyboardShot),
  brief: z.string(),
  style: z.string(),
  aspectRatio: z.string(),
  directorModel: modelSelection.nullable(),
  imageModel: modelSelection.nullable(),
  videoModel: modelSelection.nullable()
});
export type StoryboardDocumentSchema = z.infer<typeof storyboardDocument>;

// ── API shapes ──────────────────────────────────────────────────────────────

export const storyboardResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  document: storyboardDocument,
  timelineId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type StoryboardResponse = z.infer<typeof storyboardResponse>;

export const storyboardListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  shotCount: z.number(),
  updatedAt: z.string()
});
export type StoryboardListItem = z.infer<typeof storyboardListItem>;

export const createStoryboardInput = z.object({
  /** Client-supplied id: lets a tab-ref'd local board upsert itself. */
  id: z.string().optional(),
  name: z.string().min(1).default("Untitled storyboard"),
  projectId: z.string().default("default"),
  document: storyboardDocument.optional()
});
export type CreateStoryboardInput = z.infer<typeof createStoryboardInput>;

export const patchStoryboardInput = z
  .object({
    name: z.string().min(1).optional(),
    document: storyboardDocument.optional(),
    timelineId: z.string().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchStoryboardInput = z.infer<typeof patchStoryboardInput>;
