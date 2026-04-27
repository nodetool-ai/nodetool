# Realtime Integration Roadmap for NodeTool

## Status

- [x] Phase 1 foundation: contract, session substrate, control plane, first operator surface.
- [x] Phase 2 substrate through backend WebRTC shell, realtime nodes, lifecycle, and metrics.
- [ ] Phase 2 first operator/model proof: visible realtime frame preview plus real source ingress first, then RTX 3060 fake-off model smoke, then LongLive/Self-Forcing validation and low-VRAM loader paths.
- [ ] Phase 3 browser-local realtime analysis contracts.
- [ ] Phase 4 workflow integration.
- [ ] Phase 5 browser-local inference hardening.
- [ ] Phase 6 deployed realtime worker readiness.
- [ ] Phase 7 expansion adapters.

## How to use this plan now

Implement from **Next implementation ladder** downward. Earlier sections capture frozen decisions and constraints; do not re-decide them unless implementation evidence proves they are wrong.

Rules for the remaining work:

- Keep realtime behavior out of `packages/websocket/src/unified-websocket-runner.ts` and `packages/kernel/src/runner.ts`; those files only get small delegation or primitive changes.
- Use the existing workflow runner, inbox, node registry, WebSocket control plane, and job/session model.
- Treat WebRTC/media transport and websocket/control messages as separate planes.
- Prefer short PRs in ladder order. Each step should leave tests passing for the package it touches.
- Top-level unchecked items may include completed foundations. Follow the unchecked subitems in each phase; do not reopen checked foundation work unless new implementation evidence shows it is wrong.

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
  - 9 result: use **Wan-AI/Wan2.1-T2V-1.3B** as the base model source, run the first visible proof on the lightest viable RTX 3060 path, and keep **NVlabs/LongLive** as the first full canonical model-validation path. Keep exact performance claims tied to upstream hardware: LongLive reports 20.7 FPS on one H100 and 24.8 FPS with FP8; local acceptance is tiered rather than universal. CPU smoke tests prove construction, lifecycle hooks, fake-frame processing, and error handling only; they do not assert FPS. H100/A100 performance tests are opt-in and record observed fps/latency through `realtime_metrics`.
  - 9 implementation shape: all heavy model code lands in the existing `nodetool-realtime` skeleton. Thin nodes go under `nodetool-realtime/src/nodetool/nodes/realtime/`, while pipelines, `WeightSource`, hardware/precision helpers, frame converters, fake CPU pipelines, and `LatestPerHandleAccumulator` live under `nodetool-realtime/src/nodetool/realtime/`. Core may receive only small protocol/status surfaces for loading events and hardware hints.
  - 9 loading/precision contract: model nodes emit structured loading phases (`resolving_weights`, `downloading`, `loading_tokenizer`, `loading_vae`, `loading_transformer`, `warming`, `ready`, `error`) with progress and selected precision/backend. `WeightSource` supports local path, Hugging Face repo/file, and cached/default source. Precision selection prefers native FP8 only on capable Ada/Hopper/Blackwell hardware, uses FP16/BF16 where memory allows, and treats GGUF/INT8 community paths as explicit experimental fallbacks until validated.
  - 9 realtime loop contract: `LatestPerHandleAccumulator` is the default input coalescer for model nodes. It keeps the most recent value per media/control handle, preserves sequence/timestamp metadata, reports skipped/dropped input counts to metrics, and never blocks the media/control plane waiting for stale frames. Prompt/control updates are applied at the next model iteration and can trigger model-specific cache refresh such as LongLive KV-recache.
