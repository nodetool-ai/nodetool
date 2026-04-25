# Realtime Integration Roadmap for NodeTool

## Status

- [x] Phase 1 foundation: contract, session substrate, control plane, first operator surface.
- [x] Phase 2 substrate through backend WebRTC shell, realtime nodes, lifecycle, and metrics.
- [ ] Phase 2 first model proof: design pass, LongLive/Self-Forcing, canonical workflow template.
- [ ] Phase 3 browser/JS realtime inference.
- [ ] Phase 4 workflow integration.
- [ ] Phase 5 deployed realtime worker readiness.
- [ ] Phase 6 expansion adapters.

## How to use this plan now

Implement from **Next implementation ladder** downward. Earlier sections capture frozen decisions and constraints; do not re-decide them unless implementation evidence proves they are wrong.

Rules for the remaining work:

- Keep realtime behavior out of `packages/websocket/src/unified-websocket-runner.ts` and `packages/kernel/src/runner.ts`; those files only get small delegation or primitive changes.
- Use the existing workflow runner, inbox, node registry, WebSocket control plane, and job/session model.
- Treat WebRTC/media transport and websocket/control messages as separate planes.
- Prefer short PRs in ladder order. Each step should leave tests passing for the package it touches.

## Next implementation ladder

- [x] **7. First realtime substrate and nodes.** Production sessions now use `RealtimeRunner`; `VideoFrame` / `AudioFrame` types exist; `packages/realtime-nodes/` provides `VideoSource`, `VideoSink`, `AudioSource`, `AudioSink`, `Parameter`, and `SessionInfo`.
- [x] **8. Backend WebRTC shell, lifecycle, and metrics.** `packages/websocket/src/realtime/` owns signaling delegation, per-session peer objects, frame routing, bounded per-consumer queues, lifecycle/teardown, and `realtime_metrics`. Codec decode/encode remains intentionally unsupported until a real bridge or alternate stack proves raw frame conversion.
- [x] **9. Pre-model design pass.**
  - Pick Wan2.1 upstream source.
  - Define model-loading progress events.
  - Add `LatestPerHandleAccumulator`.
  - Define CPU-only model-node smoke tests.
  - Set framerate acceptance thresholds.
  - Add `WeightSource` in `nodetool-realtime`.
  - Extend SystemStats with realtime precision/hardware hints.
  - 9 result: use **NVlabs/LongLive** as the first concrete model proof and **Wan-AI/Wan2.1-T2V-1.3B** as the base model source. Keep exact performance claims tied to upstream hardware: LongLive reports 20.7 FPS on one H100 and 24.8 FPS with FP8; local acceptance is tiered rather than universal. CPU smoke tests prove construction, lifecycle hooks, fake-frame processing, and error handling only; they do not assert FPS. H100/A100 performance tests are opt-in and record observed fps/latency through `realtime_metrics`.
  - 9 implementation shape: all heavy model code lands in the existing `nodetool-realtime` skeleton. Thin nodes go under `nodetool-realtime/src/nodetool/nodes/realtime/`, while pipelines, `WeightSource`, hardware/precision helpers, frame converters, fake CPU pipelines, and `LatestPerHandleAccumulator` live under `nodetool-realtime/src/nodetool/realtime/`. Core may receive only small protocol/status surfaces for loading events and hardware hints.
  - 9 loading/precision contract: model nodes emit structured loading phases (`resolving_weights`, `downloading`, `loading_tokenizer`, `loading_vae`, `loading_transformer`, `warming`, `ready`, `error`) with progress and selected precision/backend. `WeightSource` supports local path, Hugging Face repo/file, and cached/default source. Precision selection prefers native FP8 only on capable Ada/Hopper/Blackwell hardware, uses FP16/BF16 where memory allows, and treats GGUF/INT8 community paths as explicit experimental fallbacks until validated.
  - 9 realtime loop contract: `LatestPerHandleAccumulator` is the default input coalescer for model nodes. It keeps the most recent value per media/control handle, preserves sequence/timestamp metadata, reports skipped/dropped input counts to metrics, and never blocks the media/control plane waiting for stale frames. Prompt/control updates are applied at the next model iteration and can trigger model-specific cache refresh such as LongLive KV-recache.
