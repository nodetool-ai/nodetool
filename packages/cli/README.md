# @nodetool-ai/cli

Command-line tools for [NodeTool](https://nodetool.ai) — interactive AI chat with agent mode and workflow management from the terminal.

Ships two executables: `nodetool` for managing workflows, jobs, assets, models, secrets, and servers, and `nodetool-chat` for an interactive multi-provider LLM chat with agent mode and tool support.

## Install

```bash
npm install -g @nodetool-ai/cli
```

## Executables

| Command | Description |
|---|---|
| `nodetool` | Management CLI — serve, run workflows, jobs, assets, models, secrets, settings, MCP install |
| `nodetool-chat` | Interactive terminal chat with agent mode across providers |

## `nodetool`

```bash
nodetool info                       # System and environment info, API-key status
nodetool serve --host 0.0.0.0 --port 7777   # Start the WebSocket + HTTP server
nodetool run workflow.ts            # Run a TypeScript/JavaScript DSL workflow file

# Workflows (needs a running server for id-based commands)
nodetool workflows list
nodetool workflows get <id>
nodetool workflows run <id|file.json|file.ts> --params '{"key":"value"}'
nodetool workflows export-dsl <id> -o out.ts       # Export as TypeScript DSL
nodetool workflows export-bundle <id> -o pack.nodetool   # Portable zip with assets
nodetool workflows import-bundle pack.nodetool

# Jobs and assets
nodetool jobs list --workflow-id <id>
nodetool jobs get <job_id>
nodetool assets list --query "photo" --content-type image/png

# Models
nodetool models list
nodetool models providers
nodetool models by-provider anthropic --kind llm

# Secrets (encrypted local store)
nodetool secrets list
nodetool secrets store OPENAI_API_KEY
nodetool secrets get OPENAI_API_KEY

# Settings and MCP
nodetool settings show
nodetool mcp install                # Register the MCP server for Claude Code, Codex, OpenCode
nodetool mcp status
```

Server-calling commands accept `--api-url <url>` (default `http://localhost:7777`, env `NODETOOL_API_URL`) and `--json` for machine-readable output.

## `nodetool-chat`

```bash
nodetool-chat                           # Saved / auto-detected settings
nodetool-chat --provider anthropic --model claude-sonnet-4-6
nodetool-chat --agent                   # Start in agent mode
nodetool-chat --workspace /path/to/dir  # Set the workspace for file tools
nodetool-chat --url ws://localhost:7777/ws   # Connect to a running server
echo "research 5 AI topics" | nodetool-chat --agent   # Piped, non-interactive
```

Chat flags: `-p, --provider`, `-m, --model`, `-a, --agent`, `-u, --url`, `-w, --workspace`, `--tools <list>`.

Providers include anthropic, openai, gemini, xai, groq, mistral, deepseek, ollama, lmstudio, and other registry providers.

## Tracing

Both executables accept `--trace-file <path>` (append LLM/agent/workflow spans as JSONL) and `--trace-stdout <pretty|json>`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
