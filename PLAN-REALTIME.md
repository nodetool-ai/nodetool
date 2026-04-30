# Realtime Execution Plan

## Goal

Build the first user-visible Nodetool realtime workflow:

```text
Video Source -> Self-Forcing RTX 3060 profile -> VideoSink -> Preview
```

Success means a user selects a camera, starts the workflow, and sees generated model output in the normal Nodetool `Preview` node on RTX 3060-class hardware.

For Phase 1, every task is subordinate to one observable outcome: real model-converted frames must appear in the output `Preview`. A change is on-path only if it helps a browser camera frame reach the runner, helps the selected model convert that input into a `realtime_video_frame`, or helps that frame route through `VideoSink -> Preview`. Packaging polish, broad status surfaces, optional controls, and extra model lanes wait until that preview frame exists.

## Next Steps To Real Preview Frames

Core pipeline goal:

`Camera frame -> active realtime runner input -> simple realtime module -> VideoSink -> Preview -> standalone Wan bridge -> one denoise/decode -> VideoSink -> Preview`

Work only on this path until the normal Nodetool `Preview` shows one real model-converted frame. Do not move to packaging, LoRA, VACE, LongLive, broad UI polish, alternate backends, or general test coverage until this pipeline works. For this phase, tests are only direct feedback to concrete blockers and errors; add a focused test only when it helps reproduce or prevent the specific failure being fixed.

1. [ ] **Camera frame -> active realtime runner input**
   - Run the app with the realtime template and camera publisher.
   - Confirm `Browser frames` is greater than zero.
   - Confirm either `Routed frames` or `Unrouted frames` increments from backend metrics.
   - Confirm at least one frame reaches `VideoSource.realtime_frame -> SelfForcing.frame` in the active runner.
   - If this fails, debug only `push_realtime_frame -> frame ack/metrics -> FrameRouter -> runner.pushInputValue`.
   - Latest app evidence: browser/backend ingestion works (`Browser frames: 39`, `Unrouted frames: 38`, active session inbound 38). Active-runner proof is still blocked because the realtime job fails during startup before frames can route into the runner.
   - Current startup blocker: `nodetool_wan_bridge.create_components(...)` raises `Community Wan bridge component loading is not implemented yet.`

2. [ ] **Simple realtime module -> VideoSink -> Preview baseline**
   - [x] Add or expose a tiny TS realtime passthrough node first, then optionally RIFE and optical-flow style nodes if they already fit the realtime frame contract.
   - [x] Register the passthrough node through `REALTIME_NODES` / `registerRealtimeNodes`.
   - [x] Verify the non-app loopback path forwards pushed frames through passthrough into `VideoSink`.
   - [ ] Run `Camera frame -> passthrough -> VideoSink -> Preview` in the app before touching Wan loading.
   - Success means the normal Preview shows the live frame through a realtime processing node, proving routing, runner input, node output, and sink/preview without model-loader risk.
   - If TS node discovery does not show the new nodes, check `packages/realtime-nodes/src/index.ts` (`REALTIME_NODES`, `registerRealtimeNodes`) and the server registry path before changing Python package metadata.
   - If typed DSL helpers are needed for these TS nodes, update `packages/dsl/scripts/codegen.ts` to include `REALTIME_NODES` in addition to `ALL_BASE_NODES`, then run `npm run codegen --workspace=packages/dsl`.

3. [ ] **Active runner input -> standalone Wan bridge call**
   - Keep the bridge boundary in `nodetool_wan_bridge`; do not call a live ComfyUI runtime.
   - Pass one received frame plus prompt/config into the bridge's `inference(...)` entry point.
   - Load only the base required artifacts: Wan runtime files, FP8 Self-Forcing transformer, GGUF UMT5 text encoder, and Wan VAE.
   - Keep VACE, LoRA, speed-LoRA, and control artifacts disabled and unresolved unless an explicit later profile/control enables them.
   - If a loader detail is unclear while implementing, research only that missing detail, record it under this task, then return to implementation.

