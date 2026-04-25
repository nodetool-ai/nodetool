# Realtime Feature Ideas

This document collects future realtime ideas, use cases, and model/library candidates. These are not commitments; `PLAN-REALTIME.md` remains the active implementation roadmap.

## Future ideas

Captured for memory, not commitment. Revisit after Phase 2 stabilizes.

### Authoring and live control

- **Parameter automation / timeline.** Schedule prompt fades, LoRA weight ramps, and ControlNet curves over time.
- **MIDI / OSC parameter binding UI.** Map hardware controls to `nodetool.realtime.Parameter` values.
- **Realtime audio/video analysis to parameter control.** Route audio features, motion, pose, face landmarks, scene changes, or dominant color into realtime parameters via analysis nodes plus smoothing/mapping helpers.
- **Preset / scene system.** Named bundles of parameter values applied in one tick.
- **Multi-operator sessions.** Multiple browsers attach to one session and share parameter control.

### Composition and pipelines

- **Chained realtime workflows.** One session's NDI/Spout output becomes another's input.
- **Realtime LLM nodes.** Token-streaming captioners/translators alongside video.
- **Live workflow hot-swap.** Replace a node mid-stream, constrained by honest `ownsWarmState` declarations.

### Capture and recording

- **Recording with timecode.** Capture inputs, outputs, and parameter timeline so a session can be scrubbed or re-rendered offline at higher quality.

### Operations and scaling

- **Headless / server realtime.** Spout in, NDI out, MIDI control, no browser.
- **Multi-runtime federation.** Realtime nodes on different GPU hosts within one workflow.
- **JIT realtime graph compilation.** Fuse adjacent reusable nodes and skip metadata bookkeeping on the hot path.

### Agent integration

- **Realtime as an agent tool.** A `nodetool-chat` agent starts a realtime session, observes fps/output, and adjusts prompts.

## Use case ideas

End-user scenarios that become possible once Phase 2/3 lands. Each should be built from existing NodeTool primitives, the Phase 2 substrate, and a small set of realtime-capable model/utility nodes.

### Live performance and VJ

- **Audio-reactive AI VJ.** DJ feed to audio analysis nodes, then parameter control for diffusion strength, LoRA blend, and prompt fade. Output to Resolume, TouchDesigner, or projector via NDI/Spout.
- **Dancer-driven generation.** Camera input with pose and motion-energy analysis controls LoRA selection and ControlNet pose strength.

### Live broadcast and streaming

- **Selective restyling.** Keep a person photoreal while diffusing the background.
- **Live inpainting / outpainting / reference-guided streams.** Selectively replace or extend parts of the scene using VACE-style streaming nodes.
- **Streaming captions + style coupling.** Caption and audio-emotion nodes feed palette or prompt parameters over the control plane.

### Telepresence and collaboration

- **Multi-operator director's chair.** Multiple browsers attach to one `session_id`, each controlling part of the session.
- **Remote production.** Producers in different locations hold parameter strips for one shared graph.

### Game and interactive

- **Game capture restyling.** Spout in from a game, diffusion transform, Spout out to OBS/projection.
- **Live mocap-to-avatar.** Webcam pose to ControlNet plus character LoRA for a live avatar feed.

### Installations and permanent art

- **Headless gallery install.** NDI camera input, MIDI/OSC sensor control, Spout projector output.
- **Bio-reactive painting.** Heart rate or EEG over OSC controls diffusion strength.

### Education and accessibility

- **Live drawing/coding coach.** Low-rate vision-LLM feedback alongside a running diffusion/reference view.
- **Realtime sign translation.** Webcam to pose model to translation LLM to TTS audio output.

### Authoring superpowers

- **Production = live, but pre-rendered.** Feed a music file as the live source and schedule parameters against the beat for offline rendering.
- **Self-balancing agent.** An agent watches `realtime_metrics` and downshifts resolution, LoRA size, or buffer policy when fps slips.
- **Workflow as MIDI device.** Any MIDI/OSC controller, agent, webhook, or script can drive named workflow parameters.

## Realtime-capable models and libraries

Treat this as a shopping list for future `realtime-vision`, `realtime-audio`, `realtime-vlm`, and adapter packages, not a commitment to wrap every item.

Realtime-suitability flags:

- **Tested realtime:** >20 fps for video, <200 ms for audio/text.
- **Optimization-dependent realtime:** viable with TensorRT, quantization, or hardware acceleration.
- **Not realtime:** useful for batch workflows, but not behind `isRealtimeCapable`.

### TensorRT posture

The diffusion baseline targets in the active roadmap (LongLive first, then StreamDiffusion V2 / MemFlow / Krea) are pure PyTorch on purpose. Prefer PyTorch or ONNX Runtime paths first; reserve TensorRT/CUDA-specific work for profiling-proven bottlenecks.

### Tier 1 - Quick wins, broad impact

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 1 | **OpenCV (cv2 / opencv4nodejs)** | Resize, color spaces, blur, contours, frame diff, compositing, Farneback flow | Tested realtime | Apache 2.0 | Foundation utility nodes; Python preferred for GPU, Node for operator-side ops |
| 2 | **Meyda** | Browser-side audio features via Web Audio API | Tested realtime | MIT | Operator-UI hook; audio-reactive parameters with no server |
| 3 | **Aubio** | Server-side onset / pitch / beat / tempo / MFCC | Tested realtime | GPL-3.0 | `realtime-audio.AudioAnalysis` Python node |
| 4 | **MediaPipe (Pose, Holistic, Face Mesh, Hands)** | Pose / face / hand landmarks | Tested realtime | Apache 2.0 | `realtime-vision.Pose`; JS bindings can run client-side |
| 5 | **YOLO11 (det / seg / pose)** | Class-aware detection, segmentation, pose | Tested/accelerated realtime | AGPL-3.0 | `realtime-vision.Detect` / `Segment` / `Pose`; may need package separation |
| 6 | **Kokoro 82M TTS** | Streaming TTS, many voices/languages | Tested realtime | Apache 2.0 | `realtime-audio.TTS`; browser WebGPU variants exist |
| 7 | **Moonshine STT** | Streaming speech-to-text | Tested realtime | MIT | `realtime-audio.STT` |
| 8 | **Depth Anything V3 (Small / Base / Metric-Large)** | Monocular depth | Tested/accelerated realtime | Apache 2.0 / CC-BY-NC for Giant | `realtime-vision.Depth`; ship PyTorch first |

