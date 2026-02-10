---
layout: page
title: "API Server Overview"
---



NodeTool exposes a single FastAPI server runtime. The same process serves local app routes, workflow execution routes,
OpenAI-compatible endpoints, and admin/deploy routes, with behavior controlled by server mode and feature flags
(`desktop`, `public`, `private`).

Important modules:

- **`server.py`** – creates the FastAPI app and registers routers, WebSocket endpoints, and OpenAI-compatible `/v1` routes.
- **`workflow.py`** – workflow CRUD and execution endpoints.
- **`job.py`** – query job status and results.
- **`asset.py`** – manage uploaded files and workflow assets.
- **`message.py`, `thread.py`** – chat history and threaded conversations.
- **`settings.py`** – settings and configuration endpoints for the local app.
- **`debug.py`** – debug artifacts (ZIP exports, etc.) intended only for local usage.

For a module-by-module description, see the API README in the source tree (`src/nodetool/api/README.md`).
For mode and deployment setup, see [Deployment Guide](deployment.md), [End-to-End Deployment Guide](deployment-e2e-guide.md),
and [Authentication](authentication.md#authentication-providers).
