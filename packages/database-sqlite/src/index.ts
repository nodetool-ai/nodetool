import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { assets, jobs, secrets, workflows, resolveResourceId, type Repository, type ResourceDocument, type ResourceKind } from "@nodetool-ai/models-core";
import { migrateSqliteCore } from "./migrations.js";

const tables = { workflows, assets, jobs, secrets };

/** Open the lean repository using the same tables and codecs as the full server. */
export function createSqliteRepository(path: string): Repository {
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("busy_timeout = 5000");
  const db = drizzle(client);
  try {
    migrateSqliteCore(client);
  } catch (cause) {
    client.close();
    throw new Error("SQLite execution database migration failed", { cause });
  }
  async function list(kind: ResourceKind, userId: string): Promise<ResourceDocument[]> {
    const table = tables[kind];
    const rows = await db.select().from(table).where(eq(table.user_id, userId));
    return rows;
  }
  async function get(kind: ResourceKind, userId: string, id: string): Promise<ResourceDocument | null> {
    const table = tables[kind];
    if (!/^[0-9a-f]{12}$/.test(id)) {
      const rows = await db.select().from(table).where(and(eq(table.user_id, userId), eq(table.id, id))).limit(1);
      return rows[0] ?? null;
    }
    return resolveResourceId(await list(kind, userId), id);
  }
  return {
    list, get,
    async put(kind, userId, document) {
      if (!userId) { throw new Error("A resource owner is required"); }
      const existing = document.id ? await get(kind, userId, document.id) : null;
      const id = existing?.id ?? document.id ?? randomBytes(16).toString("hex");
      const now = new Date().toISOString();
      const data: Record<string, unknown> = { ...existing, ...document, id, user_id: userId, created_at: existing?.created_at ?? now, updated_at: now };
      const table = tables[kind];
      const columns = getTableColumns(table);
      const values: Array<{ name: string; value: unknown }> = [];
      for (const [key, column] of Object.entries(columns)) {
        if (!(key in data)) { continue; }
        const value = data[key];
        values.push({ name: column.name, value: value == null ? null : column.mapToDriverValue(value) });
      }
      // Dynamic documents use the schema's own column codecs, including JSON graph columns.
      const names = sql.join(values.map(({ name }) => sql.identifier(name)), sql`, `);
      const parameters = sql.join(values.map(({ value }) => sql`${value}`), sql`, `);
      const updates = sql.join(values.filter(({ name }) => name !== "id" && name !== "created_at").map(({ name }) => sql`${sql.identifier(name)} = excluded.${sql.identifier(name)}`), sql`, `);
      const tableName = getTableConfig(table).name;
      await db.run(sql`INSERT INTO ${sql.identifier(tableName)} (${names}) VALUES (${parameters}) ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${sql.identifier(tableName)}.user_id = ${userId}`);
      const saved = await get(kind, userId, id);
      if (!saved) { throw new Error("Resource ID is already owned by another user"); }
      return saved;
    },
    async delete(kind, userId, id) {
      const existing = await get(kind, userId, id);
      if (!existing) { return false; }
      const table = tables[kind];
      await db.delete(table).where(and(eq(table.id, existing.id), eq(table.user_id, userId)));
      return true;
    },
    close() { client.close(); }
  };
}
