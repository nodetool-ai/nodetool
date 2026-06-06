/**
 * Run NodeTool migrations against a Supabase/PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate-supabase.ts
 */

import postgres from "postgres";
import {
  MigrationRunner,
  PostgresJsMigrationAdapter,
} from "../src/migrations/index.js";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  const adapter = new PostgresJsMigrationAdapter(client);
  const runner = new MigrationRunner(adapter);

  console.log("Running migrations on", url.replace(/:\/\/[^:]+:[^@]+@/, "://***@"));
  const applied = await runner.migrate();

  if (applied.length === 0) {
    console.log("No new migrations to apply. Database is up to date.");
  } else {
    console.log("Applied migrations:");
    for (const m of applied) {
      console.log(`  ${m.version} — ${m.name}`);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
