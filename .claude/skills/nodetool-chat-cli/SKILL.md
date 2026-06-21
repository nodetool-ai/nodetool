---
name: nodetool-chat-cli
description: Use NodeTool chat CLI commands, interactive terminal, agent mode, workspace management, and Global Chat features. Use when user asks about chat commands, interactive terminal, chat features, agent mode in chat, or the Global Chat interface.
---

You help users use NodeTool's chat interfaces — the terminal chat CLI and Global Chat.

# Chat CLI

The chat CLI is a terminal UI. Two equivalent entry points:
- `nodetool-chat` (standalone binary)
- `nodetool chat` (subcommand that forwards to the chat UI)

From source (no build): `npm run dev:chat -- [flags]`.

## Starting Chat

```bash
# Interactive chat (default provider/model from saved settings)
nodetool chat

# With a specific provider/model
nodetool chat -p openai -m gpt-5.4
nodetool chat -p anthropic -m claude-sonnet-4-6
nodetool chat -p ollama -m qwen-3.5:4b

# Restrict the enabled tools
nodetool chat --tools google_search,browser,write_file

# Connect to a running server instead of a local provider
nodetool chat -u ws://localhost:7777/ws

# Provision an isolated Docker sandbox and expose its tools to the agent
nodetool chat --sandbox
```

> **Agent mode is always on.** Every chat session runs the unified agent loop
> (planning + tools). The old `-a/--agent` and `--no-agent` flags are deprecated
> no-ops kept for compatibility.

## CLI Flags

| Flag | Purpose |
|------|---------|
| `-p, --provider <name>` | LLM provider (see list below) |
| `-m, --model <id>` | Model ID |
| `-w, --workspace <path>` | Workspace directory (default: cwd) |
| `--tools <list>` | Comma-separated enabled tools |
| `-u, --url <ws-url>` | Connect to a NodeTool server WebSocket |
| `--sandbox` | Isolated Docker sandbox with file/shell/browser/desktop tools |
| `--sandbox-image <image>` | Override the sandbox Docker image |
| `--no-read-only-search` | Disable the read-only `run_search` fan-out primitive |
| `--trace-file <path>` | Append LLM/agent/workflow spans as JSONL |
| `--trace-stdout [pretty\|json]` | Stream spans to stdout |

Providers: `anthropic`, `claude_agent_sdk`, `openai`, `codex`, `gemini`, `xai`,
`groq`, `mistral`, `deepseek`, `moonshot`, `minimax`, `cerebras`, `gmi`,
`together`, `openrouter`, `huggingface`, `replicate`, `kie`, `aki`, `ollama`,
`lmstudio`, `mlx`. Any other registered provider id (e.g. `vllm`) also works when
passed explicitly.

## Slash Commands (prefix with `/`)

| Command | Purpose |
|---------|---------|
| `/help` | Toggle the command help panel |
| `/new` | Start a fresh session (clears history + server thread) |
| `/clear` | Clear the visible history |
| `/compact` | Summarize and compact the conversation context |
| `/model [id]` | Show current model, or switch with an id |
| `/provider [name]` | Show current provider, or switch (loads that provider's default model) |
| `/tools` | List the enabled tools |
| `/exit`, `/quit` | Quit chat |

Non-slash input is sent to the model as a chat message — there is no built-in
shell (`ls`, `cd`, …) in the chat prompt. File operations happen through the
agent's file tools in the workspace.

## Configuration

- Settings file: `~/.nodetool/chat-settings.json` (persists provider + model)

# Agent Capabilities

Because the agent loop is always active, the chat can:

1. **Plan** — break tasks into steps
2. **Use tools** — search, browse, file ops, code execution, media generation
3. **Iterate** — execute steps, evaluate results, adapt
4. **Run workflows** — trigger saved NodeTool workflows

## Common Tools

| Tool | Capability |
|------|-----------|
| `google_search` | Web search |
| `browser` | Browse and extract web content |
| `read_file` / `write_file` / `edit_file` | Workspace file ops |
| `run_code` | Run code snippets |
| `grep` / `glob` | Search files |
| `screenshot` | Capture a page screenshot |
| `find_model` | Pick a model by capability |
| `generate_image` / `generate_video` / `generate_speech` | Media generation |

Restrict the set with `--tools a,b,c`; inspect the active set with `/tools`.

# Global Chat

Global Chat is the desktop app's built-in chat interface.

## Features

- Chat with any configured AI model (OpenAI, Anthropic, Gemini, local)
- Multiple conversation threads
- Standalone window (launch from the system tray)
- Tools: web search, image generation, workflow execution
- The same always-on agent loop as the CLI

## Workflow Integration

```
1. Save a workflow in the NodeTool editor
2. Open Global Chat
3. Select the workflow from the workflow picker
4. Chat naturally — the agent can invoke the workflow as a tool
```

# Typical Flows

## Quick Question
```bash
nodetool chat -p openai -m gpt-5.4
> What's the difference between FAISS and ChromaDB?
```

## Research Task
```bash
nodetool chat --tools google_search,browser,write_file
> Research the top 5 TypeScript ORMs and write a comparison to comparison.md
```

## Code Generation
```bash
nodetool chat -p anthropic -m claude-sonnet-4-6 --tools write_file,read_file,run_code
> Create a Python script that processes CSV files and generates summary statistics
```

## Headless / Programmatic Chat

For non-interactive chat, use the OpenAI-compatible Chat API on a running server
(`nodetool serve`):

```bash
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -d '{"model": "gpt-5.4", "messages": [{"role": "user", "content": "Hello"}]}'
```

# Common Pitfalls

- **No provider configured**: store a key first (`nodetool secrets store OPENAI_API_KEY`). Providers without a key are greyed out and `/provider <name>` refuses them.
- **Wrong model ID**: switch with `/model <id>`; each provider's default is loaded when you switch providers.
- **Expecting a shell**: bare commands like `ls` are sent to the model, not run. Use the agent's file tools or `--sandbox`.
- **Looking for `/agent`**: agent mode is always on; there is no toggle.
