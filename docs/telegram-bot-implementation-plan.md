# Telegram Bot Integration — Implementation Plan

**Design:** [telegram-bot-design.md](telegram-bot-design.md)
**Status:** Draft — for review
**Last updated:** 2026-08-18

Six milestones. M1–M3 track the design's phases 1–3 and produce a bot worth shipping; M4–M6 are the deliberate follow-ons (groups, Discord, triggers). Each milestone lists its tasks with owning files and a **done-when** that is checkable, and closes with exit criteria — the milestone is not done until every one holds. Task ids (`T1.4`) are for PR references; one task is roughly one reviewable PR-sized change, and tasks inside a milestone are ordered by dependency.

Verification baseline for every task, per [AGENTS.md](../AGENTS.md): `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:packages` (or the packages `nodetool affected` names), and any new check must be proven able to fail before it counts.

---

## M1 — Identity layer (server)

The provider-generic linking + delegated-token surface. Everything else depends on it, and it is testable with no Telegram account.

| # | Task | Files | Done when |
|---|---|---|---|
| T1.1 | `external_identities` table + model. Drizzle schema `{id, provider, external_id, user_id, linked_at}`, unique `(provider, external_id)`; `ExternalIdentity` DBModel with `findByExternal(provider, externalId)`, `listForUser(userId)`, `link(...)`, `unlink(provider, externalId)`; migration. | `packages/models/src/schema/external-identities.ts`, `packages/models/src/external-identity.ts` | Vitest CRUD suite passes; linking the same `(provider, external_id)` twice replaces, not duplicates; migration applies on a fresh DB. |
| T1.2 | Delegated tokens. HMAC-signed token (`user_id`, `expires_at`, master key from `@nodetool-ai/security`); `DelegatedTokenProvider extends AuthProvider` chained **before** the configured provider in the server's auth hook; 1 h TTL. | `packages/auth/src/providers/delegated-token-provider.ts`, wiring in `packages/websocket/src/server.ts` | A minted token authenticates on `/trpc` and `/ws` as the mapped user; an expired or tampered token falls through to the next provider and is rejected; unit tests cover both, including the failure being provoked (flip one byte, shift the clock). |
| T1.3 | Integration routes. `POST /api/integrations/:provider/link/start`, `/link/complete`, `/token`, `DELETE /link`; guarded by `NODETOOL_INTEGRATION_TOKEN` (constant-time compare); routes absent when the env var is unset; link codes single-use, 10-minute TTL; `/token` refuses in local single-user trust mode per design §9. | `packages/websocket/src/routes/integrations.ts`, zod bodies in `http-body-schemas.ts` | Route tests: happy path mints a working token; wrong service token → 401; unknown `external_id` → 404; reused code → 410; unset env var → 404 on every route. |
| T1.4 | Link confirmation page + settings entry. Minimal signed-in confirmation page ("Link Telegram account `<name>`?") for bot-initiated links; **Connect Telegram** card on Settings → Integrations that mints a code and renders the `t.me/<bot>?start=<code>` deep link; unlink from the same card. | `web/src/components/settings/` (ui_primitives only), one `trpc` router addition | Playwright-free Jest tests for the card states (unlinked / code pending / linked); the confirmation page names the external account; design tokens and primitives pass `npm run lint`. |

**Exit criteria**

- A scripted test links a fake `telegram:12345` to a user, exchanges the service token for a delegated token, opens a `ChatSocket` with it, runs one `chat_message` turn on a fake provider, and reads the thread back over tRPC **as that user only** — a second user's token cannot see it.
- `docs/configuration.md` documents `NODETOOL_INTEGRATION_TOKEN`.

## M2 — Bridge core (`packages/telegram`)

The bot process, private-chat-only, long polling, streaming UX. Pure modules first, adapter last, so every task lands with its tests.

