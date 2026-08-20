/**
 * Workspace model – stores workspace directories per user.
 *
 * Port of Python's `nodetool.models.workspace`.
 */

import { existsSync, accessSync, constants, mkdirSync } from "node:fs";
import { eq, and } from "drizzle-orm";
import { getManagedWorkspaceDir } from "@nodetool-ai/config";
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
    // Handle raw integer booleans from legacy data. The column is declared
    // `boolean`, so the legacy integer only shows through a widened read.
    const rawIsDefault: unknown = this.is_default;
    if (typeof rawIsDefault === "number") {
      this.is_default = rawIsDefault !== 0;
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
    return row ? new Workspace(row) : null;
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

    const items = rows.map((r: Record<string, unknown>) => new Workspace(r));
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
    return row ? new Workspace(row) : null;
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

  /**
   * True when this workspace is the folder NodeTool manages for the user,
   * rather than one they pointed at themselves.
   *
   * A managed workspace is the only one a cloud deployment exposes: its path is
   * server-owned, so listing and downloading from it cannot reach host files a
   * locally-created workspace row might still point at.
   */
  isManaged(): boolean {
    return this.path === getManagedWorkspaceDir(this.user_id);
  }

  /**
   * The user's default workspace, created if they have none.
   *
   * Every run needs somewhere bounded to read and write, so this never returns
   * null: a user with workspaces but no default gets their first one promoted,
   * and a user with none gets the managed folder under the data dir. Callers
   * treat a failure to create the directory as fatal — running with no
   * workspace is what this exists to prevent.
   */
  static async ensureDefault(userId: string): Promise<Workspace> {
    const existing = await Workspace.getDefault(userId);
    if (existing) {
      // A managed folder can be missing after a data-dir wipe or a fresh
      // container on the same database — recreate it rather than handing back
      // an inaccessible workspace.
      if (existing.isManaged() && !existsSync(existing.path)) {
        mkdirSync(existing.path, { recursive: true });
      }
      return existing;
    }

    const [owned] = await Workspace.paginate(userId, { limit: 1 });
    const first = owned[0];
    if (first) {
      first.is_default = true;
      await first.save();
      return first;
    }

    const path = getManagedWorkspaceDir(userId);
    mkdirSync(path, { recursive: true });
    return (await Workspace.create({
      user_id: userId,
      name: "Default",
      path,
      is_default: true
    })) as Workspace;
  }

  static async unsetOtherDefaults(userId: string): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.user_id, userId));
    for (const row of rows) {
      const ws = new Workspace(row);
      if (ws.is_default) {
        ws.is_default = false;
        await ws.save();
      }
    }
  }
}
