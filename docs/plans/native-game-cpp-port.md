# Native C++ game engine implementation plan

Build a native NodeTool game engine around the TypeScript engine's authoring and
execution model. Gameplay runs in QuickJS. C++ owns simulation and rendering,
Jolt supplies 3D physics, and Qt Quick supplies the desktop editor. Agents create,
inspect, edit, run, and verify games through the same operations as the editor.

This is an implementation plan, not a record of shipped functionality. New paths,
commands, interfaces, and budgets below are proposed. Allocate version values and
pin dependencies during A1 rather than assuming an unused version number.

## Scope and decisions

The port follows the TypeScript engine's architecture without preserving binary,
document, script, visual, or physics compatibility. Existing games stay with the
existing engine. Native documents receive explicit schema and engine identities.
No automatic migration or legacy snapshot conversion is required.

The action identifiers A1–A8 retain the milestones from the design discussion.
Task identifiers beneath them identify implementation slices, not parallel agent
assignments. Complete each slice's prerequisites before starting dependent work.

| Decision | Implementation consequence |
| --- | --- |
| D21. Follow NodeTool's TS engine | Preserve explicit documents, prefabs, script commands, ordered systems, presentation output, and headless sessions. Do not adopt Godot or introduce a second authoring model. |
| D22. QuickJS is required | Gameplay JavaScript runs only through a bounded native QuickJS host. QML JavaScript cannot implement gameplay. |
| D23. Jolt owns 3D physics | Implement native character and collider rules without emulating Rapier. Saved physics state is specific to a supported engine build. |
| D24. Agents and humans use one edit implementation | Document validation, revisions, undo, and live-edit classification belong to the C++ document module. Host authorization remains in NodeTool. |
| D25. Native 3D is the first release | Deliver the creation-to-verification loop before editor breadth. Native 2D follows as an explicit extension using the TS 2D design as its reference. |
| D26. Keep a browser path possible | The simulation library must build without Qt or GPU dependencies. Demonstrate an early WebAssembly build, but browser rendering/export is a later milestone. |
| D27. No wholesale timeline extraction | Reuse proven build, diagnostics, and Qt integration patterns. Extract shared code only when both native applications have a concrete caller. |
| D28. Share the native operation dispatcher | Native stdio and browser WebAssembly are adapters over one bounded document/session interface. Neither adapter exposes C++ objects or implements gameplay rules. |
| D29. Keep the browser build independent of Qt | Compile both spatial implementations, QuickJS, document admission, and the shared session. Keep native device, editor, stdio, and installation code outside that target. |
| D30. Put browser simulation in a worker | A worker owns the WebAssembly instance and session. Input recording and committed presentation cross a versioned interface, with bounded scheduling and explicit termination on an unresponsive call. |
| D31. Adapt native presentation explicitly | Browser renderers consume the native 2D/3D frame contract. Reuse rendering modules where their semantics match, without converting native documents into legacy simulation documents. |
| D32. Save script-defined JSON progress and settings | Native and browser hosts perform bounded storage requests after tick commit. Load responses enter recorded input frames. Durable saves do not contain a full-world snapshot or a snapshot flag. |
| D33. Keep snapshots local to the originating live session | Authenticated restore remains a debugging/replay operation. New sessions, restarted workers, and different WebAssembly instances reject earlier snapshots. |
| D34. Export a closed standalone browser player | Stage verified assets and installed runtime artifacts atomically. Browser play requires no NodeTool server, provider credentials, or external CDN. Report actual device and build measurements. |
| D35. Port the constrained TS 2D solver | Static and kinematic swept AABB collision, sensors, one-way surfaces, tile seams and moving platforms define native 2D physics. Do not add Box2D or use Jolt to define 2D behavior. |

Initial release content includes scene hierarchy, prefabs, properties, primitive
and imported visuals, capsule movement, rigid bodies, triggers, QuickJS behaviors,
basic HUD, audio, snapshots, scripted input, capture, and desktop packaging.
Advanced effects, terrain editing, networking, multiplayer rollback, arbitrary
native plugins, and browser export are outside that release.

## Source references and port map

Use these files to understand intent. Do not copy their compatibility branches or
assume their implementation choices are required by the native contract.

| Existing source | Native destination and retained concept |
| --- | --- |
| [Runtime overview](../../packages/game-runtime/README.md) | Session ownership, headless execution, lifecycle, diagnostics |
| [Protocol game schemas](../../packages/protocol/src/game.ts), [3D schemas](../../packages/protocol/src/game3d.ts) | Versioned documents and bounded fields |
| [Document operations](../../packages/game-runtime/src/document-ops3d.ts), [authoring reconciliation](../../packages/game-runtime/src/authoring-reconcile.ts) | Atomic changes, identity, authored overrides |
| [Session](../../packages/game-runtime/src/session3d.ts), [pipeline](../../packages/game-runtime/src/systems/pipeline.ts), [tick order](../../packages/game-runtime/src/systems/tick3d.ts) | One owner for committed state and explicit system order |
| [Script host](../../packages/game-runtime/src/scripts.ts), [lifecycle](../../packages/game-runtime/src/script-lifecycle.ts) | Isolated calls, explicit state, hooks, timers, budgets |
| [Reload](../../packages/game-runtime/src/script-reload.ts), [declarations](../../packages/game-runtime/src/script-declarations.ts) | Source validation and discoverable script contracts |
| [Renderer overview](../../packages/game-renderer/README.md) | Prepared assets, transform ownership, presentation from committed ticks |
| [Game CLI](../../packages/cli-game/src/commands/game.ts) | Validate, simulate, inspect, capture, benchmark, export |
| [Games router](../../packages/websocket/src/trpc/routers/games.ts), [draft history](../../packages/websocket/src/trpc/routers/gameDraftHistory.ts) | Authorized persistence, revisions, draft recovery |
| [Native timeline design](../../native/timeline/docs/DESIGN.md), [build](../../native/timeline/CMakeLists.txt) | Qt Quick viewport, offscreen rendering, CMake and platform packaging |
| [Harness reference](../harnesses.md), [harness doctrine](../HARNESS_FIRST.md) | Every shipped operation is executable and verifiable headlessly |