- [ ] **10. First visible realtime loop, then first runnable RTX 3060 fake-off smoke.**
  - Goal: make the canonical realtime workflow visibly operate as a realtime graph before broader model-family validation. The near-term target is: live source/camera or deterministic source frame -> model node -> `VideoSink` -> `Preview`, with raw `realtime_video_frame` pixels visible in the editor. Only after that path is visible should `use_fake_pipeline=False` become the main proof target.
  - Use the existing low-VRAM notes as the starting point: `Wan-AI/Wan2.1-T2V-1.3B`, Self-Forcing RTX 3060 path if it is the lightest runnable option, `city96/umt5-xxl-encoder-gguf` (`Q5_K_M` or larger preferred), Wan 2.1 VAE safetensors, and community FP8 Self-Forcing 1.3B safetensors only as explicit opt-in candidates.
  - Low FPS is acceptable. The pass/fail bar is visible execution, not production throughput.
  - Implementation order from here:
    - [ ] **10.1 Raw realtime frame preview.**
      - Touch: `packages/runtime/src/context.ts` output normalization, `web/src/components/node/OutputRenderer.tsx`, and a small focused renderer under `web/src/components/node/output/`.
      - Do: preserve `realtime_video_frame` objects as frame payloads, not generic asset-like `{type,data}` objects.
      - Do: draw `rgba8` and `rgb8` frames to a canvas using `width`, `height`, `stride`, `pixel_format`, `timestamp_ns`, and `sequence`.
      - Do: render unsupported formats such as `yuv420p` / `nv12` as an explicit unsupported-format message with the frame metadata.
      - Do not: convert frames into encoded `video` assets or start a recording/export feature here.
      - Done when: connecting `VideoSink.frame` to `Preview.value` shows pixels for a fake or deterministic `realtime_video_frame`, and tests cover normalization plus renderer type dispatch.
    - [ ] **10.2 Deterministic source-frame ingress.**
      - Touch: the smallest TS/runtime path that can inject one known `VideoFrame` into a running realtime graph, preferably through existing `VideoSource` / `pushInputValue` / session command surfaces.
      - Do: add a manual/dev-only deterministic frame source path first, before camera complexity, so preview/debugging is repeatable.
      - Do: use latest-frame-wins buffering and preserve `sequence`, `timestamp_ns`, `pixel_format`, and dropped/skipped counts.
      - Do not: block on backend WebRTC RTP decode, browser codec work, or camera permission UX.
      - Done when: a known colored test frame enters `VideoSource` or a model-node `frame` input, reaches `VideoSink`, appears in `Preview`, and the session stops cleanly.
    - [ ] **10.3 Browser camera ingress into the canonical graph.**
      - Touch: existing browser capture/control-plane code from `/realtime`, only enough to feed captured frames into the canonical editor workflow path.
      - Do: reuse `useVideoCapture` / realtime session client concepts where possible, converting browser frames to protocol `VideoFrame` objects at a modest debug cadence.
      - Do: show enough metrics or logs to confirm frame cadence, queue drops, and active target handle.
      - Do not: design the final operator UI, solve remote deployment, or make WebRTC the only ingress path yet.
      - Done when: a camera frame can replace the deterministic source frame in the same graph path and render through `VideoSink` -> `Preview`.
    - [ ] **10.4 Fake pipeline visible smoke.**
      - Touch: canonical `nodetool-realtime` template and smoke/manual run instructions only as needed.
      - Do: run the canonical template with `use_fake_pipeline=True` and prove prompt/control update -> generated `realtime_video_frame` -> `VideoSink` -> `Preview`.
      - Do: record loading events, skipped/dropped handle counts, rough latency, and clean stop behavior.
      - Do not: add real model dependencies or fake “real backend” behavior to satisfy the UI.
      - Done when: the fake pipeline produces visible changing frames in the editor and the run leaves no stuck runner/session/worker.
    - [ ] **10.5 RTX 3060 fake-off smoke.**
      - Touch: `nodetool-realtime` loader/sampler hooks, artifact resolution, and opt-in smoke path.
      - Do: finish/download the selected low-VRAM artifacts through the Hugging Face cache, then wire the minimum real loader/sampler path needed for one generated frame.
      - Do: set `use_fake_pipeline=False` or the equivalent Self-Forcing real mode only after 10.1-10.4 are working, so failures are model/backend failures rather than visibility or ingress failures.
      - Do: log selected precision/backend, CUDA memory/offload state, artifact paths, errors, rough latency/fps, and clean teardown.
      - Do not: validate the full FP8/GGUF/INT8 matrix, VACE, LongLive quality, or official Self-Forcing quality in this step.
      - Done when: one real generated output appears through the same `VideoSink` -> `Preview` path on RTX 3060, even if it is slow.
  - Completion criteria:
    - [ ] Preview can render raw `realtime_video_frame` output from `VideoSink` without converting it to a standard encoded `video` asset.
    - [ ] Launch the canonical realtime workflow template with a real source/camera or deterministic source-frame path.
    - [ ] Launch the same template with the chosen lightweight model path.
    - [ ] Observe one prompt/control update and one generated output path, even if generation is very slow.
    - [ ] Record loading phases, selected precision/backend, memory/offload state, errors, and rough latency/fps through logs or metrics.
    - [ ] Stop the session cleanly without leaving stuck runners, workers, or model state.
  - Current implementation note:
    - [x] Added an opt-in canonical realtime smoke harness for the RTX 3060 Self-Forcing tier; it loads the canonical template, selects the required low-VRAM manifest artifacts only, observes a prompt update/output through injected pipeline hooks in tests, emits JSON-reportable loading/precision/backend/memory/latency/stop state, and fails before model launch when required artifacts are missing.
    - [x] Made realtime model selection visible in Nodetool metadata: `LongLive` and `SelfForcing` `weight_source` fields use the Hugging Face model picker while preserving string/local-path compatibility, Self-Forcing exposes the selected canonical and RTX 3060 candidate recommended models, and the `Self-Forcing RTX 3060 Low VRAM` model pack groups the required FP8 transformer, Q5_K_M UMT5 encoder, and Wan 2.1 VAE for download.
    - [x] Made `LongLive` and `SelfForcing` use explicit `frame` input/output contracts with `realtime_video_frame` metadata, so the canonical template no longer depends on generic `any` handles for model frames.
    - [x] Manual Nodetool UI check found the recommended downloads in the Model Manager Recommended Downloads tab; direct Hugging Face downloads with an authenticated Python `huggingface_hub` path are the practical workaround for slow JS downloader throughput.
    - [ ] Raw realtime preview implementation is partly landed: TS output normalization now preserves `realtime_video_frame` payloads, and the normal output renderer dispatches `rgba8` / `rgb8` frames to a canvas with explicit unsupported-format metadata. Still needs a live `VideoSink.frame` -> `Preview.value` editor smoke after deterministic ingress is available.
    - [ ] Deterministic source-frame ingress is partly landed: the websocket control plane now accepts a session-targeted `push_realtime_frame` command, normalizes a raw `realtime_video_frame`, and routes it through the session media-track mapping into `pushInputValue(input_name, frame, "frame")`; the web realtime client exposes the same command. Still needs a manual/canonical editor smoke proving the pushed frame reaches `VideoSink.frame` -> `Preview.value`, plus browser camera replacement in 10.3.
    - [ ] Browser camera ingress is partly landed: the `/realtime` stream controller now samples the local preview stream at a modest debug cadence, converts browser frames to scaled `rgba8` `realtime_video_frame` payloads, and publishes them through the existing session media-track command path. Still needs a live canonical graph/editor smoke with camera frames replacing the deterministic source and visible through `VideoSink` -> `Preview`.
    - [ ] Fake pipeline visible smoke is partly landed in `nodetool-realtime`: `NODETOOL_REALTIME_FAKE_VISIBLE_SMOKE=1 python -m nodetool.realtime.wan21.rtx3060_realtime_smoke` now runs without model downloads, loads the canonical template, emits a fake Self-Forcing `realtime_video_frame`, verifies the `self_forcing.frame` -> `VideoSink.frame` preview route, and reports loading phases, skipped-handle counts, rough latency, and clean stop state. The canonical template now opts both `LongLive` and `SelfForcing` into CPU fake pipelines so the editor graph can avoid real model loaders for the first visible loop. Still needs a live editor smoke that shows the changing fake frames in `Preview.value`.
    - [ ] Real RTX 3060 run is still blocked on artifact download/resolution and final upstream inference compatibility. The target machine sees an RTX 3060 from the `nodetool` conda env, but the no-download smoke reports missing `self_forcing_fp8_transformer`, `umt5_xxl_encoder_q5_k_m`, and `wan21_vae` until the Hugging Face cache contains those artifacts; the smoke report now includes per-artifact resolved path/existence/missing-reason records so fake-off failures show exactly which cache entries are absent before model launch, the opt-in download path uses `huggingface_hub.hf_hub_download` when `NODETOOL_REALTIME_SMOKE_ALLOW_DOWNLOAD=1`, and the RTX tier launches the Self-Forcing pipeline with low-memory sampler settings plus `fp8` in the validated smoke precision set. Resolved safetensors/GGUF artifacts are now connected to artifact-backed `load_component` / `apply_checkpoint` hooks, with default `safetensors.torch.load_file` support when installed; the sampler factory now runs the checkpoint-applied generator rather than the raw base component, the smoke can wrap the loaded artifact bundle with an env-selected upstream pipeline class once the concrete adapter is known, and post-resolution adapter/sampler failures now preserve resolved artifacts, loading phases, errors, and clean-stop state in JSON output.
    - [ ] Upstream implementation evidence needs a compatibility decision before using the official Self-Forcing path as the 1.3B RTX 3060 baseline: the public `configs/self_forcing_dmd.yaml` currently names `Wan2.1-T2V-14B`, while the lighter community 1.3B FP8/GGUF/VAE candidate set is experimental and about 5.8 GB before any extra runtime/base caches.
  - Defer full LongLive canonical validation, full Self-Forcing official-quality validation, the FP8/GGUF/INT8 matrix, browser-local inference, deployment, Electron packaging, persistent cache UX, full backend WebRTC codec decode/encode, and multi-adapter expansion until this visible loop and first fake-off smoke have run.
