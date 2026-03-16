/**
 * Workspace model – stores workspace directories per user.
 *
 * Port of Python's `nodetool.models.workspace`.
 */

import { existsSync, accessSync, constants } from "node:fs";
import type { TableSchema, Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";
import { Workflow } from "./workflow.js";

// ── Schema ───────────────────────────────────────────────────────────

const WORKSPACE_SCHEMA: TableSchema = {
  table_name: "nodetool_workspaces",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    name: { type: "string" },
    path: { type: "string" },
    is_default: { type: "boolean" },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const WORKSPACE_INDEXES: IndexSpec[] = [
  { name: "idx_workspaces_user_id", columns: ["user_id"], unique: false },
];

// ── Model ────────────────────────────────────────────────────────────

export class Workspace extends DBModel {
  static override schema = WORKSPACE_SCHEMA;
  static override indexes = WORKSPACE_INDEXES;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare path: string;
  declare is_default: boolean;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    // SQLite stores booleans as 0/1
    if (typeof this.is_default === "number") {
      this.is_default = (this.is_default as unknown as number) !== 0;
    }
    this.is_default ??= false;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  /** Check if the workspace path exists and is writable. */
  isAccessible(): boolean {
    if (!existsSync(this.path)) return false;
    try {
      accessSync(this.path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a workspace by user_id and workspace id. */
  static async find(
    userId: string,
    workspaceId: string,
  ): Promise<Workspace | null> {
    const condition = field("user_id")
      .equals(userId)
      .and(field("id").equals(workspaceId));
    const [results] = await (
      Workspace as unknown as ModelClass<Workspace>
    ).query({
      condition,
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /** Paginate workspaces for a user. */
  static async paginate(
    userId: string,
    opts: { limit?: number; startKey?: string } = {},
  ): Promise<[Workspace[], string]> {
    const { limit = 50 } = opts;
    const condition = field("user_id").equals(userId);
    return (Workspace as unknown as ModelClass<Workspace>).query({
      condition,
      limit,
    });
  }

  /** Get the default workspace for a user. */
  static async getDefault(userId: string): Promise<Workspace | null> {
    const condition = field("user_id")
      .equals(userId)
      .and(field("is_default").equals(true));
    const [results] = await (
      Workspace as unknown as ModelClass<Workspace>
    ).query({
      condition,
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /** Check if any workflows are linked to a workspace. */
  static async hasLinkedWorkflows(workspaceId: string): Promise<boolean> {
    const [rows] = await (
      Workflow as unknown as ModelClass<Workflow>
    ).query({
      condition: field("workspace_id").equals(workspaceId),
      limit: 1,
    });
    return rows.length > 0;
  }

  /** Unset is_default on all workspaces for a user. */
  static async unsetOtherDefaults(userId: string): Promise<void> {
    const condition = field("user_id").equals(userId);
    const [workspaces] = await (
      Workspace as unknown as ModelClass<Workspace>
    ).query({ condition });
    for (const ws of workspaces) {
      if (ws.is_default) {
        ws.is_default = false;
        await ws.save();
      }
    }
  }
}
