# Discord Bot Integration — Technical Design

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-18
**Reference:** [georgi/claude-pipe](https://github.com/georgi/claude-pipe) — a Telegram/Discord/CLI bridge onto a coding-agent SDK, whose channel-adapter and progress-editing patterns this design reuses.

---

## 1. Summary

A Discord bot that gives Discord users access to NodeTool's unified agent loop, **multi-tenant from the start**: each Discord user links their own NodeTool account once (`/nodetool link`), and from then on every DM to the bot is a turn in that user's own chat threads — their tools, their assets, their secrets, their budget. Streaming text, visible tool activity, and generated files come back into the DM.

**v1 is DM-only.** Guild channels and threads are deferred, because a shared channel has no single owner: whose account runs the turn, whose budget pays, and whose assets the agent may read all become ambiguous the moment a second person can type into the conversation. A DM has exactly one human, so conversation ownership, billing, and data isolation are all the same trivial statement: everything belongs to the linked account of the person in the DM. Guild support returns later on top of the same identity layer (§12, phase 4).

The bot is a **bridge process, not a second agent runtime**. It ships as `packages/discord` (`@nodetool-ai/discord`), depends on `@nodetool-ai/sdk` and `discord.js`, and talks to a running NodeTool server over the existing `/ws` chat protocol. It owns exactly two translations: Discord DMs → `chat_message` commands, and `ProcessingMessage` frames → Discord messages. The agent loop, tools, permissions, thread persistence, per-user cost tracking, and credit gating are the server's, unchanged. The one server-side addition this design requires is the identity layer in §5: an external-identity table and two routes for linking and delegated tokens.

## 2. Design goals

- **D1. Zero new agent surface.** The bot reaches the same `UnifiedWebSocketRunner` chat path the web UI uses (`chat_message` / `resume_chat` over `/ws`). No forked loop, no second toolbelt assembly, no drift.
- **D2. Tenant isolation is the server's, not the bot's.** Every turn runs on a token scoped to the sender's NodeTool user, so thread history, assets, memories, secrets, and the credit gate isolate per user by the server's existing rules. The bot never enforces isolation itself — it only presents the right identity.
- **D3. The bot holds no user credentials.** One service token identifies the bot to the server; per-user access is a short-lived delegated token the server mints per connection from its own Discord↔user mapping. A compromised bot host leaks the service token (revocable, mints nothing without the server) — not a store of user tokens.
- **D4. One conversation, one thread, both sides.** A DM maps to NodeTool threads owned by the linked user, so conversations are resumable from the web UI, the CLI, and Discord alike, and survive bot restarts — the bot keeps no conversation state.
- **D5. Small dependency cone.** The bot process needs no database, no secret store, no native modules — `@nodetool-ai/sdk` + `discord.js` + `ws`. It can run on a different machine than the server.
- **D6. Fail visible, recover silent.** A dropped WebSocket resumes the in-flight turn via `resume_chat {thread_id, last_seq}`; a dead server produces one status message in the DM, not silence.
- **D7. Headlessly drivable.** The frame renderer, DM routing, and link flow are pure modules exercised by a fake-Discord/fake-socket harness ([docs/HARNESS_FIRST.md](HARNESS_FIRST.md)); the gateway connection is the only part a test cannot own.

Non-goals for v1: guild channels, threads, and @mentions (phase 4); voice channels; Discord embeds/components as an app UI; per-guild configuration.

## 3. Architecture

```
Discord Gateway (wss)                        NodeTool server
        │                                            │
        ▼                                            │
┌──────────────────┐    InboundTurn    ┌──────────────────────┐
│ DiscordAdapter   │ ────────────────▶ │ TurnRouter           │
│ (discord.js)     │                   │  per-user ChatSocket │
│  DM routing,     │ ◀──────────────── │  + delegated token   │
│  slash commands  │    RenderPlan     └──────────┬───────────┘
└──────────────────┘                              │
        ▲                                         │ chat_message / resume_chat
        │ send / edit / attach          ┌─────────▼───────────┐
        └───────────────────────────────│ @nodetool-ai/sdk    │
                                        │ ChatSocket (/ws,    │
                                        │ msgpack, ?token=)   │
                                        └─────────────────────┘

Identity (server-side, §5):
  bot ── service token ──▶ POST /api/integrations/discord/token ──▶ delegated user token
  user ── /nodetool link ──▶ one-time URL ──▶ signed-in web session ──▶ external_identities row
```

One Node.js bridge process, four modules:

- **DiscordAdapter** (`src/discord-adapter.ts`) — owns the `discord.js` client. Accepts DMs and slash commands, rejects everything else, downloads attachments, and executes `RenderPlan`s (send, edit, attach, typing). All Discord API knowledge lives here.
- **IdentityClient** (`src/identity-client.ts`) — resolves a Discord user id to a delegated NodeTool token via the server's integration routes (§5), with an in-memory cache keyed by token expiry. Also drives the link/unlink flows.
- **TurnRouter** (`src/turn-router.ts`) — owns one `ChatSocket` per Discord user with an in-flight turn, authenticated with that user's delegated token. Serializes turns per conversation (a second message while a turn runs is queued, mirroring the server's own `chatTurnRegistry` per-thread lock), forwards frames to the renderer, and handles reconnect/resume — including re-minting an expired delegated token before reconnecting.
- **FrameRenderer** (`src/frame-renderer.ts`) — pure function domain: folds `ProcessingMessage` frames (`chunk`, `tool_call_update`, `message`, `output_update`, `error`, `job_update`) into a `RenderPlan` (create/edit/finalize/attach operations), applying Discord's 2000-char limit and an edit-rate throttle. No I/O.