The existing 3D runtime serializes and restores Rapier every tick. Do not port that
mechanism. Preserve the useful requirement that restoring a supported native
snapshot continues correctly, then prove Jolt's implementation against native
fixtures.

## Proposed module layout

Create the following targets under `native/game/`. The paths are planned and do
not imply that these modules already exist.

| Target and directory | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `game_document`, `src/document/` | Parse, validate, resolve prefabs, apply transactions, history | Portable C++ and selected JSON/schema library |
| `game_core`, `src/core/` | Session, input, systems, gameplay, committed state, snapshots | Document, scripts, physics |
| `game_scripts`, `src/scripts/` | QuickJS lifetime, guest transport, commands, limits | QuickJS and portable contract types |
| `game_physics`, `src/physics/` | Jolt world, controllers, queries, contact normalization | Jolt and portable contract types |
| `game_assets`, `src/assets/` | Prepared manifest, bounded decoding, resource ownership | Selected image, audio, and glTF libraries |
| `game_render`, `src/render/` | Draw committed presentation, GPU resources, capture | Qt QRhi, assets, read-only presentation types |
| `game_audio`, `src/audio/` | Voices, buses, spatial audio, offline validation | Selected native audio library and assets |
| `game_host`, `src/host/` | Worker process, framing, cancellation, storage adapters | Core and optional renderer/audio |
| `game_editor`, `src/editor/`, `qml/` | Qt models, editing tools, panels, play controls | Document interface and host client |
| `tests/`, `fixtures/`, `scripts/` | Public-interface tests, sample projects, CI drivers | Only the targets required by each test |

Use C++20 as the initial baseline, following the timeline. Apply RAII to QuickJS
values, Jolt resources, threads, and GPU objects. No raw ownership crosses module
interfaces. External session operations return typed success/error results.
Keep Jolt, QuickJS, and Qt objects private to their owning implementation.

The session interface should remain small: open, step, inspect, snapshot, restore,
and close. Loading and compilation happen before stepping. Authored edits belong
to the document interface, with explicit session restart or replacement behavior.
Do not create a generic plugin system or an extensible ECS framework for this port.

## Document and transport contracts

### Canonical document contract

Keep authoring schemas in `packages/protocol`, in a separate native-engine entry
point. Export a supported JSON Schema subset from the Zod definitions and generate
native validation descriptors, script declarations, and tool metadata from it.
Prove the generator handles discriminated unions, defaults, bounds, and references
before adding the full schema. Explicit C++ semantic checks handle relationships
such as hierarchy cycles and missing assets. Cross-language fixtures verify those
checks agree with the host's admission rules.

Documents contain engine identity, schema version, revision, scenes, stable entity
and behavior IDs, prefab definitions, script sources, input actions, and asset
references. Use meters, Y-up, normalized quaternions, and forward -Z for 3D. Choose
one authored angle convention and encode units in field names where necessary.
Reject unknown fields in the new version instead of silently dropping them.

Persistent resource IDs follow the repository's full-ID and exact-prefix rules.
Prefix resolution happens in the authorized NodeTool host. Native documents and
worker messages contain full resolved IDs. Runtime entity handles are separate
from persistent resource IDs and include a generation to reject stale references.

### Transactions and persistence

A transaction carries request ID, expected revision, and typed operations. It is
validated on a candidate document and commits once, producing a new revision,
normalized change list, and inverse operations. A batch either succeeds entirely
or leaves the document untouched. Reject stale revisions with a conflict result
that includes the current revision, without silently rebasing.

NodeTool remains the authority for access control and durable storage. The native
worker validates and prepares a candidate. The host persists it with a revision
compare-and-swap, then publishes the accepted revision to the session/editor.
Do not claim a local edit is saved before persistence succeeds. A restart between
persistence and session publication recovers by reopening the durable revision.
Unsaved desktop edits remain explicit drafts with recovery data.

### Worker protocol

Start with a versioned, length-prefixed MsgPack protocol over inherited stdio,
following the repository's existing native-process pattern. Stdout carries only
protocol frames. Stderr carries bounded diagnostics. Large captures and snapshots
are staged as artifacts and returned by handle with digest and size.

Every request carries protocol version, request ID, operation, session ID where
needed, expected revision where needed, and bounded payload. Responses distinguish
validation errors, conflicts, script errors, resource limits, unavailable
capabilities, cancellation, and worker failure. Negotiate capabilities at startup.

Serialize mutation and step operations per session. Permit cancellation through a
control path that remains responsive while work runs. A retry of a completed edit
returns the same outcome within a bounded request cache. Across restarts, the host
checks the durable operation/revision record before retrying a write. Never replay
an unacknowledged simulation step without checking the committed tick.

The host stages authorized assets through `context.workspace`, including virtual
workspaces, using materialize/absorb where local files are required. The child
receives only the staged asset manifest and output directory, no provider keys or
arbitrary workspace access. Process separation does not itself provide an OS
sandbox. Server execution needs platform isolation and resource limits before
accepting untrusted projects.

## Simulation, scripting, and restoration

### Tick semantics

Use a fixed 60 Hz simulation tick. A paused session advances only through explicit
step requests. Real-time hosts accumulate elapsed time with a bounded catch-up
policy and report overruns. Verification steps exact ticks and never drops input.

| Phase | Reads and writes |
| --- | --- |
| Input | Consume the recorded action frame for this tick. Latch prior committed contacts, events, and query results. |
| Scripts | Invoke behaviors in stable entity/behavior order against the committed world view. Stage state, RNG, timers, and commands. |
| Character | Apply validated movement intent and moving-platform rules. |
| Physics | Apply admitted forces/body changes and advance Jolt once. |
| Contacts | Normalize callbacks, remove duplicates, and sort by stable IDs and event kind. Never depend on worker callback order. |
| Gameplay | Apply collection, health, score, lifetime, spawn/despawn, and transition rules. |
| Animation | Update deterministic animation selection and presentation state. Cosmetic bone poses cannot move physics bodies. |
| Presentation | Publish an immutable frame and tagged audio/particle events, then commit the tick. |

