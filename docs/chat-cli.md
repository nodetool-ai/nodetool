---
layout: page
title: "Chat CLI"
---



The `nodetool chat` command starts an interactive terminal interface for conversing with language models and running
tools.

## Starting the Interface

Run `nodetool chat` from your shell. A welcome panel appears with the current model, agent status, and workspace path.
Type `/help` at any time to see available commands.

## CLI Commands

Commands use a `/` prefix. Important commands include:

- **/help** – Show available commands and workspace operations.
- **/provider** – Show current provider and authentication status.
- **/providers** – List available providers.
- **/models** – List models from the current provider.
- **/model <id>** – Select the language model to use.
- **/agent [on|off]** – Toggle agent mode for tool‑augmented conversations.
- **/tools [name]** – List available tools or show details for one.
- **/usage** – Show usage statistics for the current provider.
- **/exit** – Quit the chat session.

## Workspace Commands

Within the chat you can manage files in a sandboxed workspace located under `~/.nodetool-workspaces`. Workspace
operations do not use the `/` prefix:

- `pwd` – Print the current directory.
- `ls [path]` – List directory contents.
- `cd [path]` – Change directory.
- `mkdir <dir>` – Create a directory.
- `rm <path>` – Remove a file or directory.
- `open <file>` – Open a file with the system default application.
- `cat <file>` – Display file contents with syntax highlighting.
- `cp <src> <dest>` – Copy files or directories.
- `mv <src> <dest>` – Move or rename items.
- `grep <pattern> [path]` – Search text within files.
- `cdw` – Jump to the workspace root.

## Settings and History

Session settings are stored in `~/.nodetool_settings` and command history in `~/.nodetool_history`. These files allow
the chat interface to remember your model choice, agent mode, and other options between runs.
