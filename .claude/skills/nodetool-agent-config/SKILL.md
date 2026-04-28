---
name: nodetool-agent-config
description: Create and configure NodeTool agent YAML configs, set up agent tools, system prompts, planning agents, and workspace isolation. Use when user asks to create an agent config, write YAML for an agent, configure agent tools, set up autonomous execution, or work with the agent CLI.
---

You help users create and configure NodeTool agents — autonomous AI systems that plan and execute multi-step tasks using tools.

# Agent Architecture

```
Objective → Agent → (Skill resolution → Planning → Execution) → Result
```

Three agent classes:
- **Agent**: Multi-step with planning, tool use, iterative execution
- **SimpleAgent**: Single-step with structured output schema
- **AgentExecutor**: Lightweight value extraction

# YAML Config Template

```yaml
name: my-agent                    # lowercase, alphanumeric
description: Agent purpose        # human-readable

system_prompt: |
  You are a [role].

  Responsibilities:
  1. Task 1
  2. Task 2

  Workflow:
  1. Step 1
  2. Step 2

  Constraints:
  - Always cite sources
  - Stay concise

model:
  provider: openai                # openai | anthropic | google | ollama
  id: gpt-4o                     # model identifier
  name: GPT-4o                   # display name (optional)

planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini              # use cheaper model for planning

tools:
  - google_search
  - browser
  - write_file
  - read_file
  - execute_code
  - terminal
  - grep

max_tokens: 8192
context_window: 8192
temperature: 0.7                  # 0.0-1.0 (analytical=0.0-0.3, creative=0.8-1.0)
max_iterations: 10                # 5-20 depending on task complexity

workspace:
  path: ~/.nodetool-workspaces/my-agent
  auto_create: true
```

# Config Schema Reference

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | string | Yes | — | Lowercase alphanumeric |
| `description` | string | No | — | Human-readable |
| `system_prompt` | string | Yes | — | YAML multiline `\|` |
| `model.provider` | enum | Yes | — | openai, anthropic, google, ollama |
| `model.id` | string | Yes | — | Model identifier |
| `model.name` | string | No | — | Display name |
| `planning_agent.enabled` | bool | Yes | true | Must be true |
| `planning_agent.model.*` | — | No | same as main | Override for planning |
| `tools` | string[] | No | [read_file, write_file] | Available tools |
| `max_tokens` | int | No | 8192 | Response limit |
| `context_window` | int | No | 8192 | Context size |
| `temperature` | float | No | 0.7 | 0.0–1.0 |
| `max_iterations` | int | No | 10 | Execution loops |
| `workspace.path` | string | No | ~/.nodetool-workspaces/<name> | Sandbox dir |
| `workspace.auto_create` | bool | No | true | Create if missing |

# CLI Commands

```bash
# Run with prompt
nodetool agent --config agent.yaml --prompt "Research TypeScript ORMs"

# From file
nodetool agent --config agent.yaml --prompt-file task.txt

# Interactive mode
nodetool agent --config agent.yaml --interactive

# Save output
nodetool agent --config agent.yaml --prompt "Task" --output result.md

# JSONL output
nodetool agent --config agent.yaml --prompt "Task" --jsonl

# Verbose (debug)
nodetool agent --config agent.yaml --prompt "Task" --verbose
```

## Interactive Commands
| Command | Purpose |
|---------|---------|
| `/help` | Show commands |
| `/workspace` | Show workspace path |
| `/tools` | List available tools |
| `/config` | Show configuration |
| `/clear` | Clear history |
| `/save [file]` | Save conversation |
| `/exit` | Exit session |

# Available Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `list_directory` | List directory contents |
| `google_search` | Web search |
| `google_news` | News search |
| `google_images` | Image search |
| `browser` | Browse web pages |
| `screenshot` | Take screenshots |
| `execute_code` | Run code snippets |
| `terminal` | Shell commands |
| `grep` | Search file contents |
| `calculator` | Math calculations |
| `statistics` | Statistical analysis |
| `vec_text_search` | Vector text search |
| `vec_index` | Index documents |
| `vec_hybrid_search` | Hybrid vector search |
| `extract_pdf_text` | Extract PDF text |
| `convert_pdf_to_markdown` | PDF to Markdown |

# Model Recommendations

| Use Case | Provider | Model | Notes |
|----------|----------|-------|-------|
| Planning (cheap) | openai | gpt-4o-mini | Fast, inexpensive |
| Planning (cheap) | anthropic | claude-3-haiku | Fast alternative |
| Planning (cheap) | google | gemini-2.0-flash | Google fast tier |
| Main (powerful) | openai | gpt-4o | Best all-around |
| Main (powerful) | anthropic | claude-3.5-sonnet | Strong reasoning |
| Creative | any | any | temperature 0.8–1.0 |
| Analytical | any | any | temperature 0.0–0.3 |
| Local/offline | ollama | llama3, mistral | No API key needed |

# Programmatic Usage (TypeScript)

```typescript
import { Agent } from "@nodetool-ai/core";

const agent = new Agent({
  name: "researcher",
  objective: "Research TypeScript ORMs",
  provider: openaiProvider,
  model: "gpt-4o",
  tools: [new GoogleSearchTool(), new BrowserTool(), new WriteFileTool()],
  workspace: "/tmp/research",
  maxSteps: 10,
  maxStepIterations: 5,
});

for await (const message of agent.execute(context)) {
  if (message.type === "chunk") {
    process.stdout.write(message.content);
  }
}
```

# Skills Integration

Agents auto-discover skills from:
1. Constructor `skills` parameter
2. `NODETOOL_AGENT_SKILL_DIRS` env var
3. `./.claude/skills/`
4. `~/.claude/skills/`
5. `~/.codex/skills/`

Force specific skills: `NODETOOL_AGENT_SKILLS=skill-a,skill-b`

# Quick Recipes

## Research Agent
```yaml
name: researcher
system_prompt: |
  You are a thorough research analyst. For each topic:
  1. Search for primary sources
  2. Cross-reference facts
  3. Write structured findings with citations
model: { provider: openai, id: gpt-4o }
tools: [google_search, browser, write_file]
max_iterations: 15
temperature: 0.3
```

## Code Assistant
```yaml
name: code-helper
system_prompt: |
  You are a senior developer. Write clean, tested code.
  Always read existing code before modifying. Run tests after changes.
model: { provider: anthropic, id: claude-3.5-sonnet }
tools: [read_file, write_file, terminal, grep]
max_iterations: 20
temperature: 0.2
```

## Content Creator
```yaml
name: content-writer
system_prompt: |
  You are a professional content writer. Create engaging,
  well-structured content. Research thoroughly before writing.
model: { provider: openai, id: gpt-4o }
tools: [google_search, browser, write_file]
max_iterations: 10
temperature: 0.8
```

# Batch Automation

```bash
for topic in "AI" "ML" "Web3"; do
  nodetool agent --config research.yaml \
    --prompt "Find latest news about $topic" \
    --output "reports/${topic}.md"
done
```

# Common Pitfalls

- **Missing `planning_agent.enabled: true`**: Planning is required
- **Too few iterations**: Complex tasks need `max_iterations: 15-20`
- **Wrong temperature**: Analytical tasks fail with high temperature
- **Missing tools**: Agent can't do what you ask if the tool isn't listed
- **No workspace**: File tools need `workspace.auto_create: true`
