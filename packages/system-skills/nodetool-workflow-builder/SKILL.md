---
name: nodetool-workflow-builder
description: "Create or edit NodeTool workflow graphs, connections, and properties using UI, headless tools, or requested workflow files."
featured: true
---

# Build NodeTool workflows

Create or edit a workflow that produces the requested outputs from the specified
inputs. Preserve existing nodes and connections outside the requested change.

## A graph is one surface among several

NodeTool holds several document kinds, and most of them are not graphs. Build a
graph when the user asked for one, when the job has to re-run on new inputs, or
when the result must be callable over the API. Otherwise route the request.

| The deliverable | Skill |
|---|---|
| A finished video, still set or campaign | `storyboard-core`, which picks the job skill |
| A screen someone clicks | `nodetool-app-builder` |
| A repair on footage already cut: cutout, upscale, lip sync, generated sound | `nodetool-video-post` |
| A cut, titles, transitions or animation on a timeline | the `motion-graphics` system skill, via `load_skill` |
| Logic in JavaScript rather than nodes | `nodetool-js-scripting` |
| A layered image, mask or overlay | `nodetool-sketch` |
| A 3D model or scene | `nodetool-3d-scene` |
| A playable 2D or 3D game | `native-game` |
| A math or explainer animation in Python | `manimgx` |
| Document indexing, vector search, RAG | `nodetool-rag-indexing` |
| Navigating, reading or filling in web pages | `nodetool-browser-agent` |
| A reusable video template for batches | `video-workflow` |
| A new node type | `nodetool-custom-node-developer` |

A workflow can still be the right answer alongside one of these: a mini app runs
workflows, and a timeline clip can be produced by one.

Use the authoring surface the user requested: the graph tools for a saved or
open workflow, and JSON or the TypeScript DSL when a workflow file is
requested. Do not claim a missing tool is callable. Use the live schemas and
registry as the source of identifiers.

## Build and verify

1. Inspect the existing graph for edits (`ui_get_graph` or `get_workflow`).
   Identify required inputs, outputs, and behavior from the request.
2. Find node types. On the canvas, `ui_search_nodes` with
   `include_properties: true` and `include_outputs: true` returns property and
   output names. Headlessly, `search_nodes {query: [...]}` finds the type and
   `get_node_info {node_type}` returns its inputs, outputs, types and defaults.
   Pick models with `find_model` (headless) or `ui_search_models` (canvas). Do
   not invent node types, properties, handles, or model identifiers.
3. Add or update nodes, set required properties, and connect compatible handles.
   Keep existing layout and identifiers when editing.
4. Validate with `ui_get_graph` (its `validation` field) or `validate_workflow`.
   Fix errors and required-input warnings. Read back the saved graph before
   claiming it was created or changed. Report any remaining limitation.
5. Execute only when the request includes a run. A run of generation nodes
   spends provider money, so confirm scope with the user first. Report the
   workflow id, inputs, validation result, and actual run outcome.

If a node is unavailable, broaden the search and inspect supported alternatives.
Proceed with an equivalent composition when it preserves the requested behavior.
Otherwise explain the missing capability and ask only for the decision needed to
choose an alternative. Continue independent work on the rest of the graph.

## Graph tools

These edit one workflow. With the workflow open in the editor they act on the
live canvas. With no editor open, the eight graph tools (`ui_get_graph`,
`ui_add_node`, `ui_connect_nodes`, `ui_update_node_data`, `ui_delete_node`,
`ui_delete_edge`, `ui_move_node`, `ui_set_node_title`) read and write the saved
workflow named by `workflow_id`. Each mutation also accepts
`based_on_revision` (from `ui_get_graph`), which refuses the edit if the graph
changed.

