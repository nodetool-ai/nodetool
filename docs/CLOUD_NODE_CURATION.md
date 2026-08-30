# Cloud Node Curation

The commercial NodeTool cloud product ships a **deliberately small, curated
node set** rather than the full open-source catalog. The goal is a high-quality,
focused **creative AI workspace** — generating and editing text, images, audio,
video, and 3D — that a **two-person team can maintain**.

The full catalog is ~3,500 nodes across ~60 namespaces. Most of the long tail is
developer/automation plumbing (filesystem, databases, scraping, messaging,
office-doc tooling, local model runtimes) that is powerful but "nerdy" — it
dilutes the creative mission and balloons the support surface. The cloud profile
drops it.

> **One exception,** admitted by name rather than by namespace: the
> **sandboxed Code node** (`nodetool.code.Code`, QuickJS WASM JavaScript), the
> intentional power-user escape hatch.

## How it's enabled

The commercial cloud product runs in **production mode**, so production *is* the
cloud profile — no extra flag needed:

```bash
NODETOOL_ENV=production
```

It can also be enabled outside production (e.g. for local testing) with an
explicit flag:

```bash
NODETOOL_NODE_PROFILE=cloud
```

When neither applies (the default for OSS/local installs), the full catalog
loads unchanged. When active, three things happen at server bootstrap:

1. **Provider packs** — only `base`, `fal`, and `kie` load (other provider
   packs like Replicate, Hugging Face, Together, MiniMax, … are never
   registered).
2. **Node registry** — every node type outside the curated allowlist is pruned
   (`applyCloudNodePolicy`).
3. **Provider registry** — the local engines and the local-CLI subscription
   are pruned; every hosted API stays, so any key the settings page accepts
   reaches a working model selector.

The single source of truth is
[`packages/protocol/src/cloud-profile.ts`](../packages/protocol/src/cloud-profile.ts):
`CLOUD_NODE_NAMESPACES` (whole namespaces kept), `CLOUD_NODE_ALLOWLIST`
(individual node types kept from an otherwise-trimmed namespace — the sandboxed
Code node and the curated text nodes), `CLOUD_NODE_DENYLIST` (individual node
types dropped from a kept namespace), `NON_CLOUD_PROVIDER_IDS`, and
`CLOUD_BUILTIN_PACK_IDS`. Maintaining the cloud offering = editing those lists.

## Providers

Every provider NodeTool registers is offered, except the ones a cloud server
cannot reach on the user's behalf. The node catalog is curated; the provider
list is not.

Providers are bring-your-own-key: a key pasted into settings works the same
from a Fly machine as from a laptop, and the settings page offers an API-key
card for every one of them. A curated allowlist sat here before, and each
provider it omitted still had that card — so a cloud user could save an
OpenRouter key and find an empty model picker with nothing saying why.

**Kept:** every hosted API — OpenAI, Anthropic, Gemini, Mistral, xAI, Groq,
OpenRouter, DeepSeek, Moonshot, MiniMax, Cerebras, Together, Alibaba, Evolink,
GMI, AtlasCloud, Aki, Cohere, Voyage, Jina, Hugging Face, Replicate, Fal, Kie,
ElevenLabs, Topaz, Reve, Meshy, Rodin, Codex, and NodeTool's own managed
models.

**Dropped** (`NON_CLOUD_PROVIDER_IDS`): the engines that run on the user's own
machine — Ollama, LM Studio, llama.cpp, node-llama-cpp, vLLM, MLX,
Transformers.js — plus the Claude Agent SDK, which reaches a personal
subscription by spawning the local `claude` CLI, and the dev-only `fake`
provider. The local engines are also never registered under the cloud profile
in the first place.

A provider needs no dedicated node namespace to be useful: Anthropic, Groq and
OpenRouter reach users through the Agent / Chat / generator nodes, and
ElevenLabs through the generic `nodetool.audio.TextToSpeech` node, via the
provider registry alone.

## Namespaces kept

### Workflow scaffolding (editor-essential)