- [ ] **10. Implement LongLive.**
  - Thin node in `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py`.
  - Heavy pipeline in `nodetool-realtime/src/nodetool/realtime/wan21/longlive_pipeline.py`.
  - Use the frame contract, loading lifecycle, hardware precision hints, `WeightSource`, and smoke-test pattern from step 9.
- [ ] **10b. Implement Self-Forcing.**
  - Validate GGUF/community pre-quantized weights on Ampere/low-VRAM hardware.
  - Treat community Self-Forcing/VACE FP8/GGUF weights as experimental until license, provenance, and quality are checked for the exact selected source.
- [ ] **11. Build the canonical realtime workflow template.**
  - Camera/source -> parameter controls -> LongLive/Self-Forcing -> sink/preview.
  - Include reconnect/session behavior, metrics display, and save/export hooks where available.
- [ ] **12. Add browser/JS realtime inference lane.**
  - Define how TensorFlow.js and Transformers.js inference participates in realtime sessions without becoming a second runtime model.
  - Add package/runtime boundaries for browser-local, Electron-renderer, and Node-side JS inference.
  - Route pose, landmarks, captions, classifications, and other analysis outputs through existing session/control/event surfaces instead of the media transport unless they are actual media frames.
  - Add model loading, cache, backend capability, and metrics surfaces for `webgpu` / `wasm` / `cpu`.
- [ ] **13. Make realtime work from deployed NodeTool workers.**
  - Treat this as deployment hardening for the existing NodeTool deploy path, not a separate Scope-style cloud runner.
  - Must-have: HTTPS/WSS, auth, proxy, ICE/STUN/TURN, worker placement, metrics, reconnect, and public output URL behavior.
  - Nice-to-have: WHIP/WHEP, remote media brokering, entitlements, multi-region routing, and richer operations dashboards.

## Core decisions

- **Realtime is a workflow execution mode.** It belongs to the normal NodeTool workflow model, editor, persistence, and operator surfaces. Realtime sessions should be tracked as standard Jobs, and outputs should be savable as standard Assets.
- **The first runtime stays separate internally.** It should align with workflow identity, preview routing, and control semantics so later convergence remains straightforward.
- **LongLive is the first model proof.** Start with a Wan2.1 1.3B autoregressive model node, then reuse the same shape for Self-Forcing, StreamDiffusion V2, MemFlow, RewardForcing, Krea, and streaming VACE.
- **Control plane and media plane are separate.** Session lifecycle, control updates, diagnostics, preview notifications, and status stay on the workflow/websocket control plane. High-rate media uses a dedicated adapter boundary.
- **WebRTC is the web media adapter boundary.** High-framerate web audio/video should use WebRTC or a similar UDP-based protocol rather than the WebSocket control plane.
- **Existing workflow nodes remain the default building blocks.** Add realtime-specific nodes only for distinct live source, sink, adapter, or control roles.
- **`nodetool.realtime` is the namespace for realtime-category nodes.** Do not duplicate ordinary workflow nodes under this namespace.
- **NDI and Spout are committed later goals.** Reserve clean media adapter boundaries for NDI, Spout, Syphon, MIDI, OSC, DMX, and timecode.
- **Shared files hold primitives; dedicated files hold realtime behavior.** `unified-websocket-runner.ts` and `runner.ts` should only gain small surfaces. Realtime behavior lives in `packages/websocket/src/realtime/*` and `packages/kernel/src/realtime-runner.ts`.
- **Substrate lives in core; model nodes live outside the substrate.** Core owns runner/session/WebRTC substrate, TS I/O nodes, protocol frame types, bridge verbs, lifecycle hooks, and hardware hints. `nodetool-realtime` owns heavy Python model code, `WeightSource`, Wan2.1 pipelines, GGUF loading, and ML dependencies.
- **Model proof design is now fixed for implementation.** `nodetool-realtime` already exists as the sister package skeleton. Step 10 should add a thin LongLive node plus a fat Wan2.1/LongLive pipeline there, using the step 9 `WeightSource`, precision/hardware hints, loading events, fake CPU smoke tests, and `LatestPerHandleAccumulator` pattern.

Primary contract reference: `docs/realtime-runtime-contract.md`.

## Core technical assumptions