This is claude-pipe's bus/adapter/loop split with the agent loop replaced by a socket, plus an identity module claude-pipe never needed (it is single-user by construction).

## 4. Conversation model

### Activation

The bot answers exactly two things:

1. **DMs from linked users** — every message is a turn.
2. **Slash commands** — `/nodetool link` and `/nodetool status` work for anyone; the rest require a linked account.

A DM from an unlinked user gets one reply: what the bot is, and a `/nodetool link` prompt. Guild messages — including @mentions — are ignored in v1; a guild @mention gets a single ephemeral-style pointer to DM the bot, at most once per user per day, so the bot is discoverable without being noisy. An optional `allowUsers` list further restricts who may even link, for closed deployments.

### Thread identity

A DM is a long-lived channel, not one conversation, so the DM maps to a **sequence** of NodeTool threads: the derived id is `discord-<dmChannelId>-<n>`, where `n` starts at 1 and `/nodetool new` increments it. The current `n` is recoverable without bot-side state: on the first turn after a restart, the bot lists the user's threads via tRPC (`threads.list`, filtered by the `discord-<dmChannelId>-` prefix on ids) and resumes the highest `n`.

The server creates thread rows lazily from client-supplied ids (`ensureThreadExists` in `packages/websocket/src/unified-websocket-runner.ts`), always under the authenticated user — so the thread belongs to the linked account and appears in that user's web-UI thread list. Thread ids are globally unique across users, though, so a purely channel-derived id would let one tenant occupy an id another tenant's derivation produces (a user can be re-linked, and DM channel ids are not secret). The derived id therefore includes a short hash of the NodeTool user id — `discord-<dmChannelId>-<uid8>-<n>` — making cross-tenant id collision structurally impossible rather than merely unlikely.

Because a DM has one human and the server-side thread has the full history, there is **no context seeding** — the claude-pipe channel-history block exists to import a shared channel's conversation, which v1 does not have.

Thread titles: after the first turn, the bot calls `trpc.threads.update` (as the user, on the delegated token) to set a title from the first message, so the conversation is findable in the web UI.

## 5. Identity: linking and delegated tokens

This is the one part of the design that adds server surface. It lives in `packages/websocket` (routes) and `packages/models` (table), kept deliberately provider-generic so a later Slack or Telegram bridge reuses it.

### Data model

```sql
external_identities (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,          -- "discord"
  external_id   TEXT NOT NULL,          -- Discord user id
  user_id       TEXT NOT NULL,          -- NodeTool user
  linked_at     TEXT NOT NULL,
  UNIQUE(provider, external_id)
)
```

One NodeTool user may link several Discord accounts; one Discord account maps to exactly one NodeTool user.

### Link flow (`/nodetool link`)

