---
layout: page
title: "App Views Gallery"
description: "Visual index of the main screens in NodeTool. Each entry links to the detailed docs page."
---

The primary user-facing views in NodeTool — the destinations people actually navigate to across the web app, desktop (Electron), and mobile. Editor panels, modal dialogs, and developer-only pages are documented on their parent docs pages.

---

## Main Views

These are the top-level routes in the web app and the main windows in the desktop app.

### Dashboard — `/dashboard`

The home screen. Search, recent workflows, templates, and quick chat.

![Dashboard Overview](assets/screenshots/dashboard-overview.png)

Docs: [User Interface → Dashboard]({{ '/user-interface#dashboard' | relative_url }}) · [Getting Started]({{ '/getting-started' | relative_url }})

### Workflow Editor — `/editor/:workflow`

The main visual editor. Build workflows by connecting nodes on an infinite canvas, with panels on every edge: left drawer, right inspector, bottom diagnostics, floating toolbar, node menu, and tabs.

![Workflow Editor](assets/screenshots/editor-empty-state.png)

Docs: [Workflow Editor]({{ '/workflow-editor' | relative_url }}) · [Editor Panels]({{ '/editor-panels' | relative_url }})

### Chain Editor — `/chain/:workflowId?`

A linear, card-based alternative to the node graph. Better for simple pipelines and guided authoring.

![Chain Editor](assets/screenshots/web-chain-editor-chain.png)

Docs: [Chain Editor]({{ '/chain-editor' | relative_url }})

### Global Chat — `/chat/:thread_id?`

Conversational AI with multi-thread history, agent mode, tools, and workflow integration.

![Global Chat](assets/screenshots/global-chat-interface.png)

Docs: [Global Chat]({{ '/global-chat' | relative_url }})

### Mini-Apps — `/apps/:workflowId?`

Run saved workflows through simplified form UIs. Mini-apps can also be launched as standalone frameless windows from the desktop tray.

![Mini-App Page](assets/screenshots/mini-app-page.png)

Docs: [User Interface → Mini-Apps]({{ '/user-interface#mini-apps' | relative_url }})

### Asset Explorer — `/assets`

Browse, search, organize, and tag every file used in your workflows. Opens the full-featured [Image Editor](assets/screenshots/asset-editor.png) for image assets.

![Asset Explorer](assets/screenshots/asset-explorer.png)

Docs: [Asset Management]({{ '/asset-management' | relative_url }}) · [Image Editor]({{ '/image-editor' | relative_url }})

### Collections — `/collections`

Group related documents into indexable collections for RAG workflows.

![Collections Explorer](assets/screenshots/collections-explorer.png)

Docs: [Collections]({{ '/collections' | relative_url }}) · [Indexing]({{ '/indexing' | relative_url }})

### Templates Gallery — `/templates`

Ready-to-use example workflows organized by tag and use case.

![Templates Grid](assets/screenshots/templates-grid.png)

Docs: [Templates Gallery]({{ '/templates-gallery' | relative_url }})

### Models Manager — `/models`

Find, install, filter, and manage local and cloud AI models.

![Models Manager](assets/screenshots/models-list.png)

Docs: [Models Manager]({{ '/models-manager' | relative_url }})

### Settings — Dialog

Central configuration surface: general preferences, provider API keys, folders, secrets, remote, and about.

![Settings Dialog](assets/screenshots/settings-dialog.png)

Docs: [Configuration]({{ '/configuration' | relative_url }}) · [Models & Providers]({{ '/models-and-providers' | relative_url }})

---

## Mobile

The full set of mobile screens lives in [Mobile App]({{ '/mobile-app' | relative_url }}). The three users see most:

### Mobile Dashboard

Entry point with connection status and quick actions.

![Mobile Dashboard](assets/screenshots/dashboard-mobile.png)

### Mobile Chat

Conversational AI with streaming, model picker, and threads.

![Mobile Chat](assets/screenshots/chat-mobile.png)

### Mobile Graph Editor

Touch-friendly workflow editor.

![Mobile Graph Editor](assets/screenshots/mobile-graph-editor-overview.png)

---

## Desktop (Electron)

The desktop app shares all the views above. These are unique to Electron:

### Install Wizard

First-run wizard for installing Python, Conda, and core AI runtimes.

Docs: [Electron Views → Install Wizard]({{ '/electron-views#install-wizard' | relative_url }})

### System Tray

Quick actions: open dashboard, open chat, launch a mini-app, quit.

Docs: [Electron Views → Tray]({{ '/electron-views#system-tray' | relative_url }})

For all desktop-specific windows (boot splash, package manager, log viewer, pinned workflow runs), see [Electron Views]({{ '/electron-views' | relative_url }}).

---

## How to Add a Screenshot

1. Launch NodeTool locally (`npm run dev` for web + backend; `npm run electron:dev` for desktop).
2. Navigate to the view and set up a clean example (no personal data, default theme).
3. Capture at **1920×1080** minimum — use 2× resolution for retina displays.
4. Save as PNG with a descriptive hyphenated name under `docs/assets/screenshots/`.
5. Replace the reference on the view's docs page and in `app-views.md`.
