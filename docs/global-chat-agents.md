---
layout: page
title: "Global Chat & Agents"
description: "Run workflows from chat, enable autonomous agents, and expose them through APIs."
---

Global Chat is the always-on assistant that can run any workflow, stream results, and escalate to autonomous agents when a task needs planning. Use this page to jump to the right references.

## Core guides

- **[Global Chat](global-chat.md)** — Interface layout, thread management, and how chat invokes workflows or tools.
- **[NodeTool Agent System](global-chat.md#agent-mode)** — How planning, tool usage, and execution loops work under the hood.
- **[Agent CLI](agent-cli.md)** — Run autonomous agents from the command line with YAML configuration files.
- **[Global Chat CLI](chat-cli.md)** & **[Chat Server](chat-server.md)** — Automate conversations or integrate with custom frontends.
- **[Chat API](chat-api.md)** — Programmatic access for running chats, streaming outputs, and issuing tool calls.

## Typical flows

1. **Run any saved workflow from chat**  
   Save the workflow in the editor, open Global Chat, and choose a **workflow** in the composer.

2. **Enable Agent Mode for planning tasks**  
   Switch to Agent Mode to let the LLM break goals into tasks. See the [Agent guide](global-chat.md#agent-mode).

3. **Run autonomous agents from command line**  
   Use the [Agent CLI](agent-cli.md) to run agents for fully automated task execution.

4. **Expose agents via APIs**  
   Use the [Chat API](chat-api.md) from backend services so agents can operate in headless environments.

Ready to go deeper? Pair this with the [Cookbook](cookbook.md) for agent patterns or the [Deployment Guide](deployment.md) to move agents into production.
