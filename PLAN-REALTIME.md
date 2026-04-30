# Realtime Execution Plan

## Goal

Build the first user-visible Nodetool realtime workflow:

```text
Video Source -> Self-Forcing RTX 3060 profile -> VideoSink -> Preview
```

Success means a user selects a camera, starts the workflow, and sees generated model output in the normal Nodetool `Preview` node on RTX 3060-class hardware.

## Code map (source of truth)

Authoritative implementation is **this repo** (`nodetool`) plus the **`nodetool-realtime`** Python package (sibling workspace). **Daydream Scope (`scope-main`) is for insights only** (e.g. separating media from control, loader ergonomics). Do not treat it as a second tree to mirror or port from wholesale.

| Layer | Location | Role |
|--------|----------|------|
| Python models & bridge | `nodetool-realtime/src` (`nodetool.*`, `nodetool_wan_bridge`) | Self-Forcing / Wan load paths, `create_components`, artifact manifests, PyTorch / HF stack. |
| Realtime graph nodes (TS) | `packages/realtime-nodes/` | Editor node types (`VideoPassthrough`, `VideoSink`, `Parameter`, …), outputs/handles, realtime-capable metadata. |
| tRPC session API | `packages/websocket/src/trpc/routers/realtime.ts` | List/get session records via `realtimeSessionManager` (control plane metadata, not video payloads). |
| WebSocket realtime | `packages/websocket/src/realtime/` | Media bus, frame push, command handler, paced outbound sender (Phase R data plane). |
| Realtime job shell | `packages/kernel/src/realtime-runner.ts` | `RealtimeRunner`: `WorkflowRunner` with `runMode: "realtime"`, warm hooks, background processing lifecycle. |
| Core DAG runner | `packages/kernel/src/runner.ts` | Shared graph execution; realtime-specific skips/throttles per Phase R. |
| Browser client | `web/src/` (e.g. `RealtimeSessionStore`, camera publisher, canvas preview) | Paced capture, `realtime_frame_out` handling, rAF preview. |

## Phase R - Realtime Rewrite (top priority, blocks all model work)

The realtime path has never reached usable speed. Apr 30 evidence with no model in the graph: 0.7 fps, 14 s frame age. Diagnosis (below) shows the cause is architectural — video frames are forced through the workflow control message bus, every outbound message shares one `sendLock`, the polling drain is `Array.shift()` on an unbounded array with a 10 ms floor, the camera publisher is RTT-coupled (`maxInFlightFrames = 1`), and every frame triggers Zustand fan-out and log appends in the browser.

Phase R rebuilds the realtime data plane around a per-session media bus and a paced output sender. Control plane (`node_update`, `edge_update`, `realtime_session_*`, `realtime_metrics`) stays on the existing message bus but is rate-limited in realtime mode.

The whole realtime path is still pre-MVP, so Phase R is a clean rewrite, not an optimisation pass. Anything not on the camera -> media bus -> sink -> canvas path is fair game to delete or defer.

### Architecture target

```text
Browser                                  Server
─────────                                ────────
[Camera] ──push_realtime_frame (bin)──→  RealtimeMediaBus (per session)
                                           inputs[node, handle]  = {frame, seq, ts}
                                           outputs[node, handle] = {frame, seq, ts}
                                           single-slot, latest-wins, drop-oldest

[Canvas] ←─realtime_frame_out (bin)────  RealtimeFrameSender (30 Hz pacer)
  rAF blit, single ref,                    for each (session, sink):
  no Zustand on frame                        if bus.output[sink].seq advanced -> send
                                             else skip

WebSocket lanes (logical, same socket):
  control: small msgs (job_update, node_update, edge_update,
           realtime_session_*, realtime_metrics) -- rate-limited in realtime mode.
  media:   binary frame payloads (push_realtime_frame in,
           realtime_frame_out out) -- bypass workflow message queue.

Realtime nodes pull from / push to MediaBus directly via a new
onRealtimeTick hook. NodeInbox/NodeActor are NOT used for media
handles in realtime mode. output_update is NOT emitted for streaming
media handles.
```

### Acceptance gate (must clear before any Wan/Self-Forcing work)

Camera -> VideoPassthrough -> VideoSink -> Preview, no model in graph:

