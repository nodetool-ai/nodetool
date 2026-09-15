# PRD: AI Video Production in Guided Creation Flows

Status: Draft  
Repository baseline: `b6aee4380cc77a7a05a39562d8b90dda476b5777`  
Suggested repository path: `docs/creation-flows/ai-video-production-prd.md`  
Companions: [Guided Creation Flows](prd.md), [Native AI Media Editing](../native-media-editing/prd.md), [Script–Storyboard Link](../script-storyboard-link/prd.md).

## 1. Summary

NodeTool will extend its existing Video, Storyboard, and Script guided flows with three AI-video production capabilities:

1. Turn a creative brief and product references into an editable production plan.
2. Generate performances using reusable character entities, script speakers, and voice bindings.
3. Plan and generate product shots and b-roll, with multiple takes per shot or beat.

These capabilities belong inside the existing flows and editors. There is no separate AI-ad application, avatar library, project type, or workflow graph.

The creation experience remains:

**Idea → review the plan → choose production settings → generate → existing editor.**

Inside the editor, generated results are candidates. The creator previews them, accepts a take or draft, and uses native media editing to refine accepted media. Setup completion, generation completion, and take acceptance are separate events.

## 2. Problem and intended outcome

The guided flows already organize creation, but generating independent clips and optional voiceover is insufficient for a coherent AI-generated video. A product ad needs persistent references, deliberate shot selection, a distinction between narration and visible speech, and a way to compare alternatives without losing the accepted cut.

The outcome is an editable production, not merely a rendered MP4. A creator can make a product video featuring a recurring character, choose among product and lifestyle shots, replace an unsatisfactory performance, and continue editing in the ordinary timeline.

Primary acceptance scenario: create a 15-second vertical product ad with one recurring character, an on-camera line, and two reference-conditioned product or lifestyle shots. Review the plan before media generation, request alternatives for one shot, preview the draft, accept it, generate another take, and edit one accepted clip without changing other uses of the source.

Reference consistency is a production requirement to evaluate, not a promise that an entity guarantees identical model outputs.

## 3. Existing foundation and gaps

These observations describe the inspected baseline, not completed functionality promised by this PRD.

| Existing foundation | Relevant gap |
| --- | --- |
| Video uses `Idea / Beats / Look` and lands directly in the timeline. Its formats already include ads, explainers, and vertical social clips. | Enrich the existing plan and execution path instead of adding an ad wizard. |
| Storyboard uses `Idea / Story / Entities / Look` and lands in the board. | Add production requirements and performance generation without changing the board-first route. |
| Script uses `Idea / Format / Voices`. Speakers already have `entityId` and voice bindings; line takes retain text and voice snapshots. | Connect these inputs to visual performances instead of creating another actor/voice model. |
| The Storyboard Entities step selects, suggests, creates, and assigns reusable references. | Carry resolved reference assets through generation, not just entity names in prompts. |
| `generateFromBeats()` creates text-to-video clips and separate text-to-audio voiceover clips, with beat-to-clip links. | Dispatch different production treatments and attach multiple takes to stable destinations. |
| Native media editing specifies inactive candidates, preview-only audition, explicit acceptance, immutable provenance, and local apply. | Share these semantics with new production actions rather than inherit automatic activation. |

Source files are listed in §15.

## 4. Scope and boundaries

### 4.1 Included

The release includes structured creative context on existing documents; product and character reference bindings; editable beat/shot production requirements; one executable reference-conditioned visual generation route; one executable audio-driven on-camera performance route; one to three candidate takes per selected beat or shot; draft audition and explicit acceptance; recipe-based New take; and parity between UI and agent operations.

The performance route may comprise multiple provider calls. It is not considered implemented merely because an adapter accepts a prompt containing dialogue.

### 4.2 Excluded

Long-video highlight extraction, podcast clipping, automatic reframing, public galleries, publishing, campaign-scale variant matrices, dubbing, automated creative scoring, new music infrastructure, and automatic effect selection are excluded.

Website research is not required for the first release. URLs may be retained as references, but NodeTool must not imply that it inspected a page it did not fetch. Initial production uses supplied descriptions, images, entities, and approved facts.

This PRD does not implement masked character replacement, extension, or other deferred native-editing actions. It does not change unrelated Image, Workflow, or Game flows.

### 4.3 Relationship to existing PRDs

Guided Creation Flows owns the setup shell, document-backed progress, entry points, and editor destinations. This PRD owns richer authoring inputs and generative production. Native AI Media Editing owns transformations of existing media and destination-specific candidate application.

