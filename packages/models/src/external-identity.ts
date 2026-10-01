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
import { getDatabase } from "./db.js";
import { externalIdentities } from "./schema/external-identities.js";

export interface LinkExternalIdentityParams {
  provider: string;
  externalId: string;
  userId: string;
}

export type ExternalIdentityRow = typeof externalIdentities.$inferSelect;
export type ExternalIdentityInsert = typeof externalIdentities.$inferInsert;

export class ExternalIdentity extends DBModel {
  static override table = externalIdentities;

  declare id: ExternalIdentityRow["id"];
  declare provider: ExternalIdentityRow["provider"];
  declare external_id: ExternalIdentityRow["external_id"];
  declare user_id: ExternalIdentityRow["user_id"];
  declare linked_at: ExternalIdentityRow["linked_at"];

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
    const connection = getDatabase();
    const table = connection.schema.externalIdentities;
    const condition = and(eq(table.provider, provider), eq(table.external_id, externalId));
    const rows = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.externalIdentities).where(condition).limit(1)
      : await connection.db.select().from(connection.schema.externalIdentities).where(condition).limit(1);
    return rows[0] ? new ExternalIdentity(rows[0]) : null;
  }

  /** Every external account linked to a NodeTool user. */
  static async listForUser(userId: string): Promise<ExternalIdentity[]> {
    const connection = getDatabase();
    const condition = eq(connection.schema.externalIdentities.user_id, userId);
    const rows = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.externalIdentities).where(condition)
      : await connection.db.select().from(connection.schema.externalIdentities).where(condition);
    return rows.map((row) => new ExternalIdentity(row));
  }

  override toRow(): ExternalIdentityInsert {
    return {
      id: this.id, provider: this.provider, external_id: this.external_id,
      user_id: this.user_id, linked_at: this.linked_at
    };
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
