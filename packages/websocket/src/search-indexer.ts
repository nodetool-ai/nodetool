/**
 * The library indexer's process (docs/plans/library-search.md, D13 and D14).
 *
 * The server forks its own entry with `NODETOOL_PROCESS_ROLE=search-indexer`,
 * so extraction (PDF parsing, Word files, large documents) never blocks the
 * event loop that serves requests. The child shares the database, which is
 * the queue, and exits when the server goes away. A wake over IPC tells it
 * that a write left work, so a saved file is indexed in seconds instead of on
 * the next poll.
 *
 * `NODETOOL_SEARCH_INDEXER` picks the mode:
 * - `child` (default): the server supervises one indexer child.
 * - `external`: another process runs the indexer, such as a worker machine.
 * - `off`: no indexer. The server reconciles metadata itself, and file
 *   content is not indexed.
 */

import { fork, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { setPriority, constants as osConstants } from "node:os";
import { createLogger, getDefaultDbPath, getPostgresDatabaseUrl } from "@nodetool-ai/config";
import { initDb, initPostgresDb } from "@nodetool-ai/models";
import {
  IN_PROCESS_EMBEDDING_PROVIDERS,
  runLibraryIndexer,
  setLibraryEmbedder,
  setLibraryEnricher,
  setLibraryIndexerWake,
  setLibraryQueryEmbedder,
  setProjectFileSource,
  wakeLibraryIndexer,
  type EmbeddingSpace
} from "@nodetool-ai/search-services";
import { embedWithProvider, providerLibraryEmbedder } from "./search-embedder.js";
import { providerLibraryEnricher } from "./search-enricher.js";
import { localProjectFileSource } from "./search-project-files.js";

const log = createLogger("nodetool.search.indexer");

export const SEARCH_INDEXER_ROLE = "search-indexer";

export type SearchIndexerMode = "child" | "external" | "off";

export function searchIndexerMode(env: NodeJS.ProcessEnv = process.env): SearchIndexerMode {
  const value = env["NODETOOL_SEARCH_INDEXER"]?.trim().toLowerCase();
  if (value === "external" || value === "off") return value;
  return "child";
}

export function isSearchIndexerProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["NODETOOL_PROCESS_ROLE"] === SEARCH_INDEXER_ROLE;
}

/** Restart delays after the child exits, by consecutive failure. */
const RESTART_DELAYS_MS = [1_000, 5_000, 30_000, 120_000];
/** A child that ran this long resets the restart backoff. */
const HEALTHY_RUN_MS = 60_000;

/** How long the server waits for the indexer to embed a query. The first call may load the model. */
const QUERY_EMBED_TIMEOUT_MS = 20_000;

export interface SearchIndexerSupervisor {
  stop(): void;
  /** A query vector from the indexer process, or null when it is not running or too slow. */
  embedQuery(text: string, space: EmbeddingSpace, userId: string): Promise<number[] | null>;
}

interface EmbedQueryMessage {
  type: "embed-query";
  id: number;
  text: string;
  space: EmbeddingSpace;
  userId: string;
}

interface EmbeddedMessage {
  type: "embedded";
  id: number;
  vector: number[] | null;
  error?: string;
}

function isEmbedded(message: unknown): message is EmbeddedMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "embedded" &&
    typeof (message as { id?: unknown }).id === "number"
  );
}

function isEmbedQuery(message: unknown): message is EmbedQueryMessage {
  if (typeof message !== "object" || message === null) return false;
  const value = message as Partial<EmbedQueryMessage>;
  return (
    value.type === "embed-query" &&
    typeof value.id === "number" &&
    typeof value.text === "string" &&
    typeof value.userId === "string" &&
    typeof value.space?.provider === "string" &&
    typeof value.space?.model === "string"
  );
}

/**
 * How this server embeds a search query (D13). A hosted model is called from
 * here. A local model runs only in the indexer process, so the query goes
 * there; without that process the search falls back to words.
 */
export function installLibraryQueryEmbedder(indexer: SearchIndexerSupervisor | null): void {
  setLibraryQueryEmbedder(async (text, space, userId) => {
    if (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider)) {
      return indexer ? indexer.embedQuery(text, space, userId) : null;
    }
    const [vector] = await embedWithProvider([text], space, userId);
    return vector ?? null;
  });
}

/**
 * Fork the indexer child and keep it running. Writes in this process wake it.
 * The child is killed when the server stops.
 */