### Tier 2 - High impact, slightly more setup

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 9 | **RVM (Robust Video Matting)** | Person/portrait alpha matte | Tested realtime | GPL-3.0 | `realtime-vision.PersonMatte` |
| 10 | **ControlNet preprocessors** | Pose, depth, canny, HED, color condition maps | Tested realtime | Mixed permissive | `realtime-controlnet.*` preprocessors |
| 11 | **Moondream 0.5B / 3 / Photon** | Vision-language captioning and reasoning | Tested/variable realtime | Apache 2.0 for open variants; Photon paid | `realtime-vlm.Moondream` |
| 12 | **SmolVLM 256M / 500M** | Tiny browser-capable VLM | Tested realtime | Apache 2.0 | Operator-side captioner |
| 13 | **SAM 2** | Prompted video segmentation with temporal memory | Tested realtime | Apache 2.0 | `realtime-vision.Segment` |
| 14 | **Piper TTS** | Edge TTS | Tested realtime | MIT | `realtime-audio.TTS` for installations / small hardware |
| 15 | **Distil-Whisper large-v3** | Batch transcription | Batch only | MIT | Companion to live STT for post-show transcripts |

### Tier 3 - Narrower or specialized

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 16 | **GMFlow** | Neural optical flow | High-end GPU realtime | Apache 2.0 | Use only when OpenCV flow is not expressive enough |
| 17 | **MobileSAM / EfficientTAM** | Lightweight segmentation | Tested realtime | Apache 2.0 | Edge fallback |
| 18 | **MediaPipe Face Mesh + DeepFace / RealtimeFER** | Emotion detection / valence from landmarks | Tested realtime | Apache 2.0 / MIT | `realtime-vision.Emotion` |
| 19 | **F5-TTS / XTTS v2** | Voice cloning from short reference | Short clips only | CPML / non-commercial | Premium voice node |
| 20 | **MonarchRT (Wan2.1)** | Realtime autoregressive text-to-video | Variable | Various | Alternative model node alongside LongLive/Self-Forcing |

### Tier 4 - Substrate, platform, and heavy items

| # | Library / Model | What it gives | Realtime | License | Where in stack |
|---|---|---|---|---|---|
| 21 | **werift** / `@roamhq/wrtc` | Node-side WebRTC stack | Tested realtime | Apache 2.0 / MIT | Phase 2 substrate |
| 22 | **PyAV (FFmpeg)** | Codec/container handling for frame router | Tested realtime | BSD-3 | Backend frame router |
| 23 | **PyVideoProc** | CUDA decode -> infer -> encode pipeline | Tested realtime | BSD-2 | Headless/server realtime reference |
| 24 | **NDI / Spout / Syphon native bindings** | Pro AV interop adapters | Tested realtime | Platform-specific | Phase 6 adapter nodes |
| 25 | **Krea Realtime 14B** | High-fidelity diffusion alternative | High VRAM | Various | Fast-follow after the 1.3B baseline |
| 25b | **FLUX.2 Klein / Hyper-SDXL** | Premium-fidelity diffusion variants | Variable | Various | Exploratory additional model nodes |
| 26 | **Custom TensorRT / CUDA kernels** | Final-mile latency optimization | Profile-dependent | Various | Only after profiling proves need |

### Not realtime hot-path candidates

These are fine in standard NodeTool workflows, but should not be used for realtime hot-path nodes:

- Bark TTS, Whisper Large v3 sequential.
- Mask R-CNN, U-Net, DETR, MaskFormer, OneFormer for video.
- MASt3R, RoMa dense correspondence.
- FlowFormer where GMFlow is faster for similar value.
- DA3-Giant, DA3-Nested, Depth Anything Giant.
- Essentia BPM extractor for live streams.
- `librosa` for live streams when Aubio/Meyda fit better.

## Suggested package layout

Keep the realtime namespace small and let environments install only what they need, mirroring existing `replicate-nodes` / `fal-nodes` separation:

- `packages/realtime-nodes/` - substrate nodes: Source / Sink / Parameter / SessionInfo.
- `packages/realtime-vision/` - DA3, SAM 2, RVM, YOLO11, MediaPipe wrappers.
- `packages/realtime-browser/` - TensorFlow.js / Transformers.js browser-capable realtime inference nodes, or an explicit browser lane inside `realtime-vision` / `realtime-vlm` if dependencies stay clean.
- `packages/realtime-audio/` - Aubio analysis, Moonshine STT, Kokoro/Piper TTS.
- `packages/realtime-controlnet/` - ControlNet preprocessors wired into diffusion nodes.
- `packages/realtime-vlm/` - Moondream / SmolVLM.
- `packages/realtime-adapters/` - NDI / Spout / Syphon / MIDI / OSC.

Typical bundles:

- A VJ rig wants `realtime-audio`, `realtime-vision`, and `realtime-controlnet`.
- An installation wants `realtime-adapters`.
- A captioner wants `realtime-vlm` and `realtime-audio`.
- All stacks require the substrate.