- Output fps >= 30 sustained for 30 s on localhost.
- Frame age < 100 ms p99.
- No per-frame `appendLog` / `addToHistory` / `setOutputResult` for `realtime_video_frame`.
- Server holds at most one queued frame per (session, node, handle).
- WebSocket sends <= 35 video messages/sec server -> browser regardless of camera rate.
- ack RTT < 5 ms p99 under load.

### R.0 - Strip non-MVP surface area

- [ ] **R.0.1 Defer WebRTC server scaffolding.**
  - Move into `packages/websocket/src/realtime/_legacy/` (kept compiled, not imported by the active path): `codec-bridge.ts`, `webrtc-server.ts`, `webrtc-session.ts`, `signaling-transport.ts`.
  - Drop their wiring from `command-handler.ts`. `handleSignal` returns "WebRTC transport is not enabled in this build" until Phase 3.
  - Acceptance: `command-handler.ts` does not import any of the four files; `npm run typecheck` passes; the realtime page still starts a session in `frame_push` mode.



- [ ] **R.0.4 Drop the polling drain in `streamJobMessages`.**
  - Files: `packages/runtime/src/context.ts`, `packages/websocket/src/unified-websocket-runner.ts`.
  - Replace `popMessage()` polling + `setTimeout(10)` with `ProcessingContext.setOnMessage(...)` event delivery (the field already exists). Bound `_messages` or remove it for realtime jobs since the bus replaces it for media.
  - Acceptance: no `Array.shift()` on the hot path; no 10 ms wait floor; job lifecycle terminal-message bookkeeping still works.

- [ ] **R.0.5 Stop emitting `output_update` for streaming media handles.**
  - Files: `packages/kernel/src/runner.ts`, `packages/protocol/src/messages.ts`, `packages/websocket/src/unified-websocket-runner.ts`.
  - In `_sendMessages`, skip `output_update` emission when the source handle is `is_realtime_capable && is_streaming_output && handle type === "realtime_video_frame"`.
  - Drop the `nodeType !== "nodetool.realtime.VideoSink"` special case in `streamJobMessages`. Sinks publish via the new media path, not via `output_update`.
  - Acceptance: in the passthrough-only graph, no `output_update` messages are sent for `frame` handles. Existing one-shot `output_update` behaviour is unchanged for non-realtime workflows.

### R.1 - Server: RealtimeMediaBus + ingress

- [ ] **R.1.1 Add `RealtimeMediaBus`.**
  - New file: `packages/websocket/src/realtime/media-bus.ts`.
  - Per session, two maps keyed by `${nodeId}:${handle}` to `{frame: VideoFrame, sequence: number, receivedAt: number}`. Single-slot, latest-wins.
  - API: `setInput`, `getLatestInput`, `setOutput`, `getLatestOutput`, `subscribeOutputs(sessionId, callback)`, `clearSession`, `metrics(sessionId)`.
  - Per-slot counters: `framesAccepted`, `framesDropped`, `lastSequence`.
  - Acceptance: focused test pushes 1000 frames into one slot, verifies only the last is retained, sequence is monotonic, drop counter is 999.

- [ ] **R.1.2 Wire push-frame ingress to MediaBus and delete `frame-router.ts`.**
  - Files: `packages/websocket/src/realtime/command-handler.ts`, `packages/websocket/src/realtime/frame-router.ts` (delete), session record handling.
  - At session start, build a `trackId -> {nodeId, handle}` map and cache it on the session record.
  - `handlePushFrame` does the lookup once and calls `mediaBus.setInput(...)` directly. No per-frame `FrameRouter` allocation.
  - Acceptance: `handlePushFrame` allocates no per-frame router; `realtime_metrics` shows accurate `framesAccepted` / `framesDropped` from the bus.

- [ ] **R.1.3 Add `onRealtimeTick` hook and wire VideoSource / VideoPassthrough / VideoSink.**
  - Files: `packages/node-sdk/src/...` (BaseNode realtime hook), `packages/kernel/src/realtime-runner.ts`, `packages/realtime-nodes/src/nodes/video-passthrough.ts`, `packages/realtime-nodes/src/nodes/video-sink.ts`, `packages/base-nodes/src/nodes/video.ts` (`VideoSource.realtime_frame` adapter behaviour).
  - Hook signature: `onRealtimeTick(ctx, mediaBus, sessionId): Promise<void>`. Realtime-capable nodes implement this and stop relying on `inputs.stream("frame")` for media handles.
  - The runner's tick loop is driven by upstream input-slot sequence advances; on advance, it walks the realtime sub-graph in topological order and invokes each node's `onRealtimeTick`.
  - Acceptance: in the passthrough graph, every camera frame produces an advance on `VideoSink.frame`'s output slot within one tick.

