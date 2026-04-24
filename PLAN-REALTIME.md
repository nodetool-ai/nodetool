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
- **Code organization rule: shared files hold primitives and surfaces; dedicated files hold realtime behavior.** Realtime work should not be glued into the existing god-classes. Concretely: `unified-websocket-runner.ts` (already 4,880 lines) and `runner.ts` (1,051 lines) gain only the small primitives/surfaces they need (a delegating switch case, a `RunMode` enum, a bounded buffer); all realtime *behavior* lives in `packages/websocket/src/realtime/*` and `packages/kernel/src/realtime-runner.ts`. Any task that would add more than ~50 lines to a shared file, or a new conceptual responsibility (signaling, frame routing, parameter routing) to one, must extract first.

- **Contract** see nodetool/docs/realtime-runtime-contract.md

## Core Technical Assumptions & Mechanics

Based on research into high-performance real-time generative video systems (like StreamDiffusion and `daydreamlive/scope`), the architecture must incorporate the following mechanics to ensure low latency and stability:

1. **Async I/O vs. Synchronous Inference Boundary:** The WebRTC media transport and WebSocket control plane MUST run in an async event loop (or dedicated thread) that is strictly isolated from the synchronous inference/execution loop. If heavy node execution blocks the network loop, WebRTC connections will stutter or drop.
2. **Queue-Based Backpressure (Latest-Frame-Wins):** The boundary between the network layer and the execution graph must use bounded, thread-safe queues. When a queue is full, the system must drop the oldest frame and insert the newest one. This ensures the inference engine is always processing the most recent data, minimizing perceived latency.
3. **Separation of Parameter and Media Queues:** Control signals (UI slider changes, prompt updates) should flow through a dedicated parameter queue or state object, separate from the high-volume media queues. This ensures control updates are applied immediately on the next execution cycle, rather than waiting behind a backlog of video frames.
4. **WebRTC Bitrate Tuning:** Default WebRTC bitrates are tuned for video conferencing (e.g., 1-2 Mbps), which degrades generative AI output quality. The WebRTC implementation must be explicitly configured for high maximum bitrates (e.g., 5-10 Mbps) and hardware-accelerated codecs.

## Current code reality & MVP Corrections

- The realtime session substrate now launches a live workflow-backed runtime instead of staying metadata-only.
  - `start_realtime_session` creates a realtime session with a linked `job_id`, accepts an optional `graph` payload for unsaved editor launches, and starts execution through the standard `WorkflowRunner`.
  - When the database is available, realtime linkage is persisted onto the backing `Job` so history and diagnostics stay workflow-native.
  - *Correction still needed:* extend the existing `WorkflowRunner` (`packages/kernel/src/runner.ts`) with a long-lived realtime mode rather than replacing it — the current event-driven primitives (`isStreamingInput`+`run()`, `isStreamingOutput`+`genProcess()`, `isControlled`, and `NodeInbox(bufferLimit)`) already cover most of the loop; what's missing is bounded/latest-frame-wins inbox policy, warm-state lifecycle hooks, and frame-tick metrics. See "Existing event-driven primitives" below.
  - *Correction still needed:* keep the `"starting"` → `"running"` transition tied to actual media-transport readiness once WebRTC signaling exists; the current readiness gate is runtime startup only.
  - `update_realtime_session` routes parameter changes into live workflow inputs via `pushInputValue`.
  - *Correction still needed:* promote those ad-hoc input pushes into an explicit parameter/control queue (separate from the media inbox) once the runner extension lands.
  - `/realtime` is the **incubation surface only**, not the long-term home. It captures the camera, negotiates WebRTC offer/answer/ICE through the websocket signaling channel, declares browser-track-to-node mappings on the session record, and runs an in-browser loopback (operator + runtime peers in the same tab) as a transport proof while showing session/job state. Long-term, realtime authoring/operating belongs inside the editor (as a realtime mode) and the existing operator surfaces (`MiniAppPage`, `html_app`); `/realtime` exists to keep the first proof isolated until the runner and capability model are stable.
    - *Correction still needed:* there is no server-side WebRTC termination yet, so the mapped tracks are not actually delivered into the live graph. The backend must add a Node-side WebRTC endpoint (preferred: `werift` — actively maintained pure-TS WebRTC; fallback: `node-webrtc`/`@roamhq/wrtc`) that accepts the operator offer and routes incoming tracks into the corresponding `nodetool.realtime` input nodes. Python `aiortc` is only a fallback if the Node options can't deliver acceptable encode/decode latency.