- [ ] **10a. Finish LongLive real validation.**
  - Foundation landed: thin node, dependency-lazy backend boundary, `WeightSource`, precision selection, `LatestPerHandleAccumulator`, fake CPU pipeline, frame conversion, sampler boundary, upstream output normalization, loading/error events, package metadata, and opt-in real-smoke config.
  - Remaining completion criteria:
    - [ ] Run real end-to-end inference against downloaded upstream weights.
    - [ ] Validate the canonical smoke path with `Wan-AI/Wan2.1-T2V-1.3B` plus the selected LongLive checkpoint.
    - [ ] Implement and validate real FP8/GGUF/INT8 loader paths only through explicit loader hooks and opt-in smoke tiers.
    - [ ] Record observed latency/fps, loading lifecycle, cache refresh, dropped/skipped handle counts, and memory/offload data through existing metrics surfaces.
- [ ] **10b. Finish Self-Forcing real validation.**
  - Foundation landed: provenance gate, thin node scaffold, dependency-lazy backend boundary, selected upstream sampler adapter, precision guard, package metadata, and opt-in smoke config parsing.
  - Canonical source: `guandeh17/Self-Forcing` / `gdhe17/Self-Forcing`, Apache-2.0, built on `Wan-AI/Wan2.1-T2V-1.3B`, with documented checkpoint `checkpoints/self_forcing_dmd.pt`.
  - Remaining completion criteria:
    - [ ] Wire real loader/checkpoint hooks against downloaded upstream weights.
    - [ ] Run opt-in real smoke through the official Self-Forcing checkpoint and selected sampler interface.
    - [ ] Validate GGUF/community pre-quantized weights on Ampere/low-VRAM hardware only through opt-in tests or scripts.
    - [ ] Keep community Self-Forcing/VACE FP8/GGUF weights experimental until source, license, compatibility, and quality are checked for the exact selected source.
    - [ ] Do not create fake behavioral parity with LongLive; wait for the selected upstream interface before adding model-output assertions.
