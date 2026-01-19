---
layout: page
title: "Agent CLI"
---

The `nodetool agent` command runs autonomous AI agents from start to finish using a YAML configuration file. Agents use the planning agent architecture to break down tasks, execute them step-by-step, and achieve goals through tool usage and iterative refinement.

## Overview

The agent CLI enables:

- **Autonomous execution**: Run agents that plan and execute tasks independently
- **YAML configuration**: Define agent behavior, models, and tools in configuration files
- **Planning agent integration**: All agents use the planning agent for task decomposition
- **Tool orchestration**: Agents can use multiple tools to accomplish complex goals
- **Workspace isolation**: Each agent run has its own workspace for file operations

## Basic Usage

### Running an Agent

```bash
# Run agent with inline prompt
nodetool agent --config research-agent.yaml --prompt "Research the latest AI trends"

# Run agent with prompt from file
nodetool agent --config code-assistant.yaml --prompt-file task.txt

# Run agent interactively
nodetool agent --config content-creator.yaml --interactive
```

### Command Options

- `--config FILE` (required) — Path to agent YAML configuration file
- `--prompt TEXT` — Inline prompt for the agent
- `--prompt-file FILE` — Load prompt from a text file
- `--interactive` / `-i` — Start interactive session with the agent
- `--workspace DIR` — Override workspace directory from config
- `--max-iterations N` — Override maximum planning iterations
- `--verbose` / `-v` — Enable debug logging
- `--output FILE` — Save agent output to file
- `--jsonl` — Output in JSONL format for automation

### Interactive Mode

In interactive mode, you can have multi-turn conversations with the agent:

```bash
nodetool agent --config research-agent.yaml --interactive
```

```
Agent initialized: research-assistant
Type your prompt or /help for commands

> Research quantum computing applications in cryptography

[Agent executes task with planning steps shown]

> Save that to a file called quantum-crypto.md

[Agent saves the research]

> /workspace
Workspace: ~/.nodetool-workspaces/research
Files: quantum-crypto.md

> /exit
```

## Agent Configuration

### YAML Structure

Agent configurations are defined in YAML files with the following structure:

```yaml
# Agent identification
name: agent-name
description: Agent purpose and capabilities

# Core agent prompt
system_prompt: |
  Detailed instructions for agent behavior
  Multiple lines supported

# Model configuration
model:
  provider: openai     # AI provider
  id: gpt-4o          # Model identifier
  name: GPT-4o        # Display name (optional)

# Planning agent (always enabled)
planning_agent:
  enabled: true
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
max_tokens: 8192
context_window: 8192
temperature: 0.7
max_iterations: 10

# Workspace
workspace:
  path: ~/.nodetool-workspaces/agent-name
  auto_create: true
```

### Configuration Fields

#### Required Fields

- **name**: Unique identifier for the agent
- **system_prompt**: Instructions defining agent behavior
- **model**: Primary model configuration with provider and id
- **planning_agent**: Planning agent configuration (must have `enabled: true`)

#### Optional Fields

- **description**: Human-readable description of the agent's purpose
- **tools**: List of tool names the agent can use (default: basic file operations)
- **max_tokens**: Maximum token length for responses (default: 8192)
- **context_window**: Size of the context window (default: 8192)
- **temperature**: Response randomness, 0.0-1.0 (default: 0.7)
- **max_iterations**: Maximum planning/execution cycles (default: 10)
- **workspace**: Workspace configuration object

### Model Configuration

The `model` field specifies which AI model to use:

```yaml
model:
  provider: openai        # Provider name
  id: gpt-4o             # Model ID
  name: GPT-4o           # Display name (optional)
```

