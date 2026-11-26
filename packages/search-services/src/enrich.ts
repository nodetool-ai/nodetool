/**
 * Enrichment (docs/plans/library-search.md, D15): a caption for an image
 * without a prompt and a transcript for audio and video, so those items are
 * found by what they show or say. Both are off until a deployment names a
 * model. The chunks they write have the fields `caption` and `transcript`,
 * which every other step treats like extracted text.
 *
 * This package does not call model providers. The process that runs the
 * indexer installs a {@link LibraryEnricher}.
 */

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { Asset, getPortableDb, searchChunks, searchItems, withTransaction } from "@nodetool-ai/models";
import type { SearchKind, SearchMetadata } from "@nodetool-ai/protocol";
import { chunkPlainText } from "./chunking.js";
import { MAX_CONTENT_BYTES, readAssetBytes } from "./content.js";
import { EMBED_BUDGET_LEASE, EMBED_LEASE_MS, spentToday } from "./embed.js";
import { acquireSearchLease, claimItems, itemUnclaimed, releaseItemClaims, releaseSearchLease } from "./leases.js";
import {
  embeddingDailySpendLimit,
  excludedEmbeddingProjects,
  LIBRARY_SEARCH_SETTINGS,
  readSetting,
  removeChunkVectors
} from "./semantic.js";

const log = createLogger("nodetool.search.enrich");

/** Failed attempts before an item is left alone until its file changes. */
export const MAX_ENRICH_ATTEMPTS = 3;
/** Longest recording sent to a transcript model, in seconds. */
export const MAX_TRANSCRIBE_SECONDS = 2 * 60 * 60;
/** Enrichment chunks sort after the extracted body. */
const ENRICH_ORDINAL_BASE = 100_000;

/** One model, read from a `provider:model` setting. */
export interface EnrichModel {
  /** `provider:model`. */
  id: string;
  provider: string;
  model: string;
}

/** One timed passage of a transcript, in seconds. */
export interface TranscriptSegment {
  text: string;
  start?: number;
  end?: number;
}

export interface EnrichInput {
  bytes: Uint8Array;
  contentType: string | null;
  model: EnrichModel;
  userId: string;
}

/** Calls the caption and transcript models. Installed by the indexer process. */
export interface LibraryEnricher {
  caption(input: EnrichInput): Promise<string>;
  transcribe(input: EnrichInput): Promise<TranscriptSegment[]>;
}

let enricher: LibraryEnricher | null = null;

/** Install how captions and transcripts are made, or remove it with `null`. */
export function setLibraryEnricher(next: LibraryEnricher | null): void {
  enricher = next;
}

export function libraryEnricher(): LibraryEnricher | null {
  return enricher;
}

function parseModel(value: string | null): EnrichModel | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at <= 0 || at === value.length - 1) {
    log.warn("Ignoring an enrichment model that is not provider:model", { value });
    return null;
  }
  return { id: value, provider: value.slice(0, at), model: value.slice(at + 1) };
}

/** The caption and transcript models, each null when off. */
export async function enrichmentModels(): Promise<{
  caption: EnrichModel | null;
  transcript: EnrichModel | null;
}> {
  return {
    caption: parseModel(await readSetting(LIBRARY_SEARCH_SETTINGS.captionModel)),
    transcript: parseModel(await readSetting(LIBRARY_SEARCH_SETTINGS.transcriptModel))
  };
}

/**
 * What an enrichment was made from: the asset's version (`updated_at|hash`)
 * and the model. A rename changes `updated_at` but not the hash, so
 * {@link sameContent} lets it keep its chunks without another model call.
 */
function enrichKey(sourceVersion: string, model: EnrichModel): string {
  return `${sourceVersion}|${model.id}`;
}

function sameContent(previous: string | null, sourceVersion: string, model: EnrichModel): boolean {
  if (!previous) return false;
  const [, previousHash, ...rest] = previous.split("|");
  const [, hash] = sourceVersion.split("|");
  return !!hash && previousHash === hash && rest.join("|") === model.id;
}

export interface EnrichPass {
  enriched: number;
  failed: number;
  /**
   * Why the pass stopped early, if it did: the daily spend limit is reached,
   * or another indexer holds the budget lease for its paid call.
   */
  stopped?: "spend_limit" | "budget_busy";
}

/** Thrown by {@link paidCall} when no paid call may be made now. */
export class BudgetStop extends Error {
  constructor(readonly reason: "spend_limit" | "budget_busy") {
    super(reason);
  }
}

/**
 * Make one paid model call under the budget lease, after checking the day's
 * spend under it, as the embed pass does. Concurrent indexers cannot together
 * spend past the limit.
 */