- **Async I/O vs synchronous inference boundary.** WebRTC/media transport and the WebSocket control plane must not be blocked by heavy node execution.
- **Latest-frame-wins backpressure.** Media queues use bounded, drop-oldest behavior so inference works on recent frames.
- **Separate parameter and media queues.** UI controls and prompt updates should not wait behind video/audio frames.
- **WebRTC bitrate tuning.** Browser sender bitrate needs explicit tuning and browser fallback handling.
- **Per-consumer media queues.** Browser preview, recording/export, hardware adapters, and chained workflows each get their own bounded queue.
- **Normalized media packet boundary.** Adapters convert transport-specific payloads into `VideoFrame` / `AudioFrame` before entering the graph.
- **Pacing is separate from pixels.** Timing, frame age, reconnect discontinuities, and preview cadence live outside codec and model code.

## External assumption checks

- **LongLive:** NVlabs LongLive is public, Apache 2.0, Wan2.1-based, and reports 20.7 FPS on one H100 plus 24.8 FPS with FP8 quantization. Keep exact FPS claims tied to upstream hardware.
- **Native FP8:** NVIDIA Transformer Engine documents FP8 support on Ada/Hopper/Blackwell with compute capability 8.9+. Ampere should route to GGUF/FP16/INT8 fallbacks.
- **WebRTC bitrate:** browser sender bitrate should be tuned via `RTCRtpSender.getParameters()` -> mutate `encodings[0].maxBitrate` -> `setParameters()`, with Safari/Firefox fallback handling.
- **werift:** good Node-first choice for WebRTC/RTP and now owns the first backend peer/session shell. Pixel decode/encode remains behind `UnsupportedCodecBridge`.
- **Scope architecture sanity check:** `daydreamlive/scope` validates the broad split: thin UI shell, long-lived media service/session objects, bounded queues, per-consumer output queues, explicit packet types, deterministic teardown, pacing helpers, and structured metrics. Use this as architecture inspiration, not code to copy.
- **Self-Forcing community weights:** FP8/GGUF low-VRAM artifacts exist, but treat them as experimental until source, license, and quality are validated.

## Current code reality

- Realtime session start creates a linked `job_id`, accepts unsaved graph payloads, and starts a workflow-backed runtime.
- `RealtimeRunner` exists, composes `WorkflowRunner`, and is wired into the websocket production path for realtime sessions.
- `pushParameter(name, value)` routes live control updates to `nodetool.realtime.Parameter` nodes.
- `/realtime` is still an incubation page. It proves browser capture and loopback signaling by default, and has a guarded backend WebRTC smoke mode via `?webrtcRuntime=backend`.
- Server-side WebRTC termination and frame-router boundaries exist. Decoded media is not yet delivered into the backend graph because the codec bridge intentionally reports unsupported.
- Realtime lifecycle, bounded teardown, terminal-session retention, and control-plane metrics exist.
- `nodetool-realtime` exists as a pre-alpha sister-package skeleton with lean base dependencies, precision extras reserved for `fp8`, `gguf`, and `int8`, thin node stubs under `src/nodetool/nodes/realtime/`, and heavy pipeline/utilities namespace under `src/nodetool/realtime/`.
- `RealtimeAudioInput` shows the existing streaming-input pattern; `VideoInput` remains an asset/reference input, not a live media source.

## Existing event-driven primitives we build on

The realtime runner extends existing primitives; it is not a parallel runner.

- **`isStreamingInput=true` + `async run(inputs, outputs, ctx)`**: a node drains the inbox via `NodeInputs.any()` / `NodeInputs.stream(handle)`. `ManualTriggerNode` is the canonical pattern.
- **`isStreamingOutput=true` + `async *genProcess()`**: a node yields outputs over time. Useful for clock/tick/heartbeat nodes.
- **`isControlled` + `_runControlled`**: a node waits for `ControlEvent` items on `__control__`, fires processing on each event, and terminates on `stop`.
- **`NodeInbox(bufferLimit)`**: supports per-handle policies, including drop-oldest / latest-frame-wins.
- **`pushInputValue(inputName, value, sourceHandle)` + `finishInputStream(inputName, sourceHandle)`**: inject media chunks and parameter updates into a live graph.

## Frozen substrate references

These contracts are shipped and should be treated as breaking-change surfaces:

