---
layout: page
title: "Glossary"
---



- **NodeTool** — The platform providing workflow authoring, execution, and OpenAI-compatible APIs.
- **Worker** — Process that runs workflows and exposes HTTP/WebSocket endpoints (often via `nodetool serve` or `nodetool worker`).
- **API Server** — FastAPI server handling REST endpoints such as `/v1/chat/completions` and `/api/workflows`.
- **Proxy** — Optional reverse proxy that terminates TLS and forwards to the API server; may expose `/proxy/health`.
- **Job** — A single workflow execution instance managed by `JobExecutionManager`.
- **Workflow** — A graph of nodes describing an end-to-end task.
- **Provider** — Adapter that talks to an external AI service (OpenAI, Anthropic, Gemini, Ollama, ComfyUI, etc.).
- **Agent** — Multi-step planner/executor that can call tools or workflows.
- **Execution Strategy** — The runner type for a job (threaded, subprocess, Docker).
- **Thread ID** — Conversation identifier for chat/agent sessions; used by WebSocket and SSE streams.