| Namespace            | What it is                              |
| -------------------- | --------------------------------------- |
| `nodetool.input`     | Input nodes (text, number, image, …)    |
| `nodetool.output`    | Output nodes                            |
| `nodetool.constant`  | Constants                               |
| `nodetool.control`   | Control flow (If, ForEach, Switch, …)   |
| `nodetool.compare`   | Compare                                 |
| `nodetool.workflows` | Sub-workflow, Subgraph, Preview         |
| `nodetool.group`     | Editor Loop / Group containers          |
| `nodetool.llm`       | Generic Chat node                       |

### Creative generation core

| Namespace              | What it is                                   |
| ---------------------- | -------------------------------------------- |
| `nodetool.image`       | Image generate / edit / transform            |
| `nodetool.sketch`      | Sketch / vector drawing                       |
| `nodetool.audio`       | Audio + `.synth` + `.realtime`                |
| `nodetool.video`       | Video editing, effects, generation            |
| `nodetool.timeline`    | Media timeline / sequencing                   |
| `nodetool.model3d`     | 3D model generation & processing              |
| `nodetool.generators`  | Data/List/StructuredOutput/Chart/SVG gen      |
| `nodetool.agents`      | AI agents (creative subset — see denylist)    |

`nodetool.text` is kept whole (the full creative-text toolkit — prompt
building, composition, regex, case/whitespace utilities, token counting,
embeddings, predicates, and `AutomaticSpeechRecognition`), **except** its
host-filesystem nodes, which are dropped via `CLOUD_NODE_DENYLIST`:

| Denied from `nodetool.text` | Why                                          |
| --------------------------- | -------------------------------------------- |
| `LoadTextFolder`, `LoadTextAssets` | Read arbitrary host paths              |
| `SaveText`, `SaveTextFile`  | `fs.writeFile` to an unsandboxed host path   |

`nodetool.code` is **not** kept whole — only the sandboxed node is admitted via
`CLOUD_NODE_ALLOWLIST`:

| From `nodetool.code`   | Kept node                                     |
| ---------------------- | --------------------------------------------- |
| `Code`                 | Sandboxed (QuickJS WASM) JavaScript only      |

Admitting it by name rather than whole-listing the namespace keeps any future
`nodetool.code` node out of the cloud until it is reviewed.

`lib.comfy` is trimmed the same way — the two runners are admitted via
`CLOUD_NODE_ALLOWLIST`, the namespace is not:

| From `lib.comfy`        | Kept node                                     |
| ----------------------- | --------------------------------------------- |
| `RunWorkflow`           | Runs a prompt against a ComfyUI HTTP endpoint |
| `RunWorkflowOnWorker`   | Runs it over a NodeTool worker's bridge       |

Running a ComfyUI graph is image generation, which is what the profile is for.
Each node calls the server its own property names, so the address is graph data;
that egress policy is written down in the ComfyUI row of
[url-egress-inventory.md](url-egress-inventory.md).

### Creative media toolkit

| Namespace   | What it is                                            |
| ----------- | ----------------------------------------------------- |
| `lib.image` | Photoshop-style ops: warp, color, draw, effects, …    |
| `lib.svg`   | SVG / vector graphics                                  |
| `lib.grid`  | Image grid slicing                                     |
| `lib.audio` | Audio DSP/effects (reverb, delay, EQ, …)               |
| `lib.pdf`   | Text/table/markdown extraction, OCR, page rasterization |

### Provider node namespaces

`openai.*`, `gemini.*`, `mistral.*`, `xai.*`, `fal.*`, `kie.*`

## Namespaces dropped (the "nerdy" set)

- **Data/docs:** `nodetool.data` (dataframes), `nodetool.document`,
  `lib.markdown`, `lib.html`, `lib.charts`
- **System/automation:** `lib.os`, `nodetool.workspace`,
  `nodetool.triggers`, `lib.browser`, `lib.video.download`
- **Databases/cloud/integrations:** `lib.sqlite`, `lib.http`, `lib.graphql`
  (`lib.comfy` is dropped as a namespace, but its two
  runners are allowlisted by name — see above)
- **Messaging:** `messaging.discord`, `messaging.telegram`
- **NLP/ML utility:** `vector` (RAG), `lib.validate`, `lib.datetime`
- **Out-of-scope providers:** `huggingface`, `transformers`, `minimax`, `reve`,
  `elevenlabs`, `replicate`, `together`, `topaz`, `atlascloud`

