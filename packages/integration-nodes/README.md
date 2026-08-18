# @nodetool-ai/integration-nodes

External-API integration nodes for [NodeTool](https://nodetool.ai).

Connect visual AI workflows to the outside world: Google Workspace, email,
Discord and Telegram triggers, and ComfyUI workflows.

Services that are one authenticated HTTP call — S3, Supabase, Notion, Twilio,
Apify, SerpApi, Discord and Telegram sends — no longer ship as nodes. They are
written as scripts in a `nodetool.code.Code` node, with `fetch`,
`nodetool.secrets.get(name)`, and the auth-helper sandbox packs
(`@nodetool-ai/sandbox-aws`, `-notion`, `-supabase`, `-twilio`, `-apify`). See
[packages/sandbox-packs](../sandbox-packs/README.md).

## Install

```bash
npm install @nodetool-ai/integration-nodes
```

## Nodes

**Mail** (`lib.mail.*`) — `GmailSearch`, `AddLabel`, `MoveToArchive`.

**Messaging** (`messaging.*`) — Discord and Telegram bot triggers:
`discord.DiscordBotTrigger`, `telegram.TelegramBotTrigger`. A trigger holds a
long-lived connection, which is what a script cannot do; sending a message is a
`fetch` call and is one.

**ComfyUI** (`lib.comfy.*`) — `RunWorkflow` runs an API-format ComfyUI workflow
against any reachable ComfyUI server, streaming each output file as its save node
finishes. `RunWorkflowOnWorker` runs the same workflow on a NodeTool worker that
fronts a loopback-only ComfyUI, proxied over the worker bridge's `comfy.*`
messages. Both derive typed inputs from `Load*` nodes and typed outputs from
`Save*` nodes, keyed `<comfyNodeId>:<field>`. See
[docs/comfyui.md](https://docs.nodetool.ai/comfyui).

**Other** — `kie.dynamic_schema.KieAI`, `lib.secret.GetSecret`.

## Configuration

Set the keys for the services you use in NodeTool's secret store (Settings → API
Keys) or as environment variables:

- Mail: `GOOGLE_APP_PASSWORD`
- KIE: `KIE_API_KEY`
- Discord: `DISCORD_BOT_TOKEN`
- Telegram: `TELEGRAM_BOT_TOKEN`

Google Workspace is not a node package any more. Drive, Gmail, Docs, Sheets and
Calendar are the `google` capability module in `@nodetool-ai/agents` — agent
tools and sandbox imports at once (`@nodetool-ai/sandbox-nodetool/google`).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