4. [ ] **Standalone Wan bridge -> one denoise/decode**
   - Build the smallest practical preview run first.
   - Use a minimal shape that can produce a visible frame on the low-VRAM target; if shape is unknown at implementation time, try the two smallest plausible Wan-compatible shapes and record the one used.
   - Return a real decoded frame from the bridge with `pixel_format=rgba8`, non-empty `data`, real bridge metadata, and no `FakeSelfForcingPipeline`.
   - If the failure is a missing dependency, OOM, tensor shape error, or decode error, add the smallest focused reproduction only if it speeds up the fix.

5. [ ] **realtime_video_frame -> VideoSink -> Preview**
   - Route the generated `realtime_video_frame` through the existing `VideoSink`.
   - Confirm the existing `Preview` node shows the converted output frame, not the raw camera frame and not a black placeholder.
   - Keep diagnostics limited to what explains this path: routing count, backend stage, last error, precision/offload, latency, and artifact paths.

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

## De-Risk Gates Before More Adapter Work

These gates replace the previous pattern of discovering one blocker per app run:

- Reference reproduction gate: before another deep app-template iteration, reproduce or document one known-working low-VRAM Wan/Self-Forcing reference path. Record exact model files, loader nodes/classes, precision, resolution, frame count, VAE decode path, offload/block-swap settings, and observed VRAM.
- Frame-routing gate: before another model-runtime attempt in the app, prove that browser camera frames reach the active realtime runner and update backend routing metrics. `Browser frames > 0` with `Routed frames = 0`, `Unrouted frames = 0`, and `Inference nodes = 0` means the push-frame ack/metrics boundary is broken or invisible; fix that before loader work.
- Loader decision gate: split Phase 1.4 into two explicit tracks and pick one after a short spike:
  - Official-compatible Self-Forcing: complete upstream source or `nodetool_self_forcing_runtime`, `pipeline.CausalInferencePipeline`, NodeTool path redirects, official Wan wrappers, and full Wan VAE decode.
  - Selected path: a community low-VRAM Wan bridge. This means NodeTool must call a concrete Wan loader surface for the current FP8 transformer, GGUF UMT5 text encoder, and Wan VAE; expose block/offload settings required to fit 12 GB; and keep optional VACE/LoRA/control artifacts out of the base run. If the import surface or required arguments are unclear, the task is research first, implementation second.
- Status surface gate: model loading must be visible outside node output values. The app should expose aggregate `resolving`, `loading transformer`, `loading text encoder`, `loading VAE`, `warming`, `ready`, and `error` stages during startup.
- Manifest gate: base templates may load only required base artifacts. Optional VACE, LoRA, speed-LoRA, and control artifacts must not be resolved or loaded unless an explicit profile/control enables them.
- Hardware gate: low-VRAM profiles stay on Self-Forcing/community Wan 1.3B FP8/GGUF paths. LongLive, StreamDiffusion-style streaming, full VACE/control stacks, and packaged Scope-style realtime pipelines are 24 GB-class options unless a separate unsupported low-memory experiment proves otherwise.

Reference notes:

- Scope/Daydream loads pipelines separately from streaming: `POST /api/v1/pipeline/load` starts loading, `GET /api/v1/pipeline/status` reports `status`, `error`, and `loading_stage`, and only then does WebRTC streaming begin. In code, `scope.server.pipeline_manager.PipelineManager` uses `PipelineStatus`, `set_loading_stage()`, thread-safe load state, and background executor loading.
- Daydream public requirements put LongLive and StreamDiffusion V2 at a 24 GB minimum with about 20 GB runtime VRAM estimates. This is a hardware profile boundary, not a fallback decision for the low-VRAM path.
- Kijai/ComfyUI WanVideoWrapper treats low-VRAM Wan as a loader ecosystem: transformer files in `models/diffusion_models`, text encoders/GGUF in text encoder or clip folders, VAE in `models/vae`, FP8 scaled models, GGUF loaders, optional VACE modules, and block/offload controls for memory. NodeTool should mirror the loader facts, not assume the official Self-Forcing constructors cover the community artifact layout.
- Latest app run exposed a core runtime blocker before model inference: the browser published camera frames at 2 fps, but the session status stayed at `Routed frames: 0`, `Unrouted frames: 0`, and `Inference nodes reporting: 0`. The next actionable item is to prove whether `push_realtime_frame` acknowledgements reach `RealtimeSessionStore` and whether `FrameRouter.routeFrame()` reaches the active runner.

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

