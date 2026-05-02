/**
 * DeploymentAudit model — append-only audit log of deployment activity,
 * partitioned by `user_id`.
 */

import { eq, and, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { deploymentAudit } from "./schema/deployment-audit.js";

export class DeploymentAudit extends DBModel {
  static override table = deploymentAudit;

  declare id: string;
  declare user_id: string;
  declare deployment_name: string | null;
  declare actor: string;
  declare action: string;
  declare status: string;
  declare error: string | null;
  declare meta_json: string | null;
  declare ts: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.actor ??= "";
    this.ts ??= new Date().toISOString();
  }

  /** Append a new audit entry. */
  static async append(input: {
    user_id: string;
    deployment_name?: string;
    actor?: string;
    action: string;
    status: "ok" | "error";
    error?: string;
    meta?: Record<string, unknown>;
  }): Promise<DeploymentAudit> {
    return DeploymentAudit.create<DeploymentAudit>({
      id: createTimeOrderedUuid(),
      user_id: input.user_id,
      deployment_name: input.deployment_name ?? null,
      actor: input.actor ?? input.user_id,
      action: input.action,
      status: input.status,
      error: input.error ?? null,
      meta_json: input.meta ? JSON.stringify(input.meta) : null,
      ts: new Date().toISOString()
    });
  }

  /** Read the latest `limit` audit entries for a user. */
  static async listForUser(
    userId: string,
    limit = 100
  ): Promise<DeploymentAudit[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(deploymentAudit)
      .where(eq(deploymentAudit.user_id, userId))
      .orderBy(desc(deploymentAudit.ts))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new DeploymentAudit(r));
  }

  /** Read entries for a specific deployment owned by a user. */
  static async listForDeployment(
    userId: string,
    deploymentName: string,
    limit = 100
  ): Promise<DeploymentAudit[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(deploymentAudit)
      .where(
        and(
          eq(deploymentAudit.user_id, userId),
          eq(deploymentAudit.deployment_name, deploymentName)
        )
      )
      .orderBy(desc(deploymentAudit.ts))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new DeploymentAudit(r));
  }

  /** Wipe all entries for a user (used on user deletion). */
  static async removeAllForUser(userId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(deploymentAudit)
      .where(eq(deploymentAudit.user_id, userId));
  }
}
