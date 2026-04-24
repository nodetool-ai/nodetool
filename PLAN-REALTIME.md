# Realtime Integration Roadmap for NodeTool

## Status

- [x] Review current workflow streaming, mini-app, editor, and preview architecture
- [x] Confirm clean-room requirement
- [x] Add initial realtime session substrate
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start, update, and stop session
  - [x] tRPC endpoints for listing and fetching sessions
  - [x] Frontend realtime session client and store
  - [x] Basic `/realtime/:workflowId?` page and local preview
- [ ] Phase 1 foundation
- [ ] Phase 2 first proof
- [ ] Phase 3 workflow integration
- [ ] Phase 4 expansion adapters

## Core decisions

- **Realtime is a workflow execution mode.** It belongs to the normal NodeTool workflow model, editor, persistence, and operator surfaces. Realtime sessions should be tracked as standard Jobs in the database, and their outputs should be savable as standard Assets.
- **The first runtime stays separate internally.** It should align with workflow identity, preview routing, and control semantics so later convergence remains straightforward.
- **StreamDiffusion is the first proof of the system.** It validates the architecture without defining the entire architecture.
- **Control plane and media plane are separate.** Session lifecycle, control updates, diagnostics, preview notifications, and status stay on the workflow/websocket control plane. High-rate media uses a dedicated adapter boundary.
- **WebRTC is the media adapter boundary for web clients.** To prevent head-of-line blocking and latency spikes, high-framerate video and audio for the web operator surface must use WebRTC (or a similar UDP-based protocol) rather than the WebSocket control plane.
- **Existing workflow nodes remain the default building blocks.** Realtime-specific nodes are added where the graph needs a distinct live source, sink, adapter, or control role. Standard WebSocket-based streaming nodes (using the existing `stream_input` command and `pushInputValue` inbox pattern) can feed into realtime nodes asynchronously, acting as inputs or control signals without disrupting the high-framerate realtime execution loop.
- **`nodetool.realtime` is the namespace for new realtime-category nodes.** Use this namespace for nodes that are genuinely specific to realtime execution instead of duplicating ordinary workflow nodes.
- **`NDI` and `Spout` are committed later goals.** The architecture should reserve clean media adapter boundaries for them from the start. `Syphon`, `MIDI`, `OSC`, `DMX`, and `timecode` follow the same adapter-first model.

## Core Technical Assumptions & Mechanics

Based on research into high-performance real-time generative video systems (like StreamDiffusion and `daydreamlive/scope`), the architecture must incorporate the following mechanics to ensure low latency and stability:

1. **Async I/O vs. Synchronous Inference Boundary:** The WebRTC media transport and WebSocket control plane MUST run in an async event loop (or dedicated thread) that is strictly isolated from the synchronous inference/execution loop. If heavy node execution blocks the network loop, WebRTC connections will stutter or drop.
2. **Queue-Based Backpressure (Latest-Frame-Wins):** The boundary between the network layer and the execution graph must use bounded, thread-safe queues. When a queue is full, the system must drop the oldest frame and insert the newest one. This ensures the inference engine is always processing the most recent data, minimizing perceived latency.
3. **Separation of Parameter and Media Queues:** Control signals (UI slider changes, prompt updates) should flow through a dedicated parameter queue or state object, separate from the high-volume media queues. This ensures control updates are applied immediately on the next execution cycle, rather than waiting behind a backlog of video frames.
4. **WebRTC Bitrate Tuning:** Default WebRTC bitrates are tuned for video conferencing (e.g., 1-2 Mbps), which degrades generative AI output quality. The WebRTC implementation must be explicitly configured for high maximum bitrates (e.g., 5-10 Mbps) and hardware-accelerated codecs.

## Current code reality & MVP Corrections

- The current realtime session substrate is a control-plane layer. It tracks sessions and emits session events, but **does not yet instantiate a graph runner**. 
  - *Correction needed:* `start_realtime_session` must be wired to actually spawn a dedicated `RealtimeWorkflowRunner` (or equivalent). It currently only accepts `workflow_id`, but to support live editor previews, it should also accept an optional `graph` payload (nodes and edges) similar to the standard `run_job` command. It should also persist a standard `Job` record in the database so the session appears in the user's history.
  - *Correction needed:* `start_realtime_session` immediately sets the session status to `"running"`. It should start as `"starting"` and only transition to `"running"` once the WebRTC connection is established and the graph is actually executing.
  - *Correction needed:* `update_realtime_session` must push parameter changes directly into the running graph's parameter queue, rather than just updating static session metadata.
