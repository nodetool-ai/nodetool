# Realtime Execution Plan

## Goal

Build the first user-visible Nodetool realtime workflow:

```text
Video Source -> Self-Forcing RTX 3060 profile -> VideoSink -> Preview
```

Success means a user selects a camera, starts the workflow, and sees generated model output in the normal Nodetool `Preview` node on RTX 3060-class hardware.

## Code map

Authoritative implementation is **this repo** (`nodetool`) plus the **`nodetool-realtime`** Python package (sibling workspace). Daydream Scope (`scope-main`) is insight-only for patterns such as separating media from control; do not mirror its codebase here.

| Layer | Location | Role |
|--------|----------|------|
| Python models & bridge | `nodetool-realtime/src` (`nodetool.*`, `nodetool_wan_bridge`) | Self-Forcing / Wan load paths, `create_components`, artifact manifests, PyTorch / HF stack. |
| Realtime graph nodes (TS) | `packages/realtime-nodes/` | Editor node types (`VideoPassthrough`, `VideoSink`, `Parameter`, …), outputs/handles, realtime-capable metadata. |
| tRPC session API | `packages/websocket/src/trpc/routers/realtime.ts` | List/get session records via `realtimeSessionManager` (control plane metadata, not video payloads). |
| WebSocket realtime | `packages/websocket/src/realtime/` | Media bus, frame push, command handler, paced outbound sender (Phase R data plane). |
| Realtime job shell | `packages/kernel/src/realtime-runner.ts` | `RealtimeRunner`: `WorkflowRunner` with `runMode: "realtime"`, warm hooks, background processing lifecycle. |
| Core DAG runner | `packages/kernel/src/runner.ts` | Shared graph execution; realtime-specific skips/throttles per Phase R. |
| Browser client | `web/src/` (e.g. `RealtimeSessionStore`, camera publisher, canvas preview) | Paced capture, `realtime_frame_out` handling, rAF preview. |

## Phase R — Realtime rewrite

The realtime path has never reached usable speed. Apr 30 evidence with no model in the graph: **0.7 fps**, **14 s** frame age — architectural causes appear under **Historical diagnosis** below.

Phase R rebuilds the realtime data plane around a per-session media bus and a paced output sender. Control plane (`node_update`, `edge_update`, `realtime_session_*`, `realtime_metrics`) stays on the existing message bus but is rate-limited in realtime mode.

The whole realtime path is still pre-MVP, so Phase R is a clean rewrite, not an optimisation pass. Anything not on the camera → media bus → sink → canvas path is fair game to delete or defer.

**Latest localhost probe (May 2026, passthrough-ish template, JPEG 320×240):** Runaway latency growth looks resolved (async flush + ingress signature). Effective throughput is still low (example session: UI ~**0.8** preview fps, ~**724 ms** frame age; server bus ~**4.9** fps; camera ~**30** pushes/sec vs ~**246** routed; **976** cumulative drops on one run). Treat drops as a profiling signal, not a single root cause.

### Historical diagnosis

**Apr 30 baseline:** passthrough-only graph at **0.7 fps**, **14 s** frame age.

1. **Control-plane overhead.** Per-frame **`realtime_session_ack`** plus throttled **`edge_update`** still touch **`_messages`** (`packages/runtime/src/context.ts`, `packages/kernel/src/runner.ts`). Streaming **`output_update`** for **`realtime_video_frame`** was removed in shipped work (**R.0.5**).
2. **Earlier bottlenecks now addressed:** single **`sendLock`** split into control/media lanes; polling **`streamJobMessages`** drain replaced with **`popMessageAsync`**; camera publisher decoupled from strict RTT (**paced** publish, **`maxInFlightFrames`**); React/store **`output_update`** fan-out skipped for **`realtime_video_frame`**; **`FrameRouter`** removed for **`handlePushFrame`**; **`RealtimeFrameSender`** single-flight + **`pulse`** after ticks; optional multi-sink egress cap (**`applyVideoSinkEgressCap`**, **`NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS`**, **`NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS`**). **`push_frame`** no longer awaits **`tickRealtimeMediaPlane`** on the ack hot path (**async flush**, **`realtimeIngressSequenceSignature`**); optional JPEG ingress/preview path shipped (**`pixel_format === "jpeg"`**).
3. **May 2026:** throughput still misses the passthrough acceptance targets below until open perf tasks ship.

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

