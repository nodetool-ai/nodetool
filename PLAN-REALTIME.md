# Realtime Execution Plan

## Goal

Build the first user-visible Nodetool realtime workflow:

```text
Video Source -> Self-Forcing RTX 3060 profile -> VideoSink -> Preview
```

Success means a user selects a camera, starts the workflow, and sees generated model output in the normal Nodetool `Preview` node on RTX 3060-class hardware.

## Locked Decisions

- Use Nodetool's realtime graph path, not a separate operator UI.
- Use one user-facing `Video Source` concept. The MVP implements the camera mode.
- Target Self-Forcing Wan 2.1 1.3B low-VRAM first.
- Keep the RTX 3060 MVP on Self-Forcing/community Wan 1.3B low-VRAM paths. Standard LongLive and StreamDiffusion-style streaming are separate 24 GB-class options.
- Keep dev/mock paths for tests and demos, but remove them from normal user controls and starter templates.
- LoRA comes immediately after the base MVP.
- VACE/reference image control comes immediately after LoRA.
- Browser-local analysis, deployment hardening, WebRTC codec work, hardware adapters, recording, and audio are later.

## UI Priorities

product guidance:

- Big live preview first.
- Minimal controls: source, prompt, model profile, LoRA, reference image.
- Clear states: idle, loading, warming, running, stopping, error.
- Clear hardware readiness: backend, precision, VRAM/offload, missing artifacts.
- Fast Play/Stop and prompt updates.
- No timeline, preset community, plugin marketplace, or standalone operator UI before the graph MVP works.

## Realtime Product Learnings

Use these as product and adapter guidance:

- The understandable graph shape is `Source -> Pipeline -> Sink/Preview`. Keep the Nodetool starter and validation centered on that mental model.
- Realtime node menu grouping is useful: `Source`, `Pipeline`, `Sink`, `Output`, `Controls`, `UI`, `Utility`, `Media`, and `VACE` make realtime authoring easier to scan than a flat model/provider list.
- Pipeline nodes can expose advanced model parameters inline, but the MVP should not start there. Hide or collapse low-level knobs until the base run works.
- Control inputs such as VACE/reference frames should be optional graph inputs connected from small control nodes, not mandatory fields on the base pipeline.
- LongLive/Wan-style component layout is useful future-card guidance: keep separate concerns for model path resolution, text encoder, transformer/checkpoint, VAE, optional LoRA, optional VACE/control input, scheduler/steps, and frame post-processing. Do not put LongLive on the 3060 path unless we explicitly build an unsupported low-resolution/offload variant.
- Use one conservative adapter profile while proving the path, such as 320x576 or 512 square output, fixed seed, known VAE, known quantization profile, known noise scale, and known denoising steps.
- Make the server-side pipeline manager concrete: resolve/cache artifact paths, build a typed pipeline config, lazy-load one pipeline per profile, emit `resolving -> loading -> warming -> ready/error`, run frames through one `infer(frame, prompt, params)` call, reuse warm state across frames, and release/stop cleanly on session stop.
- The operator needs a visible runtime state next to the graph: session starting, model resolving/loading/warming/ready/error, browser frames sent, backend frames routed, inference metrics, and last error.
- Realtime should be discoverable from the normal app shell. A header entry such as `Editor | Chat | App | Realtime` is acceptable during the MVP, even if Play eventually moves into the editor.

## RTX 3060 Adapter Assumptions

Use these as dense engineering assumptions until replaced by measured smoke output:

- Target stack: Wan 2.1 T2V 1.3B backbone, Self-Forcing DMD weights, UMT5-XXL text encoder, Wan 2.1 VAE, FP8 weights where available, BF16 activations.
- 3060 constraint: FP8 saves VRAM on Ampere but does not buy FP8 tensor-core speed. Expect memory headroom, not Ada/Hopper throughput.
- Scope/Daydream reference data puts standard LongLive and StreamDiffusion V2 around a 20 GB estimate with a 24 GB system floor. Treat RTX 4090/3090-class cards as the practical entry point for those packaged streaming pipelines.
- 3060 path: Self-Forcing/community FP8 or GGUF Wan 1.3B variants only, unless we deliberately engineer unsupported LongLive offload, very short windows, and very low resolution.
- Prompt path: text encoding is one-shot per prompt; CPU/offload is acceptable. Keeping UMT5 resident on GPU is lower priority than keeping DiT/VAE/generation stable.
- VAE path: full Wan VAE is the keeper path. TAEHV/TAEW-style decode is a possible preview-only speed path if full VAE decode blocks visible iteration.
- Self-Forcing loop: chunk-wise causal AR with KV cache. Implement rolling fixed-window KV as a ring buffer, not an unbounded tensor. Treat first-chunk/frame-sink anchoring as a quality option after base output works.
- Sampling: DMD is a fixed few-step path. Do not expose step count/CFG/negative-branch tuning before the adapter proves output; extra steps can degrade DMD output.
- Smoke sizes: official 480x832-style latent shapes are close to 12 GB once activations/cache/fragmentation are included. Validate smaller shapes explicitly, especially about 416x240 and 320x512.
- Attention: FlashAttention 2.7.4.post1 is the upstream reference. If unavailable, SDPA works as a correctness fallback but is slow. SageAttention may be a later speed task; use the CUDA backend on Ampere, not known-black-output Triton paths.
- System memory matters for offload. Treat 32 GB RAM as a floor and 64 GB as preferred for user-facing guidance once offload is enabled.
- Throughput expectation: 3060-class output will not match paper H100/4090 numbers. Plan around correctness first, then optimize steady-state chunk time.

## Realtime Node Parameter Budget

Keep realtime nodes small enough to run, debug, and explain:

- First-run pipeline controls: `frame`, `prompt`, optional `negative_prompt`, `profile` or model preset, output frame, and visible loading/error/status.
- First-run source controls: camera device, requested resolution preset, actual selected resolution, preview/start/stop, and capture/publish status.
- Immediate post-MVP controls: one LoRA selector, LoRA strength, one reference/VACE image input, and one control strength.
- Advanced collapsed controls: seed, width, height, inference steps, guidance/noise scale, quantization/profile override, cache reset, and deterministic/reuse-cache toggles.
- Adapter config only: model artifact paths, text encoder path, transformer/checkpoint path, VAE path, scheduler internals, denoising step schedule, VACE tensor/input names, dtype/offload placement, upstream class/import names, and arbitrary constructor/call kwargs.
- Not MVP UI: multi-LoRA stacks, merge-mode matrices, full VACE/control catalogs, per-layer offload settings, arbitrary model-path text fields, debug smoke flags, fake pipeline toggles, and upstream package/module overrides.