1. The bot calls `POST /api/integrations/discord/link/start {external_id}` with its **service token** (`NODETOOL_INTEGRATION_TOKEN`, a dedicated static token the server recognizes as the Discord integration — not a user token). The server stores a one-time link code (10-minute TTL) and returns a URL.
2. The bot DMs the user the URL. The user opens it, signs in to NodeTool normally (Supabase mode: their real account; local mode: user "1"), and confirms "Link Discord account `<name>`?" on a minimal confirmation page.
3. Confirming writes the `external_identities` row. The pending code is single-use; an unconfirmed code expires.
4. `/nodetool unlink` deletes the row (bot-initiated, service token, scoped to that `external_id`), and the same page offers unlink to the signed-in user.

The user's browser session does the authentication, so the bot never sees a password, an OAuth code, or a long-lived user credential.

### Delegated tokens

Per connection, the bot exchanges identity for access: `POST /api/integrations/discord/token {external_id}` with the service token returns `{token, expires_at, user_id}` — a short-lived (1 h) token that authenticates as the linked user on `/ws`, `/trpc`, and asset URLs. Unlinked `external_id` → 404, and the bot renders the link prompt.

Implementation slots into the existing `AuthProvider` seam: delegated tokens are signed server-side (HMAC over `user_id` + expiry with the master key from `@nodetool-ai/security`) and verified by a `DelegatedTokenProvider` chained before the configured provider, so no token table and no cleanup job. Revocation is coarse but sufficient: unlinking removes the mapping, so no new tokens mint, and outstanding ones die within the hour; rotating the master key kills them instantly.

The integration routes are enabled only when `NODETOOL_INTEGRATION_TOKEN` is set; a server without it exposes none of this surface.

## 6. Turn lifecycle

Inbound, per DM:

1. `IdentityClient.resolve(discordUserId)` → delegated token (cached until near expiry) or the link prompt.
2. Build content: message text plus the attachment section (§8).
3. `TurnRouter.submit(user, conversation, content)`. If a turn is already running for this conversation the message queues; queue depth is capped (default 3), overflow gets a "still working on the previous message" reply.
4. The router ensures a connected `ChatSocket` for this user and sends:

```ts
socket.send({
  threadId: conv.currentThreadId,     // discord-<dm>-<uid8>-<n>
  text: content,
  provider: prefs.provider,           // per-user override or server default
  model: prefs.model,
  agentMode: true,
  permissionMode: "auto"              // §9
});
```

Outbound, per frame (all folding in FrameRenderer, all I/O in DiscordAdapter):

