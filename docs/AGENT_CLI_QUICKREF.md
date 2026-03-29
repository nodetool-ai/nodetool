# Agent CLI Quick Reference

Quick reference for the `nodetool agent` command.

## Command Format

```bash
nodetool agent --config <config.yaml> [OPTIONS]
```

## Common Usage Patterns

### Run Agent with Inline Prompt

```bash
nodetool agent --config research-agent.yaml --prompt "Research AI trends in 2025"
```

### Run Agent with Prompt from File

```bash
nodetool agent --config code-assistant.yaml --prompt-file task.txt
```

### Interactive Mode

```bash
nodetool agent --config content-creator.yaml --interactive
```

### Save Output to File

```bash
nodetool agent --config agent.yaml --prompt "Task" --output result.txt
```

### JSONL Output for Automation

```bash
nodetool agent --config agent.yaml --prompt "Task" --jsonl > output.jsonl
```

## Minimal Configuration

```yaml
name: my-agent
system_prompt: |
  You are a helpful assistant.
  Answer questions clearly and concisely.
model:
  provider: openai
  id: gpt-4o-mini
planning_agent:
  enabled: true
tools:
  - read_file
  - write_file
max_tokens: 4096
```

## Standard Tools

| Tool | Purpose |
|------|---------|
| `write_file` | Write files in workspace |
| `read_file` | Read files from workspace |
| `list_directory` | List workspace contents |
| `delete_file` | Delete workspace files |
| `google_search` | Search the web |
| `browser` | Browse and extract web content |
| `execute_code` | Run Python/JavaScript code |
| `terminal` | Execute shell commands |
| `grep` | Search within files |

## Interactive Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/workspace` | Show workspace path and files |
| `/tools` | List available tools |
| `/config` | Show current configuration |
| `/clear` | Clear conversation history |
| `/save [file]` | Save conversation to file |
| `/exit` | Exit interactive session |

## Model Recommendations

| Task Type | Planning Agent | Main Agent | Temperature |
|-----------|----------------|------------|-------------|
| Analytical | gpt-4o-mini | gpt-4o | 0.0-0.3 |
| General | gpt-4o-mini | gpt-4o | 0.7 |
| Creative | gpt-4o-mini | gemini-2.0-flash | 0.9-1.0 |
| Code | gpt-4o-mini | claude-3.5-sonnet | 0.3 |

## Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...
export NODETOOL_WORKSPACE=~/my-workspace
```

## Examples

### Research Task

```bash
nodetool agent \
  --config examples/agents/research-agent.yaml \
  --prompt "Research quantum computing applications" \
  --output research.md
```

### Code Generation

```bash
nodetool agent \
  --config examples/agents/code-assistant.yaml \
  --prompt "Create a Python script to analyze CSV files"
```

### Content Creation

```bash
nodetool agent \
  --config examples/agents/content-creator.yaml \
  --prompt "Write a blog post about AI workflows" \
  --output blog-post.md
```

### Automation Script

```bash
#!/bin/bash
# Daily research automation
for topic in "AI" "ML" "Web3"; do
  nodetool agent \
    --config research-agent.yaml \
    --prompt "Find latest news about $topic" \
    --output "reports/${topic}-$(date +%Y%m%d).md"
done
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Task doesn't complete | Increase `max_iterations` in config |
| Tool not found | Check tool name in available tools list |
| Rate limiting | Use local models or add retry logic |
| Performance issues | Use faster models for planning |

## Links

- **Full Documentation:** [agent-cli.md](agent-cli.md)
- **Schema Reference:** [agent-config-schema.md](agent-config-schema.md)
- **Examples:** [examples/agents/](examples/agents/)
- **Implementation Guide:** [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)
