/**
 * `workflows list|get`, `jobs list|get`, `assets list|get`.
 *
 * Each reads from the local SQLite database, or from a server when `--api-url`
 * (or `NODETOOL_API_URL`) is set. The two sources return different records —
 * the local model row carries every column, the server returns its declared
 * response schema — so both are projected onto one field list per resource
 * before anything is printed. Without that, `--json` handed an agent a
 * different key set depending on an environment variable it never set.
 *
 * Each field list is the intersection of the model row and the server's
 * response schema, so every key in the output is real on both paths: the
 * server's derived fields (`etag`, `get_url`, `thumb_url`, `input_schema`) and
 * the local-only blobs (a job's `graph` and `logs`) are both left out.
 */

import type { Command } from "commander";
import { Workflow, Job, Asset } from "@nodetool-ai/models";
import { createApiClient } from "../api-client.js";
import { printCommandError } from "../command-errors.js";
import { printTable, asJson } from "./output.js";

export interface ResourceReadDeps {
  /** Open the local database. Called only on the direct-DB path. */
  ensureDb: () => void;
  /** The single-user id every direct-DB command runs as. */
  localUserId: string;
}

interface ReadOptions {
  apiUrl?: string;
  json?: boolean;
  limit?: string;
  workflowId?: string;
  query?: string;
  contentType?: string;
}

const WORKFLOW_FIELDS = [
  "id",
  "access",
  "name",
  "tool_name",
  "description",
  "tags",
  "thumbnail",
  "thumbnail_url",
  "graph",
  "settings",
  "package_name",
  "path",
  "run_mode",
  "workspace_id",
  "html_app",
  "app_doc",
  "created_at",
  "updated_at"
] as const;

const JOB_FIELDS = [
  "id",
  "user_id",
  "job_type",
  "status",
  "name",
  "workflow_id",
  "started_at",
  "finished_at",
  "error",
  "cost"
] as const;

const ASSET_FIELDS = [
  "id",
  "user_id",
  "parent_id",
  "name",
  "content_type",
  "size",
  "duration",
  "metadata",
  "sketch_document_id",
  "workflow_id",
  "node_id",
  "job_id",
  "timeline_id",
  "created_at"
] as const;

/** Missing keys become null so both sources emit the same key set. */
function project(
  raw: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    row[field] = raw[field] ?? null;
  }
  return row;
}

function emitList(
  opts: ReadOptions,
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  columns: string[]
): void {
  const projected = rows.map((row) => project(row, fields));
  if (opts.json) {
    asJson(projected);
    return;
  }
  printTable(projected, columns);
}

function emitOne(
  opts: ReadOptions,
  raw: Record<string, unknown>,
  fields: readonly string[],
  columns: string[]
): void {
  const projected = project(raw, fields);
  if (opts.json) {
    asJson(projected);
    return;
  }
  printTable([projected], columns);
}

function parseLimit(limit: string | undefined): number {
  return Number.parseInt(limit ?? "100", 10);
}

