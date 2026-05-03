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
    // Handle raw integer booleans from legacy data
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

  isAccessible(): boolean {
    if (!existsSync(this.path)) return false;
    try {
      accessSync(this.path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  static async find(
    userId: string,
    workspaceId: string
  ): Promise<Workspace | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.user_id, userId), eq(workspaces.id, workspaceId)))
      .limit(1);
    return row ? new Workspace(row as Record<string, unknown>) : null;
  }

  static async paginate(
    userId: string,
    opts: { limit?: number; startKey?: string } = {}
  ): Promise<[Workspace[], string]> {
    const { limit = 50 } = opts;
    const db = getDb();
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.user_id, userId))
      .limit(limit + 1);

    const items = rows.map((r: Record<string, unknown>) => new Workspace(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  static async getDefault(userId: string): Promise<Workspace | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.user_id, userId), eq(workspaces.is_default, true)))
      .limit(1);
    return row ? new Workspace(row as Record<string, unknown>) : null;
  }

  static async hasLinkedWorkflows(workspaceId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.workspace_id, workspaceId))
      .limit(1);
    return row != null;
  }

  static async unsetOtherDefaults(userId: string): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.user_id, userId));
    for (const row of rows) {
      const ws = new Workspace(row as Record<string, unknown>);
      if (ws.is_default) {
        ws.is_default = false;
        await ws.save();
      }
    }
  }
}
