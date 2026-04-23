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
- [ ] Phase 0 planning: lock the first workflow, operator surface, and reuse boundaries
- [ ] Phase 1 workflow-native foundation: reuse existing capture, input-node, and mini-app/editor surfaces
- [ ] Phase 2 runtime and transport: define the session/runtime contract and only add dedicated media transport where needed
- [ ] Phase 3 local MVP: ship stream diffusion + ControlNet + LoRA with live preview and session controls
- [ ] Phase 4 editor integration: make realtime workflows easy to author, validate, and launch
- [ ] Phase 5 live controls and preprocessors: add prompt/control updates and reusable conditioning/effects stages
- [ ] Phase 6 local media extensions: add audio, recording/export, and device selection
- [ ] Phase 7 optional remote/hardware layers: add cloud brokering and extra hardware only after local flow is stable

## Constraints and verified assumptions

- **Clean-room only.** Scope can inform product direction, but implementation here must remain independent.
- **Keep realtime workflow-native.** Reuse the existing workflow graph, editor, persistence, and model selection instead of creating a parallel product.
- **Reuse existing NodeTool pieces first.**
  - `useVideoRecorder` / `VideoRecorder` already handle camera preview and device enumeration.
  - `MiniAppPage` and `html_app` already provide a workflow-native operator surface.
  - The editor/context-menu flow already creates `VideoInput`, `AudioInput`, and related input nodes.
  - `stream_input` / `end_input_stream` and `useInputStream` already provide a live control path.
  - `RealtimeAudioInput` already exists in the runner/runtime; `VideoInput` already exists as a standard workflow input node.
  - Model compatibility and artifact inspection already recognize ControlNet/LoRA-capable families.
- **Architecture reference: ComfyUI pattern.** ComfyUI uses websocket execution/progress/custom event messages for control-plane feedback during graph execution. Use that pattern here for status and live-control updates, and add dedicated media transport only for high-rate browser media.

## Ordered roadmap

### Phase 0 - Planning decisions

**Purpose**

Resolve the few decisions that block implementation order before adding more code.

**Done when**

- the first realtime workflow is named
- the first operator surface is chosen
- the reuse-vs-new-node boundary is explicit

**Tasks**

- [ ] Decide whether the first serious operator surface is `/realtime`, mini-app, `html_app`, or a staged hybrid
- [ ] Decide whether to include speech-to-prompt/captions in the first MVP or defer them to a later live-controls phase
- [ ] Define the canonical stream diffusion workflow target for MVP
- [ ] List which existing nodes are reused directly and which realtime-specific nodes are actually needed

### Phase 1 - Workflow-native foundation

**Purpose**

Make the current substrate feel like NodeTool instead of a bolted-on side path.

**Done when**

- shared capture reuse is clear
- workflow inputs are editor-native
- the first operator surface is aligned with existing workflow surfaces

**Tasks**

- [ ] Audit `useVideoRecorder` / `VideoRecorder` and extract the shared capture layer
- [ ] Make camera/video input use existing `VideoInput` patterns wherever possible
- [ ] Keep audio input aligned with existing `RealtimeAudioInput` / streaming-input behavior
- [ ] Reuse mini-app / `html_app` patterns for the operator flow unless a clear gap remains
- [ ] Keep session/runtime logic in dedicated modules instead of growing more branching inside batch job flows

### Phase 2 - Runtime and transport contract

**Purpose**

Define the minimal runtime and transport shape needed for local realtime sessions.

**Done when**

- the session/runtime boundary is documented
- low-rate control traffic and high-rate media traffic are separated cleanly
- local session lifecycle and signaling are defined

**Tasks**

- [ ] Write the short spec separating realtime sessions from batch `run_job`
- [ ] Keep prompt/control/parameter updates on `stream_input` / websocket event flows where throughput allows
- [ ] Define the browser-to-runtime media transport for high-rate streams only
- [ ] Define the local signaling/session messages needed for transport setup and teardown
- [ ] Define session-scoped routing for realtime sources, sinks, status, and preview events