- **Runtime contract:** `docs/realtime-runtime-contract.md`.
- **TS frame types:** `packages/protocol/src/realtime-frame.ts` exports `VideoFrame`, `AudioFrame`, and `RealtimeFrame`.
- **TS realtime nodes:** `packages/realtime-nodes/` provides source, sink, parameter, and session-info nodes.
- **Python worker realtime bridge:** `nodetool-core` owns `start_session`, `update_parameter`, `push_input_frame`, `stop_session`, and `realtime_output_frame` over the existing msgpack stdio bridge.
- **Python model-node repo:** `nodetool-realtime` owns heavy model nodes and pipelines. Keep ML dependencies out of core.

### Worker context surface

Python realtime node hooks receive a worker-local context, not the full app `ProcessingContext`.

- `WorkerContext` guarantees secrets lookup (`get_secret`, `get_secret_required`) and a cancellation token.
- Do not assume storage, database, asset-server, or messaging surfaces are available inside Python realtime workers.
- Pass node-specific runtime data through `session.parameters`, bridge payload metadata, or explicit model-node fields.

### Bridge message contract

All realtime bridge messages use the existing length-prefixed msgpack stdio transport. Requests/responses use `request_id`; all bodies live under `data`.

```jsonc
// start_session
{ "type": "start_session", "request_id": "<uuid>", "data": {
  "session_id": "<id>",
  "session": {
    "session_id": "<id>",
    "workflow_id": "<id|null>",
    "transport": "websocket|webrtc",
    "parameters": {},
    "media_tracks": [
      { "track_id": "...", "kind": "video", "node_id": "...", "input_name": "..." }
    ]
  },
  "node_type": "<python node type>",
  "fields": {},
  "secrets": {},
  "input_buffer_size": 2
} }
// result: { "session_id": "<id>", "status": "running" }

// update_parameter
{ "type": "update_parameter", "request_id": "<uuid>", "data": {
  "session_id": "<id>", "name": "<field>", "value": "<msgpack value>"
} }
// result: { "session_id": "<id>", "ok": true, "routed": true }

// push_input_frame
{ "type": "push_input_frame", "request_id": "<uuid>", "data": {
  "session_id": "<id>", "handle": "<input>", "payload": "<msgpack value>", "metadata": {}
} }
// result: { "session_id": "<id>", "ok": true, "dropped_count": 0 }

// stop_session
{ "type": "stop_session", "request_id": "<uuid>", "data": {
  "session_id": "<id>", "timeout": 5.0
} }
// result: { "session_id": "<id>", "ok": true, "error": null }

// realtime_output_frame event
{ "type": "realtime_output_frame", "data": {
  "session_id": "<id>", "handle": "<output>", "payload": "<msgpack value>", "metadata": {}
} }
```

Pinned bridge rules:

- All request/response bodies live under `data`.
- `data.session_id` is the routing key for every realtime verb and must match `data.session.session_id` for `start_session`.
- `start_session` responds with status `"running"`.
- `push_input_frame` and `realtime_output_frame` both use `payload`.
- `stop_session.data.timeout` is in seconds.
- Frame payloads are msgpack values; no JSON re-encoding step.
- `routed=false` from `update_parameter` is a soft signal; callers decide whether to escalate.

### Frame-format rules

- `VideoFrame`, `AudioFrame`, and `RealtimeFrame` live in `packages/protocol/src/realtime-frame.ts` and are mirrored by Python dataclasses in `nodetool-core`.
- `type` is the discriminator every consumer branches on.
- `data` is always raw `Uint8Array` / Python `bytes`, never base64, data URI, or asset reference.
- `pixel_format` and `sample_format` are closed string unions, not numeric enums.
- Frames are CPU-resident on the wire. CPU buffer -> GPU tensor conversion belongs in the model node.
- `timestamp_ns` is assigned at capture time by the producer.
- The substrate routes frames; format conversion stays in adapters or model-node preprocessing.

### TS/Python surface map

