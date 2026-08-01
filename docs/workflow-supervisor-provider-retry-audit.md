# Provider Transient-Retry Audit

**Status:** findings only — fixes land in `packages/runtime`, not in the supervisor.
**Last updated:** 2026-08-01
**Design:** [workflow-supervisor-design.md](workflow-supervisor-design.md) §10.3
**Plan:** [workflow-supervisor-implementation-plan.md](workflow-supervisor-implementation-plan.md) PR 1

The supervisor wakes only when a node's own error handling is exhausted (PRD
scenario 1). That premise is load-bearing: a provider without backoff turns
every 429 into an LLM decision costing real money, on a failure a 2-second wait
would have fixed. This audit establishes where the premise holds today.

## Where retry lives

`OpenAICompatClient.post` (`packages/runtime/src/providers/openai-compat/client.ts:114`)
is the only shared mechanism: 2 retries over `408/409/429/5xx` and network
errors, jittered exponential backoff 500ms → 8s, `Retry-After` honored and
bounded to 60s. Every OpenAI-compatible provider inherits it, and no subclass
overrides the budget.

The vendor SDKs supply their own: `openai` and `@anthropic-ai/sdk` default to
`maxRetries = 2`, `replicate` to 5. NodeTool overrides this in exactly one
place — `anthropic-provider.ts:470` disables SDK retry for `models.list` and
hand-rolls a better loop for it. Inference paths keep the defaults.

Three files re-implement `fetchWithRetry` and `Retry-After` parsing
independently (`openai-compat/client.ts:51`, `topaz-provider.ts:60`,
`atlascloud-provider.ts:73`, `anthropic-provider.ts:62`).

## Gaps

| Provider | Transient retry | Mechanism |
|---|---|---|
| openai, codex, anthropic | yes | vendor SDK, `maxRetries = 2` |
| the OpenAI-compat family (groq, mistral, xai, openrouter, together, vllm, lmstudio, …) | chat only | `OpenAICompatClient.post` |
| atlascloud, topaz | yes | compat client + local `fetchWithRetry` |
| replicate | partial | SDK; non-GET retries `429` only |
| claude agent sdk | opaque | SDK subprocess retries; `api_retry` events unobserved |
| **gemini, ollama** | **none** | raw `fetch` |
| **cohere, jina, voyage, huggingface, elevenlabs, fal, kie, reve, meshy, rodin** | **none** | raw `fetch` / SDK without retry |

Two structural holes beyond the table:

- **No provider resumes a stream that dies after the first byte**
  (`openai-compat/client.ts:107`). Retry covers connection setup only, so
  design §5.4's "threw after emitting" case is permanently non-retryable below
  the hook — which is why `end_stream` exists rather than a retry.
- **`base-provider.ts:1369` `isRateLimitError` is dead code** — tested, never
  called. Nothing classifies a 429 before it reaches the escalation path, and
  `generateLoop` (`base-provider.ts:844`) has no rate-limit handling at all.

## Follow-up work (runtime, not supervisor)

1. Extract the compat client's retry into one exported helper and re-point the
   three duplicate `fetchWithRetry`s and four `Retry-After` parsers at it.
2. Wrap Gemini's and Ollama's chat entry points in it. These are first-class
   chat providers reachable by the supervisor, and today every 429 from them
   becomes an escalation.
3. Extend to the embedding and media providers with none, keeping
   non-idempotent POSTs excluded the way `atlascloud-provider.ts:188` documents.
4. Use or delete `isRateLimitError`.
5. Surface retry attempts as telemetry — including the agent SDK's `api_retry`
   — so a supervised run can tell "waited and recovered" from "failed at once".