### Passthrough acceptance criteria

Camera → VideoPassthrough → VideoSink → Preview, **no model** in graph:

- Output fps ≥ 30 sustained for 30 s on localhost.
- Frame age < 100 ms p99.
- No per-frame `appendLog` / `addToHistory` / `setOutputResult` for `realtime_video_frame`.
- Server holds at most one queued frame per (session, node, handle).
- WebSocket sends ≤ 35 video messages/sec server → browser regardless of camera rate.
- ack RTT < 5 ms p99 under load.

### Phase R — open tasks (`[ ]`)

- [ ] **R.P.1** Instrument camera → Preview end-to-end: capture (**JPEG vs RGBA**), **`push_realtime_frame`** / ack latency, **`RealtimeMediaBus`** + kernel media tick, **`RealtimeFrameSender`** / **`pulse`**, inbound **`realtime_frame_out`** (**`createImageBitmap`** / **`putImageData`** / rAF). Record where time and **`queues`/drops** concentrate; re-measure after each change.
- [ ] **R.P.2** Metrics coherence — ingest vs egress vs preview show consistent counters and labels (no contradictory fps lines across UI cards / session summaries).
- [ ] **R.P.3** Preview transport spike — **`transport === "webrtc"`** with **`RealtimeSignalingTransport`** loopback or single-track path (`packages/websocket/src/realtime/_legacy/` stack).
- [ ] **R.P.4** Pulse hygiene — **`pulseRealtimeFrameSender`** only after a real kernel tick or verified sink sequence advance.
- [ ] **R.4.1b** Per-node **`node_ticks`** / **`lastError`** on **`realtime_metrics`** once the kernel exposes them.
- [ ] **R.4.2** Meet **Passthrough acceptance criteria** on localhost for **30 s** on RTX 3060-class hardware with the passthrough-only template. Multi-sink: use one **`VideoSink`** **or** **`NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS=1`** when deliberately measuring multi-preview bandwidth. Partial snapshot May 2026 (~**4.9** fps bus, ~**0.8** preview fps, ~**724 ms** age): **still failing**.
- [ ] **R.0.1** WebRTC scaffolding polish — **`handleSignal`** → **`RealtimeSignalingTransport`** (`signaling-transport.ts`); optional feature-flag compile for **`transport === "webrtc"`** + **`realtimeWebRTCServer`**.

### Phase R — shipped tasks (`[x]`)

- [x] **R.P.0a** Async coalesced flush — ack after **`setInput`**; tick + **`pulseRealtimeFrameSender`** off **`RealtimeCommandHandler`** hot path.
- [x] **R.P.0b** Ingress sequence signature — **`realtimeIngressSequenceSignature`** skips redundant **`tickRealtimeMediaPlane`** when ingress unchanged.
- [x] **R.P.0c** Optional JPEG ingress/preview (**`pixel_format === "jpeg"`**); uncapped RGBA path intact.
- [x] **R.0.4** Event-driven **`streamJobMessages`** drain (`popMessageAsync`, `closeMessageQueue`, `unified-websocket-runner.ts`).
- [x] **R.0.5** Omit **`output_update`** for **`realtime_video_frame`** (`runner.ts`, protocol, unified runner).
- [x] **R.0.5b** Browser no-op stray **`output_update`** for **`realtime_video_frame`** (`workflowUpdates.ts`).
- [x] **R.1.1** **`RealtimeMediaBus`** (`media-bus.ts`).
- [x] **R.1.2** **`handlePushFrame`** → **`mediaBus.setInput`** (`command-handler.ts`); **`frame-router`** deleted.
- [x] **R.1.3** **`onRealtimeTick`** + VideoSource / Passthrough / Sink wiring (`realtime-runner.ts`, node-sdk, realtime-nodes).
- [x] **R.2.1** **`RealtimeFrameSender`** (`frame-sender.ts`, **`realtime_frame_out`**).
- [x] **R.2.2** **`controlSendLock`** + **`mediaSendLock`** (`unified-websocket-runner.ts`).
- [x] **R.2.3** Realtime **`edge_update`** throttle (`runner.ts`).
- [x] **R.3.1** **`realtime_frame_out`** slot plumbing (`RealtimeSessionClient`, **`realtimeMediaFrameSlots`**, store).
- [x] **R.3.2** **`RealtimeVideoFrameRenderer`** rAF (**`mediaSessionId`**).
- [x] **R.3.3** Paced camera publisher + **`maxInFlightFrames`** default **8** (`useRealtimeCameraFramePublisher.ts`).
- [x] **R.4.1** **`realtime_metrics`** ~1 Hz + preview/status cards.

