# Native Timeline AI Workflows

This checklist extends the original native editor scope to AI workflows.
[PLAN.md](PLAN.md) covers the prototype milestones and
[PLAN-GAPS.md](PLAN-GAPS.md) covers the earlier editing parity work. Their
original AI exclusions do not define completion for this extension. The source
viewer named F10 in PLAN-GAPS is a separate editing feature.

## Status and completion rule

The baseline native editor can load and preserve raw document fields, resolve
server assets, save with conflict recovery, and receive external document
changes. Those facilities are prerequisites. They do not establish generation,
assistant or linked-document parity.

The implementation uses the existing server contracts. Its deterministic tests
exercise serialized requests, responses, asset resolution and document edits.
Those tests do not establish behavior at a paid provider or a physical audio
device. The status table separates these boundaries.

## Implementation and evidence

"Implemented and verified" below means verified with deterministic fixtures.
The application build and registered UI checks are recorded separately. Normal
tests do not submit paid provider requests.

| Capability | Status | Implementation and evidence |
|---|---|---|
| Direct generation and model/reference selection | Implemented and verified | [GenerationController](../src/ai/GenerationController.cpp), [toolbar](../qml/ai/GenerateToolbar.qml), [catalog](../src/ai/catalog/ModelCatalogController.cpp). `tst_ai_controller`, `tst_ai_transport`, `tst_ai_catalog` and `tst_ai_catalogserver` cover requests, constraints, assets and entities. |
| Queuing, cancellation, failure, retry and reopen recovery | Implemented and verified | Per-request durable records precede submission. Lookup/reconnect does not resubmit paid work. [Controller tests](../src/ai/tst_generationcontroller.cpp) cover cancellation, late replies and recovery. |
| Candidate review, explicit acceptance and take history | Implemented and verified | [Take operations](../src/ai/Take.cpp) and controller asset resolution preserve prior takes, source mapping and undo. Tests include trimmed, sped-up and slowed sources, deleted targets, unresolved media and large histories. |
| Workflow-bound clip execution | Implemented and verified | [WorkflowGeneration](../src/ai/WorkflowGeneration.cpp) uses workflow jobs, `jobs.cancel` and persisted `jobs.get` outputs. `tst_ai_workflow` and controller tests cover scoped recovery and inactive candidates. |
| AI edit, image-to-video, extension and line delivery | Implemented and verified | [Request builders](../src/ai/ClipRequests.cpp), [extension edits](../src/ai/Extension.cpp) and [clip controls](../qml/ai/ClipOperations.qml). Controller tests and the `ai_oracle` / `ai_take_oracle` differential checks exercise request and document behavior. |
| Timeline assistant and conversation history | Implemented and verified | [AssistantSession](../src/aiassist/AssistantSession.cpp) and [bridge](../src/aiassist/AgentBridge.cpp) use existing chat/tool contracts. `tst_assistantsession` covers undoable edits, generation forwarding, approvals, history pagination and exact resource prefixes. Only advertised native tools are available. |
| Linked script editing, voicing, extraction and synchronization | Implemented and verified | [AssistController](../src/aiassist/AssistController.cpp), [ScriptVoicing](../src/aiassist/ScriptVoicing.cpp) and [LinkedWorkflow](../src/aiassist/LinkedWorkflow.cpp). Tests cover CAS, recovery, deduplication, source changes and one undo for explicit timeline changes. External refreshes retain the web's non-undo reconciliation behavior. |
| Storyboard assembly and shot workflows | Implemented and verified | [StoryboardAssembly](../src/aiassist/StoryboardAssembly.cpp), [ShotWorkflow](../src/aiassist/ShotWorkflow.cpp) and [ShotPlan](../src/aiassist/ShotPlan.cpp). Fixtures cover assembly, rendering requests, inactive candidates, take acceptance, links, derivation and stale followers. Automatic style/entity reference enrichment is covered below. |
| Transcript beats, captions, voicing and reflow | Implemented and verified | [TranscriptBeats](../src/aiassist/TranscriptBeats.cpp), [BeatVoicing](../src/aiassist/BeatVoicing.cpp) and [TranscriptRequest](../src/aiassist/TranscriptRequest.cpp). Tests cover authoring, word edits, cuts, fillers, staged speech/ASR results, recovery, media resolution and undo. Transcript and storyboard differential checks compare the web helpers. |
| Registered editor entry points | Implemented and verified | The assembled offscreen UI suite passes against the actual editor's Generate registry entry, shared inspector controller, replay controls, candidate review, script/assistant workspaces and playback duration binding. |
| Physical preview audio and display behavior | Implemented but unverified | The opt-in [`window-checks.sh --candidate-preview`](../scripts/window-checks.sh) check requires a real display, audio output and loopback capture. It is not part of silent headless verification. |
| Real provider execution | Implemented but unverified | Requests stay on the server. No paid provider run is claimed by the fixture tests. |
| Workflow inputs and saved-graph cost presentation | Implemented and verified | [Workflow inputs](../src/ai/WorkflowInputs.cpp), [inspector controls](../qml/ai/WorkflowClip.qml) and [cost estimates](../src/ai/WorkflowCost.cpp) cover editable values, model and media selection, lists and saved-graph pricing. Remote file and folder paths use text entry. Media-list thumbnails and direct uploads, Hugging Face downloads and recommendations, and grouped image-size presets remain absent. The public [preflight response](../../../packages/protocol/src/api-schemas/sdk-lifecycle-v1.ts) exposes a total and unknown nodes, not per-node prices. The [server calculation](../../../packages/websocket/src/sdk/sdk-static-preflight-service.ts) uses the saved graph, so overrides can change the final cost. |
| Automatic shot style/entity reference enrichment | Implemented and verified | [ShotWorkflow](../src/aiassist/ShotWorkflow.cpp) reads project-scoped entity assets before submission. [ShotPlan](../src/aiassist/ShotPlan.cpp) applies the web's cast selection, style identity, descriptor/edit-model routing, reference ordering and conditioning hashes. The [shot oracle](../src/aiassist/shot-plan.test.mjs) passes 23 request and snapshot comparisons and two asset-marker boundary comparisons against the actual web helpers in the assembled build. |
| Timeline script authoring controls | Implemented and verified | [ScriptAuthoring](../src/aiassist/ScriptAuthoring.cpp), [controller](../src/aiassist/AssistController.cpp) and [Story workspace](../qml/storyworkspace/StoryWorkspaceEditor.qml) provide linked script creation, line addition, multiline text and section/speaker headings. `tst_scriptauthoring` compares web fixtures and controller tests exercise CAS. |
| Assistant planning and production review | Implemented and verified | [AssistantSession](../src/aiassist/AssistantSession.cpp) stages Director plans and prepared batches for approval. [ProductionReview](../src/aiassist/ProductionReview.cpp) reviews exact shot requests before rendering and resolves individual shot placement before one timeline edit. Assembled suites cover approval snapshots, durable batches, cancellation, recovery, terminal RPC errors and stale document guards. The assistant differential suite compares production validation and compilation with the actual protocol and web helpers. |

