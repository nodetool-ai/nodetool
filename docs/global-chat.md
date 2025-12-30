---
layout: page
title: "Global Chat"
---

Global Chat is NodeTool's AI assistant interface for interacting with AI models from anywhere in the application. It supports multiple providers, autonomous agents, specialized tools, and workflow integration.

## Overview

Global Chat provides:

- Chat with AI models (OpenAI, Anthropic, Google, local models)
- Specialized tools for web search, image generation, etc.
- Autonomous agents for complex task execution
- Workflow and asset integration
- Multiple conversation threads

The chat maintains a persistent WebSocket connection and automatically reconnects after app reloads.

## Getting Started

### Opening Global Chat

- **From Dashboard**: Click the **Chat** icon in the left sidebar
- **From Recent Threads**: Select a conversation from your Dashboard
- **Quick Access**: Use the keyboard shortcut or system tray

### Interface Layout

The Global Chat interface consists of:

- **Thread List**: Left sidebar showing all your conversations
- **Chat View**: Main conversation area with message history
- **Input Area**: Message composer with tools and model selection
- **Control Panel**: Model selection, tools, and settings

## Thread Management

### Creating and Managing Threads

- **New Thread**: Click **New Chat** to start a fresh conversation
- **Thread Switching**: Click any thread in the sidebar to switch
- **Auto-Naming**: Threads are automatically named from your first message
- **Thread Deletion**: Use the delete button to remove unwanted threads
- **Thread Persistence**: All threads are saved and synced across sessions

### Thread Features

- **Message History**: Complete conversation history with timestamps
- **Rich Content**: Support for text, images, audio, and video messages
- **Search**: Find specific messages within threads
- **Export**: Save conversation history for external use

Use the search bar to find messages inside the current thread. The search is exact match and supports timestamp
filtering.

Threads are stored locally and synced via the backend. After restarts, the last used thread reopens automatically.

## Agent Mode

### What is Agent Mode?

Agent Mode enables autonomous task execution:

- **Plan tasks**: Break down requests into steps
- **Use tools**: Select and apply available tools
- **Execute workflows**: Complete multi-step tasks
- **Analyze results**: Adjust strategy based on outcomes

### Agent Capabilities

With Agent Mode enabled:

- **Web Research**: Conduct research using search tools
- **Content Creation**: Generate and refine content
- **Problem Solving**: Work through problems step by step
- **Task Management**: Execute multi-part projects

### Agent Planning

The agent:

- **Divides tasks** into subtasks
- **Sequences operations** optimally
- **Manages dependencies** between tasks
- **Adapts** based on intermediate results

### Planning Updates

During agent execution, you'll see:

- **Current Plan**: The agent's overall strategy
- **Active Task**: What the agent is currently working on
- **Progress Updates**: Real-time status of task execution
- **Reasoning**: The agent's thought process and decision-making

When an agent creates or modifies a workflow, Global Chat sends `workflow_created` or `workflow_updated` events. Open
editors update automatically through auto-layout.

Frontend tools (`ui_add_node`, `ui_align_nodes`, etc.) allow the agent to manipulate the editor directly. You can
inspect which tools are available by opening the Tools menu in the Chat input panel.
