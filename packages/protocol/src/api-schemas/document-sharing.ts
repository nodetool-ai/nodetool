/**
 * Document sharing — the `documentSharing.*` tRPC procedures.
 *
 * Private sharing for project documents other than workflows, which keep
 * `workflows.sharing.*`. The owner mints role-scoped links; any signed-in
 * user who redeems one becomes a collaborator. A "viewer" opens the document,
 * an "editor" also saves changes. Only the owner manages links and grants and
 * deletes the document. See packages/models document-sharing.
 */

import { z } from "zod";

import {
  collaboratorRoleSchema,
  shareOptionsPatch,
  shareOptionsSchema,
  sharingPersonItem,
  effectiveAccessItem
} from "./workflows.js";

export const sharedDocumentTypeSchema = z.enum([
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
]);
export type SharedDocumentTypeValue = z.infer<typeof sharedDocumentTypeSchema>;

/** A document named by kind and id. */
export const documentRefInput = z.object({
  type: sharedDocumentTypeSchema,
  id: z.string().min(1)
});
export type DocumentRefInput = z.infer<typeof documentRefInput>;

export const documentCollaboratorItem = z.object({
  user_id: z.string(),
  role: collaboratorRoleSchema,
  invited_by: z.string(),
  created_at: z.string().nullable().optional(),
  /** From the user directory, when the collaborator has signed in through SSO. */
  display_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  /** The link this grant came from, null for an invitation. */
  share_id: z.string().nullable().optional(),
  /** An invitation's own options. A link grant reads its link's. */
  options: shareOptionsSchema.optional()
});
export type DocumentCollaboratorItem = z.infer<
  typeof documentCollaboratorItem
>;

export const documentShareItem = z.object({
  id: z.string(),
  token: z.string(),
  role: collaboratorRoleSchema,
  created_at: z.string().nullable().optional(),
  /** Same as `disabled_at`. Kept for older clients. */
  revoked_at: z.string().nullable().optional(),
  disabled_at: z.string().nullable().optional(),
  options: shareOptionsSchema.optional(),
  /** A notice for the owner, such as `history_off`, until dismissed. */
  owner_notice: z.string().nullable().optional()
});
export type DocumentShareItem = z.infer<typeof documentShareItem>;

export const documentSharingGetOutput = z.object({
  collaborators: z.array(documentCollaboratorItem),
  shares: z.array(documentShareItem),
  /** Each person once, with their effective role and options (P6). */
  people: z.array(sharingPersonItem).optional()
});
export type DocumentSharingGetOutput = z.infer<
  typeof documentSharingGetOutput
>;

export const documentSharingCreateLinkInput = documentRefInput.extend({
  role: collaboratorRoleSchema
});

export const documentSharingRevokeLinkInput = documentRefInput.extend({
  share_id: z.string().min(1)
});

export const documentSharingSetRoleInput = documentRefInput.extend({
  user_id: z.string().min(1),
  role: collaboratorRoleSchema
});

/**
 * Give a person from the user directory access by name, without a link.
 * The options are the invitation's own.
 */
export const documentSharingInviteInput = documentSharingSetRoleInput.extend({
  options: shareOptionsPatch.optional()
});

/** Change a link's options. They apply to everyone who joined through it. */
export const documentSharingSetLinkOptionsInput = documentRefInput.extend({
  share_id: z.string().min(1),
  options: shareOptionsPatch
});

/** Change the options of a person's invitation. */
export const documentSharingSetInvitationOptionsInput = documentRefInput.extend(
  {
    user_id: z.string().min(1),
    options: shareOptionsPatch
  }
);

/** Dismiss the owner notice on a link. */
export const documentSharingDismissNoticeInput = documentSharingRevokeLinkInput;

export const documentSharingRemoveCollaboratorInput = documentRefInput.extend({
  user_id: z.string().min(1)
});

export const documentSharingOkOutput = z.object({ ok: z.literal(true) });

export const documentSharingAcceptInput = z.object({
  token: z.string().min(1)
});

/** A document the caller can open, with their role on it. */
export const sharedDocumentItem = z.object({
  type: sharedDocumentTypeSchema,
  id: z.string(),
  name: z.string(),
  owner_id: z.string(),
  role: collaboratorRoleSchema,
  updated_at: z.string().nullable().optional()
});
export type SharedDocumentItem = z.infer<typeof sharedDocumentItem>;

export const documentSharingAcceptOutput = sharedDocumentItem;

export const documentSharedWithMeOutput = z.object({
  documents: z.array(sharedDocumentItem)
});
export type DocumentSharedWithMeOutput = z.infer<
  typeof documentSharedWithMeOutput
>;

/** The caller's role and options on a document, null without access. */
export const documentSharingAccessOutput = z.object({
  access: effectiveAccessItem.nullable()
});
export type DocumentSharingAccessOutput = z.infer<
  typeof documentSharingAccessOutput
>;