| Tool | Purpose | Key params |
|------|---------|-----------|
| `ui_search_nodes` | Find node types | `query`, `input_type`, `output_type`, `include_properties`, `include_outputs`, `limit` |
| `ui_search_models` | Models for a generic AI node | `kind` (`text_to_image`, `image_to_image`, `text_to_video`, `image_to_video`, `reference_to_video`, `text_to_speech`, `text_to_music`, `audio_to_audio`, `speech_to_text`, `text_generation`, `embedding`), `limit` |
| `ui_add_node` | Add one node | `id`, `type`, `position {x, y}`, `properties` |
| `ui_connect_nodes` | Connect two nodes | `source_node_id`, `source_handle`, `target_node_id`, `target_handle` |
| `ui_update_node_data` | Merge into a node's `data` | `node_id`, `data` (e.g. `{properties: {…}}`, `{dynamic_outputs: {…}}`, `{title}`) |
| `ui_get_graph` | Read graph, revision and validation | `workflow_id` |
| `ui_delete_node` / `ui_delete_edge` | Remove | `node_id` / `edge_id` |
| `ui_move_node` | Reposition | `node_id`, `position {x, y}` |
| `ui_set_node_title` | Rename a node | `node_id`, `title` |
| `ui_open_workflow` | Open a workflow tab | `workflow_id` |
| `ui_run_workflow` | Execute | `workflow_id`, `params` |

`ui_add_node` takes `properties` only. Anything else on the node's `data`, such
as `dynamic_outputs`, is set afterwards with `ui_update_node_data`.

## Workflow tools

These need no editor.

| Tool | Purpose |
|---|---|
| `list_workflows`, `get_workflow` | Find and read a workflow |
| `search_nodes`, `get_node_info`, `list_nodes` | Node discovery. `search_nodes` hides provider nodes (`openai.*`, `kie.*`, …) unless `include_provider_nodes: true`, which is for a provider the user named |
| `find_model` | A `{provider, model}` ref for a generic AI node's `model` property |
| `create_workflow {name, graph}` | Save a new graph. Nodes are `{id, type, properties}`. Edges are `{source, sourceHandle, target, targetHandle}` |
| `validate_workflow {workflow_id \| graph}` | Static check: unknown types, missing properties, unselected models, bad edges |
| `run_workflow`, `start_background_job`, `debug_workflow` | Execute, execute without waiting, or execute with a full debug report |
| `run_node {node_type, inputs}` | Run one node to probe what it does (chat only) |

For a brief rather than a graph, the planner builds one: `plan_workflow
{workflow_id}` stores a plan whose steps map to registry node types,
`update_workflow_plan_step` fixes a step the registry lacks, and
`build_workflow_from_plan {workflow_id}` places and validates the nodes. On the
canvas the same flow is `ui_workflow_plan`, `ui_workflow_update_plan_step` and
`ui_workflow_build_from_plan`.

## Node catalog

Catalog entries are search leads. Confirm each type with `get_node_info` or
`ui_search_nodes` before using it.

| Namespace | Common nodes |
|---|---|
| `nodetool.input` | `StringInput`, `IntegerInput`, `FloatInput`, `BooleanInput`, `ImageInput`, `AudioInput`, `VideoInput`, `DocumentInput`, `MessageInput`, `LanguageModelInput` |
| `nodetool.output` | `Output`. `nodetool.workflows.base_node.Preview` shows an intermediate value |
| `nodetool.constant` | `String`, `Integer`, `Float`, `Bool`, `List`, `Dict`, `Image`, `Audio`, `Video`, `JSON` |
| `nodetool.agents` | `Agent`, `Summarizer`, `Extractor`, `Classifier`, `Decision`, `EnhancePrompt`, `CreateThread` |
| `nodetool.generators` | `ListGenerator`, `DataGenerator`, `StructuredOutputGenerator`, `ChartGenerator`, `SVGGenerator` |
| `nodetool.text` | `Template`, `Concat`, `Prompt`, `FilterString`, `FilterRegexString`, `Embedding`, `AutomaticSpeechRecognition`, `SaveText` |
| `nodetool.code` | `Code`: a JavaScript body. See `nodetool-js-scripting` |
| `nodetool.control` | `If`, `Switch`, `ForEach`, `Collect`, `Loop`, `Chunk`, `Take`, `Zip`, `RepeatCount`, `RepeatValue`, `TryCatch` |
| `nodetool.data` | `ForEachRow`, `LoadCSVAssets` |
| `nodetool.document` | `LoadDocumentFile`, `SaveDocumentFile`, `ListDocuments` |
| `nodetool.image` | `TextToImage`, `ImageToImage`, `LoadImageFile`, `SaveImage`, `Resize`, `Crop`, `RotateAndFlip`, `Compositor`, `Upscale`, `RemoveBackground` |
| `nodetool.audio` | `TextToSpeech`, `TextToMusic`, `LoadAudioFile`, `SaveAudio`, `AudioMixer`, `Concat`, `Trim`, `Normalize` |
| `nodetool.video` | `TextToVideo`, `ImageToVideo`, `ReferenceToVideo`, `LoadVideoFile`, `SaveVideo`, `Concat`, `Trim`, `ExtractFrame`, `ExtractAudio`, `AddAudio`, `GetVideoInfo` |
| `vector` | `Collection`, `IndexTextChunk`, `QueryText`, `HybridSearch`. See `nodetool-rag-indexing` |
| `lib.*` | `lib.pdf` (text, tables, page images), `lib.image.*` (filters, color, draw), `lib.audio.*` (effects), `lib.svg`, `lib.charts.ChartRenderer`, `lib.browser.Screenshot`, `lib.sqlite.GetDatabasePath` |

