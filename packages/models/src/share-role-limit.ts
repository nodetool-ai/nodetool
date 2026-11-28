/**
 * The most a person may receive from redeeming a share link.
 *
 * A link grants its role to whoever redeems it. When the owner lowers a
 * person's role or removes them, a row here keeps that decision: redeeming a
 * link the person kept gives them at most `role`, and nothing when `role` is
 * null. The owner inviting the person again, or setting their role to
 * editor, deletes the row. A person leaving on their own sets nothing.
 *
 * One table serves workflows (`document_type` "workflow") and every kind in
 * SHARED_DOCUMENT_TYPES.
 */

import { and, eq, inArray } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { shareRoleLimits } from "./schema/document-sharing.js";
import type { CollaboratorRole } from "./workflow-collaborator.js";

export class ShareRoleLimit extends DBModel {
  static override table = shareRoleLimits;

  declare id: string;
  declare document_type: string;
  declare document_id: string;
  declare user_id: string;
  /** The highest role a link may grant, null for none. */
  declare role: CollaboratorRole | null;
  declare set_by: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.role ??= null;
    this.created_at ??= new Date().toISOString();
  }

  static async find(
    documentType: string,
    documentId: string,
    userId: string
  ): Promise<ShareRoleLimit | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(shareRoleLimits)
      .where(
        and(
          eq(shareRoleLimits.document_type, documentType),
          eq(shareRoleLimits.document_id, documentId),
          eq(shareRoleLimits.user_id, userId)
        )
      )
      .limit(1);
    return row ? new ShareRoleLimit(row) : null;
  }

  /** Record the most links may grant the person, replacing any earlier limit. */
  static async set(opts: {
    documentType: string;
    documentId: string;
    userId: string;
    role: CollaboratorRole | null;
    setBy: string;
  }): Promise<void> {
    const limit =
      (await ShareRoleLimit.find(
        opts.documentType,
        opts.documentId,
        opts.userId
      )) ??
      new ShareRoleLimit({
        document_type: opts.documentType,
        document_id: opts.documentId,
        user_id: opts.userId
      });
    limit.role = opts.role;
    limit.set_by = opts.setBy;
    limit.created_at = new Date().toISOString();
    await limit.save();
  }

  static async clear(
    documentType: string,
    documentId: string,
    userId: string
  ): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(shareRoleLimits)
      .where(
        and(
          eq(shareRoleLimits.document_type, documentType),
          eq(shareRoleLimits.document_id, documentId),
          eq(shareRoleLimits.user_id, userId)
        )
      );
  }

  /** Delete every limit on the given documents of one kind. */
  static async removeForDocuments(
    documentType: string,
    documentIds: string[]
  ): Promise<void> {
    if (documentIds.length === 0) return;
    const db = getPortableDb();
    await db
      .delete(shareRoleLimits)
      .where(
        and(
          eq(shareRoleLimits.document_type, documentType),
          inArray(shareRoleLimits.document_id, documentIds)
        )
      );
  }
}

/**
 * The role redeeming a link with `linkRole` gives a person under `limit`,
 * or null when the limit admits them through no link.
 */
export function limitLinkRole(
  linkRole: CollaboratorRole,
  limit: ShareRoleLimit | null
): CollaboratorRole | null {
  if (!limit) return linkRole;
  if (limit.role === null) return null;
  return limit.role === "viewer" ? "viewer" : linkRole;
}
