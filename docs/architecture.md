---
layout: page
title: "Architecture & Lifecycle"
description: "How NodeTool's streaming architecture enables real-time feedback, cancellation, and deployment portability."
---

## Why This Architecture Matters

NodeTool's architecture is designed around three core principles that directly impact your experience:

1. **Streaming-first execution** – See results as they generate, not after everything completes. Cancel long-running jobs without waiting. Perfect for interactive debugging and user-facing applications.

2. **Unified runtime** – The same workflow JSON runs in desktop app, headless server, RunPod endpoint, or Cloud Run service. No platform-specific code. No rewrites when scaling.

3. **Pluggable execution strategies** – Run nodes in threads (fast iteration), subprocesses (isolation), or Docker containers (deployment). Switch strategies without changing your workflow.

**For developers:** This design lets you prototype locally with instant feedback, then deploy to production infrastructure with confidence that behavior will be identical.

**For teams:** Build workflows collaboratively in the visual editor, then let DevOps deploy them as APIs—no translation layer needed.

---

## Job Lifecycle (run, stream, reconnect, cancel)

{% mermaid %}
sequenceDiagram
    participant Client
    participant API as API Server
    participant JEM as JobExecutionManager
    participant Runner as Execution Strategy
    participant Msg as Messaging/WS

    Client->>API: POST /api/workflows/{id}/run (stream=true)
    API->>JEM: Create job + enqueue
    JEM->>Runner: Start job (threaded/subprocess/docker)
    Runner->>Msg: Emit streaming events
    Msg-->>Client: token/output events
    Client-->>API: reconnect with thread/job id
    API-->>Msg: resume stream from checkpoint
    Client->>API: DELETE /api/workflows/{id}/run (cancel)
    API->>JEM: cancel job
    Runner-->>JEM: teardown and cleanup
    JEM-->>Msg: end event
    Msg-->>Client: completion / cancelled status
{% endmermaid %}

## Notes

- All endpoints and examples use `http://127.0.0.1:7777` by default; update host/port when deploying.
- Messaging emits both JSON and optional MessagePack; see [chat-server](chat-server.md) for protocol details.
- Execution strategies are detailed in [execution-strategies](execution-strategies.md).