- `/realtime` is a useful incubation surface and currently captures a local camera stream.
  - *Correction needed:* The camera stream is not yet transmitted. As per the WebRTC boundary decision, this media must NOT be sent over the WebSocket. The implementation must add WebRTC signaling (offer/answer) to the session initialization flow to establish the media transport, and explicitly map WebRTC media tracks to specific `nodetool.realtime` input nodes in the graph.
- Live graph streaming is still tied to an active `job_id`.
- `RealtimeAudioInput` already demonstrates a streaming input pattern.
- `VideoInput` is still a standard asset/video reference input.
- `MiniAppPage`, `html_app`, workflow previews, and editor flows already provide workflow-native surfaces that realtime should grow into.

## Phase 1 - Foundation

**Goal**

Define the realtime execution contract and establish the workflow-native substrate.

**Done when**

- the execution contract is written
- session identity and workflow identity are aligned
- preview and output routing have a clear home
- node capability boundaries are clear
- the first operator surface is chosen

**Tasks**

- [x] Write the realtime execution contract covering workflow identity, session identity, lifecycle, inputs, outputs, previews, and control updates
  - Added `/home/runner/work/nodetool/nodetool/docs/realtime-runtime-contract.md` with the first workflow-native realtime contract.
- [x] Define the convergence invariants between the realtime runtime and the standard workflow runner (specifically addressing per-node execution overhead, whether standard nodes need a "streaming" or "batched" execution mode, and how standard streaming nodes asynchronously feed realtime nodes via `NodeInbox` without blocking the high-framerate loop)
  - Documented the "separate internally, workflow-native externally" invariants and the latest-frame-wins/async-boundary rules in the runtime contract.
- [x] Choose the first operator surface: `/realtime`, mini-app, `html_app`, or a staged path between them
  - Chosen path: keep `/realtime/:workflowId?` as the incubation/operator page first, then converge into workflow-native launch/reconnect flows before mini-app/html-app specialization.
- [x] Define the node capability model: reusable, reusable-with-constraints, adapter-backed, and realtime-specific (including how nodes maintain and reset state across the lifecycle of a session, and how they signal their realtime capabilities to the editor)
  - Captured the four capability classes plus required lifecycle/state declarations in the runtime contract.
- [x] Reserve `nodetool.realtime` for new realtime-category nodes
  - Namespace policy is now explicitly documented so later node work can follow one rule set.
- [x] List the initial `nodetool.realtime` roles needed for the first proof: source, sink, transport adapter, live control, or session utility
  - Initial first-proof roles are now listed in the runtime contract.
- [x] Audit `useVideoRecorder` and `VideoRecorder` to separate reusable capture and device concerns from upload concerns
  - Audit result: the current implementation still bundles device enumeration, preview, recording, workflow-bound upload, and UI state; it needs a reusable capture layer before realtime input can reuse it cleanly.
- [x] Define how realtime previews and outputs land in the same core surfaces used by workflow runs
  - Defined preview/output landing zones in terms of workflow-native job, asset, preview, and reconnect surfaces.
- [x] Define which messages stay on the existing websocket control plane and which cross the media adapter boundary (e.g., WebRTC for web clients)
  - Control-plane vs media-plane responsibilities are now explicitly split; WebRTC is the first web media adapter.

## Progress notes (2026-04-24)

- Baseline validation before edits found pre-existing repository issues unrelated to this roadmap work:
  - `npm run typecheck` currently fails in unrelated web typing/trpc/model-selector files.
  - `npm run lint` passes with existing warnings.
  - `npm run test` currently fails in `web/src/__tests__/components/chat/containers/ChatView.test.tsx`.
- The current realtime substrate remains metadata-only:
  - `packages/websocket/src/realtime-session-manager.ts` still starts sessions as `"running"` immediately and only stores session metadata in memory.
  - `packages/websocket/src/unified-websocket-runner.ts` still starts/stops/updates sessions without spawning a realtime runner or persisting a `Job`.
  - `web/src/components/realtime/RealtimeStreamPage.tsx` still uses local camera preview only; media is not yet transported into a live runtime.
- The capture audit confirmed that `/home/runner/work/nodetool/nodetool/web/src/hooks/browser/useVideoRecorder.ts` is the key separation point for reusable browser capture vs upload behavior.

## Phase 2 - First proof: StreamDiffusion

**Goal**

Ship the first end-to-end realtime workflow that proves the system.

**Done when**

- a canonical stream-diffusion workflow runs as a realtime session
- ControlNet and LoRA use existing compatibility and selection paths
- live preview, parameter updates, and session control work together

**Tasks**

