# Scope Realtime Integration Roadmap for NodeTool

## Checklist

- [x] Review NodeTool's current workflow streaming, mini-app, and editor architecture
- [x] Confirm clean-room requirement for Scope-inspired work
- [x] Add initial realtime session substrate
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start/update/stop session
  - [x] REST endpoints for listing/fetching sessions
  - [x] Frontend realtime session client/store
  - [x] Basic `/realtime/:workflowId?` page and local preview
- [ ] Phase 1 foundation: define the session/runtime boundary, transport contract, and reuse plan for existing capture/editor/operator surfaces
- [ ] Phase 2 MVP: ship a workflow-native stream diffusion session with ControlNet + LoRA and browser preview
- [ ] Phase 3 editor integration: make realtime workflows easy to author, validate, and run from the existing editor
- [ ] Phase 4 live controls: add prompt/control updates, grouped parameters, diagnostics, and recovery UX
- [ ] Phase 5 local media extensions: add audio, recording/export, device selection, and optional local hardware integrations behind flags
- [ ] Phase 6 cloud brokering: add relay/TURN/auth/telemetry only after the local architecture is stable

## Priority feature ladder (easy to harder integration)

- [ ] **StreamDiffusionV1 + ControlNet depth/scribble + LoRA**
  - Most important near-term target.
  - Best fit with the current roadmap because NodeTool already has diffusion model selection, ControlNet/LoRA compatibility work, image/video inputs, and the new session substrate.

- [ ] **Realtime speech-to-prompt / captions / transcription**
  - Strong early win because NodeTool already has Whisper/ASR examples, subtitle workflows, streaming input commands, and TTS/ASR model types.
  - Good operator UX feature even before full media transport parity.

- [ ] **Moondream / live VLM scene understanding**
  - Good next feature after the core img2img path.
  - Fits existing multimodal/VLM support and can help drive prompts, overlays, or diagnostics from live frames.

- [ ] **Pose / depth / mask preprocessors**
  - Includes features in the spirit of pose preprocessors, YOLO masks, and depth/scribble conditioning.
  - Natural extension of the ControlNet-first MVP and likely more reusable than one-off bespoke plugins.

- [ ] **Reusable pre/post FX chain**
  - Includes WallSpace-style effects, OpenCV filters, bloom, kaleidoscope, and similar preprocess/postprocess stages.
  - Valuable once the session/runtime can compose standard workflow nodes around a realtime media path.

- [ ] **Realtime upscaling / refinement**
  - Includes Real-ESRGAN / super-resolution style nodes and similar refinement passes.
  - Important, but should come after the base realtime pipeline and FX/preprocessor composition are stable.

- [ ] **High-speed alternative generation pipelines**
  - Includes FLUX-Klein and LTX-2 style realtime or near-realtime generation paths.
  - Important for performance-oriented follow-ups, but harder than the initial StreamDiffusion-first MVP.

- [ ] **DeepLiveCam / face-swap style pipelines**
  - Useful, but requires more specialized identity, safety, and runtime handling than the first diffusion/control stack.

- [ ] **Music / beat / external-timing driven controls**
  - Includes Spotify, captions-to-visuals, MIDI/OSC/timecode-driven prompt/control systems.
  - Better treated as a later control-surface layer after the core local realtime session architecture is working well.

- [ ] **World-model / 3D / advanced geometry pipelines**
  - Includes SAM3D, WorldFM, and similar advanced geometry or view-synthesis features.
  - High-value long term, but clearly later than the workflow-native realtime diffusion/control stack.

## Current state

NodeTool already had strong foundations before this branch:

- workflow/job streaming over WebSocket
- streaming input commands (`stream_input`, `end_input_stream`)
- mini-app and `html_app` surfaces
- a reusable node graph/editor
- existing input nodes, including `VideoInput` and `RealtimeAudioInput`
- model compatibility logic for ControlNet and LoRA families

This branch adds the first realtime control-plane substrate:

- session records and lifecycle events
- backend session lifecycle management
- realtime session commands over WebSocket
- session listing APIs
- frontend session state and a basic realtime page

That is a useful start, but it is still too bolted-on to be the long-term shape of realtime in NodeTool.

## Key constraint

Scope is currently licensed under `CC BY-NC-SA 4.0`. NodeTool should use Scope only as product and architecture reference material. Any implementation here must remain a clean-room reimplementation.

## Re-evaluated design direction

The next steps should favor **integration over reinvention**:

1. **Reuse existing workflow graphs**
   - Realtime should be expressed as a NodeTool workflow mode or workflow profile, not a separate product with duplicated concepts.
   - Existing nodes, metadata, model compatibility, and workflow persistence should stay central.

2. **Reuse the existing node editor**
   - Start from the current NodeTool editor and add realtime-aware validation, controls, and runtime affordances.
   - Avoid building a separate editor unless the current graph model proves insufficient.