- [x] **11. Build the canonical realtime workflow template.**
  - [x] Added `nodetool-realtime` package example `Canonical Realtime Video Diffusion` with camera/source, prompt and negative-prompt controls, LongLive, Self-Forcing, sink/preview, and session info.
  - [x] Added template notes for reconnect/session behavior, `realtime_metrics`/loading-event display, and explicit save/export hook placement.
  - [x] Exposed explicit model node input/output handles so the template can route `frame`, `loading_events`, and skipped-handle data without relying on a generic output slot.
- [ ] **12. Integrate browser-local realtime analysis lane.**
  - Treat browser JS as an opt-in analysis/control layer, not a second authoritative realtime runtime.
  - Use the Phase 3 contracts already in place: placement matrix, `realtime_profile`, `realtime_analysis_event`, `realtime_inference_metrics`, and `packages/realtime-browser/`.
  - Next work is integration: control-plane client, editor/operator affordances, graph mapping from analysis events to parameter updates, and coordination with existing TF.js/base-node plus Transformers.js packages.
  - Real model loading comes after the integration path is stable and stays mocked-by-default in tests.
- [ ] **13. Make realtime work from deployed NodeTool workers.**
  - Treat this as deployment hardening for the existing NodeTool deploy path, not a separate cloud runner.
  - Must-have: HTTPS/WSS, auth, proxy, ICE/STUN/TURN, worker placement, metrics, reconnect, and public output URL behavior.
  - Nice-to-have: WHIP/WHEP, remote media brokering, entitlements, multi-region routing, and richer operations dashboards.

