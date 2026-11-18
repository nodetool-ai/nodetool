/**
 * `nodetool projects` — list projects, move whole projects between installs
 * as `.nodetool-project` files, and run the migration into project folders.
 *
 * Runs in-process against the local database, asset store, and workspaces, the
 * same ones the local server uses. `export` writes what the server's
 * `GET /api/projects/:id/export` streams, and `import` reads what it accepts.
 */

import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import type { Command } from "commander";
import { Project } from "@nodetool-ai/models";

import { asJson, printTable } from "@nodetool-ai/cli-common/commands/output";
import { setupLocalDb, LOCAL_USER_ID } from "@nodetool-ai/cli-local/local-db";

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

function fileBase(name: string): string {
  return (name || "project").replace(/[^A-Za-z0-9._-]+/g, "_") || "project";
}

export function registerProjectCommands(program: Command): void {
  const projects = program
    .command("projects")
    .description("List, export, import, and migrate projects");

  projects
    .command("list")
    .description("List projects, newest first")
    .option("--archived", "List archived projects instead")
    .option("--json", "Output as JSON")
    .action(async (opts: { archived?: boolean; json?: boolean }) => {
      try {
        await setupLocalDb();
        const rows = await Project.listByUser(
          LOCAL_USER_ID,
          1000,
          opts.archived ?? false
        );
        if (opts.json) {
          asJson(rows.map((row) => row.toResponse()));
          return;
        }
        printTable(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            kind: row.kind,
            updated: row.updated_at
          }))
        );
      } catch (e) {
        fail(e);
      }
    });

  projects
    .command("export <project_id>")
    .description(
      "Write a project with all of its documents, workflows, chats, assets, " +
        "and workspace files to a .nodetool-project file"
    )
    .option("-o, --output <file>", "Output path (default: <name>.nodetool-project)")
    .option(
      "--collect",
      "Copy files the project links from outside its folder into the folder " +
        "first. Without it, a project with linked files is not exported"
    )
    .option("--json", "Print the manifest as JSON")
    .action(
      async (
        projectId: string,
        opts: { output?: string; json?: boolean; collect?: boolean }
      ) => {
        try {
          await setupLocalDb();
          const {
            prepareProjectExport,
            projectArchiveHost,
            ProjectLinkedFilesError,
            streamZip,
            writeProjectArchive,
            PROJECT_ARCHIVE_EXTENSION
          } = await import("@nodetool-ai/project-services");
          const project = await Project.findOwned(LOCAL_USER_ID, projectId);
          if (!project) throw new Error(`Project not found: ${projectId}`);
          try {
            const collected = await prepareProjectExport({
              userId: LOCAL_USER_ID,
              projectId: project.id,
              linkedFiles: opts.collect ? "collect" : "refuse"
            });
            if (collected) {
              console.error(
                `  collected ${collected.copied.length} linked file(s) into the project folder`
              );
            }
          } catch (error) {
            if (error instanceof ProjectLinkedFilesError) {
              for (const file of error.files) {
                console.error(`  linked: ${file.name} (${file.id})`);
              }
              throw new Error(
                opts.collect
                  ? "These linked files could not be collected, so the project was not exported"
                  : "The project links files outside its folder. Run again with --collect to copy them in first"
              );
            }
            throw error;
          }
          const outPath =
            opts.output ?? `${fileBase(project.name)}${PROJECT_ARCHIVE_EXTENSION}`;
          const host = projectArchiveHost();
          let manifest: Awaited<ReturnType<typeof writeProjectArchive>> | null =
            null;
          const zip = streamZip(async (writer) => {
            manifest = await writeProjectArchive(
              {
                userId: LOCAL_USER_ID,
                projectId: project.id,
                storage: host.storage,
                openWorkspace: host.openWorkspace
              },
              writer
            );
          });
          const out = createWriteStream(outPath);
          zip.pipe(out);
          await Promise.race([
            once(out, "finish"),
            once(zip, "error").then(([error]) => {
              throw error;
            })
          ]);
          const written = manifest as Awaited<
            ReturnType<typeof writeProjectArchive>
          > | null;
          if (!written) throw new Error("Export wrote no manifest");
          for (const skip of written.skipped) {
            console.error(`  warning: skipped ${skip.kind} ${skip.id}: ${skip.reason}`);
          }
          if (opts.json) {
            asJson({ file: outPath, manifest: written });
            return;
          }
          const counts = Object.entries(written.counts)
            .filter(([, n]) => n > 0)
            .map(([table, n]) => `${n} ${table}`)
            .join(", ");
          console.error(
            `  exported ${counts || "an empty project"}; ` +
              `${written.assets.length} asset file(s), ` +
              `${written.workspace_files.length} workspace file(s)`
          );
          console.log(outPath);
        } catch (e) {
          fail(e);
        }
      }
    );

  projects
    .command("import <file>")
    .description("Import a .nodetool-project file as a new project")
    .option("--name <name>", "Name for the new project (default: the exported name)")
    .option("--json", "Output the result as JSON")
    .action(async (file: string, opts: { name?: string; json?: boolean }) => {
      try {
        await setupLocalDb();
        const { importProjectArchive, projectArchiveHost } = await import(
          "@nodetool-ai/project-services"
        );
        const result = await importProjectArchive(
          new Uint8Array(await readFile(file)),
          {
            userId: LOCAL_USER_ID,
            name: opts.name,
            ...projectArchiveHost()
          }
        );
        for (const m of result.missing) {
          console.error(`  warning: ${m} is listed but missing from the file`);
        }
        for (const m of result.checksumMismatches) {
          console.error(`  warning: ${m} does not match its checksum`);
        }
        for (const skip of result.skipped) {
          console.error(
            `  note: the export skipped ${skip.kind} ${skip.id}: ${skip.reason}`
          );
        }
        if (opts.json) {
          asJson({
            project: result.project.toResponse(),
            counts: result.counts,
            missing: result.missing,
            checksum_mismatches: result.checksumMismatches,
            skipped: result.skipped
          });
          return;
        }
        console.log(result.project.id);
      } catch (e) {
        fail(e);
      }
    });

  projects
    .command("migrate")
    .description(
      "Move projects from before project folders into their folders. " +
        "Prints the plan. With --yes, confirms it and runs it to the end"
    )
    .option("--yes", "Confirm the migration and run it in this process")
    .option(
      "--location <dir>",
      "Directory new project folders go in. Must be an existing, writable directory"
    )
    .option("--json", "Output as JSON")
    .action(
      async (opts: { yes?: boolean; location?: string; json?: boolean }) => {
        try {
          await setupLocalDb();
          const migration = await import(
            "@nodetool-ai/project-services/project-folder-migration"
          );
          if (!opts.yes) {
            const plan = await migration.buildMigrationPlan(
              LOCAL_USER_ID,
              opts.location
            );
            const status = await migration.readMigrationStatus(LOCAL_USER_ID);
            if (opts.json) {
              asJson({ status, plan });
              return;
            }
            printMigrationPlan(plan, status);
            return;
          }
          const status = await migration.runMigrationToEnd(LOCAL_USER_ID, {
            location: opts.location
          });
          // Files that changed recently or still wait for an upload keep the
          // migration unfinished.
          const unfinished = status.state !== "done";
          if (unfinished || status.failure_count > 0) process.exitCode = 1;
          if (opts.json) {
            asJson(status);
            return;
          }
          console.log(
            `${status.state}: ${status.progress.done} of ${status.progress.total} files moved` +
              (status.location ? ` into ${status.location}` : "")
          );
          for (const failure of status.failures) {
            console.error(`  failed: ${failure.kind} ${failure.name}: ${failure.reason}`);
          }
          if (status.state === "paused") {
            console.error("  The migration was paused in NodeTool. Resume it there.");
          } else if (unfinished) {
            console.error(
              "  Some files are not ready to move yet. Run this command again later to finish."
            );
          }
        } catch (e) {
          fail(e);
        }
      }
    );
}