### [ ] 1.2 Connect Camera `Video Source` To Model Input

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
- [x] Add focused tests for captured camera frames routing to the model `frame` input handle.

Check:
- [ ] App runtime check still needed: browser-published camera frames must increment routed or unrouted backend metrics and reach the active runner.

### [x] 1.3 Resolve Required Low-VRAM Artifacts

Files:
- `nodetool-realtime/src/nodetool/realtime/model_artifacts.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/rtx3060_realtime_smoke.py`
- `nodetool-realtime/README.md`

Current cache snapshot:
- Hugging Face cache root is `M:\HUGGINGFACE\hub`.
- Required low-VRAM Self-Forcing artifacts are already cached:
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
- Low-VRAM artifact resolution is good enough for the next bridge spike. The remaining blockers are runtime routing and bridge construction, not missing base artifacts.

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

Current decision:
- First prove the realtime frame-push path: browser camera frames must reach the active runner and update routed/unrouted metrics. If the UI shows browser frames but both routed and unrouted stay at zero, debug `push_realtime_frame -> realtime_session_ack -> RealtimeSessionStore -> runner.pushInputValue` before touching model loaders.
- Use the community low-VRAM Wan/Self-Forcing bridge for the first generated frame. The official-compatible `CausalInferencePipeline` path is preserved as reference material and a later 24 GB/full-upstream track, not the active 12 GB route.
- Keep LongLive separate for 24 GB-class users. Do not treat it as a fallback for low-VRAM Self-Forcing.
- Treat `VideoSink -> Preview` as the Phase 1.4 acceptance gate. Loader structure, status reporting, and dependency packaging are incomplete unless one real converted frame reaches the existing preview path.

Evidence to keep:
- Artifact resolution, model-pack metadata, cache validation, and preflight issue codes are already useful and should remain part of the implementation.
- The official-compatible spike imported the upstream shape, repaired the Wan runtime snapshot, reached real denoising, and then OOMed before decode on 12 GB. That is enough evidence to stop patching official constructors for the low-VRAM MVP.
- Scope's split is the right lifecycle model: resolve/download artifacts separately, load asynchronously, expose `loading_stage`, then stream.
- Public Wan loader implementations are reference material for low-VRAM behavior: FP8/GGUF transformer/text encoder, explicit VAE path, optional VACE disabled unless selected, and memory/offload controls as real loader inputs. Direct ComfyUI runtime integration is not part of the accepted Phase 1.4 path.

Next steps:
- [ ] Follow `Next Steps To Real Preview Frames` in order; treat that section as the active Phase 1.4 task list and the source of truth.
- [ ] Camera frame -> active realtime runner input: one camera frame increments routed or unrouted backend metrics and calls the active runner with `VideoSource.realtime_frame`.
  - [x] Fix client metrics so `push_frame` acknowledgements are not overwritten by lagging zero-valued periodic metrics.
  - [x] Record frame-push routed/unrouted counts in backend metrics so periodic `realtime_metrics` reflects websocket frame-push sessions, not only WebRTC sessions.
- [ ] Simple realtime module -> VideoSink -> Preview baseline: add/expose a TS passthrough node in `packages/realtime-nodes`, verify it appears through `registerRealtimeNodes`, and run a camera-to-preview path through it.
  - [x] Added `nodetool.realtime.VideoPassthrough`.
  - [x] Registered it in `REALTIME_NODES` / `registerRealtimeNodes`.
  - [x] Added focused loopback coverage for `VideoSource -> VideoPassthrough -> VideoSink`.
  - [x] Updated DSL codegen to include `REALTIME_NODES` and generated `nodetool.realtime.videoPassthrough(...)`.
  - [x] Added `Realtime Passthrough Baseline` workflow example with no model loader.
  - [ ] Run the app-only `Camera frame -> passthrough -> VideoSink -> Preview` check.
  - [ ] Treat RIFE and optical-flow style modules as optional next baselines only after passthrough proves the frame contract.
