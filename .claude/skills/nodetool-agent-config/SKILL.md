---
name: nodetool-agent-config
description: Create and configure NodeTool agent YAML configs, set up agent tools, system prompts, planning agents, and workspace isolation. Use when user asks to create an agent config, write YAML for an agent, configure agent tools, set up autonomous execution, or work with the agent CLI.
---

You help users create and configure NodeTool agents — autonomous AI systems that plan and execute multi-step tasks using tools.

# Agent Architecture

```
Objective → Agent → (Skill resolution → Planning → Execution) → Result
```

Three agent classes (from `@nodetool-ai/agents`):
- **Agent**: Multi-step with planning, tool use, iterative execution
- **SimpleAgent**: Single-step with structured output schema
- **AgentExecutor**: Lightweight value extraction

# YAML Config Template

```yaml
name: my-agent                    # lowercase, alphanumeric
description: Agent purpose         # human-readable

# Objective is optional here — it can be passed via --objective or stdin.
objective: Research TypeScript ORMs and summarize findings

system_prompt: |
  You are a [role].

  Responsibilities:
  1. Task 1
  2. Task 2

  Constraints:
  - Always cite sources
  - Stay concise

model:
  provider: openai                 # openai | anthropic | gemini | ollama | any registry id
  id: gpt-5.4                      # model identifier
  name: GPT-5.4                    # display name (optional)

planning_agent:
  enabled: true                    # set false to skip planning (single-pass)
  model:
    provider: openai
    id: gpt-5.4-mini               # cheaper model for planning

tools:
  - google_search
  - browser
  - write_file
  - read_file
  - run_code
  - grep

max_tokens: 8192                   # response/token budget (maxTokenLimit)
max_steps: 10                      # number of plan steps (5-20 by complexity)

workspace:
  path: ~/.nodetool-workspaces/my-agent
  auto_create: true                # default true

# Optional: bias find_model toward specific providers/models.
preferred_providers:
  - anthropic
  - openai
preferred_models:
  image_generation: gpt-image-2
  language_model: claude-sonnet-4-6
```

# Config Schema Reference

These are the fields the `nodetool agent` loader reads (loose schema — unknown keys are ignored):

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Agent name |
| `description` | string | Human-readable |
| `objective` | string | Default objective (overridden by `--objective`/stdin) |
| `system_prompt` | string | YAML multiline `\|` |
| `model.provider` | string | `openai`, `anthropic`, `gemini` (`google` is aliased to `gemini`), `ollama`, or any registry provider id |
| `model.id` | string | Model identifier |
| `model.name` | string | Display name (optional) |
| `planning_agent.enabled` | bool | `false` → use main model for planning, no separate planner |
| `planning_agent.model.*` | block | Override model used for planning |
| `tools` | string[] | Tool names (see catalog below); unknown names are warned + skipped |
| `max_tokens` | int | Token budget → `maxTokenLimit` |
| `max_steps` | int | Plan steps → `maxSteps` |
| `workspace.path` | string | Workspace dir (default: cwd) |
| `workspace.auto_create` | bool | Create dir if missing (default true) |
| `preferred_providers` | string[] | Default `provider_hint` for `find_model` |
| `preferred_models` | map | `capability → model id(s)`, injected as `model_hint` |

# CLI Commands

The `nodetool agent` command has three subcommands. From source use `npm run dev:nodetool -- agent ...`; from a build use `nodetool agent ...`.

```bash
# Run an agent — objective via flag, stdin, or `objective:` in the YAML
nodetool agent run agent.yaml --objective "Research TypeScript ORMs"
echo "Research TypeScript ORMs" | nodetool agent run agent.yaml
nodetool agent run agent.yaml          # uses objective: from the YAML

# Override provider/model/workspace at runtime
nodetool agent run agent.yaml -o "Task" --provider anthropic --model claude-sonnet-4-6
nodetool agent run agent.yaml -o "Task" --workspace /tmp/run1

# Emit each event as JSON lines on stderr (analyzer-friendly)
nodetool agent run agent.yaml -o "Task" --json

# Verbose trace (includes chunk/low-level events)
nodetool agent run agent.yaml -o "Task" --verbose

# Save the final result to a file (it prints to stdout; trace goes to stderr)
nodetool agent run agent.yaml -o "Task" > result.md

# Validate a config without running it (provider, model, tools)
nodetool agent test agent.yaml

# List YAML agent configs in a directory
nodetool agent list ./agents
```

`run` flags: `-o, --objective <text>`, `-p, --provider <id>`, `-m, --model <id>`,
`-w, --workspace <path>`, `--json`, `-v, --verbose`.