`lib.http`, `lib.os`, `lib.datetime`, `lib.json`, `lib.math`, `lib.uuid`,
`nodetool.boolean`, `nodetool.dictionary`, `nodetool.list`, `nodetool.numbers`,
the old `nodetool.text` helpers such as `Slugify` and `Chunk`, and all `skills.*`
nodes have been removed. Use the Code node (`nodetool.code.Code`) and its
snippet library instead. Its body is plain JavaScript with `fetch`,
`workspace.*` and the other globals `nodetool-js-scripting` lists. Libraries
such as `@nodetool-ai/sandbox-dates` are imported sandbox packages, not globals.

### Generation nodes

Use the generic nodes with a `model` property: `nodetool.image.TextToImage`,
`ImageToImage`, `nodetool.video.TextToVideo`, `ImageToVideo`,
`ReferenceToVideo`, `nodetool.audio.TextToSpeech`, `TextToMusic`. Set `model`
from `find_model` or `ui_search_models`. A provider's own node (`kie.video.*`,
`openai.*`, `gemini.*`, …) exposes that model's extra settings. Search for one
only when the user named the provider or needs a setting the generic node does
not carry, with `include_provider_nodes: true` on `search_nodes`.

### Data types

- **Primitives**: `str`, `int`, `float`, `bool`, `list`, `dict`, `any`
- **Assets**: `{type: "image|audio|video|document", uri: "..."}`
- **Models**: `language_model`, `image_model`, `video_model`, `embedding_model`, `tts_model`

Edges enforce type compatibility. Use `any` for flexible connections. Search
with `input_type` / `output_type` (`"str"`, `"image"`, `"list"`, …) to find a
node that fits a handle.

## Workflow patterns

- **Pipeline.** Input → transforms → Output. For example `ImageInput` →
  `lib.image.enhance.AutoContrast` → `SaveImage` → `Output`.
- **Agent generation.** Input → `Agent` or `Summarizer` → post-process →
  Output. `ListGenerator` streams one item per line for fan-out.
- **Previews.** Put `Preview` nodes after intermediate stages of a multi-stage
  generation so progress is visible.
- **RAG.** Index: Code node (`workspace.list`) → `LoadDocumentFile` → Code node
  ("Chunk Text" snippet) → `vector.IndexTextChunk`. Query: `StringInput` →
  `vector.HybridSearch` → `Template` → `Agent` → `Output`. See
  `nodetool-rag-indexing`.
- **Realtime.** `RealtimeAudioInput` → `openai.agents.RealtimeAgent` or
  `openai.agents.LiveAgent` → `Preview`. `LiveAgent` runs full-duplex speech;
  feed it 24 kHz PCM16 microphone chunks.
- **Multi-modal.** Chain modalities: `AutomaticSpeechRecognition` → `Agent` →
  `TextToImage`, or `ExtractAudio` → `AutomaticSpeechRecognition` →
  `Summarizer`.
- **Generated media.** `StringInput` (prompt) → `TextToVideo` → `Output`, or
  `ImageInput` + `StringInput` → `ImageToVideo` → `Output`. For lip sync,
  upscaling or avatar work, search `"lip sync"`, `"upscale"` or `"avatar"`.

### Agent outputs and tools

- `dynamic_outputs` on an `Agent` (`{"title": {"type": "str"}}`) declares
  structured result fields. The model fills them through a submit tool, and each
  becomes an output handle.
