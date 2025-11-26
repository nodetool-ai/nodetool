---
layout: page
title: "API Server Overview"
---



The API package implements the **Editor API** used by the NodeTool application and desktop app. It exposes HTTP
endpoints and WebSocket handlers for managing workflows, jobs, assets, messages, and settings. This API is the control
plane for the local UI and is not meant to be exposed directly to the public internet—use the Worker API instead for
remote clients (see [API Reference](api-reference.md#api-families-and-why-they-exist)).

Important modules:

- **`server.py`** – creates the FastAPI app and registers routers, WebSocket endpoints (`/predict`, `/chat`, `/updates`, `/terminal`), and optional OpenAI-compatible `/v1` routes in non-production.
- **`workflow.py`** – CRUD operations for workflows and example listings under `/api/workflows`.
- **`job.py`** – query job status and results.
- **`asset.py`** – manage uploaded files and workflow assets.
- **`message.py`, `thread.py`** – chat history and threaded conversations.
- **`settings.py`** – settings and configuration endpoints for the local app.
- **`debug.py`** – debug artifacts (ZIP exports, etc.) intended only for local usage.

For a module-by-module description, see the [API README](../src/nodetool/api/README.md). For the deployable Worker API,
refer to [Deployment Guide](deployment.md) and [Authentication](authentication.md#authentication-providers).
