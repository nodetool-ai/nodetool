# Realtime Plan — Phase 2 and Beyond

Tasks that follow the Phase R + Phase 1 MVP. Do not start anything here until a real Self-Forcing-generated frame appears in `Preview` on RTX 3060-class hardware (Phase R.5.3 passes).

## Phase 2: Immediate User Value

### [ ] 2.1 Add One Compatible LoRA

Steps:
- [ ] Choose one LoRA compatible with the selected MVP model family and size.
- [ ] Add one LoRA selector and one strength control.
- [ ] Apply the LoRA through the same model lifecycle.
- [ ] Reject incompatible LoRAs before mutating model state.
- [ ] Keep stacking, marketplace UI, and merge-mode matrices out.

Check:
- [ ] The user can enable one compatible LoRA and see a visible effect in `Preview`.

### [ ] 2.2 Add Reference Image Control

Steps:
- [ ] Validate one VACE/control artifact for the MVP model and RTX 3060 memory budget.
- [ ] Add one `reference_image` input to the model node via a small VACE/control helper node feeding the pipeline.
- [ ] Load VACE as an optional stage after the base model works; show its loading/error state separately.
- [ ] Keep pose, depth, inpaint, and multi-control catalogs out.

Check:
- [ ] A reference image can guide generated output.
- [ ] The base MVP still runs with VACE disabled.

### [ ] 2.3 Realtime Utility Processing Nodes

Add a small library of reusable realtime processing nodes. Implement as fresh NodeTool nodes; do not copy source code from another project. Prefer TypeScript nodes under `packages/realtime-nodes` when no Python/CUDA dependency is needed; use Python under `nodetool-realtime` only for model-heavy processing.

- [ ] `RealtimeGray` — convert live video to black-and-white for luminance-only workflows.
- [ ] `RealtimeScribble` — turn live video into bold edge/contour drawings usable as control input.
- [ ] `RealtimeOpticalFlow` — visualize motion as a color-coded realtime image.
- [ ] `RealtimeRIFE` — create in-between frames to smooth motion or increase apparent frame rate.
- [ ] `RealtimeVideoDepth` — estimate a depth map from live video for control signals.
- [ ] `RealtimeControllerViz` — render keyboard/mouse/controller input as a realtime overlay for debugging.

Check:
- [ ] Each node can be inserted between `VideoSource.realtime_frame` and `VideoSink.frame`.
- [ ] Each node emits a visible realtime frame in `Preview` or reports a clear unsupported-runtime error.

### [ ] 2.4 WebGPU Shader Effect Nodes

Add browser/GPU-native effect nodes using WebGPU shaders. Consider a single `Shader`/`FX` node with a selectable shader menu (name, description, thumbnail) rather than separate node types — one folder per shader with metadata in the file header or a sidecar JSON, plus simple versioning.

- [ ] `ShaderPassthrough` — confirm GPU effects are available without changing the image.
- [ ] `ShaderColor` — brightness, contrast, saturation, hue, invert, grayscale.
- [ ] `ShaderBlurSharpen` — blur, sharpen, edge enhancement.
- [ ] `ShaderPixelateGlitch` — pixelation, scanlines, chromatic offsets, feedback.
- [ ] `ShaderCompositor` — blend two live video inputs with selectable mix modes.

Implementation notes:
- Split between `packages/realtime-browser` (WebGPU execution helpers) and `packages/realtime-nodes` (node definitions).
- Start with a single shared shader-node base that validates WebGPU availability, frame format, texture size, and fallback/error reporting.
- Emitting normal `realtime_video_frame` is acceptable for the first version.

Check:
- [ ] Unsupported browsers/devices show a clear WebGPU unavailable error.
- [ ] Shader effects do not change the backend model-loading or Wan bridge path.

## Phase 3: Editor Productization

### [ ] 3.1 Add Realtime Editor Controls

Steps:
- [ ] Add Play/Stop controls for the current realtime workflow.
- [ ] Keep `Editor | Chat | App | Realtime` header navigation while the dedicated realtime page is the launch path.
- [ ] Make live `Preview` the primary feedback surface.
- [ ] Show source, prompt, profile, LoRA, and reference image controls when available.
- [ ] Show idle/loading/warming/running/stopping/error states.
- [ ] Show backend, precision, VRAM/offload, and missing artifact state.

Check:
- [ ] A user can start, stop, inspect, and steer the MVP workflow from the editor.

### [ ] 3.2 Add Realtime Node Badges And Validation

Steps:
- [ ] Add realtime-friendly node menu groups: `Source`, `Pipeline`, `Sink`, `Controls`, `VACE`.
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
- [ ] Document HTTPS/WSS requirements, websocket upgrade requirements, session ownership, and local GPU worker placement.
- [ ] Add the smallest remote browser -> app -> local GPU worker -> Preview smoke path.
- [ ] Note ICE/STUN/TURN requirements without implementing TURN management.

Check:
- [ ] A developer can test the workflow from another browser on the local network.

### [ ] 3.5 Add Browser-Local Analysis Proof

Steps:
- [ ] Add one browser-local analysis adapter that emits `realtime_analysis_event`.
- [ ] Map one event to one realtime parameter update.

Check:
- [ ] One browser-local analysis result can steer one running server/Python session.

### [ ] 3.6 Harden Realtime Pack Installation

Steps:
- [ ] Move any temporary Self-Forcing dev install/vendor path into a documented `nodetool-realtime` backend extra or package-managed install path.
- [ ] Add preflight checks for CUDA availability, GPU memory, PyTorch CUDA build, `safetensors`, upstream Self-Forcing imports, and optional quantization libraries.
- [ ] Show missing backend dependency reasons in the model manager before a user starts a realtime session.
- [ ] Keep the base realtime pack installable without heavyweight Self-Forcing dependencies.
- [ ] Add a one-command or one-click repair path for missing realtime backend dependencies.

Check:
- [ ] A new user can install the realtime pack, download the recommended model pack, and see actionable setup status without reading source code.

## Maybe Later

- Full LongLive validation and quality comparison.
- Full official Self-Forcing quality validation.
- FP8/GGUF/INT8 matrix beyond the selected RTX 3060 path.
- Multiple LoRAs, LoRA stacking, and advanced merge modes.
- Additional VACE controls: pose, depth, inpaint, multi-control composition.
- Model pack catalog and persistent cache cleanup UX.
- Production HTTPS/WSS, auth, reverse proxy, sticky routing, public outputs, and worker recovery.
- Editor-facing transport selector for frame-push vs WebRTC.
- ICE/STUN/TURN configuration UI and operational metrics.
- Remote GPU worker routing beyond local network.
- Full backend WebRTC codec decode/encode, WHIP/WHEP ingest and egress.
- Timeline editing and export presets.
- Video asset (`VideoRef`) source playback.
- NDI, Spout, Syphon.
- MIDI, OSC, DMX, timecode.
- Audio input/output beyond what the workflow needs.
- Admin dashboard for sessions, worker load, queues, and stuck session eviction.
- Entitlements, rate limits, multi-region routing, and remote media brokering.
- NVIDIA Lyra or other future model families.
