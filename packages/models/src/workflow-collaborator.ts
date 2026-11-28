/**
 * WorkflowCollaborator model – per-user access grants on a workflow.
 *
 * A row gives `user_id` the given `role` on `workflow_id`:
 *   • "viewer" — open and run the workflow
 *   • "editor" — additionally modify and save it
 *
 * The workflow owner is never stored here; ownership is `workflows.user_id`.
 *
 * A person holds at most one invitation (`share_id` null) and one grant per
 * link they redeemed. A link grant reads its options from the link; an
 * invitation carries its own.
 *
 * The owner lowering a person's role or removing them leaves a
 * ShareRoleLimit, so a link the person kept grants no more than the owner
 * left them. Inviting them again or setting their role to editor lifts it.
 */

import { eq, and, inArray, isNull } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { workflowCollaborators } from "./schema/workflow-sharing.js";
import {
  applyShareOptions,
  type ShareOptions,
  type WorkflowShare
} from "./workflow-share.js";
import { changingAccess } from "./access-epoch.js";
import { ShareRoleLimit, limitLinkRole } from "./share-role-limit.js";

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

  /** Every grant a user holds on a workflow. */
  static async listFor(
    workflowId: string,
    userId: string
  ): Promise<WorkflowCollaborator[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(workflowCollaborators)
      .where(
        and(
          eq(workflowCollaborators.workflow_id, workflowId),
          eq(workflowCollaborators.user_id, userId)
        )
      );
    return rows.map((r) => new WorkflowCollaborator(r));
  }

  /**
   * The user's highest grant on a workflow, or null. Use it for a role check
   * only: options combine across grants, see `effectiveAccess`.
   */
  static async findFor(
    workflowId: string,
    userId: string
  ): Promise<WorkflowCollaborator | null> {
    const grants = await WorkflowCollaborator.listFor(workflowId, userId);
    return grants.find((g) => g.role === "editor") ?? grants[0] ?? null;
  }

  /** The user's invitation on a workflow, or null. */
  static async findInvitation(
    workflowId: string,
    userId: string
  ): Promise<WorkflowCollaborator | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(workflowCollaborators)
      .where(
        and(
          eq(workflowCollaborators.workflow_id, workflowId),
          eq(workflowCollaborators.user_id, userId),
          isNull(workflowCollaborators.share_id)
        )
      )
      .limit(1);
    return row ? new WorkflowCollaborator(row) : null;
  }

  /** All collaborators on a workflow. */
  static async listForWorkflow(
    workflowId: string
  ): Promise<WorkflowCollaborator[]> {
    const db = getPortableDb();
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
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(workflowCollaborators)
      .where(eq(workflowCollaborators.user_id, userId));
    return rows.map(
      (r: Record<string, unknown>) => new WorkflowCollaborator(r)
    );
  }

  /**
   * Insert the user's invitation, or raise the existing one. It never lowers
   * a role: an editor keeps "editor". Lowering a role goes through `setRole`.
   */
  static async upsert(opts: {
    workflowId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
  }): Promise<WorkflowCollaborator> {
    const existing = await WorkflowCollaborator.findInvitation(
      opts.workflowId,
      opts.userId
    );
    if (existing) {
      if (opts.role === "editor" && existing.role !== "editor") {
        existing.role = "editor";
        await existing.save();
      }
      return existing;
    }
    return (await WorkflowCollaborator.create({
      workflow_id: opts.workflowId,
      user_id: opts.userId,
      role: opts.role,
      invited_by: opts.invitedBy
    }));
  }

  /**
   * Give a person an invitation with exactly `role`, and the options given.
   * An option left out keeps its value. Inviting lifts the person's role
   * limit unless `keepRoleLimit` is set, as when only options change.
   */
  static async invite(opts: {
    workflowId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy: string;
    options?: Partial<ShareOptions>;
    keepRoleLimit?: boolean;
  }): Promise<WorkflowCollaborator> {
    return changingAccess([{ kind: "workflow", id: opts.workflowId }], async () => {
      if (!opts.keepRoleLimit) {
        await ShareRoleLimit.clear("workflow", opts.workflowId, opts.userId);
      }
      const grant =
        (await WorkflowCollaborator.findInvitation(
          opts.workflowId,
          opts.userId
        )) ??
        new WorkflowCollaborator({
          workflow_id: opts.workflowId,
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
   * is the link's, lowered to the user's role limit, and its options are
   * read from the link. Null when the limit admits the user through no link.
   */
  static async redeem(
    share: WorkflowShare,
    userId: string
  ): Promise<WorkflowCollaborator | null> {
    if (share.role === "public") {
      throw new Error("A public link grants nothing");
    }
    const grants = await WorkflowCollaborator.listFor(share.workflow_id, userId);
    const existing = grants.find((g) => g.share_id === share.id);
    if (existing) return existing;
    const role = limitLinkRole(
      share.role,
      await ShareRoleLimit.find("workflow", share.workflow_id, userId)
    );
    if (role === null) return null;
    return await WorkflowCollaborator.create({
      workflow_id: share.workflow_id,
      user_id: userId,
      role,
      invited_by: share.created_by,
      share_id: share.id
    });
  }

  /**
   * Set the role on every grant the user holds. Returns the grants. Only the
   * owner sets roles: "viewer" also limits what a link the user kept grants
   * them, and "editor" lifts the limit.
   */
  static async setRole(
    workflowId: string,
    userId: string,
    role: CollaboratorRole,
    setBy?: string
  ): Promise<WorkflowCollaborator[]> {
    return changingAccess([{ kind: "workflow", id: workflowId }], async () => {
      const grants = await WorkflowCollaborator.listFor(workflowId, userId);
      for (const grant of grants) {
        if (grant.role !== role) {
          grant.role = role;
          await grant.save();
        }
      }
      if (grants.length > 0) {
        if (role === "editor") {
          await ShareRoleLimit.clear("workflow", workflowId, userId);
        } else {
          await ShareRoleLimit.set({
            documentType: "workflow",
            documentId: workflowId,
            userId,
            role,
            setBy: setBy ?? grants[0].invited_by
          });
        }
      }
      return grants;
    });
  }

  /**
   * Remove every grant a user holds. Returns true if a row was deleted.
   * When `removedBy` is someone other than the user (the owner), no link
   * admits the user again until the owner invites them.
   */
  static async remove(
    workflowId: string,
    userId: string,
    removedBy?: string
  ): Promise<boolean> {
    return changingAccess([{ kind: "workflow", id: workflowId }], async () => {
      const grants = await WorkflowCollaborator.listFor(workflowId, userId);
      for (const grant of grants) await grant.delete();
      if (grants.length > 0 && removedBy !== undefined && removedBy !== userId) {
        await ShareRoleLimit.set({
          documentType: "workflow",
          documentId: workflowId,
          userId,
          role: null,
          setBy: removedBy
        });
      }
      return grants.length > 0;
    });
  }

  /** Delete every grant on a workflow (used when the workflow is deleted). */
  static async removeAllForWorkflow(workflowId: string): Promise<void> {
    return changingAccess([{ kind: "workflow", id: workflowId }], async () => {
      const db = getPortableDb();
      await db
        .delete(workflowCollaborators)
        .where(eq(workflowCollaborators.workflow_id, workflowId));
      await ShareRoleLimit.removeForDocuments("workflow", [workflowId]);
    });
  }

  /** Filter `workflowIds` down to those the user has a grant on. */
  static async grantedWorkflowIds(
    userId: string,
    workflowIds: string[]
  ): Promise<Set<string>> {
    if (workflowIds.length === 0) return new Set();
    const db = getPortableDb();
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