### R.2 - Server: paced output sender + lock split

- [ ] **R.2.1 Add `RealtimeFrameSender` (30 Hz pacer).**
  - New file: `packages/websocket/src/realtime/frame-sender.ts`.
  - Per active session, a 30 Hz tick. For each registered sink (node, handle): if `getLatestOutput(...).sequence` advanced since last sent, send a binary `realtime_frame_out` message with `{ session_id, node_id, output_name, sequence, frame }`. Otherwise skip.
  - Sender writes via a dedicated send path, not via `streamJobMessages`.
  - Started by lifecycle orchestrator on session start, stopped on session stop.
  - Acceptance: focused test pushes 100 sink frames in 100 ms, sender emits <= 4 messages in that interval; sequences are monotonic and reflect the latest produced frame, not an older one.

- [ ] **R.2.2 Split `sendLock` into control and media lanes.**
  - File: `packages/websocket/src/unified-websocket-runner.ts`.
  - Two lanes: `controlSendLock` (for tiny messages, including `realtime_session_ack`) and `mediaSendLock` (for binary frame payloads). Route by message type or by an explicit `lane` argument on `sendMessage`.
  - Acceptance: under load (60 fps publisher + 30 Hz sink), p99 ack RTT < 5 ms over localhost. Frame sends queue against media lane only.

- [ ] **R.2.3 Rate-limit `edge_update` in realtime mode.**
  - File: `packages/kernel/src/runner.ts`.
  - When `runMode === "realtime"`, emit at most one `edge_update` per second per edge. Counter still increments on every traversal; only the message is throttled.
  - Acceptance: under 60 fps load, total `edge_update` messages per session <= `edges` per second.

### R.3 - Browser: dedicated receive + canvas + paced publisher

- [ ] **R.3.1 Browser handler for `realtime_frame_out`.**
  - Files: `web/src/lib/websocket/RealtimeSessionClient.ts`, `web/src/stores/RealtimeSessionStore.ts`, `web/src/lib/websocket/GlobalWebSocketManager.ts`.
  - Dispatch `realtime_frame_out` to a dedicated handler that writes the latest frame into a `useRef`-backed slot in `RealtimeSessionStore`. Do not call `set(...)` on the store on every frame; only update non-frame fields (last sequence, received timestamp) on a 1 Hz heartbeat.
  - Skip `setOutputResult`, `addToHistory`, `appendLog` for `realtime_video_frame` outputs entirely.
  - Acceptance: profiler shows zero React re-renders per incoming frame in the editor and on the realtime page.

- [ ] **R.3.2 Canvas renderer with rAF blit.**
  - File: `web/src/components/node/output/RealtimeVideoFrameRenderer.tsx`.
  - On mount, take a `<canvas>` ref, start a single rAF loop that reads the current frame from the shared ref and `putImageData` (or `drawImage` from a cached `ImageBitmap`).
  - On unmount, cancel the rAF.
  - Acceptance: profiler shows one rAF tick per painted frame; canvas keeps up at 30 fps without dropped paints under steady load.

- [ ] **R.3.3 Camera publisher: paced + multi-in-flight.**
  - File: `web/src/hooks/realtime/useRealtimeCameraFramePublisher.ts`.
  - Default `framePushMode: "paced"` at 30 Hz.
  - Increase `maxInFlightFrames` to 3 since the server now decouples ack from media (R.2.2).
  - On consecutive ack timeouts (> 250 ms), drop in-flight count to zero and resume from the next captured frame.
  - Acceptance: at 30 Hz target, sustained `framesPushed` ~= 30/s with `framesSkipped` low; brief network hiccup recovers without piling up.

### R.4 - Diagnostics + perf gate