| # | Task | Files | Done when |
|---|---|---|---|
| T2.1 | Package scaffold. Workspace `packages/telegram` (`@nodetool-ai/telegram`), deps `@nodetool-ai/sdk` + `ws` only, tsconfig referencing `../sdk`, `bin`, vitest config; registered in root `workspaces`. | `packages/telegram/*` | `npm run build:packages` builds it in order; `npm run check` passes; importing `@nodetool-ai/agents` from the package fails the build (proven once, then reverted). |
| T2.2 | Config. Env + optional `telegram-bot.json`, zod-validated at the boundary (`TELEGRAM_BOT_TOKEN`, `NODETOOL_API_URL`, `NODETOOL_INTEGRATION_TOKEN`, webhook vars; `allowUsers`, `editThrottleMs`, `maxQueuedTurns`). | `src/config.ts` | Invalid config fails fast with the field named; defaults match design §11. |
| T2.3 | Chunker + markdown→HTML. 3800-char splitter that never breaks inside a code fence or entity; agent-markdown → Telegram HTML for the safe subset, plain-text fallback on anything unconvertible. | `src/chunk.ts`, `src/markdown-html.ts` | Property-style vitest suites: no emitted chunk exceeds 4096 after HTML escaping; round-trip samples with nested fences, links, `<`/`&` in prose; fallback path exercised. |
| T2.4 | FrameRenderer. Pure fold of `ProcessingMessage` frames → `RenderPlan` ops per design §6: stream-message lifecycle, status line (latest tool wins), 1500 ms coalescing, rollover, finalize, error, `output_update` attachments. | `src/frame-renderer.ts` | Scripted frame sequences (chunk storm, tool-then-text, error mid-stream, resume replay with duplicate seqs) produce the expected op lists; throttle verified with injected clock — no `Date.now()` in the pure core. |
| T2.5 | IdentityClient. Resolve `telegram_user_id` → delegated token via M1 routes, cache to expiry minus slack, link/complete/unlink calls, `/start <code>` payload handling. | `src/identity-client.ts` | Fake-server tests: cache hit/miss, expiry re-mint, 404 → link-prompt signal, complete with used code surfaces the 410 message. |
| T2.6 | TurnRouter. Per-user `ChatSocket` ownership, per-conversation turn serialization + capped queue (default 3), thread-id derivation `telegram-<chatId>-<uid8>-<n>` with highest-`n` recovery via `threads.list`, reconnect → re-mint → `resume_chat {last_seq}`. | `src/turn-router.ts` | Fake-socket tests: interleaved users don't block each other; queue overflow answers busy; kill-socket-mid-turn resumes without duplicated render ops; restart recovery picks the highest existing `n`. |
| T2.7 | TelegramAdapter. Raw Bot API client (`getUpdates` long polling, PID guard; `sendMessage`/`editMessageText`/`sendChatAction`/`answerCallbackQuery`), private-chat + command routing, unlinked-user prompt, group messages declined once, 429 `retry_after` honored, superseded edits dropped. | `src/telegram-adapter.ts` | Adapter tests against a recorded fake Bot API: routing matrix (linked/unlinked × private/group/command), 429 backoff, edit coalescing; no real network in tests. |
| T2.8 | Commands + stop. `/start`, `/link`, `/unlink`, `/new`, `/stop`, `/status`; `setMyCommands` registration as a separate entry point; inline ⏹ Stop button on the status message wired to `stop(threadId)`. | `src/register-commands.ts`, command handling in adapter | Each command's handler covered; `register-commands` is idempotent; stop during a fake turn renders `⏹ stopped`. |
| T2.9 | Entry points. `startTelegramBot`/`stopTelegramBot`; `bin` for `npx @nodetool-ai/telegram`; CLI `nodetool telegram serve` + `nodetool telegram register-commands` wrapping them. | `src/index.ts`, `packages/cli/src/commands/telegram.ts` | `nodetool telegram serve` against a fake token fails with the Bot API's error, not a stack trace; CLI help lists both commands. |
| T2.10 | Harness registry entry. `telegram-bridge` harness whose keyless selfcheck runs the T2.3–T2.6 suites; surface mapping for `packages/telegram/**`. | `packages/cli/src/harness/registry.ts` | `nodetool harness audit` shows the surface covered; `harness gate` on a diff touching `packages/telegram` runs the selfcheck; the check proven able to fail (break one renderer expectation, watch it go red, restore). |

**Exit criteria**

- End-to-end against a **real** Telegram test bot and a local server in Supabase-mode test config: link via deep link, send "hello", watch streamed edits and the tool status line, `/new`, `/stop` mid-turn, kill the bridge mid-turn and see the resumed turn complete. Recorded once as a manual checklist in the PR description (this is the one loop CI cannot own).
- `npm run check` green; `harness gate --base main` on the branch runs the `telegram-bridge` selfcheck.
- **Milestone M2 = shippable v1** for self-hosted single-user servers (link short-circuits per design §9).

## M3 — Files, voice, workflows, preferences, webhook

Everything that turns the text loop into the full product surface.

