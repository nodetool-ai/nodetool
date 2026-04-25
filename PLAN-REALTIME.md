# Realtime Integration Roadmap for NodeTool

## Status

- [x] Review current workflow streaming, mini-app, editor, and preview architecture
- [x] Confirm clean-room requirement
- [x] Add initial realtime session substrate
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start, update, and stop session (plus `signal_realtime_session` for WebRTC)
  - [x] HTTP endpoints for listing and fetching sessions (currently REST in `packages/websocket/src/realtime/routes.ts`; the rest of the codebase has standardized on tRPC, so these should migrate — see Follow-up tasks)
  - [x] Frontend realtime session client and store
  - [x] Basic `/realtime/:workflowId?` page and local preview
- [x] Phase 1 foundation
- [ ] Phase 2 first proof
- [ ] Phase 3 workflow integration
- [ ] Phase 4 expansion adapters

## Core decisions

- **Realtime is a workflow execution mode.** It belongs to the normal NodeTool workflow model, editor, persistence, and operator surfaces. Realtime sessions should be tracked as standard Jobs in the database, and their outputs should be savable as standard Assets.
- **The first runtime stays separate internally.** It should align with workflow identity, preview routing, and control semantics so later convergence remains straightforward.
- **A Wan2.1 1.3B autoregressive model node is the first proof of the system.** LongLive is the chosen first integration (official FP8 upstream forces precision/hardware-detection design from day one); StreamDiffusion V2, MemFlow, RewardForcing, Krea 14B, and streaming VACE follow the same template. Goal: validate the architecture without defining the entire architecture.
- **Control plane and media plane are separate.** Session lifecycle, control updates, diagnostics, preview notifications, and status stay on the workflow/websocket control plane. High-rate media uses a dedicated adapter boundary.
- **WebRTC is the media adapter boundary for web clients.** To prevent head-of-line blocking and latency spikes, high-framerate video and audio for the web operator surface must use WebRTC (or a similar UDP-based protocol) rather than the WebSocket control plane.
- **Existing workflow nodes remain the default building blocks.** Realtime-specific nodes are added where the graph needs a distinct live source, sink, adapter, or control role. Standard WebSocket-based streaming nodes (using the existing `stream_input` command and `pushInputValue` inbox pattern) can feed into realtime nodes asynchronously, acting as inputs or control signals without disrupting the high-framerate realtime execution loop.
- **`nodetool.realtime` is the namespace for new realtime-category nodes.** Use this namespace for nodes that are genuinely specific to realtime execution instead of duplicating ordinary workflow nodes.
- **`NDI` and `Spout` are committed later goals.** The architecture should reserve clean media adapter boundaries for them from the start. `Syphon`, `MIDI`, `OSC`, `DMX`, and `timecode` follow the same adapter-first model.
- **Code organization rule: shared files hold primitives and surfaces; dedicated files hold realtime behavior.** Realtime work should not be glued into the existing god-classes. Concretely: `unified-websocket-runner.ts` (already 4,880 lines) and `runner.ts` (1,051 lines) gain only the small primitives/surfaces they need (a delegating switch case, a `RunMode` enum, a bounded buffer); all realtime *behavior* lives in `packages/websocket/src/realtime/*` and `packages/kernel/src/realtime-runner.ts`. Any task that would add more than ~50 lines to a shared file, or a new conceptual responsibility (signaling, frame routing, parameter routing) to one, must extract first.
- **Substrate lives in core; model nodes live in a sister Python package — sister repo from day one (decided).** Mirrors the existing precedent where `packages/huggingface/` (TS bridge/types) lives in `nodetool-core` while `nodetool-huggingface` (Python ML nodes) is a sibling repo, and the same again for fal/kie/replicate/elevenlabs. The packaging trade-off was considered three ways — (A) sister repo from day one, (B) subpackage in the main `nodetool` repo with installable extras, (C) bootstrap in core then extract — and (A) won on install bloat isolation, release cadence independence, CI scope correctness (model nodes need GPU CI; substrate doesn't), and matching the existing multi-repo workflow that's already in muscle memory. Concretely:
  - **In `nodetool-core` (this repo):** `packages/kernel/src/realtime-runner.ts`, `packages/websocket/src/realtime/*` (session manager, command handler, WebRTC server), `packages/realtime-nodes/` (TS — `VideoSource` / `VideoSink` / `AudioSource` / `AudioSink` / `Parameter` / `SessionInfo`; pure I/O nodes that talk to the WebRTC server, no PyTorch), `packages/realtime/` (TS — frame format encoding, session-protocol shapes, the bridge-side glue analogous to `packages/huggingface/`). Python side **also** in core: `BaseNode` realtime hooks (`on_session_start` / `on_session_stop` / `reset_warm_state`), `nodetool.worker` bridge protocol verbs (`start_session` / `update_parameter` / `push_input_frame` / `output_frame` / `stop_session`), the `LatestPerHandleAccumulator` utility, the frame-format dataclass, and the hardware-detection helper extending SystemStats.
  - **In a new sister `nodetool-realtime` Python repo:** all model-pipeline code (LongLive, Self-Forcing, StreamDiffusion V2, MemFlow, RewardForcing, Krea, streaming VACE), the `WeightSource` resolver, the GGUF loader, the Wan2.1 base, and the `RealtimePipelineNode` base class (analogue of `HuggingFacePipelineNode`). Heavy ML deps (`diffusers`, `transformer_engine`, `flash-attn`, `gguf`, `bitsandbytes`) only appear here as pyproject extras — `nodetool-core` install stays lean.
  - **Why this split matters:** core stays small enough to ship in any deployment; users who don't want realtime model nodes don't pay the install/disk cost; model nodes can release on their own cadence and churn faster than the substrate; the substrate gets validated end-to-end by the first model node in the sister package without needing to live in the same repo.

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
  - *Correction still needed:* wrap the existing `WorkflowRunner` (`packages/kernel/src/runner.ts`) in a sibling `RealtimeRunner` rather than replacing or subclassing it — composition. Only small primitives land in `runner.ts` (a `runMode` option, bounded ring buffers, an init-pipeline accessor); long-lived realtime behavior lives in `packages/kernel/src/realtime-runner.ts`. The current event-driven primitives (`isStreamingInput`+`run()`, `isStreamingOutput`+`genProcess()`, `isControlled`, and `NodeInbox(bufferLimit)`) already cover most of the loop; what's missing is bounded/latest-frame-wins inbox policy, warm-state lifecycle hooks, and frame-tick metrics. See "Existing event-driven primitives" below.
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
  - `packages/websocket/src/realtime/session-manager.ts` now tracks `job_id`, starts sessions as `"starting"`, and preserves `"error"` state during terminal session events.
  - `packages/websocket/src/unified-websocket-runner.ts` now starts realtime sessions against a live `WorkflowRunner`, persists realtime linkage onto the backing `Job` when the DB is available, supports optional graph payloads, and routes live parameter updates into active workflow inputs when possible.
- Realtime websocket session handling is now split into `packages/websocket/src/realtime/command-handler.ts`, with `unified-websocket-runner.ts` delegating the four realtime commands and the realtime session manager/routes colocated under `packages/websocket/src/realtime/`.
- `packages/kernel/src/realtime-runner.ts` now exists as the composition shell for the long-lived realtime runner direction, and `packages/kernel/src/runner.ts` now exposes the shared primitives that shell needs first: `runMode`, bounded realtime message/output buffers, and a public `initializeForRealtime(...)` init-pipeline accessor.
- The capture audit confirmed that `web/src/hooks/browser/useVideoRecorder.ts` is the key separation point for reusable browser capture vs upload behavior.
- `web/src/hooks/browser/useVideoCapture.ts` now provides the shared browser video capture/device layer used by both `useVideoRecorder` and `web/src/components/realtime/RealtimeStreamPage.tsx`.
- `web/src/components/realtime/RealtimeStreamPage.tsx` now launches the `/realtime` proof with `transport: "webrtc"`, explicit browser-track-to-node mappings, WebRTC signaling relayed over the existing websocket control plane, and a loopback runtime preview powered by browser peer connections.
- API style: the realtime HTTP endpoints (`/api/realtime/sessions`, `/api/realtime/sessions/:id`) are still REST (`packages/websocket/src/realtime/routes.ts`); the broader codebase has migrated query/mutation endpoints to tRPC (`packages/websocket/src/trpc/routers/*`). Realtime should follow that convention — captured as a follow-up task below.
- The current runner strategy is still an interim foundation:
  - Realtime sessions currently reuse the standard `WorkflowRunner` as the execution engine.
  - The chosen direction is **composition**: wrap `WorkflowRunner` in a sibling `RealtimeRunner` class (`packages/kernel/src/realtime-runner.ts`) that owns long-lived realtime behavior — warm node instances, session lifecycle, bounded inboxes, `pushParameter`. Only small primitives (`runMode` option, bounded ring buffers, an init-pipeline accessor) land in `runner.ts` itself. Not a subclass, not a fork, not in-place inflation of `runner.ts`. See "Existing event-driven primitives" and the Phase 2 pre-substrate refactor + substrate prerequisites.

## Phase 2 - First proof: Autoregressive Video Diffusion (Wan 2.1 1.3B — LongLive first, then Self-Forcing / StreamDiffusion V2 / MemFlow / Krea / VACE)

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

- [x] **Extract `RealtimeCommandHandler` from `unified-websocket-runner.ts`.** Pure refactor, no behavior change. Moved the four existing realtime command cases (`start_realtime_session`, `signal_realtime_session`, `update_realtime_session`, `stop_realtime_session`) out of `unified-websocket-runner.ts` into `packages/websocket/src/realtime/command-handler.ts`, with `UnifiedWebSocketRunner` delegating through a single `this.realtimeHandler` instance. Required runner state access (`activeJobs`, `runJob`, `cancelJob`, startup/emit helpers, session/job tracking) now flows through a small constructor dependency interface so the handler stays isolated from the rest of the runner. Also moved the realtime session manager and REST routes into `packages/websocket/src/realtime/` for consistency. **Why first:** all subsequent Phase 2 work (WebRTC server, frame router, gate-tightening) now lands in the new module rather than further inflating the god-class.
- [x] **Decide runner extension shape: composition over inheritance.** Landed a **sibling `packages/kernel/src/realtime-runner.ts` exporting a `RealtimeRunner` class that holds (composes) a `WorkflowRunner`** — not in-place changes to `runner.ts` or a subclass. The small shared primitives now live in `runner.ts`: `runMode?: "one_shot" | "realtime"` on `WorkflowRunnerOptions`, bounded realtime buffers for `_messages`/`_outputs` (with `_edgeCounters` staying as running counters keyed by edge id), and a public `initializeForRealtime(...)` accessor exposing the existing init pipeline (`_resetRunState` → `rewriteBypassedNodes` → `_filterInvalidEdges` → `_analyzeStreaming` → `_initializeInboxes` → `_initializeGraph`) so `RealtimeRunner.startRealtimeMode(...)` can drive initialization without entering the standard run loop. The long-lived behavior itself is still pending: `stopRealtimeMode()` and `pushParameter()` remain explicit stubs in `realtime-runner.ts`, which is now the concrete home for the next substrate tasks.

*Substrate prerequisites (in-runner primitives — do these next, in order):*

- [x] **Pick the server-side WebRTC stack (Node-first).** **Decision:** use **`werift`** as the default Node-side WebRTC stack for Phase 2. It wins the pre-integration trade-off on criteria (1) and (4): it is pure TypeScript with no native build step, which is materially lower-friction for macOS/Windows/Linux + Electron than `@roamhq/wrtc`, and it keeps the media/control path in JS where the upcoming frame router can inspect or hand off frames without crossing a native binding boundary. Codec breadth and 720p30 loopback latency still need to be validated in the dedicated integration task below; if `werift` proves insufficient on criteria (2) or (3) once the first real server-side handshake/frame tests exist, the fallback is `@roamhq/wrtc`, with Python `aiortc` only revisited if both Node options miss the realtime target. Chosen dependency: `werift@^0.22.9` in `packages/websocket`.
- [x] **Add latest-frame-wins inbox policy.** Landed the substrate for per-handle buffering in `packages/kernel/src/inbox.ts`: `NodeInbox` now accepts optional handle policies, supports `overflowPolicy: "block" | "drop_oldest" | "drop_newest"` with per-handle `capacity`, and tracks dropped-item counts per handle for future metrics.
  - **Source of truth (resolution order, last wins):** implemented as (1) global `WorkflowRunnerOptions.bufferLimit`; (2) BaseNode descriptor field `static readonly inputBufferPolicy?: Record<handle, { capacity: number; overflowPolicy: "block" | "drop_oldest" | "drop_newest" }>` in `packages/node-sdk/src/base-node.ts`, serialized through `toDescriptor()`, `node-metadata.ts`, and the graph resolver; (3) per-edge override in graph data via `Edge.metadata.overflowPolicy` / `capacity`.
  - **Wiring point:** `_initializeInboxes()` in `packages/kernel/src/runner.ts` now resolves policies per `(node, handle)` and passes them into a single `NodeInbox` per node via handle-policy overrides, keeping the existing inbox shape intact.
  - **Default for `nodetool.realtime` source nodes:** the descriptor surface now exists; the concrete `{ capacity: 2, overflowPolicy: "drop_oldest" }` default will be attached when the first `nodetool.realtime.*Source` nodes land below.
  - **Tests:** added focused coverage for producer-faster-than-consumer behavior at each overflow policy, unchanged `block` semantics, drop counters, node-level policy propagation, and per-edge override precedence.
- [x] **Add realtime capability flags + lifecycle hooks to `BaseNode`.**
  - **Static flags** (in `packages/node-sdk/src/base-node.ts`) landed:
    - `static readonly isRealtimeCapable: boolean = false`
    - `static readonly ownsWarmState: boolean = false`
    - `static readonly isMediaAdapter: boolean = false`
    These default to false so realtime behavior remains opt-in.
  - **Descriptor surface** is now wired through `NodeDescriptor`, `BaseNode.toDescriptor()`, `NodeMetadata`, and the graph resolver as `is_realtime_capable`, `owns_warm_state`, and `is_media_adapter`, alongside the existing streaming/control flags. `Graph.loadFromDict()` also now prefers registry-provided truth for these flags over stale saved graph values.
  - **Optional instance hooks** landed on `BaseNode` with no-op defaults:
    - `async onSessionStart(ctx: ExecutionContext, session: RealtimeSessionInfo): Promise<void>`
    - `async onSessionStop(ctx: ExecutionContext, session: RealtimeSessionInfo): Promise<void>`
    - `resetWarmState(): void`
    Supporting types are exported as `ExecutionContext` from `@nodetool/runtime` and `RealtimeSessionInfo` from `@nodetool/protocol`.
  - **Runner consumption** remains the next task: the long-lived realtime runner will call these hooks and enforce capability validation when realtime session orchestration lands below.
  - **Editor consumption** remains for Phase 3, but the metadata needed by the node registry is now present with no new transport.
- [x] **Implement the long-lived realtime mode in `RealtimeRunner`.** Built out the skeleton from the pre-substrate refactor task above. `RealtimeRunner` (in `packages/kernel/src/realtime-runner.ts`) now holds a `WorkflowRunner` constructed with `runMode: "realtime"` and orchestrates the realtime lifecycle on top of it. Shared primitives (`runMode` option, bounded ring buffers, `initializeForRealtime`, `pushParameter`, `startBackgroundProcessing`, `waitForBackgroundProcessing`, `getMediaAdapterInputNames`, `snapshotRunResult`, `getNodes`, `getExecutor`, `getExecutionContext`) live in `runner.ts`.
  - **Entry point:** `async startRealtimeMode(request, graphData): Promise<void>` ✅ calls `runner.initializeForRealtime`, builds the session info record, runs `onSessionStart` on every node flagged `owns_warm_state` (calling `resetWarmState` first), then `runner.startBackgroundProcessing(params)` and holds the processing promise. The session is now "live": media frames arrive via `WorkflowRunner.pushInputValue` and parameter updates via `pushParameter` (below). The standard `WorkflowRunner.run()` path is unchanged for one-shot jobs.
  - **Tick model:** realtime nodes are themselves `isStreamingInput=true` with their own `run()` loops (per the existing `ManualTriggerNode` pattern); `RealtimeRunner` does **not** drive a separate tick clock. The "session-tick" is implicit — each `pushInputValue` from the WebRTC frame router wakes the source node's `for await` loop, which propagates downstream. Most existing actor machinery already does the right thing; the realtime runner's job is keeping it alive, not orchestrating ticks.
  - **Teardown:** `async stopRealtimeMode(): Promise<RunResult>` ✅ calls `runner.finishInputStream` on every input returned by `getMediaAdapterInputNames()` so the source nodes' `for await` loops exit, awaits the held processing promise, runs `onSessionStop` on warm-state nodes, and returns `runner.snapshotRunResult(...)` with `"completed"` or `"failed"` depending on whether teardown raised.
  - **Bounded growth (inside `runner.ts`):** ✅ when `runMode === "realtime"`, `_messages` and `_outputs` use a FIFO bounded buffer that drops oldest entries when the realtime limit is exceeded; `_edgeCounters` stays as running counters. Without this, a multi-hour session OOMs.
  - **Parameter API (on `RealtimeRunner`):** ✅ `async pushParameter(name, value)` delegates to `WorkflowRunner.pushParameter`, which resolves the name against nodes flagged `is_controlled` and writes the value as a `ControlEvent` on the `__control__` handle, falling back to `pushInputValue` semantics for non-controlled nodes. `RealtimeCommandHandler.handleUpdate` calls through and reports both `routed_parameters` and `unrouted_parameters` back to the operator.
  - **Wiring with the WebRTC server:** still pending — `RealtimeCommandHandler.handleStart` will construct a `RealtimeRunner`, `await startRealtimeMode`, then ask `RealtimeWebRTCServer.start(sessionId, ...)` to spin up the peer; the WebRTC server will obtain the realtime runner via `RealtimeSessionManager.getRunner(sessionId)` and push frames into it. The transport-readiness half of the `starting → running` gate (waiting for WebRTC peer `connected`) is tracked under the WebRTC integration task below.

*Python integration architecture (where Python model code lives and how it talks to the runner — gates every model-node task below):*

The TS-side `BaseNode` hooks landed above need a **Python mirror**, the existing stdio bridge needs **session-scoped verbs**, and model code needs a **clean home**. This subsection codifies all three so the first model-node task is mechanical, not architectural.

- [ ] **Mirror the realtime hooks on the Python `BaseNode`.** Today, `on_session_start` / `on_session_stop` / `reset_warm_state` and the `is_realtime_capable` / `owns_warm_state` / `is_media_adapter` flags exist only on the TS-side `BaseNode` (`packages/node-sdk/src/base-node.ts`). Every line of model code lives in Python — the mirror is non-optional.
  - **Where:** `nodetool.workflows.base_node.BaseNode` in the `nodetool-core` Python codebase (same module that already hosts `pre_process` / `process` / `requires_gpu`).
  - **Shape:**
    - `is_realtime_capable: bool = False` (class attribute)
    - `owns_warm_state: bool = False`
    - `is_media_adapter: bool = False`
    - `async def on_session_start(self, context: ProcessingContext, session: RealtimeSessionInfo) -> None: ...` (no-op default)
    - `async def on_session_stop(self, context: ProcessingContext, session: RealtimeSessionInfo) -> None: ...` (no-op default)
    - `def reset_warm_state(self) -> None: ...` (no-op default)
  - **Discovery:** the existing `discover` response from `nodetool.worker` already emits node metadata; extend the serialization to include the three new flags so the TS-side registry sees the same truth for Python and TS nodes.
  - **Tests:** unit tests on the base class verify defaults; an integration test confirms `on_session_start` is awaited before the runner promotes to `running` and `on_session_stop` is awaited during `stopRealtimeMode`.
- [ ] **Extend the stdio bridge protocol with session-scoped verbs.** The current bridge (`packages/runtime/src/python-stdio-bridge.ts`) is request/response — `execute(req) → result` and `executeStream(req) → AsyncGenerator<result>`. That shape one-shots a Python process per call (or per stream) and cannot hold warm GPU state across frames. Realtime needs a long-lived session in the worker. Add five verbs (msgpack frames, same length-prefixed framing, no transport change):
  - **`start_session(node_type, fields, secrets, blobs) → { session_id, status }`** — instantiates the Python node, awaits `pre_process` + `on_session_start`, returns when ready. Emits `processing_message` events during load (already part of the bridge's progress channel).
  - **`update_parameter(session_id, name, value) → { ok, routed }`** — live `pushParameter`. Resolves to the matching Python node attribute via the existing `is_controlled` machinery.
  - **`push_input_frame(session_id, handle, frame_payload) → { ok, dropped_count }`** — frames flow into the Python node's per-handle inbox with the same `LatestPerHandleAccumulator` semantics the TS side already enforces. Backpressure is local to the Python side: if the inbox is full, return `dropped_count > 0` rather than blocking the bridge.
  - **`output_frame` event** (server → client, asynchronous) — Python emits a frame downstream by sending an event with `session_id`, `handle`, `frame_payload`. The TS-side `RealtimeRunner` receives it, applies the same `pushInputValue` semantics, and the WebRTC server consumes it from there.
  - **`stop_session(session_id) → { result }`** — awaits `on_session_stop`, frees weights, returns the final `RunResult` snapshot.
  - **Frame payload encoding:** msgpack `bin` field carrying the raw tensor bytes + a small header (shape, dtype, colorspace, timestamp) — the frame-format dataclass from the design pass. Avoid base64 (wastes 33%) and avoid JSON (binary-hostile).
  - **Where it lives:** TS side — extend `PythonStdioBridge` and add a `PythonRealtimeSession` class wrapping the five verbs. Python side — extend `nodetool.worker` to dispatch the new verbs and maintain a `dict[session_id, RealtimeNodeInstance]`.
  - **Tests:** mock the worker to verify the round-trip shape; end-to-end test pushes 100 frames through a Python identity-passthrough node and verifies frame conservation + ordering.
- [x] **Decide the Python package layout for realtime nodes.** *(done — sister repo bootstrapped at `../nodetool-realtime`, root commit `44eccf5`. Skeleton mirrors `nodetool-huggingface`: `src/nodetool/nodes/realtime/` for thin nodes, `src/nodetool/realtime/` for fat pipelines, `package_metadata/nodetool-realtime.json` stub, hatchling build, lint+publish-wheel+copilot-setup CI workflows, smoke tests that pass without torch. Base install only depends on `nodetool-core`; precision-specific deps are placeholder `[fp8]` / `[gguf]` / `[int8]` / `[all]` extras that fill in as model nodes land. `[tool.uv.sources]` points at the local `../nodetool-core` checkout for editable dev.)* Mirror the `nodetool-huggingface` precedent exactly so anyone who can build an HF node can build a realtime node:
  - **Sister repo `nodetool-realtime`:**
    ```
    nodetool-realtime/
    └── src/nodetool/
        ├── nodes/realtime/                     ← thin nodes (BaseNode subclasses, declarative)
        │   ├── realtime_pipeline_node.py       ← shared base (analogue of HuggingFacePipelineNode)
        │   ├── longlive.py                     ← LongLive node (first integration)
        │   ├── self_forcing.py                 ← Self-Forcing node (low-VRAM consumer hero)
        │   ├── stream_diffusion_v2.py
        │   ├── memflow.py
        │   ├── reward_forcing.py
        │   ├── krea_realtime.py
        │   └── streaming_vace.py
        └── realtime/                           ← fat pipelines (heavy implementation)
            ├── weight_source.py                ← WeightSource resolver from the design pass
            ├── gguf_loader.py                  ← Wan2.1-aware GGUF loader (Self-Forcing prereq)
            ├── inference_thread.py             ← single shared GPU thread per session
            ├── wan21/                          ← shared Wan2.1 base used by all distillations
            │   ├── base.py
            │   ├── longlive_pipeline.py
            │   └── self_forcing_pipeline.py / etc.
            └── vace/streaming_vace_pipeline.py
    ```
  - **`RealtimePipelineNode` base class** owns `load_pipeline()`, `move_to_device()`, the per-session inference-thread executor (single shared `ThreadPoolExecutor(max_workers=1)` wrapped in `torch.inference_mode()` with explicit `torch.cuda.synchronize()` + `gc.collect()` after each step — directly mirrors `HuggingFacePipelineNode.run_pipeline_in_thread`), and the `on_session_start` / `on_session_stop` / `reset_warm_state` plumbing every model node inherits.
  - **In core, not in the sister package:** `BaseNode` realtime hooks (above), bridge protocol (above), the frame-format dataclass, the `LatestPerHandleAccumulator` Python utility, the hardware-detection helper. These are substrate, not nodes — they belong wherever `BaseNode` and `nodetool.worker` already live.
  - **In `nodetool-core` `packages/realtime-nodes/` (TS):** the I/O-facing nodes that don't need PyTorch — `VideoSource`, `VideoSink`, `AudioSource`, `AudioSink`, `Parameter`, `SessionInfo`. They talk directly to the WebRTC server in TS and don't round-trip through the bridge. (See the next subsection — the existing checkbox already covers these.)
  - **In `nodetool-core` `packages/realtime/` (TS, optional):** any TS-side bridge glue specific to realtime model nodes (frame-format encoding/decoding, session-protocol shape) — analogous to how `packages/huggingface/` is the TS-side companion to `nodetool-huggingface`. Only create this if there's a non-trivial amount of glue; otherwise let it live in `packages/runtime/` next to the existing bridge.
  - **Why split this way:** core install stays lean (no `diffusers` / `transformer_engine` / `flash-attn` / `gguf` / `bitsandbytes` required); model nodes release on their own cadence; the substrate is validated end-to-end by `nodetool-realtime` without needing to live in the same repo. Identical to the HuggingFace precedent that already works.
- [ ] **Re-label existing plan references to `packages/realtime-nodes/`.** Wherever the plan currently uses `packages/realtime-nodes/` for model code (LongLive, Self-Forcing, etc.), the actual home is `nodetool-realtime/src/nodetool/nodes/realtime/`. The `packages/realtime-nodes/` path is reserved for the TS-side I/O nodes only. (Mostly a doc-pass — adjust the wording on the model-node tasks below as part of this checkbox.)

*First `nodetool.realtime` nodes (depend on substrate, gate the model nodes):*

- [ ] **Create the first `nodetool.realtime` nodes.** Land in a new `packages/realtime-nodes/src/nodes/` package (sibling to `base-nodes`; mirrors how `replicate-nodes`/`fal-nodes` are organized) so realtime nodes can be omitted from environments that don't need them.
  - **Decide first (blocks node code):**
    - **Frame format contract.** The Python type that flows on `frame` edges between `VideoSource` → model node → `VideoSink`, and that the WebRTC frame router converts to/from. Recommend a small dataclass wrapping a `torch.Tensor` (uint8, NHWC, on CPU by default with explicit device hand-off helpers) plus shape/dtype/colorspace/timestamp fields. **Decide once and reuse** — every model node and every adapter consumes this contract; changing it mid-flight ripples through every realtime node. Document in `packages/realtime-nodes/src/types.ts` (or equivalent Python module) before any node implementation.
    - **Package layout & registry discovery.** Confirm the node-registry picks up nodes from the new sibling package without changes to the discovery code (model is `replicate-nodes`/`fal-nodes`). Decide pyproject.toml vs monorepo build integration, dev-loop iteration speed (hot-reload? restart?). The first node sets the template — get it right and steps 8/10/11 are mechanical.
  - **`nodetool.realtime.VideoSource`** — `isStreamingInput = true`, `isRealtimeCapable = true`, `isMediaAdapter = true`, `inputBufferPolicy = { frame: { capacity: 2, overflowPolicy: "drop_oldest" } }`. `run(inputs, outputs, ctx)` does `for await ([handle, frame] of inputs.any()) { await outputs.emit("frame", frame); }`. Inbox is fed by `RealtimeWebRTCServer` via `pushInputValue("video_source_<id>", frame)`. Properties: `name` (the input-name the WebRTC router maps to), `target_fps` (informational/diagnostic — actual rate is producer-driven).
  - **`nodetool.realtime.VideoSink`** — `isRealtimeCapable = true`, `isMediaAdapter = true`, `ownsWarmState = true` (holds the encoder). Implements `onSessionStart` to acquire an outbound WebRTC track from `RealtimeWebRTCServer.getOutboundTrack(sessionId, sinkName)`, `process({frame})` to encode and write that frame to the track, and `onSessionStop` to release the track. This is the egress node the operator preview attaches to in the loopback path.
  - **`nodetool.realtime.AudioSource`** / **`AudioSink`** — same pattern as video, distinct so audio can be wired independently. Required for any voice/music workflow but optional for the StreamDiffusion proof.
  - **`nodetool.realtime.Parameter`** — `isControlled = true`, `isRealtimeCapable = true`. Holds a typed value (`float` / `string` / `int` / `bool`), receives updates via `pushParameter(name, value)` on the `__control__` handle, emits the latest value downstream on each event. This is what `update_realtime_session` writes into and what live UI controls (sliders, prompt boxes) bind to. Without this node, parameter routing has nowhere to land in the graph.
  - **`nodetool.realtime.SessionInfo`** — `isStreamingOutput = true`, `isRealtimeCapable = true`. Yields the latest `realtime_metrics` snapshot (fps, queue depth, dropped frames, peer state) so workflows can branch on session health (e.g., switch to a lower-fidelity LoRA when fps drops). Optional for the first proof but explicitly the "session utility" role from the contract.
  - **Tests:** in-process loopback (mocked WebRTC server pushing frames into a `VideoSource → identity-passthrough → VideoSink` graph) verifying frame conservation, drop_oldest behavior under load, parameter routing latency, and `onSessionStart`/`onSessionStop` invocation.

*Integration (wires the substrate to the network — depends on everything above):*

- [ ] **Stand up the server-side WebRTC endpoint and frame router.** Land the chosen stack as `packages/websocket/src/realtime/webrtc-server.ts` (alongside the `command-handler.ts` and `session-manager.ts` from the refactor), with frame-routing concerns split into `packages/websocket/src/realtime/frame-router.ts` if the server file would otherwise grow past ~500 lines. Export a `RealtimeWebRTCServer` with these responsibilities:
  - Lifecycle is **per session, not singleton**: `start(sessionId, transportConfig)` is called from `RealtimeCommandHandler.handleStart` after `RealtimeRunner.startRealtimeMode` resolves; `stop(sessionId)` is called on terminal transitions.
  - Consumes the existing `signal_realtime_session` command (now routed through `RealtimeCommandHandler.handleSignal`) to receive operator SDP/ICE, produces answer SDP/ICE, and replies through the same command (no new websocket commands needed for signaling).
  - Reads `transport.tracks` (the existing track→node mapping on the session record) to know which inbound track feeds which `nodetool.realtime` source node and input name.
  - For each inbound media track, decodes frames and calls `realtimeRunner.pushInputValue(inputName, frame, sourceHandle?)` on the session's `RealtimeRunner`. The runner instance is obtained via `RealtimeSessionManager.getRunner(sessionId)` (added as part of the refactor task — the `RealtimeRunner` reference is stored on the session record at start time).
  - Runs WebRTC peer work off the runner's main async loop (Worker thread or scheduler-yielded async) to honor "Async I/O vs. Synchronous Inference Boundary" in Core Technical Assumptions.
  - Exposes outbound tracks for `nodetool.realtime.VideoSink`/`AudioSink` to write encoded frames into via `getOutboundTrack(sessionId, sinkName)` (matches the sink node's `onSessionStart` call from the previous task).
  - Emits a `realtime_metrics` snapshot (see follow-up task) every N seconds with fps in/out, peer state, and dropped-frame count.
  - **Replaces the in-browser loopback path** in the `/realtime` proof: after this lands, the operator browser only opens one peer connection (to the server), not two; the second loopback peer is removed.
  - **Tests:** real WebRTC handshake against the chosen stack in a Node test (no browser needed); end-to-end test pushing frames from a stub source through the runner into a sink track and reading them back on a peer.

*Pre-model design pass (decide before the first model node — written-down decisions, not code):*

- [ ] **Pick the Wan2.1 upstream dependency.** Three options, each with different trade-offs:
  - **`diffusers` library** — cleanest integration, but Wan2.1 streaming-distillation support varies and may not cover LongLive/MemFlow/Krea/VACE
  - **Daydream's [Scope](https://github.com/livepeer/scope) reference implementation** — closest to what we want, includes StreamDiffusion V2 + LongLive + Krea + streaming VACE integrations, validated end-to-end. Need to check licensing and decide whether to vendor the modules or take a runtime dependency
  - **Direct from research repos** — most flexibility, most work, fragile to upstream churn

  Output: a one-paragraph note on which path was chosen and why; commit it next to this checkbox.
- [ ] **Define the model-loading lifecycle on the `starting` path.** With `onSessionStart` wired, the obvious pattern is "load model in `onSessionStart`, run inference in `process()`", but Wan2.1 1.3B is ~20 GB — load takes seconds and the session sits in `starting` the whole time. Recommended pattern:
  - **Emit `processing_message` events with download/load progress** during `onSessionStart` so the operator UI shows a real progress bar instead of a spinner.
  - The `starting → running` gate already waits for `startRealtimeMode` to resolve (which awaits all `onSessionStart` calls), so progress events are the right surface for "what is taking so long".
  - Free model weights in `onSessionStop`, reset per-session state (KV cache, frame counter, RNG seed) in `resetWarmState()`.

  Land this as a small helper (`emitLoadProgress(ctx, label, fraction)`) in the realtime-nodes package so every model node uses the same shape and the editor overlay can rely on it.
- [ ] **Add a `LatestPerHandleAccumulator` utility for multi-input realtime nodes.** A diffusion node has 3+ live inputs (`prompt` from a `Parameter`, `frame` from a `VideoSource`, optional ControlNet condition). The realtime contract is "latest of each", which falls out of `inbox.any()` + `drop_oldest`, but each model node needs to **explicitly track per-handle latest values** rather than blocking on any one handle. A shared 30-line utility prevents every model node from reinventing this and getting it subtly wrong (e.g., emitting before all required inputs have arrived once). Lives in `packages/realtime-nodes/src/utils/`.
- [ ] **Establish a CPU-only smoke-test pattern for model nodes.** GPU inference can't run in CI. Define a test harness that:
  - Validates the node's descriptor / metadata / capability flags (registry round-trip)
  - Validates the lifecycle hook ordering (`onSessionStart` → frames → `onSessionStop`) by stubbing the actual model with an identity passthrough
  - Validates `LatestPerHandleAccumulator` semantics (latest-of-each, no-emit-before-required-inputs)
  - Validates `resetWarmState` actually clears the per-session state

  Without this, every model-node regression has to be caught by hand on a GPU box.
- [ ] **Set the framerate acceptance threshold (per model).** The plan committed to pure-PyTorch (no TRT) — that's a friction win, but the resulting framerate is the open empirical question. Set explicit thresholds in each model-node task. Suggested baselines: **LongLive ≥20 fps on a 4090 at 512×512 (FP8)** — LongLive's official FP8 path is the lead model and sets the bar; **Self-Forcing ≥12 fps on a 3060 12 GB at 384×384 via the community GGUF build** — explicit Ampere/low-VRAM acceptance criterion (this is the test that proves the GGUF route actually unlocks the consumer audience); secondary LongLive target on Ampere ("≥10 fps on a 3060 12 GB at 384×384, FP16" — no FP8 hardware on Ampere); **StreamDiffusion V2 ≥15 fps on a 4090 at 512×512 (FP16)**; **MemFlow / RewardForcing ≥12 fps at 480p on a 4090 (FP16)** until upstream FP8 lands. "Shipped" is unambiguous so we don't ship a node that technically loads but feels broken.
- [ ] **Decide the community pre-quantized weights story** (one-paragraph note next to this checkbox; affects every Wan2.1 model node). Two distinct weight sources exist for the same model:
  - **Official upstream weights** — full-precision `.safetensors` from the model author's HuggingFace repo. We quantize at load time using `transformer_engine` (FP8) or `bitsandbytes` (INT8), gated by hardware detection.
  - **Community pre-quantized weights** — `.safetensors` (FP8 e4m3fn) and `.gguf` builds distributed via ComfyUI / Civitai / Patreon, e.g. `Wan2.1-T2V-1.3B-Self-Forcing-DMD-VACE-FP8_e4m3fn.safetensors` (~6 GB VRAM target). **GGUF specifically dissolves the "no FP8 on Ampere" problem** because dequant happens in software at load — the same weights run on RTX 30-series, Turing, anything with enough VRAM. The community is also bundling adapters (DMD distillation, VACE control) directly into the weights, which short-circuits parts of our integration.

  Decision shape: introduce a `WeightSource` resolver at `nodetool-realtime/src/nodetool/realtime/weight_source.py` (sister Python package — see Python integration architecture above) that takes `(model_id, precision_hint, hardware_caps)` and returns a concrete weight URL + format. Order of preference: native FP8 (if hardware-supported and an official build exists) → GGUF (if a community build is cached or available) → FP16 official → INT8 fallback. Wire `WeightSource` into the `precision = "auto"` path of every Wan2.1 model node so the choice is centralized, not duplicated. Land the resolver as part of the design pass; the LongLive node consumes it; subsequent nodes inherit. The `hardware_caps` argument comes from the core-side hardware-detection helper (which lives in `nodetool-core`'s Python codebase, alongside the existing SystemStats source). **Out-of-scope for the design pass:** building the actual GGUF loader — that lands with the Self-Forcing node, which is the first node where GGUF is the primary path.
- [ ] **Extend the existing hardware-detection pipeline with realtime-relevant capabilities** (do **not** build a parallel utility). Today's surface:
  - `electron/src/systemInfo.ts` shells out to `nvidia-smi` / `lspci` / `system_profiler` at boot and returns CUDA availability + driver version.
  - `electron/src/torchruntime.ts` calls the `torchruntime~=2.0` Python package at boot to pick a `TorchPlatform` (`cu118|cu124|cu128|cu129|rocm5.x|rocm6.x|mps|cpu`) and the matching PyTorch wheel index. This is the canonical place for "what kind of accelerator do we have."
  - `packages/protocol/src/api-types.ts` SystemStats already carries `vram_total_gb` and `vram_percent`, plumbed through `web/src/stores/systemStatsHandler.ts` → `web/src/components/panels/SystemStats.tsx`.

  What's missing for FP8 routing: **compute capability** (8.9+ → native FP8) and a recommendation field. Add (server-side, in the Python runtime so it sees the live `torch.cuda` device, not just boot-time wheel platform):
  - `device_capability: [int, int] | null` (from `torch.cuda.get_device_capability(0)`)
  - `device_name: str | null` (from `torch.cuda.get_device_name(0)`)
  - `fp8_native: bool` (compute capability ≥ (8, 9))
  - `int8_via_bnb: bool` (`bitsandbytes` import succeeds)
  - `gguf_loader_available: bool` (a Wan2.1-aware GGUF loader is importable — the universal-hardware low-VRAM path used by the `Self-Forcing` node and by `precision = "auto"` on Ampere)
  - `recommended_precision: "fp16" | "fp8" | "gguf" | "int8"` (one helper used by `WeightSource` and by every model node when `precision = "auto"`; also surfaces in the editor as a UI hint, e.g. "FP8 native available" or "Low-VRAM GGUF builds available")

  These extend the existing SystemStats payload (one place to look, one type to update — `vram_total_gb`/`vram_percent` already prove the wiring works). Do not introduce a separate `hardware.py` module that duplicates `torchruntime`'s job; co-locate this with whatever helper currently produces `vram_total_gb`. Output: PR that adds the four fields end-to-end (Python helper → `api-types.ts` → `systemStatsHandler.ts` → `SystemStats.tsx` shows "FP8: yes" line) with one unit test covering each precision-recommendation branch.

*Model nodes (depend on the substrate + realtime nodes + integration + design pass above):*

- [ ] **(First model node) Implement LongLive (Wan2.1 1.3B)** as `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py` (thin node) backed by `nodetool-realtime/src/nodetool/realtime/wan21/longlive_pipeline.py` (fat pipeline) — see the Python integration architecture subsection above for the full layout. Chosen first because it forces the precision/hardware-detection surface to be designed from day one — every subsequent model node clones this template. Source: `https://github.com/NVlabs/LongLive` (Apache 2.0, ICLR 2026, NVIDIA-published, actively maintained). Same warm-state ownership pattern that all Wan2.1 distillations will share (autoregressive state lives on the node instance, freed in `onSessionStop`, cleared in `resetWarmState`).
  - **Why first:** the only Wan2.1 distillation with **official FP8 quantization shipped upstream** — README reports 20.7 FPS on a single H100 at FP16 and 24.8 FPS with FP8 with marginal quality loss; short-window-attention-with-frame-sink adds another 28% inference speedup and 17% lower peak memory vs. the 21-frame baseline. The short-window mechanic is itself inherited from **Self-Forcing** (the underlying Wan2.1 distillation lineage shared across LongLive / StreamDiffusion V2 / MemFlow / RewardForcing), which is the same reason the community pre-quantized weight ecosystem (FP8 / GGUF builds for ComfyUI) loads cleanly into any of these nodes — see the design-pass entry on community quantized weights.
  - **Realistic audience map (revised):** Three independent hardware paths, surfaced via `precision = "auto"`:
    - **Native FP8:** Ada (RTX 40-series) + Blackwell (RTX 50-series) + Hopper (datacenter, compute capability ≥8.9). Hits LongLive's official FP8 numbers above.
    - **GGUF (software dequant):** Ampere (RTX 30-series), Turing, anything modern. The community `Wan2.1-T2V-1.3B-Self-Forcing-DMD-VACE-FP8_e4m3fn` GGUF/FP8 builds were quantized specifically for low-VRAM consumer cards (~6 GB target via ComfyUI workflows) — software dequant on load means the same weights run on cards without hardware FP8. Slower than native FP8 but unlocks the Ampere installed base, which is the volume audience.
    - **FP16:** universal fallback. ~10–12 GB working set; safe everywhere FP16 PyTorch runs.
  - **Node properties:** `prompt` (live, via `nodetool.realtime.Parameter`); `precision` (`"auto" | "fp16" | "fp8" | "gguf" | "int8"`, defaulting to `"auto"` — `gguf` selects a community pre-quantized build via the `WeightSource` resolver from the design pass); `attention_window` (int — exposed because it's a real quality/perf knob); `inference_steps` (LongLive uses few-step sampling); `seed`; `width`/`height`; `guidance_scale`.
  - **Lifecycle:** `onSessionStart` reads the hardware-detection surface (see design pass) → picks precision if `auto` (`fp8` if `fp8_native`, else `gguf` if a community build is cached/available, else `fp16`) → emits `processing_message` "Loading Wan2.1 1.3B base..." with progress → loads weights at chosen precision (download via `ModelsManager` if not cached) → initializes KV cache + RNG → emits "Ready". `process()` runs one autoregressive step per call via `LatestPerHandleAccumulator`. `resetWarmState()` clears KV cache but keeps weights loaded for fast re-arm.
  - **Python deps (added to the new `nodetool-realtime` sister package, NOT to core):** `torch >= 2.1` + CUDA 12.1+ (already required by NodeTool's PyTorch nodes); `transformers`, `diffusers`, `safetensors`, `flash-attn`. FP8 path uses `transformer_engine[pytorch]` (Linux + WSL2 official; Windows-native limited). GGUF path uses `gguf` + a Wan2.1-aware loader (probably `ComfyUI-GGUF`-equivalent code, vendored or pip-from-git — design-pass output). INT8 fallback uses `bitsandbytes`. Shipped as pyproject extras (`nodetool-realtime[fp8]`, `nodetool-realtime[gguf]`, `nodetool-realtime[int8]`) defaulting to FP16-only when none are selected. `nodetool-core` install stays lean — these heavy deps only appear in the sister package.
  - **Cross-platform:** Linux full support; WSL2 full support; Windows-native FP16 + GGUF work, native FP8 install is touchier (likely WSL2 in practice); macOS/MPS out of scope for the first integration.
  - **Upstream packaging decision (record next to this checkbox):** vendor under `nodetool-realtime/src/nodetool/realtime/wan21/vendor/longlive/` vs. pip-from-git pinned to a commit hash vs. git submodule. Recommend pip-from-git for the first integration; promote to vendoring if upstream churns hard.
- [ ] Implement **Self-Forcing (Wan2.1 1.3B)** as `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py` + `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_pipeline.py` — the explicit low-VRAM consumer node, immediately after LongLive. Self-Forcing is the underlying distillation technique LongLive's short-window mechanic is built on — exposing it as its own node makes the **community pre-quantized weight ecosystem** the headline feature instead of a footnote. Specifically targets the `Wan2.1-T2V-1.3B-Self-Forcing-DMD-VACE-FP8_e4m3fn.safetensors` family (and equivalent GGUF builds) that the ComfyUI / Patreon community has been quantizing for **~6 GB VRAM** consumer cards. Notable that this build also bundles VACE — the structural-control adapter ships with the weights, so this single node also covers the depth/scribble/inpaint/outpaint use case for low-VRAM users without depending on the separate streaming-VACE node landing first. Reuses the LongLive node template wholesale (precision auto-selection via the same design-pass surface, lifecycle, accumulator, smoke tests). Worth landing right after LongLive specifically to validate that the `WeightSource` resolver and `gguf` precision path actually work end-to-end on an Ampere card — if it does, we have a real consumer story for Wan2.1 across the entire installed base, not just Ada+ owners.
- [ ] Implement **StreamDiffusion V2 (Wan2.1 1.3B)** as a follow-on after LongLive + Self-Forcing. Reuses the LongLive node template wholesale (precision auto-selection, lifecycle, accumulator, smoke tests). Pure PyTorch, ~20 GB VRAM at FP16, no TensorRT compilation required. TAEHV (tiny autoencoder) shipped for faster decode; **FP8 quantization listed as "to do" upstream but not yet shipped** — VRAM target on a 24 GB card is borderline at FP16 until upstream FP8 lands (or until a community FP8/GGUF build appears, in which case the `WeightSource` resolver picks it up automatically).
- [ ] Implement **MemFlow (Wan2.1 1.3B)**. Cross-frame memory bank lives on the node instance via `ownsWarmState = true`; the existing capability model already covers it (no new flags needed) — `resetWarmState` clears the bank when the operator wants a clean re-start without a full session restart. Performance: 18.7 FPS at 832×480 with only ~7.9% added compute over the base Wan2.1 1.3B (designed as a thin module). **No FP8 path published yet** — research-grade repo, ~10–12 GB working set at 480p (borderline on 12 GB cards; comfortable on 24 GB).
- [ ] Implement **RewardForcing (Wan2.1 1.3B)** — `Reward-Forcing-T2V-1.3B` for short-form (~5 s) video inference. Same warm-state pattern as the other 1.3B distillations. **Newer and less battle-tested:** no quantization story yet, less optimized than LongLive/MemFlow, but worth a node so users can A/B reward-tuned generation against the others. Defer until the first three 1.3B nodes land — same template, low marginal cost.
- [ ] Implement **Krea Realtime (Wan2.1 14B)** as a high-fidelity option. **Hard-warn (not info) below 32 GB VRAM:** consumer-grade RTX 4090 / 5090 max at 24 GB, so this node effectively targets RTX A6000 / RTX 6000 Ada / H100-class hardware. Land the LongLive 1.3B baseline first, validate the substrate end-to-end, then add Krea behind the VRAM gate. Watch for Krea distilled/quantized variants — those would change the audience materially.
- [ ] Implement **streaming VACE** as a structural-control node that wraps any of the Wan2.1 diffusion model nodes above. Adds reference-guided generation, depth/scribble/pose control, inpainting, and outpainting on top of streaming models. Per Daydream's research the same adapter validates across Wan2.1 1.3B and 14B without per-model modifications, with ~20–30% latency overhead and negligible VRAM cost relative to the base model. Land as a single `nodetool.realtime.VACE` node that takes a base diffusion node + a control map (depth / scribble / pose / mask) and a reference image; depends on at least one Wan2.1 model node from above being live so the wrapping contract can be validated.
- [ ] Reuse existing model compatibility and selection for ControlNet-enabled guidance (leveraging existing `ModelsManager` and `UnifiedModel` patterns)
- [ ] Reuse existing model compatibility and selection for LoRA-enabled styling (leveraging existing `ModelsManager` and `UnifiedModel` patterns). **Wan2.1 LoRA portability:** community LoRAs trained on Wan2.1 work across the autoregressive distillations (LongLive, Self-Forcing, StreamDiffusion V2, MemFlow, RewardForcing, Krea Realtime 14B) without per-model retraining — the model selector should expose a single Wan2.1 LoRA pool rather than per-distillation pools.
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
- [ ] Add **WHIP / WHEP** ingest and egress endpoints alongside the existing custom WebSocket signaling — exposes realtime sessions as standards-compliant WebRTC participants so OBS, vMix, hosted broadcast services, and other NodeTool instances can push frames in or pull preview/output out without custom signaling. Sits on the same `RealtimeWebRTCServer` from Phase 2 — adds two HTTP routes (`POST /api/realtime/sessions/:id/whip` and `/whep`) and reuses the existing peer/track plumbing. Pairs naturally with "Chained realtime workflows" (one session's WHEP egress = another's WHIP ingest).
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
- [x] **(1) Extract `RealtimeCommandHandler` from `unified-websocket-runner.ts`** and move `session-manager.ts`/`routes.ts` into `packages/websocket/src/realtime/` — pure refactor, gates the rest of Phase 2 so new realtime work doesn't compound the existing 4,880-line god-class
- [x] **(2) Land the `RealtimeRunner` skeleton** in `packages/kernel/src/realtime-runner.ts` and add the small shared primitives (`runMode` option, bounded ring buffers, init-pipeline accessor) to `runner.ts` — composition over inheritance, gates the long-lived runner work
- [x] **(3) Pick the Node-side WebRTC stack** (`werift` vs `@roamhq/wrtc`) — `werift` chosen (see Phase 2 substrate prerequisite at line 188)
- [x] **(4) Add `overflowPolicy` to `NodeInbox`** with a `"drop_oldest"` variant — landed with per-handle policies, drop counters, and resolution-order plumbing (see line 189)
- [x] **(5) Add `isRealtimeCapable` / `ownsWarmState` / `isMediaAdapter` flags + `onSessionStart`/`onSessionStop`/`resetWarmState` hooks to `BaseNode`** — flags + hooks landed and surfaced through `NodeDescriptor`/`NodeMetadata` (see line 194); runner consumption still pending under step (6)
- [x] **(6) Implement long-lived realtime mode in `RealtimeRunner`** — `startRealtimeMode`/`stopRealtimeMode`/`pushParameter` landed on top of the skeleton from step 2, using the inbox policy from step 4 and the capability flags from step 5; warm-state hooks are wired through `runWarmStateHooks` and bounded ring buffers protect against multi-hour OOMs (commit `0ff45c7b8`)
- [ ] **(6b) Mirror realtime hooks on the Python `BaseNode`** (`is_realtime_capable` / `owns_warm_state` / `is_media_adapter` flags + `on_session_start` / `on_session_stop` / `reset_warm_state` methods) and surface them through the worker's `discover` response — gates every model-node task because Python is where model code lives. See Python integration architecture subsection.
- [ ] **(6c) Extend the stdio bridge protocol with session-scoped verbs** (`start_session` / `update_parameter` / `push_input_frame` / `output_frame` event / `stop_session`) so the worker can hold warm GPU state across many frames. Today's `execute` / `executeStream` shape is one-shot per call and cannot keep weights resident. See Python integration architecture subsection.
- [ ] **(7) Create the first `nodetool.realtime` nodes** (`VideoSource`, `VideoSink`, `AudioSource`/`Sink`, `Parameter`, `SessionInfo`) in a new `packages/realtime-nodes/` package (TS — these don't need PyTorch, they talk to the WebRTC server in-process) — gates the WebRTC server (it needs source nodes to push frames into) and the model nodes. **Decide first inside this step:** frame format contract + package layout / registry discovery (see Phase 2 task)
- [ ] **(8) Stand up the backend WebRTC endpoint** using the stack from step 3 to receive mapped media tracks and feed them into the live graph via `RealtimeRunner.pushInputValue` — replaces the `/realtime` in-browser loopback. Closes the transport-readiness half of the `starting → running` gate by waiting for the WebRTC peer to report `connected` before promoting
- [ ] **(9) Pre-model design pass** — Wan2.1 upstream choice (Scope vs `diffusers` vs research), model-loading lifecycle on the `starting` path (with progress events), `LatestPerHandleAccumulator` utility (in core, alongside the bridge), CPU-only smoke-test pattern, framerate acceptance threshold, **the `WeightSource` resolver for community pre-quantized weights** in the `nodetool-realtime` sister package (FP8 e4m3fn / GGUF builds — the universal-hardware low-VRAM path), and **extending the existing hardware-detection pipeline** (SystemStats payload from `electron/src/torchruntime.ts` + `systemInfo.ts` + `protocol/api-types.ts`) with `device_capability` / `fp8_native` / `gguf_loader_available` / `recommended_precision`. All written-down decisions / one small wiring PR + the `WeightSource` resolver, not full model code; gates step 10
- [ ] **(10) Implement the first model node — LongLive (Wan2.1 1.3B)** in the new sister `nodetool-realtime` Python package (`src/nodetool/nodes/realtime/longlive.py` thin node + `src/nodetool/realtime/wan21/longlive_pipeline.py` fat pipeline) per the design-pass decisions. Chosen first because it has official FP8 upstream, which forces the precision/hardware-detection surface to be designed properly from day one; every subsequent model node (Self-Forcing / StreamDiffusion V2 / MemFlow / RewardForcing / Krea / VACE) clones this template
- [ ] **(10b) Implement Self-Forcing (Wan2.1 1.3B)** in `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py` as the second model node, immediately after LongLive. Validates the `WeightSource` resolver and the GGUF path on Ampere consumer hardware (the volume audience). If this node hits its framerate threshold on a 3060 12 GB, the realtime substrate has a credible low-VRAM consumer story.
- [ ] **(11) Build the canonical realtime video diffusion workflow template** using the capability model — Phase 2 "done when" milestone
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
- [x] Migrate the realtime list/get HTTP endpoints from REST (`packages/websocket/src/realtime/routes.ts`) to a tRPC `realtime` router (`packages/websocket/src/trpc/routers/realtime.ts`) and update `RealtimeSessionClient.listSessions` to use the typed tRPC client. Aligns realtime with the rest of the codebase and removes a one-off `restFetch` call.
  - Added `packages/protocol/src/api-schemas/realtime.ts`, wired a protected `realtime` tRPC router into `appRouter`, switched the web client to `trpcClient.realtime.list.query()`, and removed the now-unused Fastify realtime REST routes registration/file.
- [x] Tighten the `starting` → `running` gate so a silent `beforeRunJob` failure (or any path where `runJob` returns without registering an active job) cannot leave the session stuck in `running`. Cheap fix: in `RealtimeCommandHandler.handleStart`, after `await this.dependencies.runJob(...)`, verify the runner registered the active job before promoting; otherwise call `failSessionStartup`. Revisit fully when the realtime-mode runner extension lands.
  - `RealtimeCommandHandler.handleStart` now fails startup if `runJob(...)` returns without a registered active job, preventing a false `"running"` promotion.
- [x] Add a `pushParameter(name, value)` API on `WorkflowRunner` so `update_realtime_session` can route control-plane updates separately from media chunks once the parameter/control queue exists. Signature: `async pushParameter(name: string, value: unknown): Promise<{ routed: boolean; nodeIds: string[] }>`. Resolves the parameter name against `nodetool.realtime.Parameter` nodes' `name` property, writes the new value as a `ControlEvent` on the `__control__` handle of each match. `RealtimeCommandHandler.handleUpdate` then reports `routed_parameters: string[]` and `unrouted_parameters: string[]` back to the operator (replaces today's all-or-nothing `unrouted_parameters` payload). Until this lands, keep using `pushInputValue`.
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
- **Realtime audio/video analysis → parameter control.** Audio features (RMS, onset, beat, pitch, spectral centroid, classification) and video features (motion energy, optical flow magnitude, pose/face landmarks, scene change, dominant color) tapped off the same `VideoSource`/`AudioSource` inbox and routed into `nodetool.realtime.Parameter` nodes via `pushParameter`. Enables audio-reactive prompts, beat-synced LoRA weight ramps, motion-driven ControlNet strength, etc. Mostly falls out as a set of analysis nodes (`isStreamingInput`, `isRealtimeCapable`) plus a small smoothing/mapping helper node — no new substrate needed once parameter routing exists.
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

## Use case ideas

End-user scenarios that become possible once Phase 2/3 lands. Not commitments — concrete examples to ground the design and the model/library choices below. Each names the architectural pieces it leans on.

**Live performance & VJ**

- **Audio-reactive AI VJ.** DJ feed → audio analysis nodes → `pushParameter` → diffusion strength, LoRA blend, prompt fade. Output to Resolume / TouchDesigner / projector via NDI/Spout. The whole rig is one workflow, editable live in the editor's realtime mode while it runs.
- **Dancer-driven generation.** Camera in, pose + motion-energy analysis taps the same `VideoSource` inbox, motion intensity ramps a curated LoRA library and ControlNet pose strength. The dancer is a knob.

**Live broadcast & streaming**

- **Selective restyling.** Person mask keeps the anchor photoreal; background gets diffused in any chosen style. Standard nodes (matting, mask, diffusion, composite) on the realtime substrate, no special infra.
- **Live inpainting / outpainting / reference-guided streams.** Once the streaming VACE node lands, the broadcast is no longer "diffuse the whole frame" — selectively replace just the wall behind the host, keep the product on the table, extend the canvas beyond the camera frame, all driven by a reference image and a mask, all live.
- **Streaming captions + style coupling.** LLM caption nodes run on the same control plane; audio emotion classification feeds a Parameter that warms/cools the palette in sync. The control-plane vs media-plane split is what makes this tractable.

**Telepresence & collaboration**

- **Multi-operator director's chair.** Multiple browsers attach to one `session_id` — one drives the prompt box, one moves a slider, one swaps LoRAs. All standard `pushParameter` traffic on the existing websocket.
- **Remote production.** Producers in different cities each hold one parameter strip. The graph is shared; parameter ownership is per-operator.

**Game / interactive**

- **Game capture restyling.** Spout in (game) → diffusion → Spout out (to OBS, projection, second window). Parameter automation tied to in-game OSC events: boss appears, palette shifts.
- **Live mocap-to-avatar.** Webcam pose → ControlNet → character LoRA → live avatar feed for streamers, all in one browser tab.

**Installations & permanent art**

- **Headless gallery install.** No browser at all: NDI in from a sensor camera, MIDI/OSC in from environmental sensors, Spout out to the projector. Just the runtime + a graph + adapter nodes.
- **Bio-reactive painting.** Heart rate or EEG over OSC → smoothing node → Parameter → diffusion strength.

**Education & accessibility**

- **Live drawing/coding coach.** Webcam on the student's hand or screen; vision-LLM produces feedback at low rate; the realtime UI surfaces tips next to a still-running diffusion of an "ideal" reference. Two rates sharing one session — exactly what the parameter/media plane split was designed for.
- **Realtime sign translation.** Webcam → pose model → translation LLM → TTS audio out the WebRTC sink. End-to-end on standard nodes once `AudioSink` exists.

**Authoring superpowers**

- **Production = live, but pre-rendered.** Feed a music file as the "live" source and a parameter timeline scheduled against the beat. Same workflow you use for the live show renders the music video offline. One graph, two delivery modes.
- **Self-balancing agent.** A `nodetool-chat` agent calls `start_realtime_session`, subscribes to `realtime_metrics`, and downshifts (smaller LoRA, lower resolution, more aggressive `drop_oldest`) when fps slips. Quality adapts to load without a human in the loop.
- **Workflow as MIDI device.** Because parameters are addressable by name and `pushParameter` is one call, a NodeTool workflow becomes a controllable instrument that any MIDI/OSC controller, agent, web hook, or script can drive.

The unifying thread: every use case is built from **existing NodeTool primitives + the Phase 2 substrate + a small set of realtime-capable model/utility nodes** — not a new app per scenario. The list of model/library candidates that make these realistic is below.

## Reference: realtime-capable models & libraries

Sorted by **integration cost vs. impact ratio**: top items are quick wins that unlock many use cases; bottom items are heavier, narrower, or platform-specific. Treat this as a shopping list for `realtime-vision`, `realtime-audio`, `realtime-vlm`, etc. node packages — not as commitments to wrap all of them.

Realtime-suitability flags: ✅ tested realtime (>20 fps for video, <200 ms for audio/text), ⚠️ realtime under TensorRT/quantization, ❌ not realtime (do not use for hot-path nodes).

**TensorRT posture.** The diffusion baseline targets in this plan (LongLive first, then StreamDiffusion V2 / MemFlow / Krea — all Wan2.1 distillations) are **pure PyTorch on purpose** — StreamDiffusion v1 was deferred specifically because of TensorRT compilation friction. Apply the same preference everywhere below: pick libraries with a usable PyTorch / ONNX Runtime path first; treat ⚠️ "with TRT" entries as acceptable to ship without the TRT step (just slower) and reserve real TRT work for the final-mile optimization entry (#26).

### Tier 1 — Quick wins, broad impact (start here)

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 1 | **OpenCV (cv2 / opencv4nodejs)** | Resize, color spaces, blur, contours, frame diff, compositing, Farneback flow | ✅ (CPU/GPU) | Apache 2.0 | Foundation utility nodes; Python preferred for GPU (`cv2.cuda_GpuMat`), Node for operator-side ops |
| 2 | **Meyda** | Browser-side audio features (RMS, spectral centroid, onset, MFCC) via Web Audio API | ✅ (~86×/sec) | MIT | Operator-UI hook; enables audio-reactive parameters with no server |
| 3 | **Aubio** | Server-side onset / pitch / beat / tempo / MFCC | ✅ | GPL-3.0 | `realtime-audio.AudioAnalysis` Python node |
| 4 | **MediaPipe (Pose, Holistic, Face Mesh, Hands)** | Pose / face / hand landmarks, single-person | ✅ (30+ fps CPU) | Apache 2.0 | `realtime-vision.Pose` etc.; also has JS bindings — can run client-side in the operator browser |
| 5 | **YOLO11 (det / seg / pose)** | Class-aware detection, segmentation, pose | ✅ (1.5–16 ms on T4 TRT) | AGPL-3.0 (Ultralytics) | `realtime-vision.Detect`/`Segment`/`Pose`; AGPL means the wrapping package may need separation |
| 6 | **Kokoro 82M TTS** | Streaming TTS, MOS 4.2, RTF 0.03, 48 voices, 9 languages | ✅ (23× realtime) | Apache 2.0 | `realtime-audio.TTS`; also has `StreamingKokoroJS` for browser via WebGPU |
| 7 | **Moonshine STT** | Streaming speech-to-text, 100 ms latency, beats Whisper Large v3 | ✅ | MIT | `realtime-audio.STT` — gates voice control and live captions |
| 8 | **Depth Anything V3 (Small / Base / Metric-Large)** | Monocular depth | ✅ Small in PyTorch (≈15–25 fps, model-dependent); ⚠️ 30 fps @ 504² needs TRT FP16 | Apache 2.0 (Small/Base/Metric); CC-BY-NC for Giant | `realtime-vision.Depth` — ship the PyTorch path first; TRT is later optimization |

### Tier 2 — High impact, slightly more setup

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 9 | **RVM (Robust Video Matting)** | Person/portrait alpha matte, recurrent (temporal), 4K @ 76 FPS / HD @ 104 FPS on GTX 1080 Ti | ✅ | GPL-3.0 | `realtime-vision.PersonMatte` — primary "selective restyling" enabler; ONNX/TF.js/CoreML available |
| 10 | **ControlNet preprocessors** (OpenPose / Depth / Canny / HED / Color) | Standalone condition-map generators (pose, depth edges, line art, color blocks) | ✅ (preprocessors run in PyTorch, no TRT) | mixed permissive | `realtime-controlnet.*` preprocessor nodes. Note: pairing with the diffusion target is a separate question — Wan2.1 (StreamDiffusion V2) ControlNet adapters are still maturing; in the meantime the preprocessor outputs are useful as masks, overlays, or condition signals into other nodes. Do **not** pull in the SD1.5 StreamDiffusion v1 ControlNet pipeline (TRT compilation, deferred). |
| 11 | **Moondream 0.5B / 3 / Photon** | Vision-language captioning + reasoning over live frames | ✅ Photon (60+ inf/sec H100); ⚠️ 0.5B (a few fps) | Apache 2.0 (open variants); Photon paid | `realtime-vlm.Moondream` — enables AI commentary, drawing coach, scene description |
| 12 | **SmolVLM 256M / 500M** | Tiny VLM that runs **in the browser** via Transformers.js, 40–80 tok/sec | ✅ (browser) | Apache 2.0 | Operator-side captioner — zero server round-trip |
| 13 | **SAM 2 (streaming video predictor)** | Click/box-prompted any-object segmentation with temporal memory | ✅ | Apache 2.0 | `realtime-vision.Segment` — interactive masks; foundation for selective effects beyond person matting |
| 14 | **Piper TTS** | Edge TTS, sub-100 ms latency, RTF 0.008, <100 MB on CPU | ✅ | MIT | `realtime-audio.TTS` for installations / RPi-class hardware (lower naturalness, much faster) |
| 15 | **Distil-Whisper large-v3** | 6× Whisper, batch transcription | ✅ batch only | MIT | Companion to Moonshine — post-show transcripts, batch alongside live |

### Tier 3 — Narrower or specialized

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 16 | **GMFlow** | Neural optical flow, 26 ms / frame on A100 | ✅ (high-end GPU) | Apache 2.0 | Only when motion-energy from cv2 isn't expressive enough; otherwise prefer `cv2.calcOpticalFlowFarneback` |
| 17 | **MobileSAM / EfficientTAM** | Lightweight SAM variants for mobile / browser segmentation | ✅ | Apache 2.0 | Edge fallback when SAM 2 server-side isn't available |
| 18 | **MediaPipe Face Mesh + DeepFace / RealtimeFER** | 7-class emotion detection or valence/arousal from landmarks | ✅ (60+ fps) | Apache 2.0 / MIT | `realtime-vision.Emotion` — affect-driven parameters; off-the-shelf labels are noisy, prefer landmarks → custom head |
| 19 | **F5-TTS / XTTS v2** | Voice cloning from 6 s reference | ⚠️ (RTF 0.18, short clips OK) | CPML (F5) / non-commercial; XTTS Coqui non-commercial | Premium voice node; not for continuous narration |
| 20 | **MonarchRT** (Wan2.1) text-to-video | Realtime autoregressive text-to-video, 16 FPS | ⚠️ | various | Alternative model node alongside StreamDiffusion / LongLive / MemFlow |

### Tier 4 — Substrate / platform / heavy (mostly already in the plan)

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 21 | **werift** (preferred) / `@roamhq/wrtc` | Node-side WebRTC stack | ✅ | Apache 2.0 / MIT | Phase 2 substrate prerequisite (already in plan) |
| 22 | **PyAV (FFmpeg)** | Codec / container handling for the WebRTC frame router | ✅ | BSD-3 | Backend frame router |
| 23 | **PyVideoProc** | CUDA-accelerated multi-stream decode → infer → encode pipeline | ✅ | BSD-2 | Reference for headless / server realtime mode (Phase 4) |
| 24 | **NDI / Spout / Syphon native bindings** | Pro AV interop adapters | ✅ | platform-specific | Phase 4 adapter nodes (already on roadmap) |
| 25 | **Krea Realtime 14B** (and likely distilled/smaller variants when they ship) | High-fidelity diffusion alternative to the 1.3B baseline | ⚠️ (32 GB+ VRAM today; reachable for many users on a 4090/5090/A6000) | various | **Fast-follow after the 1.3B baseline (line 240).** Not blocked by anything beyond proving the substrate end-to-end with the smaller model first; pull it forward as soon as a user case calls for the quality bump. Watch for distilled/quantized variants from Krea — those would shift this entry up a tier. |
| 25b | **FLUX.2 Klein / Hyper-SDXL** and other large diffusion variants | Premium fidelity, larger memory budget | ⚠️ (varies, mostly 24–32 GB+) | various | Exploratory — slot in as additional model nodes once the substrate is proven; same VRAM-aware validation pattern as Krea 14B. |
| 26 | **Custom TensorRT / CUDA kernels** | Final mile of latency optimization for any of the above | — | — | Only when profiling proves a bottleneck the upstream library can't address |

### Not realtime — do not use for hot-path nodes

Listed so future contributors don't reach for them by reflex:

- **Bark** TTS (RTF 0.85), **Whisper Large v3 sequential** (11 s per phrase on MacBook).
- **Mask R-CNN, U-Net, DETR, MaskFormer, OneFormer** for video (2–15 fps).
- **MASt3R, RoMa** dense correspondence (seconds per frame).
- **FlowFormer** (slower than GMFlow without accuracy gain).
- **DA3-Giant, DA3-Nested, Depth Anything Giant** (research-grade resolution, not realtime).
- **Essentia BPM extractor** (whole-track, batch only — use Aubio for live).
- **librosa** for streams (works frame-by-frame but Aubio/Meyda are purpose-built and much cheaper).

These are all *fine* in standard NodeTool workflows for offline/batch tasks — just not behind the `isRealtimeCapable` flag.

### Suggested package layout

To keep the realtime namespace small and let environments install only what they need (mirrors the existing `replicate-nodes` / `fal-nodes` separation):

- `packages/realtime-nodes/` — substrate (Source / Sink / Parameter / SessionInfo) per Phase 2
- `packages/realtime-vision/` — DA3, SAM 2, RVM, YOLO11, MediaPipe wrappers
- `packages/realtime-audio/` — Aubio analysis, Moonshine STT, Kokoro/Piper TTS
- `packages/realtime-controlnet/` — the five SD2.1 ControlNet preprocessors wired into the diffusion node
- `packages/realtime-vlm/` — Moondream / SmolVLM
- `packages/realtime-adapters/` — NDI / Spout / Syphon / MIDI / OSC (Phase 4 home)

A VJ rig wants `realtime-audio` + `realtime-vision` + `realtime-controlnet`. An installation wants `realtime-adapters`. A captioner wants `realtime-vlm` + `realtime-audio`. The substrate is required by all.