| Frame | Discord effect |
|---|---|
| first `chunk` | create the **stream message**; also `sendTyping()` until then |
| later `chunk` | append to buffer; edit the stream message at most every 1500 ms; past 1800 chars, finalize the current message and start a new one (Discord edits cannot grow past the limit — claude-pipe hit this exactly) |
| `tool_call_update` / `tool_call` | one **status line** message (`🔧 web_search — "quickjs sandbox"`), edited in place per tool; replaced by the stream message when text starts; `✅`/`❌` on completion |
| `task_update`, `planning_update`, `node_update` | folded into the status line (latest wins), never separate messages |
| `message` (final assistant) | finalize: edit the stream message to the final content's tail chunk, send remaining chunks; render markdown as-is (Discord speaks it) |
| `output_update` / saved assets | fetch via the delegated token, attach as Discord files (≤ 10 MB each; larger files become a link to the server's asset URL) |
| `error` | replace status/stream with `⚠️ <message>`; the turn ends |
| `job_update` (workflow-target runs) | status line only |

Rate discipline: edits are throttled per conversation (1500 ms) and coalesced; Discord's ~5 edits/5 s per-channel budget is the binding constraint, same numbers claude-pipe converged on.

### Interrupt and disconnect

- A `🛑`/`❌` reaction on the stream or status message (or `/nodetool stop`) sends `stop(threadId)`; the server emits `generation_stopped`, rendered as `⏹ stopped`. In a DM the reactor is necessarily the owner, so no permission check is needed.
- On socket drop mid-turn: re-mint the delegated token if expired, reconnect with backoff (the SDK's `ChatSocket` already does this), then `resume_chat {thread_id, last_seq}` replays missed frames into the same renderer state. Only after resume also fails does the DM get one `⚠️ lost connection to NodeTool` message.

## 7. Slash commands

Registered once via the REST API (`PUT /applications/:id/commands`), handled entirely in the bot — they never reach the LLM. Discord's 3-second interaction deadline is met by `deferReply()` before any server round-trip.

| Command | Effect |
|---|---|
| `/nodetool link` / `/nodetool unlink` | account linking (§5) |
| `/nodetool new` | rotate this DM onto a fresh NodeTool thread |
| `/nodetool stop` | cancel the in-flight turn |
| `/nodetool model [id]` | show or set this user's model override (stored server-side in the user's settings via tRPC, so it survives bot restarts) |
| `/nodetool workflow <id> [params]` | run a turn with `workflow_target: "workflow"` against one of **the user's own** saved workflows — the server's workflow-chatbot path enforces ownership |
| `/nodetool status` | bot → server connectivity, link state, provider/model in effect, queue depth |

## 8. Attachments

**Inbound:** Discord attachments arrive as CDN URLs. Images are passed as image content parts on the chat message (the server's `resolveContentForProvider` fetches and inlines them for the provider). Non-image files are described in the content (`[Attached file: report.pdf, 1.2 MB, <url>]`) so the agent can fetch them with its own `download_file`/`http_request` tools under the server's SSRF guard. The bot itself never proxies file bytes inbound.

**Outbound:** asset references on the final message and `output_update` frames are fetched from the server on the delegated token and attached. Over Discord's upload limit, the bot posts the asset's server URL instead — useful only where users can reach the server, so it is stated plainly rather than pretended around: `📎 too large for Discord: <url>`.

## 9. Security and access control

- **Tenant isolation** is delegated-token deep, not bot deep (D2): thread listing, asset fetches, workflow runs, collections, secrets, the credit gate, and cost attribution all execute server-side as the linked user. The bot contains no cross-tenant code path to get wrong.
- **Credentials.** The bot's env carries two secrets: the Discord bot token and the NodeTool service token. Per-user tokens are short-lived, in-memory only (D3). Provider API keys stay in the server's secret store, per user.
- **Server exposure.** Multi-tenant means the server runs in Supabase (or another enforcing) auth mode; the integration routes refuse to start-link when the server is in local single-user mode with localhost trust, because "link any Discord user to user 1" is not linking. Local mode remains supported for the personal-deployment case, where every DM is user "1" and the link command replies "this server is single-user; you're already in".
- **Permission mode.** Turns run with `permission_mode: "auto"`: there is no interactive approver on this surface, and the server's `default` mode would park every write/execute tool on a `tool_approval_request` forever. In the multi-tenant frame this is materially safer than in a shared-account design — the tools act on the sender's own data under the sender's own budget — but it is still the most consequential setting and sits at the top of the config with a comment. Phase 3 maps approval requests onto Discord buttons and makes the mode configurable.
- **Prompt injection.** DM-only v1 removes the channel-history and co-participant injection vectors entirely: every byte the agent sees was typed or attached by the account owner it acts as. The residual risks are the ones NodeTool already owns server-side (fetched web content, attachment contents).
- **Abuse.** Linking is the admission gate (optionally allowlisted); per-user rate limiting beyond the turn queue is the server's credit gate doing its normal job. The link URL is the one phishing-shaped artifact, so the confirmation page names the Discord account being linked and the code is single-use with a 10-minute TTL.

## 10. Configuration

Bridge process, env-first:

```
DISCORD_BOT_TOKEN            required
DISCORD_APPLICATION_ID       required once, for slash-command registration
NODETOOL_API_URL             default http://127.0.0.1:7777
NODETOOL_INTEGRATION_TOKEN   required (the bot's service token; also set on the server)
```

```jsonc
// discord-bot.json (optional)
{
  "allowUsers": [],            // Discord ids allowed to link; empty = anyone
  "editThrottleMs": 1500,
  "maxQueuedTurns": 3
}
```

Gateway intents: `DirectMessages`, `MessageContent`, `Guilds` (for slash commands) + `Partials.Channel` (DM channels arrive partial). `MessageContent` is a privileged intent the operator enables in the Discord developer portal; the setup doc walks through it.

Server: `NODETOOL_INTEGRATION_TOKEN` enables the `/api/integrations/discord/*` routes (§5).

## 11. Package layout and entry points

```
packages/discord/
  package.json          # @nodetool-ai/discord — deps: @nodetool-ai/sdk, discord.js, ws
  tsconfig.json         # references: ../sdk
  src/
    index.ts            # startDiscordBot(config), stopDiscordBot — the programmatic surface
    config.ts           # env + json loading, zod-validated at the boundary
    discord-adapter.ts
    identity-client.ts
    turn-router.ts
    frame-renderer.ts   # pure: frames → RenderPlan
    chunk.ts            # 2000-char markdown-aware splitter (port of claude-pipe text-chunk)
    register-commands.ts
  tests/                # vitest: renderer folding, chunker, routing, link flow, resume replay
```

Server-side additions land in their owning packages: `external_identities` in `packages/models`, the integration routes and `DelegatedTokenProvider` wiring in `packages/websocket` / `packages/auth`.

Two ways to run the bridge:

- `npx @nodetool-ai/discord` (a `bin` in the package) for standalone deployment next to any server.
- `nodetool discord serve` / `nodetool discord register-commands` in the CLI — thin wrappers over `startDiscordBot`, consistent with how the CLI fronts the other harnesses. Command registration is explicitly separate from serving, as in claude-pipe: it is a deploy step, not a boot step.

The dependency-cone rule (D5) is enforced structurally: `packages/discord` references only `packages/sdk` in its tsconfig, so an import of `@nodetool-ai/agents` or `@nodetool-ai/models` fails the build.

## 12. Alternatives considered

- **In-process agent loop** (import `processChat` + `createChatCodeActSession`, the way `packages/cli/src/stdin.ts` does). Rejected: the bot would own the DB, secret store, toolbelt assembly, and native modules, duplicate the server's credit gate and turn registry, and — fatally for multi-tenancy — would have to re-implement per-user isolation the server already enforces.
- **OpenAI-compatible endpoint** (`POST /v1/chat/completions`). Rejected: a stateless provider passthrough — no threads, no agent toolbelt, no per-user anything.
- **Bot-side token store** (bot keeps long-lived per-user tokens after linking). Rejected for D3: it turns the bridge into a credential vault, needs encrypted storage and revocation plumbing, and breaks the stateless-bridge property. The service-token + delegated-token exchange keeps all credentials and the identity mapping on the server.
- **Guild channels with per-thread ownership in v1** (thread belongs to whoever @mentioned the bot; co-participants' messages run on the starter's account, or fragment into per-sender threads). Deferred: both ownership rules are defensible and both are surprising — one bills the starter for other people's prompts, the other splits one visible conversation into invisible parallel contexts. DM-only sidesteps the decision until the identity layer is proven; phase 4 makes it deliberately.
- **Finishing `messaging.discord.DiscordBotTrigger` instead.** The existing node is a stub (token validation only; the Gateway connection is explicitly not implemented). A workflow trigger answers a different question — "start *this workflow* when a Discord message arrives" — and per [triggers-design.md](triggers-design.md), that belongs in `trigger_registrations` + the dispatcher, not in a graph node holding a Gateway socket open. A later `discord_message` trigger kind could share the bot's Gateway connection.
- **Discord embeds/components as the primary render surface.** Plain markdown messages first: the agent's output is markdown, Discord renders markdown, and embeds impose their own length/field limits that fight streaming. Components return for the approval flow (phase 3), where buttons are the right shape.

## 13. Phasing

1. **Identity + bridge core** — `external_identities`, link/token routes, `DelegatedTokenProvider`; package, config, DM routing, router, renderer, chunker; streaming edits + tool status line; final message + error rendering; reconnect/resume with token re-mint; `register-commands` + `/nodetool link|unlink|new|stop|status`. Vitest suites for renderer/chunker/router/link-flow against a scripted fake socket and fake adapter; a `discord-bridge` entry in the harness registry whose selfcheck runs those suites keylessly.
2. **Files, workflows, preferences** — inbound image parts + file descriptions, outbound asset attachments, `/nodetool workflow`, `/nodetool model` persisted server-side, thread-title sync via tRPC.
3. **Approvals** — render `tool_approval_request` as Discord buttons (allow / allow for chat / deny), answer with `tool_approval_response`, make `permission_mode` configurable. Retires the `auto`-mode caveat in §9 for operators who want it.
4. **Guild support** — @mention activation, bot-owned threads, context seeding, and an explicit conversation-ownership rule, on top of the proven identity layer. This is where the deferred ownership decision from §12 is made.
5. **Trigger sharing** — expose the Gateway connection to a `discord_message` trigger kind (separate design, per triggers-design.md).

Phase 1 is the deliverable that makes everything after it iterable: from there, a change to the renderer or the link flow is a unit test, not a live Discord session.
