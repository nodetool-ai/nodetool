# TS Workflow JSON Examples

Run from the repository root.

```bash
npm run build
```

The workflow CLI supports:

- `--input key=value` (repeatable)
- `--inputs-json '{"k":"v"}'`
- `--params-file ./params.json`
- `--json` (raw full result)
- `--show-messages` (runner messages)

Input merge order:

1. file `params`
2. `--params-file`
3. `--inputs-json`
4. `--input`

## Routing examples

```bash
npm run workflow -- ./examples/workflows/hello_reroute.json --json
npm run workflow -- ./examples/workflows/if_true_route.json --json
```

## CLI input/output examples

```bash
# hello_input_output_cli.json
npm run workflow -- ./examples/workflows/hello_input_output_cli.json --input text='hello from cli'

# if_branch_cli.json
npm run workflow -- ./examples/workflows/if_branch_cli.json --input condition=true --input payload='{"kind":"demo","value":42}'

# wait_node_cli.json
npm run workflow -- ./examples/workflows/wait_node_cli.json --input input='{"message":"hello"}' --input timeout_seconds=0.02
```

## Trigger examples

One per trigger type, offline and deterministic. These carry no model node, so an
assertion never depends on an LLM.
`packages/base-nodes/tests/trigger-examples-run.test.ts` delivers an event to
each and asserts the payload that comes out.

```bash
npm run workflow -- ./examples/workflows/trigger_webhook_cli.json
npm run workflow -- ./examples/workflows/trigger_manual_cli.json
npm run workflow -- ./examples/workflows/trigger_interval_cli.json
npm run workflow -- ./examples/workflows/trigger_filewatch_cli.json
```

The interval and file-watch triggers wait on a live scheduler or filesystem
watcher, so run bare they never finish — that is the node behaving correctly.
The test wakes them with a delivered event instead.

## Python-node examples

These need the Python bridge (`nodetool.worker`); without it they fail to
resolve the node type.

```bash
npm run workflow -- ./examples/workflows/lib_librosa_mfcc_cli.json
npm run workflow -- ./examples/workflows/lib_pedalboard_reverb_cli.json
```

## DSL examples

TypeScript rather than JSON — run with `nodetool run`, which accepts a `.ts`
file directly.

```bash
npm run dev:nodetool -- run ./examples/workflows/add_numbers.ts
npm run dev:nodetool -- run ./examples/workflows/concat_text.ts
npm run dev:nodetool -- run ./examples/workflows/list_operations.ts
npm run dev:nodetool -- run ./examples/workflows/flux_3_dogs.ts   # needs FAL_API_KEY
```

## Offline node examples

Self-contained: every input is a constant in the graph, so these take no
`--input` and reach no model, network or disk. Each one covers a cluster of
nodes that had no example before, and
`packages/base-nodes/tests/pure-node-examples-run.test.ts` executes all of them
and asserts the value every node produced. Markdown parsing and HTML scraping
moved to the `@nodetool-ai/sandbox-markdown` and `@nodetool-ai/sandbox-html`
sandbox packs — see `packages/sandbox-packs/sandbox-markdown/SKILL.md` and
`packages/sandbox-packs/sandbox-html/SKILL.md` for the Code-node equivalents.

```bash
# string transforms — trim, case, prefix/suffix, index, slice
npm run workflow -- ./examples/workflows/text_transforms_cli.json

# regex match/extract/filter, JSON parsing, chunking with overlap
npm run workflow -- ./examples/workflows/text_regex_parse_cli.json

# streams: filter, drop-while, tap, collect; plus Switch and fallback routing
npm run workflow -- ./examples/workflows/control_flow_stream_cli.json

# writing a workflow variable and reading it back
npm run workflow -- ./examples/workflows/variables_cli.json
```

A stream wired straight into an `Output` records only its **last** item —
`Output` captures the value its actor holds when it completes. Put a
`nodetool.control.Collect` in between to materialize the whole stream;
`control_flow_stream_cli.json` shows the wiring.

## Input examples

These carry their own values, so they run bare — but their point is the
`params` mapping, which matches a param to an input node by that node's `name`
and falls back to the node's own `value`. Pass `--input` to see the override.
`packages/base-nodes/tests/input-and-data-examples-run.test.ts` runs each one
twice, with and without params, and asserts both.

```bash
# bool, int, float, string, select, string/text list
npm run workflow -- ./examples/workflows/inputs_scalar_cli.json
npm run workflow -- ./examples/workflows/inputs_scalar_cli.json --input title='overridden' --input count=42

# dataframe, document, image size, colour, paths, and a message deconstructed
npm run workflow -- ./examples/workflows/inputs_typed_cli.json

# language, image, video, ASR, TTS, embedding and HuggingFace model references
# (selecting a model is not using one — nothing here contacts a provider)
npm run workflow -- ./examples/workflows/inputs_model_selectors_cli.json
```

