/**
 * LLM record/replay ("VCR cassette") harness at the provider boundary.
 *
 * A {@link CassetteProvider} wraps any inner {@link BaseProvider}. In "record"
 * mode it delegates every chat call to the inner provider and captures the
 * request plus the full streamed response into a cassette. In "replay" mode it
 * serves recorded responses by matching a stable hash of the request, never
 * touching the inner provider (no API key, no network, no cost, no flakiness).
 * "auto" replays when a matching interaction exists, otherwise records one.
 *
 * Only the chat surface (`generateMessage` / `generateMessages`) is recorded —
 * that is where agent/prompt behavior lives. Every other modality (image,
 * video, audio, embeddings) delegates straight to the inner provider.
 */

import { getNodeBuiltinSync, importNodeBuiltin } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import type { UsageInfo } from "./cost-calculator.js";
import { createUsageSlot } from "../tracing-helpers.js";
import type {
  Message,
  ProviderEffort,
  ProviderStreamItem,
  ProviderThinkingConfig,
  ProviderTool
} from "./types.js";

const _nodeCrypto =
  getNodeBuiltinSync<typeof import("node:crypto")>("node:crypto");

// ---------------------------------------------------------------------------
// Cassette data model
// ---------------------------------------------------------------------------

export type CassetteMode = "record" | "replay" | "auto";

export type CassetteMethod = "generateMessage" | "generateMessages";

// ---------------------------------------------------------------------------
// Scripted provider faults (docs/RELIABILITY_TASKS.md D1)
// ---------------------------------------------------------------------------

/**
 * The seven provider-seam faults docs/RELIABILITY_ARCHITECTURE.md §9 names.
 * `http-429`/`http-500`/`timeout` fail the call outright before touching the
 * cassette or inner provider; `truncated-stream`/`malformed-chunk`/
 * `slow-drip`/`cost-omission` let the call proceed (cassette replay or inner
 * delegation, same as today) and perturb the resulting stream/usage.
 */
export type ProviderFaultKind =
  | "http-429"
  | "http-500"
  | "timeout"
  | "truncated-stream"
  | "malformed-chunk"
  | "slow-drip"
  | "cost-omission";

/** One scripted fault, applied to every call this provider instance serves. */
export interface ProviderFault {
  kind: ProviderFaultKind;
  /** `truncated-stream`: chunks yielded before the stream throws (default 2). */
  afterChunks?: number;
  /** `slow-drip`: delay in ms injected before each yielded stream item (default 10). */
  delayMs?: number;
  /** `timeout`: ms waited before throwing the synthetic timeout error (default 50). */
  timeoutMs?: number;
  /** `http-429`: surfaced in the synthetic error message, not otherwise enforced. */
  retryAfterSeconds?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Immediate-failure faults: thrown before the cassette/inner provider is
 * ever consulted. Returns null for faults that don't fail the call outright. */
async function throwImmediateFault(fault: ProviderFault): Promise<void> {
  if (fault.kind === "http-429") {
    const err = new Error(
      `CassetteProvider fault: upstream rate limited (429 too many requests)` +
        (fault.retryAfterSeconds
          ? `; retry after ${fault.retryAfterSeconds}s`
          : "")
    ) as Error & { status?: number };
    err.status = 429;
    throw err;
  }
  if (fault.kind === "http-500") {
    const err = new Error(
      "CassetteProvider fault: upstream server error (500 internal server error)"
    ) as Error & { status?: number };
    err.status = 500;
    throw err;
  }
  if (fault.kind === "timeout") {
    const ms = fault.timeoutMs ?? 50;
    await sleep(ms);
    const err = new Error(
      `CassetteProvider fault: request timed out after ${ms}ms`
    ) as Error & { code?: string };
    err.code = "ETIMEDOUT";
    throw err;
  }
}

/**
 * Normalized, hashable summary of a chat request. Only the fields that change
 * the model's output are kept; runtime-only fields (signals, callbacks, history
 * loaders) are dropped so the same logical request hashes identically.
 */
export interface CassetteRequest {
  model: string;
  messages: Message[];
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    inputExamples?: Array<Record<string, unknown>>;
    cacheControl?: ProviderTool["cacheControl"];
    strict?: boolean;
    deferLoading?: boolean;
    allowedCallers?: string[];
    type?: ProviderTool["type"];
  }>;
  toolChoice?: string;
  maxTokens?: number;
  maxTurns?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  thinking?: ProviderThinkingConfig;
  effort?: ProviderEffort;
  audio?: Record<string, unknown>;
}