- [ ] Active runner input -> standalone Wan bridge call: replace `nodetool_wan_bridge`'s temporary injectable generator with base artifact loading and a real inference entry point.
  - [x] Add an explicit bridge boundary that consumes runtime/FP8 transformer/GGUF text encoder/VAE manifest paths and reports a bridge-runtime dependency error instead of falling back to official Self-Forcing source-root failures.
  - [x] Add the bridge package/import surface and `inference(...)` API shape consumed by the existing sampler.
  - [x] Preserve bridge metadata on emitted `realtime_video_frame` values so Preview/status diagnostics identify the community low-VRAM path.
  - [x] Keep optional VACE/LoRA artifact IDs out of the default bridge config and default node path.
  - [ ] Load only the base required artifacts: Wan runtime files, FP8 Self-Forcing transformer, GGUF UMT5 text encoder, and Wan VAE.
  - [ ] Keep VACE, LoRA, speed-LoRA, and control artifacts disabled until an explicit profile/control enables them.
- [ ] Standalone Wan bridge -> one denoise/decode: run the smallest practical preview shape and return one real `rgba8 realtime_video_frame`.
- [ ] `realtime_video_frame -> VideoSink -> Preview`: route the generated frame through the existing preview path.
- [ ] Diagnostics for missing Preview frames: emit only the phases and status fields needed to explain this pipeline failure: routing count, backend stage, last error, precision/offload, latency, and artifact paths.
- [ ] After one real Preview frame exists, revisit clean-install packaging, CUDA/CPU placement, attention acceleration, preview decoders, LoRA, VACE, and the 24 GB LongLive lane.

Check:
- [ ] Browser frames > 0 produces nonzero routed or unrouted backend metrics.
- [x] Existing focused checks preserve and display routed frame counts after `push_frame` acknowledgements.
- [x] Existing focused checks route pushed frames to the active runner on `VideoSource.realtime_frame`.
- [ ] One inference call returns a `realtime_video_frame`.
- [ ] The first successful frame is produced by a real model path, not `FakeSelfForcingPipeline`.
- [ ] Base runs skip optional VACE/LoRA/control artifacts unless explicitly enabled.
- [ ] Any failure shown to the user includes stage and last error, not just a black preview.

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

### [ ] 2.0 Recreate Realtime Utility Modules As NodeTool Nodes

Goal:
- Add a small library of reusable realtime processing nodes after the first real model frame reaches `Preview`.
- Implement them as fresh NodeTool nodes that closely match the intended behavior and frame contracts; do not copy source code from another project.
- Keep each node independently useful in `Camera frame -> node -> VideoSink -> Preview` graphs.

Order:
- [ ] `RealtimePassthrough`
  - Description: Show the live camera feed through the realtime graph unchanged so users can confirm routing and preview work before loading a model.
  - Tags: realtime, video, passthrough, camera, preview, routing, baseline
- [ ] `RealtimeGray`
  - Description: Convert the live video feed to black-and-white for a simple visible processing check and for workflows that need luminance-only input.
  - Tags: realtime, video, grayscale, black-and-white, luminance, preprocessing
- [ ] `RealtimeScribble`
  - Description: Turn live video into bold edge/contour drawings that can be previewed directly or used later as control input for generation.
  - Tags: realtime, video, edges, contours, scribble, control, preprocessing
- [ ] `RealtimeOpticalFlow`
  - Description: Visualize motion between consecutive frames so users can see movement direction and speed as a color-coded realtime image.
  - Tags: realtime, video, optical-flow, motion, tracking, visualization, preprocessing
