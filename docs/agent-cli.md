---
layout: page
title: "Agent CLI"
---

The `nodetool agent` command runs autonomous AI agents defined in YAML configuration files. Agents use the planning agent architecture to break an objective into steps, execute them with tools, and return a final result. Every run streams a live trace of planning, tool calls, and step results to stderr.

## Overview

The agent CLI enables:

- **Autonomous execution**: Run agents that plan and execute tasks independently
- **YAML configuration**: Define agent behavior, model, and tools in a config file
- **Planning agent integration**: Objectives are decomposed into a step DAG and executed
- **Tool orchestration**: Agents use multiple tools to accomplish complex goals
- **Workspace**: Each agent run operates against a workspace directory for file operations

## Subcommands

The `nodetool agent` command has three subcommands:

```bash
nodetool agent run <yaml-file>    # Run an agent from a YAML config
nodetool agent test <yaml-file>   # Validate a config (provider, model, tools)
nodetool agent list <dir>         # List YAML agent configs in a directory
```

### `nodetool agent run`

Runs an agent. The **objective** comes from one of three sources, in priority order:

1. The `-o, --objective "..."` flag
2. Piped stdin
3. The `objective:` field in the YAML file

```bash
# Objective via flag
nodetool agent run research-agent.yaml --objective "Research the latest AI trends"

# Objective via stdin
echo "Research the latest AI trends" | nodetool agent run research-agent.yaml

# Objective from the YAML file's `objective:` field
nodetool agent run research-agent.yaml
```

**Options:**

- `-o, --objective <text>` — Objective for the agent (overrides stdin and the YAML default)
- `-p, --provider <id>` — Override the provider from the YAML
- `-m, --model <id>` — Override the model from the YAML
- `-w, --workspace <path>` — Override the workspace directory from the YAML
- `--json` — Emit each agent event as a JSON line on **stderr** (the final result still goes to stdout)
- `-v, --verbose` — Include low-level chunk and other events in the trace

The final result is written to **stdout**; the live trace is written to **stderr**. This lets you capture the result cleanly:

```bash
nodetool agent run research-agent.yaml -o "Summarize NodeTool" > result.txt
```

### `nodetool agent test`

Validates a config without running it. Checks that `model.provider` and `model.id` are present, resolves the tool list (warning about any unknown tools), and tries to instantiate the provider.

```bash
nodetool agent test research-agent.yaml
```

### `nodetool agent list`

Lists the YAML agent configs in a directory, showing each file's provider/model and description.

```bash
nodetool agent list examples/agents/
```

## Agent Configuration

### YAML Structure

```yaml
# Agent identification
name: agent-name
description: Agent purpose and capabilities

# Core agent prompt
system_prompt: |
  Detailed instructions for agent behavior.
  Multiple lines supported.

# Default objective (used if --objective and stdin are both absent)
objective: Research the latest AI trends

# Model configuration
model:
  provider: openai     # AI provider
  id: gpt-4o           # Model identifier
  name: GPT-4o         # Display name (optional)

# Planning agent (optional)
planning_agent:
  enabled: true        # set false to plan with the main model instead
  model:
    provider: openai
    id: gpt-4o-mini

# Available tools
tools:
  - google_search
  - browser
  - write_file
  - read_file

# Execution parameters
max_tokens: 128000     # per-step context token budget (default 128000)
max_steps: 10          # maximum number of steps in the task

# Model preferences (optional)
preferred_providers:
  - anthropic
  - openai
preferred_models:
  image: black-forest-labs/flux-schnell

# Workspace
workspace:
  path: ~/agent-workspace
  auto_create: true
```

### Configuration Fields

- **name** — Identifier for the agent (used in the trace header).
- **description** — Human-readable description (shown by `agent list` / `agent test`).
- **system_prompt** — Instructions defining agent behavior.
- **objective** — Default objective, used when neither `--objective` nor stdin supplies one.
- **model** — Primary model: `provider` and `id` are required; `name` is optional. The provider can be overridden with `--provider`, the model with `--model`.
- **planning_agent** — Optional. When `enabled: false`, planning uses the main model instead of a separate planning model. When set with a `model`, that model is used for the planning phase. There is no requirement that planning be enabled.
- **tools** — List of tool names (see below). Unknown names are ignored with a warning.
- **max_steps** — Maximum number of steps in the planned task.
- **preferred_providers** — Provider ids to prefer when `find_model` ranks results. The first entry becomes the default provider hint when the LLM omits one. Also surfaced in the system prompt.
- **preferred_models** — Map of capability (e.g. `image`, `tts`) to preferred model id(s). Injected as the `model_hint` for matching `find_model` calls.
- **workspace** — `path` (tilde `~` is expanded) and `auto_create` (default behavior creates the directory unless set to `false`). Defaults to the current working directory.

### Model Configuration

```yaml
model:
  provider: openai        # Provider name
  id: gpt-4o              # Model ID
  name: GPT-4o            # Display name (optional)
```

Supported providers include:

- `openai` — OpenAI models
- `anthropic` — Anthropic Claude models
- `gemini` — Google Gemini models (the aliases `google` and `googleai` are normalized to `gemini`)
- `ollama` — Local models via Ollama
- Other registry providers as configured in NodeTool