/** One recorded request/response pair. */
export interface CassetteInteraction {
  hash: string;
  method: CassetteMethod;
  request: CassetteRequest;
  /**
   * For `generateMessages`: the ordered array of yielded stream items.
   * For `generateMessage`: the single returned {@link Message}.
   */
  response: ProviderStreamItem[] | Message;
  /** Usage captured during recording, reproduced on replay for cost parity. */
  usage?: UsageInfo;
  /**
   * Scripted failure: when present, replay throws this instead of returning
   * `response` (which is ignored). Lets a cassette pin "the upstream call
   * failed this way" for error-taxonomy tests
   * (`BaseProvider.isRateLimitError`/`isAuthError`/`isContextLengthError`)
   * without a live provider ever producing the failure. This is a minimal,
   * single-shot failure — the full HTTP-fault matrix (mid-stream truncation,
   * malformed SSE, slow-drip, cost-field omission) is Track D's job
   * (`docs/RELIABILITY_TASKS.md` D1); this field only needs to exist so a
   * contract cassette can represent "the request failed" at all.
   */
  error?: { message: string; status?: number };
}

/** A serializable cassette: an ordered list of interactions. */
export interface Cassette {
  version: 1;
  interactions: CassetteInteraction[];
}

export function createEmptyCassette(): Cassette {
  return { version: 1, interactions: [] };
}

// ---------------------------------------------------------------------------
// Stable hashing
// ---------------------------------------------------------------------------

/** A value reduced to the JSON shapes `stableStringify` hashes. */
type StableValue =
  | string
  | number
  | boolean
  | null
  | StableValue[]
  | { [key: string]: StableValue };

/**
 * Deterministic JSON with object keys sorted at every level. Arrays keep their
 * order. Typed arrays/Buffers are encoded as a tagged base64 string so binary
 * message content hashes stably. Circular references collapse to "[circular]".
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const encode = (v: unknown): StableValue => {
    if (v === null || typeof v !== "object") {
      // Normalize undefined (omitted by JSON.stringify) and functions to null
      // so two requests differing only in an unset optional hash identically.
      if (typeof v === "undefined" || typeof v === "function") return null;
      if (typeof v === "bigint") return `__bigint__:${v.toString()}`;
      // SAFETY: what is left is a JSON scalar — string, number, boolean, null.
      return v as StableValue;
    }
    if (v instanceof Uint8Array) {
      return `__bytes__:${bytesToBase64(v)}`;
    }
    if (ArrayBuffer.isView(v)) {
      const view = v as ArrayBufferView;
      return `__bytes__:${bytesToBase64(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      )}`;
    }
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);
    try {
      if (Array.isArray(v)) {
        return v.map(encode);
      }
      const obj = v as Record<string, unknown>;
      const out: { [key: string]: StableValue } = {};
      for (const key of Object.keys(obj).sort()) {
        out[key] = encode(obj[key]);
      }
      return out;
    } finally {
      seen.delete(v as object);
    }
  };

  return JSON.stringify(encode(value));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa exists in browser/worker runtimes; fall back to a hex dump otherwise.
  const g = globalThis as { btoa?: (s: string) => string };
  return g.btoa ? g.btoa(binary) : Array.from(bytes).join(",");
}

/**
 * sha256 of a string via node:crypto. Falls back to a deterministic non-crypto
 * 64-bit FNV-1a hash (hex) when crypto is unavailable, so hashing still works
 * in restricted runtimes — collisions are astronomically unlikely for request
 * payloads and only matter within a single cassette.
 */