## Source UX Direction

- `Video Source` is the one user-facing source node, not separate normal-camera and realtime-camera nodes.
- The MVP source mode is camera capture with device selection, live preview, still capture, and a `realtime_frame` output.
- Camera capture exposes common resolution requests, including low-bandwidth and wide 480p presets. The UI should show the actual browser-selected camera mode because `getUserMedia` treats presets as constraints, not guaranteed modes.
- Camera preview warms up briefly before still capture or realtime publishing uses frames.
- The normal workflow output is `image`, filled by an explicit Capture Still action even when a workflow is not running.
- The realtime workflow output is `realtime_frame`, routed as `Video Source.realtime_frame -> model.frame`.
- Future source modes are video assets (`VideoRef` playback), NDI, Syphon, Spout, and audio input/output where the workflow needs it. Do not add those before the camera MVP works.

## Phase 0: Cleanup Before More Feature Work

These tasks must leave the codebase easier to run, not just better described. Each task has a concrete artifact to check.

### [x] 0.1 Use One Camera Ingress Path

Files:
- `packages/base-nodes/src/nodes/video.ts`
- `packages/base-nodes/src/index.ts`
- `packages/base-nodes/tests/nodes.test.ts`
- `web/src/components/video/VideoSourceNode.tsx`
- `web/src/components/video/captureStillImage.ts`
- `web/src/components/video/__tests__/captureStillImage.test.ts`
- `web/src/components/node/ReactFlowWrapper.tsx`
- `web/src/hooks/browser/useVideoCapture.ts`
- `web/src/hooks/realtime/useRealtimeCameraFramePublisher.ts`
- `web/src/components/realtime/useRealtimeStreamController.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/api-schemas/realtime.ts`
- `packages/runtime/src/python-bridge-types.ts`
- `packages/websocket/src/realtime/command-normalization.ts`
- `packages/websocket/src/realtime/frame-router.ts`
- `packages/websocket/tests/realtime-command-handler.test.ts`
- `packages/realtime-nodes/src/index.ts`
- `packages/realtime-nodes/tests/loopback.test.ts`
- `packages/realtime-nodes/tests/registration.test.ts`
- `packages/kernel/src/runner.ts`
- `packages/kernel/src/realtime-runner.ts`
- `packages/kernel/tests/realtime-runner.test.ts`

Steps:
- [x] Add `nodetool.video.VideoSource` as the normal graph source node.
- [x] Expose `Video Source` in the node menu and make it searchable by webcam/camera/video input terms.
- [x] Reuse `useVideoCapture` for camera enumeration, device selection, and live preview.
- [x] Add Capture Still to populate the normal `image` output outside workflow execution.
- [x] Add explicit `image` and `realtime_frame` outputs so realtime frames do not collide with existing video frame-as-image nodes.
- [x] Add `source_handle` to realtime media track mappings.
- [x] Treat all streaming media adapters as external input nodes, not only `nodetool.realtime.*` nodes.
- [x] Route pushed frames through the configured source handle, defaulting existing realtime adapters to `frame`.
- [x] Auto-select the first graph media adapter in the realtime controller, using `realtime_frame` for `nodetool.video.VideoSource`.
- [x] Keep `nodetool.video.VideoSource` frame-push targeting on the logical `camera` input instead of falling back to a node UUID/display name.
- [x] Remove the duplicate `nodetool.realtime.VideoSource` registration so video ingress has one user-facing node.
- [x] Disable WebRTC camera publishing when frame-push is active for the same session/input.
- [x] Add status for selected device, target handle, frame cadence, and routing errors.

Check:
- [x] Focused kernel/websocket tests route frames through `VideoSource.realtime_frame`.
- [x] One selected camera sends frames through exactly one graph input path.
- [x] Status shows which path is active.

### [x] 0.2 Create MVP Starter Template

Files:
- `nodetool-realtime/src/nodetool/examples/nodetool-realtime/Canonical Realtime Video Diffusion.json`
- `nodetool-realtime/src/nodetool/examples/nodetool-realtime/Dev Smoke Realtime Video Diffusion.json`
- `nodetool-realtime/tests/test_realtime_workflow_template.py`
- `nodetool-realtime/src/nodetool/package_metadata/nodetool-realtime.json`

Steps:
- [x] Create a starter template with exactly this main path: `Video Source -> Self-Forcing -> VideoSink -> Preview`.
- [x] Use the source edge `Video Source.realtime_frame -> Self-Forcing.frame`.
- [x] Remove `use_fake_pipeline` and other mock/dev fields from the starter.
- [x] Rename or copy the LongLive -> Self-Forcing graph as a dev/integration smoke template.
- [x] Update metadata so the starter points to the canonical MVP template, not the dev smoke graph.
- [x] Update tests to assert required MVP nodes and edges only.

Check:
- [x] The starter template opens as the user-facing MVP graph.
- [x] Dev smoke coverage still exists under a non-starter name.

### [x] 0.3 Reduce User Node Parameters

Files:
- `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py`
- `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py`
- `nodetool-realtime/src/nodetool/package_metadata/nodetool-realtime.json`
- `nodetool-realtime/tests/test_package_metadata.py`
- `nodetool-realtime/tests/test_realtime_node_outputs.py`

Steps:
- [x] List the current public fields for `SelfForcing` and `LongLive` from generated metadata.
- [x] Remove or hide `use_fake_pipeline` from normal metadata.
- [x] Remove or hide upstream module/class overrides from normal metadata.
- [x] Remove or hide arbitrary constructor/call argument-name overrides from normal metadata.
- [x] Remove or hide smoke env, noise shape, and low-level sampler/debug fields from normal metadata.
- [x] Keep only MVP controls: input frame, prompt, optional negative prompt, model/profile, output frame, and loading/error state.
- [x] Keep a dev/test construction path for mock pipelines outside normal user metadata.
- [x] Regenerate package metadata.
- [x] Update tests to check the reduced public field list.

Check:
- [x] The node UI no longer exposes dev/mock/adapter internals.
- [x] Existing dev tests can still instantiate mock pipelines.

### [x] 0.4 Align Docs And Metadata

Files:
- `nodetool-realtime/README.md`
- `nodetool-realtime/pyproject.toml`
- `nodetool-realtime/src/nodetool/package_metadata/nodetool-realtime.json`
- `packages/base-nodes/package.json`

