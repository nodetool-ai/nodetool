---
layout: default
title: Architecture Overview
---

# Architecture Overview

This page explains how the pieces of NodeTool fit together. The codebase is split into multiple packages that interact through a simple client‑server design.

## High Level Diagram

```mermaid
%% For a dark themed diagram refer to `architecture.mermaid`
%% The original diagram lives in the repository root
%% and is reproduced here for convenience.
%%{init: {'theme':'default'}}%%

graph TD
    subgraph "Local Execution Boundary"
        A([Nodetool Editor ReactJS]) -->|HTTP/WebSocket| B([API Server])
        A <-->|WebSocket| C([WebSocket Runner])
        B <-->|Internal Communication| C
        C <-->|WebSocket| D([Worker with ML Models])
        D <-->|HTTP Callbacks| B
        E[Other Apps/Websites] -->|HTTP| B
        E <-->|WebSocket| C
    end
    subgraph "Optional Cloud GPU Node (User-Controlled)"
        D -->|Optional API Calls| F[External AI APIs]
    end
    classDef frontend fill:#ffcccc,stroke:#333;
    classDef server fill:#cce5ff,stroke:#333;
    classDef runner fill:#ccffe5,stroke:#333;
    classDef worker fill:#ccf2ff,stroke:#333;
    class A frontend
    class B server
    class C runner
    class D worker
```

## Repository Structure

- **`web/`** – React application containing the main workflow editor.
- **`apps/`** – Mini‑app builder that packages workflows as standalone apps.
- **`electron/`** – Electron wrapper providing the desktop experience and system tray integration.
- **`workflow_runner/`** – Lightweight WebSocket client used to show workflow progress.
- **`examples/`** – Node.js scripts demonstrating how to call the API.
- **`scripts/`** – Helper scripts for building and releasing NodeTool.

The Python backend lives inside the main repository and exposes a FastAPI server plus a WebSocket runner. Workers connect locally or remotely to execute nodes with CPU or GPU models.

## Data Flow

1. The **Web UI** communicates with the API server over HTTP for management tasks (saving workflows, listing assets, etc.).
2. During execution, the UI and other clients connect to the **WebSocket Runner** to receive live updates.
3. **Workers** run the individual nodes in a workflow. They can call external AI APIs such as OpenAI or Hugging Face when configured.
4. Results are streamed back through the runner to the frontends in real time.

This modular approach keeps the core editor lightweight while enabling heavy computation on dedicated workers or in the cloud.

Workflow execution and system stats use a shared GlobalWebSocketManager. Chat uses a dedicated WebSocket connection.

The web app blocks route rendering until metadata for all node types is loaded. This ensures type compatibility and
connection validation is correct.

When running on localhost, auth and routing are bypassed and the app boots into `/dashboard`.