- [ ] **R.4.1 Realtime metrics surface.**
  - Files: `packages/protocol/src/realtime-frame.ts`, `packages/websocket/src/realtime/...`, `web/src/components/realtime/RealtimeOutputPreviewCard.tsx`, `web/src/components/realtime/RealtimeModelStatusCard.tsx`.
  - Server emits `realtime_metrics` ~1 Hz with: per-input `framesAccepted` / `framesDropped` / `lastSequence`, per-output `framesSent` / `framesDroppedByPacer`, per-node `lastError` / `lastTickDurationMs`, lane queue depths.
  - Browser shows: in-fps, out-fps, frame age, server send-queue depth, last error.
  - Acceptance: numbers update at least once per second while a session is running and zero on stop.

- [ ] **R.4.2 Verify the perf gate.**
  - Run the passthrough-only template, watch the diagnostics for 30 s on the user's RTX 3060 box.
  - Record numbers in this plan: `before:` (current 0.7 fps / 14 s age) and `after:` once R.0 - R.3 land.
  - Acceptance: matches the gate above (>= 30 fps, < 100 ms age, <= 35 video msgs/s out, <= 1 queued frame per slot, < 5 ms ack RTT).

### R.5 - Self-Forcing pipeline real frame

These tasks are intentionally last; they assume the acceptance gate has been met.

**Call chain (read before touching any file):**
```
SelfForcing node
  → LazySelfForcingBackend.load()
      base_model  = load_component("base_model", model_paths=...)
                    → create_community_low_vram_component_builder()(loaded, model_paths=...)
                    → nodetool_wan_bridge.create_components(config)   ← ONLY STUB
      generator   = apply_checkpoint(base_model)
                    → if base_model has .inference: return as-is      ← take this path
  → SelfForcingCausalSampler(pipeline=generator)
  → pipeline.inference(noise, text_prompts, return_latents, low_memory)
       → {"video": THWC float32 [0,1], "latents": optional, "metadata": dict}
```

`create_components(config: CommunityLowVramBridgeConfig)` receives:
- `config.transformer_path` — FP8 safetensors (cached: `lym00/.../Wan2.1_T2V_1.3B_SelfForcing_DMD-FP8_e4m3fn.safetensors`)
- `config.text_encoder_path` — GGUF (cached: `city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q5_K_M.gguf`)
- `config.vae_path` — BF16 safetensors (cached: `Kijai/WanVideo_comfy/Wan2_1_VAE_bf16.safetensors`)
- `config.runtime_path` — Wan 2.1 T2V 1.3B base dir for `config.json` + tokenizer (**not cached as weights; see R.5.1.a**)
- `config.block_swap_blocks = 16`, `text_encoder_device = "cpu"`, `transformer_device = "cuda"`, `vae_device = "cuda"`

Return an object where `.inference(noise, text_prompts, return_latents, low_memory)` is callable.
`apply_checkpoint` will detect `.inference` and pass it straight through — no wrapping needed.

---

- [ ] **R.5.1.a Resolve `runtime_path` — fetch Wan 2.1 T2V 1.3B config files only.**
  - File: `nodetool-realtime/src/nodetool/realtime/model_artifacts.py` (artifact manifest).
  - `Wan-AI/Wan2.1-T2V-1.3B` full weights are not cached. We only need `config.json`, `tokenizer` directory, and `generation_config.json` — not the `diffusion_pytorch_model*.safetensors` weights.
  - Use `huggingface_hub.snapshot_download("Wan-AI/Wan2.1-T2V-1.3B", ignore_patterns=["*.safetensors", "*.bin", "*.pt"])` to fetch config + tokenizer only (~few MB).
  - Update `rtx3060_self_forcing_artifact_manifest()` so `runtime_files` resolves to the config-only download and does not require the full weight files.
  - Alternatively: if diffusers `WanTransformer3DModel` can be initialized from a hardcoded config dict, skip the download and remove `runtime_path` from the community bridge path entirely.
  - Acceptance: `CommunityLowVramBridgeConfig.runtime_path` points to a directory containing a valid `config.json`; `create_components` no longer fails on a missing base model.

