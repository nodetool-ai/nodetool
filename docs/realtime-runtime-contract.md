# Realtime Runtime Contract

This document captures the first execution contract for NodeTool realtime workflows so the current control-plane substrate can converge toward a workflow-native runtime without locking the project into the StreamDiffusion proof.

## Current baseline

- Protocol messages, websocket lifecycle commands (`start`/`update`/`signal`/`stop`), HTTP session listing (still REST in `routes/realtime.ts`; tRPC migration is tracked in the plan), frontend session client/store, and the `/realtime/:workflowId?` incubation page are all in place.
- `start_realtime_session` now creates a session linked to a `Job`, accepts an optional graph payload, and starts execution through the standard `WorkflowRunner`. `update_realtime_session` routes parameter changes into live workflow inputs via `pushInputValue` and reports `unrouted_parameters` for unmapped keys. The session manager preserves an `"error"` terminal state when startup or execution fails.
- The `/realtime` page captures camera locally, negotiates WebRTC offer/answer/ICE through the websocket signaling channel, declares browser-track-to-node mappings on the session record, and runs an in-browser loopback (operator + runtime peers in the same tab) as a transport proof. There is no server-side WebRTC termination yet, so media is not actually delivered into the live graph.
- Two known gaps remain inside the current substrate (tracked as actionable items in `nodetool/PLAN-REALTIME.md`):
  - The `starting → running` transition is gated on workflow runtime startup only, not on media-transport readiness.
  - Realtime sessions reuse the standard `WorkflowRunner`; a dedicated long-lived realtime runner is still a future refinement.

## Execution contract

### Identity

- A realtime session is always attached to a normal workflow identity.
- `session_id` identifies one live execution attempt for a workflow.
- `workflow_id` remains the durable authoring identity used by the editor, previews, jobs, templates, and reconnect flows.
- Once realtime runner wiring lands, each session must also create a standard `Job` record so history, diagnostics, and output routing stay in the normal workflow model.

### Lifecycle

- `starting`: control plane accepted the launch request, session metadata exists, and the runtime is preparing transports and graph state.
- `running`: media transport is established and the realtime graph is actively executing.
- `stopped`: the operator, disconnect handling, or workflow completion ended the session cleanly.
- `error`: startup, transport, or runtime execution failed.

The launch contract should accept:

- `workflow_id`
- optional `session_id` for reconnect/resume flows
- optional graph payload for live editor preview launches
- initial control parameters
- transport/signaling metadata needed by the media adapter

### Inputs and control updates

- High-rate media inputs flow through adapter-specific bounded queues.
- Control updates flow through a separate parameter queue/state channel and must be visible on the next execution cycle.
- Latest-frame-wins behavior applies at the media boundary so stale frames are dropped instead of delaying inference.
- Standard streaming nodes can continue to feed realtime nodes asynchronously through inbox-driven handoff points, but they must not block the high-framerate loop.

### Outputs, previews, and persistence

- Live preview state belongs with the same workflow-native surfaces already used for jobs, mini-app previews, and saved outputs.
- Ephemeral preview frames stay on the realtime session surfaces while the session is active.
- Persisted captures, recordings, snapshots, and exported outputs should land as normal NodeTool `Assets`.
- Session history, diagnostics, and reconnect affordances should be discoverable from the same workflow/job surfaces used for non-realtime execution.

## Convergence invariants with the standard workflow runner

- Realtime remains a workflow execution mode, not a parallel product surface.
- The first runtime may stay internally separate, but it must preserve workflow identity, job visibility, asset routing, and editor launch semantics.
- The high-framerate path cannot pay normal per-node orchestration costs for every frame; realtime-capable nodes need an execution path that keeps setup/state warm across iterations.
- Reusable standard nodes are allowed when they can run inside the realtime loop without introducing blocking I/O or per-frame setup costs that collapse throughput.
- Standard streaming nodes remain asynchronous inputs/control producers at the boundary instead of becoming part of the tight media loop by default.

## First operator surface decision

Use a staged path:

1. `/realtime/:workflowId?` remains the first incubation/operator surface.
2. The same session contract must be launchable from workflow-native surfaces once runner wiring exists.
3. Mini-app and `html_app` surfaces can become specialized operator shells after the core workflow launch/reconnect flow is stable.

This keeps the first proof isolated without creating a dead-end UX.

## Node capability model

Classify nodes into four groups:

- **Reusable**: safe to execute inside the realtime loop as-is.
- **Reusable with constraints**: usable only with warmed state, bounded inputs, or restricted property/update patterns.
- **Adapter-backed**: bridge nodes that terminate or originate media/control transports.
- **Realtime-specific**: nodes that only exist for session-aware live execution concerns.

Realtime-capable nodes must declare:

- whether they can live on the high-framerate path
- whether they own warm state across session lifetime
- how they reset when a session stops/restarts
- whether they are media-boundary adapters or pure graph operators

## `nodetool.realtime` namespace policy

- Reserve `nodetool.realtime` for nodes that are genuinely session-aware or media/control-boundary specific.
- Keep existing namespaces for ordinary workflow nodes that remain reusable in realtime workflows.
- Do not duplicate standard workflow nodes under `nodetool.realtime` unless they need distinct realtime execution semantics.

## Initial `nodetool.realtime` roles for the first proof

- **Source**: live camera/media ingress node mapped from the media adapter
- **Sink**: live preview/output egress node for operator-visible realtime frames
- **Transport adapter**: WebRTC signaling/media bridge for web clients
- **Live control**: session-aware control node for prompts, strength, and guidance updates
- **Session utility**: diagnostics/state node for connection health, queue depth, fps, and lifecycle state

## Control plane vs media plane

### Keep on the existing websocket control plane

- session start/ack/update/stop commands
- signaling metadata that is low-rate and session-oriented
- diagnostics, status transitions, queue health, and errors
- preview availability notifications and output metadata
- reconnect/session discovery events

### Move across the media adapter boundary

- camera/video/audio frames
- high-rate preview frames
- any transport that must tolerate packet loss better than websocket head-of-line blocking

For web clients, the first media boundary is WebRTC.

## Capture-layer audit: `useVideoRecorder` and `VideoRecorder`

The current recorder path mixes several concerns in one flow:

- device discovery and selection
- live browser preview lifecycle
- recording lifecycle
- workflow-bound asset upload
- UI state for capture and upload together

That makes it useful for asset capture today, but it is not yet a reusable realtime capture layer. Follow-up work should split reusable device/capture concerns from workflow upload concerns so realtime session input can reuse browser capture without inheriting recording/upload behavior.

## Implementation follow-ups

The actionable backlog (live status, ownership, and dependencies) lives in `nodetool/PLAN-REALTIME.md`. The items still open against this contract specifically are:

- Tighten the `starting → running` gate so it also waits on media-transport readiness once a server-side WebRTC peer exists.
- Stand up a server-side WebRTC termination point so the mapped browser tracks actually reach the live graph through `nodetool.realtime` source nodes.
- Promote ad-hoc parameter pushes into an explicit realtime parameter/control queue when the dedicated realtime runner lands.