### Available Tools

Tool names in the `tools:` list must match the agent's tool registry. Common tools:

**File Operations:**
- `write_file` — Write content to files
- `read_file` — Read file contents
- `edit_file` — Edit an existing file
- `list_directory` — List directory contents
- `glob` — Match files by glob pattern
- `grep` — Search within files

**Web Research:**
- `google_search` — Search the web (also `google_news`, `google_images`)
- `browser` — Browse and extract web content
- `download_file`, `http_request`

**Code Execution:**
- `run_code` — Run code in a sandbox

**Media Generation:**
- `generate_image`, `edit_image`, `animate_image`
- `generate_speech`, `transcribe_audio`
- `generate_video`

**Other:**
- `find_model`, `calculator`, `statistics`, `geometry`, `conversion`
- `extract_pdf_text`, `convert_pdf_to_markdown`, `convert_document`
- NodeTool MCP tools (workflows, nodes, jobs, assets, models)

Example tool configuration:

```yaml
tools:
  - google_search
  - browser
  - write_file
  - read_file
  - run_code
```

### Workspace Configuration

```yaml
workspace:
  path: ~/agent-workspace   # Workspace location (tilde is expanded)
  auto_create: true          # Create if it doesn't exist (default behavior)
```

If `workspace.path` is not specified (and `--workspace` is not passed), the workspace defaults to the current working directory.

## Example Configurations

### Research Agent

See [examples/agents/research-agent.yaml](examples/agents/research-agent.yaml) for a complete research agent configuration.

```bash
nodetool agent run examples/agents/research-agent.yaml \
  --objective "Research the impact of AI on software development"
```

### Code Assistant

See [examples/agents/code-assistant.yaml](examples/agents/code-assistant.yaml) for a coding agent.

```bash
nodetool agent run examples/agents/code-assistant.yaml \
  --objective "Create a Python script to analyze log files"
```

### Content Creator

See [examples/agents/content-creator.yaml](examples/agents/content-creator.yaml) for a content generation agent.

```bash
nodetool agent run examples/agents/content-creator.yaml \
  --objective "Write a blog post about sustainable technology"
```

## Use Cases

### Automated Research

```bash
nodetool agent run research-agent.yaml \
  --objective "Research competitors in the AI workflow space" > research-report.md
```

The agent will:
1. Plan a research strategy
2. Search for relevant information
3. Browse competitor websites
4. Extract and organize findings
5. Generate a report

### Code Generation and Refactoring

```bash
nodetool agent run code-assistant.yaml \
  --objective "Refactor utils.py to improve performance"
```

### Chaining Agent Runs

```bash
# Research phase
nodetool agent run research-agent.yaml \
  --objective "Research topic X" > research.md

# Writing phase
nodetool agent run content-creator.yaml \
  --objective "Write an article based on: $(cat research.md)"
```

### Automation Scripts

```bash
#!/bin/bash
# Daily research automation
for topic in "AI" "ML" "Web3"; do
  nodetool agent run research-agent.yaml \
    --objective "Find latest news about $topic" \
    > "reports/${topic}-$(date +%Y%m%d).md"
done
```

### Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

nodetool agent run agent.yaml --objective "Task"
```

## Output

By default, the run streams a human-readable trace to stderr (planning updates, tool calls, step results) and writes the final result to stdout. Pass `--json` to emit each event as a JSON line on stderr; the final result is still written to stdout.

```bash
# Capture the result, discard the trace
nodetool agent run agent.yaml --objective "Task" 2>/dev/null > result.txt

# Machine-readable event stream on stderr
nodetool agent run agent.yaml --objective "Task" --json 2>events.jsonl
```

## Best Practices

### System Prompt Design

```yaml
system_prompt: |
  You are a [role].

  Your responsibilities:
  1. [Task 1]
  2. [Task 2]

  Workflow:
  1. [Step 1]
  2. [Step 2]
```

### Model Selection

- **Planning model**: Use a fast, cost-effective model (`gpt-4o-mini`, a small Claude model)
- **Main model**: Use a stronger model for the actual reasoning
- **Code tasks**: Models with large context windows

### Tool Configuration

Start minimal and add tools as needed:

```yaml
tools:
  - read_file
  - write_file
  - google_search   # add when research is needed
  - browser         # add when detailed web content is needed
```

## Troubleshooting

### Validate the config first

```bash
nodetool agent test agent.yaml
```

This reports missing `model.provider` / `model.id`, unknown tool names, and provider instantiation failures.

### Use a faster model for planning

```yaml
planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini
```

### Use a local model to avoid rate limits

```yaml
model:
  provider: ollama
  id: llama3.2:3b
```

## Related Documentation

- [Chat & Agents](global-chat-agents.md) — Agent system overview
- [Chat CLI](chat-cli.md) — Interactive chat interface
- [NodeTool CLI](cli.md) — Complete CLI reference
- [Agent Configuration Schema](agent-config-schema.md) — YAML configuration reference
- [Agent Configuration Examples](examples/agents/) — Sample configurations