3. **Reuse existing node/input infrastructure where possible**
   - `VideoInput` already exists and may cover part of the camera/video source story.
   - Existing mini-app input mapping and workflow runner streaming can be extended rather than replaced.
   - ControlNet/LoRA model selection should use the current model compatibility and selector patterns.

4. **Keep the implementation modular**
   - Realtime session/runtime logic should live in dedicated modules/services.
   - Avoid inflating existing job-runner files with media-specific branching where a separate session/runtime boundary is cleaner.

## What NodeTool can integrate better

The MVP should lean harder on what the repo already offers:

- **Existing input nodes** for video/audio/image instead of inventing new app-only source concepts too early
- **Existing workflow editor + node metadata** instead of a standalone realtime graph tool
- **Existing model ecosystem** for Stable Diffusion, Flux, ControlNet, and LoRA compatibility
- **Existing mini-app / HTML app surfaces** for a focused realtime operator UI on top of standard workflows
- **Existing streaming input path** as a bridge for live controls where it fits, while keeping media transport separate

## Concrete reuse points found in the current codebases

### Web/editor/UI side

- **`useVideoRecorder` / `VideoRecorder` already solve camera preview + device enumeration**
  - The current realtime page should reuse or extract from this path instead of maintaining separate `getUserMedia` logic.
  - Device selection belongs in the shared media capture layer, not in a one-off realtime page.

- **`MiniAppPage` + `html_app` already provide a workflow-native operator surface**
  - Realtime control UIs should likely build on this workflow/mini-app pattern instead of becoming a separate app concept.
  - This gives NodeTool a place to host focused realtime controls without forking the authoring model.

- **Input-node creation is already editor-native**
  - The editor/context-menu flow already knows how to create `VideoInput`, `AudioInput`, and other input nodes.
  - Realtime planning should assume camera/video/audio sources become first-class workflow inputs, not route-local UI state.

- **Model selection/compatibility is already richer than the plan currently says**
  - The web model compatibility layer already recognizes ControlNet and LoRA-related model families.
  - Realtime MVP work should reuse that selection path rather than introducing a new realtime-only model picker.

### Backend/runtime/protocol side

- **`stream_input` / `end_input_stream` already exist as a generic live control channel**
  - These should be reused for low-rate prompt/control/parameter updates where possible.
  - Media transport should only be added where these commands are not sufficient for throughput/latency.

- **The kernel already understands streaming input nodes**
  - `RealtimeAudioInput` and streaming-output input behavior already exist in the runner/runtime.
  - The realtime plan should extend that execution model for video/media sessions instead of bypassing the workflow runtime.

- **Protocol/session work should stay layered**
  - The new realtime session commands are a good control-plane start.
  - The next step should be a dedicated transport/runtime boundary, not more ad-hoc branching inside `run_job` flows.

- **Diffusion model capability data already exists**
  - Artifact detection already distinguishes SDXL, Flux, and ControlNet-capable families.
  - The roadmap should treat stream diffusion + ControlNet + LoRA as an integration problem across existing model metadata, selectors, and runtime contracts.

## Main gaps still missing

1. **Media transport**
   - no WebRTC signaling flow
   - no ICE/TURN/session negotiation
   - no browser-to-backend track lifecycle

2. **Realtime runtime**
   - no persistent low-latency media/session execution path
   - no dedicated frame-oriented runtime for live video generation/processing
   - no session-scoped routing for realtime sources/sinks

3. **Editor/runtime integration**
   - current realtime page is mostly a control page, not a workflow-native operator surface
   - no realtime-aware validation or authoring mode in the existing editor

4. **Diffusion-oriented live pipeline support**
   - no clear integrated path yet for stream diffusion
   - no session model yet for live ControlNet / LoRA updates
   - no workflow template/reference graph yet for a canonical realtime diffusion pipeline

## Planning prerequisites

- [ ] Decide whether speech-to-prompt or caption injection belongs in the first MVP or a later live-controls phase

## Roadmap

### Phase 1 - Integrate the substrate cleanly

**Purpose**

Keep the new session layer, but connect it to the existing NodeTool workflow model instead of growing a parallel realtime stack.

**Requires**

- existing session substrate from this branch
- agreement that realtime stays workflow-native and modular

**Done when**

- the session/runtime boundary is documented
- the transport contract is defined
- the reuse plan for capture, editor, and operator UI is explicit

**Tasks**

- [ ] Write a short technical spec that separates realtime sessions from batch `run_job`
- [ ] Define the WebRTC signaling messages and session negotiation flow
- [ ] Decide exactly where `stream_input` remains the low-rate control path and where dedicated media transport starts
- [ ] Audit `useVideoRecorder` / `VideoRecorder` and document what becomes the shared capture layer
- [ ] Decide whether the first operator UI lives in `/realtime`, mini-apps, `html_app`, or a hybrid of those surfaces
- [ ] List which current input/output nodes are reused directly in realtime workflows
- [ ] List which new realtime-specific nodes are actually required after that reuse audit

### Phase 2 - Integrated MVP: stream diffusion

**Purpose**

Ship a first serious realtime workflow that proves the architecture with a workflow-native stream diffusion path, not just a control-plane demo.

