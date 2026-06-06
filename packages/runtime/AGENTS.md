# Runtime — ProcessingContext & LLM Providers

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **runtime**

> Read [packages/AGENTS.md](../AGENTS.md) and [docs/DEVELOPMENT_STANDARDS.md](../../docs/DEVELOPMENT_STANDARDS.md) first. This overlay covers the LLM provider adapters in `src/providers/` and the shared media-ref resolver.

LLM providers must present an **identical contract** to callers regardless of the
underlying vendor API. The bugs below all came from one provider diverging.

## Cost / token accounting (`cost-calculator.ts`, providers)

- **`UsageInfo.inputTokens` is the *full* prompt total, inclusive of cached and
  cache-write subsets.** When a vendor reports the *uncached* portion separately
  (Anthropic: `usage.input_tokens` excludes cache read/write), add cache-read +
  cache-write back in before calling `trackUsage` — `@pydantic/genai-prices`
  re-subtracts `cachedTokens`, so passing the raw uncached count double-counts the
  discount and never bills cache creation.
- **Every `PRICING_TIERS` entry needs a source comment citing the vendor's
  published rate.** A fabricated rate (the old `gpt-4o-mini-tts` tier) is a silent
  mispricing; provenance lets the number be re-verified when prices change.

## Streaming

- **Emit exactly one terminal `{ done: true }` chunk for every stream-termination
  reason** (`stop`, `tool_calls`, `length`, `content_filter`), in all providers.
  The OpenAI provider used to emit it only on `finish_reason === "stop"`, so
  tool-call/length finishes left consumers waiting forever. The end-of-stream
  contract must be reason-independent and identical across providers.

## Tool-call ↔ tool-result pairing

- **Pair tool results to calls using the key the provider correlates on**: Gemini
  matches `functionResponse` to `functionCall` by **function name** (build an
  id→name map from the preceding assistant `toolCalls`); OpenAI/Anthropic match by
  call **id**. Never assume our internal `toolCallId` is the vendor's identifier.
- **For providers that require strict role alternation (Gemini), merge parallel
  tool results into a single turn** rather than emitting consecutive same-role
  turns.
- **Mint emulated tool-call ids as `timestamp + per-call counter`**, never a
  timestamp alone — same-millisecond calls collide. Use `replaceAll`, not
  `replace`, when stripping call text that can recur.

## Request / response shape (provider-direct & message conversion)

- **Map roles the target provider lacks into one it accepts** — a stray Anthropic
  `system` message folds into a `user` message; don't mislabel it `assistant`.
- **Never `String(content)` on a message whose content may be a structured-block
  array** — it stringifies to `"[object Object]"`. Filter text blocks
  (`isTextContent`) and join.
- **Guard provider response array access (`data?.[0]`) and throw a descriptive
  error** when an expected payload is absent — never assume a documented array
  field is present and non-empty.

## Shared media-ref resolver (`media-ref-bytes.ts`, `python-node-executor.ts`)

- **Guard `data.length > 0` on *every* inline branch** (string base64 **and**
  `Uint8Array`) before returning, so an empty inline buffer falls through to
  `uri`/`asset_id`/storage resolution instead of short-circuiting to empty bytes.
- **Never emit raw bytes as a node output** — wrap media in a typed ref
  `{ type, data }` (the Python node executor must do this even when no storage
  adapter is available) so downstream type detection and asset-saving work.

See [packages/AGENTS.md § Media refs](../AGENTS.md#media-refs-imageref--videoref--audioref--model3dref) for the raw-base64 / `type`-discriminator rules that apply to every ref.
