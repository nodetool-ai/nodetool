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

import { collaboratorRoleSchema } from "./workflows.js";

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
  created_at: z.string().nullable().optional()
});
export type DocumentCollaboratorItem = z.infer<
  typeof documentCollaboratorItem
>;

export const documentShareItem = z.object({
  id: z.string(),
  token: z.string(),
  role: collaboratorRoleSchema,
  created_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional()
});
export type DocumentShareItem = z.infer<typeof documentShareItem>;

export const documentSharingGetOutput = z.object({
  collaborators: z.array(documentCollaboratorItem),
  shares: z.array(documentShareItem)
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