### Phase 3 - Local MVP: stream diffusion

**Purpose**

Ship the first end-to-end realtime workflow that proves the architecture.

**Done when**

- a canonical stream diffusion workflow runs as a realtime session
- ControlNet and LoRA use existing selection/compatibility paths
- the browser can preview output and update live parameters

**Tasks**

- [ ] Build the canonical stream diffusion workflow template
- [ ] Reuse existing model compatibility/selection for ControlNet-enabled guidance
- [ ] Reuse existing model compatibility/selection for LoRA-enabled styling/customization
- [ ] Connect the workflow template to session start / stop / reconnect
- [ ] Add one browser preview/output surface for the MVP
- [ ] Add live parameter updates and basic session diagnostics/logging

### Phase 4 - Editor integration

**Purpose**

Make realtime authoring discoverable and repeatable in the standard editor flow.

**Done when**

- authors can create, validate, and launch realtime workflows without route-local setup hacks

**Tasks**

- [ ] Add realtime-aware validation rules to the existing editor
- [ ] Add a starter template for stream diffusion + ControlNet + LoRA
- [ ] Add editor affordances for composing source, sink, and control nodes in realtime workflows
- [ ] Keep realtime input-node creation inside the existing context-menu/editor flow

### Phase 5 - Live controls and preprocessors

**Purpose**

Add the highest-value realtime controls after the base session path works.

**Done when**

- operators can steer live runs without rebuilding the workflow
- the first reusable conditioning/effects stages are workflow-native

**Tasks**

- [ ] Add live prompt/control updates while streaming
- [ ] Group controls for diffusion strength, ControlNet settings, and LoRA weight
- [ ] Add speech-to-prompt/captions if Phase 0 assigns them to this later live-controls phase
- [ ] Add reusable pose / depth / mask preprocessor workflows
- [ ] Add reusable pre/post FX chain support before adding more bespoke plugins

### Phase 6 - Local media extensions

**Purpose**

Extend the local stack after the video-first path is stable.

**Done when**

- common local media features work without changing the core architecture

**Tasks**

- [ ] Add audio input/output support where the workflow needs it
- [ ] Add recording/export for realtime sessions
- [ ] Add shared device selection on top of the reusable capture layer
- [ ] Add optional local-only bring-up pipelines for testing/debugging

### Phase 7 - Optional remote and hardware layers

**Purpose**

Keep cloud brokering and extra hardware integrations out of the core local MVP.

**Done when**

- remote/session-brokered execution can be layered on without reshaping the local runtime

**Tasks**

- [ ] Add cloud relay/session brokering only after the local path is stable
- [ ] Add TURN/auth/entitlement handling only for that remote mode
- [ ] Add NDI/Spout/Syphon-style integrations behind feature flags
- [ ] Keep MIDI/OSC/timecode and similar control-surface work out of the first local MVP

## Priority feature ladder

- [ ] **StreamDiffusionV1 + ControlNet depth/scribble + LoRA** — first serious target
- [ ] **Speech-to-prompt/captions/transcription** *(pending Phase 0 scope decision)* — early operator win
- [ ] **Moondream / live VLM scene understanding** — next step after the core img2img path
- [ ] **Pose / depth / mask preprocessors** — natural extension of ControlNet-first workflows
- [ ] **Reusable FX and upscaling passes** — after the base pipeline is stable
- [ ] **Higher-speed generation paths (FLUX-Klein / LTX-2)** — performance follow-up
- [ ] **Face swap / music-timecode / world-model features** — clearly later

## Immediate next tasks

- [ ] Audit the existing web capture path (`useVideoRecorder` / `VideoRecorder`)
- [ ] Decide the first operator surface: `/realtime`, mini-app, `html_app`, or a staged hybrid
- [ ] Define the canonical stream diffusion workflow template using existing input/model node patterns
- [ ] Write the short session/runtime spec, keeping websocket events for control-plane updates and reserving dedicated media transport for high-rate streams
- [ ] List the exact reused nodes/services versus truly new realtime-specific pieces needed for the MVP
