# @nodetool-ai/integration-nodes

External-API integration nodes for [NodeTool](https://nodetool.ai).

Connect visual AI workflows to the outside world: email, Discord and Telegram
triggers, ComfyUI workflows, stable-diffusion.cpp image generation, and a
Wan2GP server you run.

Services that are one authenticated HTTP call — S3, Supabase, Notion, Twilio,
Discord and Telegram sends — no longer ship as nodes. They are written as
scripts in a `nodetool.code.Code` node, with `fetch`,
`nodetool.secrets.get(name)`, and the auth-helper sandbox packs
(`@nodetool-ai/sandbox-aws`, `-notion`, `-supabase`, `-twilio`). See
[packages/sandbox-packs](../sandbox-packs/README.md).

Apify and SerpApi are capability modules instead
(`@nodetool-ai/sandbox-nodetool/apify` and `.../serpapi`), so the credential
stays on the host rather than being read by the script.

## Install

```bash
npm install @nodetool-ai/integration-nodes
```

## Nodes

**Messaging** (`messaging.*`) — Discord and Telegram bot triggers:
`discord.DiscordBotTrigger`, `telegram.TelegramBotTrigger`. A trigger holds a
long-lived connection, which is what a script cannot do; sending a message is a
`fetch` call and is one. These two listen only while a workflow containing them
runs. They are not in `TRIGGER_KIND_BY_NODE_TYPE`, so they cannot be armed to
run in the background.

**Mail** (`lib.mail.*`) — Gmail with a Google app password, for installs that
have no Google sign-in: `GmailSearch`, `AddLabel`, `MoveToArchive`, `SendEmail`
and `EmailTrigger`. The host is `imap.gmail.com` for reading and
`smtp.gmail.com` for sending. Another provider needs host settings and an
egress review first, see [URL Egress Inventory](../../docs/url-egress-inventory.md).
IMAP is a long-lived socket protocol, which `fetch` cannot speak, so these stay
nodes. `GmailSearch` returns the newest matches first, with the body decoded to
text. `AddLabel` and `MoveToArchive` find a message by its `Message-ID` header
and act on it by UID. Sent, Drafts, Spam, Trash and All Mail are found by their
IMAP role, so they work when Gmail names them in another language or under
`[Google Mail]`. `SendEmail` sends through `nodemailer`. It accepts plain
addresses only, refuses a line break in a subject or address so a value from an
upstream node cannot add headers, and sends no attachments. `EmailTrigger`
starts a run for each new message. It compiles to a `schedule` registration,
and the server calls its `pollTrigger` when the schedule is due. The cursor is
the highest UID seen plus the folder's UIDVALIDITY, stored on the registration,
so a restart neither re-runs old mail nor skips new mail. The first check only
records a baseline. The design is in
[`websocket/src/triggers/poll.ts`](../websocket/src/triggers/poll.ts) and the
user-facing behavior is in [Triggers](../../docs/triggers.md#email-trigger). A
workflow that runs under a Google sign-in can use the `gmail_*` capabilities
from a Code node instead, with no app password.

**ComfyUI** (`lib.comfy.*`) — `RunWorkflow` runs an API-format ComfyUI workflow
against any reachable ComfyUI server, streaming each output file as its save node
finishes. `RunWorkflowOnWorker` runs the same workflow on a NodeTool worker that
fronts a loopback-only ComfyUI, proxied over the worker bridge's `comfy.*`
messages. `RunWorkflowOnCloud` runs it on Comfy Cloud through the official
`@comfyorg/sdk` (Comfy API v2, `COMFY_API_KEY`), streaming outputs the same way
the direct node does. All three derive typed inputs from `Load*` nodes and typed
outputs from `Save*` nodes, keyed `<comfyNodeId>:<field>`. See
[docs/comfyui.md](https://docs.nodetool.ai/comfyui).

**MCP** (`lib.mcp.*`) — `CallMcpTool` calls one tool on one of the user's
external MCP servers. The node reads the run owner's servers through the access
a host installs with `setExternalMcpResolver` from `@nodetool-ai/runtime`. This
package imports no MCP client, so a host without one reports that the servers
are unavailable. See [Use external servers in a workflow](../../docs/mcp-server.md#use-external-servers-in-a-workflow).

**Other** — `kie.dynamic_schema.KieAI`.

## stable-diffusion.cpp

Generate images locally with `lib.stable_diffusion_cpp.GenerateImage`. Build
and start [stable-diffusion.cpp's sd-server](https://github.com/leejet/stable-diffusion.cpp/tree/master/examples/server)
with your model, then set the node's Server URL to `http://127.0.0.1:1234`
(or the server's address as seen from NodeTool's backend).

For a checkpoint model, a typical launch is:

```bash
sd-server -m /path/to/model.safetensors --listen-ip 127.0.0.1 --listen-port 1234
```

Models with separate diffusion weights, VAE and text encoders need the matching
server flags. NodeTool connects to the running server and does not install the
binary, download weights or switch models.

The node uses the native `/sdcpp/v1/img_gen` async API. Use an `sd-server` build
that exposes that endpoint. Set Prompt and sampling controls, or connect Input
Image for image-to-image generation. Mask and Reference Images are optional
and require a model that supports them. `output` contains the first image,
and `images` contains the complete batch as NodeTool image refs.

Advanced Parameters accepts native request fields such as structured `lora`,
`hires` and `vae_tiling_params`. These override generation controls, including
the entire `sample_params` object. Connected media takes precedence over the
corresponding advanced fields. LoRA tags in prompt text are unsupported by the
server. See the [upstream API reference](https://github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md)
for native fields and model requirements.

Timeout and workflow cancellation send a cancellation request for the submitted
job. The server cancels queued jobs, but returns HTTP 409 for active generation,
which continues on the server. The node reports a cancellation failure in that
case. Redirects are rejected. Local and LAN servers are supported on local
installs. The cloud profile excludes this node by default.

## Wan2GP

`lib.wan2gp.TextToVideo`, `ImageToVideo`, `Generate` and `ListModels` call a
[Wan2GP](https://github.com/deepbeepmeep/Wan2GP) server over MCP through
`withWan2GPClient` in `@nodetool-ai/runtime`, which the `wangp` provider also
uses. The server is the node's `server_url`, then the `WAN2GP_MCP_URL`
setting, then the Wan2GP the Package Manager installed (started on demand),
then `http://127.0.0.1:7866/mcp`. The
`WAN2GP_MCP_TOKEN` secret, when set, is sent as a bearer token. A timeout or a
cancelled run cancels the remote job. The cloud profile excludes these nodes.
See [Wan2GP](../../docs/wan2gp.md).

Gmail also reaches agents through the Google Workspace `gmail_*` capabilities,
and a Code node through `@nodetool-ai/sandbox-nodetool/google`, with the OAuth
token held host-side. That path needs a Google sign-in, which a local install
does not have, so the `lib.mail.*` nodes above remain for it. `lib.secret.GetSecret`
is gone — `getSecret(name)` in the sandbox does the same read, bound by the
run's declared secret scope.

## Configuration

Set the keys for the services you use in NodeTool's secret store (Settings → API
Keys) or as environment variables:

- Mail: `GOOGLE_MAIL_USER` and `GOOGLE_APP_PASSWORD`
- KIE: `KIE_API_KEY`
- Discord: `DISCORD_BOT_TOKEN`
- Telegram: `TELEGRAM_BOT_TOKEN`

Google Workspace is not a node package any more. Drive, Gmail, Docs, Sheets and
Calendar are the `google` capability module in `@nodetool-ai/agents` — agent
tools and sandbox imports at once (`@nodetool-ai/sandbox-nodetool/google`).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
