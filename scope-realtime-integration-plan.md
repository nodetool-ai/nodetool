# Scope Realtime Integration Plan for NodeTool

## Goal

Define what NodeTool needs to add to support Scope-style realtime functionality while fitting NodeTool's existing workflow, mini-app, and WebSocket architecture.

## Codebases analyzed

### NodeTool

- `/home/runner/work/nodetool/nodetool/web/src/components/miniapps/hooks/useMiniAppRunner.ts`
- `/home/runner/work/nodetool/nodetool/web/src/components/miniapps/MiniAppPage.tsx`
- `/home/runner/work/nodetool/nodetool/web/src/components/miniapps/StandaloneMiniApp.tsx`
- `/home/runner/work/nodetool/nodetool/web/src/lib/websocket/GlobalWebSocketManager.ts`
- `/home/runner/work/nodetool/nodetool/web/src/stores/WorkflowRunner.ts`
- `/home/runner/work/nodetool/nodetool/packages/protocol/src/messages.ts`
- `/home/runner/work/nodetool/nodetool/packages/websocket/src/unified-websocket-runner.ts`
- `/home/runner/work/nodetool/nodetool/ARCHITECTURE.md`

### Scope

- `README.md`
- `pyproject.toml`
- `frontend/src/App.tsx`
- `frontend/src/pages/StreamPage.tsx`
- `frontend/src/hooks/useUnifiedWebRTC.ts`
- `frontend/src/hooks/useTempoSync.ts`
- `frontend/src/hooks/useControllerInput.ts`
- `frontend/src/hooks/useVideoSource.ts`
- `frontend/src/components/VideoOutput.tsx`
- `frontend/src/components/PromptInputWithTimeline.tsx`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/hooks/useApi.ts`
- `src/scope/server/app.py`
- `src/scope/server/webrtc.py`

## Important constraint

Scope is licensed under `CC BY-NC-SA 4.0` in its current alpha form. NodeTool must treat Scope as a reference for product and architecture analysis only. Any implementation in NodeTool should be a clean-room reimplementation, not a code port.

## What Scope currently provides

From the analyzed code, Scope combines a realtime media plane with a rich control plane:

1. **Realtime transport**
   - Browser/backend media streaming over WebRTC
   - ICE/TURN support
   - WebRTC data channel for low-latency control and notifications
   - Multi-source and multi-sink track routing

2. **Realtime media runtime**
   - Session-oriented backend lifecycle
   - Low-latency frame processing loop
   - Video and audio output handling
   - Recording support

3. **Interactive UI**
   - Dedicated stream workspace
   - Start/stop/play/pause flow
   - Video output panel
   - Logs, status, download/progress surfaces

4. **Realtime prompting**
   - Live prompt submission while streaming
   - Timeline-based prompt sequencing
   - Prompt blending and transition controls

5. **Graph-based realtime pipeline editing**
   - React Flow editor for realtime source/pipeline/sink/control graphs
   - Node families for sources, sinks, prompt lists, LoRAs, VACE, tempo, MIDI, record, custom nodes, subgraphs

6. **Realtime inputs and outputs**
   - Camera and uploaded/sample video
   - Server-side sources/sinks such as NDI/Spout/Syphon
   - Controller input
   - Tempo sync
   - MIDI-related controls

7. **Operational features**
   - Pipeline/model loading and download state
   - Plugins
   - Cloud relay mode
   - Auth/billing/onboarding surfaces

## What NodeTool already has

NodeTool already has several useful building blocks:

- A strong DAG workflow engine and node system
- WebSocket-based incremental execution updates (`job_update`, `node_update`, `node_progress`, `output_update`)
- Mini-app surfaces and standalone workflow UIs
- Streaming input commands in the workflow runner (`stream_input`, `end_input_stream`)
- HTML mini-app support (`html_app`)
- Electron/web/mobile shells
- Python bridge and deployment/runtime infrastructure

## Main gap vs Scope

NodeTool currently streams **workflow events**, not **realtime media sessions**.

The biggest missing pieces are:

1. **No media transport layer**
   - No WebRTC signaling
   - No audio/video track lifecycle
   - No ICE/TURN/session negotiation

2. **No realtime session runtime**
   - Current execution is job-oriented, not persistent low-latency stream-oriented
   - No per-session frame/audio loop, pacing, or per-track routing

3. **No realtime graph/UI model**
   - Current graph editor is built for workflow authoring, not live stream operation
   - Mini-apps can display streamed results, but not manage live media sessions

4. **No dedicated control plane for live updates**
   - No timeline prompting
   - No controller/MIDI/tempo/data-channel update path

5. **No media I/O integrations**
   - No browser-to-backend video/audio session handling
   - No NDI/Spout/Syphon abstraction

## Recommended delivery strategy

Do this in phases. Do not try to copy Scope as a single large feature.

## Phase 0 - Product and architecture decisions

1. Define the first supported slice:
   - local-only or local+cloud
   - video only or video+audio
   - single input/output or multi-source/multi-sink
2. Decide whether realtime graphs are:
   - a new workflow mode inside NodeTool, or
   - a separate realtime graph type
3. Define clean boundaries between:
   - NodeTool workflow engine
   - realtime session manager
   - browser/Electron transport layer
4. Write a clean-room compatibility spec for Scope-inspired features.

## Phase 1 - Realtime substrate

1. Add a new realtime session service in `packages/websocket` or a dedicated package.
2. Introduce WebRTC signaling endpoints and session registry.
3. Add protocol types for:
   - session lifecycle
   - media/control channel messages
   - live parameter updates
   - track/source/sink metadata
4. Add a frontend realtime connection manager alongside the current global WebSocket manager.
5. Keep the current WebSocket runner for workflow events; do not overload it with media transport.

## Phase 2 - Minimal end-to-end realtime MVP

Target one narrow path first:

- browser video source
- one realtime processing chain
- one browser video sink
- start/stop session
- live parameter update

Required work:

1. Add realtime source/sink node contracts.
2. Define a session-scoped execution context separate from normal batch jobs.
3. Support hot parameter updates while a session is active.
4. Add a basic stream page UI in the web app.
5. Add Electron validation for media permissions and device handling.

## Phase 3 - Realtime controls

1. Add live prompt update support.
2. Add timeline prompt sequencing.
3. Add a control update channel for:
   - prompt changes
   - slider/knob/xypad changes
   - transport commands
4. Add session status, logs, and connection diagnostics.

## Phase 4 - Realtime graph editor

1. Add a dedicated realtime graph editor mode.
2. Introduce node categories inspired by Scope's graph model:
   - source
   - sink
   - pipeline
   - prompt/control
   - record
   - tempo/controller/MIDI
   - custom/subgraph
3. Add graph validation for realtime-specific routing rules.
4. Support graph import/export for realtime sessions.

## Phase 5 - Media and hardware integrations

1. Browser camera/video/image inputs
2. Audio output and optional audio input
3. Recording/export
4. Optional server-side integrations:
   - NDI
   - Spout
   - Syphon
5. Hardware capability discovery and UI surfacing

These should be behind feature flags because they are platform-specific and significantly increase support cost.

## Phase 6 - Advanced live control features

1. Controller input
2. MIDI mapping
3. Tempo sync
4. OSC/DMX-style external control if still in scope
5. Scheduled changes and beat-aligned updates

This phase should only start after the core realtime session architecture is stable.

## Phase 7 - Cloud and operational parity

If NodeTool wants parity with the broader Daydream product surface, add:

1. Cloud relay/session brokering
2. TURN credential management
3. Auth and entitlement checks
4. Model/pipeline preload and download progress
5. Session telemetry, crash recovery, and reconnection support

This should be treated as a separate workstream from local realtime support.

## Backend changes likely needed in NodeTool

1. **New session manager**
   - long-lived realtime sessions
   - session state, cleanup, reconnection

2. **New execution path**
   - session/frame-oriented processing
   - not just `run_job`

3. **New protocol layer**
   - media/control messages distinct from job updates

4. **New node/runtime interfaces**
   - realtime source nodes
   - realtime sink nodes
   - continuously updated control nodes
   - hot-swappable parameters

5. **Python/runtime integration**
   - likely required for many media pipelines
   - must support long-lived, low-latency processing

## Frontend changes likely needed in NodeTool

1. New realtime stream page
2. New realtime session store
3. WebRTC connection manager
4. Video/audio preview components
5. Timeline prompt UI
6. Realtime graph editor mode
7. Device/hardware selection UI
8. Recording/logging/status UI

## Suggested initial milestone definition

The best first milestone is:

**"Realtime video session MVP"**

Deliver:

- one browser video input
- one realtime processing pipeline
- one browser video output
- start/stop/reconnect
- live prompt or slider update
- basic status/logging

Do **not** include in the first milestone:

- cloud relay
- billing
- NDI/Spout/Syphon
- MIDI/tempo/OSC/DMX
- full Scope graph parity

## Risks

1. **License risk** if Scope code is copied directly
2. **Architecture risk** if realtime sessions are forced into the current job runner without a separate session model
3. **Latency risk** if media transport and workflow event transport are mixed
4. **Complexity risk** from adding all hardware/cloud features too early
5. **Cross-platform risk** for Electron + browser + desktop media integrations

## Recommended next steps

1. Write a short technical spec for NodeTool's realtime session architecture.
2. Decide the first supported product slice.
3. Create a protocol proposal for WebRTC signaling and live control updates.
4. Build the minimal realtime MVP before any advanced parity work.
5. Treat Scope parity as a roadmap, not as a single implementation task.
