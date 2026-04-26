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
  - Start with a provenance gate: identify the exact upstream Self-Forcing source, license, base-model compatibility, required files, and whether any FP8/GGUF/INT8 artifacts are official or community-only.
  - Provenance gate current finding: canonical candidate is `guandeh17/Self-Forcing` / `gdhe17/Self-Forcing`, licensed Apache-2.0, built on `Wan-AI/Wan2.1-T2V-1.3B`, with the documented inference checkpoint `checkpoints/self_forcing_dmd.pt`.
  - Official quickstart expects Linux, Python 3.10, CUDA GPU with at least 24 GB memory, Wan2.1 T2V 1.3B base files, and the Self-Forcing checkpoint. Treat Windows/local support as unvalidated until tested.
  - Community GGUF variants such as `Nichonauta/Self-Forcing2.1-T2V-1.3B-GGUF` exist, but are not the official path. They require a compatible video-diffusion GGUF runtime and must stay behind explicit experimental loader hooks.
  - Reuse the LongLive realtime contracts rather than inventing a parallel stack: `WeightSource`, loading phases, precision guards, `LatestPerHandleAccumulator`, frame conversion, sampler adapter lifecycle, opt-in real smoke tests, and dependency-lazy imports.
  - Thin node scaffold landed: `SelfForcing` exists under `nodetool-realtime/src/nodetool/nodes/realtime/`, uses the dependency-lazy pipeline/backend boundary, reports pending loaders by default, and forwards prompt/negative-prompt values through the same latest-value realtime accumulator pattern without adding fake model-output behavior.
  - Add a dependency-lazy Self-Forcing backend boundary with explicit loader/checkpoint/sampler hook points, mirroring the LongLive factory shape where it fits and documenting any real interface differences.
  - Backend boundary landed: `nodetool-realtime` now has a dependency-lazy Self-Forcing backend scaffold that reports pending default loaders without importing heavy modules, and can reach `ready` through explicit base-model loader, checkpoint applier, and sampler hooks.
  - Validate GGUF/community pre-quantized weights on Ampere/low-VRAM hardware only through opt-in tests or scripts, never in the default suite.
  - Treat community Self-Forcing/VACE FP8/GGUF weights as experimental until license, provenance, and quality are checked for the exact selected source.
- [x] **11. Build the canonical realtime workflow template.**
  - [x] Added `nodetool-realtime` package example `Canonical Realtime Video Diffusion` with camera/source, prompt and negative-prompt controls, LongLive, Self-Forcing, sink/preview, and session info.
  - [x] Added template notes for reconnect/session behavior, `realtime_metrics`/loading-event display, and explicit save/export hook placement.
  - [x] Exposed explicit model node input/output handles so the template can route `frame`, `loading_events`, and skipped-handle data without relying on a generic output slot.
- [ ] **12. Add browser/JS realtime inference lane.**
  - Define how TensorFlow.js and Transformers.js inference participates in realtime sessions without becoming a second runtime model.
  - Add package/runtime boundaries for browser-local, Electron-renderer, and Node-side JS inference.
  - Route pose, landmarks, captions, classifications, and other analysis outputs through existing session/control/event surfaces instead of the media transport unless they are actual media frames.
  - Add model loading, cache, backend capability, and metrics surfaces for `webgpu` / `wasm` / `cpu`.
