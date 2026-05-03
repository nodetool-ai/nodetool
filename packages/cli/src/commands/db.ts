import type { Command } from "commander";
import {
  MigrationRunner,
  PostgresJsMigrationAdapter,
  type MigrationStatus
} from "@nodetool-ai/models";

interface DatabaseUrlOptions {
  databaseUrl?: string;
  directUrl?: string;
}

interface JsonOption {
  json?: boolean;
}

interface MigrateOptions extends DatabaseUrlOptions, JsonOption {
  target?: string;
  dryRun?: boolean;
  skipChecksums?: boolean;
}

interface BaselineOptions extends DatabaseUrlOptions, JsonOption {
  force?: boolean;
}

interface RollbackOptions extends DatabaseUrlOptions, JsonOption {
  steps?: string;
}

function resolveDatabaseUrl(opts: DatabaseUrlOptions): string {
  const url =
    opts.directUrl ??
    opts.databaseUrl ??
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL"];

  if (!url) {
    throw new Error(
      "No PostgreSQL connection URL provided. Pass --direct-url/--database-url, " +
        "or set DIRECT_URL or DATABASE_URL to your Supabase direct connection URL."
    );
  }

  return url;
}

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "(provided)";
  }
}

async function withPostgresMigrationRunner<T>(
  databaseUrl: string,
  fn: (runner: MigrationRunner) => Promise<T>
): Promise<T> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30
  });
  const adapter = new PostgresJsMigrationAdapter(sql);

  try {
    return await fn(new MigrationRunner(adapter));
  } finally {
    try {
      await adapter.release();
    } finally {
      await sql.end();
    }
  }
}

function printStatus(status: MigrationStatus, databaseUrl: string): void {
  console.log(`Database: ${maskDatabaseUrl(databaseUrl)}`);
  console.log(`State: ${status.state}`);
  console.log(`Current version: ${status.currentVersion ?? "(none)"}`);
  console.log(`Applied migrations: ${status.applied.length}`);
  console.log(`Pending migrations: ${status.pending.length}`);

  if (status.pending.length > 0) {
    console.log("\nPending:");
    for (const migration of status.pending) {
      console.log(`  ${migration.version}  ${migration.name}`);
    }
  }
}

function printMigrationList(versions: string[], dryRun: boolean): void {
  if (versions.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  console.log(
    dryRun
      ? `Would apply ${versions.length} migration(s):`
      : `Applied ${versions.length} migration(s):`
  );
  for (const version of versions) {
    console.log(`  ${version}`);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runCliAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

function addDatabaseUrlOptions(command: Command): Command {
  return command
    .option(
      "--direct-url <url>",
      "Supabase/PostgreSQL direct connection URL for migrations (preferred)"
    )
    .option(
      "--database-url <url>",
      "Supabase/PostgreSQL connection URL (defaults to DIRECT_URL or DATABASE_URL)"
    );
}

export function registerDbCommands(program: Command): void {
  const db = program
    .command("db")
    .description("Database migration commands for PostgreSQL/Supabase");

  addDatabaseUrlOptions(
    db
      .command("status")
      .description("Show PostgreSQL/Supabase migration status")
      .option("--json", "Output as JSON")
  ).action(async (opts: DatabaseUrlOptions & JsonOption) => {
    await runCliAction(async () => {
      const databaseUrl = resolveDatabaseUrl(opts);
      const status = await withPostgresMigrationRunner(databaseUrl, (runner) =>
        runner.status()
      );

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      printStatus(status, databaseUrl);
    });
  });

  addDatabaseUrlOptions(
    db
      .command("migrate")
      .description("Apply pending PostgreSQL/Supabase migrations")
      .option("--target <version>", "Stop after applying this migration version")
      .option("--dry-run", "Print pending migrations without applying them")
      .option("--skip-checksums", "Skip checksum validation")
      .option("--json", "Output as JSON")
  ).action(async (opts: MigrateOptions) => {
    await runCliAction(async () => {
      const databaseUrl = resolveDatabaseUrl(opts);
      const versions = await withPostgresMigrationRunner(databaseUrl, (runner) =>
        runner.migrate({
          ...(opts.target ? { target: opts.target } : {}),
          dryRun: opts.dryRun ?? false,
          validateChecksums: !(opts.skipChecksums ?? false)
        })
      );

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              dryRun: opts.dryRun ?? false,
              migrations: versions
            },
            null,
            2
          )
        );
        return;
      }

      printMigrationList(versions, opts.dryRun ?? false);
    });
  });

  addDatabaseUrlOptions(
    db
      .command("baseline")
      .description("Mark existing PostgreSQL/Supabase tables as migrated")
      .option("--force", "Clear and recreate migration tracking records")
      .option("--json", "Output as JSON")
  ).action(async (opts: BaselineOptions) => {
    await runCliAction(async () => {
      const databaseUrl = resolveDatabaseUrl(opts);
      const baselined = await withPostgresMigrationRunner(databaseUrl, (runner) =>
        runner.baseline(opts.force ?? false)
      );

      if (opts.json) {
        console.log(JSON.stringify({ baselined }, null, 2));
        return;
      }

      console.log(`Baselined ${baselined} migration(s).`);
    });
  });

  addDatabaseUrlOptions(
    db
      .command("rollback")
      .description("Roll back PostgreSQL/Supabase migrations")
      .option("--steps <n>", "Number of migrations to roll back", "1")
      .option("--json", "Output as JSON")
  ).action(async (opts: RollbackOptions) => {
    await runCliAction(async () => {
      const steps = Number.parseInt(opts.steps ?? "1", 10);
      if (!Number.isInteger(steps) || steps < 1) {
        throw new Error("--steps must be a positive integer");
      }

      const databaseUrl = resolveDatabaseUrl(opts);
      const rolledBack = await withPostgresMigrationRunner(databaseUrl, (runner) =>
        runner.rollback(steps)
      );

      if (opts.json) {
        console.log(JSON.stringify({ rolledBack }, null, 2));
        return;
      }

      if (rolledBack.length === 0) {
        console.log("No migrations to roll back.");
        return;
      }

      console.log(`Rolled back ${rolledBack.length} migration(s):`);
      for (const version of rolledBack) {
        console.log(`  ${version}`);
      }
    });
  });
}
