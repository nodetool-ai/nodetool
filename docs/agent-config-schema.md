# Agent Configuration YAML Schema

This document describes the complete YAML schema for NodeTool agent configurations used with the `nodetool agent` command.

## Schema Overview

```yaml
# REQUIRED FIELDS
model: ModelConfig              # Primary model: provider + id required

# OPTIONAL FIELDS
name: string                    # Agent identifier
description: string             # Human-readable description
system_prompt: string           # Agent behavior instructions
objective: string               # Default objective (if no --objective/stdin)
planning_agent: PlanningConfig  # Planning agent (enabled: false → use main model)
tools: list[string]             # Available tool names
max_tokens: integer             # Per-step context token budget (default 128000)
max_steps: integer              # Maximum number of steps in the task
preferred_providers: list[string]            # Provider ids to prefer for find_model
preferred_models: map[string, string|list]   # capability → preferred model id(s)
workspace: WorkspaceConfig      # Workspace configuration
```

> The runner accepts only the fields above. `context_window`, `temperature`, and `max_iterations` are **not** used —
> earlier versions of this doc listed them, but they are ignored. Use `max_steps` to bound the number of steps and
> `max_tokens` for the per-step context budget.

`provider`, `model`, and `objective` can be supplied or overridden from the command line
(`--provider`, `--model`, `--objective`); the objective also falls back to piped stdin.

## Field Definitions

### name (optional)

**Type:** `string`

**Description:** Identifier for the agent. Used in the trace header and by `agent list` / `agent test`.

**Examples:**
```yaml
name: research-assistant
name: code_helper
name: content-creator-v2
```

---

### description (optional)

**Type:** `string`

**Description:** Human-readable description of the agent's purpose and capabilities.

**Examples:**
```yaml
description: Autonomous research agent for web information gathering
description: AI coding assistant for Python development
description: Content creation and copywriting agent
```

---

### objective (optional)

**Type:** `string`

**Description:** Default objective for the agent. Used only when neither the `--objective` flag nor piped stdin supplies
one. The priority order is: `--objective` flag → stdin → this `objective:` field.

**Example:**
```yaml
objective: Research the latest developments in quantum computing
```

---

### system_prompt (optional)

**Type:** `string` (supports multiline)

**Description:** Core instructions defining agent behavior, workflow, and guidelines. This is the primary way to shape agent behavior.

**Best practices:**
- Use YAML multiline format (`|`)
- Define the agent's role clearly
- Include specific workflow steps
- Provide tool usage instructions
- Set output format expectations
- Include quality guidelines

**Example:**
```yaml
system_prompt: |
  You are a professional research assistant.
  
  Your responsibilities:
  - Conduct thorough research on assigned topics
  - Verify information across multiple sources
  - Organize findings systematically
  - Provide well-structured summaries
  
  Workflow:
  1. Break down research objective into specific queries
  2. Use google_search to find relevant sources
  3. Use browser to extract detailed content
  4. Save findings using write_file
  5. Synthesize results into report
  
  Guidelines:
  - Prioritize authoritative sources
  - Cross-reference information
  - Cite sources clearly
  - Note uncertainties or conflicts
```

---

### model (required)

**Type:** `ModelConfig` object

**Description:** Configuration for the primary AI model used by the agent.

**Structure:**
```yaml
model:
  provider: string  # REQUIRED: AI provider name
  id: string        # REQUIRED: Model identifier
  name: string      # OPTIONAL: Display name
```

**Supported providers:**
- `openai` — OpenAI models
- `anthropic` — Anthropic Claude models
- `gemini` — Google Gemini models (the aliases `google` and `googleai` are normalized to `gemini`)
- `ollama` — Local Ollama models
- Other registry providers as configured

**Examples:**
```yaml
# OpenAI
model:
  provider: openai
  id: gpt-4o
  name: GPT-4o

# Anthropic
model:
  provider: anthropic
  id: claude-sonnet-4-6
  name: Claude Sonnet

# Gemini (google / googleai are aliases for gemini)
model:
  provider: gemini
  id: gemini-3.5-flash
  name: Gemini 3.5 Flash

# Local Ollama
model:
  provider: ollama
  id: llama3.2:3b
```

---

### planning_agent (optional)

**Type:** `PlanningConfig` object

**Description:** Configures the model used for the planning phase. Optional — when omitted, planning uses the main
model. When `enabled: false`, planning also falls back to the main model. There is no requirement that planning be
enabled.

**Structure:**
```yaml
planning_agent:
  enabled: boolean    # false → plan with the main model
  model: ModelConfig  # model used for the planning phase
```

**Best practices:**
- Use fast, cost-effective models for planning
- The planning model can differ from the main model
- Recommended: `gpt-4o-mini`, a small Claude model, or a Gemini Flash model

**Examples:**
```yaml
# Use GPT-4o Mini for cost-effective planning
planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini

# Disable the separate planning model; plan with the main model
planning_agent:
  enabled: false
```

---

### tools (optional)

**Type:** `list[string]`

**Description:** List of tool names available to the agent. Tools extend agent capabilities beyond pure language model responses.

**Default:** No tools (empty list).

**Available tools** (the name in `tools:` must match the registry key):