Shared candidate infrastructure is implemented once. Native editing's initial Edit video release remains independently shippable; it does not wait for actor generation or this complete production release.

Within this scope, explicit candidate acceptance supersedes older creation-flow copy that treats browsing a generated video version as immediate selection. Existing first-still generation, unrelated uploads, and unrelated Script operations are not globally redefined by this PRD.

## 5. Product decisions

| ID | Decision |
| --- | --- |
| D1 | Extend existing flows. Do not introduce a Generate Ad wizard or mandatory Script → Storyboard → Video journey. |
| D2 | Review text before generating production media. Text planning and separately requested reference generation may have their own disclosed costs. |
| D3 | Preserve one authoritative owner for each editable fact. Linked scripts own words; entities own visual identity; shots and beats own visual/performance direction. |
| D4 | Separate editorial purpose from visual treatment. A hook may be a product close-up, not necessarily a talking head. |
| D5 | Resolve capabilities before spend. No silent substitution of narration for lip-sync, text-only generation for required references, or image animation for video editing. |
| D6 | All video/performance results from these production actions land as inactive candidates. Completion never accepts them. |
| D7 | Keep setup, jobs, and acceptance independent. A document may be done with setup while jobs or reviews remain incomplete. |
| D8 | Capture resolved generation inputs before dispatch. Live document IDs or prompt hashes alone are insufficient provenance. |
| D9 | Changes remain local. A timeline take selection does not rewrite a storyboard, entity, script line, or another clip instance. |
| D10 | UI and agents call the same validation, submission, landing, audition, and apply operations. No second execution or history system. |

## 6. Guided-flow experience

### 6.1 Choose the existing route

| Entry | Journey | Result |
| --- | --- | --- |
| Video | Idea → Beats → Look | A planned timeline with generated candidates, no mandatory storyboard. |
| Storyboard | Idea → Story → Entities → Look | A storyboard whose shots can be rendered, reviewed, and explicitly assembled. |
| Script | Idea → Format → Voices | Authored lines and voice choices, with explicit handoff into visual production. |

Do not force a creator through another setup flow after a handoff. Carry the existing context and start at the first unanswered decision. Existing blank-entry escape hatches remain.

### 6.2 Idea: capture creative context

Extend the existing brief and reference controls with optional product name/description, audience, objective, tone, approved claims, prohibited claims, and required product references. Hide ad-specific fields for other video types unless requested.

Use existing document storage: Video and Script setup fields, and the Storyboard document beside its existing brief. Do not create a standalone CreativeBrief document. Keep these fields editable after setup through document settings or the inspector.

Distinguish product references from character and style references. A supplied product photo must not be replaced by a newly generated approximation without an explicit choice. Only approved claims enter production prompts as asserted product facts. Models must not invent customer endorsements or personal experiences for synthetic actors.

Changing context marks dependent plans as needing review; it does not discard the current plan or regenerate media automatically.

### 6.3 Story or Beats: review the production plan

Extend the existing plan review, retaining its editable text, ordering, timing, and explicit re-plan action. Each beat or shot may specify:

| Property | Meaning |
| --- | --- |
| Editorial purpose | Hook, problem, demonstration, proof, CTA, or general story beat. |
| Visual treatment | Actor to camera, product close-up, lifestyle b-roll, or general generated scene. |
| Speech mode | None, off-camera narration, or on-camera speech. |
| References | Selected product, character, location, and style assets. |
| Timing | Intended playable duration and, where applicable, linked speech timing. |
| Alternatives | One to three requested candidates; default one. |

A shared vocabulary and validation contract serve both beats and shots. They do not become a new universal plan document or replace their existing ordering and link fields.

Automatic b-roll planning occurs here. Suggestions must describe visible action and identify relevant references. Re-planning returns the current edited plan as context and cannot silently remove user-pinned references, linked dialogue, or accepted media. Structural changes require review and explicitly identify removals.

Plan freshness must include all inputs actually read by the planner, including creative context and reference revisions, not just the brief string. Persist the fingerprint so reload does not treat an obsolete plan as current.

### 6.4 Entities and voices

Reuse the Storyboard Entities step. Add compact character/product selection to Video's existing review or Look controls rather than adding a mandatory fourth step.

A character is an existing entity, not a new Actor type. Existing Script speakers bind to it through `entityId`; their voice binding remains the source for linked speech. A reusable visual identity does not globally force one voice onto every production.

