# Telegram Bot Integration — Technical Design

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-18
**Reference:** [georgi/claude-pipe](https://github.com/georgi/claude-pipe) — a Telegram/Discord/CLI bridge onto a coding-agent SDK, whose channel-adapter and progress-editing patterns this design reuses. Its Telegram channel is raw `fetch` against the Bot API with zero dependencies, which this design follows.

---

## 1. Summary

A Telegram bot that gives Telegram users access to NodeTool's unified agent loop, **multi-tenant from the start**: each Telegram user links their own NodeTool account once (`/link`), and from then on every message to the bot is a turn in that user's own chat threads — their tools, their assets, their secrets, their budget. Streaming text, visible tool activity, and generated files come back into the chat.

Telegram is the first platform because it is the cheapest one that proves the whole design. Bots are DM-first by nature — users message a bot directly, no server/guild to join, no install mode — so the conversation-ownership question that makes group chat hard (whose account runs, whose budget pays, whose data the agent may touch) does not arise: **v1 handles private chats only**, where the answer is always the one linked human in the chat. There is no gateway WebSocket, no privileged intents, no platform verification program: the Bot API is plain HTTPS, consumable by long polling or a webhook. Groups are deferred (§13, phase 4), and Discord follows as a second adapter on the same core (§13, phase 5).

The bot is a **bridge process, not a second agent runtime**. It ships as `packages/telegram` (`@nodetool-ai/telegram`), depends on `@nodetool-ai/sdk` (and nothing platform-specific — the Bot API is called with `fetch`), and talks to a running NodeTool server over the existing `/ws` chat protocol. It owns exactly two translations: Telegram updates → `chat_message` commands, and `ProcessingMessage` frames → Telegram messages. The agent loop, tools, permissions, thread persistence, per-user cost tracking, and credit gating are the server's, unchanged. The one server-side addition this design requires is the identity layer in §5: an external-identity table and two routes for linking and delegated tokens — deliberately provider-generic, so the later Discord adapter reuses them untouched.

## 2. Design goals

- **D1. Zero new agent surface.** The bot reaches the same `UnifiedWebSocketRunner` chat path the web UI uses (`chat_message` / `resume_chat` over `/ws`). No forked loop, no second toolbelt assembly, no drift.
- **D2. Tenant isolation is the server's, not the bot's.** Every turn runs on a token scoped to the sender's NodeTool user, so thread history, assets, memories, secrets, and the credit gate isolate per user by the server's existing rules. The bot never enforces isolation itself — it only presents the right identity.
- **D3. The bot holds no user credentials.** One service token identifies the bot to the server; per-user access is a short-lived delegated token the server mints per connection from its own Telegram↔user mapping. A compromised bot host leaks the service token (revocable, mints nothing without the server) — not a store of user tokens.
- **D4. One conversation, one thread, both sides.** A private chat maps to NodeTool threads owned by the linked user, so conversations are resumable from the web UI, the CLI, and Telegram alike, and survive bot restarts — the bot keeps no conversation state.
- **D5. Small dependency cone.** The bot process needs no database, no secret store, no native modules, and no Telegram SDK — `@nodetool-ai/sdk` + `ws` + `fetch`. It can run on a different machine than the server.
- **D6. Fail visible, recover silent.** A dropped WebSocket resumes the in-flight turn via `resume_chat {thread_id, last_seq}`; a dead server produces one status message in the chat, not silence.
- **D7. Headlessly drivable.** The frame renderer, update routing, and link flow are pure modules exercised by a fake-Telegram/fake-socket harness ([docs/HARNESS_FIRST.md](HARNESS_FIRST.md)); the Bot API calls are the only part a test cannot own, and even those fake cleanly because the adapter's HTTP surface is eight methods.
- **D8. Platform-agnostic core.** Only the adapter knows Telegram. Renderer, router, identity, and chunking are written against neutral types so the Discord adapter (phase 5) is a second implementation of one interface, not a fork — the lesson taken directly from claude-pipe's `Channel` contract.

Non-goals for v1: group chats and channels (phase 4); Discord (phase 5); voice/video calls; inline mode (`@bot query` in other chats); Telegram Stars/payments; per-group configuration.

## 3. Architecture

```
Telegram Bot API (HTTPS)                     NodeTool server
  getUpdates / webhook                               │
        │                                            │
        ▼                                            │
┌──────────────────┐    InboundTurn    ┌──────────────────────┐
│ TelegramAdapter  │ ────────────────▶ │ TurnRouter           │
│ (raw Bot API,    │                   │  per-user ChatSocket │
│  private chats,  │ ◀──────────────── │  + delegated token   │
│  commands)       │    RenderPlan     └──────────┬───────────┘
└──────────────────┘                              │
        ▲                                         │ chat_message / resume_chat
        │ sendMessage / editMessageText /         │
        │ sendDocument / sendChatAction ┌─────────▼───────────┐
        └───────────────────────────────│ @nodetool-ai/sdk    │
                                        │ ChatSocket (/ws,    │
                                        │ msgpack, ?token=)   │
                                        └─────────────────────┘

Identity (server-side, §5):
  bot ── service token ──▶ POST /api/integrations/telegram/token ──▶ delegated user token
  user ── /link ──▶ one-time URL ──▶ signed-in web session ──▶ external_identities row
       (or t.me/<bot>?start=<code> deep link, started from the NodeTool settings page)
```

One Node.js bridge process, four modules:

- **TelegramAdapter** (`src/telegram-adapter.ts`) — owns the Bot API. Consumes updates (long polling by default, webhook mode for hosted deployments), accepts private-chat messages and commands, rejects everything else, downloads attachments via `getFile`, and executes `RenderPlan`s (`sendMessage`, `editMessageText`, `sendDocument`/`sendPhoto`, `sendChatAction`). All Telegram knowledge — update shapes, parse mode, retry on 429 with `retry_after` — lives here.
- **IdentityClient** (`src/identity-client.ts`) — resolves a Telegram user id to a delegated NodeTool token via the server's integration routes (§5), with an in-memory cache keyed by token expiry. Also drives the link/unlink flows, including the `/start <code>` deep-link payload.
- **TurnRouter** (`src/turn-router.ts`) — owns one `ChatSocket` per Telegram user with an in-flight turn, authenticated with that user's delegated token. Serializes turns per conversation (a second message while a turn runs is queued, mirroring the server's own `chatTurnRegistry` per-thread lock), forwards frames to the renderer, and handles reconnect/resume — including re-minting an expired delegated token before reconnecting.
- **FrameRenderer** (`src/frame-renderer.ts`) — pure function domain: folds `ProcessingMessage` frames (`chunk`, `tool_call_update`, `message`, `output_update`, `error`, `job_update`) into a `RenderPlan` (create/edit/finalize/attach operations), applying Telegram's 4096-char limit and an edit-rate throttle. No I/O, no Telegram types — the adapter maps plan operations onto Bot API calls.