## Core decisions

- **Realtime is a workflow execution mode.** It belongs to the normal NodeTool workflow model, editor, persistence, and operator surfaces. Realtime sessions should be tracked as standard Jobs, and outputs should be savable as standard Assets.
- **The first runtime stays separate internally.** It should align with workflow identity, preview routing, and control semantics so later convergence remains straightforward.
- **The first visible proof targets a complete operator loop, then RTX 3060.** First make raw `realtime_video_frame` output visible in the editor and prove real source/camera ingress through the canonical graph. Then make one lightest viable Wan2.1 1.3B path run fake-off end-to-end on RTX 3060, even slowly, before hardening LongLive and Self-Forcing validation paths or expanding to StreamDiffusion V2, MemFlow, RewardForcing, Krea, and streaming VACE.
- **Control plane and media plane are separate.** Session lifecycle, control updates, diagnostics, preview notifications, and status stay on the workflow/websocket control plane. High-rate media uses a dedicated adapter boundary.
- **WebRTC is the web media adapter boundary.** High-framerate web audio/video should use WebRTC or a similar UDP-based protocol rather than the WebSocket control plane.
- **Existing workflow nodes remain the default building blocks.** Add realtime-specific nodes only for distinct live source, sink, adapter, or control roles.
- **`nodetool.realtime` is the namespace for realtime-category nodes.** Do not duplicate ordinary workflow nodes under this namespace.
- **NDI and Spout are committed later goals.** Reserve clean media adapter boundaries for NDI, Spout, Syphon, MIDI, OSC, DMX, and timecode.
- **Shared files hold primitives; dedicated files hold realtime behavior.** `unified-websocket-runner.ts` and `runner.ts` should only gain small surfaces. Realtime behavior lives in `packages/websocket/src/realtime/*` and `packages/kernel/src/realtime-runner.ts`.
- **Substrate lives in core; model nodes live outside the substrate.** Core owns runner/session/WebRTC substrate, TS I/O nodes, protocol frame types, bridge verbs, lifecycle hooks, and hardware hints. `nodetool-realtime` owns heavy Python model code, `WeightSource`, Wan2.1 pipelines, GGUF loading, and ML dependencies.
- **Model proof design is now fixed for implementation.** `nodetool-realtime` already exists as the sister package skeleton. Step 10 should prove the canonical realtime workflow in two layers: first visible raw frame routing/source ingress, then one lightest viable RTX 3060 fake-off model path before full LongLive and Self-Forcing validation, using the step 9 `WeightSource`, precision/hardware hints, loading events, fake CPU smoke tests, and `LatestPerHandleAccumulator` pattern.

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
- Server-side WebRTC termination and frame-router boundaries exist. Decoded media is not yet delivered into the backend graph because the codec bridge intentionally reports unsupported; Step 10 should not wait on full backend WebRTC codec decode if a simpler browser-capture/source-frame injection path can prove the graph loop first.
- Realtime lifecycle, bounded teardown, terminal-session retention, and control-plane metrics exist.
- `nodetool-realtime` exists as a pre-alpha sister-package skeleton with lean base dependencies, precision extras reserved for `fp8`, `gguf`, and `int8`, thin node stubs under `src/nodetool/nodes/realtime/`, and heavy pipeline/utilities namespace under `src/nodetool/realtime/`.
- `LongLive` and `SelfForcing` now expose `frame` handles with `realtime_video_frame` metadata. The remaining UI gap is rendering raw realtime frames in `Preview` instead of falling through to generic object/asset handling.
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
- [ ] Step 10: first visible realtime loop, then first runnable RTX 3060 fake-off smoke.
  - Current source of truth: use the Step 10 entry in **Next implementation ladder** above for candidates, acceptance criteria, landed implementation notes, and current blockers.
  - Summary: smoke harness, frame contracts, and UI/download metadata are in place, but Step 10 remains open until `realtime_video_frame` previews render visibly, a real source/camera or deterministic source-frame ingress path feeds the canonical graph, the required artifacts are resolved/downloaded, one real fake-off generation runs through the canonical template, metrics/logs capture loading/precision/backend/memory/errors/latency, and the session stops cleanly.
