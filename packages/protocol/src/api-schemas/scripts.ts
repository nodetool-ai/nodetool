import { z } from "zod";
import { captionWord } from "./timeline.js";

// ── Cast / voices ────────────────────────────────────────────────────────────
// A Script owns its text; audio is derived. The cast binds each speaker to a
// TTS voice so a line inherits its speaker's voice unless it overrides one.

/** A provider/model/voice selection, mirroring how the model pickers emit it. */
export const voiceBinding = z.object({
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
  /** Provider-specific synthesis knobs (stability, similarity, speed, …). */
  settings: z.record(z.string(), z.unknown()).optional()
});
export type VoiceBinding = z.infer<typeof voiceBinding>;

export const speaker = z.object({
  id: z.string(),
  name: z.string(),
  /** Gutter chip color; free-form so the UI can theme it. */
  color: z.string().optional(),
  voice: voiceBinding.nullable().optional()
});
export type Speaker = z.infer<typeof speaker>;

// ── Takes ────────────────────────────────────────────────────────────────────
// A take is the `clipVersion` idea relocated onto a line: an audio asset with
// word timings plus the text/voice snapshot it was voiced from, so staleness is
// derivable without storing it.

export const take = z.object({
  id: z.string(),
  assetId: z.string(),
  durationMs: z.number(),
  words: z.array(captionWord).default([]),
  /** The line text this take was voiced from (staleness comparison). */
  textSnapshot: z.string(),
  /** The voice this take was voiced with (staleness comparison). */
  voiceSnapshot: voiceBinding.nullable(),
  createdAt: z.string(),
  favorite: z.boolean().optional(),
  costCredits: z.number().optional()
});
export type Take = z.infer<typeof take>;

// ── Lines / sections ─────────────────────────────────────────────────────────

export const scriptLine = z.object({
  id: z.string(),
  speakerId: z.string().nullable().optional(),
  text: z.string().default(""),
  /** Free-form performance note ("whispering, tired"); passed to providers
   * that accept a direction, no structured tag schema. */
  direction: z.string().optional(),
  /** Authored silence after this line, used when laying out a timeline. */
  pauseAfterMs: z.number().optional(),
  /** Per-line voice override; falls back to the speaker's voice when absent. */
  voiceOverride: voiceBinding.nullable().optional(),
  takes: z.array(take).default([]),
  currentTakeId: z.string().nullable().optional()
});
export type ScriptLine = z.infer<typeof scriptLine>;

export const scriptSection = z.object({
  id: z.string(),
  title: z.string().optional(),
  lines: z.array(scriptLine).default([])
});
export type ScriptSection = z.infer<typeof scriptSection>;

// ── Document ─────────────────────────────────────────────────────────────────

export const scriptDocument = z.object({
  cast: z.array(speaker).default([]),
  sections: z.array(scriptSection).default([])
});
export type ScriptDocumentSchema = z.infer<typeof scriptDocument>;

// ── API shapes ───────────────────────────────────────────────────────────────

export const scriptResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  document: scriptDocument,
  /** Timeline sequence this script was assembled into, if any. */
  timelineId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ScriptResponse = z.infer<typeof scriptResponse>;

export const scriptListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  lineCount: z.number(),
  updatedAt: z.string()
});
export type ScriptListItem = z.infer<typeof scriptListItem>;

export const createScriptInput = z.object({
  /** Client-supplied id: lets a tab-ref'd local script upsert itself. */
  id: z.string().optional(),
  name: z.string().min(1).default("Untitled script"),
  projectId: z.string().default("default"),
  document: scriptDocument.optional()
});
export type CreateScriptInput = z.infer<typeof createScriptInput>;

export const patchScriptInput = z
  .object({
    name: z.string().min(1).optional(),
    document: scriptDocument.optional(),
    timelineId: z.string().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchScriptInput = z.infer<typeof patchScriptInput>;
