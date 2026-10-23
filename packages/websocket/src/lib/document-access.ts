/**
 * Who may do what to a shared project document.
 *
 *   owner  — the row's `user_id`: everything, including delete and sharing
 *   editor — a collaborator grant with role "editor": read and save
 *   viewer — a collaborator grant with role "viewer": read
 *
 * A caller without the required role gets the same NOT_FOUND a missing id
 * gets, so private document ids are not probeable. Workflows have their own
 * tables and checks in the workflows router.
 */

import {
  Application,
  DocumentCollaborator,
  ImageDocument,
  JsScript,
  Script,
  Storyboard,
  TimelineSequence,
  type SharedDocumentType
} from "@nodetool-ai/models";

export type DocumentRole = "owner" | "editor" | "viewer";

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } satisfies Record<
  DocumentRole,
  number
>;

/** The fields every shared document row carries. */
export interface SharedDocumentRow {
  id: string;
  user_id: string;
  name: string;
  updated_at: string;
}

/** Whether the caller holds at least `minimum` on the document. */
export async function hasDocumentRole(
  type: SharedDocumentType,
  document: Pick<SharedDocumentRow, "id" | "user_id">,
  userId: string,
  minimum: DocumentRole
): Promise<boolean> {
  if (document.user_id === userId) return true;
  if (minimum === "owner") return false;
  const grant = await DocumentCollaborator.findFor(type, document.id, userId);
  return grant !== null && ROLE_RANK[grant.role] >= ROLE_RANK[minimum];
}

const LOADERS: Record<
  SharedDocumentType,
  (id: string) => Promise<SharedDocumentRow | null>
> = {
  storyboard: (id) => Storyboard.findById(id),
  script: (id) => Script.findById(id),
  timeline: (id) => TimelineSequence.findById(id),
  sketch: (id) => ImageDocument.findById(id),
  application: (id) => Application.findById(id),
  jsscript: (id) => JsScript.findById(id)
};

/** Load any shared document row by kind and full id. */
export function loadSharedDocument(
  type: SharedDocumentType,
  id: string
): Promise<SharedDocumentRow | null> {
  return LOADERS[type](id);
}

/**
 * Whether a document shared with the caller makes an asset readable. The
 * asset must belong to the document's owner and the stored row must name its
 * id, so a grant exposes the media the document shows and nothing else of the
 * owner's library.
 */
export async function isAssetSharedWithUser(
  userId: string,
  asset: { id: string; user_id: string }
): Promise<boolean> {
  const grants = await DocumentCollaborator.listForUser(userId);
  for (const grant of grants) {
    const document = await loadSharedDocument(
      grant.document_type,
      grant.document_id
    );
    if (
      document?.user_id === asset.user_id &&
      JSON.stringify(document).includes(asset.id)
    ) {
      return true;
    }
  }
  return false;
}
