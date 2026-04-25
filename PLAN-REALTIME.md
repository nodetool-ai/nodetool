# Realtime Integration Roadmap for NodeTool

## Status

- [x] Review current workflow streaming, mini-app, editor, and preview architecture
- [x] Confirm clean-room requirement
- [x] Add initial realtime session substrate
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start, update, and stop session (plus `signal_realtime_session` for WebRTC)
  - [x] tRPC endpoints for listing and fetching sessions
  - [x] Frontend realtime session client and store
  - [x] Basic `/realtime/:workflowId?` page and local preview
- [x] Phase 1 foundation
- [ ] Phase 2 first proof
- [ ] Phase 3 workflow integration
- [ ] Phase 4 expansion adapters

## How to use this plan now

Implement from **Next implementation ladder** downward. Earlier sections capture context and frozen contracts; do not re-decide them unless implementation evidence proves they are wrong.

Rules for the remaining work:

- Keep realtime behavior out of `packages/websocket/src/unified-websocket-runner.ts` and `packages/kernel/src/runner.ts`; those files only get small delegation or primitive changes.
- Use the existing workflow runner, inbox, node registry, WebSocket control plane, and job/session model.
- Treat WebRTC/media transport and websocket/control messages as separate planes.
- Prefer short PRs in ladder order. Each step should leave tests passing for the package it touches.

## Next implementation ladder

- [ ] **7a. Wire `RealtimeRunner` into production realtime sessions.**
  - `UnifiedWebSocketRunner.runJob` currently creates `WorkflowRunner` directly; add a realtime-specific path used by `start_realtime_session`.
  - Active realtime jobs should hold a `RealtimeRunner` shell plus its composed `WorkflowRunner`, so command routing still exposes `pushInputValue` / `pushParameter`.
  - Pass the real `RealtimeSessionRecord` / trimmed `RealtimeSessionInfo` into `RealtimeRunner.startRealtimeMode`; hooks must see the real `session_id`, `transport`, `parameters`, and `media_tracks`.
  - Stop reconstructing session info from `RunJobRequest` (`session_id = job_id`, `transport = "websocket"`, empty `media_tracks`).
  - Add TS tests for the production websocket path and for `transport: "webrtc"` + mapped track metadata reaching `onSessionStart`.
- [ ] **7b. Add TS realtime frame types.**
  - Create `packages/protocol/src/realtime-frame.ts`.
  - Export `VideoFrame`, `AudioFrame`, and `RealtimeFrame` from `@nodetool/protocol`.
  - Mirror these dataclasses in `nodetool-core/src/nodetool/workflows/realtime.py`.
- [ ] **7c. Create `packages/realtime-nodes/`.**
  - Add package files, root workspace entry, `tsconfig.build.json` reference, and package dependencies.
  - Export `registerRealtimeNodes(registry)` and wire it into CLI/websocket registry boot paths.
- [ ] **7d. Implement first `nodetool.realtime` nodes.**
  - `VideoSource`, `VideoSink`, `AudioSource`, `AudioSink`, `Parameter`, `SessionInfo`.
  - Add loopback tests for frame routing, drop-oldest behavior, parameter routing, and lifecycle hooks.
- [ ] **8a. Spike server-side WebRTC before committing to full integration.**
  - Prove browser/node offer-answer, inbound RTP/frame assembly, pixel decode to `VideoFrame`, outbound encode/packetization, and clean teardown.
  - `werift` supports WebRTC, RTP, and codec payload parsing, but payload parsing is not the same as guaranteed pixel decode/encode. Treat codec handling as the risky part of the spike.
  - If `werift` cannot expose decoded/encoded frames cleanly enough, switch to `@roamhq/wrtc` or isolate a codec bridge before building the full server.
- [ ] **8b. Stand up `RealtimeWebRTCServer` and `frame-router`.**
  - Own per-session peers, SDP/ICE handling, track mapping, frame decode/encode, outbound sink tracks, and metrics.
  - Replace the `/realtime` in-browser loopback with one operator peer connected to the backend.
- [ ] **8c. Tighten realtime lifecycle and teardown.**
  - `starting → running` waits for runtime startup plus WebRTC readiness when `transport: "webrtc"`.
  - Add TS stop timeout/cancellation so `stopRealtimeMode()` cannot hang forever on long-lived nodes.
  - Keep stopped/error sessions visible long enough for history/reconnect; add a sweeper instead of immediate deletion.
- [ ] **8d. Add `realtime_metrics`.**
  - Add the control-plane message in `packages/protocol/src/messages.ts`.
  - Emit fps, queue depth, dropped frames, and peer state every ~500 ms.
  - Feed the store and `SessionInfo` node from the same data.
- [ ] **9. Pre-model design pass.**
  - Pick Wan2.1 upstream source.
  - Define model-loading progress events.
  - Add `LatestPerHandleAccumulator`.
  - Define CPU-only model-node smoke tests.
  - Set framerate acceptance thresholds.
  - Add `WeightSource` in `nodetool-realtime`.
  - Extend SystemStats with realtime precision/hardware hints.
- [ ] **10. Implement LongLive.**
  - Thin node in `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py`.
  - Heavy pipeline in `nodetool-realtime/src/nodetool/realtime/wan21/longlive_pipeline.py`.
  - Use the frame contract, loading lifecycle, hardware precision hints, `WeightSource`, and smoke-test pattern from step 9.
