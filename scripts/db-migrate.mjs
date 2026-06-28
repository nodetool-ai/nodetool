// Apply pending PostgreSQL migrations at container startup.
//
// Postgres deployments have no in-process migrate step (only SQLite migrates
// itself during local backend startup), so without this the prod schema drifts
// behind the shipped code on every deploy. Mirrors the runner construction in
// packages/cli/src/commands/db.ts (withPostgresMigrationRunner) but depends only
// on @nodetool-ai/models + postgres, which already ship in the runtime image —
// no need to bundle the full CLI.
//
// Skips cleanly when DATABASE_URL is unset (SQLite installs migrate in-process).
// The runner takes a migration lock, so concurrent boots during a rolling
// deploy are safe.
import { MigrationRunner, PostgresJsMigrationAdapter } from "@nodetool-ai/models";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("[db-migrate] DATABASE_URL not set — skipping (SQLite migrates in-process).");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 30 });
const adapter = new PostgresJsMigrationAdapter(sql);
try {
  const runner = new MigrationRunner(adapter);
  const applied = await runner.migrate({ validateChecksums: true });
  if (applied.length === 0) {
    console.log("[db-migrate] Schema up to date — no migrations applied.");
  } else {
    console.log(`[db-migrate] Applied ${applied.length} migration(s): ${applied.join(", ")}`);
  }
} catch (err) {
  console.error("[db-migrate] FAILED:", err?.message ?? err);
  process.exit(1);
} finally {
  try {
    await adapter.release();
  } finally {
    await sql.end();
  }
}