## Scope distinctions and remaining UI differences

Story workspace follows the web's searchable document lists,
[speaker-labelled script rows](../../../web/src/components/script/ScriptLineRow.tsx)
and [storyboard shot cards](../../../web/src/components/storyboard/ShotCard.tsx).
Shot fields open inside their card to fit a narrow dock. Thumbnail requests
use authorized asset metadata and leave the document unchanged. Generation
and production services are separate from this panel.

The web timeline's [Script panel](../../../web/src/components/timeline/TimelineScriptPanel.tsx)
adds lines, removes empty lines and edits their text. Cast editing and line
reordering belong to the standalone script editor. They are not missing
controls from that timeline panel. Its Open script action remains available.

The dedicated Look and Review steps belong to
[VideoSetupHost](../../../web/src/components/setup/video/VideoSetupHost.tsx)
and its [creation flow](../../../web/src/components/setup/video/useVideoSetupFlow.ts).
The timeline assistant separately exposes planning and production through
[its bridge](../../../web/src/hooks/timeline/useTimelineAgentBridge.ts).
Those assistant operations are included here.

| Capability | Status | Boundary |
|---|---|---|
| Workflow input convenience controls | Still missing | Server path browsing, media-list thumbnails and direct uploads, Hugging Face downloads/recommendations, and image-preset category grouping are not ported. Parameters remain editable and stored assets remain selectable. Generic `value` inputs use JSON as the web does. |
| Per-node and override-sensitive workflow prices | Still missing | The existing public preflight API returns a saved-graph total and unknown node IDs. It does not expose priced items or apply overrides to pricing. The native UI identifies this limit. |
| Direct shot price quotation | Still missing | Existing public APIs provide no native quote contract. Review shows Price unavailable rather than zero, while retaining the exact request, model, duration and references for approval. |
| Instance-pinned scratch WebSocket sessions | Still missing | [HTTP instance verification](../src/server/ServerIdentity/ServerIdentity.cpp) binds proof and mutation to one connection. The existing WebSocket transport has no equivalent proof, so AI commands refuse that scratch-only connection mode. Normal authenticated server connections are supported. Tests use isolated deterministic transports. |

