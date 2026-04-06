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

# 16) run_shell_cli.json
npm run workflow -- ./examples/workflows/run_shell_cli.json --input command='echo hello-from-workflow'
```

## Agent + OpenAI provider examples

```bash
# 17) agent_openai_basic_cli.json
npm run workflow -- ./examples/workflows/agent_openai_basic_cli.json --input prompt='Write one sentence about workflow testing.'

# 18) agent_openai_with_thread_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_thread_cli.json --input title='OpenAI Thread Demo' --input prompt='List two automation benefits.'

# 19) agent_openai_with_history_cli.json
npm run workflow -- ./examples/workflows/agent_openai_with_history_cli.json --input history='[{"role":"user","content":"I created provider abstractions."},{"role":"assistant","content":"Great, now add integration tests."}]' --input prompt='Suggest one next step.'

# 20) agent_openai_with_messages_cli.json
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
