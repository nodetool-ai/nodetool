/**
 * `nodetool collections` — manage RAG vector-store collections.
 *
 * CRUD + semantic query go through the tRPC `collections` router; document
 * indexing uses the REST multipart endpoint (`POST /api/collections/:name/index`)
 * which tRPC's JSON link can't carry. All commands talk to a running server
 * (default http://localhost:7777), so start one with `nodetool serve` first.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";

import { asJson, printTable, printKv, confirm } from "./deploy-helpers.js";

const DEFAULT_API_URL =
  process.env["NODETOOL_API_URL"] ?? "http://localhost:7777";

function apiClient(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        // POST keeps batched input in the body, under reverse-proxy URL limits.
        methodOverride: "POST"
      })
    ]
  });
}

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

export function registerCollectionCommands(program: Command): void {
  const collections = program
    .command("collections")
    .description("Manage RAG vector-store collections");

  collections
    .command("list")
    .description("List collections with document counts")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(async (opts: { apiUrl: string; json?: boolean }) => {
      try {
        const data = await apiClient(opts.apiUrl).collections.list.query();
        if (opts.json) {
          asJson(data);
          return;
        }
        printTable(
          data.collections.map((c) => ({
            name: c.name,
            count: c.count,
            embedding_model: c.metadata["embedding_model"] ?? "",
            workflow: c.workflow_name ?? ""
          }))
        );
      } catch (e) {
        fail(e);
      }
    });

  collections
    .command("get <name>")
    .description("Show a collection's metadata and document count")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { apiUrl: string; json?: boolean }) => {
      try {
        const data = await apiClient(opts.apiUrl).collections.get.query({ name });
        if (opts.json) {
          asJson(data);
          return;
        }
        printKv({ name: data.name, count: data.count, ...data.metadata });
      } catch (e) {
        fail(e);
      }
    });

  collections
    .command("create <name>")
    .description("Create a collection")
    .option("--embedding-model <model>", "Embedding model id")
    .option("--embedding-provider <provider>", "Embedding provider id")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        opts: {
          apiUrl: string;
          embeddingModel?: string;
          embeddingProvider?: string;
          json?: boolean;
        }
      ) => {
        try {
          const data = await apiClient(opts.apiUrl).collections.create.mutate({
            name,
            ...(opts.embeddingModel
              ? { embedding_model: opts.embeddingModel }
              : {}),
            ...(opts.embeddingProvider
              ? { embedding_provider: opts.embeddingProvider }
              : {})
          });
          if (opts.json) {
            asJson(data);
            return;
          }
          console.log(`Created collection '${data.name}'.`);
        } catch (e) {
          fail(e);
        }
      }
    );

  collections
    .command("delete <name>")
    .description("Delete a collection and all its documents")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .action(
      async (name: string, opts: { apiUrl: string; yes?: boolean }) => {
        try {
          const ok = await confirm(
            `Delete collection '${name}' and all its documents?`,
            { force: opts.yes }
          );
          if (!ok) {
            console.error("Aborted.");
            process.exit(1);
          }
          const data = await apiClient(opts.apiUrl).collections.delete.mutate({
            name
          });
          console.log(data.message);
        } catch (e) {
          fail(e);
        }
      }
    );

  collections
    .command("query <name> <text...>")
    .description("Semantic search over a collection")
    .option("-n, --n-results <n>", "Number of results per query", "10")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        text: string[],
        opts: { apiUrl: string; nResults: string; json?: boolean }
      ) => {
        try {
          const nResults = Number.parseInt(opts.nResults, 10);
          if (!Number.isFinite(nResults) || nResults <= 0) {
            console.error(`Invalid --n-results value: ${opts.nResults}`);
            process.exit(1);
          }
          const query = text.join(" ");
          const data = await apiClient(opts.apiUrl).collections.query.query({
            name,
            query_texts: [query],
            n_results: nResults
          });
          if (opts.json) {
            asJson(data);
            return;
          }
          const ids = data.ids[0] ?? [];
          const documents = data.documents[0] ?? [];
          const distances = data.distances[0] ?? [];
          if (ids.length === 0) {
            console.log("(no matches)");
            return;
          }
          printTable(
            ids.map((id, i) => ({
              id,
              distance: distances[i]?.toFixed(4) ?? "",
              document: (documents[i] ?? "").replace(/\s+/g, " ").slice(0, 80)
            }))
          );
        } catch (e) {
          fail(e);
        }
      }
    );

  collections
    .command("index <name> <file...>")
    .description("Chunk and index one or more text documents into a collection")
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        files: string[],
        opts: { apiUrl: string; json?: boolean }
      ) => {
        const apiUrl = opts.apiUrl.replace(/\/+$/, "");
        const results: { file: string; chunks: number; error: string }[] = [];
        for (const file of files) {
          try {
            const bytes = await readFile(file);
            const form = new FormData();
            form.append(
              "file",
              new Blob([bytes]),
              basename(file)
            );
            const res = await fetch(
              `${apiUrl}/api/collections/${encodeURIComponent(name)}/index`,
              { method: "POST", body: form }
            );
            const body = (await res.json().catch(() => ({}))) as {
              chunks?: number;
              detail?: string;
            };
            if (!res.ok) {
              results.push({
                file,
                chunks: 0,
                error: body.detail ?? `HTTP ${res.status}`
              });
            } else {
              results.push({ file, chunks: body.chunks ?? 0, error: "" });
            }
          } catch (e) {
            results.push({
              file,
              chunks: 0,
              error: String(e instanceof Error ? e.message : e)
            });
          }
        }
        if (opts.json) {
          asJson(results);
        } else {
          printTable(results);
        }
        if (results.some((r) => r.error)) process.exit(1);
      }
    );
}