| Surface | Location | Purpose |
|---|---|---|
| `RealtimeStartSessionRequest`, `RealtimeUpdateParameterRequest`, `RealtimePushInputFrameRequest`, `RealtimeStopSessionRequest`, `RealtimeOutputFrameEvent` | `packages/runtime/src/python-bridge-types.ts` | Typed TS mirrors of bridge payloads. |
| `PythonStdioBridge.startRealtimeSession`, `.updateRealtimeParameter`, `.pushRealtimeInputFrame`, `.stopRealtimeSession` | `packages/runtime/src/python-stdio-bridge.ts` | Async TS wrappers around realtime bridge verbs. |
| `PythonStdioBridge.on("realtimeOutputFrame")` | `packages/runtime/src/python-stdio-bridge.ts` | Bridge-wide event for output frames; filter by `session_id`. |
| `PythonRealtimeSession` | `packages/runtime/src/python-realtime-session.ts` | Per-session wrapper with `idle -> starting -> running -> stopping -> stopped` state. |
| `RealtimeSessionInfo`, `RealtimeMediaTrack` | `nodetool-core/src/nodetool/workflows/realtime.py` | Trimmed session snapshot visible to Python node hooks. |
| `StdioWorkerServer` realtime handlers | `nodetool-core/src/nodetool/worker/stdio_server.py` | Worker-side verb dispatch and `realtime_output_frame` emit. |
| `RealtimeNodeInstance` | `nodetool-core/src/nodetool/worker/realtime_session.py` | One warm Python node instance plus processing task per live session. |

## Phase 1 - Foundation

**Goal:** Define the realtime execution contract and establish the workflow-native substrate.

**Completed:** Contract, runner convergence invariants, first operator surface (`/realtime/:workflowId?`), node capability model, `nodetool.realtime` namespace policy, initial realtime roles, capture audit, preview/output landing zones, and control-plane/media-plane split.

**Reference:** `docs/realtime-runtime-contract.md`.

## Phase 2 - First proof: Autoregressive Video Diffusion

**Goal:** Ship the first end-to-end realtime workflow that proves the system.

**Done when**

- A canonical realtime video diffusion workflow runs as a realtime session.
- ControlNet and LoRA use existing compatibility and selection paths.
- Live preview, parameter updates, session control, and metrics work together.

**Core integration map**

```
Browser camera/mic
  -> RTCPeerConnection (operator)
  -> RealtimeWebRTCServer
  -> FrameRouter
  -> RealtimeRunner.pushInputValue(inputName, frame)
  -> NodeInbox (bounded, drop_oldest)
  -> nodetool.realtime.VideoSource
  -> graph nodes
  -> nodetool.realtime.VideoSink
  -> RealtimeWebRTCServer outbound track
  -> browser preview
```

Control plane: `update_realtime_session` -> `RealtimeCommandHandler.handleUpdate` -> `RealtimeRunner.pushParameter(name, value)` -> control queue. `realtime_metrics` flows back over the WebSocket control plane.

**Module map**

- `packages/websocket/src/realtime/`: command handler, session manager, WebRTC server, frame router, queues, pacing, metrics.
- `packages/kernel/src/realtime-runner.ts`: `RealtimeRunner` class composing `WorkflowRunner`.
- `packages/realtime-nodes/`: TS source/sink/control/session nodes.
- `nodetool-realtime/`: Python model nodes and heavy pipelines.

**Completed substrate summary**

- Extracted realtime command handling from `unified-websocket-runner.ts`.
- Added `RealtimeRunner` using composition over inheritance.
- Added latest-frame-wins inbox policy.
- Added realtime capability flags and lifecycle hooks to TS and Python `BaseNode`.
- Added session-scoped Python bridge verbs.
- Added TS/Python frame contracts.
- Added `packages/realtime-nodes/`.
- Added backend WebRTC shell, frame router, bounded queues, pacing helper, teardown, terminal-session retention, and metrics.

**Remaining Phase 2 work**

- [x] Step 9: pre-model design pass.
- [ ] Step 10: LongLive.
  - Scaffold landed in `nodetool-realtime`: thin `LongLive` node, `WeightSource`, precision selection, `LatestPerHandleAccumulator`, fake CPU LongLive pipeline, and smoke tests.
  - Real-mode backend boundary landed: `use_fake_pipeline=False` routes through a dependency-guarded LongLive pipeline factory and emits structured loading `error` events when optional ML dependencies are absent, without importing heavy packages in the base install.
  - CPU frame conversion and cache-refresh contracts landed: `VideoFrame` inputs can be validated/normalized into LongLive `rgba8` model inputs, and prompt/negative-prompt changes record when warm caches must refresh on the next iteration.
  - Backend delegation contract landed: `LongLivePipeline` can drive an injected Wan2.1 backend through loading, generation, warm-state reset, and close, while preserving dependency-light base imports.
  - Lazy backend adapter landed: the default real-mode factory now resolves optional ML modules and component loaders only during backend load.
  - Component load plan landed: tokenizer/VAE/transformer loading is mapped to `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`, with the selected LongLive weight source retained for the future checkpoint-application step.
  - Still pending for completion: applying LongLive checkpoint weights to the transformer, tensor conversion inside the backend, sampler loop, and validated FP8/GGUF/INT8 paths.