- [ ] `RealtimeRIFE`
  - Description: Create in-between frames from live video to make motion smoother or increase apparent frame rate when the device supports it.
  - Tags: realtime, video, interpolation, frame-rate, motion-smoothing, RIFE
- [ ] `RealtimeVideoDepth`
  - Description: Estimate a depth map from live video so nearby and distant areas can be previewed or used as control signals.
  - Tags: realtime, video, depth, depth-map, distance, control, preprocessing
- [ ] `RealtimeControllerViz`
  - Description: Render keyboard, mouse, or controller input as a realtime visual overlay for debugging interactive workflows.
  - Tags: realtime, controls, keyboard, mouse, controller, visualization, debugging

Implementation notes:
- Prefer TypeScript nodes under `packages/realtime-nodes` when the implementation can run in the TS runtime without Python model dependencies.
- Use Python nodes under `nodetool-realtime` only for model-heavy processing that needs torch/CUDA or existing Python media utilities.
- If TS nodes need typed DSL helpers, update `packages/dsl/scripts/codegen.ts` to include `REALTIME_NODES` alongside `ALL_BASE_NODES`, then run `npm run codegen --workspace=packages/dsl`.
- Do not add these nodes to the active Phase 1.4 success path except for the simple passthrough baseline.

Check:
- [ ] Each node can be inserted between `VideoSource.realtime_frame` and `VideoSink.frame`.
- [ ] Each node either emits a visible realtime frame in `Preview` or reports a clear unsupported-runtime error.
- [ ] No utility node blocks the first real Wan-frame goal.

### [ ] 2.0b Add Realtime WebGPU Shader Effect Nodes

Goal:
- Add browser/GPU-native realtime effect nodes for low-latency preview and creative processing after the first real model frame reaches `Preview`.
- Keep these separate from model inference nodes: they should transform incoming realtime frames with WebGPU shaders and emit `realtime_video_frame` outputs.
CONSIDER: this could be one node called Shader or FX that has a menu to select from 10s of shaders. shaders would show name first, but later description, thumbnail. one folder per shader with image and metadata in header of shader files or separate json file. also simple versioning.

Order:
- [ ] `ShaderPassthrough`
  - Description: Run a live frame through the WebGPU shader path without changing the image so users can confirm GPU effects are available.
  - Tags: realtime, video, WebGPU, shader, passthrough, baseline, GPU
- [ ] `ShaderColor`
  - Description: Adjust brightness, contrast, saturation, hue, invert, or grayscale on live video for fast creative color changes.
  - Tags: realtime, video, WebGPU, shader, color, brightness, contrast, saturation, hue
- [ ] `ShaderBlurSharpen`
  - Description: Blur, sharpen, or enhance edges in live video for quick focus and stylization effects.
  - Tags: realtime, video, WebGPU, shader, blur, sharpen, edges, stylize
- [ ] `ShaderPixelateGlitch`
  - Description: Add pixelation, scanlines, chromatic offsets, feedback, or glitch looks to live video.
  - Tags: realtime, video, WebGPU, shader, pixelate, glitch, scanline, feedback
- [ ] `ShaderCompositor`
  - Description: Blend two live video inputs with selectable mix modes for overlays, crossfades, and layered effects.
  - Tags: realtime, video, WebGPU, shader, composite, blend, overlay, mix

Implementation notes:

- Prefer TypeScript/browser runtime placement, likely split between `packages/realtime-browser` for WebGPU execution helpers and `packages/realtime-nodes` for node definitions.
- Start with a single shared shader-node base that validates WebGPU availability, frame format, texture size, and fallback/error reporting.
- Do not force CPU readback if the preview path can consume browser textures later; for the first version, emitting normal `realtime_video_frame` is acceptable if it keeps the graph contract simple.
- Add typed DSL generation only after the node set stabilizes.

Check:
- [ ] Each shader node can be inserted between `VideoSource.realtime_frame` and `VideoSink.frame`.
- [ ] Unsupported browsers/devices show a clear WebGPU unavailable error.
- [ ] Shader effects do not change the backend model-loading or Wan bridge path.

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
