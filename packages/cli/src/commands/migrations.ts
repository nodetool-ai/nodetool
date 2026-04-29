/**
 * `nodetool migrations` — manage database migrations from the command line.
 *
 * Backend selection:
 *   - If `DATABASE_URL` (or `POSTGRES_URL` / `SUPABASE_DB_URL`) is set, runs
 *     against PostgreSQL/Supabase via the `pg` driver.
 *   - Otherwise runs against the local SQLite database.
 *
 * For Supabase, set the connection string from
 *   Project Settings → Database → Connection string  (pooler works too).
 */

import { Command } from "commander";
import Database from "better-sqlite3";
import {
  MigrationRunner,
  PostgresMigrationAdapter,
  SQLiteMigrationAdapter,
  createPostgresPool,
  getPostgresUrlFromEnv
} from "@nodetool-ai/models";
import { getDefaultDbPath } from "@nodetool-ai/config";

interface AdapterHandle {
  adapter: PostgresMigrationAdapter | SQLiteMigrationAdapter;
  backend: "postgres" | "sqlite";
  close: () => Promise<void>;
}

async function openAdapter(opts: {
  databaseUrl?: string;
  sqlite?: string;
}): Promise<AdapterHandle> {
  const url = opts.databaseUrl ?? getPostgresUrlFromEnv();
  if (url) {
    const handle = await createPostgresPool({ url });
    const adapter = new PostgresMigrationAdapter(handle.pool);
    await adapter.begin();
    return {
      adapter,
      backend: "postgres",
      close: async () => {
        try {
          await adapter.commit();
        } catch {
          /* ignore — commit on already-rolled-back txn */
        }
        await adapter.release();
        await handle.close();
      }
    };
  }
  const dbPath = opts.sqlite ?? getDefaultDbPath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 30000");
  const adapter = new SQLiteMigrationAdapter(db);
  return {
    adapter,
    backend: "sqlite",
    close: async () => {
      db.close();
    }
  };
}

function describeBackend(
  h: AdapterHandle,
  opts: { databaseUrl?: string; sqlite?: string }
): string {
  if (h.backend === "postgres") {
    const url = opts.databaseUrl ?? getPostgresUrlFromEnv() ?? "";
    return `postgres (${redact(url)})`;
  }
  return `sqlite (${opts.sqlite ?? getDefaultDbPath()})`;
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:/@]+):[^@]+@/, "://$1:****@");
}

export function registerMigrationsCommands(program: Command): void {
  const cmd = program
    .command("migrations")
    .description(
      "Run/inspect database migrations (SQLite by default; uses Postgres when DATABASE_URL is set)"
    );

  const sharedOpts = (c: Command): Command =>
    c
      .option(
        "--database-url <url>",
        "Postgres connection URL (default: $DATABASE_URL / $POSTGRES_URL / $SUPABASE_DB_URL)"
      )
      .option(
        "--sqlite <path>",
        "Path to SQLite database file (used only when no Postgres URL is configured)"
      );

  sharedOpts(cmd.command("status"))
    .description("Show migration state and pending migrations")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        databaseUrl?: string;
        sqlite?: string;
        json?: boolean;
      }) => {
        const h = await openAdapter(opts);
        try {
          const runner = new MigrationRunner(h.adapter);
          const status = await runner.status();
          if (opts.json) {
            console.log(JSON.stringify(status, null, 2));
            return;
          }
          console.log(`Backend:  ${describeBackend(h, opts)}`);
          console.log(`State:    ${status.state}`);
          console.log(`Current:  ${status.currentVersion ?? "(none)"}`);
          console.log(`Applied:  ${status.applied.length}`);
          console.log(`Pending:  ${status.pending.length}`);
          if (status.pending.length > 0) {
            console.log("\nPending migrations:");
            for (const m of status.pending) {
              console.log(`  ${m.version}  ${m.name}`);
            }
          }
        } finally {
          await h.close();
        }
      }
    );

  sharedOpts(cmd.command("migrate"))
    .description("Apply all pending migrations")
    .option("--target <version>", "Stop after applying this version")
    .option("--dry-run", "Show what would run without applying")
    .option("--no-validate-checksums", "Skip checksum validation")
    .action(
      async (opts: {
        databaseUrl?: string;
        sqlite?: string;
        target?: string;
        dryRun?: boolean;
        validateChecksums?: boolean;
      }) => {
        const h = await openAdapter(opts);
        try {
          const runner = new MigrationRunner(h.adapter);
          console.log(`Backend: ${describeBackend(h, opts)}`);
          const applied = await runner.migrate({
            ...(opts.target ? { target: opts.target } : {}),
            ...(opts.dryRun ? { dryRun: true } : {}),
            validateChecksums: opts.validateChecksums !== false
          });
          if (applied.length === 0) {
            console.log("No pending migrations — database is up to date.");
          } else {
            console.log(
              `${opts.dryRun ? "Would apply" : "Applied"} ${applied.length} migration(s):`
            );
            for (const v of applied) console.log(`  ${v}`);
          }
        } catch (e) {
          console.error(String(e));
          process.exit(1);
        } finally {
          await h.close();
        }
      }
    );

  sharedOpts(cmd.command("rollback"))
    .description("Roll back the last N applied migration(s)")
    .option("--steps <n>", "Number of migrations to roll back", "1")
    .action(
      async (opts: {
        databaseUrl?: string;
        sqlite?: string;
        steps: string;
      }) => {
        const h = await openAdapter(opts);
        try {
          const runner = new MigrationRunner(h.adapter);
          const steps = Number.parseInt(opts.steps, 10);
          if (!Number.isFinite(steps) || steps < 1) {
            throw new Error(`Invalid --steps value: ${opts.steps}`);
          }
          console.log(`Backend: ${describeBackend(h, opts)}`);
          const rolled = await runner.rollback(steps);
          if (rolled.length === 0) {
            console.log("Nothing to roll back.");
          } else {
            console.log(`Rolled back ${rolled.length} migration(s):`);
            for (const v of rolled) console.log(`  ${v}`);
          }
        } catch (e) {
          console.error(String(e));
          process.exit(1);
        } finally {
          await h.close();
        }
      }
    );

  sharedOpts(cmd.command("baseline"))
    .description(
      "Mark migrations whose tables already exist as applied (for legacy DBs)"
    )
    .option("--force", "Re-baseline even if tracking already exists")
    .action(
      async (opts: {
        databaseUrl?: string;
        sqlite?: string;
        force?: boolean;
      }) => {
        const h = await openAdapter(opts);
        try {
          const runner = new MigrationRunner(h.adapter);
          console.log(`Backend: ${describeBackend(h, opts)}`);
          const n = await runner.baseline(Boolean(opts.force));
          console.log(`Baselined ${n} migration(s).`);
        } catch (e) {
          console.error(String(e));
          process.exit(1);
        } finally {
          await h.close();
        }
      }
    );
}