### Agents in `nodetool.agents`

The namespace is kept. The product surface is the standard Agent plus
Classifier, Extractor, Summarizer, CreateThread, and EnhancePrompt.
Specialist tool-agent nodes were removed. ffmpeg and page fetching are CodeAct
capabilities (`nodetool.media.ffmpeg`, `nodetool.web.browse`) — the same
binaries the image installs, reached from chat and from the Code node instead
of from an agent node. yt-dlp and the live browser are not: see below.

## yt-dlp

`lib.video.download.YtDlpDownload` was allowlisted by name, and the `yt_dlp`
capability behind `nodetool.media.downloadVideo()` was on every belt. Both are
off under the cloud profile.

A managed multi-tenant server pulling media from arbitrary sites on a user's
behalf is a different product from a downloader running on that user's own
machine, and datacenter egress is what those sites block first — so the node
offered cloud users a button that mostly returns an extractor error.

The node goes through the same registry prune as everything else. The
capability is dropped from the belt by `isYtDlpEnabled()`
([`packages/agents/src/yt-dlp-gate.ts`](../packages/agents/src/yt-dlp-gate.ts)),
which reads the same two env vars `isCloudProfileActive` reads, so chat and the
Code node cannot route around the node's absence:
`nodetool.media.downloadVideo()` throws the prelude's "not in this toolbelt"
error. The capability itself refuses too, for a host that resolves it by name.

The binary stays in the image: `docker-compose.yml` self-hosting runs the same
image with `NODETOOL_NODE_PROFILE=full`, and that install keeps both surfaces.

## The live browser

`lib.browser.Screenshot` fell out with its namespace — `lib.browser` is not in
`CLOUD_NODE_NAMESPACES` — and the fourteen `browser_*` capabilities that drive
the same page (`browser_view`, `browser_click`, `browser_capture_media`, …)
are off under the cloud profile too.

They are a single-tenant surface. The browser session is a **process
singleton**: one page, shared by every caller in the process, so on a managed
server two tenants' agents drive the same tab and whatever the first signed
into is what the second one's `browser_view` reads. The extension transport is
worse — `/ws/extension` is unauthenticated and single-connection, so one user's
own Chrome would be reachable by anybody's run. Neither is a defect to fix
behind a flag; both are what the surface is for. It belongs on a machine its
user owns.

The capabilities are dropped from the belt by `isBrowserEnabled()`
([`packages/agents/src/browser-gate.ts`](../packages/agents/src/browser-gate.ts)),
which reads the same two env vars `isCloudProfileActive` reads, so chat, an
AgentNode and the Code node all see the same absence. Each implementation
refuses as well, because the belt is discovery and not enforcement: the sandbox
mount serves every registered capability module, so a guest importing
`@nodetool-ai/sandbox-nodetool/browser` reaches them with no belt in between.

`/ws/extension` is gated separately and was already closed here — the route is
not registered when `NODETOOL_ENV=production` unless
`NODETOOL_ENABLE_EXTENSION_BRIDGE=1`. That switch now opens a bridge nothing on
a cloud deployment can use; the capabilities are off regardless of it.

Chromium stays in the image (`Dockerfile`), like the yt-dlp binary: the same
image self-hosts with `NODETOOL_NODE_PROFILE=full`, and that install keeps both
surfaces.

## Maintenance

- Re-add a whole capability → add a namespace to `CLOUD_NODE_NAMESPACES`.
- Re-add a single node from a trimmed namespace (e.g. `nodetool.code`) → add its
  node type to `CLOUD_NODE_ALLOWLIST`.
- Hide a single node from a kept namespace (e.g. a file-I/O node in
  `nodetool.text`, or a developer agent in `nodetool.agents`) → add its node
  type to `CLOUD_NODE_DENYLIST`.
- Hide a provider that cannot work in the cloud → add its id to
  `NON_CLOUD_PROVIDER_IDS`. A newly registered provider is offered by default;
  nothing needs editing to ship one. For whole provider packs, edit
  `CLOUD_BUILTIN_PACK_IDS`.