export async function paidCall<T>(owner: string, call: () => Promise<T>): Promise<T> {
  if (!(await acquireSearchLease(EMBED_BUDGET_LEASE, owner, EMBED_LEASE_MS))) {
    throw new BudgetStop("budget_busy");
  }
  try {
    const cap = await embeddingDailySpendLimit();
    if (cap !== null && (await spentToday()) >= cap) throw new BudgetStop("spend_limit");
    return await call();
  } finally {
    await releaseSearchLease(EMBED_BUDGET_LEASE, owner);
  }
}

interface Candidate {
  id: string;
  userId: string;
  resourceId: string;
  kind: SearchKind;
  sourceVersion: string;
  enrichedVersion: string | null;
  attempts: number;
  metadata: SearchMetadata | null;
}

/** Items whose caption or transcript is missing or was made from another file or model. */
async function candidates(
  models: { caption: EnrichModel | null; transcript: EnrichModel | null },
  excluded: readonly string[],
  limit: number
): Promise<Candidate[]> {
  const wanted = [];
  const stale = (model: EnrichModel) =>
    or(
      isNull(searchItems.enriched_version),
      ne(searchItems.enriched_version, sql`${searchItems.source_version} || ${`|${model.id}`}`)
    );
  if (models.caption) wanted.push(and(eq(searchItems.kind, "image"), stale(models.caption)));
  if (models.transcript) {
    wanted.push(and(inArray(searchItems.kind, ["audio", "video"]), stale(models.transcript)));
  }
  if (wanted.length === 0) return [];
  const parts = [
    eq(searchItems.resource_type, "asset"),
    inArray(searchItems.state, ["ready", "skipped"]),
    lt(searchItems.enrich_attempts, MAX_ENRICH_ATTEMPTS),
    itemUnclaimed(),
    or(...wanted)
  ];
  if (excluded.length > 0) parts.push(notInArray(searchItems.project_id, [...excluded]));
  const rows = await getPortableDb()
    .select({
      id: searchItems.id,
      userId: searchItems.user_id,
      resourceId: searchItems.resource_id,
      kind: searchItems.kind,
      sourceVersion: searchItems.source_version,
      enrichedVersion: searchItems.enriched_version,
      attempts: searchItems.enrich_attempts,
      metadata: searchItems.metadata
    })
    .from(searchItems)
    .where(and(...parts))
    .orderBy(sql`${searchItems.priority} DESC`, sql`${searchItems.updated_at} DESC`)
    .limit(limit);
  return rows.map((row) => ({ ...row, kind: row.kind as SearchKind }));
}

/**
 * Replace the item's enrichment chunks and record what they were made from,
 * unless the source moved meanwhile. Vectors of chunks that are gone are removed.
 */
async function writeEnrichment(
  item: Candidate,
  enrichedVersion: string,
  chunks: Array<{ field: "caption" | "transcript"; text: string; locator: Record<string, unknown> | null }>,
  error: string | null
): Promise<void> {
  let removed: string[] = [];
  await withTransaction(async () => {
    const db = getPortableDb();
    const updated = await db
      .update(searchItems)
      .set({ enriched_version: enrichedVersion, enrich_error: error })
      .where(and(eq(searchItems.id, item.id), eq(searchItems.source_version, item.sourceVersion)))
      .returning({ id: searchItems.id });
    if (updated.length === 0) return;
    const previous = await db
      .select({ id: searchChunks.id })
      .from(searchChunks)
      .where(and(eq(searchChunks.item_id, item.id), inArray(searchChunks.field, ["caption", "transcript"])));
    await db
      .delete(searchChunks)
      .where(and(eq(searchChunks.item_id, item.id), inArray(searchChunks.field, ["caption", "transcript"])));
    const rows = chunks
      .filter((chunk) => chunk.text.trim())
      .map((chunk, index) => ({
        id: `${item.id}_e${index}`,
        item_id: item.id,
        ordinal: ENRICH_ORDINAL_BASE + index,
        field: chunk.field,
        text: chunk.text,
        locator: chunk.locator
      }));
    for (let start = 0; start < rows.length; start += 200) {
      await db.insert(searchChunks).values(rows.slice(start, start + 200));
    }
    const kept = new Set(rows.map((row) => row.id));
    removed = previous.map((row) => row.id).filter((id) => !kept.has(id));
  });
  if (removed.length > 0) await removeChunkVectors(item.userId, removed);
}

async function recordFailure(item: Candidate, reason: string): Promise<void> {
  await getPortableDb()
    .update(searchItems)
    .set({ enrich_attempts: item.attempts + 1, enrich_error: reason.slice(0, 2000) })
    .where(and(eq(searchItems.id, item.id), eq(searchItems.source_version, item.sourceVersion)));
}

