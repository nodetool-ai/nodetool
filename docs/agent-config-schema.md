# Agent Configuration YAML Schema

This document describes the complete YAML schema for NodeTool agent configurations used with the `nodetool agent` command.

## Schema Overview

```yaml
# REQUIRED FIELDS
name: string                    # Agent identifier
system_prompt: string           # Agent behavior instructions
model: ModelConfig              # Primary model configuration
planning_agent: PlanningConfig  # Planning agent (must be enabled)

# OPTIONAL FIELDS
description: string             # Human-readable description
tools: list[string]             # Available tool names
max_tokens: integer             # Maximum response length
context_window: integer         # Context window size
temperature: float              # Response randomness (0.0-1.0)
max_iterations: integer         # Maximum planning cycles
workspace: WorkspaceConfig      # Workspace configuration
```

## Field Definitions

### name (required)

**Type:** `string`

**Description:** Unique identifier for the agent. Used for logging and workspace naming.

**Constraints:**
- Must be alphanumeric with hyphens/underscores
- Should be lowercase
- No spaces or special characters

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

### system_prompt (required)

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
  5. Synthesize results into comprehensive report
  
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
- `google` — Google Gemini models
- `ollama` — Local Ollama models
- Custom providers as configured

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
  id: claude-3-5-sonnet-20241022
  name: Claude 3.5 Sonnet

# Google
model:
  provider: google
  id: gemini-2.0-flash-exp
  name: Gemini 2.0 Flash

# Local Ollama
model:
  provider: ollama
  id: llama3.2:3b
```

---

### planning_agent (required)

**Type:** `PlanningConfig` object

**Description:** Configuration for the planning agent that coordinates task execution. Must always be enabled.

**Structure:**
```yaml
planning_agent:
  enabled: boolean  # REQUIRED: Must be true
  model: ModelConfig  # REQUIRED: Model for planning
```

**Best practices:**
- Use fast, cost-effective models for planning
- Planning model can differ from main agent model
- Recommended: `gpt-4o-mini`, `claude-3-haiku`, `gemini-flash`

**Examples:**
```yaml
# Using GPT-4o Mini for cost-effective planning
planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini

# Using Claude Haiku for fast planning
planning_agent:
  enabled: true
  model:
    provider: anthropic
    id: claude-3-haiku-20240307
```

---

### tools (optional)

**Type:** `list[string]`

**Description:** List of tool names available to the agent. Tools extend agent capabilities beyond pure language model responses.

**Default:** Basic file operations (`read_file`, `write_file`)

**Available tools:**

**File Operations:**
- `write_file` — Write content to files in workspace
- `read_file` — Read file contents from workspace
- `list_directory` — List directory contents
- `delete_file` — Delete files from workspace

**Web Research:**
- `google_search` — Search the web for information
- `browser` — Browse URLs and extract web content

**Code Execution:**
- `execute_code` — Run Python/JavaScript code in sandbox
- `terminal` — Execute shell commands in workspace

**Additional:**
- `grep` — Search for patterns within files
- `image_generation` — Generate images
- `audio_generation` — Generate audio
- `video_generation` — Generate videos

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
  - execute_code
  - terminal
  - grep
```

---

### max_tokens (optional)

**Type:** `integer`

**Description:** Maximum number of tokens the agent can generate in a single response.

**Default:** `8192`

**Range:** `1` to model's maximum (varies by model)

**Recommendations:**
- Simple tasks: `4096`
- Standard tasks: `8192`
- Complex tasks: `16384`
- Very long outputs: `32768+` (model dependent)

**Examples:**
```yaml
max_tokens: 4096   # Conservative
max_tokens: 8192   # Standard
max_tokens: 16384  # Extended
```

---

### context_window (optional)

**Type:** `integer`

**Description:** Size of the context window for the conversation. Determines how much prior conversation and context the agent can see.

**Default:** `8192`

**Model limits:**
- GPT-4o: 128,000
- Claude 3.5 Sonnet: 200,000
- Gemini 2.0: 2,000,000
- Local models: varies

**Examples:**
```yaml
context_window: 4096    # Small context
context_window: 8192    # Standard
context_window: 32768   # Large context
context_window: 200000  # Very large (Claude)
```

---

### temperature (optional)

**Type:** `float`

**Description:** Controls randomness/creativity in agent responses. Higher values make output more random and creative.

**Default:** `0.7`

**Range:** `0.0` to `1.0` (some models support up to `2.0`)

**Recommendations:**
- `0.0-0.3`: Analytical, deterministic tasks (code, data analysis)
- `0.4-0.7`: Balanced, general-purpose tasks
- `0.8-1.0`: Creative tasks (writing, brainstorming)

**Examples:**
```yaml
temperature: 0.0  # Deterministic
temperature: 0.3  # Focused, precise
temperature: 0.7  # Balanced (default)
temperature: 0.9  # Creative
```

---

### max_iterations (optional)

**Type:** `integer`

**Description:** Maximum number of planning and execution cycles the agent can perform. Prevents infinite loops while allowing task completion.

**Default:** `10`

**Recommendations:**
- Simple tasks: `5-8`
- Standard tasks: `10-15`
- Complex tasks: `15-20`
- Exploratory tasks: `20+`

**Examples:**
```yaml
max_iterations: 5   # Quick tasks
max_iterations: 10  # Standard (default)
max_iterations: 20  # Complex tasks
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
- `path`: `~/.nodetool-workspaces/<agent-name>`
- `auto_create`: `true`

**Examples:**
```yaml
# Use default workspace
workspace:
  auto_create: true

# Custom workspace path
workspace:
  path: ~/my-projects/agent-workspace
  auto_create: true

# Specific project workspace
workspace:
  path: /tmp/research-$(date +%Y%m%d)
  auto_create: true
```

---

## Complete Example

```yaml
# Research Assistant Agent
name: research-assistant
description: Autonomous research agent for comprehensive information gathering

system_prompt: |
  You are a professional research assistant specializing in thorough, accurate research.
  
  Responsibilities:
  - Conduct comprehensive research on assigned topics
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
  6. Synthesize all information into comprehensive report
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

max_tokens: 8192
context_window: 8192
temperature: 0.7
max_iterations: 15

workspace:
  path: ~/.nodetool-workspaces/research
  auto_create: true
```

## Validation

### Required Fields Check

```python
required_fields = [
    "name",
    "system_prompt",
    "model",
    "planning_agent"
]

# model must have:
model_required = ["provider", "id"]

# planning_agent must have:
planning_required = ["enabled", "model"]
```

### Common Validation Errors

**Missing required fields:**
```
Error: Missing required field 'system_prompt'
```

**Invalid model configuration:**
```
Error: model.provider is required
Error: model.id is required
```

**Planning agent not enabled:**
```
Error: planning_agent.enabled must be true
```

**Invalid tool name:**
```
Error: Unknown tool 'invalid_tool'
```

**Invalid value ranges:**
```
Error: temperature must be between 0.0 and 1.0
Error: max_tokens must be positive
Error: max_iterations must be at least 1
```

## Environment Variables

Configuration values can reference environment variables:

```yaml
model:
  provider: openai
  id: ${OPENAI_MODEL:-gpt-4o}  # Default to gpt-4o if not set

workspace:
  path: ${WORKSPACE_DIR:-~/.nodetool-workspaces}/agent
```

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
- [Global Chat & Agents](global-chat-agents.md) — Agent system overview
