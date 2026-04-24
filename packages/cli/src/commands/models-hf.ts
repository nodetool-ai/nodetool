/**
 * `nodetool models hf-*` and `download-hf` commands.
 *
 * These operate locally against the HuggingFace cache / Hub HTTP API — they
 * do not require a running nodetool server.
 */

import type { Command } from "commander";

import {
  DownloadManager,
  GENERIC_HF_TYPES,
  SUPPORTED_MODEL_TYPES,
  listAllHfModels,
  readCachedHfModels,
  searchHfHub,
  type DownloadUpdate
} from "@nodetool/huggingface";

import { asJson, printTable } from "./deploy-helpers.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid --limit value: ${String(raw)}`);
    process.exit(1);
  }
  return parsed;
}

function collectOption(value: string, previous: string[] | undefined): string[] {
  return previous ? [...previous, value] : [value];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerHfCommands(models: Command): void {
  registerHfTypes(models);
  registerListHf(models);
  registerListHfAll(models);
  registerHfCache(models);
  registerDownloadHf(models);
}

// ---------------------------------------------------------------------------
// hf-types
// ---------------------------------------------------------------------------

function registerHfTypes(models: Command): void {
  models
    .command("hf-types")
    .description("Print the list of nodetool HF model types")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const types = [...SUPPORTED_MODEL_TYPES];
      const generic = [...GENERIC_HF_TYPES];
      if (opts.json) {
        asJson({ types, generic });
        return;
      }
      for (const t of types) {
        const marker = GENERIC_HF_TYPES.has(t) ? "  (requires --task)" : "";
        console.log(`${t}${marker}`);
      }
      if (generic.length > 0) {
        console.log();
        console.log("Generic types (require --task):");
        for (const t of generic) console.log(`  ${t}`);
      }
    });
}

// ---------------------------------------------------------------------------
// list-hf
// ---------------------------------------------------------------------------

function registerListHf(models: Command): void {
  models
    .command("list-hf <model_type>")
    .description(
      "Search the HuggingFace Hub for models matching a nodetool model type"
    )
    .option("--task <task>", "HF pipeline tag (required for generic types)")
    .option("--limit <n>", "Cap the number of results")
    .option("--json", "Output as JSON")
    .action(
      async (
        modelType: string,
        opts: { task?: string; limit?: string; json?: boolean }
      ) => {
        try {
          const limit = parseLimit(opts.limit);
          const results = await searchHfHub({
            modelType,
            task: opts.task,
            limit
          });
          if (opts.json) {
            asJson(results);
            return;
          }
          printTable(
            results.map((m) => ({
              repo_id: m.id,
              pipeline: m.pipeline_tag ?? "-",
              library: m.library_name ?? "-",
              downloads: m.downloads ?? 0,
              likes: m.likes ?? 0
            }))
          );
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exit(1);
        }
      }
    );
}

// ---------------------------------------------------------------------------
// list-hf-all
// ---------------------------------------------------------------------------

function registerListHfAll(models: Command): void {
  models
    .command("list-hf-all")
    .description(
      "List HuggingFace models across every nodetool HF model type"
    )
    .option("--limit <n>", "Cap the total number of results")
    .option(
      "--repo-only",
      "Keep only repo-level entries (drop file-level entries)"
    )
    .option("--json", "Output as JSON")
    .action(
      async (opts: { limit?: string; repoOnly?: boolean; json?: boolean }) => {
        try {
          const limit = parseLimit(opts.limit);
          const results = await listAllHfModels({
            limit,
            repoOnly: Boolean(opts.repoOnly)
          });
          if (opts.json) {
            asJson(results);
            return;
          }
          printTable(
            results.map((m) => ({
              repo_id: m.id,
              model_type: m.model_type ?? "-",
              pipeline: m.pipeline_tag ?? "-",
              downloads: m.downloads ?? 0
            }))
          );
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exit(1);
        }
      }
    );
}

// ---------------------------------------------------------------------------
// hf-cache
// ---------------------------------------------------------------------------

function registerHfCache(models: Command): void {
  models
    .command("hf-cache")
    .description("List HuggingFace cache entries on the local machine")
    .option("--downloaded-only", "Only show repos fully downloaded to disk")
    .option("--limit <n>", "Cap the number of results")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        downloadedOnly?: boolean;
        limit?: string;
        json?: boolean;
      }) => {
        try {
          let rows = await readCachedHfModels();
          if (opts.downloadedOnly) rows = rows.filter((r) => r.downloaded);
          const limit = parseLimit(opts.limit);
          if (limit) rows = rows.slice(0, limit);

          if (opts.json) {
            asJson(rows);
            return;
          }
          printTable(
            rows.map((r) => ({
              repo_id: r.repo_id ?? r.id,
              path: r.path ?? "-",
              type: r.type ?? "-",
              downloaded: r.downloaded ? "yes" : "no",
              size: formatBytes(r.size_on_disk),
              pipeline: r.pipeline_tag ?? "-"
            }))
          );
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exit(1);
        }
      }
    );
}

// ---------------------------------------------------------------------------
// download-hf
// ---------------------------------------------------------------------------

function registerDownloadHf(models: Command): void {
  models
    .command("download-hf")
    .description(
      "Download a HuggingFace repository (or a single file) into the local cache"
    )
    .requiredOption("--repo-id <id>", "HuggingFace repo id (owner/name)")
    .option("--cache-dir <dir>", "Override cache directory")
    .option("--file-path <path>", "Download a single file from the repo")
    .option(
      "-a, --allow-patterns <pattern>",
      "Only download files matching this glob (repeatable)",
      collectOption
    )
    .option(
      "-i, --ignore-patterns <pattern>",
      "Skip files matching this glob (repeatable)",
      collectOption
    )
    .action(
      async (opts: {
        repoId: string;
        cacheDir?: string;
        filePath?: string;
        allowPatterns?: string[];
        ignorePatterns?: string[];
      }) => {
        const mgr = new DownloadManager();
        let lastLine = "";
        let errorMessage: string | null = null;
        const render = (u: DownloadUpdate) => {
          if (u.status === "error") {
            errorMessage = u.error ?? "download failed";
          }
          const pct =
            u.total_bytes > 0
              ? Math.floor((u.downloaded_bytes / u.total_bytes) * 100)
              : 0;
          const line = `[${u.status}] ${u.repo_id} ${u.downloaded_files}/${u.total_files} files  ${formatBytes(u.downloaded_bytes)}/${formatBytes(u.total_bytes)}  ${pct}%`;
          if (line !== lastLine) {
            process.stderr.write(`\r${line.padEnd(100)}`);
            lastLine = line;
          }
          if (
            u.status === "completed" ||
            u.status === "error" ||
            u.status === "cancelled"
          ) {
            process.stderr.write("\n");
          }
        };

        try {
          await mgr.startDownload(opts.repoId, {
            path: opts.filePath ?? null,
            allowPatterns: opts.allowPatterns ?? null,
            ignorePatterns: opts.ignorePatterns ?? null,
            cacheDir: opts.cacheDir ?? null,
            onProgress: render
          });
          if (errorMessage) {
            console.error(errorMessage);
            process.exit(1);
          }
          console.log(`Downloaded '${opts.repoId}'`);
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exit(1);
        }
      }
    );
}