## Capability checklist

These broad web capabilities define the comparison scope. The status table
above distinguishes implemented paths from the remaining parts of each row.

| ID | Capability and Web reference | Server contract | Expected persistent changes and acceptance |
|---|---|---|---|
| A1 | [Generate panel](../../../web/src/components/timeline/TimelineGeneratePanel.tsx), [dialog](../../../web/src/components/timeline/TimelineGenerateDialog.tsx), [references](../../../web/src/components/timeline/TimelineReferencesField.tsx) | `generate_media` over the authenticated WebSocket. Native negotiates the server's text mode after its initial MsgPack acknowledgment, as the existing native sync transport does. Model discovery and references use existing server resources. | Video, speech and music create a generated clip at the playhead on a compatible unlocked track, creating a track if absent. Preserve provider, model, prompt, binding kind, duration, video aspect/resolution, speech voice and image/entity references. Select the clip. Show submission errors and progress. |
| A2 | [Direct generated clip](../../../web/src/components/timeline/Inspector/DirectGenClipPanel.tsx), [job lifecycle](../../../web/src/hooks/timeline/useTimelineDirectGenJob.ts) | `generate_media`, `cancel_generation`, `lookup_generations`, `rpc_response` and generation progress. | Regenerate the intended sequence and clip, append a take, and maintain `currentAssetId`, the media asset alias and generation metadata. Preserve references and request provenance. Reopen and reconnect recover unresolved requests without duplicate submission or duplicate takes. |
| A3 | [Workflow generated clip](../../../web/src/components/timeline/Inspector/GeneratedClipPanel.tsx), [workflow runner](../../../web/src/hooks/timeline/useGenerateClip.ts) | Existing workflow fetch and job execution, job progress and `jobs.cancel`. This is distinct from direct generation. | Bind workflow inputs and output selection, expose editable inputs and cost, run/cancel, append the output take and update generation freshness. A direct generation panel alone does not cover this row. |
| A4 | [AI edit](../../../web/src/components/timeline/Inspector/AIEditClipPanel.tsx), [media-edit lifecycle](../../../web/src/hooks/timeline/useTimelineDirectGenJob.ts) | `generate_media` with media-edit request data and frozen source context. | Submit an instruction against the selected source asset and references. Attach successful output as an inactive candidate. Applying it is an explicit undoable action. The source asset and current take remain active until acceptance. Cancel and retry retain request identity and source provenance. |
| A5 | [Image to video](../../../web/src/components/timeline/Inspector/ImageToVideoPanel.tsx) | `generate_media`, kind `image-to-video`, source image asset and model settings. | Create a video clip over the image span on a video track above it, preserve `sourceClipId` and source-image relationship, and start the job. Keep the source image. Validate the source asset and supported model/duration settings. |
| A6 | [Extend](../../../web/src/components/timeline/Inspector/ExtendClipPanel.tsx), [extension operations](../../../web/src/lib/timelineExtension.ts) | `generate_media` with extension data, durable generation lookup, asset metadata for returned duration. | Freeze the source range and start/end direction. Attach the result as an extension candidate. Keep cut, consume gap and ripple application are explicit choices with the matching timing semantics. Recover unresolved requests. Refuse stale source context and locked targets. |
| A7 | [Line delivery](../../../web/src/components/timeline/Inspector/LineDeliveryPanel.tsx), [revision](../../../web/src/hooks/timeline/useLineDeliveryRevision.ts) | Existing media-edit generation contract. | Revise a linked line delivery with the appropriate source context and instruction. Preserve the baseline take and line relationship while the candidate runs. Do not replace the active source merely because generation completed. |
| A8 | [Clip take history](../../../web/src/components/timeline/Inspector/ClipVersionHistory.tsx) | Generated assets and persisted clip versions. Timeline version history is a separate `timeline.versions` contract. | Show successful takes and their provenance, apply, rename and delete with the same restrictions as Web. Refuse deletion of the active or only take. Extension takes require the timing choice. Undo and save/reopen retain the selected take and candidate history. |
| A9 | [Assistant panel](../../../web/src/components/timeline/TimelineAgentPanel.tsx), [bridge interface](../../../web/src/components/timeline/timelineAgentBridge.ts), [bridge behavior](../../../web/src/hooks/timeline/useTimelineAgentBridge.ts) | Existing assistant chat transport, thread history and tool dispatch. `ui_timeline_*` live-editor tools are distinct from server document tools. | Send a focused timeline reference, `timeline_assistant` source and a send-time selected-clip snapshot. Stream replies and tool results, cancel the turn, reopen history, and apply tool edits to the intended open document through undoable operations. Cover generation/edit/take tools as well as ordinary editing tools. |
| A10 | [Script](../../../web/src/components/timeline/TimelineScriptPanel.tsx), [linked script](../../../web/src/hooks/timeline/useLinkedScript.ts) | `scripts.list`, `scripts.create`, `scripts.get`, `scripts.update` and script authoring services. | Create or select a linked script, persist the timeline/script relationship and retain script edits. Derivation, voicing and generation use their existing services. Displaying script text from timeline JSON does not establish script editing parity. |
| A11 | [Storyboard](../../../web/src/components/timeline/storyboard/TimelineStoryboardPanel.tsx), [shot](../../../web/src/components/timeline/shot/TimelineShotPanel.tsx), [shot link](../../../web/src/hooks/timeline/useClipStoryboardLink.ts) | `storyboards.get`, storyboard persistence/render services and linked-shot take synchronization. | Show linked boards and shots, edit shot fields on the board, render and select takes, link/unlink clips and linked audio, derive shots from clip ranges, and retain backreferences. A local shot list does not replace the separate storyboard resource. |
| A12 | [Transcript](../../../web/src/components/timeline/TranscriptPanel.tsx), [store](../../../web/src/stores/timeline/TimelineTranscriptStore.ts) | `generate_media` for speech followed by `transcribe_audio` for word timing. | Add, edit, delete and reorder beats atomically through transcript/clip operations. Voice a beat, probe audio duration, transcribe and reflow. Keep word captions associated with the indexed clip and respect clip/track locks. Retain transcript and clips across undo and save/reopen. |
| A13 | [Beat planning](../../../web/src/hooks/timeline/usePlanBeats.ts), [generation from beats](../../../web/src/hooks/timeline/useGenerateFromBeats.ts) | Existing Director/assistant planning and production generation contracts. | Review a beat plan and cost before paid generation, acknowledge prepared destinations, create video/voice/music clips with production request provenance, and retain partial failures without losing successful outputs. |