- [ ] **13. Make realtime work from deployed NodeTool workers.**
  - Treat this as deployment hardening for the existing NodeTool deploy path, not a separate cloud runner.
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
- **External architecture sanity check:** Keep the broad split: thin UI shell, long-lived media service/session objects, bounded queues, per-consumer output queues, explicit packet types, deterministic teardown, pacing helpers, and structured metrics.
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
  - Component load plan landed: tokenizer/VAE/transformer loading is mapped to `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`, with the selected LongLive weight source retained for checkpoint application.
  - Checkpoint applier landed: `longlive_base.pt` resolution/application, EMA/model state-dict extraction, FSDP key cleanup, optional LoRA loading via lazy `peft`, and checkpoint metadata are covered by tests.
  - Package metadata discoverability landed: realtime node fields are scanner-compatible, generated `nodetool-realtime` package metadata now includes `LongLive` and `SelfForcing`, and a scanner regression test covers both nodes with no metadata warnings.
  - Sampler boundary landed: LongLive input frames convert to torch-like BCHW tensors with RGB default and optional alpha, sampler output tensors convert back to realtime `rgba8` frames, metadata/timing/cache state is preserved, and sampler reset/close hooks delegate through the lazy backend. The causal sampler factory now returns the backend-ready adapter instead of the raw sampler, so real backends receive `LongLiveGenerationInputs` through the same conversion path; adapter and causal sampler lifecycle methods delegate to wrapped samplers/upstream pipelines.
  - Configurable causal sampler wiring landed: default real-mode backend can build a dependency-lazy imported pipeline factory and pass optional sampler config without importing upstream ML packages at base import time.
  - Node-facing real pipeline configuration landed: advanced `LongLive` fields can pass an upstream pipeline module/class, constructor kwargs, component/device/dtype pass-through controls, constructor argument-name mapping, sampler call/inference argument-name mapping, input-channel and noise-shape selection, and sampler options into real mode while keeping default fake-mode behavior unchanged.
  - Upstream pipeline interface guard landed: configured causal samplers now validate `inference` vs callable pipeline shapes during sampler construction, inspect configured constructor/call/inference keyword names when upstream signatures are introspectable, and backend load reports mismatches as structured sampler errors.
  - Async upstream call support landed: causal samplers can await either `.inference(...)` or callable pipeline results before converting output video tensors into realtime frames.
  - Upstream output normalization landed: causal samplers can extract video tensors from raw outputs, dict wrappers (`video`/`videos`/`frames`), and object wrappers (`.video`/`.videos`/`.frames`), then select frames from batched, time-first, or single-frame `CHW`/`HWC` outputs before realtime conversion. Both normalized float channels and byte-scale channels are accepted, and missing/empty upstream video outputs produce clear errors.
  - Precision guard landed: real mode defers `auto` precision resolution to the lazy backend so CUDA capability can be used, while unvalidated `fp8`/`gguf`/`int8` paths fail early with structured errors instead of silently falling back.
  - Real smoke-test scaffolding landed: `nodetool-realtime` now has an opt-in `NODETOOL_LONGLIVE_REAL_SMOKE=1` path that parses user-provided upstream module/class, constructor kwargs, constructor/call/inference argument-name mappings, sampler config, prompt, and weight settings without triggering downloads in the normal test suite.
  - Quantized loader guard metadata landed: explicit `fp8`/`gguf`/`int8` requests still fail early until real loaders exist, but the structured error now identifies the matching install extra and reports the loader status instead of silently falling back. The pipeline and backend factories can now accept explicit loader/checkpoint hooks and an expanded validated-precision set, so real quantized loaders can be plugged in without bypassing the lazy backend lifecycle.
  - Still pending for completion: running real end-to-end inference against downloaded weights and implementing real FP8/GGUF/INT8 loader paths.
- [ ] Step 10b: Self-Forcing.
  - Next implementation order: provenance/license/source gate, dependency-lazy backend contract, thin realtime node scaffold, selected-upstream sampler adapter, then real smoke execution through the shared model-handling tasks in Step 10c.
  - Provenance gate, dependency-lazy backend boundary, thin node scaffold, package metadata discoverability, precision guard, selected-upstream sampler adapter, and opt-in smoke config parsing are landed. Still pending: real smoke execution against downloaded upstream weights after Step 10c artifact/loader handling is in place.
  - Selected-upstream sampler adapter landed: the first real adapter targets the official `CausalInferencePipeline.inference(noise=..., text_prompts=..., return_latents=True, low_memory=...)` surface from the Self-Forcing CLI path, reuses the existing realtime frame conversion contract, records prompt/cache/latents metadata, delegates reset/close to the selected pipeline, and can be enabled through explicit lazy backend loader hooks plus sampler config.
  - Precision guard landed: explicit Self-Forcing `fp8`/`gguf`/`int8` requests fail before optional ML imports unless loader hooks explicitly mark the precision as validated; `auto` resolves through the same CUDA-aware precision helper used by LongLive.
  - Real smoke config scaffold landed: `NODETOOL_SELF_FORCING_REAL_SMOKE=1` parses the official Self-Forcing checkpoint, precision, prompt, and negative prompt without importing runtime ML packages in the default suite. The executable real smoke remains skipped until real loader/checkpoint hooks are wired against downloaded upstream weights.
  - Do not create fake behavioral parity with LongLive. Reuse shared realtime contracts where they fit, and wait for the selected upstream interface before adding model-output assertions.
