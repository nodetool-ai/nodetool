---
layout: page
title: "Agent CLI"
---

`nodetool agent run` gives the NodeTool agent one objective, lets it work with the same tools as chat, and prints the final answer to stdout. Progress (tool calls, plans, and tasks) streams to stderr, so you can pipe the answer into a file or another command. There is no configuration file.

Agent commands ship in the `cli-chat` command feature. Install it once:

```bash
nodetool packs add cli-chat --yes
```

## Subcommands

```bash
nodetool agent run --objective "..."   # run the agent loop
nodetool agent diagnose <job_id>       # aggregate a failed run into one report
```

### `nodetool agent run`

```bash
nodetool agent run -p anthropic -m claude-sonnet-5 \
  --objective "Research the latest AI trends"

echo "Research the latest AI trends" | \
  nodetool agent run -p anthropic -m claude-sonnet-5
```

**Options:**

- `-o, --objective <text>` — Objective for the agent. Without it, read from piped stdin
- `-p, --provider <id>` — Provider id (required)
- `-m, --model <id>` — Model id (required)
- `-w, --workspace <path>` — Workspace dir for file tools (default: cwd)
- `--max-iterations <n>` — Tool-calling rounds in the turn (default 25)
- `--permission-mode <default|auto|plan>` — How tool calls are gated (see [Permission mode](#permission-mode))
- `--cost-cap <usd>` — Ceiling on provider spend for the whole run; `0` lifts it
- `--timeout <s>` — Wall-clock bound on the run in seconds; `0` gives the run no time, so it stops before its first model call
- `--json` — Emit each agent event as a JSON line on **stderr**
- `-v, --verbose` — Include low-level chunk and other events in the trace

### Run budget

`--cost-cap` and `--timeout` override the per-turn defaults
`NODETOOL_AGENT_TURN_COST_CAP_USD` and `NODETOOL_AGENT_TURN_DEADLINE_MS`. The
other `NODETOOL_AGENT_*` limits come from your settings only.

The budget covers the whole run, including any sub-agents and plans the agent
starts. The agent checks the cap before each model call and refuses a call
that could cross it, so the run never spends past the cap. A model with no
known price is limited by prompt size instead.

A ceiling that stops the run prints its reason and exits non-zero
(`agent stopped: turn budget of $0.01 reached`); with `--json` the same reason
arrives as an `error` event. Every run ends with what it committed —
`spent $0.0123`.

```bash
nodetool agent run -p openai -m gpt-5.4-mini -o "Research AI trends" \
  --cost-cap 0.50 --timeout 120
```

### Permission mode

The modes are defined in the [CLI reference](cli.md#permission-mode). An
unrecognized value is an error. With a terminal on stdin, the default mode is `default`. The prompt goes to
stderr and takes `y` (this call), `n` (refuse), or `a` (this tool for the rest
of the run). When the objective arrives down a pipe nobody can answer, so the
run uses the headless gate (`auto`), prints a notice once, and denies anything
the gate escalates. An explicit `--permission-mode` still applies. With
`--json` the notice and any prompt arrive as `log_update` events.

### Tools

The agent gets the same tools as chat: files, search, browser, PDF, vision,
critique, memory, assets, and todo lists, plus the NodeTool tools for workflows,
nodes, jobs, apps, models, and media generation. You cannot narrow the set from
the command line, because `nodetool agent run` has no `--tools` flag.

For a large objective the agent can write a plan, run its tasks, and start
sub-agents. Running a plan asks for permission like any other external action,
so in `default` mode that prompt is your plan approval. `--max-iterations`
bounds the tool-calling rounds of the main turn.

### `nodetool agent diagnose`

Aggregates a failed run — the failing node or step, its error, the last LLM
call, and the agent's memory — into one report.

```bash
nodetool agent diagnose <job_id>
nodetool agent diagnose <job_id> --json
nodetool agent diagnose <job_id> --trace-file trace.jsonl
```

Messages and spans come from a debug bundle in `nodetool-debug/<job_id>-*/`
when one exists. `--trace-file` wins over `NODETOOL_TRACE_FILE`, which wins over
the bundle's own `trace.jsonl`. `--api-url` points the job lookup at a remote
server.

## Output

```bash
# Capture the result, discard the trace
nodetool agent run -p openai -m gpt-5.4-mini -o "Task" 2>/dev/null > result.txt

# Machine-readable event stream on stderr
nodetool agent run -p openai -m gpt-5.4-mini -o "Task" --json 2>events.jsonl
```

## API keys

Keys come from the secret store (`nodetool secrets store OPENAI_API_KEY`) or the
environment:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

## Chaining runs

```bash
nodetool agent run -p anthropic -m claude-sonnet-5 \
  -o "Research topic X" > research.md

nodetool agent run -p anthropic -m claude-sonnet-5 \
  -o "Write an article based on: $(cat research.md)"
```

## Related Documentation

- [Chat & Agents](global-chat-agents.md) — Agent system overview
- [Chat CLI](chat-cli.md) — Interactive chat interface
- [NodeTool CLI](cli.md) — Complete CLI reference