**File Operations:**
- `write_file` — Write content to files in the workspace
- `read_file` — Read file contents from the workspace
- `edit_file` — Edit an existing file
- `list_directory` — List directory contents
- `glob` — Match files by glob pattern
- `grep` — Search for patterns within files

**Web Research:**
- `google_search` — Search the web (also `google_news`, `google_images`)
- `browser` — Browse URLs and extract web content
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

> There is no `delete_file` or `terminal` tool. Unknown tool names are ignored at run time with a warning;
> `nodetool agent test <file>` reports them.

**Examples:**
```yaml
# Minimal file operations
tools:
  - read_file
  - write_file

# Research agent tools
tools:
  - google_search
  - browser
  - write_file
  - read_file

# Code assistant tools
tools:
  - read_file
  - write_file
  - edit_file
  - run_code
  - grep
```

---

### max_steps (optional)

**Type:** `integer`

**Description:** Maximum number of steps in the planned task.

**Examples:**
```yaml
max_steps: 5    # Quick tasks
max_steps: 10   # Standard
max_steps: 20   # Complex tasks
```

---

### preferred_providers (optional)

**Type:** `list[string]`

**Description:** Provider ids to prefer when the `find_model` tool ranks results. The first entry becomes the default
provider hint when the LLM omits one. These preferences are also surfaced in the system prompt.

```yaml
preferred_providers:
  - anthropic
  - openai
```

---

### preferred_models (optional)

**Type:** `map[string, string | list[string]]`

**Description:** Map of capability to preferred model id(s). When a `find_model` call matches a capability, the value is
injected as the `model_hint`.

```yaml
preferred_models:
  image: black-forest-labs/flux-schnell
  tts:
    - openai/tts-1
    - openai/tts-1-hd
```

---

### workspace (optional)

**Type:** `WorkspaceConfig` object

**Description:** Configuration for the agent's file workspace. The workspace is a sandboxed directory where the agent can read and write files.

**Structure:**
```yaml
workspace:
  path: string       # OPTIONAL: Workspace directory path
  auto_create: bool  # OPTIONAL: Create if doesn't exist
```

**Default:**
- `path`: the current working directory (or `--workspace` if passed)
- `auto_create`: the directory is created unless `auto_create: false`

**Examples:**
```yaml
# Use default workspace
workspace:
  auto_create: true

# Custom workspace path (tilde is expanded)
workspace:
  path: ~/my-projects/agent-workspace
  auto_create: true

# Absolute path, do not auto-create
workspace:
  path: /tmp/research
  auto_create: false
```

---

## Complete Example

```yaml
# Research Assistant Agent
name: research-assistant
description: Research agent for information gathering

system_prompt: |
  You are a professional research assistant specializing in thorough, accurate research.
  
  Responsibilities:
  - Conduct research on assigned topics
  - Gather information from multiple credible sources
  - Verify facts and cross-reference data
  - Organize findings in structured format
  - Provide citations and source references
  
  Workflow:
  1. Analyze the research objective
  2. Break down into specific research queries
  3. Use google_search to find relevant sources
  4. Use browser to extract detailed content from promising URLs
  5. Save important findings using write_file
  6. Synthesize all information into report
  7. Review and verify accuracy
  
  Tools Available:
  - google_search: Find web resources
  - browser: Extract content from URLs
  - write_file: Save findings and reports
  - read_file: Review previous findings
  - list_directory: Check saved files
  
  Output Guidelines:
  - Structure reports with clear sections
  - Include executive summary
  - Cite all sources with URLs
  - Note any conflicting information
  - Highlight key findings and insights
  - Use markdown formatting

model:
  provider: openai
  id: gpt-4o
  name: GPT-4o

planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini
    name: GPT-4o Mini

tools:
  - google_search
  - browser
  - write_file
  - read_file
  - list_directory

max_tokens: 128000
max_steps: 15

workspace:
  path: ~/research-workspace
  auto_create: true
```

## Validating a Config

There is no separate validation step or required-field enforcement at parse time — only `model.provider` and
`model.id` are needed to run, and `objective` must come from the YAML, `--objective`, or stdin. Use the built-in
`test` subcommand to check a config before running it:

```bash
nodetool agent test research-assistant.yaml
```

It reports a missing `model.provider` or `model.id`, lists the resolved tools, warns about unknown tool names, and
tries to instantiate the provider. Unknown tool names do not abort a run — they are simply ignored with a warning.

## Path Expansion

`workspace.path` supports leading-tilde (`~`) expansion to the home directory. There is **no** `${VAR}` /
`${VAR:-default}` environment-variable interpolation inside the YAML — set provider/model via the YAML fields or the
`--provider` / `--model` flags instead.

## Migration from Old Format

If upgrading from older configuration formats:

**Old format:**
```yaml
agent:
  name: my-agent
  model: gpt-4o
  tools: [search, browser]
```

**New format:**
```yaml
name: my-agent
model:
  provider: openai
  id: gpt-4o
planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini
tools:
  - google_search
  - browser
```

## See Also

- [Agent CLI Documentation](agent-cli.md) — Complete CLI reference
- [Agent Examples](examples/agents/) — Sample configurations
- [Chat & Agents](global-chat-agents.md) — Agent system overview