For linked dialogue, the script owns text and line-level delivery defaults. A shot or beat may carry a local visual/performance override without changing the script. Unlinked Video beats may own their local speech text and voice choice without requiring a hidden Script document.

Selecting or creating reference imagery and generating a spoken performance are separate actions. Reference-image generation has an explicit cost/consent step wherever it is offered; merely entering Entities does not trigger paid generation.

### 6.5 Look: resolve the production plan

Show output format, compatible generation choices, character/voice summaries, requested take counts, and the cost estimate for the entire selected batch, including required intermediate calls.

Cloud uses managed defaults and a small compatible choice set. Local mode retains provider/model controls. Both enforce identical requirements. A remembered model is only a default when eligible.

Before Generate, block missing required references, missing voice/audio inputs, inaccessible assets, unsupported treatments, and invalid timing. Explain the specific blocker. Unknown pricing must be labeled, not displayed as zero; never manufacture estimates.

The creator may generate a clearly identified supported subset, leaving other slots unresolved. NodeTool may not silently omit unsupported shots. Any material change to inputs, take counts, or execution route invalidates the reviewed submission estimate.

Keep the Storyboard flow's existing initial destination and still-first behavior. Performance and clip generation are explicit board actions after setup, with their own estimate; Generate your storyboard must not silently become a more expensive full-video batch.

## 7. Production execution

### 7.1 Shared preparation, specialized execution

Compile reviewed authoring inputs into validated production requests. Reuse existing generation records, queue, storage, cancellation, recovery, and provider adapters. Fixed orchestration may have dependent stages, but it does not create a user workflow graph or new job system.

| Treatment | Required execution behavior |
| --- | --- |
| Reference-conditioned product or lifestyle shot | Resolve approved references and pass them as provider inputs. Text mentions alone do not satisfy required-reference validation. |
| Narrated visual | Generate or reuse the visual and narration independently, then align them within the planned slot. |
| On-camera performance | Use a supported route that produces a visibly speaking character synchronized to the selected audio. |
| General generated scene | Use an eligible generation task with the references required by the plan. |

The initial on-camera implementation supports one real audio-driven route. First resolve or synthesize the line audio, measure it, then generate the performance from that exact audio and character reference. Native audiovisual generation and additional routes can follow behind the same contract.

A failure in performance generation must not fall back to a silent portrait with voiceover. Retain successful intermediate assets so an explicit retry can reuse them without paying for unrelated stages again.

### 7.2 Timing and audio contract

All cross-component timing uses milliseconds. Provider units are converted at adapter boundaries. Record requested duration, measured source duration, and the intended playable window separately.

Validate generated speech against the slot before dispatching dependent video calls. When it does not fit, offer an explicit rewrite/revoice, a supported timing adjustment, or a reviewed plan-length change. Do not silently truncate speech, stretch unrelated audio, or ripple an accepted cut.

Longer visual output may retain unused handles. Shorter output is not acceptable for the slot unless the creator explicitly changes the timing. Changing plan length updates dependent estimates before further generation.

A performance candidate records its video, authoritative audio, and associated word timings. If the provider embeds the same speech in the video, suppress duplicate playback; if audio is separate, preserve synchronization. Accepting a performance applies its linked local media and caption mapping together.

Changing only voice or speech audio does not claim to update the visible performance. Mark synchronization dependencies as outdated until a compatible replacement exists. One local performance acceptance never silently changes a Script line's selected take.

### 7.3 Multiple takes

Support one to three candidates per selected beat or shot in the first release. Give each variation a stable index and request identity before dispatch. Completion order does not determine numbering or acceptance.

Multiple takes share an editorial destination, not duplicate clips. Each may use a distinct variation/seed or direction recorded in its snapshot. Global batch size and concurrency obey existing server/workspace limits; frontend controls are not enforcement.

Retry failed candidates independently. Cancel unsent dependent stages after parent failure or cancellation. A completed sibling remains available and is never regenerated implicitly.

## 8. Candidate lifecycle and acceptance

### 8.1 Durable preparation and landing

Before provider dispatch, persist the target slots, production batch/request identities, captured inputs, and setup completion where applicable. Do not mark the document generated or accepted at this point. A failed persistence step dispatches nothing.

The editor opens after durable preparation. Pending clips or shots identify what is being generated. Closing the browser must not lose the mapping between a job and its destination.

Results land through the existing destination-specific take adapters. Timeline versions, storyboard versions, and script takes may retain their native schemas; they share lifecycle rules, not necessarily one identical storage type.

