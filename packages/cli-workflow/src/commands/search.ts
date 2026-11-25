/**
 * `nodetool search` — the library search index, headless
 * (docs/plans/library-search.md, D28 and D29). Runs in process against the
 * local database, so it works without a running server.
 */

import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { getSecret } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  DEFAULT_LOCAL_EMBEDDING,
  EMBED_JOB_PREFIX,
  IN_PROCESS_EMBEDDING_PROVIDERS,
  libraryIndexStatus,
  readLibraryPassage,
  rebuildLibraryIndex,
  reconcileLibraryIndex,
  runEmbedPass,
  runIndexerPass,
  runLibraryIndexer,
  searchLibrary,
  setLibraryEmbedder,
  setupLibrarySemanticSearch,
  stopLibraryIndexWrites,
  type EmbeddingSpace,
  type LibrarySearchMode
} from "@nodetool-ai/search-services";
import { SEARCH_KINDS, type SearchKind } from "@nodetool-ai/protocol";
import { asJson, printKv, printTable } from "@nodetool-ai/cli-common/commands/output";
import { setupLocalDb } from "@nodetool-ai/cli-local/local-db";

/** The local single-user id every direct-database command runs as. */
const LOCAL_USER_ID = "1";

function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let transformersRegistered = false;

/** Embed through the runtime providers: hosted models through the generation seam, local ones directly. */
async function embedTexts(texts: string[], space: EmbeddingSpace, userId: string): Promise<number[][]> {
  const context = new ProcessingContext({
    jobId: `${EMBED_JOB_PREFIX}${randomUUID()}`,
    userId,
    secretResolver: getSecret
  });
  let result: unknown;
  if (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider)) {
    if (space.provider === "transformers_js" && !transformersRegistered) {
      const { importPack } = await import("@nodetool-ai/node-catalog");
      const pack = await importPack<{ registerTransformersJsProvider(): void }>(
        "transformers-js",
        "@nodetool-ai/transformers-js-provider"
      );
      pack.registerTransformersJsProvider();
      transformersRegistered = true;
    }
    const provider = await context.getProvider(space.provider);
    result = await provider.generateEmbedding({ text: texts, model: space.model });
  } else {
    result = await context.runProviderPrediction({
      provider: space.provider,
      capability: "generate_embedding",
      model: space.model,
      params: { text: texts }
    });
  }
  if (!Array.isArray(result) || !result.every((row) => Array.isArray(row))) {
    throw new Error(`${space.provider} returned no embeddings for ${space.model}.`);
  }
  return result as number[][];
}

/** Open the database and use this process for embedding. Inline index writes stay off: the commands reconcile. */
async function openIndex(): Promise<void> {
  await setupLocalDb();
  stopLibraryIndexWrites();
  setLibraryEmbedder({ embed: embedTexts });
}

function parseModel(value: string): { provider: string; model: string } {
  const at = value.indexOf(":");
  if (at <= 0 || at === value.length - 1) {
    throw new Error(`Expected <provider>:<model>, such as ${DEFAULT_LOCAL_EMBEDDING.provider}:${DEFAULT_LOCAL_EMBEDDING.model}. Got ${value}.`);
  }
  return { provider: value.slice(0, at), model: value.slice(at + 1) };
}

function parseKinds(value: string | undefined): SearchKind[] | undefined {
  if (!value) return undefined;
  const kinds = value.split(",").map((kind) => kind.trim()).filter(Boolean);
  for (const kind of kinds) {
    if (!(SEARCH_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`Unknown kind ${kind}. Expected one of: ${SEARCH_KINDS.join(", ")}.`);
    }
  }
  return kinds as SearchKind[];
}

