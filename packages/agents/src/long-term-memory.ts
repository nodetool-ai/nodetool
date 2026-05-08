/**
 * Long-term memory for chat and agents.
 *
 * Persists facts, preferences, decisions and notable events across sessions,
 * automatically retrieves the most relevant ones before each LLM call, and
 * extracts new ones from conversations after they finish.
 *
 * Storage: a per-user sqlite-vec collection (`ltm_<userId>_<namespace>`).
 * Each row is one short, self-contained memory item with an embedding plus
 * metadata (kind, importance, timestamps, source, access count).
 *
 * Recall is hybrid:
 *   1. Pull top {@link RECALL_FETCH_MULTIPLIER}·k by vector similarity.
 *   2. Re-rank by `score = 0.7·sim + 0.2·recency + 0.1·importance`, where
 *      `sim = 1/(1+distance)` and `recency = 2^(-days_since_creation/30)`.
 *   3. Return the top k and bump `access_count` / `last_accessed_at`.
 *
 * The hybrid weighting matches Mem0's published numbers (semantic dominates,
 * recency and importance break ties) and works against any underlying
 * distance metric the vector backend chooses to use.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { getSecret } from "@nodetool-ai/models";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import type {
  EmbeddingFunction,
  RecordMetadata,
  VectorCollection,
  VectorProvider
} from "@nodetool-ai/vectorstore";
import {
  getDefaultVectorProvider,
  getProviderEmbeddingFunction
} from "@nodetool-ai/vectorstore";

const log = createLogger("nodetool.agents.long-term-memory");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryKind = "fact" | "preference" | "decision" | "event";

const VALID_KINDS: ReadonlySet<string> = new Set([
  "fact",
  "preference",
  "decision",
  "event"
]);

export interface LongTermMemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  importance: number;
  source: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  /** Set on items returned by {@link LongTermMemory.recall}. */
  score?: number;
}

export interface LongTermMemoryOptions {
  /** Required — memories are scoped per user. */
  userId: string;
  /** Logical scope (e.g. "chat", "research"). Defaults to "default". */
  namespace?: string;
  /** Vector provider; defaults to the process-wide SQLite-vec provider. */
  vectorProvider?: VectorProvider;
  /** Embedding function. Required to enable semantic recall. */
  embeddingFunction?: EmbeddingFunction;
  /** Embedding model name (used when {@link embeddingFunction} is omitted). */
  embeddingModel?: string;
  /** Embedding provider (used with {@link embeddingModel}). */
  embeddingProvider?: string;
  /** LLM provider used to extract memories from conversations. */
  extractionProvider?: BaseProvider | null;
  /** Model for extraction calls. */
  extractionModel?: string;
  /** Default number of items returned by recall(). */
  defaultK?: number;
  /**
   * Cosine similarity above which a candidate is treated as a duplicate of
   * an existing memory and skipped. 0 disables dedupe.
   */
  dedupeSimilarity?: number;
}

const COLLECTION_PREFIX = "ltm";
const DEFAULT_K = 5;
const DEFAULT_DEDUPE_SIMILARITY = 0.92;
const RECALL_FETCH_MULTIPLIER = 4;
const RECENCY_HALF_LIFE_DAYS = 30;

const SCORE_WEIGHT_SIM = 0.7;
const SCORE_WEIGHT_RECENCY = 0.2;
const SCORE_WEIGHT_IMPORTANCE = 0.1;

const MAX_EXTRACTED_PER_TURN = 8;
const MAX_EXTRACTION_INPUT_CHARS = 12_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeNamespace(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return 1 / (1 + Math.max(0, distance));
}

function recencyFactor(createdAtMs: number, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - createdAtMs);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS);
}

