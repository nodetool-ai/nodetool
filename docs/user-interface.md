---
layout: page
title: "NodeTool User Interface"
---

This handbook covers the NodeTool interface, helping you navigate the desktop and web versions efficiently.

<!-- Screenshot: Full application interface showing the dashboard -->

---

## Contents

1. [Top-level layout](#top-level-layout)
2. [Dashboard](#dashboard)
3. [Panels and layout management](#panels-and-layout-management)
4. [Workflow Editor](#workflow-editor)
5. [Global Chat](#global-chat)
6. [Mini-Apps](#mini-apps)
7. [Assets](#assets)
8. [Models Manager](#models-manager)
9. [Command Menu](#command-menu)
10. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Top-level layout

NodeTool is divided into a fixed **App Header** and a flexible workspace.

### App Header

- Navigation and App Title
- Quick access to Models, Assets, Templates, and Chat
- User account and Settings
- Download status indicator

### Work surfaces

- **Dashboard**: Your home base for workflows, templates, and chat.
- **Workflow Editor**: The visual graph builder.
- **Global Chat**: Full-screen AI assistant.
- **Mini-Apps**: Simplified interface for running workflows.
- **Assets**: File explorer for your media and documents.

---

## Dashboard

The Dashboard is the default view, hosting panels for **Workflows**, **Recent chats**, **Templates**, and **Setup**.

<!-- Screenshot: Dashboard view with multiple panels open -->

### Key actions

- Open workflows or launch templates
- Create new workflows or chat threads
- Customize your workspace layout

---

## Panels and layout management

You can customize the interface by moving and resizing panels.

- **Drag tabs** to re-order or split the view (horizontally/vertically)
- **Resize** panels by dragging borders
- **Close** panels with the `X` icon
- **Add panels** from the "Add Panel" dropdown
- **Save/Restore layouts** using the Layout menu

---

## Workflow Editor

The editor is where you build your logic graphs.

<!-- Screenshot: Workflow editor with nodes and connections -->

### Canvas controls

- **Pan**: Space + drag or right-mouse drag
- **Zoom**: Ctrl/⌘ + scroll
- **Fit view**: `F` or `Ctrl/⌘+0`
- **Auto layout**: Automatically tidy the graph

### Nodes and connections

- **Add Node**: Press Space or double-click the canvas to open the search menu.
- **Connect**: Drag from an output handle to an input handle.
- **Smart Connect**: Drop a connection on empty space to see compatible nodes.

### Selection and editing

- **Select**: Click or drag a box. Shift-click for multi-select.
- **Duplicate**: `Ctrl/⌘+D`
- **Group**: `Ctrl/⌘+G`
- **History**: `Ctrl/⌘+Z` (Undo) and `Ctrl/⌘+Shift+Z` (Redo)

### Properties

Select a node to view its **Properties** panel on the right. This is where you configure inputs, view outputs, and see validation errors.

---

## Global Chat

Global Chat is your AI assistant for help and automation.

<!-- Screenshot: Chat interface with an active conversation -->

- **Threads**: Create, rename, and manage multiple conversation histories.
- **Agent Mode**: Enable this to let the AI use tools and modify your workflows directly.
- **Rich Media**: Supports text, images, audio, and video interactions.

---

## Mini-Apps

The **Mini-App Runner** transforms a workflow into a clean user interface.

<!-- Screenshot: A mini-app running with input forms and results -->

- **Input Form**: Automatically generated from your workflow inputs.
- **Progress**: Real-time status updates.
- **Results**: View generated outputs without seeing the underlying graph.

---

## Assets

The **Asset Explorer** lets you manage files within NodeTool.

<!-- Screenshot: Asset explorer grid view -->

- **Browse**: Grid and table views.
- **Preview**: Built-in viewers for audio, video, images, and text.
- **Drag & Drop**: Drag files directly into the editor to create reference nodes.

---

## Models Manager

Manage your local and cloud AI models.

<!-- Screenshot: Models manager dialog -->

- **Search & Filter**: Find models by name, provider, or capability.
- **Download**: One-click downloads with background progress tracking.
- **Configuration**: Set up API keys and preferences in Settings.

---

## Command Menu

Press `Alt+K` or `⌘+K` to open the **Command Menu**. It's the fastest way to:

- Open workflows
- Switch layouts
- Create nodes
- Navigate to different sections

---

## Keyboard shortcuts

### Global

- `Alt+K` / `⌘+K`: Command Menu
- `Ctrl/⌘+N`: New workflow
- `Ctrl/⌘+O`: Open workflow
- `Ctrl/⌘+S`: Save
- `Ctrl/⌘+Z`: Undo
- `Ctrl/⌘+Shift+Z`: Redo
- `Ctrl/⌘+1…9`: Switch editor tabs

### Editor

- `Space + Drag`: Pan
- `Ctrl/⌘+Scroll`: Zoom
- `F`: Fit to screen
- `Ctrl/⌘+Enter`: Run workflow
- `Esc`: Stop workflow
- `Ctrl/⌘+D`: Duplicate
- `Ctrl/⌘+G`: Group
- `A`: Align nodes

### Chat

- `Enter`: Send message
- `Shift+Enter`: New line
- `Esc`: Stop generation
