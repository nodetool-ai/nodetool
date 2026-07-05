# Merge `openai_responses` into `openai`

_Date: 2026-07-05_

## Goal

Collapse the two OpenAI providers into one. `OpenAIProvider` (id `openai`)
should use the **Responses API** for models that support it and **Chat
Completions** for everything else. The separate `openai_responses` provider id
is retired (hard remove — no alias).

## Current state

- `openai-provider.ts` (id `openai`) — Chat Completions API. Base class for 14
  OpenAI-compatible providers (cerebras, groq, xai, mistral, deepseek, together,
  openrouter, lmstudio, vllm, aki, gmi, evolink, minimax, codex, plus the OAuth
  variant).
- `openai-responses-provider.ts` (id `openai_responses`) — **extends**
  `OpenAIProvider`, overrides `generateMessage` / `generateMessages` /
  `generateLoop` / `formatTools` / `hasToolSupport` /
  `getAvailableLanguageModels` and the `supportsNative*` getters to use the
  Responses API. Adds native `web_search` + `image_generation` tools and session
  resume via `previous_response_id`.
- `responses-api.ts` — shared Responses request/stream helpers. Stays as-is.
- The id `openai_responses` is referenced in `protocol` (`api-types.ts`,
  `cloud-profile.ts`), `web` (`nodeProvider.ts`, `providerDisplay.ts`,
  `costsData.ts`), and tests.

## Design

### 1. Routing predicate

Add to `OpenAIProvider`:

```ts
protected usesResponsesApi(model: string): boolean {
  return this.provider === PROVIDER_IDS.OPENAI && isOpenAIResponsesModel(model);
}
```

`isOpenAIResponsesModel` (moved from the subclass) matches `gpt-5*`, `gpt-4.1*`,
`gpt-4o*`, `o<n>*`. Gating on `this.provider === "openai"` keeps every
OpenAI-compatible subclass on Chat Completions — they pass their own
`providerId`, so the predicate is false for them. Unknown / legacy / fine-tuned
ids (not matched by the predicate) fall back to Chat Completions.

### 2. Method routing

Move the Responses implementations from `openai-responses-provider.ts` into
`openai-provider.ts` (as private methods / the branch bodies). Then:

- `generateMessage`, `generateMessages`, `generateLoop`: branch at the top —
  `if (this.usesResponsesApi(args.model))` run the Responses path, else the
  existing Chat Completions path.
- `formatTools(tools, model?)`: the Responses tool shape (native `web_search` /
  `image_generation` + `responseTools`) applies on the Responses path; Chat
  Completions path keeps current behavior. Note `formatTools` currently takes no
  model arg — the Responses tool formatting is invoked from inside the Responses
  request builder, so it can call a dedicated `formatResponsesTools` rather than
  overloading `formatTools`.
- `hasToolSupport(model)`: Responses models → `true`; else existing logic.
- `supportsNativeWebSearch` / `supportsNativeImageGeneration` getters: return
  `true` only when `this.provider === PROVIDER_IDS.OPENAI`; false for subclasses.
- `getAvailableLanguageModels`: return the full OpenAI model list under
  `openai` — no Responses-only filter, no provider relabel. Fold the former
  `OPENAI_RESPONSES_FALLBACK_MODELS` in only as the empty-list fallback (relabelled
  to `openai`).

The imports the subclass pulls from `responses-api.js` and
`provider-session.js` (`hashSystemPrompt`), plus the `splitToolResultImages`
helper, move into `openai-provider.ts`. `responses-api.ts` remains a shared
module.

### 3. Retire the id (hard remove)

- `protocol/api-types.ts`: delete `OPENAI_RESPONSES` from `PROVIDER_IDS`.
- `protocol/cloud-profile.ts`: remove its `openai_responses` reference.
- `runtime/providers/index.ts`: drop the import, the re-export, and the
  `registerBuiltinProvider(PROVIDER_IDS.OPENAI_RESPONSES, …)` call.
- Delete `openai-responses-provider.ts`.
- `web/`: remove `openai_responses` from `nodeProvider.ts`, `providerDisplay.ts`,
  `costsData.ts`.
- Tests: delete `openai-responses-provider.test.ts` after migrating its
  still-relevant Responses-path assertions into the openai provider test suite;
  fix `cloud-profile-providers.test.ts`, `ModelMenuStore.test.ts`,
  `providerDisplay.test.ts`, `costsData.test.ts`.

### 4. Verify

- `npm run typecheck && npm run lint && npm run test` for `protocol`, `runtime`,
  `web` (and any package that imported the id).
- Exercise both paths through the merged provider: a Responses model
  (e.g. `gpt-5.4-mini`) and a Chat Completions model / a compatible subclass, to
  confirm routing and that native web-search / image-generation still work on
  the Responses path.

## Risks

- The subclass methods use `override`; after the merge they become base
  implementations. Confirm no other subclass silently relied on the Chat
  Completions versions being final.
- `store: true` + `previous_response_id` session resume logic moves wholesale;
  keep its behavior identical for the `openai` provider.
- Any external code importing `OpenAIResponsesProvider` breaks by design (hard
  remove). Grep confirms usage is limited to `index.ts` and tests.

## Model pruning (added during implementation)

The `openai` provider now supports only the **gpt-5 family**. Everything before
gpt-5 (gpt-4o, gpt-4.1, the o-series) is retired:

- `isOpenAIResponsesModel` matches `gpt-5*` only (audio/realtime/transcribe
  variants still excluded → Chat Completions).
- `getAvailableLanguageModels` filters the live list to gpt-5 models for the
  `openai` provider; the fallback list is the gpt-5 family.
- `RECOMMENDED_MODELS` OpenAI anchor is now `gpt-5-mini`.
- Non-LLM OpenAI model families (TTS, Whisper/transcription, realtime audio,
  gpt-image, embeddings) and other providers hosting OpenAI models (Replicate,
  OpenRouter) are left untouched.

## Out of scope

- No changes to `responses-api.ts` internals.
- No changes to the Chat Completions path behavior for existing models.
- No back-compat alias for the retired id.
