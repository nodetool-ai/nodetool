/**
 * ExternalIdentity model — a messaging-platform account bound to a NodeTool
 * user.
 *
 * One NodeTool user may link several external accounts; one external account
 * maps to exactly one NodeTool user. That second half is structural: the row
 * id is derived from `(provider, external_id)`, so re-linking the same pair
 * writes over the mapping instead of adding a second one.
 */

import { and, eq } from "drizzle-orm";
import { DBModel, createStableUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { externalIdentities } from "./schema/external-identities.js";

export interface LinkExternalIdentityParams {
  provider: string;
  externalId: string;
  userId: string;
}

export class ExternalIdentity extends DBModel {
  static override table = externalIdentities;

  declare id: string;
  declare provider: string;
  declare external_id: string;
  declare user_id: string;
  declare linked_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= ExternalIdentity.rowId(this.provider, this.external_id);
    this.linked_at ??= new Date().toISOString();
  }

  /** The deterministic row id for a `(provider, external_id)` pair. */
  static rowId(provider: string, externalId: string): string {
    return createStableUuid("external_identity", `${provider}:${externalId}`);
  }

  /** The mapping for one external account, or null when it is unlinked. */
  static async findByExternal(
    provider: string,
    externalId: string
  ): Promise<ExternalIdentity | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, provider),
          eq(externalIdentities.external_id, externalId)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return new ExternalIdentity(row as Record<string, unknown>);
  }

  /** Every external account linked to a NodeTool user. */
  static async listForUser(userId: string): Promise<ExternalIdentity[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.user_id, userId));
    return rows.map(
      (row: Record<string, unknown>) => new ExternalIdentity(row)
    );
  }

  /**
   * Bind an external account to a NodeTool user. Linking a pair that is
   * already linked — to the same user or a different one — replaces the
   * mapping rather than adding a row.
   */
  static async link({
    provider,
    externalId,
    userId
  }: LinkExternalIdentityParams): Promise<ExternalIdentity> {
    const identity = new ExternalIdentity({
      id: ExternalIdentity.rowId(provider, externalId),
      provider,
      external_id: externalId,
      user_id: userId,
      linked_at: new Date().toISOString()
    });
    await identity.save();
    return identity;
  }

  /** Remove a mapping. Returns whether there was one to remove. */
  static async unlink(provider: string, externalId: string): Promise<boolean> {
    const existing = await ExternalIdentity.findByExternal(
      provider,
      externalId
    );
    if (!existing) return false;
    await existing.delete();
    return true;
  }
}
