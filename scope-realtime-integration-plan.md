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
- [ ] Rework the realtime plan around existing NodeTool workflows, nodes, and editor UX
- [ ] Add WebRTC/media transport and session negotiation
- [ ] Deliver an integrated MVP: stream diffusion + ControlNet + LoRA
- [ ] Add richer session diagnostics and live controls
- [ ] Extend the editor with realtime-aware workflow authoring instead of a parallel product surface
- [ ] Add optional hardware/cloud integrations only after the local architecture is stable

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

## Roadmap

### Phase 1 - Integrate the substrate cleanly

Goal: keep the new session layer, but connect it more naturally to the existing NodeTool workflow model.

- define a clear session/runtime boundary separate from batch `run_job`
- add WebRTC signaling and transport messages
- reuse `useVideoRecorder` / shared capture utilities instead of keeping separate camera-preview code paths
- reuse mini-app / `html_app` surfaces for the operator experience where possible
- decide which existing input/output nodes can be reused directly
- define which realtime-specific nodes are truly needed vs. adapted existing nodes

### Phase 2 - Integrated MVP: stream diffusion

The MVP should be stronger than the current camera-preview slice.

**Include in MVP:**

- browser camera/video input, preferably through existing input-node patterns where possible
- a workflow-native realtime session path
- stream diffusion as the primary demo/use case
- ControlNet support
- LoRA support
- one browser preview/output surface
- start/stop/reconnect
- live parameter updates
- basic session status/logging

**Architecture expectations for MVP:**

- reuse the existing node editor and workflow model
- reuse existing input-node creation paths so camera/video/audio are workflow inputs, not special route-only state
- reuse mini-app / `html_app` patterns for the operator UI when that keeps the system workflow-native
- reuse `stream_input` for low-rate live controls and add dedicated media transport only for high-rate streams
- reuse existing model compatibility/selection paths for ControlNet and LoRA
- keep realtime transport/runtime in dedicated modules
- avoid a large parallel realtime-only frontend stack unless clearly required

### Phase 3 - Realtime editor integration

- add realtime-aware validation and affordances to the existing editor
- make source/sink/control nodes easier to compose in standard workflows
- add a canonical starter template for stream diffusion + ControlNet + LoRA
- support workflow templates/presets for realtime diffusion pipelines

### Phase 4 - Rich live controls

- live prompt/control updates while streaming
- parameter groups for diffusion/control strength, LoRA weight, etc.
- better diagnostics, status, and recovery UX

### Phase 5 - Media + hardware

- audio input/output
- recording/export
- device selection
- optional NDI/Spout/Syphon-style integrations behind feature flags

### Phase 6 - Cloud/session brokering

Treat this as separate from local realtime support:

- cloud relay/session brokering
- TURN credential management
- auth/entitlement checks
- telemetry/recovery

## Recommended next milestone

**Workflow-native stream diffusion MVP**

Include:

- existing NodeTool workflow/editor as the authoring surface
- camera or video input integrated through existing node patterns
- stream diffusion runtime path
- ControlNet-enabled guidance
- LoRA-enabled styling/customization
- browser preview/output
- live control updates
- basic diagnostics

Do not include yet:

- a separate standalone realtime editor product
- broad cloud parity
- advanced hardware integrations
- MIDI/tempo/OSC/DMX

## Next steps

1. Audit the existing web capture path (`useVideoRecorder` / `VideoRecorder`) and decide what should become the shared realtime media input layer.
2. Write a short technical spec for WebRTC signaling plus the session/runtime boundary, explicitly separating high-rate media transport from lower-rate `stream_input` controls.
3. Define the canonical workflow template for stream diffusion with ControlNet and LoRA using existing input/model node patterns.
4. Use the existing editor/context-menu/input-node flow to make that workflow easy to author before introducing new realtime-only nodes.
5. Use mini-app / `html_app` patterns for the first serious operator UI so realtime remains workflow-native.
6. Keep the transport/runtime modular so realtime support integrates cleanly without sprawling through existing files.