**Requires**

- Phase 1 decisions on runtime boundary, signaling, shared capture, and operator surface
- reuse of existing model compatibility and workflow authoring paths

**Done when**

- a canonical stream diffusion workflow exists
- it can be started/stopped as a realtime session
- ControlNet and LoRA can be configured without a separate realtime-only model system
- the browser can preview output and apply live parameter updates

**Tasks**

- [ ] Define the canonical realtime workflow template for stream diffusion
- [ ] Use existing input-node patterns for camera/video input wherever possible
- [ ] Connect the workflow template to the realtime session lifecycle (start, stop, reconnect)
- [ ] Reuse the current model compatibility/selection path for ControlNet-enabled guidance
- [ ] Reuse the current model compatibility/selection path for LoRA-enabled styling/customization
- [ ] Add one browser preview/output surface for the MVP operator flow
- [ ] Support live parameter updates for the MVP workflow
- [ ] Add basic session status/logging for the MVP run path

### Phase 3 - Realtime editor integration

**Purpose**

Make realtime authoring feel native inside the existing editor instead of relying on custom route-local configuration.

**Requires**

- a working Phase 2 reference workflow
- a clear answer on which nodes are reused vs. new

**Done when**

- authors can discover, compose, validate, and launch realtime workflows from the standard editor flow

**Tasks**

- [ ] Add realtime-aware validation rules to the existing editor
- [ ] Add editor affordances for composing source, sink, and control nodes in realtime workflows
- [ ] Add a starter template for stream diffusion + ControlNet + LoRA
- [ ] Add workflow presets/templates for common realtime diffusion variants
- [ ] Ensure the editor/context-menu flow makes realtime input nodes easy to create without special route-only state

### Phase 4 - Rich live controls

**Purpose**

Make live operation practical after the first end-to-end session path works.

**Requires**

- Phase 2 MVP session path
- an operator UI that can present grouped controls and status clearly

**Done when**

- operators can adjust important realtime parameters live and recover from common failures without restarting the whole setup blindly

**Tasks**

- [ ] Add live prompt/control updates while streaming
- [ ] Group parameters for diffusion strength, ControlNet settings, LoRA weight, and similar frequently changed controls
- [ ] Add clearer session diagnostics and status reporting
- [ ] Add reconnect/recovery UX for common transport/runtime failures
- [ ] Add basic session event history or logs that help debug live runs

### Phase 5 - Media + hardware

**Purpose**

Extend the local realtime stack once the core video-first path is stable.

**Requires**

- stable local realtime sessions
- clear device/capture ownership from Phase 1

**Done when**

- common local media extensions work without complicating the MVP architecture

**Tasks**

- [ ] Add audio input support
- [ ] Add audio output support where the workflow needs it
- [ ] Add recording/export for realtime sessions
- [ ] Add shared device selection on top of the reusable capture layer
- [ ] Add optional NDI/Spout/Syphon-style integrations behind feature flags
- [ ] Evaluate which local-only test pipelines (for example audio beep or simple split-screen) are useful for bring-up/debugging

### Phase 6 - Cloud/session brokering

**Purpose**

Treat remote/session-brokered realtime as a separate phase after local realtime works well.

**Requires**

- stable local realtime behavior
- a clear local transport/runtime design worth exposing remotely

**Done when**

- cloud/session brokering can be added without changing the local-first architecture

**Tasks**

- [ ] Define the cloud relay/session brokering model
- [ ] Add TURN credential management
- [ ] Add auth and entitlement checks for remote sessions
- [ ] Add telemetry and recovery hooks for brokered sessions
- [ ] Keep the cloud path optional and layered above the local runtime

## Recommended next milestone

**Workflow-native stream diffusion MVP**

Include:

- existing NodeTool workflow/editor as the authoring surface
- camera or video input integrated through existing node patterns
- stream diffusion runtime path
- ControlNet-enabled guidance
- LoRA-enabled styling/customization
- optional speech-to-prompt or caption injection if it fits the same session/runtime boundary cleanly
- browser preview/output
- live control updates
- basic diagnostics

Do not include yet:

- a separate standalone realtime editor product
- broad cloud parity
- advanced hardware integrations
- MIDI/tempo/OSC/DMX

## Immediate next tasks

- [ ] Audit the existing web capture path (`useVideoRecorder` / `VideoRecorder`) and decide what becomes the shared realtime media input layer
- [ ] Write the short technical spec for WebRTC signaling plus the session/runtime boundary, explicitly separating high-rate media transport from lower-rate `stream_input` controls
- [ ] Decide the first operator surface: `/realtime`, mini-app, `html_app`, or a staged hybrid
- [ ] Define the canonical workflow template for stream diffusion with ControlNet and LoRA using existing input/model node patterns
- [ ] Use the existing editor/context-menu/input-node flow to make that workflow easy to author before introducing new realtime-only nodes
- [ ] Keep the transport/runtime modular so the first implementation does not sprawl through existing files