- [x] Step 10c: Model artifact and loader handling for realtime video backends.
  - Goal: make LongLive and Self-Forcing model handling explicit, auditable, and low-VRAM-testable before more user-facing realtime nodes depend on it.
  - [x] Artifact manifest task: typed manifests cover base model, checkpoint, text encoder, VAE, VACE/control, LoRA/adapters, configs, formats, source, license notes, and hardware profile.
  - [x] Resolver task: dependency-light resolver maps local/Hugging Face artifacts, reports missing artifacts, and never silently downloads in normal tests.
  - [x] Loader boundary task: file-type-aware loading covers `safetensors`, pickle-gated `pt`/`pth`, and path-reference `gguf`/config/repo artifacts with structured metadata.
  - [x] Compatibility task: manifests report incompatible/unverified candidates and adapter/control target family/size mismatches before model mutation.
  - [x] LoRA task: shared LoRA contracts record provenance, strength, merge mode, target compatibility, and optional dependencies.
  - [x] Quantization task: strategies distinguish pre-quantized artifacts from post-load transforms and record precision, install extras, device needs, and CPU-offload support.
  - [x] VACE/control task: VACE is represented as an optional control-extension contract with load order, control inputs, memory profile, and compatibility reason.
  - [x] Memory task: resolved manifests can report artifact sizes, loaded/offloaded state, dtype/device choices, VRAM/cache values, and low-VRAM fallback decisions.
  - [x] Lifecycle task: lifecycle keys/events make reuse vs unload/reload visible when artifacts, precision, VACE, LoRA, quantization, or sampler settings change.
  - [x] Smoke task: canonical official and RTX 3060 low-VRAM smoke tier plans are opt-in, skipped by default, and carry manifests/reports/lifecycle data.
  - [x] Artifact-backed loader selection task: manifests and smoke tiers now carry loader plans with loader choice, install extras, dtype/device hints, and pickle opt-in requirements.
  - [x] Concrete loader hook task: loader plans can execute through explicit `safetensors`/torch hook callables while preserving pickle opt-in and path-reference behavior.
  - [x] Concrete quantized loader path task: FP8 safetensors, GGUF, and post-load INT8-style transforms can run through explicit dependency-lazy hook callables.
  - [x] VACE runtime configuration task: VACE runtime enablement is gated by explicit env opt-in plus base smoke, license, and memory validation evidence.
  - [x] Runtime memory telemetry hook task: opt-in smoke code can feed live CUDA free/reserved VRAM and cache size into memory reports through injected hooks.
  - [x] Lifecycle ownership task: lifecycle transitions now produce loaded-state ownership for load, reuse, unload/reload decisions.
  - [x] Smoke command task: smoke tiers now produce executable command metadata with env overrides, required artifacts, loader plans, and lifecycle keys.
  - Concrete model candidates: canonical smoke should start with `Wan-AI/Wan2.1-T2V-1.3B`, `gdhe17/Self-Forcing:checkpoints/self_forcing_dmd.pt`, and the official `configs/self_forcing_dmd.yaml` path. RTX 3060 12GB validation should separately evaluate low-VRAM artifacts such as `city96/umt5-xxl-encoder-gguf` (`Q5_K_M` or larger preferred), Wan 2.1 VAE safetensors, and community FP8 Self-Forcing 1.3B safetensors (`e4m3fn` first, `e5m2` fallback if needed).
  - LoRA speed policy: LongLive already has optional lazy `peft` LoRA application for its own checkpoint bundle, but Self-Forcing does not yet have a first-class acceleration-LoRA path beyond generic checkpoint hooks. Do not wire generic "speed LoRA" support until the LoRA is proven compatible with the selected base model size and sampler. In particular, `Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors` is a 14B/lightx2v-style speed artifact, so it should not be used for the 1.3B Self-Forcing RTX 3060 baseline unless a compatible 1.3B variant is identified and tested.
  - VACE policy: VACE should be treated as an optional control-extension track, not a requirement for the base `SelfForcing` node. Candidate inputs are official `Wan-AI/Wan2.1-VACE-1.3B` lineage plus community Self-Forcing/VACE addon safetensors, but the addon cards explicitly describe them as experimental and not a proof of canonical Self-Forcing sampling. Only add a VACE-facing node/config after base Self-Forcing real smoke passes and the loader can prove file compatibility, license compatibility, control inputs, and memory behavior on RTX 3060 12GB.
  - External implementation lessons: adopt concepts, not dependencies, from mature Wan/Comfy-style stacks: declarative artifact manifests and path resolution, safe checkpoint loading by file type, explicit unload/reload on model-parameter changes, LoRA patch compatibility reporting before merge/application, VACE/control modules as separate load-time stages with their own weights and inputs, and VRAM/offload telemetry for low-memory profiles. ComfyUI's GPL core and custom-node ecosystem should remain an interoperability reference, not a runtime dependency.