This is claude-pipe's bus/adapter/loop split with the agent loop replaced by a socket, plus an identity module claude-pipe never needed (it is single-user by construction).

### Update ingestion: polling and webhook

`getUpdates` long polling is the default: zero inbound network requirements, right for self-hosted deployments. It is single-consumer per bot token, so the bridge is one process in this mode; a PID guard (as in claude-pipe) prevents a second instance from silently stealing updates. For the hosted deployment, **webhook mode** (`setWebhook` onto an HTTPS route the bridge serves) removes that constraint and scales horizontally behind a load balancer — the bridge is stateless (D4), so any instance can serve any update, with per-user turn serialization living in the server's `chatTurnRegistry` rather than bridge memory. `nodetool telegram serve --webhook <url>` switches modes; the webhook secret token (`X-Telegram-Bot-Api-Secret-Token`) is verified on every delivery.

## 4. Conversation model

### Activation

The bot answers exactly two things:

1. **Private-chat messages from linked users** — every message is a turn.
2. **Commands** — `/start`, `/link`, and `/status` work for anyone; the rest require a linked account.

A message from an unlinked user gets one reply: what the bot is, and a `/link` prompt. Group messages are ignored in v1 — the bot additionally sets its Bot API group-privacy mode on and declines group membership gracefully (replies once with "I work in private chat for now" and leaves configuration of anything group-shaped to phase 4). An optional `allowUsers` list further restricts who may even link, for closed deployments.

