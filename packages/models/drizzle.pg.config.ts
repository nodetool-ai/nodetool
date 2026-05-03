/**
 * Drizzle Kit configuration for PostgreSQL / Supabase.
 *
 * Used by `drizzle-kit` commands when targeting a PostgreSQL database:
 *
 *   npx drizzle-kit generate --config drizzle.pg.config.ts
 *   npx drizzle-kit push    --config drizzle.pg.config.ts
 *   npx drizzle-kit studio  --config drizzle.pg.config.ts
 *
 * Set the DATABASE_URL environment variable to your Supabase / Postgres
 * connection string before running these commands. For Supabase use the
 * direct connection URL (port 5432), not the pooler (port 6543).
 *
 * Example:
 *   DATABASE_URL="postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"
 */

import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for PostgreSQL migrations.\n" +
      "Set it to your Supabase direct connection URL:\n" +
      "  postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"
  );
}

export default defineConfig({
  schema: "./src/schema-pg",
  out: "./src/drizzle-migrations-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
});