/** Passages of a transcript, each with the time range it covers. */
export function transcriptChunks(
  segments: readonly TranscriptSegment[]
): Array<{ field: "transcript"; text: string; locator: Record<string, unknown> | null }> {
  const timed = segments.filter((segment) => segment.text.trim());
  if (timed.length === 0) return [];
  if (timed.every((segment) => segment.start === undefined)) {
    return chunkPlainText(timed.map((segment) => segment.text.trim()).join(" ")).map((chunk) => ({
      field: "transcript",
      text: chunk.text,
      locator: null
    }));
  }
  // Group segments into passages of about the extractor's size, keeping each group's time range.
  const out: Array<{ field: "transcript"; text: string; locator: Record<string, unknown> | null }> = [];
  let texts: string[] = [];
  let start: number | undefined;
  let end: number | undefined;
  let chars = 0;
  const flush = (): void => {
    if (texts.length === 0) return;
    const locator: Record<string, unknown> = {};
    if (start !== undefined) locator.start = start;
    if (end !== undefined) locator.end = end;
    out.push({ field: "transcript", text: texts.join(" "), locator });
    texts = [];
    start = undefined;
    end = undefined;
    chars = 0;
  };
  for (const segment of timed) {
    const text = segment.text.trim();
    if (chars > 0 && chars + text.length > 1200) flush();
    texts.push(text);
    chars += text.length + 1;
    start ??= segment.start;
    end = segment.end ?? segment.start ?? end;
  }
  flush();
  return out;
}

async function enrichOne(
  item: Candidate,
  model: EnrichModel,
  active: LibraryEnricher,
  owner: string
): Promise<boolean> {
  const key = enrichKey(item.sourceVersion, model);
  if (sameContent(item.enrichedVersion, item.sourceVersion, model)) {
    await getPortableDb()
      .update(searchItems)
      .set({ enriched_version: key })
      .where(and(eq(searchItems.id, item.id), eq(searchItems.source_version, item.sourceVersion)));
    return false;
  }
  if (item.kind === "image" && item.metadata?.prompt?.trim()) {
    // The prompt already says what the image shows.
    await writeEnrichment(item, key, [], null);
    return false;
  }
  const asset = await Asset.find(item.userId, item.resourceId);
  if (!asset) return false;
  if (asset.size !== null && asset.size !== undefined && asset.size > MAX_CONTENT_BYTES) {
    await writeEnrichment(item, key, [], `The file is larger than ${MAX_CONTENT_BYTES / 1024 / 1024} MB.`);
    return false;
  }
  if (item.kind !== "image" && typeof asset.duration === "number" && asset.duration > MAX_TRANSCRIBE_SECONDS) {
    await writeEnrichment(item, key, [], `The recording is longer than ${MAX_TRANSCRIBE_SECONDS / 3600} hours.`);
    return false;
  }
  const bytes = await readAssetBytes(asset);
  const input: EnrichInput = { bytes, contentType: asset.content_type ?? null, model, userId: item.userId };
  if (item.kind === "image") {
    const caption = (await paidCall(owner, () => active.caption(input))).trim();
    await writeEnrichment(item, key, caption ? [{ field: "caption", text: caption, locator: null }] : [], null);
  } else {
    await writeEnrichment(item, key, transcriptChunks(await paidCall(owner, () => active.transcribe(input))), null);
  }
  return true;
}

/**
 * Caption and transcribe items until none are left or `limit` items were
 * enriched. Does nothing without an installed enricher or a configured model.
 * Projects excluded from embedding are excluded here too: their files never
 * reach a model.
 */
export async function runEnrichPass(
  options: { limit?: number; signal?: AbortSignal; owner?: string } = {}
): Promise<EnrichPass> {
  const pass: EnrichPass = { enriched: 0, failed: 0 };
  const active = enricher;
  if (!active) return pass;
  const models = await enrichmentModels();
  if (!models.caption && !models.transcript) return pass;
  const excluded = await excludedEmbeddingProjects();
  const owner = options.owner ?? `enrich:${randomUUID()}`;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  // Items this pass already tried, so a failure is not retried in the same pass.
  const tried = new Set<string>();

  outer: while (pass.enriched + pass.failed < limit && !options.signal?.aborted) {
    const batch = (await candidates(models, excluded, 16 + tried.size)).filter((item) => !tried.has(item.id));
    if (batch.length === 0) break;
    for (const item of batch) {
      if (options.signal?.aborted || pass.enriched + pass.failed >= limit) break;
      tried.add(item.id);
      const model = item.kind === "image" ? models.caption : models.transcript;
      if (!model) continue;
      // Another indexer working on the item makes the same paid call: leave it to that one.
      const claims = await claimItems([item.id], owner, EMBED_LEASE_MS);
      if (claims.size === 0) continue;
      try {
        if (await enrichOne(item, model, active, owner)) pass.enriched += 1;
      } catch (error) {
        if (error instanceof BudgetStop) {
          if (error.reason === "spend_limit") log.info("Library enrichment paused at the daily spend limit");
          pass.stopped = error.reason;
          break outer;
        }
        pass.failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        log.warn("Library enrichment failed", { kind: item.kind, model: model.id, error: reason });
        await recordFailure(item, reason);
      } finally {
        await releaseItemClaims(claims);
      }
    }
  }
  return pass;
}
