/**
 * Sharing for project documents: per-user grants and role-scoped share links.
 *
 * The same model as workflow sharing (see WorkflowCollaborator and
 * WorkflowShare), keyed by `(document_type, document_id)` so one pair of
 * tables serves every kind in {@link SHARED_DOCUMENT_TYPES}:
 *   • "viewer" — open the document
 *   • "editor" — additionally save changes to it
 *
 * The owner is never stored as a collaborator; ownership is the document
 * row's `user_id`. Only the owner mints links, so a link's `created_by` and a
 * grant's `invited_by` name the owner. Revoking a link stops new redemptions;
 * it does not remove collaborators who already joined.
 */

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import {
  documentCollaborators,
  documentShares
} from "./schema/document-sharing.js";
import type { CollaboratorRole } from "./workflow-collaborator.js";

/** Document kinds shared through these tables. Workflows have their own. */
export const SHARED_DOCUMENT_TYPES = [
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
] as const;

export type SharedDocumentType = (typeof SHARED_DOCUMENT_TYPES)[number];

export function isSharedDocumentType(
  value: unknown
): value is SharedDocumentType {
  return (SHARED_DOCUMENT_TYPES as readonly unknown[]).includes(value);
}

export class DocumentCollaborator extends DBModel {
  static override table = documentCollaborators;

  declare id: string;
  declare document_type: SharedDocumentType;
  declare document_id: string;
  declare user_id: string;
  declare role: CollaboratorRole;
  declare invited_by: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
  }

  /** The grant a user holds on a document, or null. */
  static async findFor(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string
  ): Promise<DocumentCollaborator | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.document_type, documentType),
          eq(documentCollaborators.document_id, documentId),
          eq(documentCollaborators.user_id, userId)
        )
      )
      .limit(1);
    return row ? new DocumentCollaborator(row) : null;
  }

  /** Every grant on a document. */
  static async listForDocument(
    documentType: SharedDocumentType,
    documentId: string
  ): Promise<DocumentCollaborator[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.document_type, documentType),
          eq(documentCollaborators.document_id, documentId)
        )
      );
    return rows.map((r) => new DocumentCollaborator(r));
  }

  /** Every grant a user holds (the "shared with me" set). */
  static async listForUser(userId: string): Promise<DocumentCollaborator[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(documentCollaborators)
      .where(eq(documentCollaborators.user_id, userId));
    return rows.map((r) => new DocumentCollaborator(r));
  }

  /**
   * Insert or update the grant for (document, user). Redeeming a link twice,
   * or a second link with another role, must not fail on the unique index.
   */
  static async upsert(opts: {
    documentType: SharedDocumentType;
    documentId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
  }): Promise<DocumentCollaborator> {
    const existing = await DocumentCollaborator.findFor(
      opts.documentType,
      opts.documentId,
      opts.userId
    );
    if (existing) {
      if (existing.role !== opts.role) {
        existing.role = opts.role;
        await existing.save();
      }
      return existing;
    }
    return await DocumentCollaborator.create({
      document_type: opts.documentType,
      document_id: opts.documentId,
      user_id: opts.userId,
      role: opts.role,
      invited_by: opts.invitedBy
    });
  }

  /** Remove a user's grant. Returns true if a row was deleted. */
  static async remove(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string
  ): Promise<boolean> {
    const existing = await DocumentCollaborator.findFor(
      documentType,
      documentId,
      userId
    );
    if (!existing) return false;
    await existing.delete();
    return true;
  }
}

export class DocumentShare extends DBModel {
  static override table = documentShares;

  declare id: string;
  declare document_type: SharedDocumentType;
  declare document_id: string;
  declare token: string;
  declare role: CollaboratorRole;
  declare created_by: string;
  declare created_at: string;
  declare revoked_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.token ??= randomBytes(24).toString("base64url");
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
    this.revoked_at ??= null;
  }

  get isRevoked(): boolean {
    return this.revoked_at != null;
  }

  /** Look up a link by its token, revoked or not. */
  static async findByToken(token: string): Promise<DocumentShare | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(documentShares)
      .where(eq(documentShares.token, token))
      .limit(1);
    return row ? new DocumentShare(row) : null;
  }

  /** Every link on a document, active and revoked. */
  static async listForDocument(
    documentType: SharedDocumentType,
    documentId: string
  ): Promise<DocumentShare[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.document_type, documentType),
          eq(documentShares.document_id, documentId)
        )
      );
    return rows.map((r) => new DocumentShare(r));
  }

  /**
   * The active link for (document, role), minting one if none exists.
   * Reusing the active link keeps previously copied URLs valid.
   */
  static async ensure(opts: {
    documentType: SharedDocumentType;
    documentId: string;
    role: CollaboratorRole;
    createdBy: string;
  }): Promise<DocumentShare> {
    const db = getPortableDb();
    const [active] = await db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.document_type, opts.documentType),
          eq(documentShares.document_id, opts.documentId),
          eq(documentShares.role, opts.role),
          isNull(documentShares.revoked_at)
        )
      )
      .limit(1);
    if (active) return new DocumentShare(active);
    return await DocumentShare.create({
      document_type: opts.documentType,
      document_id: opts.documentId,
      role: opts.role,
      created_by: opts.createdBy
    });
  }

  async revoke(): Promise<void> {
    this.revoked_at = new Date().toISOString();
    await this.save();
  }
}

/**
 * Delete every grant and link on a document. Called when the document is
 * deleted: ids are client-minted, so a row recreated under the same id must
 * not inherit the old one's collaborators.
 */
export async function removeDocumentSharing(
  documentType: SharedDocumentType,
  documentId: string
): Promise<void> {
  const db = getPortableDb();
  await db
    .delete(documentCollaborators)
    .where(
      and(
        eq(documentCollaborators.document_type, documentType),
        eq(documentCollaborators.document_id, documentId)
      )
    );
  await db
    .delete(documentShares)
    .where(
      and(
        eq(documentShares.document_type, documentType),
        eq(documentShares.document_id, documentId)
      )
    );
}