interface MigrationPlanView {
  projects: number;
  assets: number;
  workflows: number;
  timelines: number;
  extra_workspaces: Array<{
    project_name: string;
    kept: { name: string; path: string };
    hidden: Array<{ name: string; path: string }>;
  }>;
  location: { path: string; permission_prompt: boolean; error: string | null };
}

function printMigrationPlan(
  plan: MigrationPlanView,
  status: { state: string; applies: boolean }
): void {
  console.log(`State: ${status.state}`);
  console.log(`Location: ${plan.location.path}`);
  if (plan.location.error) console.log(`  ${plan.location.error}`);
  if (plan.location.permission_prompt) {
    console.log("  macOS asks for permission before NodeTool can write here.");
  }
  console.log(`Projects that get a folder: ${plan.projects}`);
  console.log(`Files to move: ${plan.assets}`);
  console.log(`Workflows that get a file: ${plan.workflows}`);
  console.log(`Timelines that get a file: ${plan.timelines}`);
  for (const extra of plan.extra_workspaces) {
    console.log(`${extra.project_name} keeps ${extra.kept.path}. Hidden:`);
    for (const hidden of extra.hidden) console.log(`  ${hidden.name} (${hidden.path})`);
  }
  if (status.applies && status.state !== "done") {
    console.log("Run again with --yes to confirm. Nothing is deleted.");
  }
}