- [ ] Step 10b: Self-Forcing.
- [ ] Step 11: canonical workflow template.

## Phase 3 - Browser/JS realtime inference

**Goal:** Make lightweight realtime inference from TensorFlow.js and Transformers.js a first-class part of realtime workflows without moving core session/media responsibilities into the UI.

**Done when**

- Browser-local realtime analysis can participate in sessions through the same graph/session model.
- TF.js and Transformers.js model loading, caching, backend selection, and progress reporting have a shared surface.
- Pose, landmarks, captions, classifications, embeddings, and similar outputs have explicit event/control contracts instead of ad hoc UI hooks.
- Editor validation can distinguish browser-capable, server-capable, and transport/media nodes.

**Tasks**

- [ ] Define the runtime placement matrix for JS inference: operator browser, Electron renderer, Node backend, or server worker.
- [ ] Add node metadata for browser/JS realtime capabilities: browser-capable, requires-browser-frame, requires-WebGPU, emits-analysis-event, emits-parameter-update, and emits-media-frame.
- [ ] Define model-loading surface: progress, selected backend, warm-state readiness, cache hit/miss, model download errors, and fallback backend selection.
- [ ] Keep analysis outputs off the media plane by default. Only pixel/audio buffers use `VideoFrame` / `AudioFrame`.
- [ ] Add a package boundary for browser-capable realtime nodes, such as `packages/realtime-browser/`.
- [ ] Implement first proof nodes: pose or hand landmarks via TF.js/MediaPipe-compatible models, plus one Transformers.js caption/classification node sampled from frames.
- [ ] Feed browser/JS inference metrics into `realtime_metrics`.
- [ ] Add editor/operator affordances for browser-local nodes.
- [ ] Document how browser-local outputs become graph inputs for server-side model nodes.

## Phase 4 - Workflow integration

**Goal:** Make realtime authoring and operation feel native inside NodeTool.

**Done when**

- Authors can create and launch realtime workflows from normal workflow surfaces.
- Realtime-capable nodes are clear in the editor.
- Operator surfaces align with the broader workflow model.

**Tasks**

- [ ] Converge `/realtime` into the editor as a `design` / `realtime` mode.
- [ ] Reuse `useRealtimeSessionStore`, `useRealtimeSessionWebRTC`, and `useVideoCapture` from the current incubation page.
- [ ] Add realtime-mode overlays: session status, fps/queue depth, parameter strip, and live sink preview.
- [ ] Add realtime-aware validation rules using `is_realtime_capable` and `is_media_adapter`.
- [ ] Add a starter template for realtime video diffusion plus ControlNet plus LoRA.
- [ ] Add editor affordances for realtime source, sink, control, and adapter nodes.
- [ ] Add menu and discovery rules for realtime-capable existing nodes and `nodetool.realtime` nodes.
- [ ] Wire `MiniAppPage` and `html_app` to launch realtime sessions through the same session contract.
- [ ] Add live control groups for prompt steering, diffusion strength, ControlNet settings, and LoRA weight.
- [ ] Add reusable preprocessor and effects stages that fit the standard workflow model.

## Phase 5 - Deployed realtime worker readiness

**Goal:** Make realtime sessions work reliably when NodeTool is running as a deployed instance with remote browsers, authenticated users, reverse proxies, and potentially separate GPU/model workers.

This is deployment hardening for the existing NodeTool deploy path, not a new cloud-runner architecture.

**Done when**

- A remote browser can start, signal, preview, reconnect to, and stop a realtime session over a deployed HTTPS/WSS endpoint.
- WebRTC connectivity works outside localhost through explicit ICE/STUN/TURN configuration.
- Realtime model workers can run beside or behind the deployed app without breaking session identity, auth, metrics, or asset/output routing.
- Operators have enough metrics and logs to debug failed peers, codec failures, worker crashes, and reconnect behavior.

