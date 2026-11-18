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
 * grant's `invited_by` name the owner. Disabling a link stops new
 * redemptions; it does not remove collaborators who already joined, and its
 * options stay live for them.
 *
 * A person holds at most one invitation (`share_id` null) and one grant per
 * link they redeemed. A link grant reads its options from the link at every
 * request; an invitation carries its own.
 */

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { applyShareOptions, type ShareOptions } from "./workflow-share.js";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import {
  documentCollaborators,
  documentShares
} from "./schema/document-sharing.js";
import type { CollaboratorRole } from "./workflow-collaborator.js";
import { changingAccess } from "./access-epoch.js";

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
  /** The link this grant came from, null for an invitation. */
  declare share_id: string | null;
  declare allow_history: boolean;
  declare allow_download: boolean;
  declare allow_duplicate: boolean;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
    this.share_id ??= null;
    this.allow_history ??= false;
    this.allow_download ??= false;
    this.allow_duplicate ??= false;
  }

  /** Every grant a user holds on a document: the invitation and each link grant. */
  static async listFor(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string
  ): Promise<DocumentCollaborator[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.document_type, documentType),
          eq(documentCollaborators.document_id, documentId),
          eq(documentCollaborators.user_id, userId)
        )
      );
    return rows.map((r) => new DocumentCollaborator(r));
  }

  /**
   * The user's highest grant on a document, or null. Use it for a role
   * check only: options combine across grants, see `effectiveAccess`.
   */
  static async findFor(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string
  ): Promise<DocumentCollaborator | null> {
    const grants = await DocumentCollaborator.listFor(
      documentType,
      documentId,
      userId
    );
    return grants.find((g) => g.role === "editor") ?? grants[0] ?? null;
  }

  /** The user's invitation on a document, or null. */
  static async findInvitation(
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
          eq(documentCollaborators.user_id, userId),
          isNull(documentCollaborators.share_id)
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
   * Insert the user's invitation, or raise the existing one. It never lowers
   * a role: an editor keeps "editor". Lowering a role is owner-only and goes
   * through `setRole`.
   */
  static async upsert(opts: {
    documentType: SharedDocumentType;
    documentId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
  }): Promise<DocumentCollaborator> {
    const existing = await DocumentCollaborator.findInvitation(
      opts.documentType,
      opts.documentId,
      opts.userId
    );
    if (existing) {
      if (opts.role === "editor" && existing.role !== "editor") {
        existing.role = "editor";
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

  /**
   * Give a person an invitation with exactly `role`, and the options given.
   * An option left out keeps its value.
   */
  static async invite(opts: {
    documentType: SharedDocumentType;
    documentId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
    options?: Partial<ShareOptions>;
  }): Promise<DocumentCollaborator> {
    return changingAccess([{ kind: opts.documentType, id: opts.documentId }], async () => {
      const grant =
        (await DocumentCollaborator.findInvitation(
          opts.documentType,
          opts.documentId,
          opts.userId
        )) ??
        new DocumentCollaborator({
          document_type: opts.documentType,
          document_id: opts.documentId,
          user_id: opts.userId,
          invited_by: opts.invitedBy
        });
      grant.role = opts.role;
      applyShareOptions(grant, opts.options);
      await grant.save();
      return grant;
    });
  }

  /**
   * The grant that redeeming `share` gives the user, created once. Its role
   * is the link's, and its options are read from the link.
   */
  static async redeem(
    share: DocumentShare,
    userId: string
  ): Promise<DocumentCollaborator> {
    const grants = await DocumentCollaborator.listFor(
      share.document_type,
      share.document_id,
      userId
    );
    const existing = grants.find((g) => g.share_id === share.id);
    if (existing) return existing;
    return await DocumentCollaborator.create({
      document_type: share.document_type,
      document_id: share.document_id,
      user_id: userId,
      role: share.role,
      invited_by: share.created_by,
      share_id: share.id
    });
  }

  /** Set the role on every grant the user holds. Returns the grants. */
  static async setRole(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string,
    role: CollaboratorRole
  ): Promise<DocumentCollaborator[]> {
    return changingAccess([{ kind: documentType, id: documentId }], async () => {
      const grants = await DocumentCollaborator.listFor(
        documentType,
        documentId,
        userId
      );
      for (const grant of grants) {
        if (grant.role !== role) {
          grant.role = role;
          await grant.save();
        }
      }
      return grants;
    });
  }

  /** Remove every grant a user holds. Returns true if a row was deleted. */
  static async remove(
    documentType: SharedDocumentType,
    documentId: string,
    userId: string
  ): Promise<boolean> {
    return changingAccess([{ kind: documentType, id: documentId }], async () => {
      const grants = await DocumentCollaborator.listFor(
        documentType,
        documentId,
        userId
      );
      for (const grant of grants) await grant.delete();
      return grants.length > 0;
    });
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
  declare disabled_at: string | null;
  declare allow_history: boolean;
  declare allow_download: boolean;
  declare allow_duplicate: boolean;
  declare owner_notice: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.token ??= randomBytes(24).toString("base64url");
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
    this.revoked_at ??= null;
    this.disabled_at ??= this.revoked_at;
    this.allow_history ??= false;
    this.allow_download ??= false;
    this.allow_duplicate ??= false;
    this.owner_notice ??= null;
  }

  /** A disabled link admits nobody new. */
  get isRevoked(): boolean {
    return this.disabled_at != null;
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
          isNull(documentShares.disabled_at)
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

  /** Stop new redemptions. People who joined keep the link's options. */
  async revoke(): Promise<void> {
    return changingAccess([{ kind: this.document_type, id: this.document_id }], async () => {
      const at = new Date().toISOString();
      this.disabled_at = at;
      this.revoked_at = at;
      await this.save();
    });
  }

  /** Change the link's options. They apply to everyone who joined through it. */
  async setOptions(options: Partial<ShareOptions>): Promise<void> {
    return changingAccess([{ kind: this.document_type, id: this.document_id }], async () => {
      applyShareOptions(this, options);
      await this.save();
    });
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