- To let an Agent call another node as a tool, connect it with a control edge
  (`edge_type: "control"`, both handles `__control__`). The Agent's regular
  outputs (`text`, `chunk`) still route to `Preview` or `Output`.

### Streaming and control flow

- Everything is a stream. A single value is a one-item stream.
- `nodetool.control.Collect` gathers a stream into a list.
  `nodetool.control.ForEach` emits each item of a list.
- `nodetool.control.Loop` repeats part of the graph: wire `initial` into the
  body, the body's result back into `next`, and a bool into `condition` (loop
  again while true). `max_iterations` bounds it and `done` carries the final
  value. It is the only way to close a cycle. The DSL cannot express the back
  edge, so build loops with the graph tools or workflow JSON.
- `nodetool.agents.Decision` lets a model make the call: `prompt` is a yes/no
  question, `value` is what it judges (images are shown to the model),
  `decision` is the bool and `if_true`/`if_false` route `value` like `If`. Wire
  `decision` into `Loop.condition` to loop until a model is satisfied, and phrase
  the question so yes means "loop again".

## Debugging and validation

`ui_get_graph` returns a `validation` field:

- `errors`: blocking issues, such as invalid node types or a Code body that does
  not parse.
- `warnings`: disconnected required inputs and empty required properties.
- `suggestions`: orphaned nodes.

`validate_workflow` is the headless equivalent and also catches unselected
models and model ids a provider does not offer. Fix blocking errors and the
warnings that prevent the requested behavior. Explain any remaining warning
without expanding the task.

- **"Required property 'X' is not set"**: set it with `ui_update_node_data` or in
  the graph's `properties`. Common ones are `model` and `prompt`.
- **"Required input 'X' not connected"**: add an edge or set a value.
- **Wrong handle name**: re-read the type with `get_node_info` or
  `ui_search_nodes {include_outputs: true}`.
- **Type mismatch**: compare the source output type with the target input type.
- **Node not found**: broaden the query or search by namespace prefix
  (`"nodetool.text"`).

Do not retry a failing call unchanged. Agent and generator nodes need `model`,
generation nodes need `prompt`, and `ForEach` needs a list input. Set them or ask
the user which value to use.

## Running workflows from a shell

This section is for a person or agent with a shell. The in-product agent uses
`run_workflow` instead.

```bash
nodetool workflows run ./workflow.json --params '{"input": "hello"}' --json
nodetool workflows run ./workflow.ts --json    # a DSL file, built then run
nodetool workflows run <workflow_id>
nodetool workflows list
nodetool workflows get <id>
nodetool jobs list
nodetool serve --port 7777

# From a NodeTool checkout
npm run workflow -- ./workflow.json --input text='hello' --show-messages
```

## TypeScript DSL

Write workflows as TypeScript with `@nodetool-ai/dsl`. Namespaces mirror node
namespaces: `nodetool.text` is `text`, `nodetool.control` is `control`,
`lib.pdf` is `libPdf`, `vector` is `vector`.

```typescript
import { workflow, input, text, agents, output } from "@nodetool-ai/dsl";

const topic = input.stringInput({ name: "topic", value: "tides" });
const brief = text.template({
  string: "Explain {{ topic }} to a ten-year-old.",
  topic: topic.output()
});
const answer = agents.summarizer({ text: brief.output() });
const result = output.output({ name: "answer", value: answer.output("text") });

const wf = workflow(result);
console.log(JSON.stringify(wf));
```

- **`node.output()`** is a function. It returns the default output handle and
  only works on a node with one. Name the slot on a multi-output node:
  `answer.output("text")`, `branch.output("if_true")`.
- **Connectable**: every input accepts a literal value or an output handle.
- **`workflow(...terminals)`** traces from the terminal nodes and returns
  serializable `{nodes, edges}`. A node shared by two branches appears once.
- **`run(wf, opts?)`** executes in-process. **`runGraph(...terminals)`** is
  `run(workflow(...terminals))`.
- Dynamic inputs are extra keys, as `topic` on `text.template` above.
- There is no `libMath`, `libHttp` or `list` namespace. Use `code.code` for
  arithmetic, JSON, list and HTTP logic.
