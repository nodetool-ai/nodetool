---
layout: page
title: "Chat CLI"
description: "Use `nodetool chat`, the interactive terminal for conversing with models and running tools."
---



`nodetool chat` starts an interactive terminal chat that runs the agent loop with tools. `nodetool chat` forwards its flags to the `nodetool-chat` binary, so both names start the same interface.

## Starting the Interface

```bash
# Start with saved / auto-detected settings
nodetool chat

# Override provider and model
nodetool chat --provider anthropic --model claude-sonnet-5

# Set the workspace directory (defaults to the current directory)
nodetool chat --workspace /path/to/project

# Connect to a running server instead of a local provider
nodetool chat --url ws://localhost:7777/ws
```

The header shows the provider and model. The line under it shows the workspace, the connection, and the permission mode. Other flags:

- `--resume [id]` — resume a saved conversation in this workspace. Without an ID, resume the most recent one.
- `--permission-mode <default|auto|plan>` — how tool calls are gated. Interactive chat defaults to `default`, piped input to `auto`.
- `--cost-cap <usd>` — ceiling on provider spend for one turn. `0` lifts it. Default: `NODETOOL_AGENT_TURN_COST_CAP_USD`.
- `--timeout <s>` — wall-clock bound on one turn, in seconds. Default: `NODETOOL_AGENT_TURN_DEADLINE_MS`.
- `--no-read-only-search` — remove the read-only `run_search` fan-out tool, which is on by default.
- `--trace-file <path>`, `--trace-stdout [format]`, `--no-trace-stdout` — tracing. Fullscreen chat owns stdout, so use `--trace-file`.

The full flag reference is in the [CLI reference](cli.md#nodetool-chat).

> The `--agent` flag is deprecated and has no effect — the unified chat agent always runs.

## Slash Commands

Commands use a `/` prefix. Tab completes commands and arguments (provider names, model ids).

- **/help** — List the commands and key bindings.
- **/new** — Save the current session and start a fresh conversation.
- **/clear** — Clear the screen. The conversation context stays.
- **/compact [instructions]** — Summarize the conversation into a retained context message. Optional instructions focus the summary.
- **/model `<model-id>`** — Set the model. A bare ID that more than one provider offers is refused. Use `provider/model-id` then. The choice is saved.
- **/mode `<default|auto|plan>`** — Change the permission mode.
- **/sessions** — List saved conversations in this workspace.
- **/resume `[id]`** — Resume a saved session. Without an ID, resume the most recent.
- **/export `[path.md]`** — Save the transcript as Markdown. The path is relative to the workspace and the file must not exist.
- **/agent `[id|main]`** — List sub-agent threads, inspect one, or return to the main conversation.
- **/tools** — List the enabled tools.
- **/details** — Toggle tool arguments, code, and diffs.
- **/exit**, **/quit** — Save and exit.

There is no `/provider` command. Use `/model provider/model-id` or `--provider`.

Enter sends. Alt+Enter, Shift+Enter in supported terminals, or Ctrl+J inserts a newline. Up and Down recall earlier prompts, Tab completes, and Page Up, Page Down, or the mouse wheel scroll the transcript. Ctrl+G jumps to the latest output and Ctrl+O toggles tool details. Esc or Ctrl+C stops a running turn. When idle, either one clears a draft, and Ctrl+C on an empty composer saves and quits.

### Piped input

When stdin is not a terminal, chat reads one message per line and writes the answer to stdout, with tool names and status on stderr. The fullscreen commands do not apply. `/new` starts a fresh conversation. The commands below need `--url`, and without it chat prints `Slash commands require --url (WebSocket mode).`

- **/run `<workflow_id> [json_params]`** — run a workflow.
- **/stop** — stop the generation in progress.
- **/reconnect `<job_id>`**, **/cancel `<job_id>`**, **/status `[job_id]`** — reconnect to, cancel, or query a job.
- **/help** — list these commands.

## Sessions

Sessions save under `~/.nodetool/chat-sessions/` after each turn and on exit. They hold the conversation context and the
provider's continuation state. `/sessions` and `--resume` list only sessions that match the current workspace and server.

## Tools

Tools (file operations, web search, browser, NodeTool MCP tools) are enabled from the API keys in your environment or the secret store. Use `--tools` to override the set and `/tools` to list it. Local interactive chat also enables `bash` for host commands in the chat workspace. It is not available in piped stdin chat or server-connected chat (`--url`). Bash commands are not sandboxed: default permission mode asks before running one, plan mode blocks it, and auto mode permits it without a prompt.

```bash
nodetool chat --tools read_file,write_file,grep,web_search
```

## Workspace

File operations run against the workspace, which defaults to the current directory. Override it with `--workspace <path>`.

## Settings and Logs

Persisted settings (`provider`, `model`, `enabledTools`) are stored in `~/.nodetool/chat-settings.json`. Logs go to `~/.nodetool/chat.log` so they do not disturb the terminal UI. Provider and model changes are saved automatically.
