/**
 * `nodetool collections` — manage RAG vector-store collections.
 *
 * Runs in-process against the default vector provider (sqlite-vec unless
 * NODETOOL_VECTOR_PROVIDER points elsewhere), so it works without a running
 * server. Indexing chunks documents with the same splitter the server uses.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import {
  getDefaultVectorProvider,
  splitDocument,
  CollectionNotFoundError
} from "@nodetool-ai/vectorstore";
import { Workflow } from "@nodetool-ai/models";

import { asJson, printTable, printKv, confirm } from "./output.js";
import { setupLocalDb } from "./local-db.js";

function fail(e: unknown): never {
  if (e instanceof CollectionNotFoundError) {
    console.error(e.message);
    process.exit(1);
  }
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

/** Resolve a workflow's name from an id, forgivingly (null on any failure). */
async function workflowName(id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  try {
    const wf = (await Workflow.get(id)) as { name?: string } | null;
    return wf?.name ?? null;
  } catch {
    return null;
  }
}

export function registerCollectionCommands(program: Command): void {
  const collections = program
    .command("collections")
    .description("Manage RAG vector-store collections");

  collections
    .command("list")
    .description("List collections with document counts")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const provider = getDefaultVectorProvider();
        const infos = await provider.listCollections();
        const rows: {
          name: string;
          count: number;
          embedding_model: string | number | boolean;
          workflow: string;
        }[] = [];
        for (const info of infos) {
          try {
            const collection = await provider.getCollection({ name: info.name });
            const count = await collection.count();
            const metadata = info.metadata ?? {};
            rows.push({
              name: info.name,
              count,
              embedding_model: metadata["embedding_model"] ?? "",
              workflow:
                (await workflowName(metadata["workflow"])) ?? ""
            });
          } catch {
            // Skip a collection that races a delete between list and get.
          }
        }
        if (opts.json) {
          asJson(rows);
          return;
        }
        printTable(rows);
      } catch (e) {
        fail(e);
      }
    });

  collections
    .command("get <name>")
    .description("Show a collection's metadata and document count")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const collection = await getDefaultVectorProvider().getCollection({
          name
        });
        const count = await collection.count();
        const metadata = collection.metadata ?? {};
        if (opts.json) {
          asJson({ name: collection.name, count, metadata });
          return;
        }
        printKv({ name: collection.name, count, ...metadata });
      } catch (e) {
        fail(e);
      }
    });

  collections
    .command("create <name>")
    .description("Create a collection")
    .option("--embedding-model <model>", "Embedding model id")
    .option("--embedding-provider <provider>", "Embedding provider id")
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        opts: {
          embeddingModel?: string;
          embeddingProvider?: string;
          json?: boolean;
        }
      ) => {
        try {
          await setupLocalDb();
          const metadata: Record<string, string> = {};
          if (opts.embeddingModel)
            metadata["embedding_model"] = opts.embeddingModel;
          if (opts.embeddingProvider)
            metadata["embedding_provider"] = opts.embeddingProvider;
          const collection = await getDefaultVectorProvider().createCollection({
            name,
            metadata
          });
          if (opts.json) {
            asJson({ name: collection.name, metadata: collection.metadata });
            return;
          }
          console.log(`Created collection '${collection.name}'.`);
        } catch (e) {
          fail(e);
        }
      }
    );

  collections
    .command("delete <name>")
    .description("Delete a collection and all its documents")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { yes?: boolean; json?: boolean }) => {
      try {
        const ok = await confirm(
          `Delete collection '${name}' and all its documents?`,
          { force: opts.yes }
        );
        if (!ok) {
          if (opts.json) asJson({ deleted: false, aborted: true });
          else console.error("Aborted.");
          process.exit(1);
        }
        await setupLocalDb();
        await getDefaultVectorProvider().deleteCollection(name);
        const message = `Collection ${name} deleted successfully`;
        if (opts.json) {
          asJson({ message });
          return;
        }
        console.log(message);
      } catch (e) {
        fail(e);
      }
    });

  collections
    .command("query <name> <text...>")
    .description("Semantic search over a collection")
    .option("-n, --n-results <n>", "Number of results", "10")
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        text: string[],
        opts: { nResults: string; json?: boolean }
      ) => {
        const nResults = Number.parseInt(opts.nResults, 10);
        if (!Number.isFinite(nResults) || nResults <= 0) {
          console.error(`Invalid --n-results value: ${opts.nResults}`);
          process.exit(1);
        }
        try {
          await setupLocalDb();
          const collection = await getDefaultVectorProvider().getCollection({
            name
          });
          const matches = await collection.query({
            text: text.join(" "),
            topK: nResults
          });
          if (opts.json) {
            asJson(matches);
            return;
          }
          if (matches.length === 0) {
            console.log("(no matches)");
            return;
          }
          printTable(
            matches.map((m) => ({
              id: m.id,
              distance: m.distance?.toFixed(4) ?? "",
              document: (m.document ?? "").replace(/\s+/g, " ").slice(0, 80)
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
    .option("--json", "Output as JSON")
    .action(async (name: string, files: string[], opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const collection = await getDefaultVectorProvider().getCollection({
          name
        });
        const results: { file: string; chunks: number; error: string }[] = [];
        for (const file of files) {
          try {
            const text = await readFile(file, "utf8");
            const fileName = basename(file);
            const chunks = splitDocument(text, fileName);
            if (chunks.length > 0) {
              // Derive the record-id prefix from the full path (sanitized) so
              // two files with the same basename (a/foo.txt, b/foo.txt) don't
              // collide and overwrite each other's chunks. Re-indexing the same
              // path stays idempotent.
              const idPrefix = file.replace(/[^A-Za-z0-9._-]+/g, "_");
              await collection.upsert(
                chunks.map((c, i) => ({
                  id: `${idPrefix}#${i}`,
                  document: c.text,
                  metadata: {
                    source: file,
                    start_index: String(c.start_index)
                  }
                }))
              );
            }
            results.push({ file, chunks: chunks.length, error: "" });
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
      } catch (e) {
        fail(e);
      }
    });
}
