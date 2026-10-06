# @nodetool-ai/integration-nodes

External-API integration nodes for [NodeTool](https://nodetool.ai).

Connect visual AI workflows to the outside world: email, Discord and Telegram
triggers, ComfyUI workflows, and stable-diffusion.cpp image generation.

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
`fetch` call and is one.

**ComfyUI** (`lib.comfy.*`) — `RunWorkflow` runs an API-format ComfyUI workflow
against any reachable ComfyUI server, streaming each output file as its save node
finishes. `RunWorkflowOnWorker` runs the same workflow on a NodeTool worker that
fronts a loopback-only ComfyUI, proxied over the worker bridge's `comfy.*`
messages. `RunWorkflowOnCloud` runs it on Comfy Cloud through the official
`@comfyorg/sdk` (Comfy API v2, `COMFY_API_KEY`), streaming outputs the same way
the direct node does. All three derive typed inputs from `Load*` nodes and typed
outputs from `Save*` nodes, keyed `<comfyNodeId>:<field>`. See
[docs/comfyui.md](https://docs.nodetool.ai/comfyui).

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

Mail is not a node package any more. `lib.mail.GmailSearch`, `AddLabel` and
`MoveToArchive` were removed: the same three operations ship as the
`search_email` / `add_label_to_email` / `archive_email` capabilities, and Gmail
reaches a Code node through `@nodetool-ai/sandbox-nodetool/google` with the
OAuth token held host-side. `lib.secret.GetSecret` went too — `getSecret(name)`
in the sandbox does the same read, bound by the run's declared secret scope.

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