export function registerResourceReadCommands(
  parents: { workflows: Command; jobs: Command; assets: Command },
  deps: ResourceReadDeps
): void {
  const { ensureDb, localUserId } = deps;

  parents.workflows
    .command("list")
    .description(
      "List workflows (reads the local database; --api-url for remote)"
    )
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as JSON")
    .action(async (opts: ReadOptions) => {
      try {
        const limit = parseLimit(opts.limit);
        let rows: Record<string, unknown>[];
        if (opts.apiUrl) {
          const data = await createApiClient(opts.apiUrl).workflows.list.query({
            limit
          });
          rows = data.workflows;
        } else {
          ensureDb();
          const [items] = await Workflow.paginate(localUserId, { limit });
          rows = items.map((w) => ({ ...w }));
        }
        emitList(opts, rows, WORKFLOW_FIELDS, ["id", "name", "updated_at"]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  parents.workflows
    .command("get <workflow_id>")
    .description(
      "Get a workflow by ID (reads the local database; --api-url for remote)"
    )
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--json", "Output as JSON")
    .action(async (workflowId: string, opts: ReadOptions) => {
      try {
        let data: Record<string, unknown>;
        if (opts.apiUrl) {
          data = await createApiClient(opts.apiUrl).workflows.get.query({
            id: workflowId
          });
        } else {
          ensureDb();
          const wf = await Workflow.find(localUserId, workflowId);
          if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
          data = { ...wf };
        }
        emitOne(opts, data, WORKFLOW_FIELDS, [
          "id",
          "name",
          "description",
          "updated_at"
        ]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  parents.jobs
    .command("list")
    .description("List jobs (reads the local database; --api-url for remote)")
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--workflow-id <id>", "Filter by workflow ID")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as JSON")
    .action(async (opts: ReadOptions) => {
      try {
        const limit = parseLimit(opts.limit);
        let rows: Record<string, unknown>[];
        if (opts.apiUrl) {
          const query: { limit: number; workflow_id?: string } = { limit };
          if (opts.workflowId) {
            query.workflow_id = opts.workflowId;
          }
          const data = await createApiClient(opts.apiUrl).jobs.list.query(query);
          rows = data.jobs;
        } else {
          ensureDb();
          const page: Parameters<typeof Job.paginate>[1] = { limit };
          if (opts.workflowId) {
            page.workflowId = opts.workflowId;
          }
          const [items] = await Job.paginate(localUserId, page);
          rows = items.map((j) => ({ ...j }));
        }
        emitList(opts, rows, JOB_FIELDS, [
          "id",
          "status",
          "workflow_id",
          "started_at",
          "cost"
        ]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  parents.jobs
    .command("get <job_id>")
    .description(
      "Get a job by ID (reads the local database; --api-url for remote)"
    )
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--json", "Output as JSON")
    .action(async (jobId: string, opts: ReadOptions) => {
      try {
        let data: Record<string, unknown>;
        if (opts.apiUrl) {
          data = await createApiClient(opts.apiUrl).jobs.get.query({
            id: jobId
          });
        } else {
          ensureDb();
          const job = await Job.find(localUserId, jobId);
          if (!job) throw new Error(`Job not found: ${jobId}`);
          data = { ...job };
        }
        emitOne(opts, data, JOB_FIELDS, [
          "id",
          "status",
          "workflow_id",
          "error",
          "cost"
        ]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  parents.assets
    .command("list")
    .description("List assets (reads the local database; --api-url for remote)")
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--query <q>", "Search query")
    .option("--content-type <type>", "Filter by content type")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as JSON")
    .action(async (opts: ReadOptions) => {
      try {
        const limit = parseLimit(opts.limit);
        let rows: Record<string, unknown>[];
        if (opts.apiUrl) {
          const query: { page_size: number; content_type?: string } = {
            page_size: limit
          };
          if (opts.contentType) {
            query.content_type = opts.contentType;
          }
          const data = await createApiClient(opts.apiUrl).assets.list.query(
            query
          );
          rows = data.assets;
        } else {
          ensureDb();
          const page: Parameters<typeof Asset.paginate>[1] = { limit };
          if (opts.contentType) {
            page.contentType = opts.contentType;
          }
          const [items] = await Asset.paginate(localUserId, page);
          rows = items.map((a) => ({ ...a }));
        }
        // --query has no server-side search; filter by name in memory (matches
        // the direct path too, which paginates without a search term).
        if (opts.query) {
          const q = opts.query.toLowerCase();
          rows = rows.filter((r) =>
            String(r["name"] ?? "")
              .toLowerCase()
              .includes(q)
          );
        }
        emitList(opts, rows, ASSET_FIELDS, [
          "id",
          "name",
          "content_type",
          "size"
        ]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  parents.assets
    .command("get <asset_id>")
    .description(
      "Get an asset by ID (reads the local database; --api-url for remote)"
    )
    .option(
      "--api-url <url>",
      "Query a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("--json", "Output as JSON")
    .action(async (assetId: string, opts: ReadOptions) => {
      try {
        let data: Record<string, unknown>;
        if (opts.apiUrl) {
          data = await createApiClient(opts.apiUrl).assets.get.query({
            id: assetId
          });
        } else {
          ensureDb();
          const asset = await Asset.find(localUserId, assetId);
          if (!asset) throw new Error(`Asset not found: ${assetId}`);
          data = { ...asset };
        }
        emitOne(opts, data, ASSET_FIELDS, [
          "id",
          "name",
          "content_type",
          "size",
          "created_at"
        ]);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });
}