Steps:
- [x] Make README point to this plan as the realtime source of truth.
- [x] Make README describe Self-Forcing RTX 3060 first and LongLive as a future/24 GB-class path.
- [x] Remove developer-only smoke commands from the user-facing README and make NodeTool template runs the documented validation path.
- [x] Mark placeholder extras such as `fp8`, `gguf`, and `int8` as reserved/no-op, or remove them until they install real dependencies.
- [x] Fix or remove stale `test:metadata-parity` wiring if the referenced test is still missing.
- [x] Regenerate metadata after node/template changes.

Check:
- [x] README, metadata, and starter template describe the same MVP.
- [x] No first-run doc points users at mock/dev success paths.

### [x] 0.5 Consolidate Smoke Code

Files:
- `nodetool-realtime/src/nodetool/realtime/wan21/rtx3060_realtime_smoke.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/dev_smoke_configs.py`
- `nodetool-realtime/tests/test_rtx3060_realtime_smoke.py`
- `nodetool-realtime/tests/test_self_forcing_smoke.py`
- `nodetool-realtime/tests/test_longlive_smoke.py`

Steps:
- [x] Choose `rtx3060_realtime_smoke.py` as the main smoke entrypoint.
- [x] Move duplicated Self-Forcing and LongLive env parsing into that entrypoint or dev-only helpers.
- [x] Delete or rewrite the Self-Forcing env smoke test if it cannot reach a real inference frame.
- [x] Rename mock-visible smoke paths so they are clearly dev/test-only.
- [x] Keep tests for artifact errors, loading state, frame output, camera ingress, and clean stop.

Check:
- [x] There is one obvious RTX 3060 smoke command.
- [x] Smoke tests no longer define the user-facing product shape.

### [x] 0.6 Trim Active Runtime Surface

Files:
- `nodetool-realtime/src/nodetool/realtime/model_artifacts.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/*`
- `packages/websocket/src/realtime/*`
- `packages/realtime-browser/`

Steps:
- [x] Identify which `model_artifacts.py` functions are used by the MVP path.
- [x] Move unused lifecycle reports, compatibility matrices, smoke command plans, and telemetry reports behind dev/future APIs.
- [x] Keep artifact resolution, missing-artifact errors, and VRAM/offload reporting in the MVP path.
- [x] Wire or delete unused TS realtime pacing code.
- [x] Wire or delete unused consumer queue registration code.
- [x] Fix codec metrics so they match real decode behavior, or remove codec status from MVP metrics.
- [x] Leave `packages/realtime-browser` out of MVP UI unless a visible editor proof uses it.

Check:
- [x] The runtime files needed for the MVP are easy to identify.
- [x] Future APIs do not appear as required MVP dependencies.

### [x] 0.7 Simplify Brittle Tests

Files:
- `nodetool-realtime/tests/test_model_artifacts.py`
- `nodetool-realtime/tests/test_self_forcing_scaffold.py`
- `nodetool-realtime/tests/test_self_forcing_backend.py`
- `nodetool-realtime/tests/test_longlive_backend.py`
- `packages/kernel/tests/realtime-runner.test.ts`
- `packages/realtime-nodes/tests/loopback.test.ts`
- `web/src/components/node/__tests__/outputChunkUtils.test.ts`

Steps:
- [x] Replace exact metadata dict assertions with behavior or required-key checks.
- [x] Replace exact internal reason-string assertions unless the string is user-visible.
- [x] Remove byte-level model pack size assertions unless the size is a published contract.
- [x] Keep one whitebox runner/buffer test layer and move duplicate coverage toward public behavior.
- [x] Rename `OutputRenderer.test.ts` if it only tests `outputChunkUtils`.

Check:
- [x] Tests guard visible behavior and important contracts, not scaffolding details.

### [ ] 0.8 Close Realtime Setup Audit Gaps

Files:
- `web/src/components/realtime/useRealtimeStreamController.ts`
- `web/src/components/realtime/realtimeTargetDiscovery.ts`
- `web/src/components/realtime/RealtimeStreamPage.tsx`
- `web/src/lib/websocket/RealtimeSessionClient.ts`
- `web/src/components/node_menu/RenderNodes.tsx`
- `nodetool-realtime/README.md`
- `nodetool-realtime/src/nodetool/realtime/runtime_artifacts.py`
- `nodetool-realtime/pyproject.toml`

Current findings:
- The app shell and `/realtime/:workflowId?` route exist, and frame-push routing now carries `input_name` plus `source_handle`, but TS tests mostly prove loopback/mocks. They do not yet prove the scanned Python `Video Source -> Self-Forcing -> VideoSink -> Preview` starter through the web session path.
- `realtimeTargetDiscovery.ts` chooses the first matching media adapter. Graphs with multiple realtime-capable sources or sinks can route silently to the wrong target unless the UI asks the user or rejects ambiguity.
- The current node menu still groups primarily by namespace. The product grouping names `Source`, `Pipeline`, `Sink`, `Output`, `Controls`, `UI`, `Utility`, `Media`, and `VACE` are guidance, not implemented menu structure.
- `useRealtimeStreamController` has thin test coverage for start/stop gating, auto-applied discovered targets, manual overrides, `?transport=webrtc`, and `?webrtcRuntime`.
- `nodetool-realtime` keeps `runtime_artifacts.__all__` intentionally narrow for core integration. If LoRA/VACE lifecycle hooks move into core, this API needs an explicit expansion rather than ad hoc imports from `model_artifacts.py`.
- `nodetool-realtime` documents placeholder extras (`fp8`, `gguf`, `int8`) as reserved/no-op. Runtime errors that mention those extras should not imply that installing them currently enables a real backend.
- The README is now user-facing and NodeTool-template-first. It no longer asks users to run standalone smoke commands; failures should point users toward visible NodeTool status, browser console errors, backend logs, model profile, model-file state, GPU model, and available VRAM.

Steps:
- [ ] Add a TS integration smoke for opening `/realtime/<workflow>`, seeing the Realtime shell state, starting a mocked realtime session, and verifying lifecycle/status rendering.
- [ ] Add a metadata-backed starter smoke that loads the scanned `nodetool-realtime` template and asserts the graph uses `nodetool.video.VideoSource.realtime_frame -> realtime.self_forcing.SelfForcing.frame -> VideoSink/Preview`.
- [ ] Define and test the ambiguous graph policy: either require the user to choose a realtime source/sink target when multiple candidates exist, or block start with a clear error.
- [ ] Add focused `useRealtimeStreamController` tests for disabled start rules, discovered target auto-apply, manual target overrides, frame-push vs WebRTC transport selection, and clean stop.
- [ ] Decide whether realtime menu grouping is an MVP task. If yes, add group metadata and render it; if not, mark the Source/Pipeline/Sink grouping as post-MVP and keep namespace grouping as the current behavior.
- [x] Rewrite the README validation path around running the `Realtime Video Diffusion` template in NodeTool and collecting useful diagnostic information when it fails.
- [ ] Keep `runtime_artifacts.__all__` minimal until core needs LoRA/VACE lifecycle APIs; add a task to expand it only with a corresponding core consumer and test.
- [ ] Keep placeholder extras clearly documented as unavailable until `fp8`, `gguf`, and `int8` install real dependencies.

