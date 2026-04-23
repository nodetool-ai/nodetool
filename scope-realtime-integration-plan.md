# Scope Realtime Integration Roadmap for NodeTool

## Checklist

- [x] Review NodeTool's current workflow streaming and mini-app architecture
- [x] Confirm clean-room requirement for Scope-inspired work
- [x] Add initial realtime substrate in NodeTool
  - [x] Protocol message types for realtime sessions
  - [x] Backend realtime session manager
  - [x] WebSocket commands for start/update/stop session
  - [x] REST endpoints for listing/fetching sessions
  - [x] Frontend realtime session client/store
  - [x] Basic `/realtime/:workflowId?` page and local camera preview
- [ ] Add a real media transport layer (WebRTC signaling + session negotiation)
- [ ] Support a true end-to-end realtime video session
- [ ] Add richer live controls and diagnostics
- [ ] Add a dedicated realtime graph/editor model
- [ ] Add media and hardware integrations
- [ ] Evaluate cloud/session brokering later as a separate workstream

## Current state

NodeTool already had:

- workflow/job streaming over WebSocket
- mini-app and standalone workflow surfaces
- streaming workflow input commands
- a reusable workflow engine and node system

NodeTool did **not** have a dedicated realtime media/session architecture.

This branch now adds the first substrate layer:

- a separate realtime session record/model
- backend session lifecycle management
- realtime session commands over WebSocket
- session listing APIs
- frontend session state and a basic realtime page

This is useful groundwork, but it is **not** Scope parity yet. It is still a control-plane-first MVP slice.

## Key constraint

Scope is currently licensed under `CC BY-NC-SA 4.0`. NodeTool should use Scope only as product and architecture reference material. Any implementation here must remain a clean-room reimplementation.

## Gap summary

Compared with Scope-style realtime support, the biggest missing pieces are still:

1. **Media transport**
   - no WebRTC signaling flow
   - no ICE/TURN/session negotiation
   - no track lifecycle management

2. **Realtime runtime**
   - no persistent low-latency media loop
   - no dedicated frame/audio execution path
   - no session-scoped media routing

3. **Live control model**
   - no prompt timeline/sequencing
   - no low-latency control/data channel
   - no controller/MIDI/tempo integration

4. **Realtime authoring**
   - no dedicated realtime graph type or editor mode
   - no realtime-specific node families or validation

5. **Media I/O**
   - no browser-to-backend video transport
   - no recording/export pipeline
   - no NDI/Spout/Syphon-style integrations

## Roadmap

### Phase 1 - Finish the substrate

Goal: complete the missing pieces around the new session stack without overloading the existing job runner.

- add WebRTC signaling endpoints
- define session negotiation and transport messages
- keep session control separate from batch `run_job`
- define the session/runtime boundary more clearly

### Phase 2 - Realtime video MVP

Target one narrow slice:

- one browser video input
- one realtime processing chain
- one browser video output
- start/stop/reconnect
- live slider or prompt updates
- basic session status/logging

Minimum work:

- session-scoped execution context
- realtime source/sink node contracts
- hot parameter updates during a session
- browser video transport path
- Electron/browser validation for device permissions

### Phase 3 - Live controls

- prompt updates while streaming
- transport controls
- better connection/session diagnostics
- status, logs, and recovery UX

### Phase 4 - Realtime graph/editor

- dedicated realtime graph/editor mode
- realtime node categories: source, sink, pipeline, prompt/control, record
- realtime routing/validation rules

### Phase 5 - Media + hardware

- audio input/output
- recording/export
- device selection
- optional NDI/Spout/Syphon integrations behind feature flags

### Phase 6 - Advanced control features

- MIDI mapping
- tempo sync
- controller input
- scheduled/beat-aligned changes

### Phase 7 - Cloud parity

Treat this as separate from local realtime support:

- cloud relay/session brokering
- TURN credential management
- auth/entitlement checks
- preload/download/session telemetry

## Recommended next milestone

**Realtime video session MVP**

Include:

- browser camera/video input
- one realtime pipeline
- one browser sink
- session reconnect
- one live control path
- basic status/logging

Do not include yet:

- cloud relay
- billing
- NDI/Spout/Syphon
- MIDI/tempo/OSC/DMX
- full Scope editor parity

## Next steps

1. Write a short technical spec for WebRTC signaling and session negotiation.
2. Define the realtime session runtime boundary separate from `run_job`.
3. Build the minimal browser video session path.
4. Add one live control channel and one realtime source/sink contract.
5. Treat full Scope parity as a roadmap, not a single feature.
