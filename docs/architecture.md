---
layout: page
title: "Architecture & Lifecycle"
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

- All endpoints and examples use `http://127.0.0.1:8000` by default; update host/port when deploying.
- Messaging emits both JSON and optional MessagePack; see [chat-server](chat-server.md) for protocol details.
- Execution strategies are detailed in [execution-strategies](execution-strategies.md).
