# Graph reading: connections to prioritize

This document preserves one reading of the [feature interplay graph](index.html): which proposed connections would help NodeTool's existing parts work together better, and what we could reuse to build them. It is a saved interpretation, not an implementation commitment or an automatically updated graph analysis.

This ranking asks which connections would make existing NodeTool features more useful together, and which implemented parts could support them. It is a design recommendation based on the map and targeted source inspection, not measured demand, effort estimates, or a runtime audit.

## Reading and conclusions

The main opportunity is to make connection behavior predictable across surfaces: what follows a source change, what stays pinned, which edits survive, and when a change starts work. Shared controls and explicit asynchronous boundaries then connect more of the system without replacing its existing execution models.

| Priority | Graph features being connected | Result to aim for | Existing foundation |
| --- | --- | --- | --- |
| O1 | Common binding controls + Follow semantic source → workflows, sketches and timelines | Change a source and update selected consumers while preserving local edits. | Generated clip/layer bindings, document references, shot reconciliation and retained game construction. |
| O2 | Assets and source documents → Dependency impact view | Explain affected outputs before regeneration. | Dependency hashes, stale-layer handling, provenance and reference collectors. |
| O3 | App controls + workflow inputs → shared typed parameters | One setting drives several inputs through a consistent run snapshot. | App state, invocation ownership and typed inputs. This proposal is not yet represented in the map. |
| O4 | Native games → Async game / AI bridge → agents and workflows | Scene interactions invoke asynchronous work and receive controlled, replayable results. | Game events, capability contracts, jobs, cancellation and asset staging. |
| O5 | Streaming speech + collections + agent tools → Assistant runtime | Coordinate conversation, background work and presentation through interruption. | Microphone/audio streams, speech providers, tools, retrieval and run records. |

Recommended starting point: O1's selected-take transfer together with a narrow, read-only O2 impact view. For interactive games or museum guides, bring O4 forward alongside the text-first assistant work in O5. The sections below preserve the evidence, proposed additions and first proof for each recommendation.

## O1. Preserve source relationships across editors

**First priority.** Combine the map's Common binding controls and Follow semantic source proposals into one user-facing capability: use a result, follow its source, pin a revision, or detach deliberately.

Example: a storyboard shot is regenerated after its image was used in a workflow and its clip was trimmed in a timeline. The creator can update the chosen dependents without rebuilding the connections or losing the edit.

Reuse:

- [Sketch binding construction](../../../packages/websocket/src/trpc/routers/sketch.ts) and [timeline binding construction](../../../packages/websocket/src/trpc/routers/timeline.ts): source workflow, chosen output, local parameters and generated versions.
- [Shot reconciliation](../../../packages/timeline/src/reassemble.ts): semantic ownership and preservation of existing shot placement and trims.
- [Game authoring reconciliation](../../../packages/game-runtime/src/authoring-reconcile.ts) and [checked draft application](../../../packages/models/src/game.ts): baseline, overrides, conflicts and stale-candidate rejection.

New work is an explicit source-selection and revision-policy contract, source resolvers for the supported document kinds, and consistent controls. The game reconciliation implementation is a domain-specific precedent, not a function to apply unchanged to arbitrary documents.

The inspected [Send to workflow](../../../web/src/hooks/useSendMediaToWorkflow.ts) path transfers media constants. That is valid for “use this result,” but the payload does not retain “follow this shot's selected take.” Start with that concrete boundary, rather than migrating every reference type.

**First proof:** change one shot's selected take, refresh a bound workflow input and an assembled timeline, preserve trims, and verify that a pinned consumer remains unchanged. Following a source should mark work stale. Paid regeneration remains an explicit action unless a separate trigger policy authorizes it.

## O2. Explain downstream impact before regeneration

Connect the map's Dependency impact view to O1. Start read-only: “used by,” “source changed,” “pinned,” and “missing source.” Only then add selective regeneration.

Reuse:

- [Timeline hashes](../../../packages/timeline/src/dependencyHash.ts) and [sketch hashes](../../../packages/image-editor/src/dependencyHash.ts): operation inputs, output selection and source timestamps contribute to freshness checks.
- [Stale-layer regeneration](../../../web/src/hooks/sketch/useRegenerateStaleLayers.ts): preflight, cancellation, job settlement and failure handling already exist within sketches.
- [Timeline bundle reference collectors](../../../packages/project-services/src/timeline-bundle.ts): enumerate certain asset, workflow, storyboard, script and job references.
- [Asset provenance](../../../packages/models-core/src/schema/assets.ts): existing links back to producing work.

