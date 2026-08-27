---
layout: page
title: "Agent CLI"
---

The `nodetool agent` command runs the agent loop from the terminal. It takes an
objective, plans a step DAG, executes the steps against the default toolbelt,
and prints the final result. Every run streams a live trace of planning, tool
calls, and step results to stderr.

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
- `--max-iterations <n>` — Action rounds per step (default 15; raise for `claude_agent_sdk`)
- `--max-steps <n>` — Steps allowed in the run (default 50)
- `--json` — Emit each agent event as a JSON line on **stderr**
- `-v, --verbose` — Include low-level chunk and other events in the trace

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
