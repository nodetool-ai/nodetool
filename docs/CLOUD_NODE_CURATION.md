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

> **One exception:** the **sandboxed Code node** (`nodetool.code.Code`, vm-based
> JavaScript) is kept. It is the intentional power-user escape hatch. The rest
> of `nodetool.code` (Python/Bash/Ruby/Lua subprocess + Docker runners) stays
> out — arbitrary process/Docker execution isn't appropriate for a managed
> multi-tenant cloud.

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
3. **Provider registry** — every provider outside the allowlist is pruned, so
   only the curated providers appear in model selectors.

The single source of truth is
[`packages/protocol/src/cloud-profile.ts`](../packages/protocol/src/cloud-profile.ts):
`CLOUD_NODE_NAMESPACES` (whole namespaces kept), `CLOUD_NODE_ALLOWLIST`
(individual node types kept from an otherwise-trimmed namespace — the sandboxed
Code node and the curated text nodes), `CLOUD_NODE_DENYLIST` (individual node
types dropped from a kept namespace), `CLOUD_PROVIDER_IDS`, and
`CLOUD_BUILTIN_PACK_IDS`. Maintaining the cloud offering = editing those lists.

## Providers

Limited to the big foundation-model labs plus Fal + Kie for media.

| Provider  | Id        | Role                          |
| --------- | --------- | ----------------------------- |
| OpenAI    | `openai`  | LLM, image, audio, realtime   |
| Anthropic | `anthropic` | LLM (via Agent/Chat nodes)  |
| Google    | `gemini`  | LLM, image, audio, video      |
| Mistral   | `mistral` | LLM, vision                   |
| xAI       | `xai`     | LLM, image, vision            |
| Groq      | `groq`    | Fast LLM (via Agent/Chat nodes) |
| Fal       | `fal_ai`  | Hosted image/video/audio models |
| Kie       | `kie`     | Hosted image/video/audio models |

Anthropic and Groq have **no dedicated node namespace** — they reach users
through the Agent / Chat / generator nodes via the provider registry.

**Dropped providers:** Replicate, Together, MiniMax, Topaz, Reve, AtlasCloud,
ElevenLabs, Cohere, Voyage, Jina, Moonshot, DeepSeek, OpenRouter, Cerebras,
Evolink, Aki, Meshy, Rodin, and all local runtimes (Ollama, LM Studio,
llama.cpp, vLLM, Hugging Face local, Transformers.js).

## Namespaces kept

### Workflow scaffolding (editor-essential)

| Namespace            | What it is                              |
| -------------------- | --------------------------------------- |
| `nodetool.input`     | Input nodes (text, number, image, …)    |
| `nodetool.output`    | Output nodes                            |
| `nodetool.constant`  | Constants                               |
| `nodetool.control`   | Control flow (If, ForEach, Switch, …)   |
| `nodetool.list`      | List ops                                |
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

`nodetool.text` and `nodetool.code` are **not** kept whole — only a curated
slice of each is admitted via `CLOUD_NODE_ALLOWLIST`:

| From `nodetool.code`   | Kept node                                     |
| ---------------------- | --------------------------------------------- |
| `Code`                 | Sandboxed (vm) JavaScript only                |

| From `nodetool.text`   | Kept nodes                                                  |
| ---------------------- | ---------------------------------------------------------- |
| Prompt building        | `Prompt`, `Template`, `FormatText`                          |
| Composition            | `Concat`, `Join`, `Collect`, `Replace`, `ToString`          |
| Light parsing/IO       | `Split`, `Slice`, `Chunk`, `Extract`, `ParseJSON`, `ExtractJSON`, `SaveText` |

Everything else in `nodetool.text` (regex, case/whitespace utilities, token
counting, embeddings, predicates, file I/O) and `nodetool.code` (Python/Bash/
Ruby/Lua subprocess + Docker runners) is dropped.

### Creative media toolkit

| Namespace   | What it is                                            |
| ----------- | ----------------------------------------------------- |
| `lib.image` | Photoshop-style ops: warp, color, draw, effects, …    |
| `lib.svg`   | SVG / vector graphics                                  |
| `lib.grid`  | Image grid combine/slice                               |
| `lib.audio` | Audio DSP/effects (reverb, delay, EQ, …)               |

### Provider node namespaces

`openai.*`, `gemini.*`, `mistral.*`, `xai.*`, `fal.*`, `kie.*`

## Namespaces dropped (the "nerdy" set)

- **Data/docs:** `nodetool.data` (dataframes), `nodetool.document`, `lib.pdf`,
  `lib.docx`, `lib.epub`, `lib.pptx`, `lib.excel`, `lib.ocr`, `lib.convert`,
  `lib.markdown`, `lib.html`, `lib.charts`
- **System/automation:** `lib.os`, `nodetool.workspace`, `nodetool.sandbox`,
  `nodetool.triggers`, `lib.browser`, `lib.video.download`
- **Databases/cloud/integrations:** `lib.sqlite`, `lib.supabase`, `lib.notion`,
  `lib.s3`, `lib.http`, `lib.graphql`, `lib.mail`, `lib.twilio`, `lib.rss`,
  `lib.secret`, `lib.comfy`
- **Search/scraping/messaging:** `search.google`, `apify.scraping`,
  `messaging.discord`, `messaging.telegram`
- **NLP/ML utility:** `lib.nlp`, `lib.tensorflow`, `vector` (RAG),
  `lib.validate`, `lib.datetime`
- **Out-of-scope providers:** `huggingface`, `transformers`, `minimax`, `reve`,
  `elevenlabs`, `replicate`, `together`, `topaz`, `atlascloud`

### Agents trimmed within `nodetool.agents`

The `nodetool.agents` namespace is kept, but the developer/automation agents are
removed via `CLOUD_NODE_DENYLIST` because they wrap the very integrations the
cloud profile drops:

`BrowserAgent`, `LiveBrowserAgent`, `DocxAgent`, `EmailAgent`,
`FilesystemAgent`, `GitAgent`, `HtmlAgent`, `HttpApiAgent`, `PdfLibAgent`,
`PptxAgent`, `SQLiteAgent`, `ShellAgent`, `SpreadsheetAgent`, `SupabaseAgent`,
`VectorStoreAgent`, `YtDlpDownloaderAgent`.

**Kept agents:** `Agent`, `Classifier`, `Extractor`, `Summarizer`,
`CreateThread`, `ImageAgent`, `MediaAgent`, `FfmpegAgent`, `DocumentAgent`.

## Maintenance

- Re-add a whole capability → add a namespace to `CLOUD_NODE_NAMESPACES`.
- Re-add a single node from a trimmed namespace (text/code) → add its node type
  to `CLOUD_NODE_ALLOWLIST`.
- Hide a single node from a kept namespace → add its node type to
  `CLOUD_NODE_DENYLIST`.
- Add/remove a provider → edit `CLOUD_PROVIDER_IDS` (and, for whole provider
  packs, `CLOUD_BUILTIN_PACK_IDS`).