| # | Task | Files | Done when |
|---|---|---|---|
| T3.1 | Inbound photos → image content parts (`getFile` download, size cap respected). | adapter | A photo message reaches the provider as an image part in the fake-server test; >20 MB answers the platform's limit plainly. |
| T3.2 | Inbound documents → user assets on the delegated token, described in content as `asset://` (never Bot-API file URLs — they embed the bot token, design §8). | adapter, `identity-client` | Asset appears under the linked user; the content string contains no `api.telegram.org` URL (asserted in test). |
| T3.3 | Voice notes → server `transcribe_audio` → text turn, with the transcript quoted in the reply for confirmation. | adapter, turn-router | Fake-transcription test; unsupported codec answers plainly. |
| T3.4 | Outbound assets: `sendPhoto`/`sendDocument` ≤ 50 MB, else the server URL line. | adapter, renderer | Renderer emits attach ops with size decision; adapter test covers both branches. |
| T3.5 | `/workflow <id> [params]` → `workflow_target: "workflow"` turns; ownership enforced server-side; param parsing errors answered before spending a turn. | commands | Running another user's workflow id fails with the server's error relayed; params round-trip in the fake-server test. |
| T3.6 | `/model` persisted server-side per user (settings via tRPC), read back on every turn. | commands, turn-router | Preference survives a bridge restart in test. |
| T3.7 | Thread-title sync after first turn. | turn-router | Title visible via `threads.get` in test; failures are logged, never fatal. |
| T3.8 | Webhook mode: HTTPS route, `X-Telegram-Bot-Api-Secret-Token` verification, `setWebhook`/`deleteWebhook` on start/stop, `--webhook` flag; polling remains default. | adapter, `src/index.ts` | Webhook delivery with wrong secret → 403 (test); mode switch documented; both modes share the routing matrix suite. |

**Exit criteria**

- The M2 manual checklist re-run extended with: send a photo, send a PDF, send a voice note, `/workflow`, `/model`, restart bridge, all green.
- **Milestone M3 = shippable multi-tenant v1** for the hosted server (webhook mode).

## M4 — Approvals

| # | Task | Files | Done when |
|---|---|---|---|
| T4.1 | Render `tool_approval_request` as inline keyboard (allow / allow for chat / deny); answer with `tool_approval_response`; decision timeout renders as denied. | renderer, adapter | Scripted approval round-trip in the fake-socket suite; unanswered request times out to deny. |
| T4.2 | `permission_mode` configurable (global default + per-user override via `/mode`), `auto` remains default; design §9 caveat updated. | config, commands | Mode `default` runs a write tool only after the button tap in test. |

**Exit:** a `default`-mode turn is usable end to end from Telegram; the design doc's §9 caveat paragraph is rewritten to point here.

## M5 — Groups

Scope decided at milestone start per design §13: pick the ownership rule (linker-pays vs per-sender threads) with a short ADR appended to the design doc **before** code. Tasks (mention/reply activation under group-privacy mode, per-group config, context seeding) are enumerated then — writing them now would pretend a decision that has not been made.

**Exit:** ADR merged; group activation matrix covered by tests; the M2 checklist gains a group section.

## M6 — Discord adapter + shared core

| # | Task | Done when |
|---|---|---|
| T6.1 | Extract `identity-client`, `turn-router`, `frame-renderer`, `chunk` to `packages/messaging-bridge`; `packages/telegram` consumes it with zero behavior change. | The T2 suites move with the code and stay green; `packages/telegram`'s diff is imports only. |
| T6.2 | `packages/discord` per the Discord revision of the design (git history): gateway client, thread-per-conversation UX, 2000-char chunking, user-install app; `provider: "discord"` on the untouched identity routes. | Discord's own adapter suite + the shared-core suites green; the M2-style manual checklist run against a Discord test bot. |

**Exit:** two adapters on one core; the shared package exists because two consumers do.

---

## Milestone summary

| Milestone | Delivers | Depends on |
|---|---|---|
| M1 | Identity: linking + delegated tokens, settings UI | — |
| M2 | **v1 bot**: private chat, streaming, commands, harness | M1 |
| M3 | **Hosted v1**: files, voice, workflows, prefs, webhook | M2 |
| M4 | Interactive approvals | M2 |
| M5 | Groups (ADR first) | M3 |
| M6 | Discord on shared core | M3 |

M4 and M5/M6 are independent of each other; M4 can land in parallel with M3.
