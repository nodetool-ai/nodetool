---
layout: page
title: "Anthropic (Claude): Provider Guide"
description: "How NodeTool discovers Claude models and how to verify new model behavior."
---

# Anthropic provider

NodeTool calls Anthropic's Messages API through `AnthropicProvider`. The provider
supports text, image input, client tools, native web search, streaming, prompt
cache accounting, and extended thinking. It uses `ANTHROPIC_API_KEY` by default
through the built-in provider registry. Direct integrations can construct the
provider with an auth token, structured SDK credentials, or a custom base URL;
those alternatives are not resolved by the built-in registry.

Anthropic changes model capabilities independently of the Models API. A model
appearing in the selector does not prove that every NodeTool request option works
with it. Check the model's thinking mode, sampling parameters, stop reasons, and
tool behavior before making it a default or recommendation.

## Files

| Concern | Path |
|---|---|
| Provider | `packages/runtime/src/providers/anthropic-provider.ts` |
| Recommended models | `packages/runtime/src/recommended-models.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` |
| Provider tests | `packages/runtime/tests/providers/anthropic-provider*.test.ts` |
| Catalog tests | `packages/runtime/tests/recommended-models.test.ts` |
| Cost calculation | `packages/runtime/src/providers/cost-calculator.ts` |

`ClaudeAgentProvider` is a separate integration backed by the Claude Agent SDK
and a local Claude subscription. Changes to `AnthropicProvider` do not affect it.

## Model discovery

`getAvailableLanguageModels()` calls `/v1/models` on the configured API base URL.
It follows the [Models API pagination](https://platform.claude.com/docs/en/api/beta/models/list)
cursor and uses each model's `display_name`. Discovery retries transient errors,
including Anthropic's 529 overload response, and honors `Retry-After` as described
in [Anthropic API errors](https://platform.claude.com/docs/en/api/errors).

There is no static fallback list. If discovery fails, the provider returns no
Anthropic models for that fetch. The curated entry in `recommended-models.ts`
is independent of discovery and must name an active model.

## Model lifecycle

Use Anthropic's [model deprecation table](https://platform.claude.com/docs/en/about-claude/model-deprecations)
before adding or changing a recommended model. Do not recommend a `-latest`
alias: it can move between snapshots and does not communicate a lifecycle date
or version. Anthropic's dateless ids from Claude 4.6 onward are pinned model
versions, not moving aliases.

When changing the recommendation:

1. Confirm the model is active and generally available.
2. Check that `@pydantic/genai-prices` recognizes its exact id.
3. Verify text, streaming, tool use, and configured thinking behavior.
4. Update the catalog test anchor in the same change.

## Compatibility checks

### Thinking

NodeTool uses manual thinking on models that accept `budget_tokens`:

```json
{ "thinking": { "type": "enabled", "budget_tokens": 4096 } }
```

This shape is not valid for every current model. The provider uses adaptive
thinking for models that require it. Anthropic's
[extended thinking guide](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
requires adaptive configuration for Claude Fable 5, Claude Mythos 5 and
Preview, Claude Opus 4.8 and 4.7, and Claude Sonnet 5. Sonnet 5 enables adaptive
thinking by default; Fable and Mythos do not allow thinking to be disabled.
Manual `budget_tokens` is deprecated but still accepted for Claude Opus 4.6 and
Claude Sonnet 4.6. Claude Haiku 4.5 also accepts manual thinking. Manual budgets
must be at least 1,024 tokens and less than `max_tokens`.

Tests must cover both streaming and non-streaming request shapes. Thinking with
tools must preserve signed thinking blocks unchanged across the tool-result turn.

### Sampling parameters

Anthropic rejects non-default `temperature`, `top_p`, and `top_k` on current
adaptive-only/default model families, including Claude Opus 4.7 and later,
Sonnet 5, Fable 5, and Mythos. The provider omits incompatible sampling
parameters according to Anthropic's
[parameter deprecation table](https://platform.claude.com/docs/en/about-claude/model-deprecations#api-parameter-deprecations).

### Stop reasons

Every successful Messages response has a `stop_reason`. Anthropic documents
`end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`,
and `model_context_window_exceeded` in its
[stop-reason guide](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons).

`pause_turn` requires another request with the assistant content preserved; the
provider continues these turns internally. A `refusal` is an HTTP 200 response
and may contain no content. Claude Fable 5 also returns `stop_details`. The
provider surfaces refusals and truncated output instead of treating them as a
normal completed answer.

### Tools and content

The provider maps NodeTool client tools to Anthropic `input_schema` definitions
without dropping supported schema constraints and maps `web_search` to
`web_search_20250305`. Anthropic still lists that web
search version as GA, alongside newer versions in the
[tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference).
The adapter also passes `strict`, `input_examples`, `cache_control`,
`defer_loading`, and `allowed_callers` when configured. Tool execution failures
are returned with Anthropic's `is_error` marker.

Image input supports JPEG, PNG, GIF, and WebP through inline base64 blocks.
Document input supports inline PDF data, HTTPS PDF URLs, and plain text, including
document titles, context, and citation configuration. See Anthropic's
[PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
for API limits. Uploaded Anthropic Files API ids are not part of NodeTool's shared
message contract. Citation ranges and source metadata remain structured on text
content; the provider does not append citation Markdown to Claude's text.

## Cost tracking

Claude token prices come from `@pydantic/genai-prices`. Check a new model id
before recommending it:

```bash
node -e "const {calcPrice}=require('@pydantic/genai-prices'); \
  console.log(calcPrice({input_tokens:1000,output_tokens:500},'claude-sonnet-5','anthropic'))"
```

Do not add Claude token prices to the local non-token modality table. Update the
upstream catalog or bump the dependency when it already contains the model.

Anthropic reports uncached input separately from cache reads and writes. The
provider adds those values before sending usage to the shared cost calculator.

## Verify

Run the focused catalog and provider tests first:

```bash
npm test --workspace=packages/runtime -- \
  --run tests/recommended-models.test.ts \
  tests/providers/anthropic-provider.test.ts \
  tests/providers/anthropic-provider-coverage.test.ts
```

Then run the required repository checks:

```bash
npm run typecheck
npm run lint
npm run test
```

With `ANTHROPIC_API_KEY` configured, inspect discovery and run a small request:

```bash
npm run dev:nodetool -- info --json
npm run dev:nodetool -- node run nodetool.llm.Claude \
  --props '{"prompt":"hello","model":"claude-sonnet-5","max_tokens":50}'
```
