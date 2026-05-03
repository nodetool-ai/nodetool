---
name: nodetool-chat-cli
description: Use NodeTool chat CLI commands, interactive terminal, agent mode, workspace management, and Global Chat features. Use when user asks about chat commands, interactive terminal, chat features, agent mode in chat, or the Global Chat interface.
---

You help users use NodeTool's chat interfaces — CLI chat and Global Chat.

# Chat CLI

## Starting Chat

```bash
# Interactive chat (default model)
nodetool chat

# With specific provider/model
nodetool chat -p openai -m gpt-4o
nodetool chat -p anthropic -m claude-3.5-sonnet
nodetool chat -p ollama -m llama3

# With agent mode enabled
nodetool chat -a

# With specific tools
nodetool chat --tools google_search,browser,write_file
```

## Chat Commands (prefix with `/`)

| Command | Purpose |
|---------|---------|
| `/help` | Show all commands |
| `/provider` | Current provider status |
| `/providers` | List all available providers |
| `/models` | List available models |
| `/model <id>` | Switch to a different model |
| `/agent [on\|off]` | Toggle agent mode |
| `/tools [name]` | List tools or show tool details |
| `/usage` | Show token usage stats |
| `/exit` | Quit chat |

## Workspace Commands (no `/` prefix)

These work like a sandboxed shell within the chat:

| Command | Purpose |
|---------|---------|
| `pwd` | Print working directory |
| `ls [path]` | List files |
| `cd [path]` | Change directory |
| `mkdir <dir>` | Create directory |
| `rm <path>` | Remove file |
| `open <file>` | Open file in default app |
| `cat <file>` | Display file contents |
| `cp <src> <dest>` | Copy file |
| `mv <src> <dest>` | Move/rename file |
| `grep <pattern> [path]` | Search file contents |
| `cdw` | Jump to workspace root |

## Configuration

- Settings file: `~/.nodetool_settings`
- History file: `~/.nodetool_history`

# Agent Mode

When agent mode is enabled (`/agent on` or `-a` flag), the chat gains:

1. **Planning**: Agent breaks tasks into steps
2. **Tool use**: Agent can call tools (search, browse, file ops, code execution)
3. **Iteration**: Agent executes steps, evaluates results, adapts
4. **Workflow integration**: Agent can trigger NodeTool workflows

## Agent Mode Tools

| Tool | Capability |
|------|-----------|
| `google_search` | Web search |
| `browser` | Browse and extract web content |
| `write_file` | Create/write files in workspace |
| `read_file` | Read file contents |
| `execute_code` | Run code snippets |
| `terminal` | Shell commands |
| `grep` | Search file contents |
| `calculator` | Math operations |
| `screenshot` | Take screenshots |

# Global Chat

Global Chat is the desktop app's built-in chat interface with additional features.

## Features

- Chat with any configured AI model (OpenAI, Anthropic, Google, local)
- Multiple conversation threads
- Standalone window (launch from system tray)
- Specialized tools (web search, image generation)
- Autonomous agent mode
- Workflow integration

## Accessing Global Chat

- Click chat icon in NodeTool desktop app header
- Or launch standalone from system tray icon

## Global Chat Agent Mode

1. Enable agent mode in chat settings
2. Agent plans tasks into steps
3. Uses tools to execute (search, browse, generate)
4. Can run NodeTool workflows as part of execution
5. Analyzes results and adapts approach

## Workflow Integration

```
1. Save a workflow in NodeTool editor
2. Open Global Chat
3. Select the workflow from the workflow picker
4. Chat naturally — the agent can invoke the workflow
```

# Typical Flows

## Quick Question
```bash
nodetool chat -p openai -m gpt-4o
> What's the difference between FAISS and ChromaDB?
```

## Research Task with Agent
```bash
nodetool chat -a --tools google_search,browser,write_file
> Research the top 5 TypeScript ORMs and write a comparison to comparison.md
```

## Code Generation
```bash
nodetool chat -p anthropic -m claude-3.5-sonnet -a --tools write_file,read_file,terminal
> Create a Python script that processes CSV files and generates summary statistics
```

## Headless Execution (API)

For programmatic chat without the interactive terminal:

```bash
# Via Chat API (OpenAI-compatible)
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'
```

# Common Pitfalls

- **No provider configured**: Set API key first (`nodetool secrets store OPENAI_API_KEY`)
- **Agent mode off**: Tools won't work without `/agent on` or `-a` flag
- **Wrong model ID**: Use `/models` to see available model IDs
- **Workspace confusion**: Use `cdw` to jump back to workspace root
- **History lost**: Chat history is per-session unless saved with `/save`
