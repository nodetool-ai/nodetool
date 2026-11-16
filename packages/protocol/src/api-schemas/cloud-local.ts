import { z } from "zod";

// The native apps' local store for cloud documents, served by the server
// bundled with each app (docs/plans/native-cloud-sync/technical-design.md,
// "Local data scoping and durable drafts"). Every call names the cloud
// server key and account, and the local user comes from the request, so one
// account never reads another account's rows.

export const cloudAccountScope = z.object({
  /** First 16 hex characters of the SHA-256 of the cloud server origin. */
  server_key: z.string().regex(/^[0-9a-f]{16}$/),
  account_id: z.string().min(1).max(256)
});
export type CloudAccountScope = z.infer<typeof cloudAccountScope>;

export const cloudDocumentRef = cloudAccountScope.extend({
  kind: z.string().min(1).max(64),
  document_id: z.string().min(1).max(256)
});
export type CloudDocumentRefInput = z.infer<typeof cloudDocumentRef>;

export const cloudBase = z.object({
  updated_at: z.string().min(1),
  content_hash: z.string().min(1)
});
export type CloudBaseInput = z.infer<typeof cloudBase>;

export const cloudDocumentOptions = z.object({
  allow_history: z.boolean(),
  allow_download: z.boolean(),
  allow_duplicate: z.boolean()
});

export const cloudDraftResponse = z.object({
  kind: z.string(),
  document_id: z.string(),
  base: cloudBase,
  draft: z.string(),
  state: z.enum(["waiting", "unsent"]),
  refusal_reason: z.string().nullable(),
  revision: z.number().int(),
  updated_at: z.string()
});
export type CloudDraftResponse = z.infer<typeof cloudDraftResponse>;

export const cloudOpenStateResponse = z.object({
  kind: z.string(),
  document_id: z.string(),
  role: z.string(),
  options: cloudDocumentOptions,
  base: cloudBase.nullable(),
  last_contact_at: z.string()
});
export type CloudOpenStateResponse = z.infer<typeof cloudOpenStateResponse>;

// ── drafts.put ───────────────────────────────────────────────────
// The edit counts as stored locally once this returns.
export const putDraftInput = cloudDocumentRef.extend({
  base: cloudBase,
  draft: z.string()
});
export const putDraftOutput = z.object({ revision: z.number().int() });

// ── drafts.get / drafts.discard ─────────────────────────────────
export const getDraftOutput = z.object({ draft: cloudDraftResponse.nullable() });
export const discardDraftOutput = z.object({ discarded: z.boolean() });

// ── drafts.list ──────────────────────────────────────────────────
export const listDraftsInput = cloudAccountScope.extend({
  state: z.enum(["waiting", "unsent"]).optional()
});
export const listDraftsOutput = z.object({ drafts: z.array(cloudDraftResponse) });

// ── drafts.accept ────────────────────────────────────────────────
// The server accepted the save of `revision` and produced `base`.
export const acceptSaveInput = cloudDocumentRef.extend({
  revision: z.number().int().min(1),
  base: cloudBase,
  role: z.string().min(1),
  options: cloudDocumentOptions
});
export const acceptSaveOutput = z.object({
  outcome: z.enum(["deleted", "rebased", "no_draft"])
});

// ── drafts.markUnsent ────────────────────────────────────────────
export const markUnsentInput = cloudDocumentRef.extend({
  revision: z.number().int().min(1),
  reason: z.string().min(1).max(256)
});
export const markUnsentOutput = z.object({ marked: z.boolean() });

// ── openState.record / openState.get ─────────────────────────────
export const recordContactInput = cloudDocumentRef.extend({
  role: z.string().min(1),
  options: cloudDocumentOptions,
  base: cloudBase.optional()
});
export const recordContactOutput = z.object({ ok: z.literal(true) });
export const getOpenStateOutput = z.object({
  open_state: cloudOpenStateResponse.nullable()
});
