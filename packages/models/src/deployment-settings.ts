/**
 * DeploymentSettings model — per-user deployment quota + encrypted credentials.
 *
 * One row per user. Treats `quota_json` and `credentials_json` as opaque
 * strings so the @nodetool-ai/models package doesn't have to pull in the Zod
 * schemas defined in @nodetool-ai/deploy. Higher layers parse and validate.
 */

import { eq } from "drizzle-orm";
import { DBModel } from "./base-model.js";
import { getDb } from "./db.js";
import { deploymentSettings } from "./schema/deployment-settings.js";

export class DeploymentSettings extends DBModel {
  static override table = deploymentSettings;
  static override primaryKey = "user_id";

  declare user_id: string;
  declare quota_json: string;
  declare credentials_json: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.quota_json ??= "{}";
    this.credentials_json ??= "{}";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  static async findByUserId(userId: string): Promise<DeploymentSettings | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(deploymentSettings)
      .where(eq(deploymentSettings.user_id, userId))
      .limit(1);
    return row ? new DeploymentSettings(row as Record<string, unknown>) : null;
  }

  /** Return the existing settings row or a freshly-defaulted unsaved one. */
  static async getOrDefault(userId: string): Promise<DeploymentSettings> {
    return (
      (await DeploymentSettings.findByUserId(userId)) ??
      new DeploymentSettings({ user_id: userId })
    );
  }

  static async upsert(input: {
    user_id: string;
    quota_json?: string;
    credentials_json?: string;
  }): Promise<DeploymentSettings> {
    const existing = await DeploymentSettings.findByUserId(input.user_id);
    if (existing) {
      if (input.quota_json !== undefined) existing.quota_json = input.quota_json;
      if (input.credentials_json !== undefined) {
        existing.credentials_json = input.credentials_json;
      }
      await existing.save();
      return existing;
    }
    return DeploymentSettings.create<DeploymentSettings>({
      user_id: input.user_id,
      quota_json: input.quota_json ?? "{}",
      credentials_json: input.credentials_json ?? "{}"
    });
  }

  static async remove(userId: string): Promise<boolean> {
    const row = await DeploymentSettings.findByUserId(userId);
    if (!row) return false;
    await row.delete();
    return true;
  }
}
