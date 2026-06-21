---
layout: page
title: "Desktop App Views"
description: "Windows, dialogs, menus, and tray surfaces unique to the NodeTool Electron desktop app."
---

The NodeTool desktop app is built on Electron. It reuses the web app for all workflow editing but adds a handful of native surfaces: a boot splash, package manager, log viewer, tray menu, pinned windows, and a native menu bar.

This page catalogs every desktop-only view with screenshots. Everything inside the main window is covered by [User Interface]({{ '/user-interface' | relative_url }}) and [Workflow Editor]({{ '/workflow-editor' | relative_url }}).

---

## Boot Message (Splash)

A minimal splash appears while the embedded Python runtime, backend server, and web app all come online.

![Boot Message](assets/screenshots/screenshot-placeholder.svg)

The splash streams progress messages — "Starting Python…", "Warming models…", "Connecting to server…". It closes the moment the backend reports ready.

There is no separate install wizard — the embedded Python environment and packages are checked and set up in the background at startup, and node packs and runtimes are managed from the **Package Manager** window.

---

## Package Manager

Opens from the app menu or `⌘K → Open Package Manager`. A native window sized 1200×900 that manages:

- Installed **node packs** and their upgrade availability.
- Optional **AI runtimes** (torch CUDA, torch MPS, llama.cpp).
- Conda environment health (Python version, cached wheels).
- Integrity checks — re-download a broken runtime in one click.

![Package Manager](assets/screenshots/screenshot-placeholder.svg)

See [Node Packs]({{ '/node-packs' | relative_url }}) for where packs come from and how to publish your own.

---

## Log Viewer

A persistent window that tails the backend log. Helpful for debugging without dropping to a terminal.

![Log Viewer](assets/screenshots/screenshot-placeholder.svg)

Each row is color-coded by severity — `info`, `warning`, or `error`. The viewer is a straightforward table tail with no level/component filters, search, or jump-to-source.

---

## Update Notification

When a new desktop release is available, a discreet toast appears with **Install now** and **Later** actions. The app restarts into the new build; there's no mandatory update interrupting a run.

![Update Notification](assets/screenshots/screenshot-placeholder.svg)

---

## Pinned Windows

Electron adds a few borderless, always-on-top window types:

### Workflow Execution Window

A frameless window that runs a single workflow with the inputs collapsed and the outputs centered. Great for a pinned dashboard on a second monitor.

![Workflow Execution Window](assets/screenshots/screenshot-placeholder.svg)

### Mini-App Window

A self-contained Mini-App launched from the tray. Maximum size 1200×900. Closing it doesn't quit NodeTool.

![Mini-App Window](assets/screenshots/screenshot-placeholder.svg)

### Chat Window

Standalone chat opened from the tray. Same content as [/standalone-chat]({{ '/user-interface#standalone-chat-window' | relative_url }}) but in its own window.

---

## System Tray

The tray icon stays running while NodeTool is active and exposes quick actions:

![Tray Menu](assets/screenshots/screenshot-placeholder.svg)

| Action | What it does |
|--------|--------------|
| Show NodeTool | Bring up the main window |
| Chat | Launch the standalone chat window |
| Mini Apps | Submenu of mini-apps published from your workflows |
| Package Manager | Open the Package Manager window |
| Log Viewer | Tail the backend log |
| Settings | Native settings window |
| Open Log File | Open the raw log file in the OS file handler |
| Quit NodeTool | Stop the backend and exit |

Above these actions the tray shows non-clickable status lines (server and managed-service state) plus a **Managed Model Services** submenu — for example a Llama.cpp entry to Install / Start / Stop the local server and toggle "Start on App Startup" — along with **Start Service** / **Stop Service** to control the backend and an **On Close Behavior** submenu.

---

## Native Menu Bar

On macOS and Windows a native menu bar is attached to the main window.

![Menu Bar](assets/screenshots/screenshot-placeholder.svg)

On macOS the app menu (**NodeTool**) holds the standard About / Services / Hide / **Quit** items; **Quit** uses the platform default and has no explicit accelerator in the menu.

### File

| Item | Shortcut | Action |
|------|----------|--------|
| Save | `Ctrl/⌘ + S` | Save the active workflow |
| New Workflow | `Ctrl/⌘ + T` | Open a blank workflow in a new tab |
| Close Tab | `Ctrl/⌘ + W` | Close the active editor tab |

### Edit

Undo, Redo, Cut, Copy, Paste, Duplicate, Duplicate Vertical, Group, Select All, Align, and Align with Spacing — mapped to the same shortcuts used on the canvas.

### View

| Item | Shortcut | Action |
|------|----------|--------|
| Fit View | `Ctrl/⌘ + 0` | Fit the graph to the viewport |
| Reset Zoom | | Reset the canvas zoom |
| Zoom In | | Zoom the canvas in |
| Zoom Out | | Zoom the canvas out |
| Toggle Fullscreen | | Enter/exit fullscreen |

### Tools

| Item | Action |
|------|--------|
| Chat | Open the standalone chat window |
| Package Manager | Open the Package Manager window |
| Log Viewer | Open the Log Viewer window |
| Performance Monitor | Open the performance monitor window |
| Settings | Open the native settings window |

There is no in-menu Reload or DevTools item; DevTools toggles with `Ctrl/⌘ + Shift + I` and only in unpackaged (dev) builds.

### Window / Help

**Window** offers the platform-standard Minimize. **Help** has **Learn More** (opens https://nodetool.ai) and **System Information** (a native dialog with app, OS, and runtime versions).

---

## Where the Electron Code Lives

For contributors:

- `electron/src/main.ts` — entry point, window lifecycle.
- `electron/src/window.ts` — main window.
- `electron/src/workflowWindow.ts` — pinned workflow and mini-app windows.
- `electron/src/tray.ts` — tray icon and menu.
- `electron/src/menu.ts` — native menu bar.
- `electron/src/components/` — React components for the native windows.

See the [Electron developer guide]({{ '/developer/' | relative_url }}) for build and debugging tips.

---

## Related Docs

- [Installation]({{ '/installation' | relative_url }}) — download and first-run
- [Configuration]({{ '/configuration' | relative_url }}) — settings persisted per-user
- [Troubleshooting]({{ '/troubleshooting' | relative_url }}) — boot and install issues
- [Deployment]({{ '/deployment' | relative_url }}) — self-hosted / cloud alternatives