These are partial inputs, not an existing project-wide dependency index. Archive reference collection also does not determine update policy or content freshness. Audit each consumer's hash inputs before treating a hash as proof that a dependency is current.

**First proof:** a read-only impact view over workflows, generated sketch layers and timeline clips explains the effect of one source change. It distinguishes missing evidence from confirmed freshness. An entity-wide dependency view remains a research question until its links are enumerated.

## O3. Bind shared parameters without confusing values with streams

This proposal is missing from the current visual map. It is developed in the [shared variables and input bindings plan](../shared-variables-input-bindings.md).

Example: a Mini App control changes the language or seed used by several workflow inputs. The next run receives one consistent snapshot. A control edit does not silently launch several generations.

Reuse:

- [App runtime state](../../../packages/app-runtime/src/state.ts): current variables, invocation ownership and rejection of superseded output updates.
- [Workflow input definitions](../../../packages/core-nodes/src/nodes/input.ts): existing input types and external parameters.
- Existing workflow inputs/outputs and local clip/layer overrides as the initial binding targets.

Preserve the existing [VariableChannel](../../../packages/runtime/src/variable-channel.ts). Its `first()` returns the first publication and `stream()` replays history before following new values. It cannot become a latest-value store without changing existing behavior.

**First proof:** one app control edits two workflow inputs through a typed binding. Run captures their values once. A later edit affects the next run, and an older run cannot overwrite a newer result. General cross-document and realtime binding can follow after this boundary works.

## O4. Connect live game interactions to asynchronous AI work

This is the largest change in which kinds of experiences the parts can build together. A visitor selects an exhibit, an agent retrieves information, and the scene presents the result or performs an allowed demonstration.

Reuse:

- [Game lifecycle and state](../../../packages/game-runtime/README.md), [script event payloads and targets](../../../packages/protocol/src/game-script-events.ts), and existing scene actions.
- [Capability contracts](../../../packages/agents/src/capabilities/types.ts), existing workflow execution, jobs and cancellation.
- Existing game asset staging for generated media accepted into a scene.

New work is a host-level request/result adapter. It needs request identity, scene/session ownership, cancellation, late-result rejection and a recorded acceptance point for replay. Existing internal script events are useful contracts, but do not by themselves establish a host-injected asynchronous event path.

[Game scripts](../../game-engine/scripts.md) are synchronous and cannot await arbitrary network or workflow calls. Keep asynchronous work outside ticks. Reuse the engine's semantic actions instead of allowing the model to write physics-owned state.

**First proof:** select an object, execute one existing retrieval workflow, accept its result into a bounded scene action, and replay the accepted response without another model call. Leave the scene before completion and confirm the old result is ignored.

## O5. Coordinate speech, tools and presentation in an assistant session

The map's Assistant runtime proposal builds on the same asynchronous boundary concerns as O4. Its [existing plan](../realtime-virtual-agents.md) already calls for reuse of workflows, capabilities, jobs and collections.

Reuse:

- [Microphone capture](../../../web/src/hooks/useRealtimeAudioStream.ts), [chunk processing and output](../../../packages/audio-nodes/src/nodes/realtime-audio.ts), and [streaming TTS](../../../packages/elevenlabs-nodes/src/nodes/realtime-tts.ts).
- Agent tools, retrieval collections and existing run records.
- The app runtime's invocation-ownership behavior as a precedent for rejecting obsolete output, without assuming it handles speech playback interruption.

The missing piece is coordinated session behavior: turns, interruption, ordering and eligibility of tool results, plus media presentation. A tool may finish successfully after its speech response becomes obsolete. Cancellation of execution and cancellation of presentation therefore need separate decisions.

**First proof:** interrupt a spoken answer while a retrieval/tool call is running. Stop stale playback, retain valid completed work, and prevent the obsolete response from speaking later. Follow the assistant plan's text-first execution-reuse sequence before adding voice or a live scene.

## Recommended sequence

Start with O1's selected-take transfer and O2's read-only impact view over that path. O3 is a separate bounded improvement connecting apps and workflow configuration. These make existing work easier to change and reuse.

For interactive installations or AI-driven games, prioritize O4 alongside the text-first part of O5. Reuse the same capability invocation and result identity where the contracts fit, while keeping game simulation and assistant conversation as separate state owners.

A universal graph, global reactive state bus, automatic cross-project regeneration, and unrestricted realtime feedback are not prerequisites for these experiments. Define each supported boundary in terms of value or event or stream, identity, revision, ownership and execution policy.

## Verification boundary

Implementation files linked here were inspected. The recommendation adds no product behavior and does not claim that every proposed connection is absent repository-wide. No runtime or participant tests were performed in this pass. The map has not been modified to present these recommendations as implemented features.