export function registerSearchCommands(program: Command): void {
  const search = program
    .command("search")
    .description("Search the library index, and inspect or set it up");

  search
    .command("query <text...>")
    .description("Search assets and documents by words and, when set up, by meaning")
    .option("--kinds <list>", "Comma-separated kinds, such as image,document")
    .option("--project <id>", "Search one project")
    .option("--mode <mode>", "auto, keyword or semantic", "auto")
    .option("--limit <n>", "Most hits", "20")
    .option("--json", "Output as JSON")
    .action(async (text: string[], opts: { kinds?: string; project?: string; mode: string; limit: string; json?: boolean }) => {
      try {
        await openIndex();
        if (!["auto", "keyword", "semantic"].includes(opts.mode)) throw new Error(`Unknown mode ${opts.mode}.`);
        const result = await searchLibrary({
          userId: LOCAL_USER_ID,
          query: text.join(" "),
          kinds: parseKinds(opts.kinds),
          projectId: opts.project,
          mode: opts.mode as LibrarySearchMode,
          limit: Number.parseInt(opts.limit, 10) || 20
        });
        if (opts.json) {
          asJson(result);
          return;
        }
        printTable(
          result.hits.map((hit) => ({
            id: hit.resourceId,
            kind: hit.kind,
            title: hit.title,
            match: hit.matches[0]?.snippet ?? ""
          }))
        );
        console.log(`${result.total} matching, mode ${result.index.mode}${result.index.note ? `. ${result.index.note}` : ""}`);
      } catch (error) {
        fail(error);
      }
    });

  search
    .command("read <id>")
    .description("Read an item's passages, or the passage at a locator with its neighbours")
    .option("--locator <json>", "A locator from a search match, as JSON")
    .option("--before <n>", "Passages before the matched one", "1")
    .option("--after <n>", "Passages after the matched one", "1")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { locator?: string; before: string; after: string; json?: boolean }) => {
      try {
        await openIndex();
        const result = await readLibraryPassage({
          userId: LOCAL_USER_ID,
          id,
          locator: opts.locator ? (JSON.parse(opts.locator) as Record<string, unknown>) : undefined,
          before: Number.parseInt(opts.before, 10),
          after: Number.parseInt(opts.after, 10)
        });
        if (opts.json) {
          asJson(result);
          return;
        }
        if (!result.ok) throw new Error(result.error);
        console.log(`${result.item.title} (${result.item.kind})\n`);
        for (const passage of result.passages) console.log(`${passage.text}\n`);
      } catch (error) {
        fail(error);
      }
    });

  search
    .command("status")
    .description("Show items by state, vector coverage and the embedding model")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await openIndex();
        await reconcileLibraryIndex({ userId: LOCAL_USER_ID });
        const status = await libraryIndexStatus(LOCAL_USER_ID);
        if (opts.json) {
          asJson(status);
          return;
        }
        printKv({
          ready: status.items.ready,
          pending: status.items.pending,
          failed: status.items.failed,
          skipped: status.items.skipped,
          passages: status.chunks,
          "embedding model": status.semantic.space ?? "off (keyword search only)",
          "passages with vectors": status.semantic.embedded,
          "passages to embed": status.semantic.remaining,
          collections: status.semantic.collections.join(", ")
        });
        for (const failure of status.failures) console.log(`failed: ${failure.title}: ${failure.error ?? ""}`);
      } catch (error) {
        fail(error);
      }
    });

  search
    .command("setup")
    .description(
      `Turn search by meaning on. The default model is ${DEFAULT_LOCAL_EMBEDDING.provider}:${DEFAULT_LOCAL_EMBEDDING.model}, which runs locally`
    )
    .option("--model <provider:model>", "Embedding model, such as openai:text-embedding-3-small")
    .option("--off", "Turn search by meaning off; keyword search stays")
    .option("--json", "Output as JSON")
    .action(async (opts: { model?: string; off?: boolean; json?: boolean }) => {
      try {
        await setupLocalDb();
        const space = opts.off ? null : parseModel(opts.model ?? `${DEFAULT_LOCAL_EMBEDDING.provider}:${DEFAULT_LOCAL_EMBEDDING.model}`);
        await setupLibrarySemanticSearch(space);
        const message = space
          ? `Search by meaning uses ${space.provider}:${space.model}. The indexer embeds the library in the background.` +
            (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider) ? "" : ` Passage text is sent to ${space.provider}.`)
          : "Search by meaning is off. Keyword search stays.";
        if (opts.json) {
          asJson({ semantic: space ? `${space.provider}:${space.model}` : null });
          return;
        }
        console.log(message);
      } catch (error) {
        fail(error);
      }
    });

  search
    .command("rebuild")
    .description("Extract and embed every item again")
    .option("--vectors", "Only embed again, for a changed model")
    .option("--json", "Output as JSON")
    .action(async (opts: { vectors?: boolean; json?: boolean }) => {
      try {
        await openIndex();
        const result = await rebuildLibraryIndex(LOCAL_USER_ID, opts.vectors ? "vectors" : "all");
        if (opts.json) {
          asJson(result);
          return;
        }
        console.log(`Queued ${result.items} items. Run \`nodetool search indexer --once\` or start the server.`);
      } catch (error) {
        fail(error);
      }
    });

  search
    .command("indexer")
    .description("Run the library indexer in this process: extract and embed")
    .option("--once", "Work until the queue is empty, then exit")
    .option("--json", "Output as JSON")
    .action(async (opts: { once?: boolean; json?: boolean }) => {
      try {
        await openIndex();
        if (opts.once) {
          const reconciled = await reconcileLibraryIndex();
          const extracted = await runIndexerPass();
          const embedded = await runEmbedPass();
          const result = { reconciled, extracted, embedded };
          if (opts.json) asJson(result);
          else printKv({ extracted: extracted.processed, failed: extracted.failed, embedded: embedded.embedded });
          return;
        }
        const controller = new AbortController();
        process.on("SIGINT", () => controller.abort());
        process.on("SIGTERM", () => controller.abort());
        await runLibraryIndexer({ signal: controller.signal });
      } catch (error) {
        fail(error);
      }
    });
}
