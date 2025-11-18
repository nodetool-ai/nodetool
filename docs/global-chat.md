# Global Chat

Global Chat is NodeTool's powerful AI assistant interface that lets you interact with AI models from anywhere in the
application. It provides a full-featured chat experience with advanced capabilities including autonomous agents,
specialized tools, and workflow integration.

## Overview

Global Chat transforms NodeTool into a comprehensive AI workspace where you can:

- Chat with various AI models (OpenAI, Anthropic, Google, local models)
- Use specialized tools for web search, image generation, and more
- Enable autonomous agents that can plan and execute complex tasks
- Integrate with your workflows and assets seamlessly
- Manage multiple conversation threads

Chat maintains a persistent WebSocket connection. If the app reloads, it automatically reconnects and restores message
streaming state.

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

Agent Mode transforms the AI into an autonomous agent that can:

- **Plan Complex Tasks**: Break down requests into manageable steps
- **Use Tools Autonomously**: Decide when and how to use available tools
- **Execute Multi-Step Workflows**: Complete complex tasks requiring multiple actions
- **Reason About Results**: Analyze outcomes and adjust strategies

### Agent Capabilities

When Agent Mode is enabled, the AI can:

- **Web Research**: Conduct comprehensive research using multiple search tools
- **Content Creation**: Generate and refine content using various tools
- **Problem Solving**: Work through complex problems step by step
- **Task Management**: Organize and execute multi-faceted projects

### Agent Planning

The agent uses sophisticated planning to:

- **Break Down Tasks**: Divide complex requests into subtasks
- **Sequence Operations**: Determine the optimal order of actions
- **Handle Dependencies**: Manage task relationships and prerequisites
- **Adapt to Results**: Modify plans based on intermediate outcomes

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