export function hashString(input: string): string {
  if (_nodeCrypto?.createHash) {
    return _nodeCrypto.createHash("sha256").update(input).digest("hex");
  }
  // FNV-1a 64-bit (BigInt) deterministic fallback.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Build the normalized, hashable request summary from raw call args. */
export function normalizeRequest(args: {
  messages: Message[];
  model: string;
  tools?: ProviderTool[];
  toolChoice?: string | "any";
  maxTokens?: number;
  maxTurns?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  thinking?: ProviderThinkingConfig;
  effort?: ProviderEffort;
  audio?: Record<string, unknown>;
}): CassetteRequest {
  const request: CassetteRequest = {
    model: args.model,
    messages: args.messages
  };
  if (args.tools && args.tools.length > 0) {
    // Keep only output-affecting tool fields; drop the live `execute` closure
    // and the `terminal` flag (loop control, not model input).
    request.tools = args.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      inputExamples: t.inputExamples,
      cacheControl: t.cacheControl,
      strict: t.strict,
      deferLoading: t.deferLoading,
      allowedCallers: t.allowedCallers,
      type: t.type
    }));
  }
  if (args.toolChoice !== undefined) request.toolChoice = args.toolChoice;
  if (args.maxTokens !== undefined) request.maxTokens = args.maxTokens;
  if (args.maxTurns !== undefined) request.maxTurns = args.maxTurns;
  if (args.temperature !== undefined) request.temperature = args.temperature;
  if (args.topP !== undefined) request.topP = args.topP;
  if (args.presencePenalty !== undefined) {
    request.presencePenalty = args.presencePenalty;
  }
  if (args.frequencyPenalty !== undefined) {
    request.frequencyPenalty = args.frequencyPenalty;
  }
  if (args.thinking !== undefined) request.thinking = args.thinking;
  if (args.effort !== undefined) request.effort = args.effort;
  if (args.audio !== undefined) request.audio = args.audio;
  return request;
}

/** Stable hash of a request, scoped by method so the two surfaces never mix. */
export function hashRequest(
  method: CassetteMethod,
  request: CassetteRequest
): string {
  return hashString(stableStringify({ method, request }));
}

// ---------------------------------------------------------------------------
// Cassette store (disk persistence)
// ---------------------------------------------------------------------------

/**
 * Load/save cassettes as pretty-printed JSON on disk. Node-only; methods throw
 * a clear {@link Error} when `node:fs/promises` is unavailable (browser/worker),
 * so in-memory use stays the supported path off Node.
 */
export class CassetteStore {
  static async load(path: string): Promise<Cassette> {
    const fsP =
      await importNodeBuiltin<typeof import("node:fs/promises")>(
        "node:fs/promises"
      );
    if (!fsP) {
      throw new Error("CassetteStore.load requires node:fs/promises");
    }
    const text = await fsP.readFile(path, "utf-8");
    const parsed = JSON.parse(text) as Cassette;
    if (!parsed || !Array.isArray(parsed.interactions)) {
      throw new Error(`Invalid cassette at ${path}: missing interactions`);
    }
    return parsed;
  }

  /** Load a cassette if the file exists, otherwise return an empty one. */
  static async loadOrEmpty(path: string): Promise<Cassette> {
    try {
      return await CassetteStore.load(path);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") return createEmptyCassette();
      throw err;
    }
  }