- [ ] Step 10a: LongLive real validation.
  - Purpose: prove the first heavy Python realtime video model against real downloaded weights while keeping normal tests dependency-light.
  - Landed foundation:
    - [x] Thin `LongLive` node, `WeightSource`, precision selection, `LatestPerHandleAccumulator`, fake CPU pipeline, and smoke tests.
    - [x] Real-mode backend boundary with dependency-guarded loading and structured loading `error` events when optional ML dependencies are absent.
    - [x] CPU `VideoFrame` conversion, prompt/negative-prompt cache-refresh tracking, sampler input/output conversion, sampler reset/close delegation, and upstream output normalization.
    - [x] Lazy Wan2.1 component loading plan for tokenizer/VAE/transformer plus `longlive_base.pt` checkpoint application and metadata.
    - [x] Configurable upstream pipeline/sampler interface with constructor/call/inference argument-name mapping, signature guards, async call support, and clear mismatch errors.
    - [x] Package metadata discoverability for `LongLive` and `SelfForcing`.
    - [x] Opt-in `NODETOOL_LONGLIVE_REAL_SMOKE=1` config parsing without downloads in the normal test suite.
    - [x] Quantized loader guard metadata and explicit loader/checkpoint hook points for future FP8/GGUF/INT8 paths.
  - Open tasks:
    - [ ] Run real end-to-end inference against downloaded upstream weights.
    - [ ] Validate the canonical smoke path with `Wan-AI/Wan2.1-T2V-1.3B` plus the selected LongLive checkpoint.
    - [ ] Implement and validate real FP8/GGUF/INT8 loader paths only through explicit loader hooks and opt-in smoke tiers.
    - [ ] Record observed latency/fps, loading lifecycle, cache refresh, dropped/skipped handle counts, and memory/offload data through existing metrics surfaces.
  - Constraints:
    - Keep heavy ML imports dependency-lazy.
    - Do not silently fall back from explicitly requested experimental precision paths.
    - Do not turn opt-in real smoke into default test-suite behavior.
