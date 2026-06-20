# Agent CLI Quick Reference

Quick reference for the `nodetool agent` command.

## Command Format

```bash
nodetool agent run <config.yaml> [--objective "..."] [OPTIONS]
nodetool agent test <config.yaml>
nodetool agent list <dir>
```

The objective comes from `--objective`, piped stdin, or the YAML `objective:` field (in that priority order).

## Common Usage Patterns

### Run an Agent with an Objective

```bash
nodetool agent run research-agent.yaml --objective "Research AI trends in 2025"
```

### Provide the Objective via stdin

```bash
echo "Research AI trends in 2025" | nodetool agent run research-agent.yaml
```

### Use the YAML's Default Objective

```bash
nodetool agent run research-agent.yaml
```

### Capture the Result

The result is written to stdout; the trace goes to stderr.

```bash
nodetool agent run agent.yaml --objective "Task" > result.txt
```

### JSON Event Stream (on stderr)

```bash
nodetool agent run agent.yaml --objective "Task" --json 2> events.jsonl
```

### Validate a Config

```bash
nodetool agent test agent.yaml
```

## Run Options

| Option | Description |
|--------|-------------|
| `-o, --objective <text>` | Objective (overrides stdin and the YAML default) |
| `-p, --provider <id>` | Override the provider |
| `-m, --model <id>` | Override the model |
| `-w, --workspace <path>` | Override the workspace directory |
| `--json` | Emit each event as a JSON line on stderr |
| `-v, --verbose` | Include low-level chunk events in the trace |

## Minimal Configuration

```yaml
name: my-agent
system_prompt: |
  You are a helpful assistant.
  Answer questions clearly and concisely.
model:
  provider: openai
  id: gpt-4o-mini
tools:
  - read_file
  - write_file
max_steps: 10
```

## Standard Tools

| Tool | Purpose |
|------|---------|
| `write_file` | Write files in the workspace |
| `read_file` | Read files from the workspace |
| `edit_file` | Edit an existing file |
| `list_directory` | List workspace contents |
| `glob` | Match files by glob pattern |
| `grep` | Search within files |
| `google_search` | Search the web |
| `browser` | Browse and extract web content |
| `run_code` | Run code in a sandbox |
| `generate_image` | Generate an image |
| `generate_speech` | Generate speech audio |
| `generate_video` | Generate a video |

## Model Recommendations

| Task Type | Planning Model | Main Model |
|-----------|----------------|------------|
| Analytical | gpt-4o-mini | gpt-4o |
| General | gpt-4o-mini | gpt-4o |
| Creative | gpt-4o-mini | gemini-2.0-flash |
| Code | gpt-4o-mini | claude-sonnet-4-6 |

## Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=...
```

## Examples

### Research Task

```bash
nodetool agent run examples/agents/research-agent.yaml \
  --objective "Research quantum computing applications" > research.md
```

### Code Generation

```bash
nodetool agent run examples/agents/code-assistant.yaml \
  --objective "Create a Python script to analyze CSV files"
```

### Automation Script

```bash
#!/bin/bash
for topic in "AI" "ML" "Web3"; do
  nodetool agent run research-agent.yaml \
    --objective "Find latest news about $topic" \
    > "reports/${topic}-$(date +%Y%m%d).md"
done
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Config errors | Run `nodetool agent test agent.yaml` to validate provider, model, and tools |
| Tool not found | Check the tool name against the available tools list (unknown names are ignored with a warning) |
| Rate limiting | Use a local model (`ollama`) |
| Slow planning | Use a faster planning model (`gpt-4o-mini`) |

## Links

- **Full Documentation:** [agent-cli.md](agent-cli.md)
- **Schema Reference:** [agent-config-schema.md](agent-config-schema.md)
- **Examples:** [examples/agents/](examples/agents/)
