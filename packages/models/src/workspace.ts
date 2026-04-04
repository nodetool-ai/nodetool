/**
 * Workspace model – stores workspace directories per user.
 *
 * Port of Python's `nodetool.models.workspace`.
 */

import { existsSync, accessSync, constants } from "node:fs";
import { eq, and } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workspaces } from "./schema/workspaces.js";
import { workflows } from "./schema/workflows.js";

export class Workspace extends DBModel {
  static override table = workspaces;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare path: string;
  declare is_default: boolean;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    // Drizzle handles boolean<->integer conversion, but handle raw DB reads too
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

  /** Find a workspace by user_id and workspace id. */
  static async find(
    userId: string,
    workspaceId: string
  ): Promise<Workspace | null> {
    const db = getDb();
    const row = db
      .select()
      .from(workspaces)
      .where(
        and(eq(workspaces.user_id, userId), eq(workspaces.id, workspaceId))
      )
      .limit(1)
      .get();
    return row ? new Workspace(row as Record<string, unknown>) : null;
  }

  /** Paginate workspaces for a user. */
  static async paginate(
    userId: string,
    opts: { limit?: number; startKey?: string } = {}
  ): Promise<[Workspace[], string]> {
    const { limit = 50 } = opts;
    const db = getDb();
    const rows = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.user_id, userId))
      .limit(limit + 1)
      .all();

    const items = rows.map((r) => new Workspace(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /** Get the default workspace for a user. */
  static async getDefault(userId: string): Promise<Workspace | null> {
    const db = getDb();
    const row = db
      .select()
      .from(workspaces)
      .where(
        and(eq(workspaces.user_id, userId), eq(workspaces.is_default, true))
      )
      .limit(1)
      .get();
    return row ? new Workspace(row as Record<string, unknown>) : null;
  }

  /** Check if any workflows are linked to a workspace. */
  static async hasLinkedWorkflows(workspaceId: string): Promise<boolean> {
    const db = getDb();
    const row = db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.workspace_id, workspaceId))
      .limit(1)
      .get();
    return row != null;
  }

  /** Unset is_default on all workspaces for a user. */
  static async unsetOtherDefaults(userId: string): Promise<void> {
    const db = getDb();
    const rows = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.user_id, userId))
      .all();
    for (const row of rows) {
      const ws = new Workspace(row as Record<string, unknown>);
      if (ws.is_default) {
        ws.is_default = false;
        await ws.save();
      }
    }
  }
}
