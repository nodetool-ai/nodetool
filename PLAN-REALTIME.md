# Realtime Integration Roadmap for NodeTool

## Status

- [x] Review current workflow streaming, mini-app, editor, and preview architecture
- [x] Confirm clean-room requirement
- [x] Add initial realtime session substrate
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start, update, and stop session (plus `signal_realtime_session` for WebRTC)
  - [x] HTTP endpoints for listing and fetching sessions (currently REST in `routes/realtime.ts`; the rest of the codebase has standardized on tRPC, so these should migrate — see Follow-up tasks)
  - [x] Frontend realtime session client and store
  - [x] Basic `/realtime/:workflowId?` page and local preview
- [x] Phase 1 foundation
- [ ] Phase 2 first proof
- [ ] Phase 3 workflow integration
- [ ] Phase 4 expansion adapters

## Core decisions

- **Realtime is a workflow execution mode.** It belongs to the normal NodeTool workflow model, editor, persistence, and operator surfaces. Realtime sessions should be tracked as standard Jobs in the database, and their outputs should be savable as standard Assets.
- **The first runtime stays separate internally.** It should align with workflow identity, preview routing, and control semantics so later convergence remains straightforward.
- **StreamDiffusion V2 (and similar autoregressive models) is the first proof of the system.** It validates the architecture without defining the entire architecture.
- **Control plane and media plane are separate.** Session lifecycle, control updates, diagnostics, preview notifications, and status stay on the workflow/websocket control plane. High-rate media uses a dedicated adapter boundary.
- **WebRTC is the media adapter boundary for web clients.** To prevent head-of-line blocking and latency spikes, high-framerate video and audio for the web operator surface must use WebRTC (or a similar UDP-based protocol) rather than the WebSocket control plane.
- **Existing workflow nodes remain the default building blocks.** Realtime-specific nodes are added where the graph needs a distinct live source, sink, adapter, or control role. Standard WebSocket-based streaming nodes (using the existing `stream_input` command and `pushInputValue` inbox pattern) can feed into realtime nodes asynchronously, acting as inputs or control signals without disrupting the high-framerate realtime execution loop.
- **`nodetool.realtime` is the namespace for new realtime-category nodes.** Use this namespace for nodes that are genuinely specific to realtime execution instead of duplicating ordinary workflow nodes.
- **`NDI` and `Spout` are committed later goals.** The architecture should reserve clean media adapter boundaries for them from the start. `Syphon`, `MIDI`, `OSC`, `DMX`, and `timecode` follow the same adapter-first model.

- **Contract** see nodetool/docs/realtime-runtime-contract.md

## Core Technical Assumptions & Mechanics

Based on research into high-performance real-time generative video systems (like StreamDiffusion and `daydreamlive/scope`), the architecture must incorporate the following mechanics to ensure low latency and stability:

1. **Async I/O vs. Synchronous Inference Boundary:** The WebRTC media transport and WebSocket control plane MUST run in an async event loop (or dedicated thread) that is strictly isolated from the synchronous inference/execution loop. If heavy node execution blocks the network loop, WebRTC connections will stutter or drop.
2. **Queue-Based Backpressure (Latest-Frame-Wins):** The boundary between the network layer and the execution graph must use bounded, thread-safe queues. When a queue is full, the system must drop the oldest frame and insert the newest one. This ensures the inference engine is always processing the most recent data, minimizing perceived latency.
3. **Separation of Parameter and Media Queues:** Control signals (UI slider changes, prompt updates) should flow through a dedicated parameter queue or state object, separate from the high-volume media queues. This ensures control updates are applied immediately on the next execution cycle, rather than waiting behind a backlog of video frames.
4. **WebRTC Bitrate Tuning:** Default WebRTC bitrates are tuned for video conferencing (e.g., 1-2 Mbps), which degrades generative AI output quality. The WebRTC implementation must be explicitly configured for high maximum bitrates (e.g., 5-10 Mbps) and hardware-accelerated codecs.

## Current code reality & MVP Corrections

- The realtime session substrate now launches a live workflow-backed runtime instead of staying metadata-only.
  - `start_realtime_session` now creates a realtime session with a linked `job_id`, accepts an optional `graph` payload for unsaved editor launches, and starts execution through the standard `WorkflowRunner`.
  - When the database is available, realtime linkage is persisted onto the backing `Job` so history and diagnostics stay workflow-native.
  - *Correction still needed:* replace the interim `WorkflowRunner` reuse with a dedicated long-lived `RealtimeWorkflowRunner` (or equivalent) once the first high-framerate proof needs warm-state execution and richer adapter queues.
  - *Correction still needed:* keep the `"starting"` → `"running"` transition tied to actual media-transport readiness once WebRTC signaling exists; the current readiness gate is runtime startup only.
  - `update_realtime_session` now routes parameter changes into live workflow inputs when possible.
  - *Correction still needed:* promote those ad-hoc input pushes into an explicit realtime parameter/control queue when the dedicated runtime lands.
  - `/realtime` is a useful incubation surface: it captures the camera, negotiates WebRTC offer/answer/ICE through the websocket signaling channel, declares browser-track-to-node mappings on the session record, and runs an in-browser loopback (operator + runtime peers in the same tab) as a transport proof while showing session/job state.
    - *Correction still needed:* there is no server-side WebRTC termination yet, so the mapped tracks are not actually delivered into the live graph. The backend must add a WebRTC endpoint (e.g., `node-webrtc` or a Python media worker) that accepts the operator offer and routes incoming tracks into the corresponding `nodetool.realtime` input nodes.
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
  - Added `nodetool/docs/realtime-runtime-contract.md` with the first workflow-native realtime contract.
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
  - `npm run typecheck` currently fails in unrelated web Hugging Face model-list, provider/model hooks, store, and tRPC typing files.
  - `npm run lint` passes with existing warnings.
  - `npm run test` currently fails with two assertions in `web/src/__tests__/components/chat/containers/ChatView.test.tsx`.
