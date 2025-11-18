# Architecture Overview

This page explains how the pieces of NodeTool fit together. The codebase is split into multiple packages that interact through a simple client‑server design.

## Repository Structure

- **`web/`** – React application containing the main workflow editor.
- **`electron/`** – Electron wrapper providing the desktop experience and system tray integration.

The Python backend lives inside the main repository and exposes a FastAPI server plus a WebSocket runner. Workers connect locally or remotely to execute nodes with CPU or GPU models.

## Data Flow

1. The **Web UI** communicates with the API server over HTTP for management tasks (saving workflows, listing assets, etc.).
2. During execution, the UI connects to the **WebSocket Runner** to receive live updates from nodes.
3. Results are streamed back through the runner to the frontend in real time.

This modular approach keeps the core editor lightweight while enabling heavy computation on dedicated workers or in the cloud.

Workflow execution and system stats use a shared GlobalWebSocketManager. Chat uses a dedicated WebSocket connection.

The web app blocks rendering until metadata for all node types is loaded. This ensures type compatibility and connection validation is correct.