- Live graph streaming is still tied to an active `job_id`.
- `RealtimeAudioInput` already demonstrates a streaming input pattern.
- `VideoInput` is still a standard asset/video reference input.
- `MiniAppPage`, `html_app`, workflow previews, and editor flows already provide workflow-native surfaces that realtime should grow into.

## Existing event-driven primitives we build on

The realtime runner is an **extension of existing primitives**, not a parallel system. Before adding new machinery, reuse:

- **`isStreamingInput=true` + `async run(inputs, outputs, ctx)`** (`packages/kernel/src/actor.ts`, `packages/kernel/src/io.ts`). A node implements its own loop and drains the inbox via `NodeInputs.any()` / `NodeInputs.stream(handle)`. Canonical example: `ManualTriggerNode` in `packages/base-nodes/src/nodes/triggers.ts` — runs forever, processes each event pushed via `pushInputValue`, emits via `NodeOutputs.emit`. This is the pattern realtime media source nodes should follow.
- **`isStreamingOutput=true` + `async *genProcess()`**. A node yields outputs over time (e.g. `IntervalTriggerNode`'s `while (true) { … yield … }`). Suitable for clock/tick/heartbeat nodes inside a realtime graph.
- **`isControlled` + `_runControlled`** (`packages/kernel/src/actor.ts`). A node waits for `ControlEvent` items on the `__control__` handle, fires processing on each event, terminates on `stop`. Suitable for parameter/control-driven nodes whose data inputs are cached and replayed each tick.
- **`NodeInbox(bufferLimit)`** (`packages/kernel/src/inbox.ts`) already supports a per-handle buffer limit with **block-on-full backpressure** (`_putWaiters`). The realtime path needs to add a **drop-oldest / latest-frame-wins** policy variant on top of this — not a new inbox.
- **`pushInputValue(inputName, value, sourceHandle)`** + **`finishInputStream(inputName, sourceHandle)`** (`packages/kernel/src/runner.ts`) already give realtime sessions a clean way to inject media chunks and parameter updates into a live graph; `update_realtime_session` and the future server-side WebRTC endpoint should both route through this.

Implication: most "realtime runner" work is **extending these surfaces** with bounded/lossy semantics, warm-state lifecycle, and per-frame metrics — not building a parallel runner.

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
  - The chosen direction is to **extend** `WorkflowRunner` with a long-lived realtime mode (warm node instances, session-tick loop, bounded inboxes, `pushParameter` API) rather than fork a separate `RealtimeWorkflowRunner` — see "Existing event-driven primitives" and the Phase 2 substrate prerequisites.

## Phase 2 - First proof: Autoregressive Video Diffusion (e.g., Wan 2.1 / StreamDiffusion V2)

**Goal**

Ship the first end-to-end realtime workflow that proves the system.

**Done when**

- a canonical realtime video diffusion workflow runs as a realtime session
- ControlNet and LoRA use existing compatibility and selection paths
- live preview, parameter updates, and session control work together

**Core integration map (the data path the substrate work has to deliver)**

```
Browser camera/mic
   │  MediaStream
   ▼
RTCPeerConnection (operator)         ── WebSocket signaling ──▶  RealtimeCommandHandler
   │  SDP/ICE                                                    (handleSignal — was inline
   │                                                             in unified-websocket-runner)
   │  (RTP frames)
   ▼
RealtimeWebRTCServer (werift)     ◀── getRunner(sessionId) ──── RealtimeSessionManager
   │  decoded VideoFrame / AudioFrame                            (transport.tracks)
   ▼
frame-router  ──▶  RealtimeRunner.pushInputValue(inputName, frame)
                              │  (delegates to the held WorkflowRunner)
                              ▼
                      NodeInbox (bounded, drop_oldest)
                              │
                              ▼
              nodetool.realtime.VideoSource (isStreamingInput, run())
                              │
                              ▼
                  …graph nodes (StreamDiffusion, etc.)…
                              │
                              ▼
                  nodetool.realtime.VideoSink (isMediaAdapter)
                              │
                              ▼
              RealtimeWebRTCServer outbound track
                              │
                              ▼
               Browser RTCPeerConnection (operator) ──▶  preview <video>
```

Control plane (separate from the path above): `update_realtime_session` → `RealtimeCommandHandler.handleUpdate` → `RealtimeRunner.pushParameter(name, value)` → control queue → realtime-capable nodes pick up on next tick. `realtime_metrics` flows back over the websocket control plane (fps, queue depth, dropped frames).

Module map (everything new lives in two folders, not in the existing god-classes):

- `packages/websocket/src/realtime/` — `command-handler.ts`, `session-manager.ts` (moved), `webrtc-server.ts`, `frame-router.ts`
- `packages/kernel/src/realtime-runner.ts` — `RealtimeRunner` class composing `WorkflowRunner`
- `packages/kernel/src/runner.ts` and `packages/websocket/src/unified-websocket-runner.ts` — gain only small primitives/surfaces (`runMode` option, ring-buffer behavior, one-line delegating switch cases)

**Tasks**

*Pre-substrate refactor (gate the substrate prerequisites — do these first to avoid Phase 2 landing in a 6,000-line god-class):*

- [ ] **Extract `RealtimeCommandHandler` from `unified-websocket-runner.ts`.** Pure refactor, no behavior change. Move the four existing realtime command cases (`start_realtime_session`, `signal_realtime_session`, `update_realtime_session`, `stop_realtime_session`) and their backing methods out of `unified-websocket-runner.ts` (currently 4,880 lines) into a new `packages/websocket/src/realtime/command-handler.ts` exporting a `RealtimeCommandHandler` class. The websocket runner keeps a single instance and delegates: each `case` becomes one line (`case "start_realtime_session": return this.realtimeHandler.handleStart(data, jobId, workflowId)`). Required state access (e.g. `activeJobs`, `runJob`, `failRealtimeSessionStartup`) is passed in via the constructor as a small interface so the handler doesn't have to import the whole runner. Tests should pass unchanged. Also move `packages/websocket/src/realtime-session-manager.ts` and `packages/websocket/src/routes/realtime.ts` into the same `realtime/` folder for consistency. **Why first:** all subsequent Phase 2 work (WebRTC server, frame router, gate-tightening) lands in the new module rather than further inflating the god-class; doing this *after* Phase 2 means re-untangling much more code.
- [ ] **Decide runner extension shape: composition over inheritance.** The realtime runner work below is structured as a **sibling `packages/kernel/src/realtime-runner.ts` exporting a `RealtimeRunner` class that holds (composes) a `WorkflowRunner`** — not as in-place changes to `runner.ts` or a subclass. Only the small shared primitives land in `runner.ts`: a `runMode?: "one_shot" | "realtime"` option on `WorkflowRunnerOptions`, `_messages`/`_edgeCounters`/`_outputs` switched to bounded ring buffers when `runMode === "realtime"`, and a public `_initializeForRealtime()` (or equivalent) that exposes the existing init pipeline (`_resetRunState` → `rewriteBypassedNodes` → `_filterInvalidEdges` → `_analyzeStreaming` → `_initializeInboxes` → `_initializeGraph`) so `RealtimeRunner` can drive it without entering the standard run loop. All realtime-mode behavior — `startRealtimeMode`, `stopRealtimeMode`, `pushParameter`, lifecycle-hook orchestration, WebRTC-server integration — lives in `realtime-runner.ts`. Land an empty skeleton with the constructor and stubbed methods as part of this task so the substrate prerequisites have a concrete file to add code to.

*Substrate prerequisites (gate the model nodes — do these next):*

- [ ] **Pick the server-side WebRTC stack (Node-first).** One short spike comparing `werift` (pure-TS, actively maintained, no native build) vs `@roamhq/wrtc`/`node-webrtc` (native, well-known but maintenance-thin). Decision criteria: (1) install/build cost on macOS/Windows/Linux + Electron, (2) H.264/VP8/VP9 codec coverage, (3) latency at 720p30 in a local loopback test, (4) ability to hand raw frames into JS (or zero-copy into a worker). Python `aiortc` is only revisited if all Node options fail criteria 3 or 4.
- [ ] **Stand up the server-side WebRTC endpoint and frame router.** Land the chosen stack as `packages/websocket/src/realtime/webrtc-server.ts` (alongside the `command-handler.ts` and `session-manager.ts` from the refactor), with frame-routing concerns split into `packages/websocket/src/realtime/frame-router.ts` if the server file would otherwise grow past ~500 lines. Export a `RealtimeWebRTCServer` with these responsibilities:
  - Lifecycle is **per session, not singleton**: `start(sessionId, transportConfig)` is called from `RealtimeCommandHandler.handleStart` after `RealtimeRunner.startRealtimeMode` resolves; `stop(sessionId)` is called on terminal transitions.
  - Consumes the existing `signal_realtime_session` command (now routed through `RealtimeCommandHandler.handleSignal`) to receive operator SDP/ICE, produces answer SDP/ICE, and replies through the same command (no new websocket commands needed for signaling).
  - Reads `transport.tracks` (the existing track→node mapping on the session record) to know which inbound track feeds which `nodetool.realtime` source node and input name.
  - For each inbound media track, decodes frames and calls `realtimeRunner.pushInputValue(inputName, frame, sourceHandle?)` on the session's `RealtimeRunner`. The runner instance is obtained via `RealtimeSessionManager.getRunner(sessionId)` (add this accessor as part of the refactor task — store the `RealtimeRunner` reference on the session record at start time).
  - Runs WebRTC peer work off the runner's main async loop (Worker thread or scheduler-yielded async) to honor "Async I/O vs. Synchronous Inference Boundary" in Core Technical Assumptions.
  - Exposes outbound tracks for `nodetool.realtime` sink nodes to write encoded frames into (used by the sink-node task below).
  - Emits a `realtime_metrics` snapshot (see follow-up task) every N seconds with fps in/out, peer state, and dropped-frame count.
- [ ] **Add latest-frame-wins inbox policy.** Extend `NodeInbox` (`packages/kernel/src/inbox.ts`) with an optional per-handle `overflowPolicy: "block" | "drop_oldest" | "drop_newest"` (default `"block"` to preserve current semantics) and a per-handle `capacity` independent of the global `bufferLimit`. Track `droppedCount` per handle so the metrics feed has data to report.
  - **Source of truth (resolution order, last wins):** (1) global `WorkflowRunnerOptions.bufferLimit` (current behavior); (2) BaseNode descriptor field — add `static readonly inputBufferPolicy?: Record<handle, { capacity: number; overflowPolicy: "block" | "drop_oldest" | "drop_newest" }>` to `packages/node-sdk/src/base-node.ts` (serialized through `toDescriptor()` / `node-metadata.ts`); (3) per-edge override in graph data (`Edge.metadata.overflowPolicy`/`capacity`) so authors can tighten/relax the default for a specific wire.
  - **Wiring point:** `_initializeInboxes()` in `packages/kernel/src/runner.ts` currently constructs one `NodeInbox(globalLimit)` per node. Change it to resolve the policy per `(node, handle)` using the order above, then either (a) construct one `NodeInbox` per handle, or (b) extend `NodeInbox` to accept a `Map<handle, HandlePolicy>` so the existing one-inbox-per-node shape survives.
  - **Default for `nodetool.realtime` source nodes:** `{ capacity: 2, overflowPolicy: "drop_oldest" }` baked into the source node's `inputBufferPolicy` so authors get the right behavior without configuration.
  - **Tests:** producer-faster-than-consumer at each policy; that `block` semantics are unchanged for existing nodes; that `droppedCount` increments correctly.
- [ ] **Add realtime capability flags + lifecycle hooks to `BaseNode`.**
  - **Static flags** (in `packages/node-sdk/src/base-node.ts`):
    - `static readonly isRealtimeCapable: boolean = false` — node is safe to execute inside a realtime session at all (default false: opt-in).
    - `static readonly ownsWarmState: boolean = false` — node holds GPU/model state that must persist across ticks; the runner must keep its instance alive between frames.
    - `static readonly isMediaAdapter: boolean = false` — node terminates or originates a media transport (e.g. `nodetool.realtime.VideoSource`/`VideoSink`); the runner wires its inbox/outbox to the WebRTC server.
  - **Descriptor surface** (in `packages/node-sdk/src/node-metadata.ts`): add `is_realtime_capable`, `owns_warm_state`, `is_media_adapter` to `NodeDescriptor` and serialize them in `toDescriptor()` alongside the existing `is_streaming_input` / `is_streaming_output` fields. They flow to the web client through the existing node-registry endpoint with no new transport.
  - **Optional instance hooks** (added to `BaseNode` with no-op defaults so they're override-only):
    - `async onSessionStart(ctx: ExecutionContext, session: RealtimeSessionInfo): Promise<void>` — called once per session before the first tick (load model, warm caches, open device).
    - `async onSessionStop(ctx: ExecutionContext, session: RealtimeSessionInfo): Promise<void>` — called when the session enters `stopped`/`error` (release resources).
    - `resetWarmState(): void` — called on intra-session restart (e.g. operator pressed "reset" without ending the session).
  - **Runner consumption** (where the flags are READ): the long-lived realtime entry point (next task) calls `onSessionStart` once per warm-state node before the tick loop, calls `onSessionStop` on teardown, and refuses to start a session if any node on the data path from a `is_media_adapter` source has `isRealtimeCapable === false` (loud error with the offending node id, not silent execution).
  - **Editor consumption** (where the flags are READ): the realtime-mode validation in Phase 3 reads them off the existing `NodeMetadata` via the node registry (no new endpoint). Capability-aware palette filter and edge validation are pure UI on top of the descriptor.
- [ ] **Implement the long-lived realtime mode in `RealtimeRunner`.** Build out the skeleton from the pre-substrate refactor task above. `RealtimeRunner` (in `packages/kernel/src/realtime-runner.ts`) holds a `WorkflowRunner` constructed with `runMode: "realtime"` and orchestrates the realtime lifecycle on top of it. Only the shared primitives (`runMode` option, bounded ring buffers, `_initializeForRealtime()` accessor) live in `runner.ts`.
  - **Entry point:** `async startRealtimeMode(request, graphData): Promise<void>` calls the underlying runner's exposed init pipeline (`_resetRunState` → `rewriteBypassedNodes` → `_filterInvalidEdges` → `_analyzeStreaming` → `_initializeInboxes` → `_initializeGraph`) **without entering the buffered/streaming run loop**, then iterates the graph's nodes and calls `onSessionStart` on every node where `ownsWarmState === true`, then resolves. The session is now "live": media frames arrive via `WorkflowRunner.pushInputValue` and parameter updates via `pushParameter` (below). The standard `WorkflowRunner.run()` path is unchanged for one-shot jobs.
  - **Tick model:** realtime nodes are themselves `isStreamingInput=true` with their own `run()` loops (per the existing `ManualTriggerNode` pattern); `RealtimeRunner` does **not** drive a separate tick clock. The "session-tick" is implicit — each `pushInputValue` from the WebRTC frame router wakes the source node's `for await` loop, which propagates downstream. Most existing actor machinery already does the right thing; the realtime runner's job is keeping it alive, not orchestrating ticks.
  - **Teardown:** `async stopRealtimeMode(): Promise<RunResult>` calls `WorkflowRunner.finishInputStream` on all media-adapter source nodes (so their `for await` loops exit), awaits their actor completion, calls `onSessionStop` on warm-state nodes, then returns the collected outputs/messages.
  - **Bounded growth (inside `runner.ts`):** when `runMode === "realtime"`, `_messages: ProcessingMessage[]`, `_edgeCounters`, and `_outputs` use bounded ring buffers (or running counters for `_edgeCounters`). Without this, a multi-hour session OOMs.
  - **Parameter API (on `RealtimeRunner`):** `async pushParameter(name: string, value: unknown): Promise<{ routed: boolean; nodeIds: string[] }>` routes into nodes flagged `isControlled === true` via the `__control__` handle, falling back to `WorkflowRunner.pushInputValue` semantics for non-controlled nodes (preserving today's behavior). `RealtimeCommandHandler.handleUpdate` switches to this and reports both `routed_parameters` and `unrouted_parameters` back to the operator.
  - **Wiring with the WebRTC server:** `RealtimeCommandHandler.handleStart` constructs a `RealtimeRunner`, awaits `startRealtimeMode`, **then** asks `RealtimeWebRTCServer.start(sessionId, ...)` to spin up the peer; the WebRTC server obtains the realtime runner via `RealtimeSessionManager.getRunner(sessionId)` and pushes frames into it. The `starting → running` gate flips after both `startRealtimeMode` resolves and the WebRTC peer reports `connected` (closes the open follow-up about that gate).

*First `nodetool.realtime` nodes (depend on substrate, gate the model nodes):*

- [ ] **Create the first `nodetool.realtime` nodes.** Land in a new `packages/realtime-nodes/src/nodes/` package (sibling to `base-nodes`; mirrors how `replicate-nodes`/`fal-nodes` are organized) so realtime nodes can be omitted from environments that don't need them.
  - **`nodetool.realtime.VideoSource`** — `isStreamingInput = true`, `isRealtimeCapable = true`, `isMediaAdapter = true`, `inputBufferPolicy = { frame: { capacity: 2, overflowPolicy: "drop_oldest" } }`. `run(inputs, outputs, ctx)` does `for await ([handle, frame] of inputs.any()) { await outputs.emit("frame", frame); }`. Inbox is fed by `RealtimeWebRTCServer` via `pushInputValue("video_source_<id>", frame)`. Properties: `name` (the input-name the WebRTC router maps to), `target_fps` (informational/diagnostic — actual rate is producer-driven).
  - **`nodetool.realtime.VideoSink`** — `isRealtimeCapable = true`, `isMediaAdapter = true`, `ownsWarmState = true` (holds the encoder). Implements `onSessionStart` to acquire an outbound WebRTC track from `RealtimeWebRTCServer.getOutboundTrack(sessionId, sinkName)`, `process({frame})` to encode and write that frame to the track, and `onSessionStop` to release the track. This is the egress node the operator preview attaches to in the loopback path.
  - **`nodetool.realtime.AudioSource`** / **`AudioSink`** — same pattern as video, distinct so audio can be wired independently. Required for any voice/music workflow but optional for the StreamDiffusion proof.
  - **`nodetool.realtime.Parameter`** — `isControlled = true`, `isRealtimeCapable = true`. Holds a typed value (`float` / `string` / `int` / `bool`), receives updates via `pushParameter(name, value)` on the `__control__` handle, emits the latest value downstream on each event. This is what `update_realtime_session` writes into and what live UI controls (sliders, prompt boxes) bind to. Without this node, parameter routing has nowhere to land in the graph.
  - **`nodetool.realtime.SessionInfo`** — `isStreamingOutput = true`, `isRealtimeCapable = true`. Yields the latest `realtime_metrics` snapshot (fps, queue depth, dropped frames, peer state) so workflows can branch on session health (e.g., switch to a lower-fidelity LoRA when fps drops). Optional for the first proof but explicitly the "session utility" role from the contract.
  - **Tests:** in-process loopback (mocked WebRTC server pushing frames into a `VideoSource → identity-passthrough → VideoSink` graph) verifying frame conservation, drop_oldest behavior under load, parameter routing latency, and `onSessionStart`/`onSessionStop` invocation.

*Model nodes (depend on the substrate + realtime nodes above):*

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

- [ ] **Converge `/realtime` into the editor as a "realtime mode".** `/realtime/:workflowId?` was the incubation surface; it is not the long-term home. Concretely:
  - **Mode toggle** in `web/src/components/graph/GraphToolbar.tsx` flips a `mode: "design" | "realtime"` field (likely on `useGraphState` or a sibling `useRealtimeMode` hook). Persist in URL state so deep-linking works (`/editor/:workflowId?mode=realtime`).
  - **State migration from `RealtimeStreamPage`:** the existing `useRealtimeSessionStore`, `useRealtimeSessionWebRTC`, and `useVideoCapture` hooks already encapsulate everything needed (active session, parameters, WebRTC peer, mappings, preview stream). The editor mode imports the same hooks; nothing in the store needs to change. The page becomes a thin shell.
  - **Overlays in realtime mode:** FPS/queue-depth/session status badge on the canvas (reads `realtime_metrics` from the session store), operator parameter strip beside the graph (auto-generated from `nodetool.realtime.Parameter` nodes in the current graph), live preview thumbnail of the `VideoSink` outbound track.
  - **Validation** uses the capability flags read off `NodeMetadata` (no new endpoint): block adding non-`isRealtimeCapable` nodes onto the hot path (downstream of any `is_media_adapter` source) with a tooltip explaining why.
  - **Once this lands:** delete the standalone `/realtime/:workflowId?` route, the `RealtimeStreamPage` component, and any links/menu entries pointing at it. Realtime is still early enough that there's no value in keeping a legacy or fallback surface around.
- [ ] Add realtime-aware validation rules to the editor — read the `is_realtime_capable` / `is_media_adapter` flags added in Phase 2 and prevent non-capable nodes from being wired onto edges flagged as the high-framerate path.
- [ ] Add a starter template for realtime video diffusion plus ControlNet plus LoRA.
- [ ] Add editor affordances for composing realtime source, sink, control, and adapter nodes (e.g., visual indicators for realtime vs. standard edges).
- [ ] Add menu and discovery rules for realtime-capable existing nodes (filter by the new `is_realtime_capable` flag).
- [ ] Add menu and discovery rules for `nodetool.realtime` nodes.
- [ ] Wire `MiniAppPage` and `html_app` to launch realtime sessions through the same session contract — these become the operator-only surfaces (no graph editor) once the editor mode covers the authoring case.
- [ ] Add live control groups for prompt steering, diffusion strength, ControlNet settings, and LoRA weight (reusing existing UI property components like `NodeSlider`, `TextProperty`, etc.).
- [ ] Add reusable preprocessor and effects stages that fit the standard workflow model.

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
- [ ] **Extract `RealtimeCommandHandler` from `unified-websocket-runner.ts`** and move `realtime-session-manager.ts`/`routes/realtime.ts` into `packages/websocket/src/realtime/` — pure refactor, gates the rest of Phase 2 so new realtime work doesn't compound the existing 4,880-line god-class
- [ ] **Land the `RealtimeRunner` skeleton** in `packages/kernel/src/realtime-runner.ts` and add the small shared primitives (`runMode` option, bounded ring buffers, init-pipeline accessor) to `runner.ts` — composition over inheritance, gates the long-lived runner work
- [ ] **Pick the Node-side WebRTC stack** (`werift` vs `@roamhq/wrtc`) — short spike, gates the rest of the substrate
- [ ] **Add `isRealtimeCapable` / `ownsWarmState` / `isMediaAdapter` flags + `onSessionStart`/`onSessionStop`/`resetWarmState` hooks to `BaseNode`** — gates editor validation, capability-aware palette, and the runner's hot-path safety check
- [ ] **Add `overflowPolicy` to `NodeInbox`** with a `"drop_oldest"` variant — the latest-frame-wins primitive the contract requires
- [ ] Implement backend WebRTC termination using the chosen stack to receive the mapped media tracks and feed them into the live graph via `pushInputValue`
- [ ] Build the canonical realtime video diffusion workflow template using the capability model
- [x] Write the session/runtime spec with control-plane and media-plane boundaries (incorporating WebRTC for web clients)
- [ ] Define the first adapter roadmap for `NDI` and `Spout`

## Follow-up tasks discovered while starting the plan

- [x] Change realtime session startup so `start_realtime_session` creates and links a `Job` (instead of only tracking metadata) and launches live execution.
  - Implementation uses the standard `WorkflowRunner` unchanged. Extending it with a long-lived realtime mode (warm instances, tick loop, bounded inboxes, `pushParameter`) is tracked as a Phase 2 substrate prerequisite, not part of this item.
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
- [ ] Tighten the `starting` → `running` gate so a silent `beforeRunJob` failure (or any path where `runJob` returns without registering an active job) cannot leave the session stuck in `running`. Cheap fix: in `startRealtimeSession`, after `await this.runJob(...)`, verify `this.activeJobs.has(jobId)` before promoting; otherwise call `failRealtimeSessionStartup`. Revisit fully when the realtime-mode runner extension lands.
- [ ] Add a `pushParameter(name, value)` API on `WorkflowRunner` so `update_realtime_session` can route control-plane updates separately from media chunks once the parameter/control queue exists. Signature: `async pushParameter(name: string, value: unknown): Promise<{ routed: boolean; nodeIds: string[] }>`. Resolves the parameter name against `nodetool.realtime.Parameter` nodes' `name` property, writes the new value as a `ControlEvent` on the `__control__` handle of each match. `update_realtime_session` then reports `routed_parameters: string[]` and `unrouted_parameters: string[]` back to the operator (replaces today's all-or-nothing `unrouted_parameters` payload). Until this lands, keep using `pushInputValue`.
- [ ] Once the runner extension lands, add a `realtime_metrics` message on the existing websocket control plane (`packages/protocol/src/messages.ts`). Shape: `{ type: "realtime_metrics", session_id: string, job_id: string, ts_ms: number, fps_in: number, fps_out: number, queue_depth: Record<string /* "node_id:handle" */, number>, dropped_frames: Record<string, number>, peer_state: "new" | "connecting" | "connected" | "disconnected" | "failed" }`. Emitted by `RealtimeWebRTCServer` (peer state, fps_in) and the runner (queue depth, dropped frames, fps_out) every ~500ms while a session is `running`. The operator UI subscribes through the existing `useRealtimeSessionStore` websocket subscription. Maps to the "session utility" role; consumed by the editor-mode overlay and by the `nodetool.realtime.SessionInfo` node.

## Notes / maybe later

Captured here so they aren't lost, but not worth promoting to actionable tasks until the surrounding work demands them.

- **Stopped sessions disappear from the manager immediately.** `RealtimeSessionManager.stopSession` deletes the row right after returning the public record, so REST/tRPC `list`/`get` lose the session as soon as it stops. The `Job` row still persists. If/when reconnect or session history surfaces are built (Phase 3), keep the row around briefly with `status: "stopped" | "error"` and add a sweeper.
- **WebRTC peer config is empty.** `useRealtimeSessionWebRTC` calls `new RTCPeerConnection()` with no `iceServers` and no bitrate tuning. Fine for the in-browser loopback proof; revisit when a real out-of-process runtime peer arrives (Phase 2 / "Core Technical Assumptions" item 4).
- **Per-track WebRTC mapping UI.** `RealtimeStreamPage` collects a single `node_id`/`input_name` and applies it to every video track. Extend to per-track mapping (and add audio rows) once more than one camera/mic input is realistic.
- **Brightness slider sync ignores `0`.** The `useEffect` that syncs `activeSession.parameters.brightness` into local state checks truthiness, so `0` is dropped. Switch to `!== undefined` if/when a brightness-of-zero is meaningful, or once realtime parameters are generalized beyond this MVP slider.
- **Test noise from missing DB.** Realtime runner tests log `Database not initialized` warnings because `runJob`/`Job.markCompleted` are best-effort persisted. Not failing assertions; revisit if the tests grow assertions about persisted realtime job metadata.
- **Session presence & reconnect contract is undefined.** Standard jobs already have `reconnect_job`; realtime sessions have `session_id` and a backing job. Open questions: does a realtime session keep running when the operator's tab closes, pause, or stop? Does reconnect re-attach control only or also re-negotiate WebRTC? Should the editor's realtime-mode toggle adopt an existing session for the same workflow_id when one is active? Worth a short contract section in `docs/realtime-runtime-contract.md` once the runner extension lands and there's a real session to reconnect to. Until then, "operator-bound, stops on disconnect" is the implicit default.
- **Session utility / diagnostics surface.** The contract reserves a "session utility" role for fps/queue-depth/lifecycle nodes, and the `realtime_metrics` follow-up adds the data feed. Worth eventually surfacing as a small toolbar widget in the editor's realtime mode and as a normal node so workflows can branch on health (e.g., switch to a lower-fidelity LoRA when fps drops). Defer until the metrics feed exists.

## Review checks

- [x] Check that the execution contract stays broader than the first StreamDiffusion V2 proof
- [x] Check that preview, output, and session state fit the normal workflow model
- [x] Check that `nodetool.realtime` remains small and specific
- [ ] Check that `NDI` and `Spout` are supported by the adapter design from the start
- [x] Check that future audio, sync, and control adapters fit the same boundaries
- [ ] Check that the WebRTC media plane and WebSocket control plane remain cleanly separated and non-blocking

## Future ideas

Captured for memory, not committed. These became visible during the architecture review and are worth revisiting after Phase 2 stabilizes — most fall out naturally from the substrate already being designed.

**Authoring & live control**

- **Parameter automation / timeline.** Schedule prompt fades, LoRA weight ramps, ControlNet curves over time. Falls out of `pushParameter` + a scheduler node.
- **MIDI / OSC → parameter binding UI.** Map a hardware knob to any `nodetool.realtime.Parameter`. Sits on top of the same `pushParameter` path.
- **Preset / scene system.** Named bundles of parameter values applied in one tick. Trivial on top of `pushParameter`.
- **Multi-operator sessions.** Two browsers attached to one session — one drives the prompt, one moves a slider. Session is already keyed by `session_id`.

**Composition & pipelines**

- **Chained realtime workflows.** One session's NDI/Spout output becomes another's input. Falls out of adapters being normal nodes.
- **Realtime LLM nodes.** Token-streaming captioners/translators alongside video. Control plane already carries text via `stream_input`.
- **Live workflow hot-swap.** Replace a node mid-stream. Requires the `ownsWarmState` flag to be honest about what survives a swap.

**Capture & recording**

- **Recording with timecode.** Capture inputs + outputs + parameter timeline so a session can be scrubbed back or re-rendered offline at higher quality. Maps to standard `Asset` storage; differentiating feature.

**Operations & scaling**

- **Headless / server realtime.** Spout in, NDI out, MIDI control, no browser. Control plane is already operator-agnostic; mostly a packaging story.
- **Multi-runtime federation.** Realtime nodes on different GPU hosts within one workflow. Once the WebRTC adapter is decoupled, the boundary is well-defined.
- **JIT realtime graph compilation.** Fuse adjacent reusable nodes and skip metadata bookkeeping on the hot path. Made possible once capability flags are explicit.

**Agent integration**

- **Realtime as an agent tool.** A `nodetool-chat` agent calls `start_realtime_session`, observes fps/output, adjusts prompts. Especially powerful with the existing `TaskExecutor` planning.
