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

## Legacy examples

```bash
npm run workflow -- ./examples/workflows/hello_reroute.json --json
npm run workflow -- ./examples/workflows/concat_text.json --json
npm run workflow -- ./examples/workflows/if_true_route.json --json
npm run workflow -- ./examples/workflows/list_range_foreach.json --json
npm run workflow -- ./examples/workflows/combine_dictionary.json --json
```

## CLI input/output examples

```bash
# 1) hello_input_output_cli.json
npm run workflow -- ./examples/workflows/hello_input_output_cli.json --input text='hello from cli'

# 2) concat_text_cli.json
npm run workflow -- ./examples/workflows/concat_text_cli.json --inputs-json '{"a":"Node","b":"Tool"}'

# 3) format_text_cli.json
npm run workflow -- ./examples/workflows/format_text_cli.json --inputs-json '{"template":"Hi {{ name }} from {{ city }}","name":"Ada","city":"Paris"}'

# 4) replace_text_cli.json
npm run workflow -- ./examples/workflows/replace_text_cli.json --input text='a-b-a-b' --input old='a' --input new='x'

# 5) compare_numbers_cli.json
npm run workflow -- ./examples/workflows/compare_numbers_cli.json --input a=9 --input b=4 --input comparison='>'

# 6) if_branch_cli.json
npm run workflow -- ./examples/workflows/if_branch_cli.json --input condition=true --input payload='{"kind":"demo","value":42}'

# 7) list_range_cli.json
npm run workflow -- ./examples/workflows/list_range_cli.json --input start=1 --input stop=10 --input step=2

# 8) list_slice_cli.json
npm run workflow -- ./examples/workflows/list_slice_cli.json --input values='[0,1,2,3,4,5]' --input start=2 --input stop=5

# 9) list_aggregates_cli.json
npm run workflow -- ./examples/workflows/list_aggregates_cli.json --input values='[3,6,9,12]'

# 10) combine_dictionary_cli.json
npm run workflow -- ./examples/workflows/combine_dictionary_cli.json --input dict_a='{"left":1,"shared":"L"}' --input dict_b='{"right":2,"shared":"R"}'

# 11) get_dictionary_value_cli.json
npm run workflow -- ./examples/workflows/get_dictionary_value_cli.json --input dictionary='{"name":"nodetool","lang":"ts"}' --input key='lang' --input default='missing'

# 12) parse_json_dictionary_cli.json
npm run workflow -- ./examples/workflows/parse_json_dictionary_cli.json --input json_string='"{\"project\":\"nodetool\",\"version\":1}"'

# 13) import_csv_select_cli.json
npm run workflow -- ./examples/workflows/import_csv_select_cli.json --input csv_data=$'team,score,city\nA,10,NY\nB,5,SF' --input columns='team,score'

# 14) import_csv_aggregate_cli.json
npm run workflow -- ./examples/workflows/import_csv_aggregate_cli.json --input csv_data=$'team,score\nA,10\nA,20\nB,5' --input columns='team' --input aggregation='sum'

# 15) wait_node_cli.json
npm run workflow -- ./examples/workflows/wait_node_cli.json --input input='{"message":"hello"}' --input timeout_seconds=0.02
```

## Offline node examples

Self-contained: every input is a constant in the graph, so these take no
`--input` and reach no model, network or disk. Each one covers a cluster of
nodes that had no example before, and
`packages/base-nodes/tests/pure-node-examples-run.test.ts` executes all ten and
asserts the value every node produced.

```bash
# string transforms — trim, case, prefix/suffix, index, slice
npm run workflow -- ./examples/workflows/text_transforms_cli.json

# regex match/extract/filter, JSON parsing, chunking with overlap
npm run workflow -- ./examples/workflows/text_regex_parse_cli.json

# markdown → headers, bullet and numbered lists, code blocks, tables
npm run workflow -- ./examples/workflows/markdown_extract_cli.json

# HTML → title/description/keywords, links, images, video, audio, plain text
npm run workflow -- ./examples/workflows/html_extract_cli.json

# email / URL / IP validation and sanitizing untrusted text
npm run workflow -- ./examples/workflows/validate_strings_cli.json

# building lists by range, repetition and tiling
npm run workflow -- ./examples/workflows/list_build_cli.json

# streams: filter, drop-while, tap, collect; plus Switch and fallback routing
npm run workflow -- ./examples/workflows/control_flow_stream_cli.json

# formatting, shifting and comparing dates
npm run workflow -- ./examples/workflows/datetime_cli.json

# querying a dataframe parsed out of a markdown table
npm run workflow -- ./examples/workflows/dataframe_query_cli.json

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

# Pivot, ForEachRow, Schema, RepeatValue
npm run workflow -- ./examples/workflows/dataframe_reshape_cli.json
```

A numeric param outside an input's `min`/`max` is **silently clamped**, not
rejected — `count=500` against `max: 100` yields 100. `SelectInput` is the
exception: a value outside its options fails the run.

## Image examples

These need a WebGPU adapter. The image nodes go through Dawn, which has no
software fallback, so a machine with no Vulkan driver fails them all with "No
WebGPU adapter available". CI installs `mesa-vulkan-drivers` (lavapipe) for
this; locally, `apt-get install -y mesa-vulkan-drivers` or see
[AGENTS.md § WebGPU on a headless machine](../../AGENTS.md#webgpu-on-a-headless-machine)
for the no-root route.

```bash
# Background, radial/angular/diamond gradients, seeded noise
npm run workflow -- ./examples/workflows/image_generators_cli.json

# Resize, Scale, Tile, RotateAndFlip, read back through GetMetadata
npm run workflow -- ./examples/workflows/image_geometry_cli.json

# Invert, Posterize, compared pixel-wise with CompareImages
npm run workflow -- ./examples/workflows/image_color_roundtrip_cli.json
```

`lib.image.warp.Tile` repeats the image *inside* the existing canvas rather
than growing it: 3×2 tiles of a 64×64 image is still 64×64.

## Agent + OpenAI provider examples

```bash
# 16) agent_openai_basic_cli.json
npm run workflow -- ./examples/workflows/agent_openai_basic_cli.json --input prompt='Write one sentence about workflow testing.'

# 17) agent_openai_with_thread_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_thread_cli.json --input title='OpenAI Thread Demo' --input prompt='List two automation benefits.'

# 18) agent_openai_with_history_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_history_cli.json --input history='[{"role":"user","content":"I created provider abstractions."},{"role":"assistant","content":"Great, now add integration tests."}]' --input prompt='Suggest one next step.'

# 19) agent_openai_with_messages_cli.json
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
- `parse_json_dictionary_cli.json` expects `json_string` to be a string containing JSON, so the value itself must be quoted as shown above.
- Workflow shape:
  - `graph.nodes` + `graph.edges`
  - optional `params` keyed by input-node `name`