export function superviseSearchIndexer(): SearchIndexerSupervisor {
  const entry = process.argv[1];
  let child: ChildProcess | null = null;
  let stopped = false;
  let failures = 0;
  let restartTimer: NodeJS.Timeout | null = null;
  let nextQueryId = 0;
  const waiting = new Map<number, (vector: number[] | null) => void>();
  const settleAll = (): void => {
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  };

  const start = (): void => {
    if (stopped || !entry) return;
    const startedAt = Date.now();
    const env = { ...process.env, NODETOOL_PROCESS_ROLE: SEARCH_INDEXER_ROLE };
    const spawned = fork(entry, process.argv.slice(2), {
      env,
      execArgv: process.execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    child = spawned;
    spawned.on("message", (message: unknown) => {
      if (!isEmbedded(message)) return;
      if (message.error) log.debug("Library query not embedded", { error: message.error });
      waiting.get(message.id)?.(Array.isArray(message.vector) ? message.vector : null);
    });
    spawned.on("error", (error) => {
      log.warn("Library indexer process error", { error: error.message });
    });
    spawned.on("exit", (code, signal) => {
      if (child === spawned) child = null;
      settleAll();
      if (stopped) return;
      failures = Date.now() - startedAt >= HEALTHY_RUN_MS ? 0 : failures + 1;
      const delay = RESTART_DELAYS_MS[Math.min(failures, RESTART_DELAYS_MS.length - 1)]!;
      log.warn("Library indexer process exited; restarting", { code, signal, delay_ms: delay });
      restartTimer = setTimeout(start, delay);
      restartTimer.unref?.();
    });
    log.info("Library indexer process started", { pid: spawned.pid });
  };

  setLibraryIndexerWake(() => {
    if (child?.connected) {
      child.send({ type: "wake" }, (error) => {
        if (error) log.debug("Library indexer wake not delivered", { error: error.message });
      });
    }
  });
  start();

  return {
    embedQuery(text, space, userId): Promise<number[] | null> {
      const target = child;
      if (!target?.connected) return Promise.resolve(null);
      const id = (nextQueryId += 1);
      return new Promise<number[] | null>((resolve) => {
        const timer = setTimeout(() => finish(null), QUERY_EMBED_TIMEOUT_MS);
        timer.unref?.();
        const finish = (vector: number[] | null): void => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(vector);
        };
        waiting.set(id, finish);
        const message: EmbedQueryMessage = { type: "embed-query", id, text, space, userId };
        target.send(message, (error) => {
          if (error) finish(null);
        });
      });
    },
    stop(): void {
      stopped = true;
      settleAll();
      setLibraryIndexerWake(null);
      if (restartTimer) clearTimeout(restartTimer);
      child?.kill("SIGTERM");
      child = null;
    }
  };
}

/** Embed a query for the server and send the vector back. */
async function answerQuery(message: EmbedQueryMessage): Promise<void> {
  let reply: EmbeddedMessage;
  try {
    const [vector] = await embedWithProvider([message.text], message.space, message.userId);
    reply = { type: "embedded", id: message.id, vector: vector ?? null };
  } catch (error) {
    reply = {
      type: "embedded",
      id: message.id,
      vector: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  process.send?.(reply);
}

/**
 * The child's whole life: open the database, run the indexer until the server
 * disconnects or a signal arrives, then exit.
 */
export async function runSearchIndexerProcess(): Promise<never> {
  try {
    // Indexing yields the CPU to the server and to running workflows.
    setPriority(osConstants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Lowering priority is best effort; some containers refuse it.
  }
  const postgresUrl = getPostgresDatabaseUrl();
  if (postgresUrl) {
    await initPostgresDb(postgresUrl);
  } else {
    // The server ran the migrations before it forked this process.
    const dbPath = getDefaultDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    initDb(dbPath);
  }
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  // The server's exit closes the IPC channel. No orphan indexer outlives it.
  process.on("disconnect", stop);

  // Local models load here, never in the server (D13).
  setLibraryEmbedder(providerLibraryEmbedder);
  setLibraryEnricher(providerLibraryEnricher);
  setProjectFileSource(localProjectFileSource);
  const running = runLibraryIndexer({ signal: controller.signal });
  process.on("message", (message: unknown) => {
    if (isEmbedQuery(message)) {
      void answerQuery(message);
      return;
    }
    if (message && typeof message === "object" && (message as { type?: unknown }).type === "wake") {
      // runLibraryIndexer installed its own wake handler; route the server's to it.
      wakeLibraryIndexer();
    }
  });
  try {
    await running;
    process.exit(0);
  } catch (error) {
    log.error("Library indexer stopped on an error", error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}