Ship realtime pixels **`binary` + msgpack`; avoid JSON expansion of **`Uint8Array`** payloads on debug/text paths.

### R.5 — Self-Forcing bridge

Hold bridge implementation until **Passthrough acceptance criteria** are met (perf tasks above).

**Call chain:**

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
- `config.runtime_path` — Wan 2.1 T2V 1.3B dir for `config.json` + tokenizer (**KB-scale snapshot only — transformer/VAE weights live in dedicated artifact paths**)
- `config.block_swap_blocks = 16`, `text_encoder_device = "cpu"`, `transformer_device = "cuda"`, `vae_device = "cuda"`

Return an object where `.inference(noise, text_prompts, return_latents, low_memory)` is callable. **`apply_checkpoint`** passes through objects that already expose **`.inference`**.

---

- [x] **R.5.1.a** Slim **`runtime_path`** snapshot (`config.json` + UMT5 tokenizer only; VAE via **`wan21_vae`**). Files: `model_artifacts.py`, `self_forcing.py`, `self_forcing_rtx3060.py`.

- [ ] **R.5.1.b** Pick and wire the GGUF text encoder library.
  - File: `nodetool-realtime/pyproject.toml`, `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - Add `llama-cpp-python` (or `ctransformers` with UMT5 support) to the `[gguf]` extra in `pyproject.toml`.
  - In `create_components`, load `config.text_encoder_path` with the chosen library on `config.text_encoder_device`.
  - Wrap it so `encode(text_prompts: list[str]) -> {"prompt_embeds": tensor [batch, seq_len, hidden]}` works.
  - Scope's `WanTextEncoderWrapper.forward` signature is the reference: returns `{"prompt_embeds": context}` with shape `[batch, seq_len, 2048]`.
  - Acceptance: `encode(["a sunrise over mountains"])` returns a tensor on the target device with no import errors.

