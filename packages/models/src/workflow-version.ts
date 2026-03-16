/**
 * WorkflowVersion model – stores versioned snapshots of workflow graphs.
 *
 * Each version captures the graph of a workflow at a point in time,
 * with an auto-incremented version number scoped to the workflow.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";
import type { WorkflowGraph } from "./workflow.js";

// ── Schema ───────────────────────────────────────────────────────────

const WORKFLOW_VERSION_SCHEMA: TableSchema = {
  table_name: "nodetool_workflow_versions",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    workflow_id: { type: "string" },
    user_id: { type: "string" },
    name: { type: "string", optional: true },
    description: { type: "string", optional: true },
    graph: { type: "json" },
    version: { type: "number" },
    save_type: { type: "string" },
    autosave_metadata: { type: "json", optional: true },
    created_at: { type: "datetime" },
  },
};

const WORKFLOW_VERSION_INDEXES: IndexSpec[] = [
  { name: "idx_wv_workflow_id", columns: ["workflow_id"], unique: false },
  { name: "idx_wv_user_id", columns: ["user_id"], unique: false },
  {
    name: "idx_nodetool_workflow_versions_workflow_id_save_type_created_at",
    columns: ["workflow_id", "save_type", "created_at"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class WorkflowVersion extends DBModel {
  static override schema = WORKFLOW_VERSION_SCHEMA;
  static override indexes = WORKFLOW_VERSION_INDEXES;

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

  constructor(data: Row) {
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

  // ── Static queries ───────────────────────────────────────────────

  /** List all versions for a workflow, newest first. */
  static async listForWorkflow(
    workflowId: string,
    opts: { limit?: number } = {},
  ): Promise<WorkflowVersion[]> {
    const { limit = 100 } = opts;
    const [versions] = await (WorkflowVersion as unknown as ModelClass<WorkflowVersion>).query({
      condition: field("workflow_id").equals(workflowId),
      orderBy: "version",
      reverse: true,
      limit,
    });
    return versions;
  }

  /** Get a specific version by workflow_id + version number. */
  static async findByVersion(
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersion | null> {
    const [versions] = await (WorkflowVersion as unknown as ModelClass<WorkflowVersion>).query({
      condition: field("workflow_id").equals(workflowId).and(field("version").equals(version)),
      limit: 1,
    });
    return versions[0] ?? null;
  }

  /** Get the next version number for a workflow (max existing + 1). */
  static async nextVersion(workflowId: string): Promise<number> {
    const versions = await WorkflowVersion.listForWorkflow(workflowId, { limit: 1 });
    if (versions.length === 0) return 1;
    return versions[0].version + 1;
  }

  /** Delete oldest versions beyond max_versions for a workflow. */
  static async pruneOldVersions(workflowId: string, maxVersions: number): Promise<void> {
    const versions = await WorkflowVersion.listForWorkflow(workflowId, { limit: 1000 });
    if (versions.length <= maxVersions) return;
    // versions are sorted newest-first; delete the tail
    const toDelete = versions.slice(maxVersions);
    for (const v of toDelete) {
      await v.delete();
    }
  }
}
