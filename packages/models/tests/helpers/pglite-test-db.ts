import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { setTestDatabaseConnection } from "../../src/db.js";
import {
  MigrationRunner,
  PostgresMigrationAdapter
} from "../../src/migrations/index.js";
import * as pgSchema from "../../src/schema-pg/index.js";

/** Execute the production PostgreSQL migrations against an isolated engine. */
export async function initPgliteTestDb(): Promise<void> {
  const client = new PGlite();
  const adapter = new PostgresMigrationAdapter({
    async connect() {
      return {
        async query(statement: string, params: unknown[] = []) {
          // Parameter-free migrations may contain multiple statements, which
          // PGlite's extended-query protocol does not accept in one prepare.
          const results = params.length > 0
            ? [await client.query<Record<string, unknown>>(statement, params)]
            : await client.exec(statement);
          const result = results.at(-1);
          return {
            rows: result?.rows ?? [],
            rowCount: result?.affectedRows ?? 0
          };
        },
        release(): void {}
      };
    }
  });
  try {
    await new MigrationRunner(adapter).migrate();
    await adapter.release();
    setTestDatabaseConnection({
      dialect: "postgres",
      db: drizzle(client, { schema: pgSchema }),
      schema: pgSchema
    }, async () => { await client.close(); });
  } catch (error) {
    await adapter.release();
    await client.close();
    throw error;
  }
}