### Thread identity

A private chat is a permanent channel, not one conversation, so the chat maps to a **sequence** of NodeTool threads: the derived id is `telegram-<chatId>-<uid8>-<n>`, where `n` starts at 1 and `/new` increments it. `<uid8>` is a short hash of the NodeTool user id: thread ids are globally unique across users, so a purely chat-derived id would let one tenant occupy an id another tenant's derivation produces (a chat can be re-linked to a different account, and chat ids are not secret) — the hash makes cross-tenant id collision structurally impossible rather than merely unlikely. The current `n` is recoverable without bot-side state: on the first turn after a restart, the bot lists the user's threads via tRPC (`threads.list`, filtered by the id prefix) and resumes the highest `n`.

The server creates thread rows lazily from client-supplied ids (`ensureThreadExists` in `packages/websocket/src/unified-websocket-runner.ts`), always under the authenticated user — so the thread belongs to the linked account and appears in that user's web-UI thread list.

Because a private chat has one human and the server-side thread has the full history, there is **no context seeding** — claude-pipe's channel-history block exists to import a shared channel's conversation, which v1 does not have.

Thread titles: after the first turn, the bot calls `trpc.threads.update` (as the user, on the delegated token) to set a title from the first message, so the conversation is findable in the web UI.

## 5. Identity: linking and delegated tokens

This is the one part of the design that adds server surface. It lives in `packages/websocket` (routes) and `packages/models` (table), and is provider-generic by construction — `provider` is a column, not a route family per platform — so the phase-5 Discord adapter adds a string, not a schema.

### Data model

```sql
external_identities (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,          -- "telegram" (later: "discord")
  external_id   TEXT NOT NULL,          -- Telegram user id
  user_id       TEXT NOT NULL,          -- NodeTool user
  linked_at     TEXT NOT NULL,
  UNIQUE(provider, external_id)
)
```

One NodeTool user may link several Telegram accounts; one Telegram account maps to exactly one NodeTool user.

### Link flow

Two directions, one table row either way:

**Bot-initiated (`/link`):**

1. The bot calls `POST /api/integrations/telegram/link/start {external_id}` with its **service token** (`NODETOOL_INTEGRATION_TOKEN`, a dedicated static token the server recognizes as the messaging integration — not a user token). The server stores a one-time link code (10-minute TTL) and returns a URL.
2. The bot sends the user the URL. The user opens it, signs in to NodeTool normally (Supabase mode: their real account; local mode: user "1"), and confirms "Link Telegram account `<name>`?" on a minimal confirmation page.
3. Confirming writes the `external_identities` row. The pending code is single-use; an unconfirmed code expires.

**Web-initiated (deep link):** the NodeTool settings page ("Connect Telegram") mints the same one-time code for the signed-in user and renders `https://t.me/<bot>?start=<code>`. Pressing **Start** in Telegram delivers `/start <code>` to the bot, which completes the link via `POST /api/integrations/telegram/link/complete {external_id, code}` (service token). This direction has less friction — no mid-chat URL to trust — and the confirmation is implicit in who minted the code while signed in.

`/unlink` deletes the row (bot-initiated, service token, scoped to that `external_id`), and the settings page offers unlink to the signed-in user.

The user's browser session does the authentication in both directions, so the bot never sees a password, an OAuth code, or a long-lived user credential.

### Delegated tokens

Per connection, the bot exchanges identity for access: `POST /api/integrations/telegram/token {external_id}` with the service token returns `{token, expires_at, user_id}` — a short-lived (1 h) token that authenticates as the linked user on `/ws`, `/trpc`, and asset URLs. Unlinked `external_id` → 404, and the bot renders the link prompt.

