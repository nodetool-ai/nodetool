/**
 * WorkflowShare model – share links for a workflow.
 *
 * A share is a random, revocable token minted by the workflow owner with a
 * role attached. Any authenticated user who redeems a `viewer` or `editor`
 * token becomes a collaborator with that role (see WorkflowCollaborator).
 * Revoking a share stops new redemptions; it does not remove collaborators
 * who already joined.
 *
 * A link carries three options, all off by default: history, download and
 * duplicate. A grant redeemed from the link reads them from the link at
 * every request, so a change applies to everyone who joined through it, also
 * after the link is disabled.
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
import { changingAccess } from "./access-epoch.js";

export type ShareRole = CollaboratorRole | "public";

/** What a viewer may do beyond opening a document. Editors may do all three. */
export interface ShareOptions {
  allow_history: boolean;
  allow_download: boolean;
  allow_duplicate: boolean;
}

/** Copy the options that are set onto a grant or a link. */
export function applyShareOptions(
  target: ShareOptions,
  options: Partial<ShareOptions> | undefined
): void {
  if (options?.allow_history !== undefined) {
    target.allow_history = options.allow_history;
  }
  if (options?.allow_download !== undefined) {
    target.allow_download = options.allow_download;
  }
  if (options?.allow_duplicate !== undefined) {
    target.allow_duplicate = options.allow_duplicate;
  }
}

export class WorkflowShare extends DBModel {
  static override table = workflowShares;

  declare id: string;
  declare workflow_id: string;
  declare token: string;
  declare role: ShareRole;
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
    this.token ??= WorkflowShare.generateToken();
    this.role ??= "viewer";
    this.created_at ??= new Date().toISOString();
    this.revoked_at ??= null;
    this.disabled_at ??= this.revoked_at;
    this.allow_history ??= false;
    this.allow_download ??= false;
    this.allow_duplicate ??= false;
    this.owner_notice ??= null;
  }

  /** URL-safe, unguessable share token. */
  static generateToken(): string {
    return randomBytes(24).toString("base64url");
  }

  /** A disabled link admits nobody new. */
  get isRevoked(): boolean {
    return this.disabled_at != null;
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
          isNull(workflowShares.disabled_at)
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

  /** Stop new redemptions. People who joined keep the link's options. */
  async revoke(): Promise<void> {
    return changingAccess([{ kind: "workflow", id: this.workflow_id }], async () => {
      const at = new Date().toISOString();
      this.disabled_at = at;
      this.revoked_at = at;
      await this.save();
    });
  }

  /** Change the link's options. They apply to everyone who joined through it. */
  async setOptions(options: Partial<ShareOptions>): Promise<void> {
    return changingAccess([{ kind: "workflow", id: this.workflow_id }], async () => {
      applyShareOptions(this, options);
      await this.save();
    });
  }

  /** Delete every share for a workflow (used when the workflow is deleted). */
  static async removeAllForWorkflow(workflowId: string): Promise<void> {
    return changingAccess([{ kind: "workflow", id: workflowId }], async () => {
      const db = getPortableDb();
      await db
        .delete(workflowShares)
        .where(eq(workflowShares.workflow_id, workflowId));
    });
  }
}