The trace (planning, tool calls, step results) is written to **stderr**; the final
result is written to **stdout**, so `> file` captures just the answer.

# Available Tools

Tool names recognized in the YAML `tools:` list (resolved by the agent CLI). MCP
tools configured on the machine are also auto-registered by name.

| Category | Tools |
|----------|-------|
| Files | `read_file`, `write_file`, `edit_file`, `list_directory`, `glob`, `grep`, `download_file` |
| Web | `google_search`, `google_news`, `google_images`, `browser`, `screenshot`, `http_request`, `openai_web_search`, `dataseo_search`, `dataseo_news` |
| Code & math | `run_code`, `calculator`, `statistics`, `geometry`, `conversion` |
| Documents | `extract_pdf_text`, `convert_pdf_to_markdown`, `convert_document` |
| Media | `generate_image`, `edit_image`, `generate_video`, `animate_image`, `generate_speech`, `transcribe_audio`, `embed_text`, `openai_image_generation`, `openai_text_to_speech` |
| Models | `find_model` (ranks models by capability; honors `preferred_providers`/`preferred_models`) |
| Email | `search_email`, `archive_email` |

> Note: there is no `terminal`, `execute_code`, `take_screenshot`, or `vec_*` tool.
> Use `run_code` for code execution and `screenshot` for screenshots.

# Model Recommendations

Use current model ids (the chat/agent CLIs default to these per provider):

| Use Case | Provider | Model |
|----------|----------|-------|
| Main (powerful) | openai | gpt-5.4 |
| Main (powerful) | anthropic | claude-sonnet-4-6 |
| Planning (cheap) | openai | gpt-5.4-mini |
| Planning (cheap) | gemini | gemini-2.5-flash |
| Reasoning/code | anthropic | claude-sonnet-4-6 |
| Local/offline | ollama | qwen-3.5:4b, llama3 |

Run `nodetool models recommended` for the curated, up-to-date list.

# Programmatic Usage (TypeScript)

```typescript
import { Agent } from "@nodetool-ai/agents";
import {
  ProcessingContext,
  FileStorageAdapter,
} from "@nodetool-ai/runtime";

const agent = new Agent({
  name: "researcher",
  objective: "Research TypeScript ORMs",
  provider: openaiProvider,         // a BaseProvider instance
  model: "gpt-5.4",
  tools: [new GoogleSearchTool(), new BrowserTool(), new WriteFileTool()],
  systemPrompt: "You are a thorough research analyst.",
  planningModel: "gpt-5.4-mini",
  maxTokenLimit: 8192,
  maxSteps: 10,
  workspace: "/tmp/research",
});

const ctx = new ProcessingContext({
  jobId: `agent-${Date.now()}`,
  userId: "1",
  workspaceDir: "/tmp/research",
  workspaceStorage: new FileStorageAdapter("/tmp/research"),
});

for await (const message of agent.execute(ctx)) {
  if (message.type === "chunk") process.stdout.write(message.content);
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
model: { provider: openai, id: gpt-5.4 }
tools: [google_search, browser, write_file]
max_steps: 15
```

## Code Assistant
```yaml
name: code-helper
system_prompt: |
  You are a senior developer. Write clean, tested code.
  Always read existing code before modifying. Run tests after changes.
model: { provider: anthropic, id: claude-sonnet-4-6 }
tools: [read_file, write_file, edit_file, run_code, grep, glob]
max_steps: 20
```

## Content Creator
```yaml
name: content-writer
system_prompt: |
  You are a professional content writer. Create engaging,
  well-structured content. Research thoroughly before writing.
model: { provider: openai, id: gpt-5.4 }
tools: [google_search, browser, write_file]
max_steps: 10
```

# Batch Automation

```bash
for topic in "AI" "ML" "Web3"; do
  nodetool agent run research.yaml \
    --objective "Find latest news about $topic" \
    > "reports/${topic}.md"
done
```

# Common Pitfalls

- **No objective**: provide it via `--objective`, stdin, or `objective:` in the YAML — the run errors without one.
- **Wrong run syntax**: it's `nodetool agent run <yaml>`, not `--config <yaml>`. There is no interactive agent mode (`--interactive`) — use `nodetool chat` for that.
- **Unknown tool names**: only the catalog above resolves; misspellings (e.g. `execute_code`, `terminal`) are skipped with a warning.
- **Too few steps**: complex tasks need `max_steps: 15-20`.
- **Missing tools**: the agent can't do what you ask if the tool isn't listed.
- **`provider: google`**: accepted but normalized to `gemini`.
