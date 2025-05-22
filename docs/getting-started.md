---
title: Getting Started
layout: page
nav_order: 2
---

# Getting Started with NodeTool

## Local Setup

NodeTool is a multi-component project. The recommended way to develop locally is to use Conda for the Python backend and `npm` for the frontend pieces.

1. **Clone the repository**
   ```bash
   git clone https://github.com/nodetool-ai/nodetool.git
   cd nodetool
   ```
2. **Create the Conda environment**
   ```bash
   conda create -n nodetool python=3.11
   conda activate nodetool
   pip install nodetool-core nodetool-base
   ```
3. **Start the backend server**
   ```bash
   nodetool serve
   ```
4. **Install web dependencies and start the UI**
   ```bash
   cd web
   npm install
   npm start
   ```
   The editor is available at [http://localhost:3000](http://localhost:3000).
5. **Run the electron app (optional)**
   ```bash
   cd electron
   npm install
   npm start
   ```

## Architecture Overview

NodeTool follows a client–server model with a web based editor and optional desktop wrapper. Workflows are executed by the WebSocket Runner which communicates with local or remote workers that host the AI models. The high level data flow is illustrated below.

```mermaid
%% include architecture.mermaid content
```

* **Web UI** – React application used to build workflows.
* **API Server** – FastAPI server storing workflows and handling authentication.
* **WebSocket Runner** – Executes workflows step by step and streams updates back to the client.
* **Workers** – Containers or processes that run ML models on CPU/GPU.

## Common Workflows

- **Running an Example**: Browse the `examples` directory and start a workflow with `python examples/<name>.py`.
- **Using Templates**: Inside the editor choose a template from the sidebar to quickly create a project.
- **Building a Mini App**: After designing a workflow you can package it using the `apps` folder and distribute it as a standalone electron app.
- **Extending with Python**: Custom Python functions can be added in the backend to expose new nodes within the editor.

For more details see the rest of this documentation site and the `README.md` in the repository.
