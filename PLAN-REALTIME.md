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
- If one concrete Self-Forcing adapter attempt cannot produce a frame, switch the MVP target to LongLive.
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

## Source UX Direction

- `Video Source` is the one user-facing source node, not separate normal-camera and realtime-camera nodes.
- The MVP source mode is camera capture with device selection, live preview, still capture, and a `realtime_frame` output.
- The normal workflow output is `image`, filled by an explicit Capture Still action even when a workflow is not running.
- The realtime workflow output is `realtime_frame`, routed as `Video Source.realtime_frame -> model.frame`.
- Future source modes are video assets (`VideoRef` playback), NDI, Syphon, Spout, and audio input/output where the workflow needs it. Do not add those before the camera MVP works.

## Phase 0: Cleanup Before More Feature Work

These tasks must leave the codebase easier to run, not just better described. Each task has a concrete artifact to check.

### [ ] 0.1 Use One Camera Ingress Path

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
- [x] Remove the duplicate `nodetool.realtime.VideoSource` registration so video ingress has one user-facing node.
- [x] Disable WebRTC camera publishing when frame-push is active for the same session/input.
- [ ] Add status for selected device, target handle, frame cadence, and routing errors.

Check:
- [x] Focused kernel/websocket tests route frames through `VideoSource.realtime_frame`.
- [ ] One selected camera sends frames through exactly one graph input path.
- [ ] Status shows which path is active.

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
- [x] Make README describe Self-Forcing RTX 3060 first and LongLive as fallback.
- [x] Move mock/dev smoke commands into a Development section.
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
- [x] Add normal still capture through `Video Source.image`.
- [x] Convert selected camera frames to `realtime_video_frame` through the existing frame publisher.
- [x] Route pushed realtime frames through `Video Source.realtime_frame`.
- [x] Preserve `sequence`, `timestamp_ns`, `pixel_format`, and latest-frame-wins behavior in the publisher path.
- [x] Add focused tests proving source-handle routing reaches downstream graph edges.
- [x] Show complete permission, missing-device, active-device, source failure, cadence, and routing status in the user UI.
- [x] Run a smoke proving captured camera frames route to the model `frame` input handle.

Check:
- [x] Starting the workflow sends camera frames into the model input.

### [ ] 1.3 Resolve Required RTX 3060 Artifacts

Files:
- `nodetool-realtime/src/nodetool/realtime/model_artifacts.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/rtx3060_realtime_smoke.py`
- `nodetool-realtime/README.md`

Steps:
- [ ] IMPORTANT: ask User to install necessary packs through using the nodetool interface and model downloader first
- [ ] Resolve `self_forcing_fp8_transformer` through the Hugging Face cache.
- [ ] Resolve `umt5_xxl_encoder_q5_k_m` through the Hugging Face cache.
- [ ] Resolve `wan21_vae` through the Hugging Face cache.
- [ ] Verify CUDA PyTorch in the `nodetool` conda env.
- [ ] Verify `huggingface_hub`, `safetensors`, and the selected GGUF loader.
- [ ] Record local paths, missing reasons, and artifact sizes.
- [ ] Keep optional LoRA/VACE artifacts out of this task.

Check:
- [ ] Required artifacts resolve locally or fail with short actionable errors.

### [ ] 1.4 Implement One Self-Forcing Inference Adapter

Files:
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_pipeline.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_backend.py`
- `nodetool-realtime/src/nodetool/realtime/wan21/self_forcing_sampler.py`
- `nodetool-realtime/src/nodetool/nodes/realtime/self_forcing.py`

Steps:
- [ ] Connect resolved artifacts to one upstream Self-Forcing pipeline class.
- [ ] Run one inference call from an input frame and prompt.
- [ ] Normalize sampler output to `rgb8` or `rgba8` `realtime_video_frame`.
- [ ] Emit resolve, load, warm, ready, error, and stop phases.
- [ ] Report backend, precision, VRAM/offload, latency, and artifact paths.
- [ ] If one frame cannot be produced because of upstream incompatibility, document the blocker and switch the MVP target to LongLive.

Check:
- [ ] One inference call returns a `realtime_video_frame`.

### [ ] 1.5 Run End-To-End On RTX 3060

Files:
- MVP realtime template
- `packages/websocket/src/realtime/*`
- `packages/kernel/src/runner.ts`
- `packages/kernel/src/realtime-runner.ts`
- `web/src/components/node/PreviewNode/PreviewNode.tsx`

Steps:
- [ ] Open the MVP template.
- [ ] Select a camera.
- [ ] Start the realtime session.
- [ ] Confirm camera frames reach the model.
- [ ] Confirm generated frames appear in `Preview`.
- [ ] Change the prompt once while running.
- [ ] Stop the session cleanly.
- [ ] Record latency, memory/offload state, and any dropped-frame count shown by the app/logs.

Check:
- [ ] A user sees generated model output in `Preview` on RTX 3060-class hardware.
- [ ] No mock/dev pipeline is used for the success path.

### [ ] 1.6 Write One-Page User Runbook

Files:
- `nodetool-realtime/README.md` or this file

Steps:
- [ ] Document conda activation.
- [ ] Document CUDA check.
- [ ] Document required Python packages.
- [ ] Document artifact cache check.
- [ ] Document the exact workflow/template to open.
- [ ] Document what to click.
- [ ] Document expected `Preview` behavior.
- [ ] Document which logs to collect on failure.

Check:
- [ ] Another user can attempt the MVP without reading source code.

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
- [ ] Make live `Preview` the primary feedback surface.
- [ ] Show source, prompt, profile, LoRA, and reference image controls when available.
- [ ] Show idle/loading/warming/running/stopping/error states.
- [ ] Show backend, precision, VRAM/offload, and missing artifact state.

Check:
- [ ] A user can start, stop, inspect, and steer the MVP workflow from the editor.

### [ ] 3.2 Add Realtime Node Badges And Validation

Steps:
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
