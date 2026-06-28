---
layout: page
title: "Anthropic (Claude): Add Models"
description: "How new Claude models appear in NodeTool, and when (rarely) you need to touch code."
---

The Anthropic provider fetches the model list live from the API on every startup, so new Claude models appear automatically once Anthropic publishes them. Code changes are only needed for per-model cost overrides or capability flags — and neither is currently required for any Claude model.

> **Audience:** coding agents and contributors adding or adjusting Claude models in NodeTool.

---

## TL;DR

New Claude models need **zero code changes** in almost every case. The provider calls `GET https://api.anthropic.com/v1/models` at startup (`getAvailableLanguageModels`, line 113 of `anthropic-provider.ts`), and any model Anthropic publishes there is immediately available. The only cases that require code:

- **Cost tracking is missing**: add a pricing entry to `@pydantic/genai-prices` upstream, or open an issue if genai-prices already covers it.
- **A new capability cannot be inferred at runtime**: extend `hasToolSupport` or add a capability flag (currently all Claude models return `true` for tool support).

---

## Where things live

| Concern | Path |
|---|---|
| Provider class | `packages/runtime/src/providers/anthropic-provider.ts` |
| Dynamic model fetch | `AnthropicProvider.getAvailableLanguageModels()` — line 113 |
| Tool support check | `AnthropicProvider.hasToolSupport()` — line 109 |
| Cost calculation | `packages/runtime/src/providers/cost-calculator.ts` |
| Token pricing catalog | `@pydantic/genai-prices` (npm dependency) |
| Provider ID constant | `PROVIDER_IDS.ANTHROPIC = "anthropic"` in `packages/protocol/src/api-types.ts` line 864 |
| Provider registration | `packages/runtime/src/providers/index.ts` line 203 |
| Claude Agent SDK provider | `packages/runtime/src/providers/claude-agent-provider.ts` |

---

## How Claude models are defined

`AnthropicProvider.getAvailableLanguageModels()` (line 113–200) does a direct HTTP call:

```
GET https://api.anthropic.com/v1/models
Headers:
  x-api-key: <ANTHROPIC_API_KEY>
  anthropic-version: 2023-06-01
```

It retries up to three times (exponential backoff: 1 s, 2 s, 4 s) on HTTP 429/5xx, times out after 10 seconds per attempt, and returns `[]` on auth errors (401/403) without retrying. Each entry from `payload.data` becomes a `LanguageModel`:

```typescript
{ id: "claude-opus-4-5", name: "claude-opus-4-5", provider: "anthropic" }
```

There is no static fallback list. If the API is unreachable, no Anthropic models appear in the model selector until the next successful fetch.

**Tool support**: `hasToolSupport()` (line 109) unconditionally returns `true` for all Claude models. Anthropic's tool-use API is available across the whole current model family.

**Vision / image input**: handled in `convertMessage()` (line 323) and `convertImagePart()` (line 269). Any model can receive image content; the provider always encodes images as base64 inline blocks regardless of model ID.

**Extended thinking**: the `thinkingBudget` parameter (used in `generateMessages` line 539 and `generateMessage` line 725) enables `thinking: { type: "enabled", budget_tokens: N }`. No model-specific check exists today — callers set the budget; the API rejects it for models that don't support thinking.

---

## Add / adjust a model

### When nothing is needed

A new Anthropic model (e.g. `claude-opus-5`) appears in NodeTool automatically once Anthropic adds it to their `/v1/models` list. No code change required.

Verify with:

```bash
npm run dev:nodetool -- node run nodetool.text.Concat \
  --props '{"a":"test","b":""}' --no-secrets
# Then check the model selector in the UI or:
npm run dev:nodetool -- info
```

### When cost tracking needs updating

Claude token costs are priced via `@pydantic/genai-prices`. Check if the new model ID is already in that package:

```bash
node -e "const {calcPrice}=require('@pydantic/genai-prices'); \
  console.log(calcPrice({input_tokens:1000,output_tokens:500},'claude-opus-5','anthropic'))"
```

If `calcPrice` returns `null`, the model is not in the catalog. Options:

1. Open a PR to `pydantic/genai-prices` (upstream), then bump the package version here.
2. If the model is token-based and you need an interim workaround, note that the local `MODEL_TO_TIER` table in `cost-calculator.ts` is for **non-token modalities only** (image/audio/3D). Adding a Claude model there will not produce correct per-token costs — go upstream.

Cost tracking flows through `trackUsage()` in `base-provider.ts` (line 352), called by the Anthropic provider at `message_stop` (line 580 for streaming, line 743 for non-streaming). Anthropic's API reports uncached input separately from cache read/write tokens; the provider sums them before passing to the cost calculator to match genai-prices' expected contract (see comment at line 577).

### When capability detection needs updating

`hasToolSupport()` (line 109) returns `true` for all models. If Anthropic releases a model where this is not true:

```typescript
// packages/runtime/src/providers/anthropic-provider.ts
async hasToolSupport(model: string): Promise<boolean> {
  // example: a hypothetical embedding-only model
  if (model.startsWith("claude-embed-")) return false;
  return true;
}
```

Run `npm run typecheck && npm run lint` after any edit to this file.

### ClaudeAgentProvider (separate path)

`packages/runtime/src/providers/claude-agent-provider.ts` is a distinct provider registered as `PROVIDER_IDS.CLAUDE_AGENT_SDK = "claude_agent_sdk"` (line 210 of `index.ts`). It authenticates through a local `claude` CLI subscription rather than an API key. It also fetches its available models dynamically. Changes to `AnthropicProvider` do not affect it and vice versa.

---

## Verify

Run these after any change to the Anthropic provider:

```bash
# 1. TypeScript — must pass
npm run typecheck

# 2. Lint — must pass
npm run lint

# 3. Full check (typecheck + lint + tests)
npm run check

# 4. Confirm models are returned (requires ANTHROPIC_API_KEY)
npm run dev:nodetool -- info --json | grep -A5 '"anthropic"'

# 5. Smoke-test a single-node call
npm run dev:nodetool -- node run nodetool.llm.Claude \
  --props '{"prompt":"hello","model":"claude-haiku-4-5","max_tokens":50}'
```

---

## How past commits did it

**`d1491abf`** ("add claude agent package", 2026-06-26) introduced the `ClaudeAgentProvider` and wired it as `CLAUDE_AGENT_SDK`. The `AnthropicProvider` itself was already present; that commit shows the registration pattern at `index.ts` line 210 and the relationship between the two Anthropic-backed providers.

**`abea04ec`** ("Add AI-driven 3D scene editing…", 2026-06-26, PR #3913) extended the tool message contract to support image content blocks in tool results (`convertMessage` lines 335–362). This is an example of a capability extension that only touched `anthropic-provider.ts` — no model list changes were involved.

Both commits follow the pattern: model availability is never hardcoded; behavioral changes are isolated to the provider class.

---

## Contributing

PRs welcome at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run check   # typecheck + lint + test
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
