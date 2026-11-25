import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  MigrationRunner,
  PostgresMigrationAdapter,
  pgSchema,
  setTestDatabaseConnection
} from "@nodetool-ai/models";

/**
 * Installs an in-process PostgreSQL engine with the production migrations
 * applied, as `initPgliteTestDb` does in the models tests. Call `closeDb()`
 * after each test.
 */
export async function initPgliteDb(): Promise<void> {
  const client = new PGlite();
  const adapter = new PostgresMigrationAdapter({
    async connect() {
      return {
        async query(statement: string, params: unknown[] = []) {
          const results =
            params.length > 0
              ? [await client.query<Record<string, unknown>>(statement, params)]
              : await client.exec(statement);
          const result = results.at(-1);
          return { rows: result?.rows ?? [], rowCount: result?.affectedRows ?? 0 };
        },
        release(): void {}
      };
    }
  });
  try {
    await new MigrationRunner(adapter).migrate();
    await adapter.release();
    setTestDatabaseConnection(
      { dialect: "postgres", db: drizzle(client, { schema: pgSchema }), schema: pgSchema },
      async () => {
        await client.close();
      },
      async (statement) => ({ rows: (await client.query(statement)).rows })
    );
  } catch (error) {
    await adapter.release();
    await client.close();
    throw error;
  }
}