- [ ] **10b. Implement Self-Forcing.**
  - Validate GGUF/community pre-quantized weights on Ampere/low-VRAM hardware.
  - Treat community Self-Forcing/VACE FP8/GGUF weights as experimental until license, provenance, and quality are checked for the exact selected source.
- [ ] **11. Build the canonical realtime workflow template.**
  - Camera/source → parameter controls → LongLive/Self-Forcing → sink/preview.
  - Include reconnect/session behavior, metrics display, and save/export hooks where available.

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
- **Substrate lives in core; model nodes live in `nodetool-realtime`.** Core owns runner/session/WebRTC substrate, TS I/O nodes, protocol frame types, bridge verbs, lifecycle hooks, and hardware hints. `nodetool-realtime` owns heavy Python model code, `WeightSource`, Wan2.1 pipelines, GGUF loading, and ML dependencies. This keeps base installs lean and lets model nodes release independently.

- **Contract** see nodetool/docs/realtime-runtime-contract.md

## Core Technical Assumptions & Mechanics

Based on research into high-performance real-time generative video systems (like StreamDiffusion and `daydreamlive/scope`), the architecture must incorporate the following mechanics to ensure low latency and stability:

1. **Async I/O vs. Synchronous Inference Boundary:** The WebRTC media transport and WebSocket control plane MUST run in an async event loop (or dedicated thread) that is strictly isolated from the synchronous inference/execution loop. If heavy node execution blocks the network loop, WebRTC connections will stutter or drop.
2. **Queue-Based Backpressure (Latest-Frame-Wins):** The boundary between the network layer and the execution graph must use bounded, thread-safe queues. When a queue is full, the system must drop the oldest frame and insert the newest one. This ensures the inference engine is always processing the most recent data, minimizing perceived latency.
3. **Separation of Parameter and Media Queues:** Control signals (UI slider changes, prompt updates) should flow through a dedicated parameter queue or state object, separate from the high-volume media queues. This ensures control updates are applied immediately on the next execution cycle, rather than waiting behind a backlog of video frames.
4. **WebRTC Bitrate Tuning:** Default WebRTC bitrates are tuned for video conferencing (e.g., 1-2 Mbps), which degrades generative AI output quality. The WebRTC implementation must be explicitly configured for high maximum bitrates (e.g., 5-10 Mbps) and hardware-accelerated codecs.

## External assumption checks

- **LongLive:** NVlabs LongLive is public, Apache 2.0, Wan2.1-based, and reports 20.7 FPS on one H100 plus 24.8 FPS with FP8 quantization. Keep exact FPS claims tied to upstream hardware, not consumer GPUs.
- **Native FP8:** NVIDIA Transformer Engine documents FP8 support on Ada/Hopper/Blackwell with compute capability 8.9+. Ampere should route to GGUF/FP16/INT8 fallbacks.
- **WebRTC bitrate:** browser sender bitrate should be tuned via `RTCRtpSender.getParameters()` → mutate `encodings[0].maxBitrate` → `setParameters()`, with Safari/Firefox fallback handling.
- **werift:** good Node-first choice for WebRTC/RTP, but pixel decode/encode still needs a spike before full implementation.
- **Self-Forcing community weights:** FP8/GGUF low-VRAM artifacts exist, including ComfyUI-oriented 6 GB VRAM workflows, but treat them as experimental until source, license, and quality are validated.

## Current code reality

- Realtime session start creates a linked `job_id`, accepts unsaved graph payloads, and starts a workflow-backed runtime.
- `RealtimeRunner` exists and composes `WorkflowRunner`, but the websocket production path still creates `WorkflowRunner` directly. Step 7a wires the realtime shell into production.
- `pushParameter(name, value)` routes live control updates to `nodetool.realtime.Parameter` nodes.
- `/realtime` is still an incubation page. It proves browser capture and signaling, but media is not yet delivered into the backend graph.
- Server-side WebRTC termination, frame routing, metrics, stop timeouts, and reconnect/session-retention semantics are still pending.
- `RealtimeAudioInput` shows the existing streaming-input pattern; `VideoInput` remains an asset/reference input, not a live media source.

## Existing event-driven primitives we build on

The realtime runner is an **extension of existing primitives**, not a parallel system. Before adding new machinery, reuse:

