**TLDR:** Game ticks, audio chunks and asynchronous jobs need explicit adapters. A common graph should not imply a common clock.

# Q5. Where do execution models meet—and what happens there?

Game scripts execute synchronously with bounded state and commands. They cannot await a model response inside a tick. Realtime audio processes successive chunks, while workflow execution owns longer-running work and cancellation.

Game event schemas already describe payloads and targeting. That is useful infrastructure, but does not prove an external job-to-game event adapter exists.

**Proposed connection:** use the [RS finite-operation adapter](../reactive-sessions-events.md#smallest-first-implementation). That plan owns request/result identity, cancellation, and observer cleanup. [AA-A10](../realtime-virtual-agents.md#delivery-plan-and-gates) adds scene-specific commands and result application at the game's update point.

**Tracked check: RS-A3/RS-A4.** The reactive-plan implementation owns a delayed deterministic operation in a fixed-tick fixture. Expected result: ticks continue during execution, reset rejects old results, and repeated resets cannot bypass the outstanding-request limit. Paid inference and live scene commands are unnecessary for this proof.

Evidence: [game script contract](../../game-engine/scripts.md), [game event schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-script-events.ts), [audio processing](https://github.com/nodetool-ai/nodetool/blob/main/packages/audio-nodes/src/nodes/realtime-audio.ts), [execution lifecycle](../../execution-lifecycle.md).
