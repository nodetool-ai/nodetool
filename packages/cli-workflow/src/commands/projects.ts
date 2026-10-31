/**
 * `nodetool projects` — list projects and move whole projects between
 * installs as `.nodetool-project` files.
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
    .description("List, export, and import projects");

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
    .option("--json", "Print the manifest as JSON")
    .action(
      async (projectId: string, opts: { output?: string; json?: boolean }) => {
        try {
          await setupLocalDb();
          const {
            projectArchiveHost,
            streamZip,
            writeProjectArchive,
            PROJECT_ARCHIVE_EXTENSION
          } = await import("@nodetool-ai/project-services");
          const project = await Project.findOwned(LOCAL_USER_ID, projectId);
          if (!project) throw new Error(`Project not found: ${projectId}`);
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
}