Landing changes candidate state only. It does not change active assets, selected takes, trim fields, accepted-media status, or timeline structure. Where existing media lacks a baseline take, preserve it before offering replacement candidates.

### 8.2 Preview take and Preview draft

Preview take auditions one candidate without changing document state. Preview draft constructs a temporary candidate-selection map over the new production slots. Missing results are visibly unresolved, never disguised with arbitrary footage.

The preview map uses explicit candidate IDs. It does not follow completion order, and a late result cannot replace a candidate currently being auditioned. Choosing different candidates updates preview only.

Audition state is excluded from autosave, export, and document synchronization. Final export resolves accepted media only and blocks unresolved required slots with an actionable report.

### 8.3 Use take

Use take validates the candidate, source mapping, current target, dependencies, and timing, then applies it as one destination-specific undoable edit.

Preserve placement, track, effects, transforms, links, and unrelated audio. Map replacement source time according to the candidate contract rather than retain invalid old trims. For an intentional speech replacement, update only the associated audio and captions, not unrelated layers.

Undo restores the prior accepted state. It does not delete generated candidates or cancel already incurred generation work.

### 8.4 Use draft

Use draft accepts the explicit preview selection for new, still-unaccepted slots from one production batch in one document. It is not automatic approval of an entire job group. On a storyboard, eligibility refers to the video selection, not the presence of a selected keyframe still.

All selected candidates must be ready and valid. Validate the complete selection and target preconditions before one atomic document mutation. If any selected slot was deleted, edited incompatibly, or acquired accepted media, apply nothing and request a refreshed selection. The creator may explicitly choose a smaller ready subset.

The operation cannot overwrite accepted work, accept future completions, mutate multiple documents, or adopt the first result to finish. One undo restores every affected slot. Once a slot has accepted media, subsequent alternatives use Use take.

### 8.5 New take and AI Edit

| Action | Inputs | Meaning |
| --- | --- | --- |
| New take | Complete saved generation snapshot or explicitly chosen current authoring inputs | Generate an alternative from a creation recipe. |
| Change line delivery | Script/local speech binding and explicit direction | Generate an alternative speech delivery; video synchronization is a separate dependency. |
| Edit video | Existing take plus Native Media Editing source context | Transform the selected media window. |

Labels remain distinct. Imported media does not acquire New take merely because a model can describe it. When a saved recipe is incomplete or its required model is unavailable, report that condition; selecting another route creates a new reviewed snapshot, not an allegedly identical replay.

## 9. Data ownership and provenance

### 9.1 Authoring fields

Add optional, versioned schema fields to existing documents and beat/shot records. Proposed concepts are `creativeContext` and `production`; final casing follows each host's existing conventions through one shared validated contract.

Creative context holds product description, audience, objective, tone, approved/prohibited claims, and reference bindings. Production holds editorial purpose, visual treatment, speech mode/binding, local direction, reference requirements, and requested take count.

| Data | Authoritative owner |
| --- | --- |
| Linked words and line delivery defaults | Script line. |
| Linked voice selection | Script speaker, subject to existing line overrides. |
| Unlinked Video speech | The beat's local speech binding. |
| Visual identity and reference descriptions | Existing entity. |
| Visual action, timing intent, and local performance direction | Shot or beat. |
| Accepted media in the cut | Timeline clip instance. |
| Submitted resolved inputs and outputs | Existing generation record and its immutable snapshot. |

### 9.2 Immutable generation snapshot

Extend existing render/generation provenance rather than introduce a parallel recipe database. Every candidate must resolve a snapshot containing:

- Schema version, request/batch/variation identity, authenticated owner/project, and exact destination.
- Originating beat/shot and relevant authoring revisions or fingerprints.
- Operation, resolved prompts, required capabilities, and execution route.
- Entity IDs plus the actual resolved reference asset IDs and descriptor snapshots.
- Exact speech text, direction, voice settings, and selected audio/take identity where applicable.
- Resolved provider/model identifiers, parameters, output format, and timing contract.
- Parent take and Native Media Editing source context for transformation requests.

Store measured results, cost, and execution status on the corresponding generation/result records. Do not rewrite the submitted snapshot at completion. Provider task IDs may be attached to execution records as they become known.

A logical snapshot is frozen before dispatch. For dependent stages, persist the selected intermediate asset IDs and the fully resolved child request before dispatching that child. Thus the performance record identifies the exact audio actually supplied.

Do not put credentials or expiring signed URLs into recipes. Resolve access server-side from authorized asset IDs. Same inputs mean replayable intent, not guaranteed identical stochastic outputs.

