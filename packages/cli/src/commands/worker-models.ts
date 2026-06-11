/**
 * `nodetool worker models` — inspect and manage the HF model cache on a
 * remote GPU worker directly via the WebSocket bridge (no TS server required).
 *
 * Verbs:
 *   worker models list   [<worker-id>] [--json]
 *   worker models download --repo-id <id> [<worker-id>] [-a <glob>] [-i <glob>]
 *   worker models delete  --repo-id <id> [<worker-id>]
 */

import type { Command } from "commander";
import { WorkerManager } from "@nodetool-ai/compute";
import {
  WebsocketPythonBridge,
  type ModelDownloadUpdate
} from "@nodetool-ai/runtime";
import { printTable, asJson } from "./deploy-helpers.js";

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

function collectOption(value: string, previous: string[] | undefined): string[] {
  return previous ? [...previous, value] : [value];
}

// ---------------------------------------------------------------------------
// Bridge connection helper
// ---------------------------------------------------------------------------

/**
 * Resolve the target worker, open a WebSocket bridge, and return it.
 * The bridge has `autoRestart: false` so it won't reconnect once closed —
 * CLI commands are one-shot and call `bridge.close()` in a finally block.
 *
 * When `workerId` is omitted, falls back to the currently-attached instance.
 */
async function openBridge(
  manager: WorkerManager,
  workerId?: string
): Promise<WebsocketPythonBridge> {
  let conn: { wsUrl: string; token: string | null };

  if (workerId) {
    conn = await manager.connectionInfo(workerId);
  } else {
    const active = await manager.getActiveWorker();
    if (!active) {
      throw new Error(
        "No worker attached. Provide a worker id or attach one with `worker create --attach`."
      );
    }
    conn = { wsUrl: active.ws_url, token: active.token };
  }

  const bridge = new WebsocketPythonBridge({
    wsUrl: conn.wsUrl,
    workerToken: conn.token ?? undefined,
    autoRestart: false
  });

  await bridge.connect();

  if (!bridge.supportsModelManagement()) {
    bridge.close();
    throw new Error(
      "This worker's image is too old for model management (protocol_version < 2). " +
        "Upgrade the worker image."
    );
  }

  return bridge;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkerModelsCommands(
  worker: Command,
  getManager: () => Promise<WorkerManager>
): void {
  const models = worker
    .command("models")
    .description("Manage the HF model cache on a remote worker");

  registerList(models, getManager);
  registerDownload(models, getManager);
  registerDelete(models, getManager);
}

// ---------------------------------------------------------------------------
// worker models list
// ---------------------------------------------------------------------------

function registerList(
  models: Command,
  getManager: () => Promise<WorkerManager>
): void {
  models
    .command("list [worker-id]")
    .description("List cached HuggingFace models on the worker")
    .option("--json", "Output as JSON")
    .action(async (workerId: string | undefined, opts: { json?: boolean }) => {
      const manager = await getManager();
      let bridge: WebsocketPythonBridge | null = null;
      try {
        bridge = await openBridge(manager, workerId);
        const cached = await bridge.listCachedModels();
        if (opts.json) {
          asJson(cached);
          return;
        }
        if (cached.length === 0) {
          console.log("(no cached models)");
          return;
        }
        printTable(
          (cached as Record<string, unknown>[]).map((m) => ({
            repo_id: m["repo_id"] ?? m["id"] ?? "",
            type: m["type"] ?? "-",
            size: formatBytes(m["size_on_disk"] as number | undefined),
            pipeline: m["pipeline_tag"] ?? "-"
          })),
          ["repo_id", "type", "size", "pipeline"]
        );
      } finally {
        bridge?.close();
      }
    });
}

// ---------------------------------------------------------------------------
// worker models download
// ---------------------------------------------------------------------------

function registerDownload(
  models: Command,
  getManager: () => Promise<WorkerManager>
): void {
  models
    .command("download [worker-id]")
    .description("Download a HuggingFace model into the worker's cache")
    .requiredOption("--repo-id <id>", "HuggingFace repo id (owner/name)")
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
      async (
        workerId: string | undefined,
        opts: {
          repoId: string;
          filePath?: string;
          allowPatterns?: string[];
          ignorePatterns?: string[];
        }
      ) => {
        const manager = await getManager();
        let bridge: WebsocketPythonBridge | null = null;
        try {
          bridge = await openBridge(manager, workerId);

          let lastLine = "";
          let errorMessage: string | null = null;

          const render = (u: ModelDownloadUpdate) => {
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

          await bridge.downloadModel(
            {
              repo_id: opts.repoId,
              path: opts.filePath ?? null,
              allow_patterns: opts.allowPatterns ?? null,
              ignore_patterns: opts.ignorePatterns ?? null
            },
            render
          );

          if (errorMessage) {
            console.error(errorMessage);
            process.exit(1);
          }
          console.log(`Downloaded '${opts.repoId}' to worker cache.`);
        } finally {
          bridge?.close();
        }
      }
    );
}

// ---------------------------------------------------------------------------
// worker models delete
// ---------------------------------------------------------------------------

function registerDelete(
  models: Command,
  getManager: () => Promise<WorkerManager>
): void {
  models
    .command("delete [worker-id]")
    .description("Delete a cached HuggingFace model from the worker")
    .requiredOption("--repo-id <id>", "HuggingFace repo id (owner/name)")
    .action(
      async (
        workerId: string | undefined,
        opts: { repoId: string }
      ) => {
        const manager = await getManager();
        let bridge: WebsocketPythonBridge | null = null;
        try {
          bridge = await openBridge(manager, workerId);
          const deleted = await bridge.deleteCachedModel(opts.repoId);
          if (deleted) {
            console.log(`Deleted '${opts.repoId}' from worker cache.`);
          } else {
            console.log(`'${opts.repoId}' was not found in the worker cache.`);
          }
        } finally {
          bridge?.close();
        }
      }
    );
}
