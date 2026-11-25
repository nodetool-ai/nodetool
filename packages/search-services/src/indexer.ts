/**
 * The indexer loop (D13, D14): reconcile, then claim pending items and
 * extract their content, one at a time. It runs in its own OS process in a
 * server deployment (the `search-indexer` role) and in process for the CLI
 * and tests. The database is the queue, so any number of loops may run.
 */

import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { extractContent } from "./content.js";
import { claimPendingItems, completeItem, dropClaimedItem, failItem } from "./queue.js";
import { reconcileLibraryIndex, setLibraryIndexerWake } from "./sync.js";

const log = createLogger("nodetool.search.indexer");

export interface LibraryIndexerOptions {
  /** Stops the loop. */
  signal?: AbortSignal;
  /** How long to sleep when there is no work and no wake. */
  pollMs?: number;
  /** How often to reconcile. */
  reconcileMs?: number;
  /** Items claimed per round. */
  batchSize?: number;
  /** Identifies this indexer on the lease. */
  owner?: string;
}

export interface IndexerPass {
  processed: number;
  ready: number;
  skipped: number;
  failed: number;
}

/** A stable name for this process on a lease. */
export function defaultIndexerOwner(): string {
  return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

/**
 * Claim and extract pending items until none are left or `limit` items were
 * processed. Returns what it did. Used by the loop and by headless callers.
 */
export async function runIndexerPass(
  options: { owner?: string; limit?: number; batchSize?: number; signal?: AbortSignal } = {}
): Promise<IndexerPass> {
  const owner = options.owner ?? defaultIndexerOwner();
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const pass: IndexerPass = { processed: 0, ready: 0, skipped: 0, failed: 0 };
  while (pass.processed < limit && !options.signal?.aborted) {
    const claimed = await claimPendingItems(owner, Math.min(options.batchSize ?? 4, limit - pass.processed));
    if (claimed.length === 0) break;
    for (const item of claimed) {
      if (options.signal?.aborted) break;
      pass.processed += 1;
      try {
        const result = await extractContent(item.resourceType, item.userId, item.resourceId);
        if (result === null) {
          await dropClaimedItem(item);
          continue;
        }
        if (await completeItem(item, result)) {
          if (result.status === "ready") pass.ready += 1;
          else pass.skipped += 1;
        }
      } catch (error) {
        pass.failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        log.warn("Library index extraction failed", {
          resource_type: item.resourceType,
          attempts: item.attempts + 1,
          error: reason
        });
        await failItem(item, reason);
      }
    }
  }
  return pass;
}

/**
 * Run the indexer until `signal` aborts: reconcile at start and on a timer,
 * then work the queue, sleeping until a wake or the poll interval when it is
 * empty.
 */
export async function runLibraryIndexer(options: LibraryIndexerOptions = {}): Promise<void> {
  const owner = options.owner ?? defaultIndexerOwner();
  const pollMs = options.pollMs ?? 30_000;
  const reconcileMs = options.reconcileMs ?? 15 * 60 * 1000;
  let wake: (() => void) | null = null;
  // Set by a wake that arrives while a pass runs, so the loop goes again at once.
  const pending = { woken: false };
  const onWake = (): void => {
    pending.woken = true;
    wake?.();
  };
  setLibraryIndexerWake(onWake);
  options.signal?.addEventListener("abort", onWake, { once: true });
  let lastReconcile = 0;
  log.info("Library indexer started", { owner });
  try {
    while (!options.signal?.aborted) {
      if (Date.now() - lastReconcile >= reconcileMs) {
        lastReconcile = Date.now();
        try {
          const result = await reconcileLibraryIndex();
          if (result.indexed + result.removed > 0) log.info("Library index reconciled", { ...result });
        } catch (error) {
          log.warn("Library index reconcile failed", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      pending.woken = false;
      let pass: IndexerPass = { processed: 0, ready: 0, skipped: 0, failed: 0 };
      try {
        pass = await runIndexerPass({
          owner,
          signal: options.signal,
          batchSize: options.batchSize
        });
      } catch (error) {
        // A database error ends this round, not the loop: the poll retries.
        log.warn("Library indexer round failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      if (pass.processed > 0) {
        log.debug("Library indexer pass", { ...pass });
        continue;
      }
      if (pending.woken || options.signal?.aborted) continue;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(pollMs, reconcileMs));
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = null;
    }
  } finally {
    setLibraryIndexerWake(null);
    options.signal?.removeEventListener("abort", onWake);
    log.info("Library indexer stopped", { owner });
  }
}