- [ ] **R.5.1.b Pick and wire the GGUF text encoder library.**
  - File: `nodetool-realtime/pyproject.toml`, `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - Add `llama-cpp-python` (or `ctransformers` with UMT5 support) to the `[gguf]` extra in `pyproject.toml`.
  - In `create_components`, load `config.text_encoder_path` with the chosen library on `config.text_encoder_device`.
  - Wrap it so `encode(text_prompts: list[str]) -> {"prompt_embeds": tensor [batch, seq_len, hidden]}` works.
  - Scope's `WanTextEncoderWrapper.forward` signature is the reference: returns `{"prompt_embeds": context}` with shape `[batch, seq_len, 2048]`.
  - Acceptance: `encode(["a sunrise over mountains"])` returns a tensor on the target device with no import errors.

- [ ] **R.5.1.c Load FP8 transformer and Wan VAE.**
  - File: `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - **Transformer:** use `diffusers.models.WanTransformer3DModel.from_config(config_dir)` to init architecture from `runtime_path/config.json`, then `load_state_dict` from `config.transformer_path` (safetensors). Move to `config.transformer_device`. Reference: Scope's `WanDiffusionWrapper` meta-device → CPU load → GPU pattern (`self_forcing_rtx3060.py:_loaded_transformer_state`).
  - **VAE:** use `diffusers.models.AutoencoderKLWan.from_single_file(config.vae_path)` or load state dict into `AutoencoderKLWan`. Move to `config.vae_device`. Reference: Scope's `WanVAEWrapper` loading pattern.
  - Block-swap: when `low_memory=True`, move transformer blocks off GPU between denoising steps using `config.block_swap_blocks`. Scope's `pipeline_processor.py` block-swap pattern is the reference.
  - Acceptance: both models load on the RTX 3060 without OOM at rest (before inference); `torch.cuda.memory_allocated()` < 10 GB after load.