- [x] Step 11: canonical workflow template.
  - [x] `nodetool-realtime` now ships a discoverable canonical realtime video diffusion example.
  - [x] LongLive/Self-Forcing node IO contracts expose template-ready frame handles.

## Phase 3 - Browser-local realtime analysis contracts

**Goal:** Make lightweight browser/Electron analysis from TensorFlow.js, MediaPipe-compatible models, and Transformers.js a first-class opt-in realtime layer without moving core session, transport, graph execution, or heavy model ownership into the UI.

**Architecture stance**

- Browser/JS realtime inference is an analysis/control layer, not the authoritative realtime runtime.
- Python/server realtime remains the heavy GPU/video generation path for LongLive, Self-Forcing, VACE, LoRA, and future worker placements.
- TypeScript backend realtime remains the session, command, websocket, and graph coordination layer.
- `packages/realtime-browser/` owns browser-local realtime contracts and proof adapters. It should not become a general model package or pull browser-only dependencies into `packages/realtime-nodes/`.
- Existing TF.js/base nodes and Transformers.js provider/node packages are related model ecosystems, but Phase 3 only defines how browser-local outputs participate in realtime sessions.
- Analysis stays off the media plane: only raw pixel/audio buffers use `VideoFrame` / `AudioFrame`; structured outputs use analysis/control events and parameter updates.

**Done when**

- Browser-local realtime analysis can participate in sessions through the same graph/session model.
- TF.js and Transformers.js model loading, caching, backend selection, and progress reporting have a shared surface.
- Pose, landmarks, captions, classifications, embeddings, and similar outputs have explicit event/control contracts instead of ad hoc UI hooks.
- Editor validation can distinguish browser-capable, server-capable, and transport/media nodes.
- Browser-local analysis can be disabled, fail, or fall back without destabilizing server/Python realtime sessions.

**Tasks**