  static async save(path: string, cassette: Cassette): Promise<void> {
    const fsP =
      await importNodeBuiltin<typeof import("node:fs/promises")>(
        "node:fs/promises"
      );
    if (!fsP) {
      throw new Error("CassetteStore.save requires node:fs/promises");
    }
    await fsP.writeFile(path, JSON.stringify(cassette, null, 2), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// CassetteProvider
// ---------------------------------------------------------------------------

export interface CassetteProviderOptions {
  /** record | replay | auto. Defaults to "auto". */
  mode?: CassetteMode;
  /** In-memory cassette to read from / write into. */
  cassette?: Cassette;
  /** Disk path to persist to. When set, `save()` writes here. */
  path?: string;
  /**
   * Scripted fault (docs/RELIABILITY_TASKS.md D1) applied to every call this
   * instance serves, on top of whatever `mode` would otherwise do. Absent by
   * default — existing cassettes and callers are unaffected.
   */
  fault?: ProviderFault;
}

/**
 * Provider that records or replays the chat surface of an inner provider.
 *
 * Construct with an in-memory cassette for tests, or from disk via
 * {@link CassetteProvider.fromFile}. The cassette grows in "record"/"auto"
 * mode; call {@link CassetteProvider.save} to persist it.
 */
export class CassetteProvider extends BaseProvider {
  readonly inner: BaseProvider;
  readonly mode: CassetteMode;
  readonly cassette: Cassette;
  private readonly path?: string;
  private readonly fault?: ProviderFault;
  /**
   * Per-hash replay cursor. Among interactions sharing a hash, successive
   * replays cycle through them in record order (FIFO), wrapping around so two
   * consecutive identical requests with a single recorded interaction both
   * return that same interaction deterministically.
   */
  private readonly replayCursors = new Map<string, number>();

  constructor(inner: BaseProvider, options: CassetteProviderOptions = {}) {
    // Adopt the inner provider's id so trackUsage() re-derives the exact same
    // cost on replay via CostCalculator (it prices per provider + model).
    super(inner.provider);
    this.inner = inner;
    this.mode = options.mode ?? "auto";
    this.cassette = options.cassette ?? createEmptyCassette();
    this.path = options.path;
    this.fault = options.fault;
  }

  /**
   * Wraps a stream (a cassette hit's recorded items or the inner provider's
   * live generator) with the non-immediate faults: `truncated-stream` throws
   * after `afterChunks` items (simulating a dropped connection mid-stream),
   * `slow-drip` delays before every yield, `malformed-chunk` throws after the
   * underlying stream ends (simulating an unparseable trailing SSE event).
   * A no-op passthrough when no fault — or an immediate-failure fault — is set.
   */
  private async *applyStreamFault(
    items: AsyncIterable<ProviderStreamItem>
  ): AsyncGenerator<ProviderStreamItem> {
    const fault = this.fault;
    if (!fault) {
      yield* items;
      return;
    }
    const limit =
      fault.kind === "truncated-stream" ? (fault.afterChunks ?? 2) : null;
    let count = 0;
    for await (const item of items) {
      if (limit !== null && count >= limit) {
        throw new Error(
          `CassetteProvider fault: stream truncated after ${limit} chunk(s) (connection reset)`
        );
      }
      if (fault.kind === "slow-drip") {
        await sleep(fault.delayMs ?? 10);
      }
      yield item;
      count++;
    }
    if (fault.kind === "malformed-chunk") {
      throw new SyntaxError(
        "CassetteProvider fault: malformed SSE event (unparseable chunk)"
      );
    }
  }

  /** `cost-omission`: usage is never tracked/reproduced, even though the
   * underlying call (real or replayed) succeeded normally. */
  private get omitCost(): boolean {
    return this.fault?.kind === "cost-omission";
  }

  /**
   * Build a provider backed by a cassette file. The file is loaded if present
   * (empty cassette otherwise, for first-time recording). Pass `path` again — or
   * omit it and call {@link save} with an explicit path — to persist.
   */
  static async fromFile(
    inner: BaseProvider,
    path: string,
    options: Omit<CassetteProviderOptions, "cassette" | "path"> = {}
  ): Promise<CassetteProvider> {
    const cassette = await CassetteStore.loadOrEmpty(path);
    return new CassetteProvider(inner, { ...options, cassette, path });
  }

  /** Persist the current cassette to disk (its `path`, or an override). */
  async save(path?: string): Promise<void> {
    const target = path ?? this.path;
    if (!target) {
      throw new Error("CassetteProvider.save requires a path");
    }
    await CassetteStore.save(target, this.cassette);
  }

  override async getAvailableLanguageModels() {
    return this.inner.getAvailableLanguageModels();
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    return this.inner.hasToolSupport(model);
  }

  // -------------------------------------------------------------------------
  // Matching
  // -------------------------------------------------------------------------

  /**
   * Find a recorded interaction for this request hash, advancing the per-hash
   * replay cursor (FIFO, wrapping). Returns null when nothing was recorded for
   * the hash.
   */
  private matchInteraction(
    method: CassetteMethod,
    hash: string
  ): CassetteInteraction | null {
    const matches = this.cassette.interactions.filter(
      (i) => i.method === method && i.hash === hash
    );
    if (matches.length === 0) return null;
    const cursorKey = `${method}:${hash}`;
    const cursor = this.replayCursors.get(cursorKey) ?? 0;
    const interaction = matches[cursor % matches.length];
    this.replayCursors.set(cursorKey, cursor + 1);
    return interaction;
  }

  // -------------------------------------------------------------------------
  // generateMessage (single-shot)
  // -------------------------------------------------------------------------

  async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    if (this.fault) await throwImmediateFault(this.fault);

    const request = normalizeRequest(args);
    const hash = hashRequest("generateMessage", request);

    if (this.mode === "replay" || this.mode === "auto") {
      const hit = this.matchInteraction("generateMessage", hash);
      if (hit) {
        if (hit.error) throw reconstructScriptedError(hit.error);
        if (hit.usage && !this.omitCost)
          this.trackUsage(request.model, hit.usage);
        return cloneMessage(hit.response as Message);
      }
      if (this.mode === "replay") {
        throw new Error(
          `CassetteProvider replay miss: no recorded generateMessage for ` +
            `model "${request.model}" (hash ${hash.slice(0, 12)})`
        );
      }
    }

    // record / auto-miss: delegate, capturing the response and the inner
    // provider's tracked usage so replay reproduces the same cost.
    const { runInSlot, getUsage } = createUsageSlot();
    const result = await runInSlot(() => this.inner.generateMessage(args));
    const usage = this.omitCost ? undefined : usageFromSlot(getUsage());
    if (usage) this.trackUsage(request.model, usage);
    const interaction: CassetteInteraction = {
      hash,
      method: "generateMessage",
      request,
      response: cloneMessage(result)
    };
    if (usage) {
      interaction.usage = usage;
    }
    this.cassette.interactions.push(interaction);
    return result;
  }

  // -------------------------------------------------------------------------
  // generateMessages (streaming primitive)
  // -------------------------------------------------------------------------

  async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    if (this.fault) await throwImmediateFault(this.fault);

    const request = normalizeRequest(args);
    const hash = hashRequest("generateMessages", request);

    if (this.mode === "replay" || this.mode === "auto") {
      const hit = this.matchInteraction("generateMessages", hash);
      if (hit) {
        if (hit.error) throw reconstructScriptedError(hit.error);
        const items = hit.response as ProviderStreamItem[];
        yield* this.applyStreamFault(
          (async function* () {
            for (const item of items) yield cloneStreamItem(item);
          })()
        );
        // Reproduce recorded usage AFTER the stream so a consumer that reads
        // cost post-iteration (the common case) sees the same total a live run
        // produced. trackUsage also feeds the tracing/cost slot.
        if (hit.usage && !this.omitCost)
          this.trackUsage(request.model, hit.usage);
        return;
      }
      if (this.mode === "replay") {
        throw new Error(
          `CassetteProvider replay miss: no recorded generateMessages for ` +
            `model "${request.model}" (hash ${hash.slice(0, 12)})`
        );
      }
    }

    // record / auto-miss: delegate, capturing every yielded item plus the
    // inner provider's tracked usage. A usage slot wraps each next() so the
    // inner provider's setLastUsage() survives across the generator's yields.
    const { runInSlot, getUsage } = createUsageSlot();
    const captured: ProviderStreamItem[] = [];
    const source = this.inner.generateMessages(args);
    const faulted = this.applyStreamFault(
      (async function* () {
        while (true) {
          const next = await runInSlot(() => source.next());
          if (next.done) return;
          yield next.value;
        }
      })()
    );
    for await (const item of faulted) {
      captured.push(cloneStreamItem(item));
      yield item;
    }
    const usage = this.omitCost ? undefined : usageFromSlot(getUsage());
    if (usage) this.trackUsage(request.model, usage);
    const interaction: CassetteInteraction = {
      hash,
      method: "generateMessages",
      request,
      response: captured
    };
    if (usage) {
      interaction.usage = usage;
    }
    this.cassette.interactions.push(interaction);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert the inner provider's tracked {@link LlmUsage} (captured during
 * recording via a usage slot) into the serializable {@link UsageInfo} stored on
 * the interaction. On replay this is fed back through `trackUsage`, which
 * re-derives the same cost because the cassette provider adopts the inner
 * provider's id. Returns undefined when the inner provider tracked no usage
 * (e.g. FakeProvider), in which case replay reports zero cost — matching the
 * recorded run.
 */
function usageFromSlot(
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
  } | null
): UsageInfo | undefined {
  if (!usage) return undefined;
  const info: UsageInfo = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  };
  if (usage.cachedInputTokens !== undefined) {
    info.cachedTokens = usage.cachedInputTokens;
  }
  if (usage.cacheWriteTokens !== undefined) {
    info.cacheWriteTokens = usage.cacheWriteTokens;
  }
  return info;
}

/** Rebuild an Error from a scripted {@link CassetteInteraction.error}. */
function reconstructScriptedError(error: {
  message: string;
  status?: number;
}): Error {
  const err = new Error(error.message) as Error & { status?: number };
  if (error.status !== undefined) err.status = error.status;
  return err;
}

function cloneMessage(message: Message): Message {
  return structuredCloneSafe(message);
}

function cloneStreamItem(item: ProviderStreamItem): ProviderStreamItem {
  return structuredCloneSafe(item);
}

/** Deep clone that tolerates typed arrays; falls back to JSON for old runtimes. */
function structuredCloneSafe<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U })
    .structuredClone;
  if (sc) {
    try {
      return sc(value);
    } catch {
      // Value carried something structuredClone rejects (a function); fall
      // through to the JSON path below.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