- The current realtime substrate has moved past metadata-only session tracking:
  - `packages/websocket/src/realtime-session-manager.ts` now tracks `job_id`, starts sessions as `"starting"`, and preserves `"error"` state during terminal session events.
  - `packages/websocket/src/unified-websocket-runner.ts` now starts realtime sessions against a live `WorkflowRunner`, persists realtime linkage onto the backing `Job` when the DB is available, supports optional graph payloads, and routes live parameter updates into active workflow inputs when possible.
- The capture audit confirmed that `web/src/hooks/browser/useVideoRecorder.ts` is the key separation point for reusable browser capture vs upload behavior.
- `web/src/hooks/browser/useVideoCapture.ts` now provides the shared browser video capture/device layer used by both `useVideoRecorder` and `web/src/components/realtime/RealtimeStreamPage.tsx`.
- `web/src/components/realtime/RealtimeStreamPage.tsx` now launches the `/realtime` proof with `transport: "webrtc"`, explicit browser-track-to-node mappings, WebRTC signaling relayed over the existing websocket control plane, and a loopback runtime preview powered by browser peer connections.
- API style: the realtime HTTP endpoints (`/api/realtime/sessions`, `/api/realtime/sessions/:id`) are still REST (`packages/websocket/src/routes/realtime.ts`); the broader codebase has migrated query/mutation endpoints to tRPC (`packages/websocket/src/trpc/routers/*`). Realtime should follow that convention — captured as a follow-up task below.
- The current runner strategy is still an interim foundation:
  - Realtime sessions currently reuse the standard `WorkflowRunner` as the execution engine.
  - A dedicated long-lived `RealtimeWorkflowRunner` (or equivalent) is still desirable once the StreamDiffusion proof and media adapters arrive.

## Phase 2 - First proof: Autoregressive Video Diffusion (e.g., Wan 2.1 / StreamDiffusion V2)

**Goal**

Ship the first end-to-end realtime workflow that proves the system.

**Done when**

- a canonical realtime video diffusion workflow runs as a realtime session
- ControlNet and LoRA use existing compatibility and selection paths
- live preview, parameter updates, and session control work together

**Tasks**

- [ ] Implement **StreamDiffusion V2 (Wan2.1 1.3B)** as the baseline realtime video node (easiest integration: pure PyTorch, ~20GB VRAM, no TensorRT compilation required).
- [ ] Implement **LongLive (Wan2.1 1.3B)** as an alternative node/mode to support smoother prompt transitions during live generation.
- [ ] Implement **MemFlow (Wan2.1 1.3B)**, adding the necessary state management to the node capability model to handle its cross-frame memory bank.
- [ ] Implement **Krea Realtime (Wan2.1 14B)** as a high-fidelity option, adding VRAM-aware validation/warnings for users with <32GB VRAM.
- [ ] Reuse existing model compatibility and selection for ControlNet-enabled guidance (leveraging existing `ModelsManager` and `UnifiedModel` patterns)
- [ ] Reuse existing model compatibility and selection for LoRA-enabled styling (leveraging existing `ModelsManager` and `UnifiedModel` patterns)
- [ ] Implement dynamic weight injection for ControlNet/LoRA swaps (leveraging the pure-PyTorch backend to avoid recompilation delays).
- [ ] Connect the workflow template to realtime session start, stop, and reconnect
- [x] Add one preview/output surface that reflects the realtime session state
  - `/realtime/:workflowId?` now provides a first operator surface with local preview, active-session state, and workflow session history; media transport into the graph is still pending.
- [x] Add live parameter updates and session diagnostics
  - The `/realtime` surface now pushes live brightness updates through `update_realtime_session` and exposes session status, timestamps, job linkage, and current parameters.
- [ ] Document which parts of the proof are generic realtime substrate and which parts are model-specific

## Phase 3 - Workflow integration

**Goal**

Make realtime authoring and operation feel native inside NodeTool.

**Done when**

- authors can create and launch realtime workflows from normal workflow surfaces
- realtime-capable nodes are clear in the editor
- operator surfaces align with the broader workflow model

