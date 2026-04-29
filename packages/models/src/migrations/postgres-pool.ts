/**
 * Helper for creating a `pg.Pool` from a connection URL.
 *
 * `pg` is loaded dynamically as an optional peer dependency, so consumers
 * that only use the SQLite migration path don't need it installed.
 *
 * The connection URL is read from the first non-empty source of:
 *   1. The `url` argument
 *   2. `DATABASE_URL`
 *   3. `POSTGRES_URL`
 *   4. `SUPABASE_DB_URL`
 *
 * For Supabase use the "Connection string" shown under Project Settings →
 * Database (the pooler URL works as well).
 */

export interface CreatePostgresPoolOptions {
  /** Explicit connection URL. Overrides env vars. */
  url?: string;
  /** Pool size. Defaults to 1 for migrations. */
  max?: number;
  /** SSL behaviour. Defaults to `{ rejectUnauthorized: false }` for hosted DBs. */
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface PostgresPoolHandle {
  pool: any;
  close: () => Promise<void>;
}

export function getPostgresUrlFromEnv(): string | null {
  return (
    process.env["DATABASE_URL"] ??
    process.env["POSTGRES_URL"] ??
    process.env["SUPABASE_DB_URL"] ??
    null
  );
}

export async function createPostgresPool(
  opts: CreatePostgresPoolOptions = {}
): Promise<PostgresPoolHandle> {
  const url = opts.url ?? getPostgresUrlFromEnv();
  if (!url) {
    throw new Error(
      "Postgres connection URL not set. Pass `url` or set DATABASE_URL " +
        "(or POSTGRES_URL / SUPABASE_DB_URL)."
    );
  }

  let pg: { Pool: new (config: Record<string, unknown>) => any };
  try {
    pg = (await import("pg")) as unknown as typeof pg;
  } catch {
    throw new Error(
      "The `pg` package is not installed. Install it to run Postgres migrations."
    );
  }

  // Default SSL: most hosted Postgres (Supabase, Neon, RDS) require SSL but
  // present a CA the local trust store doesn't always include.
  const sslDefault =
    /sslmode=disable/i.test(url) || /^postgres(ql)?:\/\/[^/]*localhost/i.test(url)
      ? false
      : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    connectionString: url,
    max: opts.max ?? 1,
    ssl: opts.ssl ?? sslDefault
  });

  return {
    pool,
    close: async () => {
      await pool.end();
    }
  };
}
