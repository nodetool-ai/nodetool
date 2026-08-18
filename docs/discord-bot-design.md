# Discord Bot Integration — Technical Design

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-18
**Reference:** [georgi/claude-pipe](https://github.com/georgi/claude-pipe) — a Telegram/Discord/CLI bridge onto a coding-agent SDK, whose channel-adapter and progress-editing patterns this design reuses.

---

## 1. Summary

A Discord bot that gives Discord users access to NodeTool's unified agent loop: mention the bot (or DM it), it opens a Discord thread, and every message in that thread becomes a turn in a persistent NodeTool chat thread — with streaming text, visible tool activity, and generated files delivered back as Discord attachments.

The bot is a **bridge process, not a second agent runtime**. It ships as `packages/discord` (`@nodetool-ai/discord`), depends on `@nodetool-ai/sdk` and `discord.js`, and talks to a running NodeTool server over the existing `/ws` chat protocol. It owns exactly two translations: Discord events → `chat_message` commands, and `ProcessingMessage` frames → Discord messages. Everything else — the agent loop, tools, permissions, thread persistence, cost tracking, credit gating — is the server's, unchanged.

## 2. Design goals

- **D1. Zero new agent surface.** The bot reaches the same `UnifiedWebSocketRunner` chat path the web UI uses (`chat_message` / `resume_chat` over `/ws`). No forked loop, no second toolbelt assembly, no drift.
- **D2. One conversation, one thread, both sides.** A Discord thread maps 1:1 to a NodeTool thread row, so the conversation is resumable from the web UI, the CLI, and Discord alike, and survives bot restarts.
- **D3. Small dependency cone.** The bot process needs no database, no secret store, no native modules — `@nodetool-ai/sdk` + `discord.js` + `ws`. It can run on a different machine than the server.
- **D4. Fail visible, recover silent.** A dropped WebSocket resumes the in-flight turn via `resume_chat {thread_id, last_seq}`; a dead server produces one status message in the Discord thread, not silence.
- **D5. Headlessly drivable.** Both translations are pure modules exercised by a fake-Discord/fake-socket harness ([docs/HARNESS_FIRST.md](HARNESS_FIRST.md)); the gateway connection is the only part a test cannot own.

Non-goals for v1: voice channels, Discord embeds/components as an app UI, per-Discord-user NodeTool accounts (see §10), and replacing the `messaging.discord.DiscordBotTrigger` workflow node (see §11).

## 3. Architecture

```
Discord Gateway (wss)                       NodeTool server (:7777)
        │                                            │
        ▼                                            │
┌──────────────────┐    InboundTurn    ┌──────────────────────┐
│ DiscordAdapter   │ ────────────────▶ │ TurnRouter           │
│ (discord.js)     │                   │  one ChatSocket per  │
│  mention/DM/     │ ◀──────────────── │  active conversation │
│  thread routing  │    RenderPlan     └──────────┬───────────┘
└──────────────────┘                              │ chat_message /
        ▲                                         │ resume_chat
        │ send / edit / attach          ┌─────────▼───────────┐
        └───────────────────────────────│ @nodetool-ai/sdk    │
                                        │ ChatSocket (/ws,    │
                                        │ msgpack, ?token=)   │
                                        └─────────────────────┘
```

One Node.js process, three modules:

- **DiscordAdapter** (`src/discord-adapter.ts`) — owns the `discord.js` client. Decides which messages are for the bot, opens threads, strips mentions, downloads attachments, and executes `RenderPlan`s (send, edit, attach, typing). All Discord API knowledge lives here.
- **TurnRouter** (`src/turn-router.ts`) — owns the conversation table and one `ChatSocket` per conversation with an in-flight turn. Serializes turns per conversation (a second message while a turn runs is queued, mirroring the server's own `chatTurnRegistry` per-thread lock), forwards frames to the renderer, and handles reconnect/resume.
- **FrameRenderer** (`src/frame-renderer.ts`) — pure function domain: folds `ProcessingMessage` frames (`chunk`, `tool_call_update`, `message`, `output_update`, `error`, `job_update`) into a `RenderPlan` (create/edit/finalize/attach operations), applying Discord's 2000-char limit and an edit-rate throttle. No I/O.

This is claude-pipe's bus/adapter/loop split with the agent loop replaced by a socket: claude-pipe's `AgentLoop.processMessage` + `publishProgress` become TurnRouter + FrameRenderer, and its `Channel` interface (`send`, `editMessage`, `sendFile`) becomes the `RenderPlan` executor on DiscordAdapter.

## 4. Conversation model

### Identity

The conversation key is the Discord channel the reply lands in: a bot-opened thread id, a foreign thread id the bot was mentioned in, or a DM channel id. The NodeTool `thread_id` is derived, not stored: `discord-<discordChannelId>`.

This works because the server creates threads lazily from client-supplied ids (`ensureThreadExists` in `packages/websocket/src/unified-websocket-runner.ts`): the first `chat_message` with `thread_id: "discord-123..."` creates the row, every later one — from this process or a restarted one — resumes it with full history reloaded server-side. The bot therefore needs **no persistent state of its own**; the only local state is the in-memory set of thread ids this process opened (for reply-without-mention routing) plus the set of already-context-seeded conversations, both rebuilt lazily after a restart (a bot-owned thread is also recognizable by `ThreadChannel.ownerId`).

Thread titles: after the first turn, the bot calls `trpc.threads.update` to set the NodeTool thread title to the Discord thread name, so the conversation is findable in the web UI's thread list.

### Activation (who the bot answers)

Same rules as claude-pipe's Discord channel, which they fit well:

1. **DMs** — always (subject to the user allowlist).
2. **@mention in a guild text channel** — opens a public thread anchored on the triggering message (name = first line of the message, ≤90 chars), replies there. Falls back to replying in-channel when thread creation is denied.
3. **Any message in a bot-opened thread** — no mention needed.
4. **@mention inside a foreign thread** — joins that thread as the conversation.

Everything else is ignored, as are all bot-authored messages (including its own).

### Context seeding

When a conversation starts from a mention (case 2 or 4), the bot fetches up to 30 preceding messages (excluding its own), and prepends them once as a `[Channel context — recent messages]` block. Follow-ups never re-send history — the server-side thread already has it. Seeded conversation ids are tracked in memory; the worst case after a restart is one duplicate context block, which is acceptable.

### Multi-user threads

Discord threads are multi-party while a NodeTool thread has one user column. v1 keeps the shared thread and disambiguates inside the turn: when the sender differs from the previous turn's sender, the content is prefixed `[Discord user <displayName>]: `. This matches how the conversation actually reads in the channel and costs nothing.

## 5. Turn lifecycle

Inbound, per triggering Discord message:

1. Allowlist checks (user id, then channel id / parent channel id — DMs skip the channel check). Denied guild messages are ignored silently; denied slash commands get an ephemeral refusal.
2. Resolve conversation (open thread if needed), build content: strip the bot mention, optional context block, optional sender prefix, attachment section (§7).
3. `TurnRouter.submit(conversation, content)`. If a turn is already running for this conversation the message queues; queue depth is capped (default 3), overflow gets a "still working on the previous message" reply.
4. The router ensures a connected `ChatSocket` and sends:

```ts
socket.send({
  threadId: conv.nodeToolThreadId,
  text: content,
  provider: config.provider,        // optional; server default otherwise
  model: config.model,
  agentMode: true,
  permissionMode: "auto"            // §8
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
| `output_update` / saved assets | fetch via the message's asset/temp URL, attach as Discord files (≤ 10 MB each; larger files become a link to the server's asset URL) |
| `error` | replace status/stream with `⚠️ <message>`; the turn ends |
| `job_update` (workflow-target runs) | status line only |

Rate discipline: edits are throttled per conversation (1500 ms) and coalesced; Discord's ~5 edits/5 s per-channel budget is the binding constraint, same numbers claude-pipe converged on.

### Interrupt and disconnect

- A `🛑`/`❌` reaction by the requesting user on the stream or status message (or `/nodetool stop`) sends `stop(threadId)`; the server emits `generation_stopped`, rendered as `⏹ stopped`.
- On socket drop mid-turn: reconnect with backoff (the SDK's `ChatSocket` already does this), then `resume_chat {thread_id, last_seq}` replays missed frames into the same renderer state. Only after resume also fails does the thread get one `⚠️ lost connection to NodeTool` message.

## 6. Slash commands

Registered once via the REST API (`PUT /applications/:id/commands`), handled entirely in the bot — they never reach the LLM:

| Command | Effect |
|---|---|
| `/nodetool ask prompt:<text>` | start a conversation from a slash command (deferred reply becomes the thread starter) |
| `/nodetool new` | rotate this Discord thread onto a fresh NodeTool thread id (suffix `-2`, `-3`, …) |
| `/nodetool stop` | cancel the in-flight turn |
| `/nodetool model [id]` | show or set the per-conversation model override |
| `/nodetool workflow <id> [params]` | run a turn with `workflow_target: "workflow"` against a saved workflow — the server's workflow-chatbot path |
| `/nodetool status` | bot → server connectivity, provider/model in effect, queue depth |

Discord's 3-second interaction deadline is met by `deferReply()` before any server round-trip.

## 7. Attachments

**Inbound:** Discord attachments arrive as CDN URLs. Images are passed as image content parts on the chat message (the server's `resolveContentForProvider` fetches and inlines them for the provider). Non-image files are described in the content (`[Attached file: report.pdf, 1.2 MB, <url>]`) so the agent can fetch them with its own `download_file`/`http_request` tools under the server's SSRF guard. The bot itself never proxies file bytes inbound.

**Outbound:** asset references on the final message and `output_update` frames are fetched from the server (authenticated) and attached. Over Discord's upload limit, the bot posts the asset's server URL instead — useful only where users can reach the server, so it is stated plainly rather than pretended around: `📎 too large for Discord: <url>`.

## 8. Security and access control

- **Server credential.** The bot holds one NodeTool bearer token (`NODETOOL_API_TOKEN`, appended as `?token=` on the upgrade — the path `ChatSocket` already implements). Against a local-mode server on the same host, localhost trust makes the token optional; against anything reachable by others, `STATIC_AUTH_TOKEN` on the server is required and the docs say so. All Discord traffic maps to that one NodeTool user.
- **Discord allowlists.** `allowUsers` (Discord user ids) and `allowChannels` (channel/parent ids; DMs exempt from the channel list). Empty list = allow all, matching claude-pipe — but the default generated config ships with `allowUsers` populated by the installing user, because this bot reaches an agent with write/execute tools.
- **Permission mode.** Turns run with `permission_mode: "auto"`: there is no interactive approver on this surface, and the server's `default` mode would park every write/execute tool on a `tool_approval_request` forever. This is the single most consequential setting and sits at the top of the config with a comment. A later phase can map approval requests onto Discord buttons and switch to `default` (§12, phase 3).
- **Prompt injection.** Channel context blocks and messages from non-allowlisted co-participants in a thread are untrusted input to an agent holding real tools. v1's mitigations: the allowlist gates who can *trigger* a turn at all, the context block is labeled as quoted channel history, and the bot never acts on Discord content itself. This is the standing residual risk of `auto` mode and is documented, not hidden.
- **Secrets.** The bot's env carries exactly two tokens (Discord, NodeTool). Provider API keys stay in the server's secret store.

## 9. Configuration

Env-first, with an optional `discord-bot.json` for the list-valued settings:

```
DISCORD_BOT_TOKEN            required
DISCORD_APPLICATION_ID       required once, for slash-command registration
NODETOOL_API_URL             default http://127.0.0.1:7777
NODETOOL_API_TOKEN           required unless the server trusts this host
NODETOOL_BOT_PROVIDER/MODEL  optional server-side default override
```

```jsonc
// discord-bot.json
{
  "allowUsers": ["<discord user id>"],
  "allowChannels": [],
  "useThreads": true,
  "threadAutoArchiveMinutes": 1440,
  "editThrottleMs": 1500,
  "maxQueuedTurns": 3
}
```

Gateway intents: `Guilds`, `GuildMessages`, `DirectMessages`, `MessageContent` (+ `Partials.Channel` for DMs). `MessageContent` is a privileged intent the operator enables in the Discord developer portal; the setup doc walks through it.

## 10. Package layout and entry points

```
packages/discord/
  package.json          # @nodetool-ai/discord — deps: @nodetool-ai/sdk, discord.js, ws
  tsconfig.json         # references: ../sdk
  src/
    index.ts            # startDiscordBot(config), stopDiscordBot — the programmatic surface
    config.ts           # env + json loading, zod-validated at the boundary
    discord-adapter.ts
    turn-router.ts
    frame-renderer.ts   # pure: frames → RenderPlan
    chunk.ts            # 2000-char markdown-aware splitter (port of claude-pipe text-chunk)
    register-commands.ts
  tests/                # vitest: renderer folding, chunker, routing, resume replay
```

Two ways to run it:

- `npx @nodetool-ai/discord` (a `bin` in the package) for standalone deployment next to any server.
- `nodetool discord serve` / `nodetool discord register-commands` in the CLI — thin wrappers over `startDiscordBot`, consistent with how the CLI fronts the other harnesses. Command registration is explicitly separate from serving, as in claude-pipe: it is a deploy step, not a boot step.

The dependency-cone rule (D3) is enforced structurally: `packages/discord` references only `packages/sdk` in its tsconfig, so an import of `@nodetool-ai/agents` or `@nodetool-ai/models` fails the build.

Later, the Electron app can host the bot in-process (a Settings → Integrations toggle holding the Discord token via `keytar`), since `startDiscordBot` is just a function against `http://127.0.0.1:7777`. That is desktop work and out of this design's scope.

## 11. Alternatives considered

- **In-process agent loop** (import `processChat` + `createChatCodeActSession`, the way `packages/cli/src/stdin.ts` does). Rejected: the bot would own the DB, secret store, toolbelt assembly, and native modules, duplicate the server's credit gate and turn registry, and its conversations would be invisible to the web UI unless it re-implemented persistence. The CLI pays those costs because it *is* a local runtime; a bot should not.
- **OpenAI-compatible endpoint** (`POST /v1/chat/completions`). Rejected: it is a stateless provider passthrough — no threads, no agent toolbelt, no tool streaming. Fine for "LLM in Discord", useless for "NodeTool agents in Discord".
- **Finishing `messaging.discord.DiscordBotTrigger` instead.** The existing node is a stub (token validation only; the Gateway connection is explicitly not implemented). A workflow trigger answers a different question — "start *this workflow* when a Discord message arrives" — and per [triggers-design.md](triggers-design.md), that belongs in `trigger_registrations` + the dispatcher, not in a graph node holding a Gateway socket open. This design deliberately does not touch it; a later `discord_message` trigger kind could share the bot's Gateway connection, with the bot posting trigger inputs the way the webhook route does.
- **Discord embeds/components as the primary render surface.** Plain markdown messages first: the agent's output is markdown, Discord renders markdown, and embeds impose their own length/field limits that fight streaming. Components return for the approval flow (phase 3), where buttons are the right shape.

## 12. Phasing

1. **Bridge core** — package, config, adapter (mention/DM/thread routing, allowlists), router, renderer, chunker; streaming edits + tool status line; final message + error rendering; reconnect/resume; `register-commands` + `/nodetool ask|new|stop|status`. Vitest suites for renderer/chunker/router against a scripted fake socket and fake adapter; a `discord-bridge` entry in the harness registry whose selfcheck runs those suites keylessly.
2. **Files and workflows** — inbound image parts + file descriptions, outbound asset attachments, `/nodetool workflow`, `/nodetool model`, thread-title sync via tRPC.
3. **Approvals** — render `tool_approval_request` as Discord buttons (allow / allow for chat / deny), answer with `tool_approval_response`, and make `permission_mode` configurable per deployment. This retires the `auto`-mode caveat in §8 for operators who want it.
4. **Trigger sharing** — expose the Gateway connection to a `discord_message` trigger kind (separate design, per triggers-design.md).

Phase 1 is the deliverable that makes everything after it iterable: from there, a change to the renderer is a unit test, not a live Discord session.