Implementation slots into the existing `AuthProvider` seam: delegated tokens are signed server-side (HMAC over `user_id` + expiry with the master key from `@nodetool-ai/security`) and verified by a `DelegatedTokenProvider` chained before the configured provider, so no token table and no cleanup job. Revocation is coarse but sufficient: unlinking removes the mapping, so no new tokens mint, and outstanding ones die within the hour; rotating the master key kills them instantly.

The integration routes are enabled only when `NODETOOL_INTEGRATION_TOKEN` is set; a server without it exposes none of this surface.

## 6. Turn lifecycle

Inbound, per private-chat message:

1. `IdentityClient.resolve(telegramUserId)` → delegated token (cached until near expiry) or the link prompt.
2. Build content: message text plus the attachment section (§8). A voice note becomes text via the server's own `transcribe_audio` command in phase 2; until then it gets a "voice notes arrive in phase 2" reply.
3. `TurnRouter.submit(user, conversation, content)`. If a turn is already running for this conversation the message queues; queue depth is capped (default 3), overflow gets a "still working on the previous message" reply.
4. The router ensures a connected `ChatSocket` for this user and sends:

```ts
socket.send({
  threadId: conv.currentThreadId,     // telegram-<chatId>-<uid8>-<n>
  text: content,
  provider: prefs.provider,           // per-user override or server default
  model: prefs.model,
  agentMode: true,
  permissionMode: "auto"              // §9
});
```

Outbound, per frame (all folding in FrameRenderer, all I/O in TelegramAdapter):