**Must-have tasks**

- [ ] Define deployed topology: single-host app+worker, app server plus local GPU worker, and app server plus remote GPU worker.
- [ ] Require secure browser-facing endpoints: HTTPS, WSS, origin checks, and reverse-proxy headers.
- [ ] Add configurable ICE/STUN/TURN settings and surface selected ICE policy/connection state in `realtime_metrics`.
- [ ] Audit reverse-proxy compatibility for WebSocket upgrades, signaling routes, idle timeouts, request body limits, and sticky routing.
- [ ] Enforce auth and session ownership on realtime start/signal/update/stop, metrics subscription, and reconnect/list/get routes.
- [ ] Define worker placement/routing for Python realtime sessions and worker loss.
- [ ] Make public preview/output/recording URLs deployment-aware.
- [ ] Add deployed failure metrics and logs.
- [ ] Add a deployed smoke test or runbook covering remote start -> WebRTC connect -> frame route -> parameter update -> metrics -> reconnect -> stop.

**Nice-to-have tasks**

- [ ] Add WHIP/WHEP ingest and egress endpoints.
- [ ] Add optional remote media brokering.
- [ ] Add entitlement/rate-limit controls.
- [ ] Add multi-region or nearest-worker routing.
- [ ] Add an operations dashboard for active realtime sessions, peer state, worker load, GPU memory, queue depth, and TURN usage.
- [ ] Add admin controls to evict stuck sessions, drain a worker, or force reconnect operators to a replacement worker.

## Phase 6 - Expansion adapters

**Goal:** Extend the realtime system through clear media and control adapters after the first proof is stable.

**Done when**

- Local media extensions fit the same session contract.
- External media outputs plug in through the adapter layer.
- Control and sync integrations have a clear place in the system.

**Tasks**

- [ ] Add audio input and output support where the workflow needs it.
- [ ] Add recording and export for realtime sessions, saving outputs as standard NodeTool Assets.
- [ ] Add shared device selection on top of the reusable capture layer.
- [ ] Add `NDI` output and routing adapters.
- [ ] Add `Spout` output and routing adapters.
- [ ] Add `Syphon` adapters using the same media-adapter model.
- [ ] Add `MIDI`, `OSC`, `DMX`, and `timecode` control or sync adapters.
- [ ] Integrate WHIP/WHEP endpoints from Phase 5 into adapter discovery and workflow templates.
- [ ] Add optional remote brokering and entitlement layers if Phase 5 proves they are needed beyond deployment hardening.

## Namespace policy

- Use existing namespaces for ordinary workflow nodes that already fit realtime workflows.
- Use `nodetool.realtime` for nodes that are genuinely tied to realtime execution concerns.
- Keep `nodetool.realtime` focused on live media sources, realtime sinks, transport/adapters, session-aware controls, and utilities.

## Notes

- **WebRTC peer config:** add ICE servers and bitrate tuning when backend WebRTC replaces the in-browser loopback.
- **Per-track mapping UI:** `RealtimeStreamPage` currently maps all video tracks to one node/input.
- **Brightness slider:** current sync ignores `0`; fix when the MVP slider becomes generalized realtime parameters.
- **Test noise:** realtime runner tests can log `Database not initialized` warnings because persistence is best-effort.

## Review checks

- [x] Check that the execution contract stays broader than the first StreamDiffusion V2 proof.
- [x] Check that preview, output, and session state fit the normal workflow model.
- [x] Check that `nodetool.realtime` remains small and specific.
- [ ] Check that NDI and Spout are supported by the adapter design from the start.
- [x] Check that future audio, sync, and control adapters fit the same boundaries.
- [ ] Check that the WebRTC media plane and WebSocket control plane remain cleanly separated and non-blocking.
- [ ] Check that browser/JS inference stays on explicit session/control/event contracts instead of becoming ad hoc UI-only behavior.
- [ ] Check that deployed realtime worker support is framed as hardening for existing NodeTool deployments, not a separate cloud product.

## Feature ideas and model backlog

Future feature ideas, use cases, model/library candidates, and suggested package bundles now live in [`REALTIME-FEATURE-IDEAS.md`](REALTIME-FEATURE-IDEAS.md).