- [ ] **R.5.1.c** Load FP8 transformer and Wan VAE.
  - File: `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - **Transformer:** use `diffusers.models.WanTransformer3DModel.from_config(config_dir)` to init architecture from `runtime_path/config.json`, then `load_state_dict` from `config.transformer_path` (safetensors). Move to `config.transformer_device`. Reference: Scope's `WanDiffusionWrapper` meta-device → CPU load → GPU pattern (`self_forcing_rtx3060.py:_loaded_transformer_state`).
  - **VAE:** use `diffusers.models.AutoencoderKLWan.from_single_file(config.vae_path)` or load state dict into `AutoencoderKLWan`. Move to `config.vae_device`. Reference: Scope's `WanVAEWrapper` loading pattern.
  - Block-swap: when `low_memory=True`, move transformer blocks off GPU between denoising steps using `config.block_swap_blocks`. Scope's `pipeline_processor.py` block-swap pattern is the reference.
  - Acceptance: both models load on the RTX 3060 without OOM at rest (before inference); `torch.cuda.memory_allocated()` < 10 GB after load.

- [ ] **R.5.1.d** Implement the inference loop in `create_components`.
  - File: `nodetool-realtime/src/nodetool_wan_bridge/__init__.py`.
  - Return a dataclass/object with `inference(noise, text_prompts, return_latents, low_memory)`:
    1. Encode `text_prompts[0]` → `prompt_embeds` (cache; only re-encode on prompt change).
    2. DMD denoising: 4 steps at `[1000, 750, 500, 250]` through the transformer with KV cache as a fixed-window ring buffer (not unbounded). Block-swap between steps when `low_memory=True`.
    3. Decode latents with the Wan VAE → pixel tensor `[T, H, W, 3]` float32 `[0, 1]`.
    4. Return `{"video": pixel_tensor, "latents": latents if return_latents else None, "metadata": {"backend": "community-low-vram-wan-bridge", ...}}`.
  - Keep VACE, LoRA, negative prompt conditioning, and CFG out of this first pass.
  - Acceptance: one call completes without OOM and returns a dict with non-empty `"video"` tensor.

- [ ] **R.5.1.e** Validate with `run_self_forcing_one_frame.py`.
  - New file: `nodetool-realtime/scripts/run_self_forcing_one_frame.py`.
  - Drive the full chain: `create_components(config)` → call `.inference(noise=dummy, text_prompts=["a sunrise over mountains"], return_latents=False, low_memory=True)` → write rgba8 PNG to `./one_frame_output.png`.
  - Print: VRAM peak, time-to-frame, output shape.
  - Acceptance: `one_frame_output.png` exists, is non-black, and was produced without `FakeSelfForcingPipeline`.

---

- [ ] **R.5.2** Wire the **`SelfForcing`** node to the MediaBus through the Python bridge.
  - Files: `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py`, `packages/runtime/src/python-realtime-session.ts`, `packages/runtime/src/python-stdio-bridge.ts`.
  - On TS realtime tick: read latest input frame from MediaBus, ship it to the Python worker for the SelfForcing instance, await the result, write it back to the MediaBus output slot.
  - The Python worker keeps the bridge instance warm across ticks. Loading / warming / ready / error states are emitted as `node_update` on the control plane.
  - Acceptance: with the canonical realtime template (`Video Source -> SelfForcing -> VideoSink -> Preview`), Preview shows a real generated frame visibly different from the input camera frame.

- [ ] **R.5.3** First-frame end-to-end on RTX 3060.
  - Run the canonical realtime template on the user's RTX 3060.
  - Record in this plan: time-to-first-frame, steady-state fps, VRAM peak, GPU util, and any errors.
  - Acceptance: at least one real model-converted frame appears in Preview without `FakeSelfForcingPipeline`.

## Locked decisions

- Use Nodetool's realtime graph path, not a separate operator UI.
- Use one user-facing `Video Source` concept. The MVP implements the camera mode.
- Target Self-Forcing Wan 2.1 1.3B low-VRAM first via the community FP8/GGUF bridge, not the official `CausalInferencePipeline` (OOMed before decode on 12 GB).
- Keep the RTX 3060 MVP on Self-Forcing/community Wan 1.3B low-VRAM paths. Standard LongLive and StreamDiffusion-style streaming are 24 GB-class options.
- Keep dev/mock paths for tests only; remove them from normal user controls and starter templates.

## RTX 3060 adapter assumptions

Dense engineering assumptions until replaced by measured smoke output:

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

## De-risk gates

- **Reference reproduction gate:** before R.5.1 bridge implementation, reproduce or document one known-working low-VRAM Wan/Self-Forcing reference path. Record exact model files, loader classes, precision, resolution, VAE decode path, offload settings, and observed VRAM.
- **Frame-routing gate:** Passthrough acceptance criteria must pass before bridge work. The data plane must sustain ≥ 30 fps before model latency is measurable.
- **Loader path (decided):** community low-VRAM Wan bridge — FP8 transformer, GGUF UMT5 text encoder, Wan VAE, block/offload controls for 12 GB. Optional VACE/LoRA/control artifacts stay out of the base run.
- **Status surface gate:** model loading must emit visible stages (`resolving` / `loading transformer` / `loading text encoder` / `loading VAE` / `warming` / `ready` / `error`) before a session is considered shippable.
- **Manifest gate:** base templates load only required base artifacts. Optional VACE, LoRA, speed-LoRA, and control artifacts must not be resolved unless an explicit profile enables them.
- **Hardware gate:** low-VRAM profiles stay on Self-Forcing/community Wan 1.3B FP8/GGUF. LongLive, StreamDiffusion-style streaming, full VACE/control stacks are 24 GB-class options.

Scope loads pipelines separately from streaming (`POST /api/v1/pipeline/load`, `GET /api/v1/pipeline/status` with `loading_stage`, then streaming begins) — useful UX mental model for staged loading.

Kijai/ComfyUI WanVideoWrapper treats low-VRAM Wan as a loader ecosystem (FP8/GGUF loaders, optional VACE modules, block/offload controls). Mirror those loader facts here rather than assuming official Self-Forcing constructors match community artifact layouts.

## Phase 0

### Shipped (`[x]`)

- [x] **0.1–0.7** Unified **`VideoSource`** (`image` + **`realtime_frame`**), MVP template, trimmed params/dev mocks, docs/metadata/smokes/runtime cleanup.

### Open (`[ ]`)

- [ ] **0.8.1** TS integration smoke: `/realtime/<workflow>`, mocked realtime session, lifecycle/status UI.
- [ ] **0.8.2** Metadata starter smoke: graph **`VideoSource.realtime_frame` → `SelfForcing.frame` → VideoSink/Preview**.
- [ ] **0.8.3** Ambiguous realtime graph policy — hard error when multiple source/sink candidates.
- [ ] **0.8.4** **`useRealtimeStreamController`** tests: disabled start, auto target, overrides, clean stop.
- [ ] **0.8.5** Keep **`runtime_artifacts.__all__`** minimal until a consumer + test exist.
- [ ] **0.8.6** Document placeholder extras (`fp8`, `gguf`, `int8`) as non-functional until deps ship.
- [ ] **0.8.r1** Reviewer can trace starter metadata → Realtime route + owning tests.
- [ ] **0.8.r2** Ambiguous routing cannot silently pick wrong source/sink.

## Phase 1 — MVP inference path

### Shipped (`[x]`)

- [x] **1.1** `Preview` renders raw **`rgba8`** realtime frames; unsupported formats show a clear error.
- [x] **1.2** Camera **`Video Source`** → model input wired (confirm routed metrics once passthrough gate passes).
- [x] **1.3** Low-VRAM artifact manifest resolved (snapshot follows).
- [x] **1.6** Runbook: `nodetool-realtime/README.md`.
- [x] **1.4.pre** Bridge boundary + **`inference(...)`** API shape + **`realtime_video_frame`** metadata; default config excludes VACE/LoRA; camera→runner structural proof (Apr 30).

### HF artifact snapshot

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

### Bridge adapter locked choices

- Community low-VRAM bridge only; official **`CausalInferencePipeline`** is 24 GB-class reference material.
- LongLive stays on the 24 GB-class path.
- First real generated frame in **`Preview`** gates adapter acceptance.

### Open (`[ ]`) — Phase 1 bake-off after bridge

- [ ] **Post-R.5.3** Packaging, CUDA/CPU placement, attention acceleration, LoRA, VACE, 24 GB LongLive lane.

### End-to-end on RTX 3060 (`[ ]`)

- [ ] **1.5.1** Open MVP template → camera → start session.
- [ ] **1.5.2** **`Model Runtime Status`** shows loading stages or actionable error.
- [ ] **1.5.3** Generated frames visible in **`Preview`**.
- [ ] **1.5.4** Change prompt once while running.
- [ ] **1.5.5** Stop session cleanly.
- [ ] **1.5.6** Record time-to-first-frame, fps, VRAM, GPU util, drops.
- [ ] **1.5.7** Remove stray **`TEMP_LOG`** instrumentation.
- [ ] **1.5.c** User sees real output on RTX 3060-class HW without **`FakeSelfForcingPipeline`**.

## Related files

- Runtime contract: `docs/realtime-runtime-contract.md`
- Frame protocol: `packages/protocol/src/realtime-frame.ts`
- TS realtime nodes: `packages/realtime-nodes/`
- Realtime WebSocket + media path: `packages/websocket/src/realtime/`
- tRPC realtime router: `packages/websocket/src/trpc/routers/realtime.ts`
- Kernel runner: `packages/kernel/src/runner.ts`
- Realtime runner shell: `packages/kernel/src/realtime-runner.ts`
- Python realtime package: `nodetool-realtime/`
- Post-MVP tasks: `PLAN-REALTIME-2.md`
- Feature ideas: `REALTIME-FEATURE-IDEAS.md`