Define command classes explicitly. Movement and forces affect the current physics
step. Structural commands are validated before execution and materialized at the
specified gameplay stage. A newly spawned behavior starts next tick. Physics query
commands execute against the post-physics world and return next tick. Contacts
reach script hooks next tick. Scene transitions occur at the commit seam and clear
or transfer queues according to the documented transition policy.

Physics owns dynamic transforms. Controllers own character transforms. Authored
transforms own static bodies. Reject conflicting writers. Keep camera state used
by aiming in simulation, while purely cosmetic camera smoothing stays presentation.

### QuickJS contract

Use native QuickJS with an explicit allowlist of host functions. Its C interface
provides memory limits and interrupt callbacks. Pin and test the chosen source
revision on every desktop target. See the [QuickJS embedding manual](https://bellard.org/quickjs/quickjs.html).

Retain the TS lifecycle vocabulary: `onStart`, `onSceneEnter`, `onTriggerEnter`,
`onTriggerExit`, `onContact`, `onEvent`, `onFixedUpdate`, `onUpdate`, and `onDestroy`.
Specify hook order and exactly-once destruction behavior in executable fixtures.
Both update hooks run at the fixed tick, not at render frequency. Timers use tick
numbers and named handlers stored in explicit state.

Use synchronous calls with JSON input and JSON output. Behavior state, timers,
random state, and emitted commands are the only persistent effects. Initially
create a fresh realm per behavior invocation and evaluate source under limits,
including top-level evaluation. Host-compiled caches are keyed by source and
QuickJS build identity. Do not accept uploaded bytecode. Retaining realms is a
later measured optimization requiring proof that hidden closure/global state
cannot change results.

Disable wall-clock access and replace randomness with the session's seeded source.
Do not expose `std`, `os`, filesystem access, network access, dynamic host imports,
Qt objects, native addresses, or threads. Reject async hook results and unsupported
module imports. Reject queued promise work rather than allowing it to escape the
invocation. Define whether helper modules are source-bundled before execution.

Bound source size, compile time, heap, stack, call duration, total script phase,
serialized input/output size, nesting, commands, timers, and logs. Host helpers and
result serialization must obey limits too, because VM interrupts alone cannot
bound a native callback. Treat timeout as an explicit failed run, not a silently
skipped behavior. Wall-clock limits are watchdogs, not determinism guarantees.

Errors include entity and behavior IDs, source digest, source location, hook,
tick, error code, and limit details. Generate script declarations and runnable
examples from the same contract used to validate commands.

### Failure atomicity and snapshots

Before a tick, retain the last committed checkpoint. Script evaluation stages all
results before native state changes. If any script fails, discard the entire
script batch and its staged RNG, timer, and command changes. Recreate affected
realms. No gameplay effect or output event from that batch may escape.

For the initial implementation, checkpoint native simulation state before later
mutable stages. If physics or gameplay fails, restore the checkpoint and mark the
session faulted. If restore itself fails, destroy the session and let the host
reopen from a verified checkpoint. Do not publish a partially advanced frame.
Measure checkpoint cost. Optimize with an explicit rollback strategy only after
failure tests prove the same behavior. Never restore physics on every successful
tick merely to imitate the TS runtime.

A snapshot includes document and asset-manifest digests, engine/build identity,
Jolt configuration identity, tick, input edge state, active scene, entities,
physics state, virtual characters, explicit script state, timers, RNG, lifecycle
queues, pending queries, gameplay events, and simulation-relevant camera/animation
state. Physics alone is insufficient. Jolt's virtual characters need their own
state handling. See [Jolt architecture](https://github.com/jrouwe/JoltPhysics/blob/master/Docs/Architecture.md).

Validate an entire snapshot into a temporary session before replacing the active
one. Restore entity identity and shape references before physics/controllers,
then scripts and pending work. Publish a fresh presentation generation. Drop
queued one-shot audio/particles from the old generation to avoid duplicate effects.

Guarantee repeatable continuation within the supported build/configuration first.
Compare semantic state and event hashes, not uninitialized memory or arbitrary
serialization bytes. Cross-platform exact replay is a separate measured gate,
including Jolt settings and script math. Unsupported snapshots fail explicitly.
Durable player progress uses a separate versioned JSON save contract and does not
promise indefinite compatibility for engine snapshots.

## A1 — Contracts, dependencies, and scaffold

### A1.1 — Record the feature inventory

Enumerate exported TS document fields, script commands, hooks, tools, renderer
features, and fixtures. Classify each as first release, later, or intentionally
removed, with its native destination. Include 2D in this inventory even though 3D
ships first. Record every changed semantic deliberately.

Acceptance: no first-release feature lacks a document representation, agent
operation, runtime owner, and verification method.

### A1.2 — Establish builds and dependency pins

Create portable CMake targets and a headless test executable. Pin QuickJS and Jolt
sources with checksums and record notices. Evaluate JSON/schema, glTF, image,
audio, and MsgPack dependencies with small build fixtures before selection.
Follow the timeline's Qt minor pin for QRhi, but record the explicit exception to
the general unstable-API rule and isolate private Qt headers in `game_render`.
[QQuickRhiItem](https://doc.qt.io/qt-6/qquickrhiitem.html) supplies the viewport seam.

Add native instruction files and their required `CLAUDE.md` siblings when creating
the source tree. Link them from the root instructions. Adapt timeline hardening
and sanitizer configuration without adding a dependency on its application.

Acceptance: clean headless builds and tests run on Linux, macOS, and Windows.
A separate Emscripten probe executes a QuickJS call and a Jolt step without Qt.
Browser feasibility failures are documented before the core interface is frozen.

### A1.3 — Freeze the first contract and test fixtures

Implement schema export, native loading, capability negotiation, and a minimal
empty session. Add valid/invalid fixture pairs for all supported schema constructs.

Acceptance: TS and C++ agree on fixture admission, normalized defaults, IDs, and
error paths. Deliberately invalid input makes the contract check fail. Empty
fixture discovery also fails.

Dependencies: A1.1 and A1.2 precede A1.3.

## A2 — Documents, transactions, and headless authoring

### A2.1 — Implement the document module

Add scenes, entity hierarchy, prefabs with explicit overrides, typed properties,
input mappings, and script references. Resolve prefab expansion deterministically.
Detect cycles, duplicate IDs, dangling references, transform conflicts, and
resource-limit violations before committing. Reject deletion of referenced assets
unless the same transaction repairs the references.

Acceptance: create, patch, clone, remove, undo, and redo are observable through
public operations. Invalid middle operations roll back the whole batch. Large
hierarchies and prefab graphs have bounded traversal and allocation costs.

### A2.2 — Implement worker hosting

Implement framed messages, handshake, session lifecycle, inspect, validate,
transaction, save candidate, and cancellation. Add message-size limits,
backpressure, process exit handling, and staged artifacts. The Node host translates
AbortSignal cancellation and kills an unresponsive worker after a bounded grace
period. Worker exit cannot be mistaken for a successful empty response.

Acceptance: truncated frames, oversized messages, duplicate requests, stale
revisions, cancellation, and crash recovery have host-to-worker integration tests.

### A2.3 — Connect authorized persistence

Extend the native document route without passing new documents through legacy
normalizers that strip fields. Keep full resource IDs, project authorization,
revision compare-and-swap, and draft recovery in the host integration.

Acceptance: save/reopen preserves the new document, simultaneous writers produce
one winner and an actionable conflict, and a crash after durable save recovers the
accepted revision. Agent-visible shortened IDs resolve only within authorized scope.

Dependencies: A1.3 → A2.1 → A2.2 → A2.3.

## A3 — QuickJS behaviors and diagnostics

### A3.1 — Implement the bounded script host

Implement VM ownership, fresh realms, source compilation, host data transport,
seeded random, JSON state, command validation, and error locations. Include limits
for compile/evaluate/serialize phases. No C++ exception may unwind through a C
callback. No QuickJS value survives its owning context/runtime.

Acceptance: infinite loops, recursion, allocation storms, getters during result
serialization, cyclic output, oversized commands, async results, and attempted
host access fail without hanging or corrupting the session. Sanitizers pass.

### A3.2 — Implement hooks, timers, and world queries

Port lifecycle intent from the TS dispatcher, with stable invocation order and
explicit state. Supply an immutable, bounded world view with targeted lookups and
spatial queries. Avoid serializing the full world for every behavior.

Acceptance: fixtures verify start, spawn, trigger enter/exit, contact, event,
fixed update, timer, scene transition, and destruction order. Query responses
arrive at the documented tick and reject stale entity handles.

### A3.3 — Implement source replacement

Compile candidate source before committing an edit. Initially, changed source
restarts the affected session from its authored initial state. Report that effect
before applying it. Add state-preserving replacement only with an explicit state
version and validated migration function running under the same script limits.
A failed compile or migration leaves the existing source and state intact.

Acceptance: invalid replacement changes no revision or state. Valid replacement
produces a new source digest and predictable restart. Diagnostics reference the
exact source revision, including after undo.

Dependencies: A2.2 → A3.1 → A3.2. A3.3 also requires A2.3.

## A4 — Simulation, Jolt, and replay

### A4.1 — Implement fixed-tick gameplay

Implement the session state machine, input edges, system ordering, seeded RNG,
spawn/despawn, score, health, collection, lifetime, triggers, and transitions.
Add the checkpoint and staged-output policy before adding mutable physics.

Acceptance: repeated scripted input produces matching semantic state and ordered
events. Failure injection in each mutable phase restores the committed tick and
publishes no partial output.

### A4.2 — Implement Jolt scenes and character movement

Add static/dynamic/kinematic bodies, primitive shapes, prepared static meshes,
collision layers, sensors, queries, and capsule movement. Implement grounded state,
jump, slope limits, steps, moving platforms, and body interactions explicitly.
Start with deterministic job configuration and stable creation order. Normalize
contacts outside Jolt callbacks before gameplay observes them.

Acceptance: fixtures cover floor contact, slopes, stairs, low ceilings, moving
platforms, fast motion, sensor crossing, despawn during contact, and large scenes.
Character movement is judged against the native specification, not Rapier output.

### A4.3 — Implement complete restore and replay verification

Add snapshot codecs and atomic restore. Replay from multiple saved ticks and
report the first differing entity, field, hook result, or event. Include spawn,
destruction, timers, queries, scene transitions, characters, and script RNG.

Acceptance: resumed runs match uninterrupted runs on the supported build. Invalid
and mismatched snapshots leave the active session untouched. Build identity and
capability failures are explicit. Benchmark checkpoint allocation and latency.

Dependencies: A3.2 → A4.1 → A4.2 → A4.3.

## A5 — Player, assets, rendering, HUD, and audio

### A5.1 — Prove the viewport and capture path

Implement a minimal Qt Quick player with primitive geometry, camera, input, and
an offscreen target. Render immutable committed frames through QRhi. Keep GPU
resource creation/destruction on the owning render thread and simulation on its
own owner thread. Use a bounded frame exchange. Drop obsolete presentation frames
without dropping simulation events or ticks.

Acceptance: windowed play and offscreen capture use the same draw implementation.
Pause and exact-tick capture are stable. Resize, close, and resource recreation do
not race simulation. Capture failure reports the backend and device.

### A5.2 — Prepare and render assets

Implement a closed asset manifest with digests, sizes, dependencies, and import
settings. Import a defined glTF subset with explicit rejection of unsupported
required extensions. Decode off the simulation thread, bound resource use, and
reject external runtime URLs, traversal paths, and digest mismatches.

Deliver static meshes first, then materials/textures, hierarchy, skeletal animation,
lighting, and shadows in separate slices. Use shared immutable resources and
per-instance animation state. Validate collider preparation independently from
visual geometry. Never infer physics from an imported model without authored intent.

Acceptance: fixtures cover missing textures, malformed models, shared instances,
animation restore, import cancellation, and repeated unload/reload. Capture tests
use explicit image tolerances and geometry assertions. CPU-only image results do
not establish hardware performance.

### A5.3 — Implement gameplay HUD and audio

Port the useful declarative HUD model from the TS engine with bounded layout,
text, buttons, and input routing. Render gameplay HUD in the player/capture path,
not as editor-only QML. Route HUD actions into recorded input frames.

Implement voices, buses, volume/mute, spatial positioning, and music transport.
Audio events carry session generation and tick IDs. Restore resets queued one-shots
and rebuilds continuing music state. Support a null device and an offline audio
verification path without requiring speakers.

Acceptance: interactive and captured HUD agree, pointer focus does not leak game
input into editor controls, and restore does not duplicate sounds. Audio device
failure leaves a usable player with a structured diagnostic.

Dependencies: A2.2 permits an early A5.1 prototype. Final A5.1 needs A4.1. A5.2 and
A5.3 integrate with A4.3 before the first playable milestone closes.

## A6 — Agent creation and verification

### A6.1 — Expose native operations through NodeTool

Extend the existing CLI and agent capability registration with explicit native
engine routing. Avoid choosing an implementation from a filename. Keep existing
web games on their current route. Proposed CLI operations are `validate`,
`simulate`, `inspect`, `capture`, `bench`, and `export`, with an engine selector or
unambiguous document identity. Exact flags are defined alongside implementation.

Tools expose schema/capabilities, document transactions, script diagnostics,
simulation assertions, snapshots, captures, and bounded logs. Include revision,
source digests, engine build, manifest digest, and committed tick in run reports.
Provide pagination and field selection for large scenes. Keep transport sessions
private to the host rather than asking an agent to manage raw worker messages.

### A6.2 — Ship the creation loop and examples

Update [native-game](../../packages/system-skills/native-game/SKILL.md),
[native-game-reference](../../packages/system-skills/native-game-reference/SKILL.md),
and [native-game-performance](../../packages/system-skills/native-game-performance/SKILL.md)
when the native tools become available. Clearly distinguish the engine contracts.
Generate compact script declarations and examples from the admitted schema.

Create a fresh obstacle-course fixture inspired by Relay Yard, without requiring
legacy import. It must include a scripted collectible, a moving platform, a gate,
a finish condition, HUD, audio, and a restart path. Use bundled fixtures in CI so
provider credentials and live generation are unnecessary.

### A6.3 — Verify the entire workflow

Acceptance: a deterministic tool driver creates the document, attaches staged
assets, installs QuickJS behaviors, saves/reopens, runs inputs, checks assertions,
restores a snapshot, captures output, and corrects a deliberately faulty script.
Every operation crosses the public host/worker interface. Add a separate agent
trial using the shipped skill and tool schemas. Record failures and tool traces,
but do not make a nondeterministic model run the only release gate.

Dependencies: A2.3 enables A6.1 scaffolding. Full A6.3 requires A3.3, A4.3, and A5.
This completes the first playable, agent-created milestone. The full editor is
not a prerequisite.

## A7 — Qt editor using the same operations

### A7.1 — Build the document workspace

Add hierarchy, inspector, selection, property editing, asset browsing, script
editor, diagnostics, and revision/save state. Use the C++ document operations for
both UI and agent edits. Qt models adapt that state without a second mutable
scene representation. Follow [design](../DESIGN.md), [UX](../UX_GUIDELINES.md), and
[brand](../BRAND.md) guidance, translating named design tokens into QML.

### A7.2 — Add viewport authoring and history

Add translate/rotate/scale tools, snapping, camera navigation, and selection
feedback. One completed drag is one transaction. Preview gestures locally and
commit with the revision they began against. If an agent edits during a drag,
report the conflict and rebuild the preview from accepted state.

Undo and redo create new revisions through inverse operations. They do not rewind
the shared revision number or blindly overwrite a later agent change.

### A7.3 — Define editing during play

Keep the authored document separate from transient gameplay state. Classify each
operation as presentation-only live update or session restart. Initially require
restart for scripts, collider/body changes, hierarchy changes affecting physics,
and prefab structure changes. Applying simulation state back to the document is
an explicit scoped transaction, never an automatic save on stop.

Acceptance: keyboard and pointer authoring, undo/redo, save/reopen, conflict
recovery, and interleaved agent/UI edits pass native UI tests. Cancelling a drag
commits nothing. Script failure leaves diagnostics accessible. Closing with unsaved
drafts follows the same recovery rules as host persistence.

Dependencies: A6.3 → A7.1 → A7.2 → A7.3.

## A8 — Delivery, performance, and later dimensions

### A8.1 — Package the application and player

Bundle pinned runtime libraries, Qt modules, shaders, asset import support, and
license notices. Package the engine worker as a registered runtime asset in the
NodeTool distribution where required. Add startup handshake/version diagnostics,
crash reports, and capability reporting for headless servers without GPUs.

Export immutable player bundles from a validated document and prepared asset
manifest, staging atomically before publication. Exported players contain no
NodeTool credentials and can run without the NodeTool server. Verify installation
on machines without the development dependency tree.

### A8.2 — Establish measured budgets and regression checks

Initial proposed targets are a 60 Hz player at 1080p on a named reference GPU,
simulation p95 below 4 ms, and GPU frame p95 below 12 ms on the representative
course. These are design targets, not measured results. Record CPU/GPU, build,
resolution, scene population, warmup, sampling method, and all subsystem timings.
Measure end-to-end frame p95 separately because subsystem percentiles do not add.

Track script evaluation, JSON transport, checkpoints, physics, asset preparation,
GPU upload, frame time, peak memory, and resource growth. Add bounded large-scene
fixtures for hierarchy traversal, script queries, transaction validation, and
spawn/despawn churn. Repeat reload/restore/capture to expose leaks. Record
baseline budgets in executable fixture configuration and fail regressions against
those budgets on appropriate hardware.

### A8.3 — Implement native 2D as a separate release slice

Use the TS 2D pipeline and document vocabulary for sprites, tilemaps, cameras,
collision, lighting, HUD, and audio. Reuse document operations, QuickJS lifecycle,
agent tools, assets, saves, and diagnostics. D35 selects the current constrained
collision implementation. Jolt does not define the 2D contract.

Acceptance: an agent-created 2D fixture passes the same create/edit/run/restore/
capture loop, and unsupported dimension-specific commands fail before execution.
Complete the feature inventory's 2D entries before calling the whole engine port
complete.

### A8.4 — Deliver browser play after native release

Start implementation only after the native 2D release gate passes. Build the same
document, simulation, QuickJS, 2D solver, and Jolt code for WebAssembly. Browser
input, storage, rendering, and audio are host adapters. Existing TS games retain
their current route. Native schema versions and dimension select the native
runtime explicitly, with no filename inference or legacy simulation fallback.

The dependency probe proves a Node-hosted QuickJS/Jolt executable, not the full
session or browser player. The implementation cards below close that gap.

#### A8.4.1 — Extract the shared dispatcher and WebAssembly interface

Move document/session operation handling and bounded request deduplication from
[Worker.cpp](../../native/game/src/host/Worker.cpp) into a portable module under
`native/game/src/service/`. Keep stdio framing, the queue, and native threads in
the stdio adapter. Native and browser tests must exercise the same dispatcher.

Preserve the versioned request/result envelope, request IDs, revision conflicts,
structured diagnostics, and message budgets. The operation set is `hello`,
`validate`, `open`, `inspect`, `transaction`, `undo`, `redo`, `start`, `step`,
`frame`, `snapshot`, `restore`, `reload`, and `close`. Advertise actual supported
schemas, dimensions, build identity, limits, and `snapshotRestoreScope` in `hello`.
Keep cancellation transport-specific rather than claiming a synchronous browser
call can process another worker message while it is running.

Add `native/game/src/browser/Bridge.cpp` with this initial C interface:

```cpp
uint32_t ng_create();
int ng_dispatch(uint32_t context, const char* request, uint32_t requestBytes);
const char* ng_response_pointer(uint32_t context);
uint32_t ng_response_length(uint32_t context);
void ng_destroy(uint32_t context);
```

Context handles identify dispatcher ownership, not C++ addresses. Dispatch accepts
one bounded UTF-8 JSON envelope and makes one bounded response available. The
context owns response memory until its next dispatch or destruction. The JS
adapter copies the response before another call, frees its own request allocation,
and refreshes heap views after memory growth. Reject stale handles, oversized
lengths, invalid UTF-8/JSON, and requests against destroyed contexts. Catch C++
exceptions inside the interface and return the existing error envelope. No
exception, Jolt object, QuickJS value, or borrowed pointer reaches application JS.

Create a dedicated browser CMake entry point and reusable target definitions.
Do not cross-compile the top-level native application target unchanged. Preserve
the current ownership recorded in [CMakeLists.txt](../../native/game/CMakeLists.txt):
`game_document` includes the authoritative `World2D` admission implementation,
and `game_core` includes both spatial implementations and `WorldRtti.cpp`.
Keep only the Jolt-owning `World.cpp` translation unit without RTTI. Compile
`WorldRtti.cpp` normally, so the shared polymorphic interface remains valid.

Pin the tested Emscripten SDK and retain the dependency archive pins, collision
layer width, and Jolt deterministic configuration. Apply one tested C++ exception
mode to every relevant translation unit and the final link. Keep Qt, native audio
devices, installation rules, stdio hosting, and native threading outside the browser
target. Start with a single-thread browser runtime without shared-memory hosting
requirements. Verify steady-clock watchdogs and cryptographic snapshot-key entropy
in actual browser workers. Unavailable entropy must fail startup rather than use
the deterministic game seed.

Acceptance: Node-hosted WASM and a real browser both create, edit, run, inspect,
and close 2D and 3D sessions through the C interface. Native and WASM dispatcher
fixtures agree on admission, errors, revisions, and retry outcomes. Malformed
requests and stale handles fail without corrupting a second live context. Assert
that the browser target has no Qt/native-device linkage and that fixtures are
nonempty.

#### A8.4.2 — Implement browser hosting, recorded input, and JSON saves

Add a browser-only entry point under
`packages/game-runtime/src/native-browser/`. Do not import the Node-only
[native service](../../packages/game-runtime/src/native.ts) or stdio client.
Publish shared request/result and frame schemas from the native protocol entry
point, then use them in browser messages, native host tests, tools, and renderers.
The initial application interfaces are:

```typescript
interface NativeBrowserSession {
  request(request: NativeRuntimeRequest, signal?: AbortSignal): Promise<NativeRuntimeResponse>;
  close(): Promise<void>;
}
interface NativeFrameBase {
  readonly tick: number;
  readonly generation: number;
  readonly sceneId: string;
  readonly events: readonly NativeGameEvent[];
  readonly presentationEvents: readonly NativePresentationEvent[];
  readonly hostRequests: readonly NativeSaveRequest[];
}
type NativeFrame = NativeFrame2D | NativeFrame3D;
interface NativeJsonSaveStorage {
  read(scope: NativeSaveScope, slot: string): Promise<NativeJsonSaveRecord | null>;
  write(scope: NativeSaveScope, slot: string, record: NativeJsonSaveRecord): Promise<void>;
}
```

These names describe proposed generated/public types, not unvalidated records.
`NativeFrame2D` adds the admitted 2D entities, resolved camera, lighting,
backgrounds, HUD, and audio state. `NativeFrame3D` adds the admitted 3D entities,
camera, HUD, and audio state. Preserve native tuple/object conventions per
dimension. Validate messages at the host seam and exclude private session keys,
native pointers, and asset-loader state. The session factory owns worker/module
startup, then returns the small request/close interface.

Each worker owns its WebAssembly instance and dispatcher. Serialize operations
per session, bound queued requests and aggregate input/output bytes, and route
responses by request ID. Record keyboard, pointer, touch, and gamepad actions at
the tick they enter simulation. Maintain fixed simulation ticks and bounded
catch-up work. Visibility changes and overruns must have documented pause/drop
behavior. Exact stepping for tests never drops requested ticks. Replacing an old
visual frame must not discard its unconsumed audio, particle, or storage output.

Propagate AbortSignal cancellation before dispatch. Native interruption/deadline
checks remain active during a call. If an in-flight call cannot finish within its
host deadline, terminate the worker and report loss of the live session. Do not
promise to resume its authenticated checkpoint in a replacement worker. Reopen
the document and use an explicit recorded-input replay when requested.

Implement script-defined JSON save/load using the intent of
[script-saves.ts](../../packages/game-runtime/src/script-saves.ts),
[player-saves.ts](../../packages/game-runtime/src/player-saves.ts), and
[game-saves.ts](../../packages/protocol/src/game-saves.ts). Reuse the existing
scope, slot, JSON-data, request, queue, slot-count, and load-delivery limits rather
than inventing larger native limits. The native guest commands contain `kind`,
`scope`, `slot`, and save `data`. They have no `snapshot` option. Reject unknown
fields. A native durable record contains a format version and script-defined data,
with distinct `progress` and `settings` scopes. Scripts decide what game progress
means and how to apply loaded data. Loading does not restore entities, physics,
timers, RNG, or the QuickJS heap automatically.

Stage requests during script execution and expose them only after a successful
tick commit. A failed tick emits no storage request. The host consumes the ordered
batch once, performs bounded asynchronous storage outside simulation, and tags
each request with generation, tick, and sequence for deduplication. Completion
retains that identity and the live session generation. Completed loads enter a later
recorded tick's `input.loaded` in order, subject to the existing per-frame limit.
Missing or invalid records yield null data with a host diagnostic. Recording those
responses makes replay independent of actual storage timing. A replay consumes
recorded responses and performs no external reads or durable writes.

Provide IndexedDB and native atomic-file adapters over the same JSON contract,
plus memory storage for CLI/tests. Namespace by full game ID, engine contract,
scope, and slot. Validate stored records on read, bound the queue, enforce slot
limits atomically, and test storage-denied and quota failures. Reset/restore drops
undelivered responses from earlier generations. A write already started may
finish, but its old completion cannot inject data into the new live generation.
Keep authenticated snapshot inspection/restore as a separate operation, restricted
to its originating live session and WebAssembly instance.

Acceptance: tests cover input-edge ordering, pause/visibility, backpressure,
out-of-order worker replies, abort before dispatch, worker termination, and cleanup.
Native/browser save fixtures cover progress/settings separation, failed-tick
rollback, JSON/slot/queue limits, denied storage, delayed loads, reset/restore, and
recorded-load replay. Reloading the page can read valid script-defined progress,
while a snapshot from the previous instance is rejected.

#### A8.4.3 — Render native 2D/3D frames and consume committed output

Add `packages/game-renderer/src/native-cpp/` with an explicit native frame renderer
entry point. Native documents never enter legacy `createGameSession` or
`createGameSession3D`. Reuse lower-level rendering modules only when their
contracts match. Do not build a fake legacy document merely to satisfy a renderer.

For 3D, test an adapter for native transforms, admitted primitive shape/color/size
and model asset bindings, committed animation time, target-based cameras, the
native lighting and shadow defaults, and HUD. The current authored contract
samples model clip zero. Additional authored light, model-selector, and clip
selection fields require a separate contract expansion. If the
adapter requires changing legacy renderer semantics, implement a dedicated native
entry point over its lower-level Three.js modules and keep both routes explicit.

For 2D, cover the current
[Scene2D](../../native/game/src/render/Scene2D.cpp) contract: atlas frames, trim and
source-canvas anchors, rotation/scale, flips, motion facing, animation selection,
stable layers, blend modes, tilemaps, backgrounds, camera zoom, lighting, and HUD.
The shared session already resolves animation and camera state. Do not recompute
gameplay state from wall time or introduce a second collision implementation.
Keep geometry/layout rules in a portable draw-plan module when both Qt and browser
need the same calculations. Test declared pixel differences instead of silently
omitting unsupported effects.

Prepare a closed asset map with IDs, digests, sizes, dependency lists, and import
settings. Reuse native asset admission through a bounded virtual filesystem when
needed, then release staging and preparation caches that the browser no longer
uses. Browser image/model loaders may resolve only verified manifest bytes.
Enforce the same admitted model subset, trim bounds, decoded image budgets, and
resource limits. Reject external runtime URLs, missing dependencies, malformed
assets, and mismatched digests before starting play. Do not keep duplicate native
and JS model graphs indefinitely.

Web Audio consumes generation/tick-tagged committed events, with explicit audio
unlock, buses, spatial positioning, and restored continuing music state. Restoring
a live snapshot must not replay old one-shots. Rendering and audio have one owner
for resource creation/destruction. Pause on graphics-context loss, retain usable
simulation state, rebuild resources, and report capability failures visibly.

Acceptance: real-browser fixtures cover native sprite/tilemap/trim/lighting output,
textured and skinned models, camera/HUD hit testing, audio events, context loss,
resize, pause, disposal, and repeated reload/capture. Compare semantic scene bounds
and explicit image tolerances against native captures. Software renderers prove
correctness only.

#### A8.4.4 — Export installed browser artifacts and expose the target

Add an explicit web target to native export commands and tools. Keep desktop as
an explicit supported target and report unavailable browser artifacts when an
installed profile omits them. Resolve generated WASM/module/worker/player files
through the package asset registry. Never require a source checkout, Emscripten
SDK, NodeTool server, provider key, or external CDN on the exported player's host.

Stage a validated document, runtime artifacts, closed asset manifest, notices,
HTML, and styles into a temporary sibling directory. Validate hashes and complete
staging before atomic publication. Refuse traversal, unsafe destination reuse,
partial output, and undeclared runtime fetches. Document HTTP/HTTPS requirements,
Content Security Policy, browser capabilities, and actionable startup errors.
Keep native and legacy web exports on their existing engine routes.

Add a pinned-SDK build script, generated-artifact drift/identity checks, installed
asset declarations, and CI provisioning. The browser bundle metadata must show
that native play excludes the legacy TS simulation, Rapier, and the legacy
QuickJS WASM package. Register browser source/export paths and a nonempty browser
selfcheck in the harness and affected-test selection.

Acceptance: export from the installed package, serve the output as static files,
and run both dimensions without the checkout or NodeTool process. Deliberate
missing/altered runtime and asset files fail the smoke check. Assert the network
request set is closed and that cancellation/failure leaves no published partial
bundle. CLI and agent tests exercise the web target and preserve desktop export.

#### A8.4.5 — Gate release on semantic fixtures and measurements

Run the same created/edited 2D and 3D documents, seeds, recorded inputs, and
assertions through desktop and browser native sessions. Require exact discrete
state, command admission, and ordered-event behavior where the contract promises
it. Define physics numeric tolerances and supported build configurations explicitly.
Do not promise byte-identical cross-platform world snapshots. Verify same-live-
session continuation separately on each host and reject foreign/restarted-instance
snapshots before native restore code consumes them.

Extend the independent agent trial to create, correct a faulty script, save/reopen,
run assertions, verify replay, export, and capture both browser dimensions through
the shipped tools. CI fixtures use owned local assets and need no live providers.
Measure compressed download size, module/asset initialization, peak/steady memory,
memory growth, simulation and script latency, asset loading, and completed frame
time. Record browser, build mode, resolution, CPU/GPU, warmup, and sampling method.
Report GPU-only timing as unavailable when it is not measured. SwiftShader and
llvmpipe results cannot satisfy a hardware frame-rate gate.

Acceptance: mandatory repository checks and native/browser/export suites pass on
the same source state. Checks reject deliberately invalid input and fail on empty
fixture discovery. Save concrete reports and reproduction fixtures. Disable the
scheduled milestone continuation only after its release checks pass. Retiring
legacy TS simulation remains a separate product decision.

#### A8.4 ownership and dependencies

| Owner | Exclusive implementation area | Required coordination |
| --- | --- | --- |
| A8.4-A | `native/game/src/service/`, `src/browser/`, browser CMake and portable target definitions, C interface tests | Own shared dispatcher extraction and preserve native worker behavior. Agree protocol/frame schemas with B before exporting functions. |
| A8.4-B | `packages/protocol` browser runtime/save contracts and generated metadata, `packages/game-runtime/src/native-browser/`, native/browser JSON save adapters | Own browser worker/session and recorded-input semantics. Coordinate additive Session host-request output with A and assets/output consumption with C. |
| A8.4-C | `packages/game-renderer/src/native-cpp/`, native frame adapter, browser asset/audio/HUD/render tests | Own browser presentation and closed loader behavior. Coordinate any portable draw-plan extraction with A and exported layout with D. |
| A8.4-D | Native web exporter, CLI/tool target wiring, package asset declarations, build scripts, CI/harness selection, installed export tests | Own artifact staging and release orchestration. Consume A/B/C interfaces rather than changing them independently. |

Freeze the request/frame/save contracts first. A8.4.1 precedes full session hosting.
Worker lifecycle and presentation may then proceed together against shared
fixtures. JSON save support must work on native and browser hosts before browser
save/reload acceptance. Atomic export integrates the installed artifacts after
both dimensions play correctly. Release measurement follows functional checks.
No material product decision is required to start these cards. Exact renderer
reuse is resolved by the adapter fixture, and broader networking, arbitrary host
imports, multiplayer rollback, or portable full-world restoration are outside this
milestone.

Dependencies: A6.3 enables packaging work. Native release requires A7 and A8.1–A8.2.
A8.3 and A8.4 are subsequent releases with their own completion gates.

## Verification and implementation sequencing

Each task card can require multiple small PRs. Separate contract/fixtures,
implementation, and host integration when doing so leaves a coherent tested
change. Do not add disabled placeholders that claim a capability before it works.
The critical dependency order is A1 → A2 → A3 → A4 → A5/A6 → A7 → A8.
A5's minimal render probe can begin after A2.2 to expose Qt/GPU risk early.

Every native feature needs tests through the public interface, including malformed
input and cleanup. Use CTest for C++ behavior, Vitest for TS host integration, and
native Qt UI tests for editor behavior. Add sanitizer builds for ownership and
threading. Fuzz document, protocol, snapshot, and prepared-asset decoders with
bounded inputs. Keep rendering correctness tests separate from GPU performance.

Register native source paths and selfchecks in
[the harness registry](../../packages/cli-harness/src/harness/registry.ts). Add native path
selection to [test selection](../../scripts/test-affected.mjs) with its selection
tests. Native-only edits must execute native tests rather than relying on unrelated
TS suites. Prove new audits fail with deliberately invalid fixtures and inspect a
nonempty fixture set.

Implementation PRs follow [Development Standards](../DEVELOPMENT_STANDARDS.md).
Run environment setup and package builds before the repository checks:

```bash
scripts/setup-agent-env.sh
npm run build:packages
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

Also configure/build the native targets and run their selected CTest suites. Once
the scaffold exists, document exact presets in `native/game/README.md` and register
the wrapper commands in the harness. GUI checks on Linux run through Xvfb or an
offscreen platform. Record the actual graphics device and never report software
rendering as a hardware performance pass. Run `npm run check:agents-docs` whenever
agent instruction files or shipped skills change. Documentation-only changes need
link validation rather than application builds.

## Risks and release evidence

| Risk | Required evidence or mitigation |
| --- | --- |
| R1. QRhi renderer scope exceeds the port budget | A5.1 proves capture and primitives early. A5.2 establishes imported/skinned model performance before advanced effects. Keep a documented Qt compatibility exception. |
| R2. QuickJS isolation becomes too expensive | Measure fresh-realm setup and data transport. Optimize preparation and targeted world queries first. Never preserve hidden mutable state merely to improve a benchmark. |
| R3. Replay omits mutable state | Midpoint restore fixtures include characters, input edges, timers, RNG, lifecycle queues, scene changes, and source/build identities. |
| R4. Native scripts or decoders compromise the host | Use capability-limited worker staging, VM limits, fuzzing, sanitizers, and OS isolation for server workloads. No credentials enter the game worker. |
| R5. Two implementations disagree on authoring | C++ owns transaction semantics. TS schemas generate admission artifacts and declarations, with shared fixtures guarding drift. |
| R6. Editor work delays agent creation | A6 closes the public creation-and-verification loop before A7 starts. |
| R7. Port scope silently drops existing capabilities | A1.1 maintains an enumerated feature inventory. Native 3D, native 2D, and browser play have distinct completion gates. |

The native 3D release evidence consists of an exported standalone game, its source
document and prepared assets, recorded inputs, assertions, snapshot-resume report,
rendered captures, audio verification, agent tool trace, editor interaction tests,
platform installation results, and measured performance report. A successful
window launch alone does not complete the port.
