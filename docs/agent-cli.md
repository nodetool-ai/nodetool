---
layout: page
title: "Agent CLI"
---

The `nodetool agent` command runs one CodeAct turn from the terminal. It takes
an objective, hands it to the model as the user message, and prints the final
answer. The model acts by writing sandboxed JavaScript over the toolbelt — the
same loop the chat runs — so what it does is up to it: call a tool, decompose
the objective with `create_plan` and run the DAG with `execute_plan`, or answer
straight away. Every run streams a live trace of tool calls, plan events, and
task events to stderr.

There is no configuration file. Everything the command needs is an argument.

## Subcommands

```bash
nodetool agent run --objective "..."   # run the agent loop
nodetool agent diagnose <job_id>       # aggregate a failed run into one report
```

### `nodetool agent run`

The objective comes from `-o, --objective` or, when that is absent, from piped
stdin.

```bash
nodetool agent run -p anthropic -m claude-sonnet-5 \
  --objective "Research the latest AI trends"

echo "Research the latest AI trends" | \
  nodetool agent run -p anthropic -m claude-sonnet-5
```

**Options:**

- `-o, --objective <text>` — Objective for the agent (else read from stdin)
- `-p, --provider <id>` — Provider id (required)
- `-m, --model <id>` — Model id (required)
- `-w, --workspace <path>` — Workspace dir for file tools (default: cwd)
- `--max-iterations <n>` — Tool-calling rounds in the turn (default 25)
- `--cost-cap <usd>` — Ceiling on provider spend for the whole run; `0` lifts it
- `--timeout <s>` — Wall-clock bound on the run in seconds; `0` leaves it none
- `--json` — Emit each agent event as a JSON line on **stderr**
- `-v, --verbose` — Include low-level chunk and other events in the trace

### Run budget

`--cost-cap` and `--timeout` override two of the five `NODETOOL_AGENT_*`
settings a chat turn reads (`NODETOOL_AGENT_TURN_COST_CAP_USD`,
`NODETOOL_AGENT_TURN_DEADLINE_MS`); concurrency, total turns, and the
unpriced-token ceiling come from the settings alone.

The run holds one budget and shares it downward — a sub-agent, an
`execute_plan` DAG, an `AgentNode` reached through `run_node` — so the ceiling
bounds the run, not each loop. A cap is admission: a turn whose worst case
would cross it is refused before the call, not noticed after the money is
spent. A model with no catalog price has no worst case and is admitted against
a prompt-token ceiling instead, never as free.

A ceiling that stops the run prints its reason and exits non-zero
(`agent stopped: turn budget of $0.01 reached`); with `--json` the same reason
arrives as an `error` event. Every run ends with what it committed —
`spent $0.0123`.

```bash
nodetool agent run -p openai -m gpt-5.4-mini -o "Research AI trends" \
  --cost-cap 0.50 --timeout 120
```

The final result goes to **stdout** and the trace goes to **stderr**, so you can
capture the result on its own:

```bash
nodetool agent run -p openai -m gpt-5.4-mini \
  -o "Summarize NodeTool" > result.txt
```

### Tools

The agent gets the default toolbelt: files, search, browser, PDF, vision,
critique, memory, assets, todo, plus the platform tools — workflows,
nodes, jobs, apps, models, and media generation. This is the same belt the chat
agent and the MCP bridge assemble, so the surfaces cannot drift. The belt is not
narrowable from the command line — `nodetool agent run` has no `--tools` flag.

The belt is assembled by `buildCliAgentBelt`, shared with the CLI's own chat,
and carries the capabilities that spawn loops of their own: `run_subtask`,
`start_subtask`, `wait_subtasks`, `run_search`, and — here, unlike chat — both
`create_plan` and `execute_plan`. The provider itself is offered `execute_code`
plus the direct tools; the rest of the belt lives in the sandbox.

### What the planner used to do

`agent run` used to plan a task DAG up front, execute it, and have a compiler
model write the final answer. The model now decides: it calls `create_plan` when
the objective wants decomposing, and `execute_plan` runs that DAG on the same
executor. Four things went with the old pipeline and have no replacement flag:
the plan approval prompt (the permission gate on `execute_plan` is the
approval), checkpoints and the plan cache, the separate planning and reasoning
models, and skill auto-selection by word overlap (the model loads a skill
itself). `--max-steps` is gone with them; `--max-iterations` now bounds
tool-calling rounds in the turn rather than action rounds per step.

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