| Frame | Telegram effect |
|---|---|
| first `chunk` | create the **stream message** (`sendMessage`); also `sendChatAction("typing")` until then, refreshed every 5 s (typing indicators expire) |
| later `chunk` | append to buffer; `editMessageText` at most every 1500 ms; past 3800 chars, finalize the current message and start a new one (headroom under the 4096 limit for formatting entities — the same constant claude-pipe converged on) |
| `tool_call_update` / `tool_call` | one **status line** message (`🔧 web_search — "quickjs sandbox"`), edited in place per tool; replaced by the stream message when text starts; `✅`/`❌` on completion |
| `task_update`, `planning_update`, `node_update` | folded into the status line (latest wins), never separate messages |
| `message` (final assistant) | finalize: edit the stream message to the final content's tail chunk, send remaining chunks |
| `output_update` / saved assets | fetch via the delegated token, send as `sendPhoto`/`sendDocument` (≤ 50 MB; larger files become a link to the server's asset URL: `📎 too large for Telegram: <url>`) |
| `error` | replace status/stream with `⚠️ <message>`; the turn ends |
| `job_update` (workflow-target runs) | status line only |

**Formatting:** the agent emits markdown; Telegram's MarkdownV2 parse mode is escape-hostile (every `.`, `-`, `(` in prose must be escaped), so the renderer converts the safe subset — bold, italic, inline code, code blocks, links — to Telegram **HTML parse mode** instead, which only needs `<`, `>`, `&` escaped. A message the conversion cannot make valid falls back to plain text; a turn never fails on formatting.

**Rate discipline:** edits are throttled per conversation (1500 ms) and coalesced. The Bot API answers 429 with `retry_after`; the adapter honors it and drops superseded intermediate edits rather than replaying them (only the latest buffered content matters).

### Interrupt and disconnect

- `/stop` — or tapping the inline **⏹ Stop** button the bot attaches to the status message — sends `stop(threadId)`; the server emits `generation_stopped`, rendered as `⏹ stopped`. In a private chat the sender is necessarily the owner, so no permission check is needed. (Inline keyboards are a first-class Bot API primitive; the stop button costs nothing and previews the phase-3 approval buttons.)
- On socket drop mid-turn: re-mint the delegated token if expired, reconnect with backoff (the SDK's `ChatSocket` already does this), then `resume_chat {thread_id, last_seq}` replays missed frames into the same renderer state. Only after resume also fails does the chat get one `⚠️ lost connection to NodeTool` message.

## 7. Commands

Registered once via `setMyCommands` (so they autocomplete in the Telegram UI), handled entirely in the bot — they never reach the LLM:

| Command | Effect |
|---|---|
| `/start [code]` | welcome + link state; with a deep-link payload, completes web-initiated linking (§5) |
| `/link` / `/unlink` | account linking (§5) |
| `/new` | rotate this chat onto a fresh NodeTool thread |
| `/stop` | cancel the in-flight turn |
| `/model [id]` | show or set this user's model override (stored server-side in the user's settings via tRPC, so it survives bot restarts) |
| `/workflow <id> [params]` | run a turn with `workflow_target: "workflow"` against one of **the user's own** saved workflows — the server's workflow-chatbot path enforces ownership |
| `/status` | bot → server connectivity, link state, provider/model in effect, queue depth |

## 8. Attachments

**Inbound:** a Telegram attachment is a `file_id`; the bot resolves it with `getFile` and downloads from the Bot API file endpoint (bot-side download capped at 20 MB by the platform). Photos are passed as image content parts on the chat message (the server's `resolveContentForProvider` inlines them for the provider). Documents are uploaded to the user's NodeTool assets on the delegated token and described in the content (`[Attached file: report.pdf, 1.2 MB, asset://…]`) so the agent reaches them with its normal asset tools — unlike Discord's public CDN URLs, Telegram file URLs embed the bot token, so they must never be handed to the agent as fetchable links. Voice notes: phase 2, via the server's `transcribe_audio`.

**Outbound:** asset references on the final message and `output_update` frames are fetched from the server on the delegated token and sent as photos/documents (≤ 50 MB upload). Over the limit, the bot posts the asset's server URL instead — useful only where users can reach the server, so it is stated plainly rather than pretended around.

## 9. Security and access control

- **Tenant isolation** is delegated-token deep, not bot deep (D2): thread listing, asset fetches, workflow runs, collections, secrets, the credit gate, and cost attribution all execute server-side as the linked user. The bot contains no cross-tenant code path to get wrong.
- **Credentials.** The bot's env carries two secrets: the Telegram bot token and the NodeTool service token. Per-user tokens are short-lived, in-memory only (D3). Provider API keys stay in the server's secret store, per user. The bot token additionally leaks through file URLs (§8), which is why inbound files are re-homed as assets instead of passed as links.
- **Server exposure.** Multi-tenant means the server runs in Supabase (or another enforcing) auth mode; the integration routes refuse to start-link when the server is in local single-user mode with localhost trust, because "link any Telegram user to user 1" is not linking. Local mode remains supported for the personal-deployment case, where every chat is user "1" and `/link` replies "this server is single-user; you're already in".
- **Permission mode.** Turns run with `permission_mode: "auto"`: there is no interactive approver on this surface, and the server's `default` mode would park every write/execute tool on a `tool_approval_request` forever. In the multi-tenant frame this is materially safer than a shared-account design — the tools act on the sender's own data under the sender's own budget — but it is still the most consequential setting and sits at the top of the config with a comment. Phase 3 maps approval requests onto inline-keyboard buttons and makes the mode configurable.
- **Prompt injection.** Private-chat-only v1 has no channel-history or co-participant vectors: every byte the agent sees was typed or attached by the account owner it acts as. The residual risks are the ones NodeTool already owns server-side (fetched web content, attachment contents).
- **Abuse.** Linking is the admission gate (optionally allowlisted); per-user rate limiting beyond the turn queue is the server's credit gate doing its normal job. The link URL is the one phishing-shaped artifact, so the confirmation page names the Telegram account being linked, the code is single-use with a 10-minute TTL — and the web-initiated deep link avoids mid-chat URLs entirely, so it is the flow the docs lead with.
- **Update authenticity.** Long polling is authenticated by the bot token; webhook mode verifies `X-Telegram-Bot-Api-Secret-Token` on every delivery and rejects everything else.

## 10. Global deployment

One official bot can serve the hosted NodeTool cloud globally: the bridge is multi-tenant and stateless, so "global" is one bridge deployment pointed at `api.nodetool.ai` in webhook mode (horizontally scalable, §3), one `@NodeTool` bot username, and nothing else. Telegram imposes no guild caps, verification program, or privileged-intent review — the platform frictions that complicate the equivalent Discord rollout do not exist here.

Self-hosted servers each register their own bot with @BotFather (a two-minute step) and run the bridge next to their server in polling mode. A central relay — the official bot fronting third-party servers — is rejected for the same reason as a bot-side token store (§12): it would make NodeTool-operated infrastructure a credential holder and traffic hub for servers it does not run. The code is identical in both cases — same package, different `TELEGRAM_BOT_TOKEN`/`NODETOOL_API_URL`.

## 11. Configuration

Bridge process, env-first:

```
TELEGRAM_BOT_TOKEN           required (from @BotFather)
NODETOOL_API_URL             default http://127.0.0.1:7777
NODETOOL_INTEGRATION_TOKEN   required (the bot's service token; also set on the server)
TELEGRAM_WEBHOOK_URL         optional; set = webhook mode, unset = long polling
TELEGRAM_WEBHOOK_SECRET      required in webhook mode
```

```jsonc
// telegram-bot.json (optional)
{
  "allowUsers": [],            // Telegram user ids allowed to link; empty = anyone
  "editThrottleMs": 1500,
  "maxQueuedTurns": 3
}
```

Server: `NODETOOL_INTEGRATION_TOKEN` enables the `/api/integrations/telegram/*` routes (§5).

## 12. Package layout and entry points

```
packages/telegram/
  package.json          # @nodetool-ai/telegram — deps: @nodetool-ai/sdk, ws
  tsconfig.json         # references: ../sdk
  src/
    index.ts            # startTelegramBot(config), stopTelegramBot — the programmatic surface
    config.ts           # env + json loading, zod-validated at the boundary
    telegram-adapter.ts # Bot API client + update routing (polling and webhook)
    identity-client.ts
    turn-router.ts
    frame-renderer.ts   # pure: frames → RenderPlan
    chunk.ts            # 3800-char splitter (port of claude-pipe text-chunk)
    markdown-html.ts    # pure: agent markdown → Telegram HTML parse mode
    register-commands.ts # setMyCommands
  tests/                # vitest: renderer folding, chunker, md→HTML, routing,
                        # link flow, resume replay
```

Server-side additions land in their owning packages: `external_identities` in `packages/models`, the integration routes and `DelegatedTokenProvider` wiring in `packages/websocket` / `packages/auth`.

Two ways to run the bridge:

- `npx @nodetool-ai/telegram` (a `bin` in the package) for standalone deployment next to any server.
- `nodetool telegram serve` / `nodetool telegram register-commands` in the CLI — thin wrappers over `startTelegramBot`, consistent with how the CLI fronts the other harnesses. Command registration is explicitly separate from serving, as in claude-pipe: it is a deploy step, not a boot step.

The dependency-cone rule (D5) is enforced structurally: `packages/telegram` references only `packages/sdk` in its tsconfig, so an import of `@nodetool-ai/agents` or `@nodetool-ai/models` fails the build.

**Shared core:** `identity-client`, `turn-router`, `frame-renderer`, and `chunk` contain nothing Telegram-specific. They stay in `packages/telegram` for v1 — extracting a shared package for one consumer is premature — and move to a `packages/messaging-bridge` core when the Discord adapter lands (phase 5), which is the moment two consumers exist to keep it honest.

## 13. Alternatives considered

- **In-process agent loop** (import `processChat` + `createChatCodeActSession`, the way `packages/cli/src/stdin.ts` does). Rejected: the bot would own the DB, secret store, toolbelt assembly, and native modules, duplicate the server's credit gate and turn registry, and — fatally for multi-tenancy — would have to re-implement per-user isolation the server already enforces.
- **OpenAI-compatible endpoint** (`POST /v1/chat/completions`). Rejected: a stateless provider passthrough — no threads, no agent toolbelt, no per-user anything.
- **Bot-side token store** (bot keeps long-lived per-user tokens after linking). Rejected for D3: it turns the bridge into a credential vault, needs encrypted storage and revocation plumbing, and breaks the stateless-bridge property. The service-token + delegated-token exchange keeps all credentials and the identity mapping on the server.
- **A Telegram SDK** (grammY, telegraf). Rejected: claude-pipe's adapter demonstrates the needed surface is ~8 Bot API methods over `fetch`; an SDK adds a dependency tree and its own update-loop abstractions for no coverage this design uses. Revisit if inline mode or payments ever land.
- **Group chats in v1** (group belongs to whoever linked it; co-participants' messages run on that account, or fragment into per-sender threads). Deferred: both ownership rules are defensible and both are surprising — one bills the linker for other people's prompts, the other splits one visible conversation into invisible parallel contexts. Telegram's group-privacy mode adds a third wrinkle (the bot only sees mentions/replies unless privacy is disabled). Private-chat-only sidesteps all of it until the identity layer is proven; phase 4 decides deliberately.
- **MarkdownV2 parse mode.** Rejected for HTML: MarkdownV2 requires escaping most ASCII punctuation in prose, which is a per-message correctness tax; HTML needs three entities escaped and fails visibly in tests, not in production.
- **Discord first.** Deferred, not rejected — the earlier revision of this document designed the Discord adapter in full. Telegram ships first because it needs no gateway process, no privileged-intent approval, no verification program, and no user-install configuration, and because private-chat-first matches the v1 ownership model natively. The identity layer, router, and renderer are built platform-agnostic (D8) so the Discord adapter is phase 5, not a rewrite; its platform specifics (thread-per-conversation UX, 2000-char limit, gateway sharding, `MessageContent` intent) are recorded in this document's git history.
- **Finishing `messaging.telegram.TelegramBotTrigger` instead.** The existing workflow node long-polls for messages inside a graph run. A workflow trigger answers a different question — "start *this workflow* when a Telegram message arrives" — and per [triggers-design.md](triggers-design.md), that belongs in `trigger_registrations` + the dispatcher, not in a graph node holding a poll loop open. A later `telegram_message` trigger kind could share the bridge's update stream.

## 14. Phasing

1. **Identity + bridge core** — `external_identities`, link/token routes, `DelegatedTokenProvider`; package, config, private-chat routing, router, renderer, chunker, markdown→HTML; streaming edits + tool status line + stop button; final message + error rendering; reconnect/resume with token re-mint; `register-commands` + `/start|link|unlink|new|stop|status`; long-polling mode. Vitest suites for renderer/chunker/md-html/router/link-flow against a scripted fake socket and fake adapter; a `telegram-bridge` entry in the harness registry whose selfcheck runs those suites keylessly.
2. **Files, voice, workflows, preferences** — inbound photos as image parts, documents re-homed as assets, voice notes via the server's `transcribe_audio`, outbound asset sending, `/workflow`, `/model` persisted server-side, thread-title sync via tRPC, webhook mode.
3. **Approvals** — render `tool_approval_request` as inline-keyboard buttons (allow / allow for chat / deny), answer with `tool_approval_response`, make `permission_mode` configurable. Retires the `auto`-mode caveat in §9 for operators who want it.
4. **Group support** — mention/reply activation under group-privacy mode and an explicit conversation-ownership rule, on top of the proven identity layer. This is where the deferred ownership decision from §13 is made.
5. **Discord adapter** — extract the shared core to `packages/messaging-bridge`, add `packages/discord` (gateway client, thread-per-conversation UX, 2000-char chunking, user-install app); `provider: "discord"` reuses the identity layer as-is.
6. **Trigger sharing** — expose the update stream to a `telegram_message` trigger kind (separate design, per triggers-design.md).

Phase 1 is the deliverable that makes everything after it iterable: from there, a change to the renderer, the formatter, or the link flow is a unit test, not a live Telegram session.
