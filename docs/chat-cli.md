---
layout: page
title: "Chat CLI"
description: "Use `nodetool chat`, the interactive terminal for conversing with models and running tools."
---



The `nodetool chat` command starts an interactive terminal interface for conversing with language models and running
tools. Every chat session runs the unified agent loop — the assistant can call tools and decompose work on its own; there
is no separate mode to toggle.

## Starting the Interface

Run `nodetool chat` from your shell. The current provider and model are shown in the status bar at the bottom. Type
`/help` at any time to toggle the list of available commands.

```bash
# Start with saved / auto-detected settings
nodetool chat

# Override provider and model
nodetool chat --provider anthropic --model claude-sonnet-4-6

# Set the workspace directory (defaults to the current directory)
nodetool chat --workspace /path/to/project

# Connect to a running server instead of a local provider
nodetool chat --url ws://localhost:7777/ws
```

> The `--agent` flag is deprecated and has no effect — the unified chat agent always runs.

## Slash Commands

Commands use a `/` prefix. Tab completes commands and arguments (provider names, model ids).

- **/help** — Toggle the list of available commands.
- **/new** — Start a new chat session (clears history and starts a fresh thread).
- **/clear** — Clear the conversation history.
- **/compact [instructions]** — Summarize the conversation into a retained context message. Optional instructions focus the summary.
- **/model `<model-id>`** — Set the model.
- **/provider `<name>`** — Set the provider (switches to that provider's default model).
- **/tools** — List the enabled tools.
- **/exit** — Exit the chat session.
- **/quit** — Exit the chat session.

Press `↑`/`↓` to navigate input history, `Tab` to complete, and `Esc` or `Ctrl+C` to cancel a streaming response (or exit when idle).

## Tools

The assistant runs with a set of enabled tools (file operations, web search, browser, code execution, NodeTool MCP
tools, and more). Tools are auto-enabled based on the API keys available in your environment or the encrypted secret
store. Use `--tools` to override the set explicitly, or `/tools` to see what is currently enabled.

```bash
nodetool chat --tools read_file,write_file,grep,run_code
```

## Workspace

File operations run against a workspace directory. The workspace defaults to the **current working directory**; override
it with `--workspace <path>`.

## Settings and Logs

Persisted settings (provider, model, enabled tools) are stored in `~/.nodetool/chat-settings.json`. A log file is written
to `~/.nodetool/chat.log` so logging does not interfere with the terminal UI. Your provider and model choices are saved
automatically as you change them, so they carry over between runs.