- [ ] **R.5.1.d Implement the inference loop in `create_components`.**
  - File: `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - Return a dataclass/object with `inference(noise, text_prompts, return_latents, low_memory)`:
    1. Encode `text_prompts[0]` → `prompt_embeds` (cache; only re-encode on prompt change).
    2. DMD denoising: 4 steps at `[1000, 750, 500, 250]` through the transformer with KV cache as a fixed-window ring buffer (not unbounded). Block-swap between steps when `low_memory=True`.
    3. Decode latents with the Wan VAE → pixel tensor `[T, H, W, 3]` float32 `[0, 1]`.
    4. Return `{"video": pixel_tensor, "latents": latents if return_latents else None, "metadata": {"backend": "community-low-vram-wan-bridge", ...}}`.
  - Keep VACE, LoRA, negative prompt conditioning, and CFG out of this first pass.
  - Acceptance: one call completes without OOM and returns a dict with non-empty `"video"` tensor.

- [ ] **R.5.1.e Validate with `run_self_forcing_one_frame.py`.**
  - New file: `nodetool-realtime/scripts/run_self_forcing_one_frame.py`.
  - Drive the full chain: `create_components(config)` → call `.inference(noise=dummy, text_prompts=["a sunrise over mountains"], return_latents=False, low_memory=True)` → write rgba8 PNG to `./one_frame_output.png`.
  - Print: VRAM peak, time-to-frame, output shape.
  - Acceptance: `one_frame_output.png` exists, is non-black, and was produced without `FakeSelfForcingPipeline`.

---

- [ ] **R.5.2 Wire the `SelfForcing` node to the MediaBus through the Python bridge.**
  - Files: `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py`, `packages/runtime/src/python-realtime-session.ts`, `packages/runtime/src/python-stdio-bridge.ts`.
  - On TS realtime tick: read latest input frame from MediaBus, ship it to the Python worker for the SelfForcing instance, await the result, write it back to the MediaBus output slot.
  - The Python worker keeps the bridge instance warm across ticks. Loading / warming / ready / error states are emitted as `node_update` on the control plane.
  - Acceptance: with the canonical realtime template (`Video Source -> SelfForcing -> VideoSink -> Preview`), Preview shows a real generated frame visibly different from the input camera frame.

- [ ] **R.5.3 First-frame end-to-end on RTX 3060.**
  - Run the canonical realtime template on the user's RTX 3060.
  - Record in this plan: time-to-first-frame, steady-state fps, VRAM peak, GPU util, and any errors.
  - Acceptance: at least one real model-converted frame appears in Preview without `FakeSelfForcingPipeline`.

### Diagnosis (Apr 30 evidence and root causes)

Observed: passthrough-only graph at 0.7 fps with 14 s frame age on localhost, with no model in the graph.

1. **Per-frame fan-out on the wire.** One camera frame produces at minimum: `realtime_session_ack` + `output_update` for `VideoPassthrough.frame` + `output_update` for `VideoSink.frame` + N `edge_update` events. All share `WorkflowRunner._emit -> ProcessingContext.emit -> context._messages` (`packages/runtime/src/context.ts`, `packages/kernel/src/runner.ts`).
2. **Single send lock.** `UnifiedWebSocketRunner.sendMessage` chains every outbound message through `this.sendLock`. Frame-push acks queue behind `output_update`s.
3. **O(n) outbound queue drain.** `streamJobMessages` polls `Array.shift()` on `ProcessingContext._messages` with a 10 ms `setTimeout` floor. Backlog turns the drain O(n^2).
4. **Camera publisher RTT-coupled.** `useRealtimeCameraFramePublisher` defaults `maxInFlightFrames = 1`. Server send-lock contention collapses the camera rate.
5. **Per-frame React fan-out.** `web/src/stores/workflowUpdates.ts` calls `setOutputResult`, `addToHistory`, `appendLog` (with `formatOutputUpdateLogValue`) on every `output_update`, including `realtime_video_frame`s.
6. **Per-frame server allocations.** `RealtimeCommandHandler.handlePushFrame` builds a brand-new `FrameRouter` and rebuilds the media-track map every push.

**Scope (insights only):** Daydream keeps frames as `torch.Tensor` inside per-pipeline paths and uses WebRTC tracks for pixels while the WebSocket carries control. Those files (e.g. `webrtc.py`, `tracks.py`, `frame_processor.py`, `pipeline_processor.py`) illustrate ideas only. Phase R does **not** adopt WebRTC; it keeps the same *separation of media vs control* on the existing WebSocket, implemented in `packages/websocket` + kernel (see **Code map** above).

## Locked Decisions

- Use Nodetool's realtime graph path, not a separate operator UI.
- Use one user-facing `Video Source` concept. The MVP implements the camera mode.
- Target Self-Forcing Wan 2.1 1.3B low-VRAM first via the community FP8/GGUF bridge, not the official `CausalInferencePipeline` (OOMed before decode on 12 GB).
- Keep the RTX 3060 MVP on Self-Forcing/community Wan 1.3B low-VRAM paths. Standard LongLive and StreamDiffusion-style streaming are 24 GB-class options.
- Keep dev/mock paths for tests only; remove them from normal user controls and starter templates.

## RTX 3060 Adapter Assumptions

Use these as dense engineering assumptions until replaced by measured smoke output:

- Target stack: Wan 2.1 T2V 1.3B backbone, Self-Forcing DMD weights, UMT5-XXL text encoder, Wan 2.1 VAE, FP8 weights where available, BF16 activations.
- 3060 constraint: FP8 saves VRAM on Ampere but does not buy FP8 tensor-core speed. Expect memory headroom, not Ada/Hopper throughput.
- 3060 path: Self-Forcing/community FP8 or GGUF Wan 1.3B variants only. Scope/Daydream reference data puts standard LongLive and StreamDiffusion V2 around 20 GB with a 24 GB system floor — treat RTX 4090/3090-class as the practical entry point for those pipelines.
- Prompt path: text encoding is one-shot per prompt; CPU/offload is acceptable. Keeping UMT5 resident on GPU is lower priority than keeping DiT/VAE/generation stable.
- VAE path: full Wan VAE is the keeper path. TAEHV/TAEW-style decode is a possible preview-only speed path if full VAE decode blocks visible iteration.
- Self-Forcing loop: chunk-wise causal AR with KV cache. Implement rolling fixed-window KV as a ring buffer, not an unbounded tensor. Treat first-chunk/frame-sink anchoring as a quality option after base output works.
- Sampling: DMD is a fixed few-step path. Do not expose step count/CFG/negative-branch tuning before the adapter proves output.
- Smoke sizes: official 480x832-style latent shapes are close to 12 GB once activations/cache/fragmentation are included. Validate smaller shapes explicitly, especially 416x240 and 320x512.
- Attention: FlashAttention 2.7.4.post1 is the upstream reference. If unavailable, SDPA works as a correctness fallback but is slow. Use the CUDA backend on Ampere, not known-black-output Triton paths.
- System memory: treat 32 GB RAM as a floor and 64 GB as preferred for user-facing guidance once offload is enabled.
- Throughput expectation: 3060-class output will not match paper H100/4090 numbers. Plan around correctness first.

## De-Risk Gates

- **Reference reproduction gate:** before R.5.1 bridge implementation, reproduce or document one known-working low-VRAM Wan/Self-Forcing reference path. Record exact model files, loader classes, precision, resolution, VAE decode path, offload settings, and observed VRAM.
- **Frame-routing gate:** Phase R acceptance gate must be met before any bridge work. The data plane must sustain >= 30 fps before model latency is measurable.
- **Loader path (decided):** community low-VRAM Wan bridge — FP8 transformer, GGUF UMT5 text encoder, Wan VAE, block/offload controls for 12 GB. Optional VACE/LoRA/control artifacts stay out of the base run.
- **Status surface gate:** model loading must emit visible stages (`resolving` / `loading transformer` / `loading text encoder` / `loading VAE` / `warming` / `ready` / `error`) before a session is considered shippable.
- **Manifest gate:** base templates load only required base artifacts. Optional VACE, LoRA, speed-LoRA, and control artifacts must not be resolved unless an explicit profile enables them.
- **Hardware gate:** low-VRAM profiles stay on Self-Forcing/community Wan 1.3B FP8/GGUF. LongLive, StreamDiffusion-style streaming, full VACE/control stacks are 24 GB-class options.

Reference notes (external products — not NodeTool source):
- Scope/Daydream loads pipelines separately from streaming: `POST /api/v1/pipeline/load`, `GET /api/v1/pipeline/status` with `loading_stage`, then streaming begins. Useful mental model for staged loading UX; implementation is still `nodetool-realtime` + TS status surfaces.
- Kijai/ComfyUI WanVideoWrapper treats low-VRAM Wan as a loader ecosystem: FP8/GGUF loaders, optional VACE modules, block/offload controls for memory. NodeTool should mirror these **loader facts**, not assume the official Self-Forcing constructors cover the community artifact layout.

## Phase 0: Done

Phase 0 complete (0.1–0.7): camera ingress unified (`nodetool.video.VideoSource` with explicit `image` and `realtime_frame` outputs), MVP starter template created, node parameters reduced (dev/mock fields removed), docs and metadata aligned, smoke code consolidated, runtime surface trimmed, brittle tests simplified.

### [ ] 0.8 Close Realtime Setup Audit Gaps

Steps:
- [ ] Add a TS integration smoke for opening `/realtime/<workflow>`, starting a mocked realtime session, and verifying lifecycle/status rendering. Write against the Phase R session path once R lands.
- [ ] Add a metadata-backed starter smoke asserting the graph uses `nodetool.video.VideoSource.realtime_frame -> realtime.self_forcing.SelfForcing.frame -> VideoSink/Preview`.
- [ ] Define and test the ambiguous graph policy: block start with a clear error when multiple realtime source/sink candidates exist.
- [ ] Add focused `useRealtimeStreamController` tests for: disabled start rules, discovered target auto-apply, manual target overrides, and clean stop.
- [ ] Keep `runtime_artifacts.__all__` minimal; expand only when a concrete core consumer and test exist.
- [ ] Keep placeholder extras (`fp8`, `gguf`, `int8`) clearly documented as unavailable until they install real dependencies.

Check:
- [ ] A reviewer can trace the starter from package metadata to the Realtime route and know which tests protect each handoff.
- [ ] Ambiguous realtime graph routing cannot silently choose the wrong source/sink.

## Phase 1: MVP Inference Path

**1.1 ✅** `Preview` renders raw `rgba8` realtime frames without asset conversion; unsupported formats show a clear message.

**1.2 ✅** Camera `Video Source` wired to model input (all steps done). One open app runtime check, blocked by Phase R: browser-published camera frames must increment routed/unrouted backend metrics and reach the active runner.

**1.3 ✅** Required low-VRAM artifacts resolved. See artifact cache snapshot below.

**1.6 ✅** One-page user runbook written (`nodetool-realtime/README.md`).

### Artifact cache snapshot (referenced by R.5.1)

HF cache root: `M:\HUGGINGFACE\hub`

Cached and ready:
- `self_forcing_fp8_transformer`: `lym00/Wan2.1-T2V-1.3B-Self-Forcing-VACE-Addon-Experiment/Wan2.1_T2V_1.3B_SelfForcing_DMD-FP8_e4m3fn.safetensors` (1,419,385,896 bytes)
- `umt5_xxl_encoder_q5_k_m`: `city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q5_K_M.gguf` (4,145,878,880 bytes)
- `wan21_vae`: `Kijai/WanVideo_comfy/Wan2_1_VAE_bf16.safetensors` (253,806,278 bytes)

Not cached (not needed for MVP):
- `Wan-AI/Wan2.1-T2V-1.3B` (canonical Self-Forcing — 24 GB-class path)
- `gdhe17/Self-Forcing/checkpoints/self_forcing_dmd.pt`
- `self_forcing_vace_fp8_transformer` (VACE — post-MVP)

Runtime: `nodetool` conda env, PyTorch 2.9.0+cu128, CUDA 12.8, RTX 3060, compute capability (8, 6). `safetensors` 0.7.0, `huggingface_hub` 1.8.0.

### [ ] 1.4 Self-Forcing Inference Adapter

> Active tasks are in **Phase R.5**. Do not start bridge work until the Phase R acceptance gate is met.

Locked decisions:
- Community low-VRAM bridge path only. Official `CausalInferencePipeline` OOMed before decode on 12 GB; it is reference material for a 24 GB-class path.
- LongLive stays on the 24 GB-class path.
- First real model-converted frame in `Preview` is the acceptance gate.

Done:
- [x] Bridge boundary in place (FP8 transformer / GGUF text encoder / Wan VAE manifest paths; reports dependency errors instead of upstream failures).
- [x] `inference(...)` API shape defined and consumed by the existing sampler.
- [x] Bridge metadata preserved on emitted `realtime_video_frame`.
- [x] VACE/LoRA artifact IDs kept out of the default bridge config.
- [x] Camera frame -> active runner proven structurally (Apr 30: `Browser frames: 30`, `Routed frames: 13`). Throughput addressed by Phase R.

Open (tracked under Phase R.5):
- [ ] R.5.1: load base artifacts and run one denoise/decode through the bridge.
- [ ] R.5.2: wire `SelfForcing` node to MediaBus through the Python bridge.
- [ ] R.5.3: first real generated frame in `Preview` without `FakeSelfForcingPipeline`.
- [ ] After R.5.3: revisit packaging, CUDA/CPU placement, attention acceleration, LoRA, VACE, and the 24 GB LongLive lane.

### [ ] 1.5 End-To-End On RTX 3060

> Equivalent to Phase R.5.3. Tracked there. Run these steps once R.5.3 artifacts exist.

- [ ] Open the MVP template, select camera, start session.
- [ ] Confirm `Model Runtime Status` card advances through loading states or shows the blocking error.
- [ ] Confirm generated frames appear in `Preview`.
- [ ] Change the prompt once while running.
- [ ] Stop the session cleanly.
- [ ] Record: time-to-first-frame, steady-state fps, VRAM, GPU util, dropped frames.
- [ ] Remove any remaining `TEMP_LOG` instrumentation.

Check:
- [ ] A user sees generated model output in `Preview` on RTX 3060-class hardware without `FakeSelfForcingPipeline`.

## Deferred Context

- **Where code lives:** see **Code map** at top (Scope is not an implementation path).
- Runtime contract: `docs/realtime-runtime-contract.md`
- Frame protocol: `packages/protocol/src/realtime-frame.ts`
- TS realtime nodes: `packages/realtime-nodes/`
- Realtime WebSocket + media path: `packages/websocket/src/realtime/`
- tRPC realtime router: `packages/websocket/src/trpc/routers/realtime.ts`
- Kernel runner: `packages/kernel/src/runner.ts`
- Realtime runner shell: `packages/kernel/src/realtime-runner.ts`
- Python realtime package: `nodetool-realtime/`
- Post-MVP tasks: `PLAN-REALTIME-2.md`
- Feature ideas and product guidance: `REALTIME-FEATURE-IDEAS.md`
