/**
 * WorkflowVersion model – stores versioned snapshots of workflow graphs.
 */

import { eq, and, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workflowVersions } from "./schema/workflow-versions.js";
import type { WorkflowGraph } from "./workflow.js";

export class WorkflowVersion extends DBModel {
  static override table = workflowVersions;

  declare id: string;
  declare workflow_id: string;
  declare user_id: string;
  declare name: string | null;
  declare description: string | null;
  declare graph: WorkflowGraph;
  declare version: number;
  declare save_type: string;
  declare autosave_metadata: Record<string, unknown> | null;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= null;
    this.description ??= null;
    this.graph ??= { nodes: [], edges: [] };
    this.version ??= 1;
    this.save_type ??= "manual";
    this.autosave_metadata ??= null;
    this.created_at ??= now;
  }

  /** List all versions for a workflow, newest first. */
  static async listForWorkflow(
    workflowId: string,
    opts: { limit?: number } = {}
  ): Promise<WorkflowVersion[]> {
    const { limit = 100 } = opts;
    const db = getDb();
    const rows = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflow_id, workflowId))
      .orderBy(desc(workflowVersions.version))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new WorkflowVersion(r as Record<string, unknown>));
  }

  /** Get a specific version by workflow_id + version number. */
  static async findByVersion(
    workflowId: string,
    version: number
  ): Promise<WorkflowVersion | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflow_id, workflowId),
          eq(workflowVersions.version, version)
        )
      )
      .limit(1);
    return row ? new WorkflowVersion(row as Record<string, unknown>) : null;
  }

  /** Get the next version number for a workflow (max existing + 1). */
  static async nextVersion(workflowId: string): Promise<number> {
    const versions = await WorkflowVersion.listForWorkflow(workflowId, {
      limit: 1
    });
    if (versions.length === 0) return 1;
    return versions[0].version + 1;
  }

  /** Delete oldest versions beyond max_versions for a workflow. */
  static async pruneOldVersions(
    workflowId: string,
    maxVersions: number
  ): Promise<void> {
    const versions = await WorkflowVersion.listForWorkflow(workflowId, {
      limit: 1000
    });
    if (versions.length <= maxVersions) return;
    const toDelete = versions.slice(maxVersions);
    for (const v of toDelete) {
      await v.delete();
    }
  }
}