- **`isStreamingInput=true` + `async run(inputs, outputs, ctx)`** (`packages/kernel/src/actor.ts`, `packages/kernel/src/io.ts`). A node implements its own loop and drains the inbox via `NodeInputs.any()` / `NodeInputs.stream(handle)`. Canonical example: `ManualTriggerNode` in `packages/base-nodes/src/nodes/triggers.ts` — runs forever, processes each event pushed via `pushInputValue`, emits via `NodeOutputs.emit`. This is the pattern realtime media source nodes should follow.
- **`isStreamingOutput=true` + `async *genProcess()`**. A node yields outputs over time (e.g. `IntervalTriggerNode`'s `while (true) { … yield … }`). Suitable for clock/tick/heartbeat nodes inside a realtime graph.
- **`isControlled` + `_runControlled`** (`packages/kernel/src/actor.ts`). A node waits for `ControlEvent` items on the `__control__` handle, fires processing on each event, terminates on `stop`. Suitable for parameter/control-driven nodes whose data inputs are cached and replayed each tick.
- **`NodeInbox(bufferLimit)`** (`packages/kernel/src/inbox.ts`) supports per-handle buffer policy, including drop-oldest / latest-frame-wins behavior.
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

- [x] **Extract `RealtimeCommandHandler` from `unified-websocket-runner.ts`.** Pure refactor — moved the four realtime command cases into `packages/websocket/src/realtime/command-handler.ts` (with the session manager + REST routes), with `UnifiedWebSocketRunner` delegating through a small dependency interface. Why first: all subsequent Phase 2 work lands in the new module rather than further inflating the 4,880-line god-class.
- [x] **Decide runner extension shape: composition over inheritance.** Landed `packages/kernel/src/realtime-runner.ts` exporting a `RealtimeRunner` class that holds (composes) a `WorkflowRunner`. Small shared primitives live in `runner.ts`: `runMode?: "one_shot" | "realtime"`, bounded realtime buffers for `_messages`/`_outputs`, and a public `initializeForRealtime(...)` accessor exposing the existing init pipeline so the realtime entry point can drive init without entering the standard run loop.

*Substrate prerequisites (in-runner primitives — do these next, in order):*

- [x] **Pick the server-side WebRTC stack (Node-first).** Chose `werift@^0.22.9` (pure TypeScript, no native build step — materially lower friction for macOS/Windows/Linux + Electron than `@roamhq/wrtc`, and keeps the media/control path in JS so the frame router can inspect frames without crossing a native boundary). Fallback: `@roamhq/wrtc`; Python `aiortc` only if both Node options miss the realtime target.
- [x] **Add latest-frame-wins inbox policy.** `NodeInbox` (`packages/kernel/src/inbox.ts`) now accepts per-handle policies with `overflowPolicy: "block" | "drop_oldest" | "drop_newest"` + `capacity`, tracks per-handle drop counters, and resolves policies in order: global `WorkflowRunnerOptions.bufferLimit` → `BaseNode.inputBufferPolicy` static → per-edge override via `Edge.metadata`. Wired through `_initializeInboxes()` in `runner.ts`. Default for the realtime source nodes (`{ capacity: 2, overflowPolicy: "drop_oldest" }`) attaches when those nodes land in step (7).
- [x] **Add realtime capability flags + lifecycle hooks to `BaseNode`.** Landed `static readonly isRealtimeCapable / ownsWarmState / isMediaAdapter` (default false) + `async onSessionStart(ctx, session)` / `async onSessionStop(ctx, session)` / `resetWarmState()` instance hooks on `packages/node-sdk/src/base-node.ts`. Surfaced through `NodeDescriptor` / `NodeMetadata` / graph resolver as `is_realtime_capable` / `owns_warm_state` / `is_media_adapter`; `Graph.loadFromDict()` prefers registry truth over stale saved values. Supporting types exported as `ExecutionContext` (`@nodetool/runtime`) and `RealtimeSessionInfo` (`@nodetool/protocol`).
- [x] **Implement the long-lived realtime mode in `RealtimeRunner`.** *(commit `0ff45c7b8`.)* `RealtimeRunner` holds a `WorkflowRunner` constructed with `runMode: "realtime"` and orchestrates lifecycle on top of it. **Entry point** `startRealtimeMode(request, graphData)` calls `initializeForRealtime`, runs `resetWarmState` + `onSessionStart` on every `ownsWarmState` node, then `startBackgroundProcessing(params)` and holds the processing promise. **Tick model:** realtime nodes are `isStreamingInput=true` with their own `run()` loops (existing `ManualTriggerNode` pattern); the runner does **not** drive a tick clock — each `pushInputValue` from the frame router wakes the source node's `for await`. **Teardown** `stopRealtimeMode()` calls `finishInputStream` on every `getMediaAdapterInputNames()`, awaits the held promise, runs `onSessionStop` on warm-state nodes, returns a `RunResult` snapshot. **Bounded growth:** `_messages` / `_outputs` use a FIFO bounded buffer in realtime mode so multi-hour sessions don't OOM. **Parameter API:** `pushParameter(name, value)` delegates to `WorkflowRunner.pushParameter`, which resolves to `is_controlled` nodes and writes a `ControlEvent` on `__control__`, falling back to `pushInputValue` for non-controlled nodes; `RealtimeCommandHandler.handleUpdate` reports `routed_parameters` + `unrouted_parameters`. **Still pending:** WebRTC-server wiring (`RealtimeWebRTCServer.start`) and the transport-readiness half of the `starting → running` gate — both tracked under the WebRTC integration task below.

*Python integration architecture (Python-side substrate — both items below are shipped; the authoritative API + wire-format contract lives in the next section, "Realtime substrate surface — frozen contract"):*

- [x] **Mirror the realtime hooks on the Python `BaseNode`.** *(done — `nodetool-core` commit `dcce722e`.)* `BaseNode` exposes `is_realtime_capable()` / `owns_warm_state()` / `is_media_adapter()` classmethods + async `on_session_start` / `on_session_stop` / `reset_warm_state` hooks; `node_to_metadata` surfaces the flags so the TS-side registry sees identical truth. Tests in `tests/workflows/test_base_node_realtime.py`. **Detailed surface: see "Python `BaseNode` realtime surface" below.**
- [x] **Extend the stdio bridge protocol with session-scoped verbs.** *(done — Python `nodetool-core` commits `6db11296` + `8799a767`; TS `nodetool` commits `922243675` + `fb6f7c2e8`. The second commit on each side aligned the wire format between the ends.)* Added four request/response verbs (`start_session`, `update_parameter`, `push_input_frame`, `stop_session`) plus a `realtime_output_frame` server-pushed event, all msgpack-framed on the existing length-prefixed transport (no transport change). The worker now holds warm GPU state across many frames. **Authoritative wire-level contract + Python module map + TS-side surface: see the section immediately below.**

### Realtime substrate surface — frozen contract (read this first, no `nodetool-core` checkout required)

The Python-side substrate that the TS bridge talks to lives entirely in `nodetool-core` (see commits `dcce722e`, `6db11296`, `8799a767` on `feat-realtime-core`). Everything below is **shipped, tested, and frozen** — drift here is a breaking protocol change. Agents working in this repo (`nodetool/`) on the next-task ladder (server-side WebRTC endpoint, frame router, model nodes in `nodetool-realtime`) can rely on this surface without reading the Python source.

#### Where it lives (Python side, in `nodetool-core/src/`)

| Module | What it contains | TS-side counterpart |
|---|---|---|
| `nodetool/workflows/realtime.py` | `RealtimeMediaTrack`, `RealtimeSessionInfo` dataclasses + `RealtimeSessionInfo.from_dict()` | `RealtimeMediaTrackPayload` / `RealtimeSessionInfoPayload` in `@nodetool/runtime` |
| `nodetool/workflows/base_node.py` | `BaseNode` realtime capability flags + lifecycle hooks (see below) | `BaseNode` static flags + instance hooks in `@nodetool/node-sdk` |
| `nodetool/workflows/inbox.py` | `NodeInbox.put_nowait_drop_oldest(handle, item, capacity, metadata?)` — non-blocking enqueue with drop-oldest backpressure for realtime media | `NodeInbox` + `inputBufferPolicy` in `@nodetool/kernel` |
| `nodetool/worker/realtime_session.py` | `RealtimeNodeInstance` — one warm `BaseNode` + `gen_process` task per live session; `DEFAULT_INPUT_BUFFER_SIZE = 2`, `DEFAULT_STOP_TIMEOUT = 5.0` | `PythonRealtimeSession` (TS wrapper, one per session) in `@nodetool/runtime` |
| `nodetool/worker/stdio_server.py` | `StdioWorkerServer` — verb dispatch (`_handle_start_session` / `_handle_update_parameter` / `_handle_push_input_frame` / `_handle_stop_session`) + `realtime_output_frame` emit; `_realtime_sessions: dict[str, RealtimeNodeInstance]` | `PythonStdioBridge.startRealtimeSession` / `updateRealtimeParameter` / `pushRealtimeInputFrame` / `stopRealtimeSession` in `@nodetool/runtime` |
| `nodetool/worker/node_loader.py` | `node_to_metadata()` serializes `is_realtime_capable` / `owns_warm_state` / `is_media_adapter` flags onto every Python node descriptor | `PythonNodeMetadata` in `@nodetool/runtime` carries the same fields |
| `nodetool/worker/context_stub.py` | `WorkerContext(ProcessingContext)` — the actual context type passed to `on_session_start` / `on_session_stop` in the worker process (see "Worker context surface" below) | n/a (worker-internal) |

> Naming sanity-check (asked during review): `inbox.py` is the right name — it has been the location of the streaming `NodeInbox` class since the inbox primitive landed and is the same name used by the TS `inbox.ts` it mirrors. `realtime_session.py` houses `RealtimeNodeInstance` (one warm instance per live session — the name reflects "the worker-side state for one realtime session"); the broader concept "session" lives on the TS-side `RealtimeSessionRecord`. Don't rename either.

#### Python `BaseNode` realtime surface (what node authors override)

```python
class BaseNode(BaseModel):
    # Capability flags — mirror the TS-side `static readonly is*` properties.
    # Defaults are False so non-realtime nodes are unaffected.
    _is_realtime_capable: ClassVar[bool] = False
    _owns_warm_state: ClassVar[bool] = False
    _is_media_adapter: ClassVar[bool] = False

    @classmethod
    def is_realtime_capable(cls) -> bool: ...
    @classmethod
    def owns_warm_state(cls) -> bool: ...
    @classmethod
    def is_media_adapter(cls) -> bool: ...

    # Lifecycle hooks — defaults are no-ops; override on realtime-capable nodes.
    # `context` is typed `Any` so the worker can pass a `WorkerContext` (subset
    # of ProcessingContext available inside the stdio worker process) without
    # forcing every node to import the full ProcessingContext type. `session`
    # is the `RealtimeSessionInfo` snapshot below.
    async def on_session_start(self, context, session: RealtimeSessionInfo) -> None: ...
    async def on_session_stop(self, context, session: RealtimeSessionInfo) -> None: ...
    def reset_warm_state(self) -> None: ...
```

#### Python session value types (`nodetool.workflows.realtime`)

```python
@dataclass(slots=True)
class RealtimeMediaTrack:
    track_id: str
    kind: str          # "audio" | "video"
    node_id: str       # graph node that consumes this track
    input_name: str    # input handle name on that node

@dataclass(slots=True)
class RealtimeSessionInfo:
    session_id: str
    workflow_id: str | None
    transport: str     # "websocket" | "webrtc"
    parameters: dict[str, Any] = field(default_factory=dict)
    media_tracks: list[RealtimeMediaTrack] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RealtimeSessionInfo":
        # Tolerant of missing optional fields (parameters / media_tracks)
        # so partial payloads from older bridges don't crash node startup.
```

These mirror a deliberately trimmed subset of the TS `RealtimeSessionRecord` (`packages/protocol/src/api-schemas/realtime.ts`) — the worker only carries what a node would actually inspect. Orchestration-only fields (`status`, `signaling`, `created_at`, `updated_at`, `label`, `enabled`) are intentionally absent.

#### Worker context surface (what `context` actually is in `on_session_start`)

`StdioWorkerServer` constructs `ctx = WorkerContext(secrets={...}, cancel_event=asyncio.Event())` (`nodetool/worker/context_stub.py`). `WorkerContext` subclasses `ProcessingContext` but only `secrets` lookup (`get_secret(key)` / `get_secret_required(key)`) and `cancel_event` are guaranteed-functional inside the worker process. **Do not** assume the storage / database / asset-server / messaging surfaces of a full `ProcessingContext` are available — those will raise or no-op. Realtime model nodes should treat `context` as "secrets bag + cancellation token" only; pass anything else through `session.parameters` or via the bridge.

#### Wire-format contract (canonical — TS bridge ⇄ Python worker)

All frames are msgpack-framed on the existing length-prefixed stdio transport. Every message has a `type` field; request/response messages add `request_id`; the body is always nested under `data` (matches the rest of the bridge protocol — `result` / `error` / `chunk` / `progress` use the same envelope).

```jsonc
// 1. start_session — request
{ "type": "start_session", "request_id": "<uuid>", "data": {
    "session_id": "<routing key, must equal session.session_id>",
    "session": {
      "session_id": "<id>",
      "workflow_id": "<id|null>",
      "transport": "websocket"|"webrtc",
      "parameters": { ... },              // optional
      "media_tracks": [ {"track_id":"...","kind":"video","node_id":"...","input_name":"..."}, ... ]
    },
    "node_type": "<fully-qualified Python node type>",
    "fields":  { ... },                   // optional, applied via assign_property
    "secrets": { "OPENAI_API_KEY": "..." }, // optional, exposed via WorkerContext.get_secret
    "input_buffer_size": 2                // optional, defaults to DEFAULT_INPUT_BUFFER_SIZE
  } }
// → response
{ "type": "result", "request_id": "<uuid>", "data": { "session_id": "<id>", "status": "running" } }

// 2. update_parameter — request
{ "type": "update_parameter", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "name": "<field>", "value": <any> } }
// → response
{ "type": "result", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "ok": true, "routed": true|false } }

// 3. push_input_frame — request
{ "type": "push_input_frame", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "handle": "<input handle name>",
    "payload": <opaque msgpack value>,    // tensor bin, dict, primitive — node-defined
    "metadata": { ... }                   // optional, attached to the inbox envelope
  } }
// → response
{ "type": "result", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "ok": true, "dropped_count": 0 } }

// 4. stop_session — request
{ "type": "stop_session", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "timeout": 5.0   // optional, seconds; defaults to DEFAULT_STOP_TIMEOUT
  } }
// → response
{ "type": "result", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "ok": true, "error": null } }   // ok=false + error="..." if the runner raised

// 5. realtime_output_frame — server-pushed event (no request_id)
{ "type": "realtime_output_frame", "data": {
    "session_id": "<id>", "handle": "<output slot name>",
    "payload": <opaque msgpack value>,    // SAME field name as push_input_frame
    "metadata": { ... }                   // optional
  } }

// Errors (any verb) — same envelope as the existing bridge protocol
{ "type": "error", "request_id": "<uuid>", "data": {
    "session_id": "<id>", "error": "<message>", "traceback": "<optional>"
  } }
```

**Pinned rules (any change here breaks both sides):**

- `data.session_id` is the routing key on every verb and must be set first; the worker rewrites `data.session.session_id` from it defensively in `start_session`.
- `start_session` response status is the literal string `"running"` (was discussed as `"started"`; pinned to `"running"` to match the TS `PythonRealtimeSession` state model).
- `push_input_frame` and `realtime_output_frame` both use the field name `payload` (not `data` — that field name is reserved for the envelope itself).
- All event/response bodies live under `data`. The bridge dispatcher routes by `msg.type` and reads `msg.data` uniformly; a top-level routing field like `msg.session_id` would be silently dropped.
- `stop_session.data.timeout` is in seconds (float) and is forwarded to `RealtimeNodeInstance.stop(timeout=...)`. Omit to use the worker default (5 s).
- `update_parameter.data.value` and the `payload` fields on push/output frames are msgpack-encoded as-is — no JSON re-encoding step. Use raw `bin` tensors for video frames; small JSON-shaped objects for control/metadata.

**Non-rules (deliberately not pinned, free to evolve):**

- The shape inside `payload` (frame format dataclass) is per-node and will be standardized when the first model node lands — it is **not** part of this contract.
- The `metadata` field on push/output frames is free-form per node; not interpreted by the substrate.
- `routed=false` from `update_parameter` is a soft signal: the bridge treats it as "field name unknown on this node"; the caller decides whether to escalate.

#### TS-side surface already in this repo (consumes the contract above)

| Symbol | File | What it does |
|---|---|---|
| `RealtimeStartSessionRequest` / `Result`, `RealtimeUpdateParameterRequest` / `Result`, `RealtimePushInputFrameRequest` / `Result`, `RealtimeStopSessionRequest` / `Result`, `RealtimeOutputFrameEvent`, `RealtimeMediaTrackPayload`, `RealtimeSessionInfoPayload` | `packages/runtime/src/python-bridge-types.ts` | Typed mirrors of every wire-format payload above. Field-for-field 1:1 with the Python side. |
| `PythonStdioBridge.startRealtimeSession(req)` / `.updateRealtimeParameter(req)` / `.pushRealtimeInputFrame(req)` / `.stopRealtimeSession(req)` | `packages/runtime/src/python-stdio-bridge.ts` | Async wrappers around the four verbs. Each returns the worker's `Result` payload; rejects on `error` envelopes. |
| `PythonStdioBridge.on("realtimeOutputFrame", handler)` | same | Bridge-wide event for every frame the worker emits, in any session. Filter by `event.session_id` if you need per-session routing. |
| `PythonRealtimeSession` (class) | `packages/runtime/src/python-realtime-session.ts` | High-level wrapper around a single live session. State machine `idle → starting → running → stopping → stopped`. `start()`, `pushFrame(handle, payload, metadata?)`, `updateParameter(name, value)`, `stop(timeout?)` (idempotent), `dispose()` (crash-recovery escape hatch — detaches the listener without contacting the worker). Filters bridge-wide `realtimeOutputFrame` events down to this session's `session_id` and re-emits as `frame`. |

All of the above are exported from `@nodetool/runtime` (`packages/runtime/src/index.ts`).

#### What's not yet decided / shipped (the agent working on the next ladder rung needs to land these)

- **Frame format dataclass** — **decided**, see "Step (7) decisions" subsection below. `VideoFrame` / `AudioFrame` interfaces in `@nodetool/protocol` + Python dataclass mirror in `nodetool-core/src/nodetool/workflows/realtime.py`. Implementation pending alongside step (7).
- **`LatestPerHandleAccumulator`** Python utility (Phase 2 design pass — see "Pre-model design pass" below).
- **`WeightSource` resolver** — lives in `nodetool-realtime`, not in core (see Python integration architecture above).
- **TS-side `node-executor.ts` import bug** (pre-existing, from PR #2766) — `import type { RealtimeSessionInfo } from "@nodetool/protocol"` should be `RealtimeSessionRecord`. Out of scope for the bridge work; will be fixed when the realtime runner branch lands its full type cleanup.

### Step (7) decisions — frame format + package layout (frozen)

These are the two "decide first" gates inside Phase 2 step (7) ("Create the first `nodetool.realtime` nodes"). Both are now locked in. The actual implementation lands as part of step (7); these subsections are the contract every later step (8–11) consumes.

#### Frame-format contract

**Where it lives.** Two places — same field names, mechanically convertible by msgpack:

- **TS:** `packages/protocol/src/realtime-frame.ts`, exported from `@nodetool/protocol`. Both the in-process inbox path (`VideoSource → VideoSink` loopback) and the stdio bridge path (`VideoSource → Python model node → VideoSink`) use this exact type. Crossing the bridge is a no-op transformation: msgpack ships the object as-is, and the `data: Uint8Array` field becomes a Python `bytes` object.
- **Python:** `nodetool-core/src/nodetool/workflows/realtime.py`, alongside the existing `RealtimeMediaTrack` / `RealtimeSessionInfo` dataclasses. Pure-Python dataclass; no `torch` dependency at the substrate level.

**Shape:**

```typescript
export interface VideoFrame {
  type: "realtime_video_frame";
  // Pixel buffer. msgpack ships this as a length-prefixed binary blob (no
  // base64, no JSON escaping). Layout described by pixel_format + width +
  // height + stride.
  data: Uint8Array;
  width: number;
  height: number;
  // Bytes per row. ≥ width * bytes_per_pixel; equals when packed.
  // Many hardware decoders produce strided buffers (YUV/NV12) where
  // width × bytes_per_pixel < stride. Required so the Python side
  // reshapes correctly without surprises.
  stride: number;
  // Closed string union — pinned formats only. Adapters convert at the
  // boundary if a model wants something else. RGBA8 / RGB8 cover the
  // browser-source path; YUV420P / NV12 cover the hardware-decoder path.
  pixel_format: "rgba8" | "rgb8" | "yuv420p" | "nv12";
  // Producer-assigned monotonic capture timestamp (CLOCK_MONOTONIC_RAW or
  // performance.now() × 1e6). Informational — used for fps/age metrics,
  // not for ordering. NodeInbox drops by arrival order, not by timestamp.
  timestamp_ns: number;
  // Producer-assigned sequence number. Useful for "did I miss any frames?"
  // diagnostics; not used for ordering or scheduling.
  sequence: number;
}

export interface AudioFrame {
  type: "realtime_audio_frame";
  data: Uint8Array;            // PCM samples, interleaved if channels > 1
  sample_rate: number;         // 48000, 44100, 16000, etc.
  channels: number;            // 1, 2
  sample_format: "s16le" | "f32le";
  samples: number;             // samples per channel in this chunk
  timestamp_ns: number;
  sequence: number;
}

export type RealtimeFrame = VideoFrame | AudioFrame;
```

**Pinned rules:**

- `type` discriminator is the **first** field every consumer branches on. Mirrors the `ImageRef` / `AudioRef` / `VideoRef` convention already in `@nodetool/protocol`.
- `data` is **always raw `Uint8Array`** (Python `bytes`) — never base64, never a data URI, never an `ImageRef`. Realtime is the hot path; the wire stays binary.
- `pixel_format` / `sample_format` are **closed string unions, not numeric enums**. Easier msgpack round-trip; adding a format is a TS type-union edit.
- All frames are **CPU-resident on the wire**. CPU buffer → GPU tensor conversion is the **model node's** job (in its `pre_process`), not the substrate's. Mirrors the existing `BaseNode.move_to_device` separation. No `device` / `dtype` field on the frame.
- `timestamp_ns` is producer-assigned at **capture**, not at inbox enqueue. The inbox doesn't know when the frame was captured; the producer does.
- The substrate **does not interpret** frame contents — it routes them. Format conversion (e.g. NV12 → RGB) is a node-level concern, not an inbox/runner concern.

**Non-rules (deliberately not pinned):**

- **No `colorspace` / `color_range` field.** All four pinned `pixel_format` values imply BT.709 limited-range when sourced from a browser/WebRTC peer. Add explicit fields only when a model empirically needs full-range or BT.601 — defer until evidence.
- **No "keyframe" / priority field.** Drop-oldest is unconditional. If a model needs keyframe handling, its `pre_process` detects it (e.g. by sequence-modulo).
- **The `metadata?: Record<string, unknown>` envelope** carried by the bridge's `RealtimePushInputFrameRequest` / `RealtimeOutputFrameEvent` is unchanged and unrelated to frame contents — node-defined per-call extras, not interpreted by the substrate.

**Conversion helpers** (sit on top of the contract, not part of it):

- TS: `packages/realtime-nodes/src/utils/frame-conversions.ts` — `videoFrameToImageRef(frame, asset)` / `imageRefToVideoFrame(ref)`. Used by the loopback proof and by any "save current frame as asset" affordance.
- Python: `nodetool-realtime/src/nodetool/realtime/utils/frame_torch.py` — `frame_to_torch(frame, device, dtype) -> torch.Tensor` / `torch_to_frame(tensor, pixel_format) -> VideoFrame`. Lives in the sister repo so core stays PyTorch-free.

#### Package layout & registry discovery

**Decision: hand-written `packages/realtime-nodes/` mirroring `base-nodes`. No manifest, no codegen, explicit `register*Nodes(registry)` registration at the same wire-up spots as every other `*-nodes` package.**

**Folder structure** (mirrors `packages/base-nodes/`):

```
packages/realtime-nodes/
├── package.json              ← deps: @nodetool/node-sdk, @nodetool/protocol, @nodetool/runtime, @nodetool/kernel
├── tsconfig.json             ← refs node-sdk, protocol, runtime, kernel
├── vitest.config.ts
├── src/
│   ├── index.ts              ← exports REALTIME_NODES + registerRealtimeNodes(registry)
│   ├── nodes/
│   │   ├── video-source.ts
│   │   ├── video-sink.ts
│   │   ├── audio-source.ts
│   │   ├── audio-sink.ts
│   │   ├── parameter.ts
│   │   └── session-info.ts
│   └── utils/
│       ├── frame-conversions.ts   ← VideoFrame ↔ ImageRef
│       └── latest-per-handle.ts   ← TS counterpart of the Python utility (added when first TS multi-input realtime node lands)
└── tests/
    └── loopback.test.ts      ← VideoSource → identity → VideoSink with a stub WebRTC server
```

**Why hand-written and not manifest-driven:** six nodes total (and unlikely to grow past ~15 even after audio adapters land). Manifest pattern (`replicate-nodes` / `fal-nodes`) buys nothing here and adds rebuild friction. `base-nodes` is the right template — it's a hand-curated `ALL_BASE_NODES` array of `NodeClass` references.

**Registry discovery is explicit, not automatic.** The codebase has zero auto-discovery — every `*-nodes` package is registered by hand. Wiring `realtime-nodes` in requires touching exactly these spots:

| Spot | Why |
|---|---|
| `package.json` (root) workspaces array | npm needs to know the package exists |
| `tsconfig.build.json` references | `tsc --build` needs to know to compile it |
| `scripts/websocket-workspaces.mjs` | websocket package's allow-list for boot |
| `packages/cli/package.json` deps | `"@nodetool/realtime-nodes": "*"` |
| `packages/websocket/package.json` deps | same |
| `packages/cli/src/nodetool.ts` | 3 spots: top-level import, dynamic import in DSL boot, register call in CLI server-start path |
| `packages/websocket/src/server.ts` | import + `registerRealtimeNodes(registry)` |
| `packages/websocket/src/http-api.ts` | import + register (HTTP API node listing) |
| `packages/websocket/src/mcp-server.ts` | import + register (MCP exposure of nodes) |

That's the full surface. No build-system changes; no node-discovery infrastructure to add.

**Dev-loop: `nodetool-dev` exports condition (no rebuild needed).** Reuse the existing convention `base-nodes`/`runtime`/etc. already use:

- The `package.json` exports map ships a `nodetool-dev` condition that points at `src/index.ts` (instead of `dist/index.js`).
- Dev scripts (`dev:nodetool`, `dev:server`, etc.) run `tsx` with `NODE_OPTIONS='--conditions=nodetool-dev'`, so source changes are live without a rebuild step.
- For the production / electron path, `npm run build:packages` (turbo) compiles `dist/` and the standard exports take over.

**Independent versioning / publish:** the package shape (`exports` map, `main`, `types`, version `0.1.0`) matches the other `*-nodes` packages so it can be published independently to npm later if needed — same release path as `replicate-nodes` / `fal-nodes` already use.



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
- [x] **Re-label existing plan references to `packages/realtime-nodes/`.** Swept the plan: every remaining reference to `packages/realtime-nodes/` is the TS-side I/O nodes only (Status section, Python integration architecture, the step (7) checkbox itself, the Immediate next tasks ladder, and the Reference / suggested package layout appendix); model-code paths consistently use `nodetool-realtime/src/nodetool/nodes/realtime/` per the sister-repo decision above. The `LatestPerHandleAccumulator` ownership clause was clarified inline in its design-pass bullet (Python utility lives in core; the `packages/realtime-nodes/src/utils/` path is reserved for the TS-side counterpart only).

*Remaining Phase 2 work is implemented from the "Next implementation ladder" at the top of this file. Compact details follow for reference.*

- [ ] **7a-7d: First `nodetool.realtime` nodes.**
  - Package: `packages/realtime-nodes/`, hand-written like `base-nodes`.
  - Nodes: `VideoSource`, `VideoSink`, `AudioSource`, `AudioSink`, `Parameter`, `SessionInfo`.
  - Tests: package registration, frame loopback, drop-oldest behavior, parameter routing, lifecycle hooks.
- [ ] **8a-8d: Backend media integration.**
  - Add a WebRTC spike before full integration.
  - Implement `packages/websocket/src/realtime/webrtc-server.ts` and `frame-router.ts`.
  - Route inbound tracks to `RealtimeRunner.pushInputValue`; expose outbound sink tracks.
  - Fix session readiness, stop timeouts, stopped-session retention, and `realtime_metrics`.
- [ ] **9: Pre-model design pass.**
  - Decide Wan2.1 upstream source.
  - Define model load progress events and CPU-only smoke tests.
  - Add `LatestPerHandleAccumulator`.
  - Set fps thresholds.
  - Add `WeightSource`.
  - Extend SystemStats with `device_capability`, `fp8_native`, `int8_via_bnb`, `gguf_loader_available`, and `recommended_precision`.
- [ ] **10: LongLive first model node.**
  - Thin node: `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py`.
  - Pipeline: `nodetool-realtime/src/nodetool/realtime/wan21/longlive_pipeline.py`.
  - Properties: `prompt`, `precision`, `attention_window`, `inference_steps`, `seed`, `width`, `height`, `guidance_scale`.
  - Precision order for `auto`: native FP8 → GGUF → FP16 → INT8.
- [ ] **10b: Self-Forcing.**
  - Target Ampere/low-VRAM hardware through GGUF/community pre-quantized weights.
  - Reuse LongLive lifecycle, accumulator, smoke tests, and `WeightSource`.
- [ ] **Later model nodes.**
  - StreamDiffusion V2, MemFlow, RewardForcing, Krea Realtime 14B, and streaming VACE reuse the LongLive template.
  - Keep ControlNet/LoRA selection centralized through existing `ModelsManager` / `UnifiedModel` paths.
- [ ] **11: Canonical workflow template.**
  - Connect source, parameters, model node, sink, preview, metrics, reconnect, and save/export hooks.
  - Document which pieces are generic substrate vs. model-specific.

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

The authoritative sequence is **Next implementation ladder** near the top of this file. Start at **7a**.

Completed foundation:

- [x] Runtime/session contract
- [x] Initial operator surface
- [x] Initial `nodetool.realtime` node roles
- [x] TS + Python substrate through step 6c

Remaining:

- [ ] Steps 7a-7d: session info, frame types, package, first realtime nodes
- [ ] Steps 8a-8d: WebRTC spike, backend media endpoint, lifecycle, metrics
- [ ] Step 9: pre-model design pass
- [ ] Step 10: LongLive
- [ ] Step 10b: Self-Forcing
- [ ] Step 11: canonical workflow template
- [ ] Adapter roadmap for `NDI` and `Spout`

## Follow-up tasks discovered while starting the plan

Completed:

- [x] `start_realtime_session` creates a linked `Job` and launches workflow execution.
- [x] Realtime start accepts unsaved graph payloads.
- [x] `"starting"` lifecycle state exists; runtime startup is gated on an active job.
- [x] WebRTC signaling and media-track mapping exist for the `/realtime` incubation page.
- [x] Browser capture logic moved to `web/src/hooks/browser/useVideoCapture.ts`.
- [x] Realtime list/get moved to tRPC.
- [x] `WorkflowRunner.pushParameter(name, value)` routes live controls through `ControlEvent`.

Still active:

- [ ] Transport readiness and backend WebRTC connection are tracked in step 8c.
- [ ] `realtime_metrics` is tracked in step 8d.
- [ ] Session retention/reconnect is tracked in step 8c and Phase 3.

## Notes / maybe later

- **WebRTC peer config:** add ICE servers and bitrate tuning when backend WebRTC replaces the in-browser loopback.
- **Per-track mapping UI:** `RealtimeStreamPage` currently maps all video tracks to one node/input.
- **Brightness slider:** current sync ignores `0`; fix when the MVP slider becomes generalized realtime parameters.
- **Test noise:** realtime runner tests can log `Database not initialized` warnings because persistence is best-effort.

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
| 25 | **Krea Realtime 14B** (and likely distilled/smaller variants when they ship) | High-fidelity diffusion alternative to the 1.3B baseline | ⚠️ (32 GB+ VRAM today; reachable for many users on a 4090/5090/A6000) | various | **Fast-follow after the 1.3B baseline** (the LongLive / Self-Forcing model nodes in Phase 2). Not blocked by anything beyond proving the substrate end-to-end with the smaller model first; pull it forward as soon as a user case calls for the quality bump. Watch for distilled/quantized variants from Krea — those would shift this entry up a tier. |
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
