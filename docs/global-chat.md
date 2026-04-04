---
layout: page
title: "Global Chat"
description: "Chat with AI models, run autonomous agents, and integrate workflows from anywhere in NodeTool."
---

Global Chat is NodeTool's AI assistant interface for interacting with AI models from anywhere in the application. It supports multiple providers, autonomous agents, specialized tools, and workflow integration.

---

## Overview

Global Chat provides:

- Chat with AI models (OpenAI, Anthropic, Google, Ollama, and 20+ providers)
- Specialized tools for web search, file operations, code execution, and more
- Autonomous agents for complex multi-step task execution
- Workflow integration -- run saved workflows directly from chat
- Multiple conversation threads with history
- Standalone chat window from system tray

The chat maintains a persistent WebSocket connection and automatically reconnects after app reloads.

---

![Global Chat Interface](assets/screenshots/global-chat-interface.png)

## Getting Started

### Opening Global Chat

- **From the App**: Click **Chat** in the navigation menu
- **Standalone Window**: Click the NodeTool system tray icon and select **Chat** for a dedicated, focused window

### Choosing a Model

Select your preferred AI model from the model picker at the top of the chat. Available models depend on your configured providers:

- **Cloud models** -- OpenAI GPT, Anthropic Claude, Google Gemini (requires API keys)
- **Local models** -- Ollama, LM Studio models (requires local installation)

Configure providers in **Settings > Providers**. See [Models & Providers](models-and-providers.md).

---

## Conversation Threads

Global Chat organizes conversations into threads:

- **Create threads** -- Click the **New Chat** button to start a fresh conversation
- **Switch threads** -- Use the sidebar to navigate between conversations
- **Delete threads** -- Remove conversations you no longer need
- **Message history** -- Scroll through past messages with cursor-based pagination
- **Message caching** -- Recent messages are cached locally for fast loading

---

## Agent Mode

### What is Agent Mode?

Agent Mode enables autonomous task execution. When enabled, the AI can break down complex requests into steps, select appropriate tools, and execute multi-step plans without manual intervention.

Toggle Agent Mode using the switch in the chat controls.

### How Agents Work

1. **Planning** -- The agent analyzes your request and creates a task plan with ordered steps
2. **Tool selection** -- For each step, the agent chooses from 20+ available tools
3. **Execution** -- Steps run sequentially, with results feeding into subsequent steps
4. **Adaptation** -- The agent adjusts its plan based on intermediate results
5. **Reporting** -- Progress updates stream in real-time as tasks complete

### Agent Capabilities

With Agent Mode enabled, the assistant can:

| Capability | Examples |
|------------|---------|
| **Web research** | Search the web, browse pages, extract content |
| **File operations** | Read, write, and organize files in your workspace |
| **Code execution** | Run JavaScript in a sandboxed environment |
| **Data analysis** | Perform calculations, query vector databases |
| **Document processing** | Extract text from PDFs, process emails |
| **Asset management** | Create, organize, and index assets |
| **HTTP requests** | Call external APIs and process responses |
| **Workflow execution** | Run saved NodeTool workflows with custom inputs |

### Viewing Agent Progress

When an agent is executing tasks, you'll see:

- **Task plan** -- The breakdown of steps the agent will execute
- **Step status** -- Real-time updates as each step starts, completes, or fails
- **Tool calls** -- Which tools the agent is using and their results
- **Thinking process** -- The agent's reasoning (when supported by the model)

---

## Workflow Integration

### Running Workflows from Chat

1. Save a workflow in the workflow editor
2. Open Global Chat
3. Select a **workflow** in the composer dropdown
4. Provide inputs and run -- results stream back into the chat

### Creating Workflows from Chat

In Agent Mode, you can ask the agent to create or modify workflows. The agent uses workspace tools to build workflow configurations programmatically.

---

## Available Tools

Global Chat agents have access to a comprehensive tool suite:

### Built-in Tools

| Tool Category | What It Does |
|--------------|--------------|
| **Browser** | Navigate web pages, extract content, take screenshots |
| **Search** | Web search via multiple search providers |
| **Filesystem** | Read/write files, list directories, manage workspace |
| **Code** | Execute JavaScript in a sandboxed environment |
| **Calculator** | Perform mathematical calculations |
| **HTTP** | Make HTTP requests to external APIs |
| **PDF** | Extract text and data from PDF documents |
| **Email** | Read and process email messages |
| **Assets** | Upload, organize, and manage NodeTool assets |
| **Vectors** | Query and manage vector database collections |
| **Google** | Interact with Google APIs (search, drive, etc.) |
| **Workspace** | Manage NodeTool workspace settings and files |

### MCP Tools (Model Context Protocol)

NodeTool supports MCP for connecting to external tool servers. This enables integrating custom tools and services beyond the built-in set. See the [MCP documentation](https://modelcontextprotocol.io/) for details on available MCP servers.

---

## Standalone Chat Window

![Standalone Chat](assets/screenshots/standalone-chat.png)

Access chat in a focused, dedicated window outside the main app:

1. Click the NodeTool icon in your system tray
2. Select **Chat** from the menu
3. A new window opens with just the chat interface

The standalone window is useful for:
- Quick questions without switching to the full app
- Running agents in the background while doing other work
- Using chat as a general-purpose AI assistant

---

## Next Steps

- [Global Chat & Agents](global-chat-agents.md) -- Agent CLI and API integration
- [Chat API](chat-api.md) -- Programmatic access for running chats
- [Chat CLI](chat-cli.md) -- Command-line chat interface
- [Agent CLI](agent-cli.md) -- Run autonomous agents from the terminal
- [Models & Providers](models-and-providers.md) -- Configure AI providers
- [Cookbook](cookbook.md) -- Agent workflow patterns