A numeric param outside an input's `min`/`max` is **silently clamped**, not
rejected — `count=500` against `max: 100` yields 100. `SelectInput` is the
exception: a value outside its options fails the run.

## Image examples

These need a WebGPU adapter. The image nodes go through Dawn, which has no
software fallback, so a machine with no Vulkan driver fails them all with "No
WebGPU adapter available". CI installs `mesa-vulkan-drivers` (lavapipe) for
this; locally, `apt-get install -y mesa-vulkan-drivers` or see
[docs/dev-environment.md § WebGPU on a headless machine](../../docs/dev-environment.md#webgpu-on-a-headless-machine)
for the no-root route.

These used to hang the CLI after printing their results: Dawn keeps a handle on
the event loop for the process lifetime, so a host that waits for the loop to
drain never exits. `scripts/run-workflow.mjs` now exits explicitly once the run
is done, so they finish normally and the exit code is usable in a script.

```bash
# Background, radial/angular/diamond gradients, seeded noise
npm run workflow -- ./examples/workflows/image_generators_cli.json

# Resize, Scale, Tile, RotateAndFlip, read back through GetMetadata
npm run workflow -- ./examples/workflows/image_geometry_cli.json

# Invert, Posterize, compared pixel-wise with CompareImages
npm run workflow -- ./examples/workflows/image_color_roundtrip_cli.json

# CDL, curves, film look, HSL, lift/gamma/gain, split toning, vignette,
# exposure, grade, levels, and the enhance filters
npm run workflow -- ./examples/workflows/image_grading_cli.json

# Affine, corner pin, displace, offset, pad, polar remap, spherize, paste
npm run workflow -- ./examples/workflows/image_warp_cli.json

# masks, channel shuffle/merge, chroma and luma keys, effects and filters
npm run workflow -- ./examples/workflows/image_masks_effects_cli.json
```

Three things about these nodes that the property names do not tell you:

- **`lib.image.warp` distances are fractions of the image, not pixels.**
  `Pad` with `left: 5` asks for five times the width, not a 5px border; use
  `0.25`. `Offset` with `dx: 1` is a whole-width shift, so with wrap on it
  returns the original image.
- **Units are per-parameter elsewhere.** `filter.Expand.border`,
  `effects.Outline.width` and `effects.DropShadow.radius` are pixels, while
  `DropShadow.offset_x`/`offset_y` are fractions.
- **`mask.Apply` reads coverage from the mask's alpha channel.**
  `mask.FromImage` mode 0 reads alpha and mode 1 reads luminance, so deriving a
  mask from an opaque image in mode 0 yields one that covers everything and
  `Apply` silently does nothing. `DropShadow` and `Outline` likewise work on the
  alpha silhouette and draw nothing against a fully opaque frame.

`lib.image.warp.Tile` repeats the image *inside* the existing canvas rather
than growing it: 3×2 tiles of a 64×64 image is still 64×64.

## Agent + OpenAI provider examples

These call a real provider, so they need `OPENAI_API_KEY`. Each carries its
model on the `LanguageModelInput` node, so `nodetool validate` passes without
running them.

```bash
# agent_openai_basic_cli.json
npm run workflow -- ./examples/workflows/agent_openai_basic_cli.json --input prompt='Write one sentence about workflow testing.'

# agent_openai_with_thread_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_thread_cli.json --input title='OpenAI Thread Demo' --input prompt='List two automation benefits.'

# agent_openai_with_history_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_history_cli.json --input history='[{"role":"user","content":"I created provider abstractions."},{"role":"assistant","content":"Great, now add integration tests."}]' --input prompt='Suggest one next step.'

# agent_openai_with_messages_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_messages_cli.json --input message='{"id":"m1","thread_id":"t1","role":"user","provider":"openai","model":"gpt-4o","content":[{"type":"text","text":"Summarize this plan in one line."}]}'
```

## Params-file override example

```bash
cat > /tmp/workflow-params.json <<'JSON'
{"condition":false,"payload":{"source":"file"}}
JSON
npm run workflow -- ./examples/workflows/if_branch_cli.json --params-file /tmp/workflow-params.json --input condition=true
```

## Notes

- By default, CLI output includes resolved `params` and final `outputs`.
- Use `--json` to print the full raw run result.
- Workflow shape:
  - `graph.nodes` + `graph.edges`
  - optional `params` keyed by input-node `name`