Supported providers:
- `openai` — OpenAI models (GPT-4o, GPT-4o-mini, o1, etc.)
- `anthropic` — Anthropic models (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
- `google` — Google models (Gemini 2.0 Flash, Gemini 1.5 Pro, etc.)
- `ollama` — Local models via Ollama
- Custom providers as configured in NodeTool

### Planning Agent

The planning agent is **always enabled** and coordinates task execution:

```yaml
planning_agent:
  enabled: true  # Required, must be true
  model:
    provider: openai
    id: gpt-4o-mini  # Can use different model than main agent
```

The planning agent:
- Breaks down user prompts into subtasks
- Determines tool usage and execution order
- Monitors progress and adjusts strategy
- Synthesizes results from multiple steps

### Available Tools

Tools extend agent capabilities. Common tools include:

**File Operations:**
- `write_file` — Write content to files
- `read_file` — Read file contents
- `list_directory` — List directory contents
- `delete_file` — Delete files

**Web Research:**
- `google_search` — Search the web
- `browser` — Browse and extract web content

**Code Execution:**
- `execute_code` — Run Python/JavaScript code
- `terminal` — Execute shell commands

**Additional Tools:**
- `grep` — Search within files
- `image_generation` — Generate images
- `audio_generation` — Generate audio

Example tool configuration:

```yaml
tools:
  - google_search
  - browser
  - write_file
  - read_file
  - execute_code
```

### Workspace Configuration

The workspace is a sandboxed directory for agent file operations:

```yaml
workspace:
  path: ~/.nodetool-workspaces/my-agent  # Workspace location
  auto_create: true                       # Create if doesn't exist
```

If not specified, defaults to `~/.nodetool-workspaces/<agent-name>`.

## Example Configurations

### Research Agent

See [examples/agents/research-agent.yaml](examples/agents/research-agent.yaml) for a complete research agent configuration.

```bash
nodetool agent \
  --config examples/agents/research-agent.yaml \
  --prompt "Research the impact of AI on software development"
```

### Code Assistant

See [examples/agents/code-assistant.yaml](examples/agents/code-assistant.yaml) for a coding agent.

```bash
nodetool agent \
  --config examples/agents/code-assistant.yaml \
  --prompt "Create a Python script to analyze log files"
```

### Content Creator

See [examples/agents/content-creator.yaml](examples/agents/content-creator.yaml) for a content generation agent.

```bash
nodetool agent \
  --config examples/agents/content-creator.yaml \
  --prompt "Write a blog post about sustainable technology"
```

## Use Cases

### Automated Research

```bash
nodetool agent \
  --config research-agent.yaml \
  --prompt "Research competitors in the AI workflow space" \
  --output research-report.md
```

The agent will:
1. Plan a research strategy
2. Search for relevant information
3. Browse competitor websites
4. Extract and organize findings
5. Generate a comprehensive report

### Code Generation and Refactoring

```bash
nodetool agent \
  --config code-assistant.yaml \
  --prompt "Refactor the utils.py file to improve performance"
```

The agent will:
1. Read and analyze the code
2. Identify performance bottlenecks
3. Plan refactoring steps
4. Implement improvements
5. Test changes

### Content Pipeline

```bash
nodetool agent \
  --config content-creator.yaml \
  --prompt "Create 5 social media posts about our new feature" \
  --output posts.json \
  --jsonl
```

The agent will:
1. Research the feature
2. Plan content strategy
3. Generate multiple post variants
4. Format and save outputs

## Advanced Usage

### Custom Prompts with Context

```bash
nodetool agent \
  --config research-agent.yaml \
  --prompt "$(cat context.txt) - Based on this context, analyze market trends"
```

### Chaining Agent Runs

```bash
# Research phase
nodetool agent --config research-agent.yaml \
  --prompt "Research topic X" \
  --output research.md

# Writing phase
nodetool agent --config content-creator.yaml \
  --prompt "Write article based on: $(cat research.md)"
```

### Automation Scripts

```bash
#!/bin/bash
# Daily research automation

for topic in "AI" "ML" "Web3"; do
  nodetool agent \
    --config research-agent.yaml \
    --prompt "Find latest news about $topic" \
    --output "reports/${topic}-$(date +%Y%m%d).md" \
    --jsonl
done
```

### Environment Variables

Configure via environment variables:

```bash
export NODETOOL_WORKSPACE=~/my-workspace
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

nodetool agent --config agent.yaml --prompt "Task"
```

## Interactive Commands

When running with `--interactive`, these commands are available:

- `/help` — Show available commands
- `/workspace` — Show workspace path and files
- `/tools` — List available tools
- `/config` — Show current configuration
- `/clear` — Clear conversation history
- `/save [file]` — Save conversation to file
- `/exit` — Exit interactive session

## Output Formats

### Standard Output

Default human-readable output with formatting:

```bash
nodetool agent --config agent.yaml --prompt "Task"
```

```
[Planning] Breaking down task into 3 steps...
[Step 1/3] Searching for information...
[Tool: google_search] Found 5 relevant results
[Step 2/3] Analyzing results...
[Step 3/3] Generating summary...

Final Output:
[Agent response here]
```

### JSONL Output

Machine-readable JSONL format for automation:

```bash
nodetool agent --config agent.yaml --prompt "Task" --jsonl
```

```json
{"type":"planning","step":1,"total":3,"description":"Searching for information"}
{"type":"tool","name":"google_search","status":"success","results":5}
{"type":"planning","step":2,"total":3,"description":"Analyzing results"}
{"type":"planning","step":3,"total":3,"description":"Generating summary"}
{"type":"output","content":"[Agent response here]"}
{"type":"complete","status":"success","iterations":3}
```

### File Output

Save output to file:

```bash
nodetool agent --config agent.yaml --prompt "Task" --output result.txt
```

## Best Practices

### System Prompt Design

**Be specific and structured:**

```yaml
system_prompt: |
  You are a [role].
  
  Your responsibilities:
  1. [Task 1]
  2. [Task 2]
  
  Workflow:
  1. [Step 1]
  2. [Step 2]
  
  Guidelines:
  - [Guideline 1]
  - [Guideline 2]
```

**Include tool usage instructions:**

```yaml
system_prompt: |
  Tools Available:
  - google_search: Use for finding information
  - write_file: Save important findings
  
  When researching:
  1. Use google_search to find sources
  2. Extract relevant information
  3. Use write_file to save findings
```

### Model Selection

**Choose appropriate models:**

- **Planning agent**: Use fast, cost-effective models (gpt-4o-mini, claude-3-haiku)
- **Main agent**: Use powerful models for complex reasoning (gpt-4o, claude-3.5-sonnet)
- **Code tasks**: Models with large context windows (claude-3.5-sonnet)
- **Creative tasks**: Higher temperature settings (0.8-1.0)
- **Analytical tasks**: Lower temperature settings (0.0-0.3)

### Tool Configuration

**Start minimal, add as needed:**

```yaml
# Start with basics
tools:
  - write_file
  - read_file

# Add capabilities progressively
tools:
  - write_file
  - read_file
  - google_search  # When research needed
  - browser        # When detailed web content needed
```

### Iteration Limits

**Set appropriate limits:**

- **Simple tasks**: 5-8 iterations
- **Research tasks**: 10-15 iterations
- **Complex projects**: 15-20 iterations
- **Exploratory tasks**: 20+ iterations

```yaml
max_iterations: 10  # Prevent infinite loops while allowing completion
```

## Troubleshooting

### Agent Doesn't Complete Task

**Increase iterations:**

```yaml
max_iterations: 20  # Give agent more cycles
```

**Improve system prompt:**

```yaml
system_prompt: |
  # Add more specific instructions
  # Break down expected workflow
  # Clarify success criteria
```

### Tool Errors

**Check tool availability:**

```bash
nodetool agent --config agent.yaml --interactive
> /tools
```

**Verify tool configuration** in system prompt and tools list.

### Performance Issues

**Use faster models for planning:**

```yaml
planning_agent:
  model:
    provider: openai
    id: gpt-4o-mini  # Fast and cost-effective
```

**Reduce context window** for simpler tasks:

```yaml
context_window: 4096  # Smaller for faster processing
```

### Rate Limiting

**Add delays** or use **local models**:

```yaml
model:
  provider: ollama
  id: llama3.2:3b  # Local model, no rate limits
```

## Security Considerations

### Workspace Isolation

Agents operate in isolated workspaces:

```yaml
workspace:
  path: ~/.nodetool-workspaces/agent-name  # Sandboxed directory
  auto_create: true
```

**Best practices:**
- Use dedicated workspace per agent
- Regularly clean up old workspaces
- Review agent outputs before moving to production directories

### Tool Permissions

**Limit tool access** to what's necessary:

```yaml
# Restrictive
tools:
  - read_file
  - write_file

# Permissive (use cautiously)
tools:
  - read_file
  - write_file
  - terminal
  - execute_code
```

### API Key Security

**Use environment variables** for API keys:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

**Never commit keys** to configuration files.

## Related Documentation

- [Global Chat & Agents](global-chat-agents.md) — Agent system overview
- [Chat CLI](chat-cli.md) — Interactive chat interface
- [NodeTool CLI](cli.md) — Complete CLI reference
- [Agent Configuration Examples](examples/agents/) — Sample configurations

## See Also

- **Planning Agent Architecture** — How the planning agent works
- **Tool Development** — Creating custom tools
- **Provider Configuration** — Setting up AI providers
- **Deployment** — Running agents in production