- [ ] Step 10b: Self-Forcing real validation.
  - Purpose: prove the selected upstream Self-Forcing path using the shared realtime/model-loading contracts rather than inventing a parallel stack.
  - Landed foundation:
    - [x] Provenance gate for `guandeh17/Self-Forcing` / `gdhe17/Self-Forcing`, Apache-2.0, Wan2.1 T2V 1.3B compatibility, and documented checkpoint `checkpoints/self_forcing_dmd.pt`.
    - [x] Thin `SelfForcing` node scaffold with dependency-lazy pipeline/backend boundary and latest-value prompt/negative-prompt handling.
    - [x] Backend scaffold with explicit base-model loader, checkpoint applier, and sampler hooks.
    - [x] Selected-upstream sampler adapter for the official `CausalInferencePipeline.inference(noise=..., text_prompts=..., return_latents=True, low_memory=...)` surface.
    - [x] Precision guard using the same CUDA-aware `auto` path as LongLive, with explicit hook validation for FP8/GGUF/INT8.
    - [x] Opt-in `NODETOOL_SELF_FORCING_REAL_SMOKE=1` config parsing without importing heavy modules in the default suite.
  - Open tasks:
    - [ ] Wire real loader/checkpoint hooks against downloaded upstream weights.
    - [ ] Run opt-in real smoke through the official Self-Forcing checkpoint and selected sampler interface.
    - [ ] Validate GGUF/community pre-quantized weights on Ampere/low-VRAM hardware only through opt-in tests or scripts.
    - [ ] Add model-output assertions only after the selected upstream interface is actually running.
  - Constraints:
    - Reuse LongLive contracts where they fit: `WeightSource`, loading phases, precision guards, `LatestPerHandleAccumulator`, frame conversion, sampler lifecycle, opt-in real smoke, and dependency-lazy imports.
    - Keep community Self-Forcing/VACE FP8/GGUF weights experimental until source, license, compatibility, and quality are checked for the exact selected source.
    - Do not create fake behavioral parity with LongLive.
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
  - [x] Introduce a narrow realtime control-plane client layer around `RealtimeSessionStore`, `RealtimeSessionClient`, and `useRealtimeSessionWebRTC` for session updates, metrics, signaling state, and future analysis events. `useRealtimeControlPlane` is now the frontend session/control surface; the incubation page and WebRTC hook consume it instead of reaching into store/client internals directly.
  - [x] Split `packages/websocket/src/realtime/command-handler.ts` into session CRUD/persistence, runner parameter routing, and signaling/transport responsibilities before adding browser inference control verbs. `RealtimeSessionCommandService` owns start/stop and job metadata persistence, `routeRealtimeParameterUpdates` owns live runner updates, and `RealtimeSignalingTransport` owns WebRTC/control signaling.
  - [x] Quarantine or explicitly mark `packages/websocket/src/realtime/webrtc-spike.ts` as test-only if it remains only spike/test support. The werift spike now lives under `packages/websocket/src/realtime/test-support/` and is only imported by its spike test.
  - [x] Map `nodetool-realtime/src/nodetool/realtime/model_artifacts.py` boundaries before doing a deep split: identify cross-runtime contracts, Python-only artifact/loader helpers, and Wan2.1-specific manifest/runtime logic. Only extract modules when real loader/cache work needs the split.
    - Cross-runtime contract candidates: frozen dataclasses and public helpers for `ModelArtifact`, `ArtifactManifest`, `ResolvedArtifact`, `ResolveSummary`, compatibility reports, loader plans/results, LoRA/VACE/quantization contracts, memory telemetry reports, lifecycle keys/events, smoke tiers, and smoke command plans.
    - Python-only artifact/loader helpers: `resolve_artifact_manifest`, `load_artifacts_from_plan`, `load_resolved_artifact`, loader hook dispatch, pickle opt-in, `safetensors`/torch/GGUF path-reference handling, local/Hugging Face resolution, runtime memory hooks, and low-VRAM fallback decisions.
    - Wan2.1/model-specific manifests and runtime policy: `default_longlive_artifact_manifest`, `default_self_forcing_artifact_manifest`, `rtx3060_self_forcing_artifact_manifest`, Self-Forcing smoke tiers/commands, VACE opt-in gating, community FP8/GGUF candidates, and compatibility checks for target family/size.
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
  - [x] Integrate the narrow realtime control-plane client around `RealtimeSessionStore`, `RealtimeSessionClient`, and `useRealtimeSessionWebRTC` so session updates, analysis events, and inference metrics use one predictable client surface.
  - [ ] Write the minimal browser inference ownership matrix before wiring real models:
    - `packages/realtime-browser/` owns realtime loader state, frame sampling, analysis-event construction, proof adapter interfaces, and metrics helpers only.
    - `packages/transformers-js-nodes/` owns Transformers.js model IDs, pipeline tasks, cache path/download helpers, and `getPipeline`/`loadTransformers` semantics.
    - `packages/transformers-js-provider/` remains the only Transformers.js `BaseProvider` for chat/audio/embeddings/provider discovery.
    - Existing TF.js workflow nodes remain in `packages/base-nodes/src/nodes/lib-tensorflow.ts`; browser realtime should use injected detectors/adapters or a documented browser-safe wrapper instead of duplicating the Node/sharp image path.
    - Add `packages/realtime-browser` to build/web/electron references only when a shipping target imports it.
  - [ ] Wire the minimum editor/operator affordance needed to identify browser-local nodes:
    - Add a `RealtimeNodeBadges` or equivalent node-header component that consumes `getRealtimeNodeBadges(metadata)`.
    - Add static metadata warnings for `requires_webgpu` and `requires_browser_frame`; defer live `navigator.gpu` and camera-permission checks to Phase 5.
    - Show only enough `realtime_inference_metrics` state to debug the proof path: loading status, selected backend, cache hit/miss, and error text.
    - Call `validateRealtimeNodePlacement` where placement/engine/backend can be selected, and show validation reasons using existing warning/validation UI patterns.
  - [ ] Implement the simplest `realtime_analysis_event` -> parameter-update mapping that can support one proof adapter:
    - Define allowed `event` names and payload schemas per browser-local `node_type`, with optional payload versioning.
    - Prefer a client-side mapper that calls `update_realtime_session` unless implementation evidence requires a server-owned command.
    - Define how mapper outputs target `nodetool.realtime.Parameter` names, and validate session ownership, active job, emitting node, event allowlist, payload shape, and payload size.
    - Use latest-value-wins for stale frames; defer advanced ack/failure protocols to Phase 5 unless unrouted keys block the proof.
  - [ ] Add one real browser-local model adapter after the ownership matrix and mapping are stable:
    - Choose one proof path, not two: prefer a MediaPipe/TF.js landmarks detector if the goal is camera analysis, or a Transformers.js sampled-frame classifier/captioner if the goal is package reuse.
    - Use injected loader/model interfaces, mocked default tests, explicit opt-in loading, and `BrowserRealtimeModelLoader` metrics.
    - Acceptance check: no duplicate model catalog, cache root, or provider discovery path is introduced.

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

