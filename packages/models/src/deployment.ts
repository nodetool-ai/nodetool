/**
 * Deployment model — DB-backed deployment configuration + state.
 *
 * Each row stores one deployment's full Zod-validated config (`config_json`)
 * and runtime state (`state_json`) separately so state updates don't have to
 * round-trip the entire config. Deployments are partitioned by `user_id`,
 * matching the convention used across `nodetool_workspaces`,
 * `nodetool_secrets`, and other user-owned resources.
 */

import { eq, and, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid, computeEtag } from "./base-model.js";
import { getDb } from "./db.js";
import { deployments } from "./schema/deployments.js";

export interface DeploymentRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  enabled: boolean;
  config_json: string;
  state_json: string;
  etag: string;
  created_at: string;
  updated_at: string;
}

export class Deployment extends DBModel {
  static override table = deployments;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare type: string;
  declare enabled: boolean;
  declare config_json: string;
  declare state_json: string;
  declare etag: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.enabled ??= true;
    this.config_json ??= "{}";
    this.state_json ??= "{}";
    this.etag ??= "";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    this.etag = computeEtag({
      config: this.config_json,
      state: this.state_json
    });
  }

  /** Look up by (user_id, name). Returns null if not found. */
  static async findByName(
    userId: string,
    name: string
  ): Promise<Deployment | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(deployments)
      .where(and(eq(deployments.user_id, userId), eq(deployments.name, name)))
      .limit(1);
    return row ? new Deployment(row as Record<string, unknown>) : null;
  }

  /** List all deployments owned by a user, ordered by name. */
  static async listForUser(userId: string): Promise<Deployment[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.user_id, userId))
      .orderBy(asc(deployments.name));
    return rows.map((r: Record<string, unknown>) => new Deployment(r));
  }

  /**
   * Insert a new deployment or update an existing one (by user_id + name).
   * Caller is responsible for serializing `config` to JSON; this model treats
   * the JSON as opaque so we don't pull the full Zod schema into the models
   * package.
   */
  static async upsert(input: {
    user_id: string;
    name: string;
    type: string;
    enabled?: boolean;
    config_json: string;
    state_json?: string;
  }): Promise<Deployment> {
    const existing = await Deployment.findByName(input.user_id, input.name);
    if (existing) {
      existing.type = input.type;
      if (input.enabled !== undefined) existing.enabled = input.enabled;
      existing.config_json = input.config_json;
      if (input.state_json !== undefined) existing.state_json = input.state_json;
      await existing.save();
      return existing;
    }
    return Deployment.create<Deployment>({
      id: createTimeOrderedUuid(),
      user_id: input.user_id,
      name: input.name,
      type: input.type,
      enabled: input.enabled ?? true,
      config_json: input.config_json,
      state_json: input.state_json ?? "{}"
    });
  }

  /** Patch only the `state_json` column. */
  static async writeState(
    userId: string,
    name: string,
    stateJson: string
  ): Promise<void> {
    const row = await Deployment.findByName(userId, name);
    if (!row) {
      throw new Error(
        `Deployment ${JSON.stringify(name)} not found for user ${JSON.stringify(userId)}`
      );
    }
    row.state_json = stateJson;
    await row.save();
  }

  /** Remove a deployment (by user_id + name). Returns true if a row was removed. */
  static async remove(userId: string, name: string): Promise<boolean> {
    const row = await Deployment.findByName(userId, name);
    if (!row) return false;
    await row.delete();
    return true;
  }

  /** Bulk-remove all deployments for a user. */
  static async removeAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const rows = await Deployment.listForUser(userId);
    if (rows.length === 0) return 0;
    await db.delete(deployments).where(eq(deployments.user_id, userId));
    return rows.length;
  }
}