- [ ] Build the canonical stream-diffusion workflow template
- [ ] Reuse existing model compatibility and selection for ControlNet-enabled guidance (leveraging existing `ModelsManager` and `UnifiedModel` patterns)
- [ ] Reuse existing model compatibility and selection for LoRA-enabled styling (leveraging existing `ModelsManager` and `UnifiedModel` patterns)
- [ ] Investigate TensorRT dynamic weight injection vs recompilation for ControlNet/LoRA swaps (documenting the UX fallback if recompilation is required)
- [ ] Connect the workflow template to realtime session start, stop, and reconnect
- [ ] Add one preview/output surface that reflects the realtime session state
- [ ] Add live parameter updates and session diagnostics
- [ ] Document which parts of the proof are generic realtime substrate and which parts are stream-diffusion-specific

## Phase 3 - Workflow integration

**Goal**

Make realtime authoring and operation feel native inside NodeTool.

**Done when**

- authors can create and launch realtime workflows from normal workflow surfaces
- realtime-capable nodes are clear in the editor
- operator surfaces align with the broader workflow model

**Tasks**

- [ ] Add realtime-aware validation rules to the editor (e.g., preventing non-realtime nodes from being placed in the high-framerate path)
- [ ] Add a starter template for stream diffusion plus ControlNet plus LoRA
- [ ] Add editor affordances for composing realtime source, sink, control, and adapter nodes (e.g., visual indicators for realtime vs. standard edges)
- [ ] Add menu and discovery rules for realtime-capable existing nodes
- [ ] Add menu and discovery rules for `nodetool.realtime` nodes
- [ ] Connect the chosen operator surface to workflow-native launch and reconnect flows
- [ ] Add live control groups for prompt steering, diffusion strength, ControlNet settings, and LoRA weight (reusing existing UI property components like `NodeSlider`, `TextProperty`, etc.)
- [ ] Add reusable preprocessor and effects stages that fit the standard workflow model

## Phase 4 - Expansion adapters

**Goal**

Extend the realtime system through clear media and control adapters after the first proof is stable.

**Done when**

- local media extensions fit the same session contract
- external media outputs plug in through the adapter layer
- control and sync integrations have a clear place in the system

**Tasks**

- [ ] Add audio input and output support where the workflow needs it
- [ ] Add recording and export for realtime sessions (saving outputs as standard NodeTool Assets via `AssetStore`)
- [ ] Add shared device selection on top of the reusable capture layer
- [ ] Add `NDI` output and routing adapters
- [ ] Add `Spout` output and routing adapters
- [ ] Add `Syphon` adapters using the same media-adapter model
- [ ] Add `MIDI`, `OSC`, `DMX`, and `timecode` control or sync adapters
- [ ] Add optional remote brokering and entitlement layers on top of the same session contract

## Namespace policy

- Use existing namespaces for ordinary workflow nodes that already fit realtime workflows.
- Use `nodetool.realtime` for nodes that are genuinely tied to realtime execution concerns.
- Keep `nodetool.realtime` focused on a small set of clear roles:
  - live media sources
  - realtime sinks and outputs
  - transport and adapter nodes
  - session-aware control nodes
  - realtime utility nodes

## Immediate next tasks

- [x] Write the short execution contract for the separate but workflow-native realtime runtime
- [x] Choose the first operator surface and define the path from incubation to workflow-native usage
- [x] Define the initial `nodetool.realtime` node set for the first proof
- [ ] Build the canonical stream-diffusion workflow template using the capability model
- [x] Write the session/runtime spec with control-plane and media-plane boundaries (incorporating WebRTC for web clients)
- [ ] Define the first adapter roadmap for `NDI` and `Spout`

## Follow-up tasks discovered while starting the plan

- [ ] Change realtime session startup so `start_realtime_session` creates a `Job` and a dedicated realtime runner instead of only creating metadata.
- [ ] Add optional graph payload support to realtime session start so live editor previews can launch unsaved graph state.
- [ ] Transition realtime sessions from `starting` to `running` only after transport and runtime readiness.
- [ ] Push `update_realtime_session` changes into a live parameter/control channel instead of only mutating stored metadata.
- [ ] Add WebRTC signaling plus media-track-to-node mapping for the `/realtime` proof.
- [ ] Split reusable browser capture/device logic from recording/upload logic in `useVideoRecorder`/`VideoRecorder`.

## Review checks

- [ ] Check that the execution contract stays broader than the first StreamDiffusion proof
- [ ] Check that preview, output, and session state fit the normal workflow model
- [ ] Check that `nodetool.realtime` remains small and specific
- [ ] Check that `NDI` and `Spout` are supported by the adapter design from the start
- [ ] Check that future audio, sync, and control adapters fit the same boundaries
- [ ] Check that the WebRTC media plane and WebSocket control plane remain cleanly separated and non-blocking