## Phase 5 - Browser-local inference hardening

**Goal:** Harden browser/Electron local inference after the minimal analysis path proves useful.

This phase is deliberately after Phase 3 and Phase 4. Do not pull it into the first proof unless the proof cannot run without it.

**Done when**

- Browser-local nodes report useful runtime capability and loading state.
- Model cache behavior is understandable and does not duplicate existing TF.js or Transformers.js ownership.
- Operator failures are visible without breaking server/Python realtime sessions.

**Tasks**

- [ ] Add runtime-aware browser capability checks: `navigator.gpu`, camera permission/media-stream state, and Electron renderer differences.
- [ ] Expand per-node inference UI beyond the proof path: placement, engine, selected backend, fallback backend, loading progress, cache state, warm state, throughput, and errors.
- [ ] Decide whether any server-owned analysis mapping command is needed after the client-side mapper proves or fails; add explicit ack/failure behavior only if needed.
- [ ] Define persistent browser model cache UX and cleanup policy.
- [ ] Add a second browser-local adapter only after the first one proves the package boundary and graph mapping.
- [ ] Add Electron packaging notes for browser-local model assets, WASM/WebGPU requirements, and offline behavior.

## Phase 6 - Deployed realtime worker readiness

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

## Phase 7 - Expansion adapters

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
- [ ] Integrate WHIP/WHEP endpoints from Phase 6 into adapter discovery and workflow templates.
- [ ] Add optional remote brokering and entitlement layers if Phase 6 proves they are needed beyond deployment hardening.
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
