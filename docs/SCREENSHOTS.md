# Screenshot List for NodeTool Documentation

Screenshots needed for NodeTool documentation. Each entry includes page location, position, description, priority, and notes.

> **Visual index of every view:** see [`app-views.md`](app-views.md). Any view listed there without a real screenshot today is tracked on this page. The goal is to have **every view** in the app represented by an image on the docs site.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [User Interface](#user-interface)
3. [Workflow Editor](#workflow-editor)
4. [Editor Panels](#editor-panels)
5. [Chain Editor](#chain-editor)
6. [Workflow Graph View](#workflow-graph-view)
7. [Templates Gallery](#templates-gallery)
8. [Collections](#collections)
9. [Global Chat](#global-chat)
10. [Models Manager](#models-manager)
11. [Assets](#assets)
12. [Mini-Apps](#mini-apps)
13. [Mobile App](#mobile-app)
14. [Desktop / Electron](#desktop--electron)
15. [Cookbook Examples](#cookbook-examples)
16. [Configuration & Settings](#configuration--settings)
17. [Authentication](#authentication)

---

## Getting Started

### Screenshot: Dashboard Overview
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | After "Step 1 — Install NodeTool", before Step 2 |
| **Description** | Full dashboard view showing Templates panel, Recent Workflows, and navigation header |
| **Priority** | High |
| **Filename** | `assets/screenshots/dashboard-overview.png` |
| **Notes** | Show a clean dashboard with 2-3 workflow cards visible. Include the header with Models, Assets, Templates, and Chat buttons clearly visible. |

### Screenshot: Model Manager - First Models
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | In "Install Your First AI Models" section |
| **Description** | Model Manager dialog showing GPT-OSS and Flux models with download buttons |
| **Priority** | High |
| **Filename** | `assets/screenshots/model-manager-starter.png` |
| **Notes** | Highlight the recommended starter models. Show download progress if possible. |

### Screenshot: Creative Story Ideas Template
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | In "Option A: Creative Story Ideas" section |
| **Description** | The Creative Story Ideas workflow open in the editor showing StringInput → Agent → Preview nodes |
| **Priority** | High |
| **Filename** | `assets/screenshots/creative-story-workflow.png` |
| **Notes** | Show the workflow with visible node names. Include the Run button in the toolbar. |

### Screenshot: Workflow Running with Streaming Output
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | After "Watch" instruction |
| **Description** | The workflow mid-execution showing streaming text in the Preview node |
| **Priority** | High |
| **Filename** | `assets/screenshots/workflow-streaming-output.png` |
| **Notes** | Capture during execution to show streaming progress indicator and partial text output. |

### Screenshot: Global Chat with Workflow Attached
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | In "Step 3 — Save and Run from Chat" |
| **Description** | Global Chat interface with a workflow attached in the composer |
| **Priority** | High |
| **Filename** | `assets/screenshots/chat-workflow-attached.png` |
| **Notes** | Show the workflow menu open or the workflow chip visible in the input area. |

### Screenshot: Mini-App Interface
| Field | Value |
|-------|-------|
| **Page** | `getting-started.md` |
| **Position** | In "Step 4 — Create a Mini-App" |
| **Description** | A Mini-App showing a clean form interface with inputs and Run button |
| **Priority** | High |
| **Filename** | `assets/screenshots/mini-app-interface.png` |
| **Notes** | Show how the complex workflow is simplified to just input fields and output. |

---

## User Interface

### Screenshot: Full Application Layout
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | After "At a Glance" table |
| **Description** | Annotated full app screenshot showing header, sidebar, canvas, and panels |
| **Priority** | High |
| **Filename** | `assets/screenshots/app-layout-annotated.png` |
| **Notes** | Add numbered annotations (1-5) pointing to: Header, Left Sidebar, Canvas, Right Panel, Bottom Toolbar. |

### Screenshot: App Header
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "The App Header" section |
| **Description** | Close-up of the header bar showing Logo, Models, Assets, Templates, Chat, Settings |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/app-header.png` |
| **Notes** | Crop to just the header. Show download indicator if active. |

### Screenshot: Dashboard - Your Workflows
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "Dashboard" section |
| **Description** | Dashboard showing workflow cards in grid layout |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/dashboard-workflows.png` |
| **Notes** | Show 4-6 workflow cards with thumbnails if available. |

### Screenshot: Node Menu Open
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "Adding Nodes" under Workflow Editor section |
| **Description** | Node Menu open showing search bar and category tree |
| **Priority** | High |
| **Filename** | `assets/screenshots/node-menu-open.png` |
| **Notes** | Show a search query like "image" with filtered results. |

### Screenshot: Properties Panel
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "The Properties Panel" section |
| **Description** | Right panel showing node properties for an Agent node |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/properties-panel.png` |
| **Notes** | Select an Agent node to show various property types (dropdowns, text inputs, toggles). |

### Screenshot: Global Chat Interface
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "Global Chat" section |
| **Description** | Global Chat showing conversation threads and message area |
| **Priority** | High |
| **Filename** | `assets/screenshots/global-chat-interface.png` |
| **Notes** | Show the thread list on left, messages in center, and input area at bottom. |

### Screenshot: Command Menu
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` |
| **Position** | In "Command Menu" section |
| **Description** | Command menu overlay showing search results |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/command-menu.png` |
| **Notes** | Type a partial query to show autocomplete suggestions. |

---

## Workflow Editor

### Screenshot: Canvas with Workflow
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | After "The Canvas" section intro |
| **Description** | Canvas showing a medium-complexity workflow with 5-8 connected nodes |
| **Priority** | High |
| **Filename** | `assets/screenshots/canvas-workflow.png` |
| **Notes** | Show good visual organization with clear left-to-right data flow. |

### Screenshot: Adding Node via Smart Connect
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Adding Nodes" section, Method 3 |
| **Description** | Dragging a connection to empty space showing the compatible nodes popup |
| **Priority** | High |
| **Filename** | `assets/screenshots/smart-connect.png` |
| **Notes** | Drag from an image output to show image-compatible nodes. |

### Screenshot: Node Anatomy
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Understanding Nodes" section |
| **Description** | A single node with annotations pointing to Header, Inputs, Outputs, Properties |
| **Priority** | High |
| **Filename** | `assets/screenshots/node-anatomy-annotated.png` |
| **Notes** | Use an Agent node or image processing node that has multiple inputs/outputs. |

### Screenshot: Connection Types - Color Coded
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Making Connections" section |
| **Description** | Workflow showing different connection types (text, image, audio) with visible color coding |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/connection-colors.png` |
| **Notes** | Use a multi-modal workflow that shows at least 3 different connection colors. |

### Screenshot: Workflow Running - Progress Indicators
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Watching Progress" section |
| **Description** | Workflow during execution showing node status indicators (running, complete) |
| **Priority** | High |
| **Filename** | `assets/screenshots/workflow-progress.png` |
| **Notes** | Capture mid-execution to show different node states. |

### Screenshot: Missing Model Indicator
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Missing Models" section |
| **Description** | A node showing the "Missing Model" indicator with the recommended models dialog |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/missing-model.png` |
| **Notes** | Show the clickable indicator and the dialog that appears. |

### Screenshot: Auto Layout Before/After
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Auto Layout" section |
| **Description** | Side-by-side showing messy layout vs. after Auto Layout |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/auto-layout-comparison.png` |
| **Notes** | Create a composite image or show two screenshots. |

### Screenshot: Node Groups
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Grouping Nodes" section |
| **Description** | A group containing multiple nodes, both expanded and collapsed views |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/node-groups.png` |
| **Notes** | Show a logical grouping like "Image Processing" with 3-4 nodes. |

### Screenshot: Multiple Tabs
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Multiple Workflows" under Panels and Tabs |
| **Description** | Editor showing multiple workflow tabs at the top |
| **Priority** | Low |
| **Filename** | `assets/screenshots/workflow-tabs.png` |
| **Notes** | Show 3-4 tabs with visible workflow names. |

### Screenshot: Left Panel - Assets View
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Left Panel" section |
| **Description** | Left panel showing the Assets view with files and folders |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/left-panel-assets.png` |
| **Notes** | Show various asset types (images, audio, documents). |

### Screenshot: Inspector Panel
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Right Panel (Inspector)" section |
| **Description** | Inspector panel showing detailed node documentation |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/inspector-panel.png` |
| **Notes** | Select a node with good documentation to show the help content. |

### Screenshot: Context Menu on Node
| Field | Value |
|-------|-------|
| **Page** | `workflow-editor.md` |
| **Position** | In "Context Menus" section |
| **Description** | Right-click context menu on a node showing options |
| **Priority** | Low |
| **Filename** | `assets/screenshots/context-menu-node.png` |
| **Notes** | Show common actions: Copy, Duplicate, Delete, Group. |

---

## Global Chat

### Screenshot: Thread List
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | In "Thread Management" section |
| **Description** | Thread list sidebar showing multiple conversations with auto-generated names |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/chat-thread-list.png` |
| **Notes** | Show 5-6 threads with varied names. |

### Screenshot: Agent Mode Enabled
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | In "What is Agent Mode?" section |
| **Description** | Chat interface with Agent Mode toggle visible and enabled |
| **Priority** | High |
| **Filename** | `assets/screenshots/agent-mode-enabled.png` |
| **Notes** | Show the Agent Mode toggle in the ON state. |

### Screenshot: Agent Planning Updates
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | In "Planning Updates" section |
| **Description** | Chat showing agent planning steps and reasoning |
| **Priority** | High |
| **Filename** | `assets/screenshots/agent-planning.png` |
| **Notes** | Capture during agent execution to show plan breakdown and progress updates. |

### Screenshot: Tools Menu
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | After mention of Tools menu in Agent capabilities |
| **Description** | Tools dropdown showing available tools (web search, image generation, etc.) |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/chat-tools-menu.png` |
| **Notes** | Show expanded tools list with categories. |

### Screenshot: Model Selector
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | In "Chat Features" table area |
| **Description** | Model selector dropdown showing available AI models |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/chat-model-selector.png` |
| **Notes** | Show various providers (OpenAI, Anthropic, local models). |

### Screenshot: Rich Content Message
| Field | Value |
|-------|-------|
| **Page** | `global-chat.md` |
| **Position** | In "Thread Features" section |
| **Description** | Chat message containing an image or generated content |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/chat-rich-content.png` |
| **Notes** | Show AI-generated image or audio player embedded in chat. |

---

## Models Manager

### Screenshot: Models Manager - Full View
| Field | Value |
|-------|-------|
| **Page** | `models-manager.md` |
| **Position** | After "Opening the manager" section |
| **Description** | Full Models Manager dialog showing grid of models with filters |
| **Priority** | High |
| **Filename** | `assets/screenshots/models-manager-full.png` |
| **Notes** | Show a variety of model types visible. Include the type filters on the left. |

### Screenshot: Model Type Filters
| Field | Value |
|-------|-------|
| **Page** | `models-manager.md` |
| **Position** | In "Browsing your models" section |
| **Description** | Left sidebar filters showing LLM, VLM, Embedding, Image Gen, etc. |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/models-filters.png` |
| **Notes** | Highlight the filter options and show one selected. |

### Screenshot: Model Card - Actions
| Field | Value |
|-------|-------|
| **Page** | `models-manager.md` |
| **Position** | In "Managing files" section |
| **Description** | A model card showing Download, Show in Explorer, Delete, README buttons |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/model-card-actions.png` |
| **Notes** | Focus on a single model card with action buttons visible. |

### Screenshot: Download Progress
| Field | Value |
|-------|-------|
| **Page** | `models-manager.md` |
| **Position** | At end of page (after "Downloads continue while you navigate") |
| **Description** | Bottom progress bar showing model download progress |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/model-download-progress.png` |
| **Notes** | Show the progress indicator during an active download. |

---

## Assets

### Screenshot: Asset Explorer
| Field | Value |
|-------|-------|
| **Page** | `asset-management.md` |
| **Position** | After introduction |
| **Description** | Asset Explorer panel showing files organized in folders |
| **Priority** | High |
| **Filename** | `assets/screenshots/asset-explorer.png` |
| **Notes** | Show a variety of asset types with thumbnails. |

### Screenshot: Asset Preview
| Field | Value |
|-------|-------|
| **Page** | `asset-management.md` |
| **Position** | In "Working with Assets" section |
| **Description** | Asset preview showing an image with metadata |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/asset-preview.png` |
| **Notes** | Click an image to show the preview modal/panel. |

### Screenshot: Drag Asset to Canvas
| Field | Value |
|-------|-------|
| **Page** | `asset-management.md` |
| **Position** | In section about using assets in workflows |
| **Description** | Dragging an asset from the panel onto the workflow canvas |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/drag-asset-canvas.png` |
| **Notes** | Show the drag ghost and drop target on canvas. |

---

## Mini-Apps

### Screenshot: Mini-App Builder
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` (Mini-Apps section) |
| **Position** | In Mini-Apps section |
| **Description** | The Mini-App interface showing how workflow is transformed into a form |
| **Priority** | High |
| **Filename** | `assets/screenshots/mini-app-builder.png` |
| **Notes** | Show the transition from complex workflow to simple form UI. |

### Screenshot: Mini-App Running
| Field | Value |
|-------|-------|
| **Page** | `user-interface.md` (Mini-Apps section) |
| **Position** | After showing the builder |
| **Description** | Mini-App with results displayed after running |
| **Priority** | High |
| **Filename** | `assets/screenshots/mini-app-results.png` |
| **Notes** | Show completed output in the Mini-App interface. |

---

## Cookbook Examples

### Screenshot: RAG Workflow
| Field | Value |
|-------|-------|
| **Page** | `cookbook.md` or `cookbook/patterns.md` |
| **Position** | In Pattern 4: RAG section |
| **Description** | Complete RAG workflow showing HybridSearch → FormatText → Agent flow |
| **Priority** | High |
| **Filename** | `assets/screenshots/cookbook-rag-workflow.png` |
| **Notes** | Show the actual workflow implementing the Mermaid diagram. |

### Screenshot: Image Enhancement Pipeline
| Field | Value |
|-------|-------|
| **Page** | `cookbook.md` |
| **Position** | In Pattern 1: Simple Pipeline |
| **Description** | Image enhancement workflow: ImageInput → Sharpen → AutoContrast → ImageOutput |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/cookbook-image-enhance.png` |
| **Notes** | Show the workflow with visible node connections. |

### Screenshot: Agent-Driven Generation
| Field | Value |
|-------|-------|
| **Page** | `cookbook.md` |
| **Position** | In Pattern 2: Agent-Driven Generation |
| **Description** | Image to Story workflow showing multimodal transformation |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/cookbook-image-to-story.png` |
| **Notes** | Show Image → Agent → TextToSpeech → Preview flow. |

### Screenshot: Realtime Agent Workflow
| Field | Value |
|-------|-------|
| **Page** | `cookbook.md` |
| **Position** | In Pattern 7: Realtime Processing |
| **Description** | Realtime agent workflow with audio input and output |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/cookbook-realtime-agent.png` |
| **Notes** | Show RealtimeAudioInput → RealtimeAgent → Preview. |

### Screenshot: Data Visualization Pipeline
| Field | Value |
|-------|-------|
| **Page** | `cookbook.md` |
| **Position** | In Pattern 10: Data Processing Pipeline |
| **Description** | Data viz workflow showing GetRequest → ImportCSV → ChartGenerator |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/cookbook-data-viz.png` |
| **Notes** | Show the complete pipeline with Preview nodes showing charts. |

---

## Configuration & Settings

### Screenshot: Settings Dialog
| Field | Value |
|-------|-------|
| **Page** | `configuration.md` |
| **Position** | After introduction |
| **Description** | Settings dialog showing main configuration options |
| **Priority** | High |
| **Filename** | `assets/screenshots/settings-dialog.png` |
| **Notes** | Show the settings organization (tabs or sections). |

### Screenshot: Provider API Keys
| Field | Value |
|-------|-------|
| **Page** | `configuration.md` or `models-and-providers.md` |
| **Position** | In API configuration section |
| **Description** | Settings showing where to enter API keys for OpenAI, Anthropic, etc. |
| **Priority** | High |
| **Filename** | `assets/screenshots/settings-api-keys.png` |
| **Notes** | Show the provider configuration without actual keys visible. |

### Screenshot: Authentication Settings
| Field | Value |
|-------|-------|
| **Page** | `authentication.md` |
| **Position** | After introduction |
| **Description** | Authentication settings showing Supabase vs Localhost mode options |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/settings-auth.png` |
| **Notes** | Show the toggle between cloud sync and local-only mode. |

---

## Key Concepts

### Screenshot: Node Types Overview
| Field | Value |
|-------|-------|
| **Page** | `key-concepts.md` |
| **Position** | In Node Types section |
| **Description** | Canvas showing examples of different node types (Input, Processing, Agent, Output) |
| **Priority** | High |
| **Filename** | `assets/screenshots/node-types-overview.png` |
| **Notes** | Group example nodes by type and annotate them. |

### Screenshot: Data Flow Direction
| Field | Value |
|-------|-------|
| **Page** | `key-concepts.md` |
| **Position** | In Data Flow section |
| **Description** | Workflow with arrows indicating left-to-right data flow |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/data-flow-direction.png` |
| **Notes** | Annotate with arrows showing input → processing → output flow. |

---

## Editor Panels

### Screenshot: Left Panel (Workflows / Chat / Assets / Collections / Packs / VibeCoding)
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md`, `app-views.md` |
| **Position** | In "Left Panel" section — one capture per tab |
| **Description** | Each left-panel tab in turn with a representative workspace |
| **Priority** | High |
| **Filename** | `assets/screenshots/left-panel-<tab>.png` |
| **Notes** | Tabs: workflows, chat, assets, collections, packs, vibecoding. |

### Screenshot: Right Panel (Inspector + other tabs)
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md` |
| **Position** | In "Right Panel (Inspector)" section |
| **Description** | Inspector showing node properties, and additional tabs (Logs, Jobs, Agent, Trace, Version History, Workspace) |
| **Priority** | High |
| **Filename** | `assets/screenshots/right-panel-<tab>.png` |
| **Notes** | Capture a tab per image: `right-panel-inspector.png`, `right-panel-logs.png`, `right-panel-jobs.png`, `right-panel-agent.png`, `right-panel-trace.png`, `right-panel-version.png`, `right-panel-workspace.png`. |

### Screenshot: Bottom Panel (Terminal / Trace / Jobs / Logs)
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md` |
| **Position** | In "Bottom Panel" section |
| **Description** | Each bottom-panel tab in turn |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/bottom-panel-<tab>.png` |
| **Notes** | Tabs: terminal, trace, jobs, logs, system-stats. |

### Screenshot: Floating Toolbar states
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md`, `workflow-editor.md` |
| **Position** | In "Floating Toolbar" section |
| **Description** | Toolbar in idle, running, paused, and suspended states |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/floating-toolbar-<state>.png` |
| **Notes** | States: idle, running, paused, suspended. |

### Screenshot: Right Side Buttons
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md` |
| **Position** | In "Right Side Buttons" section |
| **Description** | Stack of toggle buttons on the right edge of the canvas |
| **Priority** | Low |
| **Filename** | `assets/screenshots/right-side-buttons.png` |
| **Notes** | Capture with notifications badge visible. |

### Screenshot: Workflow Assistant Chat
| Field | Value |
|-------|-------|
| **Page** | `editor-panels.md`, `global-chat.md` |
| **Position** | In "Workflow Assistant Chat" section |
| **Description** | Side panel chat with the assistant mid-response |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/workflow-assistant.png` |
| **Notes** | Show assistant modifying the workflow. |

---

## Chain Editor

### Screenshot: Chain Editor — Empty
| Filename | Status |
|----------|--------|
| `assets/screenshots/web-chain-editor-empty.png` | Captured |

### Screenshot: Chain Editor — Chain
| Filename | Status |
|----------|--------|
| `assets/screenshots/web-chain-editor-chain.png` | Captured |

### Screenshot: Chain Editor — Picker
| Filename | Status |
|----------|--------|
| `assets/screenshots/web-chain-editor-picker.png` | Captured |

### Screenshot: Chain Card Properties
| Field | Value |
|-------|-------|
| **Page** | `chain-editor.md` |
| **Position** | In "Editing Card Properties" |
| **Description** | Expanded card showing property fields |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/chain-card-properties.png` |

---

## Workflow Graph View

### Screenshot: Read-only Graph
| Field | Value |
|-------|-------|
| **Page** | `workflow-graph-view.md` |
| **Position** | Top of page |
| **Description** | Read-only graph view of a saved workflow |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/workflow-graph-view.png` |
| **Notes** | No inspector or panels visible. Include title overlay. |

---

## Templates Gallery

### Screenshot: Templates Grid
| Filename | Status |
|----------|--------|
| `assets/screenshots/templates-grid.png` | Captured |

### Screenshot: Template Card Hover
| Field | Value |
|-------|-------|
| **Page** | `templates-gallery.md` |
| **Position** | In "Anatomy of a Template Card" |
| **Description** | Single card with hover preview and badges |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/template-card-hover.png` |

### Screenshot: Template Filters
| Field | Value |
|-------|-------|
| **Page** | `templates-gallery.md` |
| **Position** | In "Filtering and Searching" |
| **Description** | Filter bar with a tag active and a search typed |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/template-filters.png` |

---

## Collections

### Screenshot: Collections Explorer
| Filename | Status |
|----------|--------|
| `assets/screenshots/collections-explorer.png` | Captured |

### Screenshot: New Collection
| Field | Value |
|-------|-------|
| **Page** | `collections.md` |
| **Position** | In "Creating a Collection" |
| **Description** | New Collection dialog with a name typed in |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/new-collection.png` |

### Screenshot: Collection Details
| Field | Value |
|-------|-------|
| **Page** | `collections.md` |
| **Position** | In "Managing Documents" |
| **Description** | Open collection with 4–6 documents and an index status bar |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/collection-details.png` |

### Screenshot: Collection Settings
| Field | Value |
|-------|-------|
| **Page** | `collections.md` |
| **Position** | In "Indexing Options" |
| **Description** | Per-collection settings panel (embedding model, chunk size, overlap, hybrid toggle) |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/collection-settings.png` |

---

## Mobile App

### Screenshots (captured)

| Filename | Page | Position |
|----------|------|----------|
| `assets/screenshots/dashboard-mobile.png` | `mobile-app.md` | Top |
| `assets/screenshots/dashboard-tablet.png` | `mobile-app.md` | Tablet Dashboard |
| `assets/screenshots/chat-mobile.png` | `mobile-app.md` | AI Chat |
| `assets/screenshots/mobile-graph-editor-overview.png` | `mobile-app.md` | Mobile Graph Editor — Overview |
| `assets/screenshots/mobile-graph-editor-empty.png` | `mobile-app.md` | Mobile Graph Editor — Empty |
| `assets/screenshots/mobile-graph-editor-picker.png` | `mobile-app.md` | Mobile Graph Editor — Picker |
| `assets/screenshots/mobile-graph-editor-chain.png` | `mobile-app.md` | Mobile Graph Editor — Chain |

### Pending

| Filename | Page | Description |
|----------|------|-------------|
| `assets/screenshots/mobile-mini-apps-list.png` | `mobile-app.md` | Mini-apps list with tiles |
| `assets/screenshots/mobile-mini-app-runner.png` | `mobile-app.md` | Running a single mini-app |
| `assets/screenshots/mobile-settings.png` | `mobile-app.md` | Mobile settings screen |
| `assets/screenshots/mobile-model-selection.png` | `mobile-app.md` | Language model picker |

---

## Desktop / Electron

| Filename | Page | Description |
|----------|------|-------------|
| `assets/screenshots/electron-boot.png` | `electron-views.md` | Splash while backend starts |
| `assets/screenshots/electron-install-wizard.png` | `electron-views.md` | First-run Python/runtime installer |
| `assets/screenshots/electron-package-manager.png` | `electron-views.md` | Package Manager native window |
| `assets/screenshots/electron-log-viewer.png` | `electron-views.md` | Log Viewer tailing backend logs |
| `assets/screenshots/electron-update-toast.png` | `electron-views.md` | Update-available toast |
| `assets/screenshots/electron-workflow-pin.png` | `electron-views.md` | Pinned frameless workflow window |
| `assets/screenshots/electron-miniapp-window.png` | `electron-views.md` | Mini-app launched from tray |
| `assets/screenshots/electron-tray.png` | `electron-views.md` | Tray icon with expanded menu |
| `assets/screenshots/electron-menu-bar.png` | `electron-views.md` | Native menu bar expanded |

---

## Authentication

### Screenshot: Login Screen
| Field | Value |
|-------|-------|
| **Page** | `authentication.md`, `app-views.md` |
| **Position** | Top of page |
| **Description** | Login screen with provider buttons |
| **Priority** | Medium |
| **Filename** | `assets/screenshots/login.png` |
| **Notes** | Capture both Supabase mode and Localhost mode if possible. |

---

## Summary Statistics

| Category | Screenshot Count |
|----------|-----------------|
| Getting Started | 6 |
| User Interface | 8 |
| Workflow Editor | 12 |
| Editor Panels | 20+ (multiple per tab) |
| Chain Editor | 4 (3 captured) |
| Workflow Graph View | 1 |
| Templates Gallery | 3 (1 captured) |
| Collections | 4 (1 captured) |
| Global Chat | 6 |
| Models Manager | 4 |
| Assets | 3 |
| Mini-Apps | 2 |
| Mobile App | 11 (7 captured) |
| Desktop / Electron | 9 |
| Cookbook Examples | 5 |
| Configuration & Settings | 3 |
| Key Concepts | 2 |
| Authentication | 1 |
| **Total** | **~100** |

---

## Screenshot Guidelines

### Technical Requirements

- **Resolution**: Minimum 1920x1080 for full-window screenshots; use 2x resolution (3840x2160) for Retina/HiDPI displays. For focused element screenshots, ensure text remains readable at typical documentation widths (600-800px).
- **Format**: PNG for UI screenshots (better quality for text/UI)
- **File Size**: Optimize with tools like ImageOptim, under 500KB preferred
- **Naming**: Use lowercase with hyphens: `feature-name-description.png`

### Visual Guidelines

- **Clean State**: Use fresh data, remove personal information
- **Light Theme**: Use the default/light theme for consistency
- **Focus**: Highlight the relevant area, blur or darken less relevant areas if needed
- **Annotations**: Use consistent colors (e.g., red for highlights, numbered callouts)
- **Cropping**: Crop to show relevant content, include context

### Annotation Standards

For annotated screenshots:
1. Use **red** circles or boxes for emphasis
2. Use **numbered callouts** (1, 2, 3...) for sequential explanations
3. Use **arrows** to show direction or flow
4. Keep annotation text brief and readable
5. Use a consistent font (Arial/Helvetica at 14-16px)

### Process

1. **Before capturing**: Clear personal data, set up clean example workflows
2. **Capture**: Use system screenshot tools or browser dev tools
3. **Annotate**: Use Figma, Sketch, or Preview for annotations
4. **Optimize**: Compress without losing quality
5. **Review**: Verify against this list before committing

---

## Notes for Contributors

### High-Priority Screenshots (Do First)

These screenshots will have the biggest impact on documentation quality:

1. `dashboard-overview.png` - First thing new users see
2. `app-layout-annotated.png` - Helps users orient themselves
3. `creative-story-workflow.png` - Core getting started flow
4. `node-anatomy-annotated.png` - Essential for understanding nodes
5. `workflow-streaming-output.png` - Shows streaming in NodeTool
6. `global-chat-interface.png` - Key feature for chat-first users
7. `models-manager-full.png` - Critical for model management
8. `agent-planning.png` - Showcases agent capabilities

### Screenshots That Need Workflows

Create these example workflows to capture screenshots:

1. **Simple Image Enhancement**: ImageInput → Sharpen → AutoContrast → ImageOutput
2. **RAG Chat**: ChatInput → HybridSearch → FormatText → Agent → StringOutput
3. **Multi-Modal Story**: ImageInput → Agent (describe) → TextToSpeech → Preview
4. **Data Pipeline**: GetRequest → ImportCSV → Filter → ChartGenerator → Preview

### Maintenance

- Review screenshots quarterly for UI changes
- Update screenshots when major features change
- Archive old screenshots instead of deleting
- Add new screenshots as features are added

---

*Last updated: December 2024*
