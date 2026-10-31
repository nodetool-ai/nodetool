import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { getTableConfig, pgTable, pgSchema, text, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresAssets, postgresJobs, postgresSecrets, postgresWorkflows, resolveResourceId, SQLITE_CORE_BASELINE_SQL, JOB_TRACE_MARKER_DDL, ASSET_FAVORITE_DDL, type Repository, type ResourceDocument, type ResourceKind } from "@nodetool-ai/models-core";

const tables = { workflows: postgresWorkflows, assets: postgresAssets, jobs: postgresJobs, secrets: postgresSecrets };
const tracking = pgTable("_nodetool_core_migrations", { version: text("version").primaryKey(), applied_at: text("applied_at").notNull() });
const informationColumns = pgSchema("information_schema").table("columns", {
  table_schema: text("table_schema"), table_name: text("table_name"), column_name: text("column_name")
});

async function migrate<T extends PgQueryResultHKT>(database: PgDatabase<T>): Promise<void> {
  await database.transaction(async db => {
    // Serialize concurrent startup attempts before reading or altering the schema.
    await db.execute(sql`SELECT pg_advisory_xact_lock(1719390529)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS _nodetool_core_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
    const applied = new Set((await db.select().from(tracking)).map(({ version }) => version));
    if (!applied.has("20261001_000000")) {
      const statements = SQLITE_CORE_BASELINE_SQL.split(";").map(statement => statement.trim()).filter(Boolean);
      for (const statement of statements.filter(value => value.startsWith("CREATE TABLE"))) {
        await db.execute(sql.raw(statement));
        const table = /^CREATE TABLE IF NOT EXISTS "([a-z_]+)"/.exec(statement)?.[1];
        if (!table) { throw new Error("Invalid frozen core table declaration"); }
        const existing = new Set((await db.select().from(informationColumns).where(and(eq(informationColumns.table_schema, "public"), eq(informationColumns.table_name, table)))).map(row => row.column_name));
        for (const line of statement.split("\n")) {
          const match = /^\s*"([a-z_]+)"\s+(.+?)(?:,)?$/.exec(line);
          if (!match) { continue; }
          const [, column, declaration] = match;
          if (!column || !declaration || existing.has(column)) { continue; }
          const definition = declaration.replace(/ PRIMARY KEY/g, "").replace(/ NOT NULL(?! DEFAULT)/g, "");
          await db.execute(sql`ALTER TABLE ${sql.identifier(table)} ADD COLUMN ${sql.identifier(column)} ${sql.raw(definition)}`);
        }
      }
      for (const statement of statements.filter(value => value.startsWith("CREATE INDEX") || value.startsWith("CREATE UNIQUE INDEX"))) { await db.execute(sql.raw(statement)); }
      await db.execute(sql`UPDATE nodetool_assets SET updated_at = created_at WHERE updated_at IS NULL`);
      await db.execute(sql`UPDATE nodetool_assets SET sketch_document_id = metadata::json->>'sketchDocumentId' WHERE sketch_document_id IS NULL AND metadata IS NOT NULL AND metadata::json->>'sketchDocumentId' IS NOT NULL`);
      await db.insert(tracking).values({ version: "20261001_000000", applied_at: new Date().toISOString() });
    }
    for (const [version, table, column, declaration] of [
      ["20261004_000003", "nodetool_jobs", "has_run_trace", JOB_TRACE_MARKER_DDL],
      ["20261006_000000", "nodetool_assets", "favorite", ASSET_FAVORITE_DDL]
    ]) {
      if (!version || !table || !column || !declaration || applied.has(version)) { continue; }
      const existing = await db.select().from(informationColumns).where(and(eq(informationColumns.table_schema, "public"), eq(informationColumns.table_name, table), eq(informationColumns.column_name, column)));
      if (existing.length === 0) { await db.execute(sql.raw(declaration)); }
      if (column === "has_run_trace") {
        const traceColumns = await db.select().from(informationColumns).where(and(eq(informationColumns.table_schema, "public"), eq(informationColumns.table_name, "nodetool_run_traces")));
        if (traceColumns.length > 0) {
          await db.execute(sql`UPDATE nodetool_jobs SET has_run_trace = 1 WHERE EXISTS (SELECT 1 FROM nodetool_run_traces t WHERE t.kind = 'workflow' AND t.source_id = nodetool_jobs.id AND t.user_id = nodetool_jobs.user_id)`);
        }
      }
      await db.insert(tracking).values({ version, applied_at: new Date().toISOString() });
    }
  });
}

/** Use an actual Drizzle PostgreSQL database, including an embedded PostgreSQL test engine. */
export async function createPostgresRepositoryFromDatabase<T extends PgQueryResultHKT>(db: PgDatabase<T>, close: () => void | Promise<void>): Promise<Repository> {
  await migrate(db);
  async function list(kind: ResourceKind, userId: string): Promise<ResourceDocument[]> {
    const table = tables[kind];
    return db.select().from(table).where(eq(table.user_id, userId));
  }
  async function get(kind: ResourceKind, userId: string, id: string): Promise<ResourceDocument | null> {
    if (/^[0-9a-f]{12}$/.test(id)) { return resolveResourceId(await list(kind, userId), id); }
    const table = tables[kind];
    const records = await db.select().from(table).where(and(eq(table.user_id, userId), eq(table.id, id))).limit(1);
    return records[0] ?? null;
  }
  return {
    get, list, close,
    async put(kind, userId, document) {
      if (!userId) { throw new Error("A resource owner is required"); }
      const existing = document.id ? await get(kind, userId, document.id) : null;
      const id = existing?.id ?? document.id ?? randomBytes(16).toString("hex");
      const data: Record<string, unknown> = { ...existing, ...document, id, user_id: userId, created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      const table = tables[kind];
      const values = Object.entries(getTableColumns(table)).filter(([key]) => key in data).map(([key, column]) => ({ name: column.name, value: data[key] == null ? null : column.mapToDriverValue(data[key]) }));
      const names = sql.join(values.map(({ name }) => sql.identifier(name)), sql`, `);
      const parameters = sql.join(values.map(({ value }) => sql`${value}`), sql`, `);
      const updates = sql.join(values.filter(({ name }) => name !== "id" && name !== "created_at").map(({ name }) => sql`${sql.identifier(name)} = excluded.${sql.identifier(name)}`), sql`, `);
      await db.execute(sql`INSERT INTO ${sql.identifier(getTableConfig(table).name)} (${names}) VALUES (${parameters}) ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${sql.identifier(getTableConfig(table).name)}.user_id = ${userId}`);
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
    }
  };
}

/** Connect the independently installed PostgreSQL adapter and migrate execution tables. */
export async function createPostgresRepository(connectionString: string): Promise<Repository> {
  const client = postgres(connectionString);
  try { return await createPostgresRepositoryFromDatabase(drizzle(client), () => client.end()); }
  catch (cause) { await client.end(); throw new Error("PostgreSQL execution database startup failed", { cause }); }
}