**Tasks**

- [ ] Add realtime-aware validation rules to the editor (e.g., preventing non-realtime nodes from being placed in the high-framerate path)
- [ ] Add a starter template for realtime video diffusion plus ControlNet plus LoRA
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
- [ ] Implement backend WebRTC termination (e.g., via `node-webrtc` or a dedicated media worker) to receive the mapped media tracks and feed them into the live graph
- [ ] Build the canonical realtime video diffusion workflow template using the capability model
- [x] Write the session/runtime spec with control-plane and media-plane boundaries (incorporating WebRTC for web clients)
- [ ] Define the first adapter roadmap for `NDI` and `Spout`

## Follow-up tasks discovered while starting the plan

- [x] Change realtime session startup so `start_realtime_session` creates and links a `Job` (instead of only tracking metadata) and launches live execution.
  - Implementation uses the standard `WorkflowRunner`. A dedicated long-lived realtime runner is *not* part of this item — it's flagged in "Current code reality" and naturally falls into Phase 2 once StreamDiffusion needs warm state.
- [x] Add optional graph payload support to realtime session start so live editor previews can launch unsaved graph state.
- [x] Add a `"starting"` lifecycle state and only flip to `"running"` once workflow runtime startup completes (replacing the old "always running" behavior).
  - The transport-readiness half of the gate (waiting for WebRTC peer `connected`) is *not* part of this item; tracked under "Tighten the `starting` → `running` gate" below.
- [x] Push `update_realtime_session` changes into the live workflow runner via `pushInputValue`, with `unrouted_parameters` reported back for unmapped keys.
  - Promoting this into a richer realtime parameter/control queue is deferred to the dedicated runner work.
- [x] Add WebRTC signaling plus media-track-to-node mapping for the `/realtime` proof.
  - Realtime session metadata now carries `webrtc` transport details, media-track mappings, and signaling state; `/realtime` negotiates a browser WebRTC proof transport and shows the mapped runtime preview/state.
- [x] Split reusable browser capture/device logic from recording/upload logic in `useVideoRecorder`/`VideoRecorder`.
  - Added `web/src/hooks/browser/useVideoCapture.ts` as the shared preview/device layer and switched both the asset recorder flow and `/realtime` preview flow to use it.
- [ ] Migrate the realtime list/get HTTP endpoints from REST (`packages/websocket/src/routes/realtime.ts`) to a tRPC `realtime` router (`packages/websocket/src/trpc/routers/realtime.ts`) and update `RealtimeSessionClient.listSessions` to use the typed tRPC client. Aligns realtime with the rest of the codebase and removes a one-off `restFetch` call.
- [ ] Tighten the `starting` → `running` gate so a silent `beforeRunJob` failure (or any path where `runJob` returns without registering an active job) cannot leave the session stuck in `running`. Cheap fix: in `startRealtimeSession`, after `await this.runJob(...)`, verify `this.activeJobs.has(jobId)` before promoting; otherwise call `failRealtimeSessionStartup`. Revisit fully when the dedicated realtime runner lands.

## Notes / maybe later

Captured here so they aren't lost, but not worth promoting to actionable tasks until the surrounding work demands them.

- **Stopped sessions disappear from the manager immediately.** `RealtimeSessionManager.stopSession` deletes the row right after returning the public record, so REST/tRPC `list`/`get` lose the session as soon as it stops. The `Job` row still persists. If/when reconnect or session history surfaces are built (Phase 3), keep the row around briefly with `status: "stopped" | "error"` and add a sweeper.
- **WebRTC peer config is empty.** `useRealtimeSessionWebRTC` calls `new RTCPeerConnection()` with no `iceServers` and no bitrate tuning. Fine for the in-browser loopback proof; revisit when a real out-of-process runtime peer arrives (Phase 2 / "Core Technical Assumptions" item 4).
- **Per-track WebRTC mapping UI.** `RealtimeStreamPage` collects a single `node_id`/`input_name` and applies it to every video track. Extend to per-track mapping (and add audio rows) once more than one camera/mic input is realistic.
- **Brightness slider sync ignores `0`.** The `useEffect` that syncs `activeSession.parameters.brightness` into local state checks truthiness, so `0` is dropped. Switch to `!== undefined` if/when a brightness-of-zero is meaningful, or once realtime parameters are generalized beyond this MVP slider.
- **Test noise from missing DB.** Realtime runner tests log `Database not initialized` warnings because `runJob`/`Job.markCompleted` are best-effort persisted. Not failing assertions; revisit if the tests grow assertions about persisted realtime job metadata.

## Review checks

- [x] Check that the execution contract stays broader than the first StreamDiffusion V2 proof
- [x] Check that preview, output, and session state fit the normal workflow model
- [x] Check that `nodetool.realtime` remains small and specific
- [ ] Check that `NDI` and `Spout` are supported by the adapter design from the start
- [x] Check that future audio, sync, and control adapters fit the same boundaries
- [ ] Check that the WebRTC media plane and WebSocket control plane remain cleanly separated and non-blocking
