---
layout: page
title: "NodeTool User Interface"
---

This handbook covers every visible part of the NodeTool app so new and advanced users can move quickly without guesswork. It links concepts to the actual screens you will see in the desktop and web builds. :contentReference[oaicite:1]{index=1}

- Works with the React single‑page app in `web/` using Dockview panels and XYFlow for the graph editor.
- Real‑time behavior comes through WebSockets for jobs and chat.
- Settings, model downloads, assets, workflows, and chat threads persist across sessions. :contentReference[oaicite:2]{index=2}

---

## Contents

1. [Top‑level layout](#top-level-layout)
2. [Dashboard](#dashboard)
3. [Panels and layout management](#panels-and-layout-management)
4. [Workflow Editor](#workflow-editor)
5. [Global Chat](#global-chat)
6. [Mini‑Apps](#mini-apps)
7. [Assets](#assets)
8. [Models Manager and downloads](#models-manager-and-downloads)
9. [Templates and Collections](#templates-and-collections)
10. [Command Menu and search](#command-menu-and-search)
11. [Notifications, status, and errors](#notifications-status-and-errors)
12. [Themes, accessibility, and mobile](#themes-accessibility-and-mobile)
13. [Keyboard shortcuts](#keyboard-shortcuts)
14. [Troubleshooting UI](#troubleshooting-ui)

---

## Top‑level layout

NodeTool opens into a workspace with a fixed **App Header** at the top and a Dockview‑based center area. Navigation is route‑based, for example `/dashboard`, `/editor/:workflow`, `/chat/:thread_id?`, `/apps/:workflowId?`, and `/assets`. The Electron desktop build shows the same UI with system tray entry points. :contentReference[oaicite:3]{index=3}

**App Header**

- App title and navigation
- Buttons for Models, Assets, Templates, and Chat
- User account or Sign in when authentication is enabled
- Help and the Command Menu entry
- Download status indicator for models and files :contentReference[oaicite:4]{index=4}

**Work surfaces**

- **Dashboard**: a dockable workspace with panels for workflows, templates, chat threads, and setup.
- **Workflow Editor**: tabbed node editor for building graphs.
- **Global Chat**: full screen threads with tools and agent controls.
- **Mini‑Apps**: form‑like runner for a selected workflow.
- **Assets**: explorer with grid and table modes. :contentReference[oaicite:5]{index=5}

---

## Dashboard

The Dashboard is the default workspace. It hosts panels such as **Workflows**, **Recent chats**, **Templates**, **Welcome**, **Setup**, and an embedded **Chat** panel. Panels live inside Dockview so you can move, resize, and save a custom layout. Layouts persist and can be restored to defaults. :contentReference[oaicite:6]{index=6}

**What you can do here**

- Open workflows in tabs or launch templates
- Create a new workflow or chat thread
- Keep the chat panel visible while browsing
- Save and restore panel layouts from the menu :contentReference[oaicite:7]{index=7}

---

## Panels and layout management

NodeTool uses Dockview to manage panels in the Dashboard and other routes that opt into docking. You can:

- Drag panel tabs to re‑order or split horizontally and vertically
- Resize via panel borders
- Close panels with the tab X icon
- Add panels from the **Add Panel** dropdown
- Save or restore layouts using the **Layout** menu
- Toggle right, left, and bottom fixed panels in editor pages via their corresponding icons and stores :contentReference[oaicite:9]{index=9}

Panel visibility and sizes are stored so your workspace re‑opens the same way. The **LayoutStore** and related stores back this behavior. :contentReference[oaicite:10]{index=10}

---

## Workflow Editor

The editor is a tabbed canvas for visual workflows built with XYFlow. Each tab opens one workflow; you can switch with `Ctrl/⌘+1…9` or by clicking the tab strip. :contentReference[oaicite:11]{index=11}

### Canvas basics

- **Pan** with Space + drag or right‑mouse drag
- **Zoom** with Ctrl/⌘ + scroll
- **Fit view** with `F` or `Ctrl/⌘+0`
- **Auto layout** from the toolbar to tidy the graph (ELK‑based) :contentReference[oaicite:12]{index=12}

### Nodes and connections

- Open the **Node Menu** by pressing Space or double‑clicking the canvas. Search or browse namespaces on the left.
- Drag from an output to an input. The editor validates types and shows only compatible targets.
- Drop a connection on empty space to open the **Connection Menu**, which can auto‑create compatible nodes. :contentReference[oaicite:13]{index=13}

### Selection and editing

- Box select or multi‑select with Shift‑click
- Duplicate with `Ctrl/⌘+D`
- Align nodes with `A` or `Shift+A` for even spacing
- Group with `Ctrl/⌘+G`
- Clipboard actions: copy, paste, cut
- Undo and redo history with `Ctrl/⌘+Z` and `Ctrl/⌘+Shift+Z` (powered by zundo) :contentReference[oaicite:14]{index=14}

### Properties and inspector

- Select a node to view its **Properties** in the right panel
- Inputs, outputs, defaults, and validation errors are shown inline
- On‑canvas node docs and the draggable documentation panel are available for many node types :contentReference[oaicite:15]{index=15}

### Running and streaming

- Run the current workflow with the bottom‑right Play button or `Ctrl/⌘+Enter`
- Cancel with the Stop button or `Esc`
- Status and results stream live into **Results** and **Status** stores; previews update in place
- You can reconnect to a running job after a reload. The editor will re‑bind to WebSocket updates. :contentReference[oaicite:16]{index=16}

### Command Menu

Press `Alt+K` or `⌘+K` to open the **Command Menu**. It provides quick actions like opening workflows, switching layouts, creating nodes, or navigating routes. :contentReference[oaicite:17]{index=17}

---

## Global Chat

Global Chat is a thread‑centric assistant with tools and optional autonomous **Agent Mode**. You can run it full screen under `/chat` or embed it as a Dashboard panel. :contentReference[oaicite:18]{index=18}

**Threads**

- New thread, rename, delete
- Persistent history with pagination
- Rich content messages with text, images, audio, and video :contentReference[oaicite:19]{index=19}

**Agent Mode and tools**

- Toggle Agent Mode to allow planning and tool use
- Follow **Planning** and **Task** updates in real time
- Select model, tools, and collections per thread
- The agent can create or update workflows, which appear directly in the editor via graph updates and auto layout :contentReference[oaicite:20]{index=20}

**Connectivity**

- The chat connects over a dedicated WebSocket with status indicators and reconnection behavior handled for you :contentReference[oaicite:21]{index=21}

---

## Mini‑Apps

The **Mini‑App Runner** turns a workflow into a simple app with an input form and a results view. Open it under `/apps/:workflowId`. It shows:

- Auto‑generated form based on workflow inputs
- Status text and progress bar while running
- Results panel with previews
- **Open in Editor** to jump back to graph editing :contentReference[oaicite:22]{index=22}

---

## Assets

Use the **Asset Explorer** to browse, upload, preview, tag, and organize files.

- Grid and table views with infinite scroll
- Folder tree, context menus for move, rename, delete
- Previewers for audio, image, PDF, text, and video
- Drag files from the desktop into the editor to create nodes that reference those assets :contentReference[oaicite:23]{index=23}

---

## Models Manager and downloads

Open the **Models** dialog from the header.

- Filter by provider or capability; search by name or repo id
- Download, show in Explorer, delete, and read README where available
- Recommended and required models surfaces help pick compatible models
- Downloads continue in the background. The bottom bar shows overall progress and a dialog lists active tasks. :contentReference[oaicite:24]{index=24}

You can also configure provider keys and preferences in Settings. Local and cloud models can be mixed within one project. :contentReference[oaicite:25]{index=25}

---

## Templates and Collections

**Templates** are example workflows you can open from Dashboard panels or the Templates route. **Collections** let you organize assets and workflows into groups for reuse and RAG. Both have searchable grids and quick‑open actions. :contentReference[oaicite:26]{index=26}

---

## Command Menu and search

There are three search entry points:

- **Command Menu**: `Alt+K` or `⌘+K` for commands and navigation
- **Node Menu**: Space or canvas double‑click for node search
- **Dashboard lists**: search boxes in templates and workflows :contentReference[oaicite:27]{index=27}

Search results highlight matches and respect type compatibility in the editor. :contentReference[oaicite:28]{index=28}

---

## Notifications, status, and errors

- Toasts surface success and failure events
- The header and status bar show connection and job state
- Error boundaries catch React errors and render a friendly message per route
- Logs and update streams are reflected in stores that drive on‑screen indicators :contentReference[oaicite:29]{index=29}

---

## Themes, accessibility, and mobile

NodeTool ships a CSS‑vars theme with light and dark palettes, tuned typography, and accessible contrast. It adapts to system theme and supports mobile class tweaks for small screens. Touch interactions include pinch‑zoom and swipe navigation where appropriate. :contentReference[oaicite:30]{index=30}

> Tip: You can switch themes in Settings and the change applies across panels instantly. :contentReference[oaicite:31]{index=31}

---

## Keyboard shortcuts

**Global**

- `Alt+K` or `⌘+K` open Command Menu
- `Ctrl/⌘+N` new workflow
- `Ctrl/⌘+O` open workflow
- `Ctrl/⌘+S` save
- `Ctrl/⌘+Z` undo, `Ctrl/⌘+Shift+Z` redo
- `Ctrl/⌘+1…9` switch editor tabs :contentReference[oaicite:32]{index=32}

**Editor**

- Space + drag to pan, `Ctrl/⌘+scroll` to zoom
- `F` fit to screen
- `Ctrl/⌘+Enter` run, `Esc` stop
- `Ctrl/⌘+C / V / X / D` copy, paste, cut, duplicate
- `Ctrl/⌘+G` group
- `A` align, `Shift+A` align and distribute
- Arrow keys nudge selection :contentReference[oaicite:33]{index=33}

**Chat**

- `Enter` send, `Shift+Enter` newline
- `Esc` stop generation :contentReference[oaicite:34]{index=34}

---

## Troubleshooting UI

- **I do not see nodes or metadata**: reload to trigger metadata fetch. The splash shows a progress indicator if metadata is still loading. :contentReference[oaicite:35]{index=35}
- **No live updates**: check the WebSocket status in the header. Reconnects happen automatically, but a stale auth session can block it until you log in again. :contentReference[oaicite:36]{index=36}
- **Models page empty**: ensure provider keys are set in Settings or install local models. Use the Recommended Models dialog on compatible nodes. :contentReference[oaicite:37]{index=37}
- **Layout broken**: restore the default Dockview layout from the Layout menu. :contentReference[oaicite:38]{index=38}