### 9.3 Handoffs and migration

Storyboard assembly carries accepted media, timing, links, and generation provenance into new timeline instances. Unselected candidates remain on their originating document and can be imported explicitly; they do not become silently shared mutable selections.

Script handoffs preserve line/speaker/entity identities. Converting local speech to linked Script speech is explicit and establishes one text owner; do not keep two independently editable copies.

Creative context copied between documents includes origin provenance, not automatic live synchronization. Later upstream changes mark dependent inputs outdated and never overwrite accepted media.

Missing new fields preserve existing behavior. Documents without setup still open in their editors. Legacy takes with incomplete provenance remain playable and editable where eligible; recipe-based regeneration stays unavailable. Add schema round-trip tests so new fields are not stripped by API adapters.

## 10. Recovery, concurrency, and authorization

Capture destination identifiers at submission. Browser focus, project switching, and mutable global model defaults cannot redirect results or change their provenance.

Use stable idempotency keys for logical requests and deduplicate landing by request/output identity. Recovery reattaches to existing provider jobs rather than generating again. If remote submission status is ambiguous and the provider lacks idempotency, require reconciliation or explicit retry instead of blindly repeating a paid call.

If a destination is deleted, retain the generated asset under its generation record without recreating the slot. If its production inputs change, retain the candidate with an outdated-input warning; applying requires validation against the current target.

Each editor operation checks current document preconditions. A separate native-editing job may coexist only where existing concurrency rules allow it; this PRD does not relax native editing's one-active-edit constraint.

Enforce owner/project authorization on submission, asset/reference access, recovery, landing, and apply. A client-supplied entity, destination, or asset ID is not proof of access. Production is private by default; sharing requires a separate action.

## 11. Agent contract

Expose planning, request preparation, generation submission, candidate inspection, and acceptance through the existing capability/tool architecture. Browser and headless adapters call the same implementations.

“Generate three alternatives” submits a reviewed batch and returns its job and candidate identifiers. It does not apply results. “Use candidate two for this shot” authorizes one validated application. Ambiguous creative direction does not authorize changing entities, voices, or accepted media throughout the project.

Headless preview returns a preview artifact or manifest without mutating accepted selections. Batch acceptance requires the same explicit candidate map and target preconditions as the UI.

## 12. Implementation slices and tasks

These are independently reviewable slices, not additional dependencies of native editing's Edit video release. The full production feature is complete only after all three selected capabilities work end to end.

| Slice | Tasks | Exit condition |
| --- | --- | --- |
| A. Shared contracts and candidate semantics | A1: Add optional authoring schemas and ownership rules. A2: Extend immutable generation snapshots. A3: Factor candidate landing/audition/apply for these production callers. A4: Reconcile version-click copy in both PRDs. | Fake generation lands an inactive candidate; preview is non-persistent; apply and undo preserve the cut. |
| B. Brief, plan, and reference-conditioned visuals | B1: Extend Idea fields. B2: Add production fields to beat/shot planning and review. B3: Include context/references in persistent plan fingerprints. B4: Dispatch one real reference-conditioned route with server preflight. | Product and lifestyle candidates use the approved reference assets and remain editable in their existing destination. |
| C. Characters and performances | C1: Reuse speaker/entity bindings and local speech. C2: Implement one audio-driven performance adapter. C3: Validate speech duration before dependent video spend. C4: Handle audio/caption synchronization and local apply. | A character delivers the selected line using the recorded audio; no duplicate audio or silent narration fallback. |
| D. Alternatives and draft acceptance | D1: Add per-shot take counts and batch estimate. D2: Add stable variation IDs, partial retry, cancellation, and durable recovery. D3: Add Preview draft and atomic Use draft. D4: Enable New take from complete snapshots. | Alternatives survive reload, a draft is explicitly accepted in one operation, and later results never replace it. |
| E. Handoff and parity | E1: Carry provenance through storyboard assembly and Script handoff. E2: Expose shared operations to agents. E3: Add integration, migration, and live-adapter gates. | Equivalent UI/headless requests have equivalent destinations and provenance; both existing creation routes pass. |

## 13. Acceptance tests