## Shared contracts and native boundaries

The protocol authority is
[`ws-commands.ts`](../../../packages/protocol/src/ws-commands.ts) and
[`messages.ts`](../../../packages/protocol/src/messages.ts). Direct media
requests carry `request_id`. Replies use `rpc_response` and generated asset
IDs. Durable lookup uses `lookup_generations`. Do not invent a
`timeline.generate` tRPC procedure. Workflow-generated clips use the workflow
runner rather than the direct-generation command.

[`timeline.ts`](../../../packages/websocket/src/trpc/routers/timeline.ts)
owns timeline persistence and versions. Script and storyboard resources have
[separate](../../../packages/websocket/src/trpc/routers/scripts.ts)
[routers](../../../packages/websocket/src/trpc/routers/storyboards.ts).
Rendering media is not equivalent to saving the clip that refers to it.
Generation status must distinguish provider completion, output availability
and attachment to the destination.

Native integration builds on
[`ServerClient`](../src/server/ServerClient.h),
[`TimelineJson`](../src/model/TimelineJson.cpp), the edit registry and
[`external sync`](../src/server/sync/). Preserve unknown root, track and clip
JSON while changing owned fields. Use server asset IDs and the asset cache for
preview. Reuse server authentication. Provider credentials remain on the
server.

## AI generation and deterministic editing

