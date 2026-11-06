**TLDR:** Availability alone is insufficient. The same feature can behave differently in the editor, exported player and CLI. Map those differences before adding more entry points.

# Q7. Which capabilities are available only through one surface?

Game saves expose a concrete mismatch. Editor play uses localStorage without player snapshots, standalone players use IndexedDB, and the guide describes CLI simulation as in-memory. These surfaces share a save concept, but not persistence guarantees.

Run inspection provides a positive example: the web router and agent capabilities call the same execution reader service. Surface integration can reuse an existing contract.

**Proposed connection:** annotate important graph connections by host and supported action: author, execute, inspect, persist and export. Treat a host restriction separately from a missing UI entry point.

**Next check:** compare one save/load journey across editor, export and CLI. Then check whether failures are visible on each surface. This reading identifies differences, not an exhaustive list of exclusive capabilities.

Evidence: [editor saves](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/game/gameEditorSaves.ts), [player storage](https://github.com/nodetool-ai/nodetool/blob/main/packages/game-renderer/src/save-storage.ts), [save guarantees](../../game-engine/saves-replay.md), [web run readers](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/runs.ts), [agent run readers](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/src/capabilities/runs.ts).