function clampImportance(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function coerceKind(value: unknown): MemoryKind {
  const s = typeof value === "string" ? value.toLowerCase().trim() : "";
  return (VALID_KINDS.has(s) ? s : "fact") as MemoryKind;
}

function metadataFromItem(item: Omit<LongTermMemoryItem, "score">): RecordMetadata {
  return {
    kind: item.kind,
    importance: item.importance,
    source: item.source,
    created_at_ms: item.createdAt,
    last_accessed_at_ms: item.lastAccessedAt,
    access_count: item.accessCount
  };
}

function itemFromRecord(
  id: string,
  document: string | null | undefined,
  meta: Record<string, unknown> | null | undefined
): LongTermMemoryItem {
  const m = meta ?? {};
  return {
    id,
    text: document ?? "",
    kind: coerceKind(m["kind"]),
    importance: clampImportance(m["importance"]),
    source: typeof m["source"] === "string" ? (m["source"] as string) : "",
    createdAt:
      typeof m["created_at_ms"] === "number"
        ? (m["created_at_ms"] as number)
        : 0,
    lastAccessedAt:
      typeof m["last_accessed_at_ms"] === "number"
        ? (m["last_accessed_at_ms"] as number)
        : 0,
    accessCount:
      typeof m["access_count"] === "number"
        ? (m["access_count"] as number)
        : 0
  };
}

function renderConversationForExtraction(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = (m.role ?? "").toUpperCase();
    let body: string;
    if (typeof m.content === "string") {
      body = m.content;
    } else if (Array.isArray(m.content)) {
      body = m.content
        .map((part) => {
          if (
            part &&
            typeof part === "object" &&
            "type" in part &&
            (part as { type: string }).type === "text"
          ) {
            return (part as { text?: string }).text ?? "";
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    } else {
      body = "";
    }
    if (!body) continue;
    lines.push(`${role}: ${body}`);
  }
  let joined = lines.join("\n");
  if (joined.length > MAX_EXTRACTION_INPUT_CHARS) {
    // Keep the most recent context — newer turns are usually more memorable.
    joined = joined.slice(joined.length - MAX_EXTRACTION_INPUT_CHARS);
  }
  return joined;
}

const EXTRACTION_SYSTEM_PROMPT = `You extract durable memories from a conversation between a user and an assistant.

Return memories worth remembering across future sessions: the user's stable preferences, identity facts, project context, decisions made, and notable events. Skip transient chatter, greetings, single-use details, and anything already obvious from a fresh introduction.

Each memory must be one self-contained sentence (≤25 words) that makes sense in isolation.

Output strict JSON: an array of objects, each with:
  - "text" (string): the memory itself
  - "kind" (one of "fact" | "preference" | "decision" | "event")
  - "importance" (number 0..1; 1 = always relevant, 0.3 = niche)

If nothing qualifies, return [].`;

function extractionUserPrompt(conversation: string): string {
  return `Conversation:\n<<<\n${conversation}\n>>>\n\nReturn JSON only — no commentary.`;
}

interface ExtractedMemory {
  text: string;
  kind: MemoryKind;
  importance: number;
}

function parseExtractionPayload(raw: string): ExtractedMemory[] {
  if (!raw) return [];
  // Strip code fences if the model wrapped output in ```json ... ```
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  // Find the first '[' so we tolerate leading prose.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ExtractedMemory[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    out.push({
      text,
      kind: coerceKind(obj.kind),
      importance: clampImportance(obj.importance)
    });
    if (out.length >= MAX_EXTRACTED_PER_TURN) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// LongTermMemory
// ---------------------------------------------------------------------------

export class LongTermMemory {
  readonly userId: string;
  readonly namespace: string;
  readonly collectionName: string;

  private readonly vectorProvider: VectorProvider;
  private readonly embeddingFunction: EmbeddingFunction | null;
  private readonly extractionProvider: BaseProvider | null;
  private readonly extractionModel: string | null;
  private readonly defaultK: number;
  private readonly dedupeSimilarity: number;

  /** Lazily-resolved collection handle. */
  private collection: VectorCollection | null = null;
  private collectionPromise: Promise<VectorCollection> | null = null;

  constructor(opts: LongTermMemoryOptions) {
    if (!opts.userId) {
      throw new Error("LongTermMemory requires a userId");
    }
    this.userId = opts.userId;
    this.namespace = sanitizeNamespace(opts.namespace ?? "default");
    this.collectionName =
      `${COLLECTION_PREFIX}_${sanitizeNamespace(this.userId)}_${this.namespace}`;

    this.vectorProvider = opts.vectorProvider ?? getDefaultVectorProvider();

    if (opts.embeddingFunction) {
      this.embeddingFunction = opts.embeddingFunction;
    } else if (opts.embeddingModel) {
      this.embeddingFunction =
        getProviderEmbeddingFunction(
          opts.embeddingModel,
          opts.embeddingProvider ?? null
        ) ?? null;
    } else {
      this.embeddingFunction = null;
    }

    this.extractionProvider = opts.extractionProvider ?? null;
    this.extractionModel = opts.extractionModel ?? null;
    this.defaultK = opts.defaultK ?? DEFAULT_K;
    this.dedupeSimilarity = opts.dedupeSimilarity ?? DEFAULT_DEDUPE_SIMILARITY;
  }

  /** Whether semantic recall is wired up — false means store/recall are no-ops. */
  isReady(): boolean {
    return this.embeddingFunction !== null;
  }

  /**
   * Resolve (and cache) the underlying vector collection. Created on first
   * use with the embedding model encoded in metadata so future runs can
   * resolve a compatible embedder if the caller doesn't pass one explicitly.
   */
  private async getCollection(): Promise<VectorCollection> {
    if (this.collection) return this.collection;
    if (!this.collectionPromise) {
      // Some embedding functions (ProviderEmbeddingFunction) advertise a
      // `name` we can stamp into collection metadata; the bare interface
      // doesn't, so fall back to the raw model when neither is available.
      const efName =
        (this.embeddingFunction as { name?: string } | null)?.name ?? null;
      const metadata = efName
        ? { embedding_model: efName }
        : undefined;
      this.collectionPromise = this.vectorProvider
        .getOrCreateCollection({
          name: this.collectionName,
          embeddingFunction: this.embeddingFunction ?? null,
          metadata
        })
        .then((c) => {
          this.collection = c;
          return c;
        });
    }
    return this.collectionPromise;
  }

  // -- Write ----------------------------------------------------------------

  /**
   * Store a single memory item. Returns the item, or `null` when it was
   * skipped as a near-duplicate of an existing one.
   */
  async remember(
    text: string,
    opts: {
      kind?: MemoryKind;
      importance?: number;
      source?: string;
      skipDedupe?: boolean;
    } = {}
  ): Promise<LongTermMemoryItem | null> {
    if (!this.isReady()) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    const collection = await this.getCollection();

    if (!opts.skipDedupe && this.dedupeSimilarity > 0) {
      const existing = await collection.query({ text: trimmed, topK: 1 });
      if (existing.length > 0) {
        const sim = distanceToSimilarity(existing[0].distance ?? Infinity);
        if (sim >= this.dedupeSimilarity) {
          return null;
        }
      }
    }

    const now = Date.now();
    const item: LongTermMemoryItem = {
      id: randomUUID(),
      text: trimmed,
      kind: opts.kind ?? "fact",
      importance: clampImportance(opts.importance ?? 0.5),
      source: opts.source ?? "manual",
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0
    };

    await collection.upsert([
      {
        id: item.id,
        document: item.text,
        metadata: metadataFromItem(item)
      }
    ]);

    return item;
  }

  /**
   * Extract memorable items from a conversation via the configured extraction
   * provider, store the new ones, and return how many were persisted.
   *
   * Best-effort: failures to extract or store are logged and swallowed so a
   * memory hiccup never breaks the chat turn that triggered it.
   */
  async rememberConversation(
    messages: Message[],
    opts: { source?: string } = {}
  ): Promise<number> {
    if (!this.isReady()) return 0;
    if (!this.extractionProvider || !this.extractionModel) return 0;

    const conversation = renderConversationForExtraction(messages);
    if (!conversation.trim()) return 0;

    let extracted: ExtractedMemory[] = [];
    try {
      const response = await this.extractionProvider.generateMessageTraced({
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT } as Message,
          { role: "user", content: extractionUserPrompt(conversation) } as Message
        ],
        model: this.extractionModel,
        tools: [],
        maxTokens: 800
      });
      const raw =
        typeof response.content === "string" ? response.content : "";
      extracted = parseExtractionPayload(raw);
    } catch (err) {
      log.warn("LTM extraction failed", {
        userId: this.userId,
        error: err instanceof Error ? err.message : String(err)
      });
      return 0;
    }

    if (extracted.length === 0) return 0;

    const source = opts.source ?? "extraction";
    let stored = 0;
    for (const item of extracted) {
      try {
        const result = await this.remember(item.text, {
          kind: item.kind,
          importance: item.importance,
          source
        });
        if (result) stored++;
      } catch (err) {
        log.warn("LTM remember failed", {
          userId: this.userId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return stored;
  }

  // -- Read -----------------------------------------------------------------

  /**
   * Retrieve the items most relevant to a query, hybrid-scored by similarity,
   * recency and importance. Returned items have a `score` field set.
   *
   * A side-effect bumps `access_count` and `last_accessed_at` for the
   * returned items so frequently-recalled facts surface even faster.
   */
  async recall(
    query: string,
    opts: { k?: number } = {}
  ): Promise<LongTermMemoryItem[]> {
    if (!this.isReady()) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    const k = opts.k ?? this.defaultK;
    if (k <= 0) return [];

    const collection = await this.getCollection();

    let matches;
    try {
      matches = await collection.query({
        text: trimmed,
        topK: k * RECALL_FETCH_MULTIPLIER
      });
    } catch (err) {
      log.warn("LTM recall failed", {
        userId: this.userId,
        error: err instanceof Error ? err.message : String(err)
      });
      return [];
    }

    if (matches.length === 0) return [];

    const now = Date.now();
    const scored: LongTermMemoryItem[] = matches.map((m) => {
      const item = itemFromRecord(m.id, m.document, m.metadata);
      const sim = distanceToSimilarity(m.distance ?? Infinity);
      const recency = recencyFactor(item.createdAt || now, now);
      item.score =
        SCORE_WEIGHT_SIM * sim +
        SCORE_WEIGHT_RECENCY * recency +
        SCORE_WEIGHT_IMPORTANCE * item.importance;
      return item;
    });

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = scored.slice(0, k);

    if (top.length > 0) {
      void this.bumpAccess(top, now).catch((err) => {
        log.warn("LTM access bump failed", {
          userId: this.userId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }

    return top;
  }

  /** All items, newest first. Useful for management UIs. */
  async list(opts: { limit?: number } = {}): Promise<LongTermMemoryItem[]> {
    if (!this.isReady()) return [];
    const collection = await this.getCollection();
    const records = await collection.get({ limit: opts.limit ?? 1000 });
    const items = records.map((r) => itemFromRecord(r.id, r.document, r.metadata));
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  }

  async forget(id: string): Promise<void> {
    if (!this.isReady()) return;
    const collection = await this.getCollection();
    await collection.delete([id]);
  }

  /** Delete every memory in this user/namespace collection. */
  async clear(): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.vectorProvider.deleteCollection(this.collectionName);
    } catch (err) {
      log.debug("LTM clear: collection did not exist", {
        userId: this.userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
    this.collection = null;
    this.collectionPromise = null;
  }

  // -- Internal -------------------------------------------------------------

  private async bumpAccess(
    items: LongTermMemoryItem[],
    nowMs: number
  ): Promise<void> {
    const collection = await this.getCollection();
    await collection.upsert(
      items.map((it) => {
        const updated: LongTermMemoryItem = {
          ...it,
          lastAccessedAt: nowMs,
          accessCount: it.accessCount + 1
        };
        return {
          id: it.id,
          document: it.text,
          // Embeddings are recomputed by the collection's embedding function
          // because the document is unchanged but we don't store it locally.
          metadata: metadataFromItem(updated)
        };
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Default-on factory
// ---------------------------------------------------------------------------

export interface CreateDefaultLongTermMemoryOptions {
  /** Required — memories are scoped per user. */
  userId: string;
  /** Logical scope (e.g. "chat", "research"). Defaults to "default". */
  namespace?: string;
  /**
   * LLM provider used to mine new memories from finished conversations.
   * Pass the same provider the chat is using so extraction uses an already-
   * authenticated client. If omitted, only recall works (extraction is a
   * no-op until a provider is configured).
   */
  extractionProvider?: BaseProvider | null;
  /**
   * Model used for memory extraction. Defaults to the chat model when one
   * is provided.
   */
  extractionModel?: string;
  /**
   * Force-disable. Useful for tests; in production the env / setting gate
   * (`NODETOOL_MEMORY_ENABLED=0`) is the right knob.
   */
  enabled?: boolean;
}

/**
 * Build a {@link LongTermMemory} using configuration auto-detected from the
 * user's secrets and environment. Returns `null` when:
 *
 *  - memory is explicitly disabled via {@link CreateDefaultLongTermMemoryOptions.enabled}
 *    or `NODETOOL_MEMORY_ENABLED=0`
 *  - or no embedding model can be resolved (no OpenAI / Gemini / Ollama
 *    configuration found)
 *
 * Resolution order for the embedding model:
 *
 *   1. `NODETOOL_MEMORY_EMBEDDING_MODEL` env var (explicit override).
 *   2. `OPENAI_API_KEY` set → `text-embedding-3-small`.
 *   3. `GEMINI_API_KEY` set → `text-embedding-004`.
 *   4. `OLLAMA_API_URL` set → `nomic-embed-text`.
 *
 * Callers that need finer-grained control (custom collection metadata,
 * hand-rolled embedder, alternative dedupe threshold) should construct
 * {@link LongTermMemory} directly.
 */
export async function createDefaultLongTermMemory(
  opts: CreateDefaultLongTermMemoryOptions
): Promise<LongTermMemory | null> {
  if (opts.enabled === false) return null;

  const envFlag = process.env["NODETOOL_MEMORY_ENABLED"];
  if (envFlag && ["0", "false", "no", "off"].includes(envFlag.toLowerCase())) {
    return null;
  }

  const userId = opts.userId;
  if (!userId) return null;

  const explicitModel = process.env["NODETOOL_MEMORY_EMBEDDING_MODEL"];
  let embeddingModel: string | null = explicitModel ?? null;
  let embeddingProvider: string | null =
    process.env["NODETOOL_MEMORY_EMBEDDING_PROVIDER"] ?? null;

  if (!embeddingModel) {
    if (await getSecret("OPENAI_API_KEY", userId).catch(() => null)) {
      embeddingModel = "text-embedding-3-small";
      embeddingProvider = "openai";
    } else if (await getSecret("GEMINI_API_KEY", userId).catch(() => null)) {
      embeddingModel = "text-embedding-004";
      embeddingProvider = "gemini";
    } else if (process.env["OLLAMA_API_URL"]) {
      embeddingModel = "nomic-embed-text";
      embeddingProvider = "ollama";
    }
  }

  if (!embeddingModel) {
    log.debug(
      "Long-term memory disabled: no embedding provider configured " +
        "(set OPENAI_API_KEY, GEMINI_API_KEY, OLLAMA_API_URL, or " +
        "NODETOOL_MEMORY_EMBEDDING_MODEL).",
      { userId }
    );
    return null;
  }

  const memory = new LongTermMemory({
    userId,
    namespace: opts.namespace,
    embeddingModel,
    embeddingProvider: embeddingProvider ?? undefined,
    extractionProvider: opts.extractionProvider ?? null,
    extractionModel: opts.extractionModel
  });
  if (!memory.isReady()) return null;
  return memory;
}

/**
 * Render recalled memory items as a Markdown block ready to inject as a
 * system message. Returns `""` when there's nothing to render.
 */
export function formatMemoryForPrompt(items: LongTermMemoryItem[]): string {
  if (items.length === 0) return "";
  const lines: string[] = [
    "# Long-term memory (relevant to the current request)",
    "These are durable facts learned from past sessions. Treat them as background context — confirm with the user only if something looks out-of-date."
  ];
  for (const item of items) {
    lines.push(`- [${item.kind}] ${item.text}`);
  }
  return lines.join("\n");
}