- [x] **Refactor discovery:** find files in realtime repo and nodetool repo that should be cleaned up or refactored before browser/JS realtime inference. Before starting each refactor task, keep the scope small enough to preserve clean boundaries with the rest of Nodetool and avoid regressions or overengineering.
  - [x] Extract realtime job/metrics orchestration from `packages/websocket/src/unified-websocket-runner.ts`; `RealtimeLifecycleOrchestrator` now owns realtime session/job maps and metrics broadcasts while the runner remains the command/job coordinator.
  - [x] Split realtime-only runner behavior in `packages/kernel/src/runner.ts` behind a private module boundary; `RealtimeRunner` already owns session lifecycle and `RealtimeRunBuffers` now owns bounded realtime message/output retention.
  - [x] Extend `packages/protocol/src/messages.ts` with a namespaced inference metrics/loading surface instead of overloading transport-heavy `RealtimeMetrics`; `RealtimeInferenceMetrics` now carries placement, engine/backend, model source, loading/cache/warm state, and throughput telemetry.
  - [x] Add opt-in realtime/browser capability metadata across `packages/node-sdk`, `packages/protocol`, graph serialization, and Python descriptor parity; `realtime_profile` now carries browser capability, browser-frame/WebGPU requirements, and realtime analysis/parameter/media emission hints.
  - [x] Break `web/src/components/realtime/RealtimeStreamPage.tsx` into shell hooks and presentational controls so Phase 4 can reuse it inside editor realtime mode; `useRealtimeStreamController` now owns route/session/WebRTC state and the page composes reusable workflow, controls, active-session, and session-list cards.
  - [ ] Introduce a narrow realtime control-plane client layer around `RealtimeSessionStore`, `RealtimeSessionClient`, and `useRealtimeSessionWebRTC` for session updates plus future analysis events.
  - [ ] Split `packages/websocket/src/realtime/command-handler.ts` into session CRUD/persistence and signaling/transport responsibilities before adding browser inference control verbs.
  - [ ] Split or map `nodetool-realtime/src/nodetool/realtime/model_artifacts.py` into cross-runtime contracts vs Python-only artifact/loader helpers; keep Wan2.1-specific logic scoped away from browser model cache work.
  - [ ] Quarantine or explicitly mark `packages/websocket/src/realtime/webrtc-spike.ts` as test-only if it remains only spike/test support.
  - Do not destabilize LongLive/Self-Forcing real smoke, VACE, or community LoRA paths while they remain opt-in/experimental.

- [ ] Phase 3 implementation sequence for browser-local realtime analysis:
  - [x] Protocol foundation exists: `RealtimeInferencePlacement`, `RealtimeInferenceMetrics`, loading/cache/backend state, and `RealtimeNodeProfile` are defined in shared protocol/SDK metadata.
  - [x] Media-plane foundation exists: `RealtimeFrame` remains pixel/audio only (`VideoFrame` / `AudioFrame`), so analysis outputs must use control/event messages rather than frame routing.
  - [x] Descriptor parity foundation exists: TS/Python metadata can expose `realtime_profile` so editor validation can reason about runtime placement consistently.
  - [x] Runtime placement matrix exists for operator browser, Electron renderer, Node backend, and server worker placements, including allowed engines/backends and validation rules.
  - [x] Browser-only package boundary exists in `packages/realtime-browser/`; keep it dependency-light and separate from server/runtime media nodes.
  - [x] First proof contracts exist behind mocked-by-default loaders: browser hand/landmark-style analysis and frame classification sampled from realtime frames.
  - [x] Typed analysis/control event path exists as `realtime_analysis_event`; keep media buffers on the media plane only.
  - [x] Browser/JS inference metrics can be represented as `realtime_inference_metrics` beside transport `realtime_metrics`.
  - [x] Initial documentation exists in `docs/REALTIME-BROWSER-JS-INFERENCE.md` for placement, package boundary, and browser-output-to-server-graph flow.
  - [ ] Integrate the narrow realtime control-plane client around `RealtimeSessionStore`, `RealtimeSessionClient`, and `useRealtimeSessionWebRTC` so session updates, analysis events, and inference metrics use one predictable client surface.
  - [ ] Decide how `packages/realtime-browser/` consumes or wraps parallel TF.js and Transformers.js package work without duplicating model registries, cache semantics, or provider responsibilities.
  - [ ] Add editor/operator affordances for browser-local nodes: browser-local badges, WebGPU/browser-frame warnings, loading/cache/backend state, and placement validation.
  - [ ] Add the first real browser-local model integration only after the contracts are stable: prefer one MediaPipe/TF.js landmarks path and one Transformers.js sampled-frame classification/caption path with mocked default tests and explicit opt-in loading.
  - [ ] Define the graph mapping from `realtime_analysis_event` payloads to server-side parameter updates, including validation for event schema, node target, and stale frame handling.
  - [ ] Keep production hardening separate from this phase: Electron packaging details, persistent browser model cache UX, remote deployment behavior, and worker routing belong after the contracts and editor integration are proven.

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
- [ ] Add NVIDIA Lyra 2.0 world model generator

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
