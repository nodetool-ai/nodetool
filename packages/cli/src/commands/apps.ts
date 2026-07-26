/**
 * `nodetool apps` — application (mini app) bundles from the local database.
 *
 * An ApplicationBundle is one JSON file carrying an app together with the full
 * graph of every workflow its operations bind, so an app ships as a single
 * artifact. Inside the file an operation's `workflowId` is a bundle-local key;
 * importing creates the workflows and rewrites the keys to the new ids.
 *
 * These commands talk to the local DB directly, like `workflows export-bundle`
 * — no running server. The bundle logic itself is pure and lives in
 * `@nodetool-ai/app-runtime`; only the row writing is here.
 */

import type { Command } from "commander";
import {
  applyBundle,
  bundleFromApplication,
  parseApplicationBundle,
  serializeApplicationBundle,
  type BundleWorkflowSource
} from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  createStableUuid,
  createTimeOrderedUuid,
  releasedApplicationRelease
} from "@nodetool-ai/models";

import { asJson, printTable } from "./output.js";
import { setupLocalDb, LOCAL_USER_ID } from "./local-db.js";

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

async function loadApp(id: string): Promise<Application> {
  const app = await Application.findById(id);
  if (!app || app.user_id !== LOCAL_USER_ID) {
    throw new Error(`Application not found: ${id}`);
  }
  return app;
}

/** Keep a bundle's default filename from escaping the working directory. */
function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") || "app";
}

export function registerAppsCommands(program: Command): void {
  const apps = program
    .command("apps")
    .description("Mini app (application) management");

  apps
    .command("list")
    .description("List applications in the local database")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const rows = (await Application.listByUser(LOCAL_USER_ID)).map((a) => ({
          id: a.id,
          name: a.name,
          operations: a.toDocument().operations.length,
          updated_at: a.updated_at
        }));
        if (opts.json) {
          asJson(rows);
          return;
        }
        printTable(rows, ["id", "name", "operations", "updated_at"]);
      } catch (e) {
        fail(e);
      }
    });

  apps
    .command("export-bundle <application_id>")
    .description(
      "Export an application as a portable bundle: the app document plus the " +
        "full graph of every workflow it binds, in a single JSON file"
    )
    .option("-o, --output <file>", "Output path (default: <name>.app.json)")
    .option(
      "--released",
      "Export the released snapshot and the graphs it pinned, not the draft"
    )
    .action(async (id: string, opts: { output?: string; released?: boolean }) => {
      try {
        const { writeFile } = await import("node:fs/promises");
        await setupLocalDb();
        const app = await loadApp(id);

        const release = opts.released
          ? await releasedApplicationRelease(id)
          : null;
        if (opts.released && !release) {
          throw new Error(`Application ${id} has no released version`);
        }
        const document = release ? release.document : app.toDocument();
        const pinned = new Map(
          (release?.workflows ?? []).map((entry) => [entry.workflowId, entry])
        );

        const sources: BundleWorkflowSource[] = [];
        const seen = new Set<string>();
        for (const operation of document.operations) {
          if (seen.has(operation.workflowId)) continue;
          seen.add(operation.workflowId);
          const pin = pinned.get(operation.workflowId);
          const workflow = await Workflow.find(
            LOCAL_USER_ID,
            operation.workflowId
          );
          const graph = pin?.graph ?? workflow?.getGraph();
          if (!graph) {
            console.error(
              `  warning: operation '${operation.id}' binds missing workflow ` +
                `${operation.workflowId} (left unresolved in the bundle)`
            );
            continue;
          }
          sources.push({
            workflowId: operation.workflowId,
            name: workflow?.name ?? operation.name,
            description: workflow?.description ?? "",
            graph,
            version: pin?.version ?? null,
            graphHash: pin?.graphHash ?? null
          });
        }

        const bundle = bundleFromApplication(
          { name: app.name, description: app.description, document },
          sources
        );
        const outPath =
          opts.output ?? `${safeFileName(app.name)}.app.json`;
        await writeFile(outPath, serializeApplicationBundle(bundle), "utf8");
        console.error(
          `  bundled ${bundle.workflows.length} workflow(s) with app '${app.name}'`
        );
        console.log(outPath);
      } catch (e) {
        fail(e);
      }
    });

  apps
    .command("import-bundle <bundle_file>")
    .description(
      "Import an application bundle into the local library: create its " +
        "workflows and the app, with operations rewired to the new ids"
    )
    .option("--json", "Output the created application as JSON")
    .option("--project <id>", "Project to create the app in", "default")
    .action(
      async (
        bundleFile: string,
        opts: { json?: boolean; project?: string }
      ) => {
        try {
          const { readFile } = await import("node:fs/promises");
          await setupLocalDb();

          const bundle = parseApplicationBundle(
            JSON.parse(await readFile(bundleFile, "utf8"))
          );
          if (!bundle) {
            throw new Error(`Not a valid application bundle: ${bundleFile}`);
          }
          // A workflow carrying a `sourceId` gets a row id derived from it, so
          // importing two bundles that ship the same workflow — two example
          // apps binding one template — reuses the row instead of duplicating
          // it. Without a `sourceId` every import creates fresh workflows.
          const result = applyBundle(bundle, {
            newWorkflowId: (workflow) =>
              workflow.sourceId
                ? createStableUuid(LOCAL_USER_ID, workflow.sourceId)
                : createTimeOrderedUuid()
          });

          // Workflows first, so the app never references a row that does not
          // exist yet.
          let reused = 0;
          for (const workflow of result.workflows) {
            if (
              workflow.sourceId &&
              (await Workflow.find(LOCAL_USER_ID, workflow.id))
            ) {
              reused += 1;
              continue;
            }
            await Workflow.create<Workflow>({
              id: workflow.id,
              user_id: LOCAL_USER_ID,
              name: workflow.name,
              description: workflow.description ?? "",
              access: "private",
              graph: workflow.graph
            });
          }
          const app = await Application.create<Application>({
            user_id: LOCAL_USER_ID,
            project_id: opts.project ?? "default",
            name: result.app.name,
            description: result.app.description,
            document: JSON.stringify(result.app.document)
          });

          console.error(
            `  imported app '${app.name}' with ${result.workflows.length} workflow(s)` +
              (reused > 0 ? ` (${reused} already present, reused)` : "")
          );
          if (opts.json) {
            asJson({
              id: app.id,
              name: app.name,
              workflows: result.workflows.map((w) => ({
                id: w.id,
                name: w.name
              }))
            });
          } else {
            console.log(app.id);
          }
        } catch (e) {
          fail(e);
        }
      }
    );
}