Check:
- [ ] A reviewer can trace the starter from package metadata to the Realtime route and know which tests protect each handoff.
- [ ] Ambiguous realtime graph routing cannot silently choose the wrong source/sink.
- [x] Windows users can follow the README without translating shell syntax.

## Phase 1: MVP Inference Path

### [x] 1.1 Prove Preview Can Render Realtime Frames

Files:
- `web/src/components/node/OutputRenderer.tsx`
- `web/src/components/node/output/RealtimeVideoFrameRenderer.tsx`
- `web/src/components/node/output/__tests__/RealtimeVideoFrameRenderer.test.tsx`
- `web/src/components/node/PreviewNode/PreviewNode.tsx`
- `web/src/components/node/PreviewNode/__tests__/PreviewNode.test.tsx`
- `packages/runtime/src/context.ts`

Steps:
- [x] Create or run a smoke that sends one `rgb8` or `rgba8` `realtime_video_frame` into `VideoSink.frame`.
- [x] Connect `VideoSink.frame` to `Preview.value`.
- [x] Confirm the frame renders without asset conversion.
- [x] Fix rendering or normalization bugs found by the smoke. No production fixes were needed.
- [x] Keep recording/export/codec conversion out of this task.

Check:
- [x] `Preview` displays a raw realtime frame.
- [x] Unsupported formats show a clear message.

### [x] 1.2 Connect Camera `Video Source` To Model Input

Files:
- `packages/base-nodes/src/nodes/video.ts`
- `web/src/components/video/VideoSourceNode.tsx`
- `web/src/components/video/captureStillImage.ts`
- `web/src/components/node/ReactFlowWrapper.tsx`
- `packages/realtime-nodes/`
- `web/src/hooks/browser/useVideoCapture.ts`
- `web/src/hooks/realtime/useRealtimeCameraFramePublisher.ts`
- `web/src/components/realtime/`
- `packages/protocol/src/messages.ts`
- `packages/websocket/src/realtime/command-normalization.ts`
- `packages/websocket/src/realtime/frame-router.ts`
- `packages/kernel/src/runner.ts`
- `packages/kernel/src/realtime-runner.ts`

Steps:
- [x] Expose one clear `Video Source` node in the node menu.
- [x] Add camera device selection and live preview to `Video Source`.
- [x] Add camera warm-up before still capture or realtime publishing consumes frames.
- [x] Add common capture resolution presets, including low-res and wide 480p options.
- [x] Show the actual browser-selected camera mode from `MediaStreamTrack.getSettings()`.
- [x] Add normal still capture through `Video Source.image`.
- [x] Convert selected camera frames to `realtime_video_frame` through the existing frame publisher.
- [x] Route pushed realtime frames through `Video Source.realtime_frame`.
- [x] Preserve `sequence`, `timestamp_ns`, `pixel_format`, and latest-frame-wins behavior in the publisher path.
- [x] Add focused tests proving source-handle routing reaches downstream graph edges.
- [x] Show complete permission, missing-device, active-device, source failure, cadence, and routing status in the user UI.
- [x] Run a smoke proving captured camera frames route to the model `frame` input handle.

Check:
- [x] Starting the realtime session sends camera frames into the model input.

### [x] 1.3 Resolve Required RTX 3060 Artifacts

Files:
- `nodetool-realtime/src/nodetool/realtime/model_artifacts.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/rtx3060_realtime_smoke.py`
- `nodetool-realtime/README.md`

Current cache snapshot:
- Hugging Face cache root is `M:\HUGGINGFACE\hub`.
- Required RTX 3060 Self-Forcing artifacts are already cached:
  - `self_forcing_fp8_transformer`: `lym00/Wan2.1-T2V-1.3B-Self-Forcing-VACE-Addon-Experiment/Wan2.1_T2V_1.3B_SelfForcing_DMD-FP8_e4m3fn.safetensors` (`1,419,385,896` bytes)
  - `umt5_xxl_encoder_q5_k_m`: `city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q5_K_M.gguf` (`4,145,878,880` bytes)
  - `wan21_vae`: `Kijai/WanVideo_comfy/Wan2_1_VAE_bf16.safetensors` (`253,806,278` bytes)
- LongLive canonical artifacts are cached:
  - `longlive_base_checkpoint`: `Efficient-Large-Model/LongLive-1.3B/models/longlive_base.pt` (`5,676,334,208` bytes)
  - `longlive_lora_checkpoint`: `Efficient-Large-Model/LongLive-1.3B/models/lora.pt` (`2,800,056,690` bytes)
- Canonical Self-Forcing artifacts are not cached:
  - `Wan-AI/Wan2.1-T2V-1.3B`
  - `gdhe17/Self-Forcing/checkpoints/self_forcing_dmd.pt`
  - `gdhe17/Self-Forcing/configs/self_forcing_dmd.yaml`
- Optional VACE/control artifact is not cached and remains out of the Phase 1 MVP: `self_forcing_vace_fp8_transformer`.

Verified runtime state:
- `nodetool` conda env has PyTorch `2.9.0+cu128`, CUDA build `12.8`, CUDA available, and one `NVIDIA GeForce RTX 3060` with compute capability `(8, 6)`.
- `safetensors` `0.7.0` and `huggingface_hub` `1.8.0` import successfully.
- The GGUF artifact currently uses the `gguf_path_reference` loader; `nodetool-realtime[gguf]` has no runtime dependency yet.
- Cache-only artifact resolution is fixed so Hugging Face files already present in the local cache resolve without enabling downloads.
- Cache-only RTX 3060 smoke resolves all required artifacts and reaches `loading_transformer`; it then fails at the expected Phase 1.4 boundary: `Self-Forcing selected upstream pipeline must provide a callable inference method.`

Steps:
- [x] Check installed packs/cache before asking the user to download anything else.
- [x] Resolve `self_forcing_fp8_transformer` through the Hugging Face cache.
- [x] Resolve `umt5_xxl_encoder_q5_k_m` through the Hugging Face cache.
- [x] Resolve `wan21_vae` through the Hugging Face cache.
- [x] Verify CUDA PyTorch in the `nodetool` conda env.
- [x] Verify `huggingface_hub`, `safetensors`, and the selected GGUF loader.
- [x] Record local paths, missing reasons, and artifact sizes.
- [x] Keep optional LoRA/VACE artifacts out of this task.