| ID | Required test |
| --- | --- |
| AC1 | Existing Video, Storyboard, and Script entries and blank escape hatches remain; no new document type or mandatory chained wizard appears. |
| AC2 | Plan generation produces editable text only. Reference/media generation occurs only through explicit scoped actions. |
| AC3 | Required product/character asset IDs reach the fake provider payload. A text-only adapter is rejected before spend. |
| AC4 | A Script speaker's entity/voice and line override resolve correctly; unlinked Video speech requires no hidden Script document. |
| AC5 | The performance adapter consumes the recorded audio. Playback emits it once and captions follow that audio's timings. |
| AC6 | Speech that exceeds its slot blocks dependent video generation until the creator makes an explicit timing or copy choice. |
| AC7 | Three alternatives produce three candidates on one destination, regardless of completion order, with no automatic activation. |
| AC8 | Preview take and Preview draft produce no persisted document change; final export ignores audition state. |
| AC9 | Use draft is atomic within one document. A conflicting selected target applies nothing; undo restores the complete prior state. |
| AC10 | Use take preserves placement and unrelated editorial fields and remaps source time correctly; short results are not silently stretched. |
| AC11 | Editing an entity, script line, or brief during generation does not alter submission provenance or automatically replace accepted work. |
| AC12 | Reload after durable preparation, during dependent generation, and after remote completion recovers once without duplicate slots, candidates, or avoidable provider spend. |
| AC13 | Deleted targets are not recreated; foreign-project assets and targets are rejected server-side. |
| AC14 | Storyboard assembly carries accepted media and provenance; later edits remain local to their originating surface. |
| AC15 | Legacy documents and unrelated flows retain behavior; new schema fields survive persistence round trips. |
| AC16 | UI and headless requests pass the same payload, capability, candidate, and apply contract tests. |

The primary vertical integration test follows the 15-second scenario in §2 through plan review, reference-conditioned generation, on-camera speech, reload, draft audition, explicit acceptance, New take, native Edit video, and undo.

Fake providers establish state and lifecycle correctness. At least one live supported adapter per required production route must also pass smoke tests with real media. Human review checks recognizable product/character references, intelligible synchronized speech, usable cuts, and editable output. Claims about quality are limited to evaluated routes and material.

## 14. Release and measurement

Release the feature only when all acceptance tests pass and both direct-Video and board-first journeys work. Disabled capabilities must state their missing prerequisite; documentation or an enum value alone cannot enable a feature.

Measure progression from plan review to generation, generation to first preview, and preview to acceptance; per-stage failure and retry rates; accepted versus discarded candidates; timing-mismatch frequency; and observed spend versus disclosed estimates. Segment technical metrics by execution route and model. Establish baselines before setting improvement targets.

Telemetry must not record raw product briefs, dialogue, prompts, or reference URLs by default. Use identifiers, durations, status codes, counts, and approved operational metadata.

The release is not complete when NodeTool can output a video. It is complete when a creator can plan it in an existing guided flow, preserve identity and product references, compare generated alternatives, accept an editable cut, and revise one part without destabilizing the rest.

## 15. Repository touchpoints and source baseline

All paths below refer to the baseline listed at the top. They are implementation anchors, not evidence that the proposed work is already complete.

| Area | Existing paths |
| --- | --- |
| Shared flow and policy | `docs/creation-flows/prd.md`; `web/src/components/setup/SetupFlow.tsx` |
| Video setup | `web/src/components/setup/video/useVideoSetupFlow.ts`; `web/src/components/setup/video/formats.ts`; `web/src/components/setup/video/LookStep.tsx` |
| Beat production | `web/src/hooks/timeline/useGenerateFromBeats.ts`; `web/src/hooks/timeline/useTimelineDirectGenJob.ts` |
| Storyboard setup and references | `web/src/components/setup/storyboard/useStoryboardSetupFlow.ts`; `web/src/components/setup/storyboard/EntitiesStep.tsx` |
| Storyboard generation | `web/src/hooks/storyboard/useGenerateShot.ts`; `packages/agents/src/capabilities/storyboards.ts` |
| Script ownership | `packages/protocol/src/api-schemas/scripts.ts`; `web/src/components/setup/script/useScriptSetupFlow.ts` |
| Candidate/editing contract | `docs/native-media-editing/prd.md`; `packages/timeline/src/takes.ts`; `packages/timeline/src/generative.ts`; `web/src/components/timeline/Inspector/ClipVersionHistory.tsx` |
| Handoff and prompt composition | `packages/timeline/src/storyboard.ts`; `packages/protocol/src/shot-prompt.ts`; `docs/script-storyboard-link/prd.md` |

Required companion edits: clarify candidate preview versus acceptance in Guided Creation Flows; cross-reference this PRD's initial-production and New take contracts from Native AI Media Editing; retain the latter's independent P0 scope and source-window rules.