Splitting, trimming, moving, changing gain, adding fades, selecting a take,
linking a document and editing transcript text are deterministic edits. The
assistant may request them, but they do not require a media-generation call.
A generated candidate is persistent media plus provenance. Accepting it is a
separate timeline edit. Script and storyboard authoring mutate separate
resources as well as timeline links.

## Required evidence

- A14: Fake-server tests inspect the actual serialized commands and reply
  correlation. Include failure, timeout, cancellation, progress and recovery.
  A fake-server pass establishes protocol handling, not provider behavior.
- A15: Document tests compare full JSON before and after success, failure,
  candidate acceptance, undo, redo and save/reopen. Include unknown fields,
  two sequences, a deleted destination, locked clip/track and source changes
  while a request runs. A late result must not resurrect a deleted clip,
  overwrite another sequence or erase a newer take choice.
- A16: Drive the app's registered panel and inspector entry points offscreen
  or under Xvfb. Verify that ordinary selection and playback context reaches
  each action and that errors are visible. A standalone panel test does not
  establish application wiring.
- A17: Record a controlled server/provider run separately before claiming
  end-to-end generation. Record the command, request identity, generated asset,
  destination clip/take and persisted result. Never infer this evidence from
  model availability or a simulated media response.


## Verification record

Run Node-based checks with the version from `.nvmrc`. Native builds use
`nice -n 10 cmake --build native/timeline/build-f10 -j 2`. Headless native
checks use `QT_QPA_PLATFORM=offscreen`, `QT_QUICK_BACKEND=software` and
`ctest -j 2`. Device checks remain opt-in.

- A18: The final frozen source build passed for the application, timeline
  operations, AI oracles and selected native test targets. All 38 selected
  headless suites passed, including the registered editor UI. The frozen copy
  prevents concurrent edits from changing C++ types during compilation.
  Its F10 source hashes match the implementation in the main checkout.
  An earlier live-tree build mixed objects compiled before and after a
  concurrent `TimelineTypes.h` change and produced controller/session
  crashes. The fresh snapshot build and passing tests supersede that run.
- A19: The final frozen application passed the default render-plan comparison
  across 17,015 layers with
  `node native/timeline/scripts/plan-conformance.mjs --bin
  native/timeline/build-f10/nodetool-timeline`. An earlier examples comparison failed
  with 268 problems: 38 stale exclusions, two exclusion-baseline mismatches
  and 228 Voltra matrix differences. These concern existing motion examples.
- A20: An earlier complete operation-conformance runner reported 272 passes and
  163 problems, including unbuilt unrelated helper executables and existing
  `moveClip` case 20 and `rateStretchClip` case 26 store mismatches. This does
  not establish a passing whole-editor operation gate. The assistant web
  differential suite passed all eight tests, including protocol validation,
  production compilation and full request snapshots.
- A21: The final assembled suites include 25 controller tests, seven take
  tests, the registered UI suite, 20 assistant session tests and 27 shot
  workflow tests. Regressions cover delayed lookup followed by undo with zero
  storyboard writes, script draft retention after failed CAS, terminal shot
  RPC failures, journal isolation, neutral candidate preview, active-take
  protection when versions share an asset, and undo. Earlier temporary-storage
  quota failures were resolved before the final frozen build.
- A22: Mandatory repository checks passed: `npm run test:affected`,
  `npm run typecheck`, `npm run lint` and
  `npm run dev:nodetool -- harness gate --base origin/main`.
  Node-based runs used the version from `.nvmrc`. The browser-live fixture
  used isolated backend and web ports, not the user's running server.

Provider execution, a real display, physical audio, sanitizer runs and the
whole native test suite have not been verified by these checks. The optional
candidate-device test source passed a syntax check with the actual build
flags but its display/audio execution remains unverified. No test writes to
the user's server on port 7777.
