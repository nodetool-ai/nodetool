---
layout: page
title: "Chat & Agents"
description: "Run workflows from chat, enable autonomous agents, and expose them through APIs."
---

Chat runs workflows, streams results, and runs the unified agent loop on every turn — the assistant plans and calls tools on its own as a task needs it. Jump to the right reference below.

## Core guides

- **[Chat](global-chat.md)** — Interface layout, thread management, and how chat invokes workflows or tools.
- **[NodeTool Agent System](global-chat.md#agent-mode)** — How planning, tool usage, and execution loops work under the hood.
- **[Agent CLI](agent-cli.md)** — Run autonomous agents from the command line with YAML configuration files.
- **[Chat CLI](chat-cli.md)** & **[Chat Server](chat-server.md)** — Automate conversations or integrate with custom frontends.
- **[Chat API](chat-api.md)** — Programmatic access for running chats, streaming outputs, and issuing tool calls.

## Typical flows

1. **Run any saved workflow from chat**  
   Save the workflow in the editor, open Chat, and choose a **workflow** in the composer.

2. **Let the agent plan complex tasks**  
   The unified agent loop runs on every turn — the LLM decomposes goals into tasks and calls tools as needed. See the [Agent guide](global-chat.md#agent-mode).

3. **Run autonomous agents from command line**  
   Use the [Agent CLI](agent-cli.md) to run agents for fully automated task execution.

4. **Expose agents via APIs**  
   Use the [Chat API](chat-api.md) from backend services so agents can operate in headless environments.

Ready to go deeper? Pair this with the [Cookbook](cookbook.md) for agent patterns or the [Deployment Guide](deployment.md) to move agents into production.
