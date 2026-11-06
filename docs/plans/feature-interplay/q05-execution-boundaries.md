**TLDR:** Game ticks, audio chunks and asynchronous jobs need explicit adapters. A common graph should not imply a common clock.

# Q5. Where do execution models meet—and what happens there?

Game scripts execute synchronously with bounded state and commands. They cannot await a model response inside a tick. Realtime audio processes successive chunks, while workflow execution owns longer-running work and cancellation.

Game event schemas already describe payloads and targeting. That is useful infrastructure, but does not prove an external job-to-game event adapter exists.

**Proposed connection:** let a host submit a bounded request, run it through existing execution, and deliver a validated completion event at a tick boundary. Define timeout, cancellation, ordering and handling of responses for an obsolete scene or request.

**Next check:** request an AI action, leave the scene before completion, and confirm the late response cannot mutate the replacement scene. Measure tick progress while the request is pending.

Evidence: [game script contract](../../game-engine/scripts.md), [game event schema](../../../packages/protocol/src/game-script-events.ts), [audio processing](../../../packages/audio-nodes/src/nodes/realtime-audio.ts), [execution lifecycle](../../execution-lifecycle.md).
