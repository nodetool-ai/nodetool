/**
 * WorkflowShare model – share links for a workflow.
 *
 * A share is a random, revocable token minted by the workflow owner with a
 * role attached. Any authenticated user who redeems a `viewer` or `editor`
 * token becomes a collaborator with that role (see WorkflowCollaborator).
 * Revoking a share stops new redemptions; it does not remove collaborators
 * who already joined.
 *
 * A `public` token is never redeemed into a grant. Anyone holding it, signed
 * in or not, can read the workflow, and a signed-in user can copy it into
 * their own workflows. Revoking it stops both.
 */

import { randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { workflowShares } from "./schema/workflow-sharing.js";
import type { CollaboratorRole } from "./workflow-collaborator.js";

export type ShareRole = CollaboratorRole | "public";

export class WorkflowShare extends DBModel {
  static override table = workflowShares;

  declare id: string;
  declare workflow_id: string;
  declare token: string;
  declare role: ShareRole;
  declare created_by: string;
  declare created_at: string;
  declare revoked_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.token ??= WorkflowShare.generateToken();
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
    this.revoked_at ??= null;
  }

  /** URL-safe, unguessable share token. */
  static generateToken(): string {
    return randomBytes(24).toString("base64url");
  }

  get isRevoked(): boolean {
    return this.revoked_at != null;
  }

  /** Look up a share by its token (revoked or not). */
  static async findByToken(token: string): Promise<WorkflowShare | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(workflowShares)
      .where(eq(workflowShares.token, token))
      .limit(1);
    return row ? new WorkflowShare(row) : null;
  }

  /** Active (non-revoked) share with the given role, if one exists. */
  static async findActive(
    workflowId: string,
    role: ShareRole
  ): Promise<WorkflowShare | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(workflowShares)
      .where(
        and(
          eq(workflowShares.workflow_id, workflowId),
          eq(workflowShares.role, role),
          isNull(workflowShares.revoked_at)
        )
      )
      .limit(1);
    return row ? new WorkflowShare(row) : null;
  }

  /** All shares for a workflow, active and revoked. */
  static async listForWorkflow(workflowId: string): Promise<WorkflowShare[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(workflowShares)
      .where(eq(workflowShares.workflow_id, workflowId));
    return rows.map((r: Record<string, unknown>) => new WorkflowShare(r));
  }

  /**
   * The active share link for (workflow, role), minting one if none exists.
   * Reusing the active link keeps previously copied URLs valid.
   */
  static async ensure(opts: {
    workflowId: string;
    role: ShareRole;
    createdBy: string;
  }): Promise<WorkflowShare> {
    const active = await WorkflowShare.findActive(opts.workflowId, opts.role);
    if (active) return active;
    return (await WorkflowShare.create({
      workflow_id: opts.workflowId,
      role: opts.role,
      created_by: opts.createdBy
    }));
  }

  async revoke(): Promise<void> {
    this.revoked_at = new Date().toISOString();
    await this.save();
  }

  /** Delete every share for a workflow (used when the workflow is deleted). */
  static async removeAllForWorkflow(workflowId: string): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(workflowShares)
      .where(eq(workflowShares.workflow_id, workflowId));
  }
}