Check:
- [x] Required artifacts resolve locally or fail with short actionable errors.

### [ ] 1.4 Implement One Self-Forcing Inference Adapter

Files:
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_pipeline.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_backend.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_sampler.py`
- `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py`
- `nodetool-realtime/src/nodetool/nodes/realtime/longlive.py`
- `nodetool-realtime/tests/test_package_metadata.py`

Current findings:
- Official Self-Forcing inference uses `pipeline.CausalInferencePipeline` for the DMD/few-step config and calls `pipeline.inference(noise=sampled_noise, text_prompts=prompts, return_latents=True, initial_latent=..., low_memory=...)`.
- Official setup installs a package named `self_forcing`, but the import surface used by the scripts is the top-level `pipeline` package.
- The current `nodetool` conda env has `omegaconf`, `diffusers`, `transformers`, and an incomplete `self_forcing` install, but does not have `torchao` or `flash_attn`.
- The current smoke reaches the sampler construction path, proving artifact resolution and basic loader hooks are working; the next blocker is that the selected generator object is an artifact-load result, not an instantiated upstream pipeline with `inference(...)`.
- The installed `self_forcing` distribution exposes `pipeline`, `model`, `trainer`, and `wan`, but importing `pipeline.CausalInferencePipeline` fails because the package does not include the top-level `utils.wan_wrapper` and `demo_utils.memory` modules referenced by upstream pipeline files.
- NodeTool now preflights this upstream package shape before starting the RTX 3060 adapter and reports a clear missing-upstream-runtime error instead of failing later with a sampler surface error.
- Upstream's documented `python setup.py develop` works by keeping the full repository root on `sys.path`; a normal package install is incomplete because `utils/` and `demo_utils/` are not Python packages. NodeTool may use `NODETOOL_SELF_FORCING_SOURCE_DIR` as a development bridge, but the user-facing solution must be a package-managed install/extra or compatibility package that works on a clean machine.
- The RTX 3060 adapter now constructs the selected upstream class with the real `CausalInferencePipeline(args, device, generator, text_encoder, vae)` signature. The remaining runtime gap is converting resolved NodeTool artifacts into actual Wan generator/text-encoder/VAE component objects instead of raw state dicts or path references.
- The adapter now rejects raw artifact values at the component boundary. It requires a Wan generator object with `get_scheduler` and `model`, a callable text encoder, and a VAE object with `decode_to_pixel`; the next task is to build those components from package-managed artifacts.
- Scope's model setup splits runtime code from artifacts: pipeline schemas declare artifacts, the server downloads selected Hugging Face files/directories by pipeline id, and runtime code ships with the app/package. Follow that split for NodeTool: `ModelsManager`/model packs can cover HF artifact downloads, but Python backend code and optional dependencies belong in `nodetool-realtime` packaging/preflight.
- The current RTX 3060 artifact set is not yet enough for the upstream Wan wrappers: upstream defaults expect a Wan model directory/tokenizer and package-local wrapper modules, while the current low-VRAM set contains an FP8 transformer artifact, a GGUF text encoder path, and a VAE safetensors file. The component builder must either adapt those artifacts deliberately or switch the MVP artifact manifest to a Scope-style Wan component set.
- The Python artifact manifest now mirrors the UI model-pack runtime-files entry and can resolve selected Hugging Face repo snapshots from a concrete cached file such as `config.json`.
- The RTX 3060 adapter has structured preflight issue codes for missing backend runtime, missing model artifacts, and missing component builder. This gives the app a clean way to tell the user whether to install a backend extra, download model files, or wait for/support a component builder.
- ComfyUI/WanVideoWrapper confirms the low-VRAM FP8/GGUF artifacts are viable in that ecosystem, but they depend on Comfy-specific loaders/bridges. Use that as a compatibility reference, not as the default Self-Forcing component path.
- The component-builder boundary now maps resolved artifacts into the official Self-Forcing factories: `WanDiffusionWrapper(is_causal=True)`, `WanTextEncoder()`, and `demo_utils.vae_block3.VAEDecoderWrapper()`. On the current env it still reports `missing_backend_dependency` because `utils.wan_wrapper` and `demo_utils.memory` are not installed as package modules.
- Official Self-Forcing has only `setup.py` with `find_packages()` and documents `python setup.py develop`; there is no `pyproject.toml`, and a normal wheel/direct install does not package the top-level runtime modules. `nodetool-realtime[self-forcing]` now captures package-installable dependencies, but a compatibility package or complete source-root install is still required for `utils/` and `demo_utils/`.
- The RTX 3060 preflight now has a compatibility package contract: if `nodetool_self_forcing_runtime` is installed and exposes `runtime_root()` or `RUNTIME_ROOT`, NodeTool validates that root for `pipeline/`, `utils/wan_wrapper.py`, `utils/scheduler.py`, and `demo_utils/memory.py`, then imports upstream `pipeline` from that package-provided root. `NODETOOL_SELF_FORCING_SOURCE_DIR` remains development-only.
- Course correction: enough preflight and packaging scaffolding exists for now. Do not add more installer work before proving visible model output. The next goal is a timeboxed real-frame spike, even if it uses `NODETOOL_SELF_FORCING_SOURCE_DIR` on the dev machine.
- The first output attempt should use the simplest upstream-compatible setup, not the final clean-install setup: complete Self-Forcing source root, official import path, conservative resolution, and a single `pipeline.inference(...)` call converted to a preview frame.
- If the official-compatible Self-Forcing spike cannot produce one frame on RTX 3060 after import/runtime and artifact mismatch issues are isolated, switch to a community FP8/GGUF Self-Forcing bridge or document the 3060 blocker. Standard LongLive belongs to a separate 24 GB-class lane.
- The RTX 3060 smoke now reads `NODETOOL_SELF_FORCING_SOURCE_DIR` directly and auto-loads `pipeline.CausalInferencePipeline` from that complete checkout, so the dev proof no longer requires separate upstream module/class override variables.
- Cache-only RTX 3060 smoke now resolves all four required artifacts and reaches the official component builder. The next concrete blocker is upstream's hardcoded relative Wan path: `WanDiffusionWrapper` / `WanTextEncoder` look for `wan_models/Wan2.1-T2V-1.3B/` instead of the resolved Hugging Face snapshot path.
- The local `Wan-AI/Wan2.1-T2V-1.3B` cache snapshot was incomplete for the official wrapper path: it lacked `diffusion_pytorch_model.safetensors` even though the upstream Hugging Face repo publishes it. The runtime-files manifest/model pack now includes that safetensors file in `allow_patterns`; re-download/repair the Wan runtime snapshot before the next full smoke.
- `nodetool.package_tools scan --package-dir . --write` has regenerated `nodetool-realtime` package metadata on disk, so the UI model pack now exposes the Wan runtime-files entry with `diffusion_pytorch_model.safetensors` included. The app can repair this through the normal model manager once package metadata is refreshed/loaded.
- Cache-only Hugging Face repo resolution now validates every concrete `allow_patterns` file in the snapshot. An incomplete Wan runtime snapshot with `config.json` but without `diffusion_pytorch_model.safetensors` is treated as `cached_repo_incomplete:diffusion_pytorch_model.safetensors` instead of failing later inside the upstream loader.
- The RTX 3060 smoke now uses the smallest upstream-valid noise shape `(1, 3, 16, 60, 104)` for the first visible-output spike. Upstream `CausalInferencePipeline` asserts that frame count is divisible by `num_frame_per_block`, which is 3 in the official DMD config, so a literal one-frame latent fails before inference.
- LongLive remains useful for future/24 GB-class hardware, but Daydream/Scope-style streaming data says it is not a 3060 12 GB target in standard form. The default Python LongLive path is also still scaffolded: `LazyLongLiveBackend` needs real sampler/generate wiring before it can run without injected test doubles.
- Current 3060 strategy: prove one generated frame with the official-compatible Self-Forcing path first, then tune memory/speed. Treat FP8 as a VRAM tool, CPU/offloaded UMT5 as acceptable, Wan VAE as keeper decode, TAEHV-style decode as preview-only, and SageAttention as post-correctness acceleration.
- Runtime evidence after repairing `diffusion_pytorch_model.safetensors`: the smoke reaches generator load, warm, ready, and real denoising, then OOMs at timestep `960.0` with `(1, 3, 16, 60, 104)`. A smaller `(1, 3, 16, 30, 52)` override gets farther, to timestep `727.27`, but still OOMs. The next likely path is stronger offload/attention work or the Comfy/Kijai-style low-VRAM bridge, not LongLive.
- Revised alternate path policy: if the official-compatible Self-Forcing path cannot emit a frame on 3060, switch to the Comfy/Kijai-style community FP8/GGUF Self-Forcing bridge or document the 3060 blocker. Keep LongLive as a separate option for users with larger GPUs unless new evidence proves a low-VRAM LongLive variant works.

MVP direction:
- The immediate goal is to see real generated output running inside NodeTool. Packaging, model-manager repair UX, clean installs, and ComfyUI-compatible low-VRAM bridges are secondary until one real frame is visible.
- Use a NodeTool-controlled adapter boundary, but keep the first pass lean: instantiate an upstream-compatible `CausalInferencePipeline` path with the cached artifacts, make the existing smoke return one real frame, then run the template in the editor.
- Do not build full model-manager dependency installation, multi-platform pack hardening, or advanced backend selection before the first real in-app output.
- For the dev proof, using a complete upstream source checkout via `NODETOOL_SELF_FORCING_SOURCE_DIR` is acceptable. For the user-facing path, do not require manual cloning; move that runtime into `nodetool_self_forcing_runtime` only after output is proven.
- Keep two setup channels separate: model/artifact downloads are user-facing pack actions; backend Python runtime code is package-managed and diagnosed as missing backend dependency, not as a missing model.
- Treat visible LongLive/Wan-style parameters as adapter config hints, not the Nodetool MVP surface: width/height, seed, VAE, quantization, noise scale, denoising steps, LoRA merge strength, and VACE slots help define the adapter config, but only prompt/profile/status should be first-run controls.
- Prefer real app testing over adding more scaffolding: after each small runtime change, ask the user to launch the workflow in NodeTool and report browser console plus server `TEMP_LOG` output.

Steps:
- [x] Identify the upstream Self-Forcing class/function that provides `inference(noise, text_prompts, return_latents, low_memory)`.
- [x] Choose the lean MVP path: a NodeTool-controlled adapter around the official `CausalInferencePipeline` pattern, with any upstream package dependency kept explicit and minimal.
- [x] Map NodeTool's cached artifact paths into a typed model-path config for text encoder, transformer/checkpoint, VAE, optional LoRA, and optional VACE/control artifacts.
- [x] Add a small backend pipeline manager that lazy-loads one pipeline per profile, reuses warm state during a realtime session, and releases resources on stop/error.
- [x] Move RTX 3060 artifact-loader/checkpoint wiring out of the smoke script so the smoke and normal `SelfForcing` node use the same adapter kwargs.
- [x] Add a runtime preflight for the installed upstream Self-Forcing `pipeline.CausalInferencePipeline` import surface.
- [x] Add a dev-only source-dir bridge for a complete upstream Self-Forcing checkout so adapter work can continue without pretending the installed wheel is sufficient.
- [x] Switch the checkpoint applier from placeholder `artifacts=...` construction to the real upstream `CausalInferencePipeline(args, device, generator, text_encoder, vae)` constructor shape.
- [x] Add explicit component validation so raw safetensors dictionaries and GGUF path references are not passed into `CausalInferencePipeline`.
- [x] Add a selected-file HF model-pack entry for Wan 2.1 base runtime files so the existing `ModelsManager` path can download more than individual model files.
- [x] Add a Scope-style realtime artifact manifest/model-pack contract for the MVP profile, including selected Wan runtime files plus the low-VRAM transformer/text-encoder/VAE artifacts.
- [x] Split preflight/reporting into at least `missing_backend_dependency`, `missing_model_artifact`, and `missing_model_component_builder` states.
- [x] Add a component-builder hook so loaded artifact results can be converted into Wan generator/text-encoder/VAE objects before `CausalInferencePipeline` construction.
- [x] Add the concrete RTX 3060 Wan component-builder wiring for official Self-Forcing wrapper factories, with import-injected tests for clean package installs and clear missing-runtime errors for incomplete installs.
- [ ] Track the ComfyUI FP8/GGUF path separately: it may require Comfy/Kijai loader logic or a compatibility bridge rather than direct upstream Self-Forcing constructors.
- [x] Add a package-managed dependency extra (`nodetool-realtime[self-forcing]`) for Self-Forcing runtime dependencies and make preflight errors point to it plus the remaining compatibility package/source-root requirement.
- [x] Define the clean-install compatibility package contract so `nodetool_self_forcing_runtime.runtime_root()` or `RUNTIME_ROOT` can provide the selected Self-Forcing/Wan runtime modules (`utils/`, `demo_utils/`, `pipeline/`) without `NODETOOL_SELF_FORCING_SOURCE_DIR`.
- [x] Make the RTX 3060 smoke auto-use `NODETOOL_SELF_FORCING_SOURCE_DIR` for the upstream `CausalInferencePipeline` instead of requiring dev-only module/class override env vars.
- [x] Timebox the Self-Forcing real-frame spike: use a complete upstream checkout through `NODETOOL_SELF_FORCING_SOURCE_DIR`, run the RTX 3060 smoke, and record the first concrete blocker after `pipeline.CausalInferencePipeline` imports.
- [x] Load the official Self-Forcing config/runtime defaults needed by `CausalInferencePipeline`; hardcode only the current RTX 3060 smoke profile values in the adapter boundary, not in UI fields.
- [ ] Decide the first-frame artifact set by runtime evidence: either adapt the current FP8/GGUF/VAE artifacts if the official wrappers accept them, or switch this spike to the official Wan/Self-Forcing artifact set that the upstream pipeline already expects.
- [x] Add the official `diffusion_pytorch_model.safetensors` to the Wan runtime-files artifact/model-pack allow list so `ModelsManager` and smoke downloads can repair incomplete HF cache snapshots.
- [x] Regenerate `nodetool-realtime` package metadata so the runtime-files model pack is visible to the app/model manager.
- [x] Make cache-only repo resolution reject incomplete selected-file snapshots so partial Wan runtime caches are reported as missing artifacts.
- [x] Re-download/repair `Wan-AI/Wan2.1-T2V-1.3B:runtime-files` so the resolved snapshot includes `diffusion_pytorch_model.safetensors`.
- [ ] Resolve the upstream Wan path mismatch: either provide a safe `wan_models/Wan2.1-T2V-1.3B` alias for the resolved runtime snapshot during component construction, or replace the official wrapper constructors with explicit-path NodeTool builders.
- [x] Reduce the RTX 3060 spike sampler to the smallest valid 3-frame block so the next smoke run can still return one preview frame.
- [x] Add a smoke-only noise-shape override so the RTX 3060 run can validate smaller latent sizes without changing user-facing node fields.
- [ ] Validate at least two low-VRAM spatial profiles with runtime evidence: about `416x240` for fastest proof and `320x512` for a better vertical/wide compromise.
- [ ] Keep DMD sampling fixed to the upstream few-step config for the MVP; do not expose step count, CFG, or negative-branch controls until output is stable.
- [ ] After one frame works, implement bounded rolling KV cache accounting and decide whether first-chunk/frame-sink anchoring is required for prompt-stable streaming.
- [ ] After correctness, evaluate attention acceleration in this order: FlashAttention pinned upstream version if installable, SDPA as correctness fallback, SageAttention CUDA backend only if it preserves Wan output.
- [ ] Consider TAEHV/TAEW preview decode only after full Wan VAE decode produces a keeper frame.
- [x] Wire exactly one direct `pipeline.inference(...)` call from the smoke path with a fixed prompt and conservative shape; do this before implementing streaming reuse, prompt updates, or packaging polish.
- [x] Convert the returned latent/video tensor to one `rgb8` or `rgba8` `realtime_video_frame` and route it to the existing preview path.
- [ ] If the official-compatible Self-Forcing path still cannot emit one frame on 3060, document the exact blocker and switch Phase 1 output to a community FP8/GGUF Self-Forcing bridge before considering non-3060 LongLive.
- [ ] Move LongLive work to the future/24 GB lane: implement the default `LazyLongLiveBackend` sampler/generate path and validate it against a 24 GB-class GPU before presenting it as a user-facing option.
- [ ] If LongLive-on-3060 is revisited, require an explicit experimental plan: aggressive KV offload, capped/short windows, INT8 weights, BF16 compute, low resolution such as 256x448, and a clear unsupported status.
- [ ] Populate `nodetool-realtime` optional extras (`fp8`, `gguf`, `int8`) only after the corresponding real backend path is validated; until then, keep errors/docs clear that they are placeholders.
- [ ] After a real frame exists, add or publish the actual compatibility package/vendor artifact that contains the selected upstream Self-Forcing runtime files and implements the `nodetool_self_forcing_runtime` contract.
- [ ] After a real frame exists, move only the required components to CUDA/CPU for the RTX 3060 smoke profile and optimize memory/offload placement.
- [x] Audit `SelfForcing` and `LongLive` public fields against the parameter budget so user-facing nodes cover important controls without exposing adapter internals.
- [ ] Connect resolved artifacts to the selected real pipeline class, Self-Forcing or community Self-Forcing bridge, based on the timeboxed spike result.
- [ ] Emit resolve, load, warm, ready, error, and stop phases.
- [ ] Report backend, precision, VRAM/offload, latency, and artifact paths.

Check:
- [ ] One inference call returns a `realtime_video_frame`.
- [ ] The first successful frame is produced by a real model path, not `FakeSelfForcingPipeline`.
- [ ] Any remaining Self-Forcing packaging work is explicitly after the first visible output, not before it.

### [ ] 1.5 Run End-To-End On RTX 3060

Files:
- MVP realtime template
- `packages/websocket/src/realtime/*`
- `packages/kernel/src/runner.ts`
- `packages/kernel/src/realtime-runner.ts`
- `web/src/components/node/PreviewNode/PreviewNode.tsx`
- `web/src/hooks/browser/useVideoCapture.ts`
- `web/src/hooks/realtime/useRealtimeCameraFramePublisher.ts`

Steps:
- [ ] Open the MVP template.
- [ ] Select a camera.
- [ ] Start the realtime session.
- [ ] Confirm the `Model Runtime Status` card advances through startup/model/frame states or shows the blocking error.
- [ ] Ask the user to run this in the app immediately after each backend change and report browser console plus server logs.
- [ ] Confirm camera frames reach the model.
- [ ] Confirm generated frames appear in `Preview`.
- [ ] Change the prompt once while running.
- [ ] Stop the session cleanly.
- [ ] Record latency, memory/offload state, and any dropped-frame count shown by the app/logs.
- [ ] Use realtime debug logs to identify any failed browser -> websocket -> runner -> Python handoff.
- [ ] Keep useful diagnostics as normal debug/warn/error logging; remove temporary `TEMP_LOG` labels after the smoke is understood.

Check:
- [ ] A user sees generated model output in `Preview` on RTX 3060-class hardware.
- [ ] No mock/dev pipeline is used for the success path.
- [ ] No temporary `TEMP_LOG` instrumentation remains unless intentionally retained behind normal debug logging.

### [x] 1.6 Write One-Page User Runbook

Files:
- `nodetool-realtime/README.md` or this file

Steps:
- [x] Document conda activation.
- [x] Document CUDA check.
- [x] Document required Python packages.
- [x] Document artifact cache check.
- [x] Document the exact workflow/template to open.
- [x] Document what to click.
- [x] Document expected `Preview` behavior.
- [x] Document which logs to collect on failure.

Check:
- [x] Another user can attempt the MVP without reading source code.

## Phase 2: Immediate User Value

### [ ] 2.1 Add One Compatible LoRA

Steps:
- [ ] Choose one LoRA compatible with the selected MVP model family and size.
- [ ] Add one LoRA selector.
- [ ] Add one strength control.
- [ ] Apply the LoRA through the same model lifecycle.
- [ ] Reject incompatible LoRAs before mutating model state.
- [ ] Keep stacking, marketplace UI, and merge-mode matrices out.

Check:
- [ ] The user can enable one compatible LoRA and see a visible effect in `Preview`.

### [ ] 2.2 Add Reference Image Control

Steps:
- [ ] Validate one VACE/control artifact for the MVP model and RTX 3060 memory budget.
- [ ] Add one `reference_image` input to the model node.
- [ ] Prefer a small VACE/control helper node feeding the pipeline over making the base pipeline require VACE fields.
- [ ] Load VACE as an optional stage after the base model works.
- [ ] Show VACE loading/error state separately.
- [ ] Keep pose, depth, inpaint, and multi-control catalogs out.

Check:
- [ ] A reference image can guide generated output.
- [ ] The base MVP still runs with VACE disabled.

## Phase 3: Editor Productization

### [ ] 3.1 Add Realtime Editor Controls

Steps:
- [ ] Add Play/Stop controls for the current realtime workflow.
- [ ] Keep `Editor | Chat | App | Realtime` header navigation while the dedicated realtime page is the diagnostic launch path.
- [ ] Make live `Preview` the primary feedback surface.
- [ ] Show source, prompt, profile, LoRA, and reference image controls when available.
- [ ] Show idle/loading/warming/running/stopping/error states.
- [ ] Show backend, precision, VRAM/offload, and missing artifact state.

Check:
- [ ] A user can start, stop, inspect, and steer the MVP workflow from the editor.

### [ ] 3.2 Add Realtime Node Badges And Validation

Steps:
- [ ] Consider realtime-friendly node menu groups: `Source`, `Pipeline`, `Sink`, `Controls`, and `VACE`.
- [ ] Badge realtime-capable nodes.
- [ ] Validate `Video Source -> model -> VideoSink -> Preview` before Play.
- [ ] Show concise graph validation reasons.

Check:
- [ ] Invalid realtime graphs explain what is missing before the user starts.

### [ ] 3.3 Add Recording / Save Output

Steps:
- [ ] Save generated output from `VideoSink` or `Preview` as a Nodetool asset.
- [ ] Save source, prompt, model profile, LoRA, and reference image metadata.

Check:
- [ ] A user can keep a generated realtime result.

### [ ] 3.4 Add Local-Network Runbook

Steps:
- [ ] Document HTTPS/WSS requirements.
- [ ] Document websocket upgrade requirements.
- [ ] Document session ownership expectations.
- [ ] Document local GPU worker placement.
- [ ] Add the smallest remote browser -> app -> local GPU worker -> Preview smoke path.
- [ ] Note ICE/STUN/TURN requirements without implementing TURN management.

Check:
- [ ] A developer can test the workflow from another browser on the local network.

### [ ] 3.5 Add Browser-Local Analysis Proof

Steps:
- [ ] Add one browser-local analysis adapter that emits `realtime_analysis_event`.
- [ ] Map one event to one realtime parameter update.
- [ ] Report loading/cache/backend state as `realtime_inference_metrics`.

Check:
- [ ] One browser-local analysis result can steer one running server/Python session.

### [ ] 3.6 Harden Realtime Pack Installation

Steps:
- [ ] Move any temporary Self-Forcing dev install/vendor path into a documented `nodetool-realtime` backend extra or package-managed install path.
- [ ] Add preflight checks for CUDA availability, supported GPU memory, PyTorch CUDA build, `safetensors`, upstream Self-Forcing imports, and optional quantization libraries.
- [ ] Show missing backend dependency reasons in the model manager before a user starts a realtime session.
- [ ] Keep the base realtime pack installable without heavyweight Self-Forcing dependencies.
- [ ] Add a one-command or one-click repair path for missing realtime backend dependencies where the platform supports it.

Check:
- [ ] A new user can install the realtime pack, download the recommended model pack, and see actionable setup status without reading source code.

## Deferred Context

Useful references, not active tasks:

- Runtime contract: `docs/realtime-runtime-contract.md`
- Frame protocol: `packages/protocol/src/realtime-frame.ts`
- TS realtime nodes: `packages/realtime-nodes/`
- Realtime websocket/session code: `packages/websocket/src/realtime/`
- Kernel runner: `packages/kernel/src/runner.ts`
- Realtime runner shell: `packages/kernel/src/realtime-runner.ts`
- Python realtime package: `nodetool-realtime/`
- Feature backlog: `REALTIME-FEATURE-IDEAS.md`

## Maybe Later

- [ ] Full LongLive validation and quality comparison.
- [ ] Full official Self-Forcing quality validation.
- [ ] FP8/GGUF/INT8 matrix beyond the selected RTX 3060 path.
- [ ] Multiple LoRAs, LoRA stacking, and advanced merge modes.
- [ ] Additional VACE controls: pose, depth, inpaint, multi-control composition.
- [ ] Model pack catalog and persistent cache cleanup UX.
- [ ] Production HTTPS/WSS, auth, reverse proxy, sticky routing, public outputs, and worker recovery.
- [ ] Editor-facing transport selector for frame-push vs WebRTC.
- [ ] ICE/STUN/TURN configuration UI and operational metrics.
- [ ] Remote GPU worker routing beyond local network.
- [ ] Full backend WebRTC codec decode/encode.
- [ ] WHIP/WHEP ingest and egress.
- [ ] Timeline editing and export presets.
- [ ] Video asset (`VideoRef`) source playback.
- [ ] NDI, Spout, Syphon.
- [ ] MIDI, OSC, DMX, timecode.
- [ ] Audio input/output beyond what the workflow needs.
- [ ] Admin dashboard for sessions, worker load, queues, and stuck session eviction.
- [ ] Entitlements, rate limits, multi-region routing, and remote media brokering.
- [ ] NVIDIA Lyra or other future model families.
