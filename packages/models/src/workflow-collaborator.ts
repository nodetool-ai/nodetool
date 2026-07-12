/**
 * WorkflowCollaborator model – per-user access grants on a workflow.
 *
 * A row gives `user_id` the given `role` on `workflow_id`:
 *   • "viewer" — open and run the workflow
 *   • "editor" — additionally modify and save it
 *
 * The workflow owner is never stored here; ownership is `workflows.user_id`.
 */

import { eq, and, inArray } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workflowCollaborators } from "./schema/workflow-sharing.js";

export type CollaboratorRole = "viewer" | "editor";

export function isCollaboratorRole(value: unknown): value is CollaboratorRole {
  return value === "viewer" || value === "editor";
}

export class WorkflowCollaborator extends DBModel {
  static override table = workflowCollaborators;

  declare id: string;
  declare workflow_id: string;
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

  /** The collaborator row for a user on a workflow, or null. */
  static async findFor(
    workflowId: string,
    userId: string
  ): Promise<WorkflowCollaborator | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workflowCollaborators)
      .where(
        and(
          eq(workflowCollaborators.workflow_id, workflowId),
          eq(workflowCollaborators.user_id, userId)
        )
      )
      .limit(1);
    return row ? new WorkflowCollaborator(row as Record<string, unknown>) : null;
  }

  /** All collaborators on a workflow. */
  static async listForWorkflow(
    workflowId: string
  ): Promise<WorkflowCollaborator[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(workflowCollaborators)
      .where(eq(workflowCollaborators.workflow_id, workflowId));
    return rows.map(
      (r: Record<string, unknown>) => new WorkflowCollaborator(r)
    );
  }

  /** All grants for a user (the "shared with me" set). */
  static async listForUser(userId: string): Promise<WorkflowCollaborator[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(workflowCollaborators)
      .where(eq(workflowCollaborators.user_id, userId));
    return rows.map(
      (r: Record<string, unknown>) => new WorkflowCollaborator(r)
    );
  }

  /**
   * Insert or update the grant for (workflow, user). Accepting a share link
   * twice, or with a different role, must not fail on the unique index.
   */
  static async upsert(opts: {
    workflowId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
  }): Promise<WorkflowCollaborator> {
    const existing = await WorkflowCollaborator.findFor(
      opts.workflowId,
      opts.userId
    );
    if (existing) {
      if (existing.role !== opts.role) {
        existing.role = opts.role;
        await existing.save();
      }
      return existing;
    }
    return (await WorkflowCollaborator.create({
      workflow_id: opts.workflowId,
      user_id: opts.userId,
      role: opts.role,
      invited_by: opts.invitedBy
    })) as WorkflowCollaborator;
  }

  /** Remove a user's grant. Returns true if a row was deleted. */
  static async remove(workflowId: string, userId: string): Promise<boolean> {
    const existing = await WorkflowCollaborator.findFor(workflowId, userId);
    if (!existing) return false;
    await existing.delete();
    return true;
  }

  /** Delete every grant on a workflow (used when the workflow is deleted). */
  static async removeAllForWorkflow(workflowId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(workflowCollaborators)
      .where(eq(workflowCollaborators.workflow_id, workflowId));
  }

  /** Filter `workflowIds` down to those the user has a grant on. */
  static async grantedWorkflowIds(
    userId: string,
    workflowIds: string[]
  ): Promise<Set<string>> {
    if (workflowIds.length === 0) return new Set();
    const db = getDb();
    const rows = await db
      .select({ workflow_id: workflowCollaborators.workflow_id })
      .from(workflowCollaborators)
      .where(
        and(
          eq(workflowCollaborators.user_id, userId),
          inArray(workflowCollaborators.workflow_id, workflowIds)
        )
      );
    return new Set(rows.map((r: { workflow_id: string }) => r.workflow_id));
  }
}
