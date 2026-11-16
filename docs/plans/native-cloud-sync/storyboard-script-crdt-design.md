Editable source: [https://claude.ai/artifact/4xQimkm7Uhd2MA5PSTz887](https://claude.ai/artifact/4xQimkm7Uhd2MA5PSTz887). This file is an export, so edit the Claude Doc and export again.

# CRDT design for storyboards and scripts

Nov 15, 2026 · @Matthias Georgi

## Summary

This document extends revision 3 of "CRDT design for the timeline document" to scripts and storyboards. The three documents refer to each other: a storyboard names a script and assigns its lines to shots, and timeline clips name the line or the shot they play. A timeline that merges per property next to a script and a board that are replaced as whole documents would leave those references to a different, weaker rule.

This is revision 3, of 2026-11-16. Revision 2 answered the first review of this design. Revision 3 answers the review of the four documents together. It writes the PRD's amendments that concern this design into the rules, corrects the current result after an undone pick, names the type of every field that recovery has to rewrite, and defines one fixture suite, version 2, for all three profiles. The changes are listed under Changes in revision 3. The change log from revision 1 follows it. Revision 1 was approved for prototyping, not for implementation, and that status is unchanged.

The design reuses the timeline core: registers that keep concurrent values, existence vectors, normalized transactions, undo by `retract`, recovery by whole transactions, log truncation only. It adds seven extensions. One of them, the deferential generated write, adds an operation variant to the shared core and is marked for separate acceptance (C4, Q7). No merge or display rule changes.

Nothing here is implemented or executed. The fixture outcomes are worked by hand. The repository findings are those of revision 1. On 2026-11-16 I checked F15 again against main at `11a6da4a` and added F17 and F18. The other findings were not checked again. The manifest field lists in E5 are proposals, because the prompt compilers have not been read.

| Code | Decision |
| --- | --- |
| D1 | One core, three document profiles. A profile declares entity types, registers, register groups, which references touch their target, and which containers delete their members. |
| D2 | Text is a whole-value register. A line's text, a shot's action and a brief are each replaced as a unit, and concurrent edits to one of them are retained as alternatives. There is no character-level merge. |
| D3 | Ordered children use an order key that keeps one person's run of inserts together. The allocator has a stated contract and property tests. |
| D4 | A keyed entity has an id derived from what it stands for. Two people who create the same one concurrently create one entity. |
| D5 | A script line is assigned to a shot by an assignment entity keyed by the line. A line is therefore in at most one shot by construction. |
| D6 | Documents do not share causality. A reference to an entity in another document is a stable id. A reference whose target is absent is legal state and produces a notice. No rule deletes or rewrites across documents. |
| D7 | Cross-document facts are derived by pure link functions over two resolutions. Facts about more documents come from a scoped lookup. |
| D8 | Takes and renders are results of generation requests. They are written without reviving their parent and kept when it is deleted. |
| D9 | Deleting a linked script no longer clears the board's link fields in a second write. This changes shipped behavior and awaits a decision. |
| D10 | Scripts and storyboards get a version history. They have none today. |
| D11 | A new take or render is added to linked timeline clips as a version. It no longer changes clip length or moves later clips. Confirmed in review. |
| D12 | "Referenced line exists" moves from a save error to a notice. Awaits a decision. |
| D13 | The current result changes only through a pick or through a request that asked for adoption and saw the selection that is still in place. Completion of a job never changes it by itself. The same rule governs timeline clip versions. |
| D14 | Results and pushed versions have an immutable payload with a byte-equality rule, a deterministic rule for unequal payloads, and an order taken from the request and not from the delivering transaction. |
| D15 | Status is stored per generation request and derived for display. |
| D16 | Generated writes keep the causal context of what they read, and their values defer to a person's concurrent value. Rebasing is a separate, explicit step. |
| D17 | Whether a result matches is decided by a versioned input manifest with three outcomes: known match, mismatch, cannot verify. |
| D18 | Legacy saves are converted against the projection the client was sent, with a rule per lossy field. |
| D19 | A split or a join records a relation, and an unsettled relation is shown on every line it names. |

### Changes in revision 3

| Code | Problem in revision 2 | Change | Section | Fixtures |
| --- | --- | --- | --- | --- |
| CH1 | Creating a request started a generation. A request is replicated content and is received, copied and kept in versions (PRD amendment A16). | A request is content and starts nothing. Start is a server command recorded in the execution ledger. | E4 | None new |
| CH2 | Rules 3 to 5 of E4 made a result current by matching inputs, and an adopted result could be current although its inputs had changed before it completed (A17) | Withdrawn. A result is current through a pick, or through adoption with a match that the server recorded at completion. A line or shot can have results and no current one. | E4 | S7a, S7b, S18, S37, S48, S52 |
| CH3 | Undoing a pick restored the earlier pick as a fallback. The earlier pick then no longer counted, and an adoption it had covered stayed out of effect. | A restored pick carries `restores` and counts as a selection in effect. `none` is defined as a pick of nothing. | E4, Undo | S58 to S65 |
| CH4 | Recovery did not rewrite `selectionSeen`, `readFrontier` or `restores`, and copies of one actor could allocate equal order keys | Each field has a type for the recovery visitor of the timeline design, revision 4. Equal keys sort by entity id. | Undo, E2 | S66 to S68, P8 |
| CH5 | A job pushed into linked timelines, wrote with its own actor, and a viewer received every take and render (A10, A11, A15, A18) | The push is a separate transaction authorized against the timeline. The server writes completions under a permit. Viewers receive the viewer form. | Server role, references, materialization | None new |
| CH6 | A removed generated alternative remained in history only, and the state could not tell it from an undo's fallback (A19) | The sibling records `origin: generated`, and the server writes the removed text to the activity record | E6 | None new |
| CH7 | The rollout required S1 to S57 unchanged while A17 withdrew outcomes they state | Fixture suite version 2 with a list of amended and superseded outcomes | Fixtures and budgets | Suite version 2 |
| CH8 | The manifest encoding normalizes strings, and it was also used for payload identity | Normalization applies to manifest hashes only | E5, E1 | None new |

Update on 2026-11-16, for main at `11a6da4a`. Revision 3 is kept.

| Code | Problem in revision 3 | Change | Section | Fixtures |
| --- | --- | --- | --- | --- |
| CH9 | A copied project folder's timelines name scripts and storyboards that stayed in the original project (F18). Under D6 such a reference is legal and shows as missing or as the other project's document. | Q10 asks whether a copy clears these references, as Duplicate does. Nothing else changes, and no fixture of suite version 2 is affected. | Current state, Open questions | None |

### Change log from revision 1

| Code | Review point | Change | Where |
| --- | --- | --- | --- |
| H1 | A background result could override a pick | Requests are recorded with the selection state they saw. Adoption is derived from that. No completion-time write to the selection. Applied to timeline versions. | E4, C3, S10, S31 to S37 |
| H2 | Keyed versions lacked payload and stamp rules | Identity, payload equality, unequal payloads and `sourceOrder` are specified separately. | E1 rules K1 to K7, S26, S38, S39 |
| H3 | Conversion did not define edits to a lossy projection | General rules V1 to V3, field rules V4 to V14, and conditions W1 and W2 for client-side merge. | Legacy clients, S42 to S49, S57 |
| H4 | Job writes had no causal base, and one status per shot | `readFrontier`, deferential values, explicit rebase. Status per request. | E6, E4, S19, S35, S40, S41 |
| H5 | E2 was a sketch | Key format, comparison, contract, algorithm, moves, deleted bounds, restart, run guarantee and its limit. B9 corrected. Property tests. | E2, P1 to P7, B9 |
| H6 | Render matching lacked a canonical input | Versioned manifest, canonical encoding, exclusions, stored manifest, three comparison outcomes. | E5, S50 to S52 |
| H7 | Some link notices were not computable from two documents | Inputs are resolutions. The several-boards fact moved to a scoped lookup. "Newer result available" renamed. Timing notice based on `timingBasis`. | L4, L5, L10, link notices, S53 to S55 |
| H8 | Split and join left duplicates without a notice | Relation entity and related-operation notice. | E7, S9, S56 |

Withdrawn from revision 1: the rule that a pick yields to any later result, the shot-level `renderState` register, ordering of results by create stamp, "timing differs", and the claim that the web stores' merge code keeps working without conditions.

## Current state

Findings from the repository `nodetool-ai/nodetool` at commit `8372b34ee3952c918a4eb66a2cde7e75a72b11bf`.

| Code | Finding | Path |
| --- | --- | --- |
| F1 | A script document holds `cast` (speakers), `sections`, each with `lines`, and each line with `takes` and `currentTakeId`. A take records `textSnapshot` and `voiceSnapshot`, so staleness is derived and not stored. | `packages/protocol/src/api-schemas/scripts.ts` |
| F2 | A script row carries `timelineId` and `storyboardId` as back-pointers outside the document. | `packages/protocol/src/api-schemas/scripts.ts`, `scriptResponse` |
| F3 | A storyboard document holds a flat `shots` array, a `screenplay` with the Director's own `shots`, `scenes` and `motion_design`, board fields such as `brief`, `style`, `aspectRatio` and model selections, `one_take` and `scene_clips`. | `packages/protocol/src/api-schemas/storyboards.ts` |
| F4 | `screenplay.shots` is what the Director wrote. The board's `shots` is the working set. | `web/src/stores/storyboard/StoryboardStore.ts`, comment near line 572 |
| F5 | The link lives on the storyboard: `screenplay.script_id`, and per shot `script_line_ids`, `script_text_snapshot` and `duration_source`. The script document holds no shot references. | `docs/script-storyboard-link/design.md` section 1 |
| F6 | Link invariants are checked by `validateScriptLink`: a line id in at most one shot, every referenced line exists, and no line ids on a board without `script_id`. The first two and the last are errors on save. | `docs/script-storyboard-link/design.md` section 1.3 |
| F7 | The screenplay schema fails validation when a transition or a continuity names a shot that does not exist. | `packages/protocol/src/api-schemas/storyboards.ts`, `superRefine` on `storyboardScreenplay` |
| F8 | A shot's order is the number `index`. Its renders are `keyframe`, `clip`, `keyframe_versions` and `clip_versions`, which are media references without an id or an input hash. | `packages/protocol/src/api-schemas/storyboards.ts`, `storyboardShot` |
| F9 | A timeline clip can carry `scriptId`, `scriptLineId`, `storyboardBoardId` and `storyboardShotId`. | `packages/protocol/src/api-schemas/timeline.ts` |
| F10 | A new take or a new shot render is pushed into the assembled timeline by a read followed by a compare-and-swap update, matched on `scriptLineId` or `storyboardShotId`. A failure is logged and not retried. | `web/src/stores/script/timelineSync.ts`, `web/src/stores/storyboard/timelineSync.ts` |
| F11 | Both editors merge external changes per unit on the client: speakers, sections, lines and takes for scripts, and shots for storyboards. Board fields and links are last-write-wins. | `web/src/stores/script/merge.ts`, `web/src/stores/storyboard/merge.ts` |
| F12 | Deleting a linked script clears the board's link fields, and deleting a board clears the script's `storyboard_id`, each as a second write that is logged and not blocking. | `docs/script-storyboard-link/design.md` section 4 |
| F13 | Extract and derive write two documents with two compare-and-swap saves, and the link is stamped after the created row exists. | `docs/script-storyboard-link/design.md` section 7 |
| F14 | The link design records an open gap: a line that is voiced again moves later voiceover clips and not the shot clips, so picture and audio drift apart until the timeline is assembled again. | `docs/script-storyboard-link/design.md` section 2.4 |
| F15 | Scripts and storyboards have no version table. Workflows, timelines, sketches, apps and JS scripts have one. | `packages/models/src/project-archive.ts`, table list |
| F16 | A native storyboard component exists. I found no native script editor. | `native/storyboard/` |

Findings at `11a6da4a`. F15 still holds there: version tables exist for workflows, timelines, sketches, apps and JS scripts, and not for scripts or storyboards.

| Code | Finding | Path |
| --- | --- | --- |
| F17 | Projects are folders on main. Workflows and timelines are files in the folder, and scripts and storyboards stay database rows. The document file sync has adapters for workflows and timelines only, and a project archive carries scripts and storyboards as records. | `packages/project-services/src/document-file-sync.ts`, `packages/project-services/src/project-archive.ts` |
| F18 | A folder copied on the same install opens as a new project with new ids. Its timeline files are copied, scripts and storyboards are not, and the copied timelines keep the ids of the scripts and storyboards they name. | `packages/project-services/src/project-folder-restore.ts`, `packages/websocket/src/lib/project-folder-open.ts` |

I read F1 to F9, F11 to F15 in the files named. F10 and F16 rest on the file headers and directory listings, and I did not read the full implementations.

## Shared core and extensions

### Reused without change

Everything in revision 3 of the timeline design applies to both documents: siblings and the display rule, what a write names, `touched` and `removed`, transaction shape and normalization N1 to N5, delivery and duplicates, undo by `retract`, redo with the original stamp, recovery with a dot map, snapshots with a frontier, log truncation without tombstone removal, base-relative conversion for legacy clients, and the amendments A1 to A5 from the PRD.

The guarantees G1 to G7 carry over. So do their limits: a multi-entity edit is not preserved as a unit, and no notice spans entities.

### Document profile

The core is the same code for all three documents. A profile is data that tells it what a document contains.

| Profile entry | Meaning | Timeline example |
| --- | --- | --- |
| Entity types | Which entities exist and which type is a child of which | Clip, track, clip version |
| Registers and groups | Which fields form one register | `placement` with `trackId` and `startMs` |
| Touching references | A register whose write also touches the entity it names | `placement` touches the track |
| Containers | A container whose delete also deletes the members displayed in it | Track and its clips |
| Immutable fields | Fields written by `create` only | Track `type` |
| Non-reviving writers | Which writes are made by jobs and do not revive | Clip versions |

The timeline design described these as timeline rules. This design states them once and gives each document a profile. The timeline's behavior does not change, and its fixtures T1 to T21 must pass through the profile mechanism.

### Extensions

Each extension adds a capability to the shared core. None alters a rule that the timeline uses.

| Code | Extension | Needed for |
| --- | --- | --- |
| E1 | Keyed entities, with a separate rule for immutable payloads | Line assignments, the board's entity set, results and pushed clip versions |
| E2 | Run-preserving order keys | Lines, sections, shots, speakers |
| E3 | Link functions across documents | Script, storyboard and timeline references |
| E4 | Generation requests, results and selection | Takes, renders and clip versions |
| E5 | Input manifests | Deciding whether a result matches what is displayed |
| E6 | Causal base and deference of generated writes | Agent tools, directing runs and jobs |
| E7 | Operation relations | Split and join |

E6 adds one operation variant to the shared core and is the only extension that does. It is listed as C4 under the effects on the timeline design and needs separate acceptance.

### E1: keyed entities

An ordinary entity has a random id, so two people never create the same one. A keyed entity has an id computed from a key, for example the id of the script line it assigns. Two people who create it concurrently produce the same id.

| Case | Rule |
| --- | --- |
| Concurrent `create` of one keyed id | One entity. Both dots are added to `touched`. Each register in either `create` receives a sibling, so different initial values are a conflict like any other. |
| `create` of a keyed id that exists | The same as writing its registers. A client sends `set` when it knows the entity and `create` when it does not, and both converge. |
| `create` of a keyed id that is deleted | A reviving write. The entity is alive again. |
| Type | Fixed by the key's namespace, so two creates cannot disagree on it. |

A set whose members are keyed entities with no registers is an add-wins set: a member is present when an add exists that no remove observed.

N4 of the timeline design requires an entity's `create` in `deps` or in the same transaction. For a keyed entity the requirement is met by the transaction carrying its own `create`.

**Keyed entities with an immutable payload.** Results and pushed clip versions have fields that are set once. Register merge does not apply to them, so they need their own rule.

| Code | Rule |
| --- | --- |
| K1 | Identity. The id is a hash of a namespace and the facts the entity stands for. A result: namespace, document id, request id. A pushed clip version: namespace, source document id, source result id, destination clip id. |
| K2 | Payload. The immutable fields form one payload in the canonical encoding of E5. A payload contains only facts taken from the source request and the source result. It contains nothing about the writer or the time of the write. Two writers who push the same result therefore compute the same bytes. |
| K3 | Equal payloads. A second `create` with the same payload hash adds its dot to `touched` and changes nothing else. |
| K4 | Different payloads. The entity keeps every distinct payload it has received, indexed by payload hash. The canonical payload is the one with the bytewise smallest hash. The entity carries a payload-mismatch notice. The choice is arbitrary and identical on every replica in every delivery order. |
| K5 | Refusal. A server that holds a payload for a keyed id refuses a `create` with a different payload, as a refusal of the second class (PRD amendment A1). K4 exists for replicas that merge without the server and does not depend on K5. |
| K6 | Order. Results and versions are ordered by `sourceOrder`, a field of the payload, and then by id. `sourceOrder` is the stamp of the generation request. The stamp and dot of the transaction that delivers a `create` are used for existence only. A late or repeated push cannot make a result look newer. |
| K7 | Migrated results. A take or render that predates requests has `sourceOrder` built from its stored creation time and its id. |

### E2: run-preserving order keys

The timeline orders tracks by a fractional key with ties broken by id. For lines of dialogue that is not enough: when two people each type five lines into the same gap, plain fractional keys alternate the two runs. Revision 1 gave an example. This revision gives the allocator's contract, so that it can be tested as written.

**Keys.** A key is a non-empty list of components. A component is `(d, a, c)`.

| Part | Definition |
| --- | --- |
| `d` | A non-empty string of the characters `0` to `9` that does not end in `0`. It is compared as the fraction `0.d`, which for such strings is plain bytewise comparison with a proper prefix sorting first. |
| `a` | The actor id of the allocating client, compared bytewise. |
| `c` | The actor's allocation counter for this document, a positive integer compared numerically. It increases with every allocation and never repeats. It is persisted with the actor's sequence state. After an actor reset (PRD amendment A2) it resumes above the largest value the server has accepted from that actor. |

Components compare by `d`, then `a`, then `c`. Keys compare component by component, and a key that is a proper prefix of another sorts before it. The pair `(a, c)` of the last component is unique in the document, so no two allocated keys are equal.

**Contract.** `allocate(L, R)` takes the keys of the visible left and right neighbours of the gap, either of which may be absent, with `L < R`. It returns a key `K` with `L < K < R` that no other allocation returns. It reads no state except `L`, `R`, the actor id and the counter.

**Algorithm.** Let `n` be the next counter value. `below(x)` returns a digit string smaller than `x`: write `x` as `k` zeros, a first non-zero digit `v` and a rest. If `v` is 2 or more the result is `k` zeros followed by `v` halved and rounded down. If `v` is 1 the result is `k+1` zeros followed by `5`.

| Step | Condition | Result |
| --- | --- | --- |
| 1 | `L` is absent and `R` is absent | `[(5, a, n)]` |
| 2 | `L` is absent | `[(below(R[0].d), a, n)]` |
| 3 | The last component of `L` has actor `a`, and `L` with that component's counter replaced by `n` is smaller than `R` or `R` is absent | `L` with the last counter replaced by `n`. This continues the author's run. |
| 4 | `R` extends `L` | `L` followed by `(below(R[len(L)].d), a, n)` |
| 5 | Otherwise | `L` followed by `(5, a, n)` |

Steps are tried in order. Step 3 does not apply when `R` extends `L` or is a later element of the same run, because the candidate is then not smaller than `R`.

**Why each result lies in the gap.** Every extension of `L` is larger than `L` and smaller than every key that is larger than `L` and does not extend it. That covers step 5. In step 4 the new component is smaller than `R`'s component at that depth. In step 3 the candidate differs from `L` only in a larger counter, and the condition checks it against `R`. In step 2 the first component is smaller than `R`'s.

**Other rules.**

| Case | Rule |
| --- | --- |
| Position register | An entity's position is one register that holds its container and its key. |
| Move | A move calls `allocate` for the destination gap and writes the register. Two concurrent moves of one entity are a conflict on the register, and the entity appears once. |
| Deleted neighbours | Only visible neighbours are bounds. A key is a self-contained path with no parent pointer, so a key nested under a deleted entity's key stays valid. The new key's order relative to deleted entities is unspecified and matters only if they are restored. |
| Restart | Step 3 reads the actor of `L`'s last component from document state. No session memory is needed. |
| Several allocations in one transaction | Each takes the next counter value, and each uses the keys allocated before it as bounds. |

**What is guaranteed about runs.** A run is a sequence of inserts by one actor in which each element is inserted directly after the previous one. When two actors each insert a run into the same gap without seeing each other, each run is contiguous after merge. Typing backwards, where each new element goes before the previous one, is not a run and can interleave.

**Growth.** A run has the depth of its first element. A run started in an empty container or directly after the author's own element at the end of a run has that element's depth. A run started after another author's element is one component deeper. Repeated inserts before the same element lengthen `d` by one character about every third insert. Alternating authors in one gap add one component per change of author.

### E4: generation requests, results and selection

Revision 1 let any later result displace a pick. That is withdrawn. A result's completion time says nothing about what a person wants. This revision records the request, and what the requester saw, separately from the result.

**Generation request.** A child entity of the line or shot it is for. It is content: it is replicated, copied, kept in versions and delivered more than once, and it starts nothing (PRD amendment A16). Its create touches the parent, because asking for a take is a deliberate act on the line. Its payload is immutable and is the execution specification. A generation runs only when the requester sends the separate start command, which the server authorizes and records in its execution ledger, with at most one execution for a request id. A request with no execution is shown as not started.

| Field | Meaning |
| --- | --- |
| `kind` | Take, keyframe or clip. |
| `manifest` | The input manifest (E5), computed from the document at the frontier the requester read. |
| `adopt` | True when the requester wants the result to become current. False when the result should only be added. |
| `targets` | One entry for the parent entity and one for each linked timeline clip the requester had loaded. Each entry holds `selectionSeen`: the dots of every sibling in that target's selection register when the request was created. An empty register gives an empty list. A clip the requester had not loaded has no entry. |

The request has one register, `outcome`, written only by the server's completion transaction and without reviving anything: succeeded with a result id, failed with a reason, or cancelled. A success carries `match`, with the values match, no match and cannot verify. The server computes it against its own state when it accepts the completion, and stores the frontier of that state beside it (A17). An input edit that the server receives later does not change it. Not started and running are states of the execution ledger and are not in the document. The server writes a terminal outcome for every execution it started, including on timeout.

**Result.** A take or render is a keyed entity with an immutable payload (K1 to K7). Its payload names its request and carries the request's manifest hash and `sourceOrder`.

**Selection register.** Each line has one, and each shot has one per kind. Only a person's deliberate pick writes it, as an ordinary `set`, and the undo of a pick, as a `retract`. Its value is a result id or `none`, which is a pick of nothing. A fallback value that an undo wrote also carries `restores`: the dots that stood for the selection before the undone pick. No job and no push writes the register.

**Current result.** Derived, in this order.

1. Adoption. A request is in effect when `adopt` is true, its outcome is succeeded with `match`, its result is visible, and it covers every selection sibling in effect. The siblings in effect are the non-fallback siblings when there are any, and otherwise the fallback siblings. A request covers a sibling when the sibling's dot is in its `selectionSeen`, or when the sibling is a fallback and every dot of its `restores` is in `selectionSeen`. Among requests in effect, the one with the greatest `sourceOrder`, then the greatest id, supplies the current result.
2. Selection. Otherwise the result named by the displayed selection sibling, when it is visible. The register's display rule applies, so a fallback is displayed only when no other sibling exists.
3. Otherwise there is no current result, and the line or shot shows "No take chosen" or "No render chosen" with the number of results. This is the case for an empty register with no request in effect, for a displayed `none`, and for a displayed pick whose result is deleted.

Rules 3 to 5 of revision 2 chose a result by matching inputs when nothing was selected. They are withdrawn (A17). The comparison of a result's manifest with the displayed inputs now only labels the result as a known match, out of date or not verified. It never makes a result current.

**What follows from rule 1.**

| Case | Outcome |
| --- | --- |
| Alice starts request K, then picks an older take, then K finishes | Her pick's dot is not in K's `selectionSeen`. K is not in effect. Her pick stays current and K is added to the list. |
| Bob picks a take while Alice's request runs, neither seeing the other | The same. A pick made without knowledge of the request survives it. |
| A job with `adopt` false finishes | It never displaces a selection, and it never becomes current by itself. A person makes it current with a pick or with Use new results. |
| Two requests with `adopt` true saw the same state and finish in either order | The later request wins, by request stamp. Completion order is irrelevant. |
| A stale result arrives for an adopting request | It is current and shown as stale. It is what was asked for. |
| Someone picks after an adoption | The new dot is outside every earlier `selectionSeen`. Every earlier adoption stops being in effect for good. |

Rule 1 is a function of document state. No write happens at completion except the result and the outcome, so no completion-time race exists.

**Undo of a pick.** The undo is a `retract` of the pick's sibling, by the undo chain of the timeline design, revision 4. Its `restore` holds the selection value that was displayed before the pick, and `restores` holds the dots that stood for that value: the dot of that sibling, or that sibling's own `restores` when it was a fallback. When the register was empty before the pick, the retract restores nothing and the register is empty again. The current result after the undo is therefore what it was before the pick: the earlier pick, or the adopted result when an adoption that covered the earlier selection was in effect. Revision 2 stated as a limit that such an adoption stays out of effect. The limit is removed. When another person's pick arrived in the meantime, that pick is in effect and is shown. Redo is a `set` of the pick with its original stamp. Its dot is new, so a request that did not see it is not in effect, as after the original pick.

**Displayed status.** For each kind, the status shown on a line or shot is the outcome of the request with the greatest `sourceOrder` that is not cancelled. A late failure of an older request changes that request's outcome and nothing else. The number of running requests is also derived.

**Timeline clips.** A pushed clip version copies `adopt`, `sourceOrder`, the recorded `match` and the clip's `selectionSeen` from the request into its payload. The timeline applies the same current-result function to clip versions with the clip's own selection register. A version whose request has no entry for the clip is never in effect by adoption. This is amendment C3 to the timeline design.

### E5: input manifests

A manifest states what a result was generated from. The same pure function produces it in two places: when a request is created, and when the materializer asks what the displayed inputs are now. The pipeline generates from the manifest. The provider request is compiled from the manifest plus transport details, and never the other way round. That ordering is what lets a materializer reproduce the identity.

| Code | Rule |
| --- | --- |
| I1 | A manifest has a `manifestVersion`, a `kind` and the semantic inputs of that kind. The field list of each kind and version is a table in the protocol package, with a default for every optional field. |
| I2 | Defaults are resolved before encoding, from the table of that manifest version and never from a provider's current defaults. An omitted field and its explicit default encode identically. |
| I3 | Excluded: URLs, signed or temporary locations, request and job ids, timestamps, credentials, retry settings and provider-specific serialization. |
| I4 | Media and library inputs are named by stable identity: asset id and content hash, or entity id and revision. An input with no content identity is recorded as unversioned. |
| I5 | A clip manifest names the keyframe result it starts from by result id. A new keyframe therefore makes existing clips a mismatch. |
| I6 | Canonical encoding: object keys sorted bytewise, strings in UTF-8 after NFC normalization, numbers in shortest round-trip decimal form, ordered lists kept in order, sets sorted, no insignificant whitespace. The manifest hash is SHA-256 of that encoding. |
| I7 | The request stores the whole manifest and its hash. A mismatch is explained by a field-by-field difference between the stored manifest and the current one. |

**Fields in version 1.** These lists are proposals. The prompt compilers have not been read, and each list must be checked against what the compiler consumes (Q3).

| Kind | Fields |
| --- | --- |
| Take | Line `text`. Effective voice: provider, model, voice and settings. `direction` with a flag for whether the provider received it. Speed with the same flag. Language. |
| Keyframe | Shot `action`, `slug`, camera fields, `lookPresetIds`, `entityIds` with revisions, `locationId`, board `style` and `aspectRatio`, still model with parameters, reference images by asset identity, seed when fixed. |
| Clip | Keyframe result id, `motion`, `endState`, `sound`, duration, `renderMode`, clip model with parameters, reference shots by result id. |

**Comparison.** The materializer compares the part of a manifest that one document can supply. Inputs that live outside the document, such as a library entity's revision, are compared by a link function and reported as a link notice.

| Result | Condition |
| --- | --- |
| Known match | Same manifest version, and every field equals the displayed input. |
| Mismatch | At least one field is known to differ. |
| Cannot verify | No field is known to differ, and at least one cannot be compared: the result has no manifest, the field was not recorded, an input is unversioned, or the versions differ with no upgrade defined. |

A migrated take gets a manifest built from its stored snapshots. Text and voice are recorded. Direction and speed are recorded only where the take stored them. A migrated take whose text and voice match and whose direction was never stored is "cannot verify", not a match. Today's code treats it as fresh. An editor may show "cannot verify" without a warning mark. The label never decides which take is current.

### E6: causal base and deference of generated writes

A generated write comes from a job, a directing run, an agent tool or background automation. It was computed from inputs read at some earlier moment.

| Code | Rule |
| --- | --- |
| J1 | A generated transaction records `readFrontier`, the document frontier at which its inputs were read. Its `deps` equal that frontier. Each `set` names only dots that were in the register at that frontier. |
| J2 | The server refuses a generated transaction that names a dot outside its `deps`. |
| J3 | An edit made after `readFrontier` is therefore concurrent with the generated write and stays as a sibling. The generated write cannot replace it. |
| J4 | Rebasing is a separate step. The writer reads the document again at a newer frontier, computes its change again from those inputs, and sends a new transaction with the new `readFrontier`. Changing only the frontier of an already computed change is not a rebase and is not allowed. |
| J5 | A generated `set` is deferential: its sibling has the `fallback` flag of the timeline design. The existing display rule then shows a person's concurrent value ahead of it. When no concurrent value exists, the generated value is the only sibling and is displayed. |
| J6 | A request's manifest is computed at the request's `readFrontier` (E4). |

J5 uses the flag and the display rule that the timeline design defines for undo. The new part is that an ordinary `set` may carry the flag. Such a sibling also records `origin: generated`, which tells it apart from a fallback that an undo left behind. Under the naming rule, a person's next edit of that field names fallback siblings, so the generated alternative is removed by it. When the server accepts that edit, it writes the removed text to the activity record (A19). A fallback from an undo is not recorded there.

Without J5 the outcome of fixture S19 would follow stamps, and the run's text would be displayed over Carol's with a conflict notice. J5 is preferred because a person who has just typed should not see their text replaced by a run that never read it.

J2 checks consistency only. The server cannot tell that a writer read at an older frontier than it declares. J1 is therefore enforced where generated writes are built: the document handle given to an agent tool or a job is pinned to one frontier, and the transaction builder takes `deps` from the handle. Fixture S40 tests that path.

### E7: operation relations

A split or a join writes several lines. The merge does not keep such an edit together, and revision 1 left the resulting duplicate words without any notice. A relation makes the case visible. It does not change the merge.

A relation is an entity created in the same transaction as the split or join. Its payload is immutable: the kind, and the ids of the affected lines. Its creating dot identifies that transaction.

| Kind | The relation is unsettled when |
| --- | --- |
| Split of L into L and L2 | L's `text` register holds the split's sibling together with another sibling. |
| Join of L2 into L | L2 is alive, or L's `text` register holds the join's sibling together with another sibling. |

An unsettled relation raises a related-operation notice on every line it names. The notice shows both lines together and offers the two consistent results as explicit resolutions: keep the operation's result, or keep the other edit and undo the operation's remaining parts. A resolution is an ordinary transaction by a person. The notice clears when the condition no longer holds.

Agent tools that split or join lines create the relation as well. Shots can use the same entity for split and merge. That is outside this revision.

E3 has its own section below.

## Script document

### Entities and registers

| Entity | Registers | Notes |
| --- | --- | --- |
| Script (root, one per document) | `name`, `templateId`, `creativeContext`, `timelineId`, `storyboardId`, and one register per `setup` field: `stage`, `brief`, `format`, `lengthSeconds`, `pace`, `language`, `writerModel` | `setup` passes unknown keys through today. Each unknown key is its own register, so a newer client's field survives. |
| Speaker | `name`, `color`, `voice`, `entityId`, `position {orderKey}` | `voice` is one register. Provider, model, voice and settings are chosen together. |
| Section | `title`, `position {orderKey}` | Container of lines. |
| Line | `position {sectionId, orderKey}`, `speakerId`, `text`, `direction`, `pauseAfterMs`, `targetDurationMs`, `voiceOverride`, `selection` | `position` touches the section. `speakerId` touches the speaker. `selection` is the register of E4. |
| Generation request (child of a line) | `outcome` | Immutable payload as in E4. Its create touches the line. |
| Take (child of a line, keyed by its request) | `favorite` | Immutable payload under K1 to K7: asset, duration, word timings, request id, manifest hash, `sourceOrder`, cost and production metadata. |
| Relation | none | Immutable payload as in E7. |

### Text

`text`, `direction`, `title` and `brief` are whole-value registers. Two people who edit the same line while apart produce two siblings. The later stamp is displayed, the line carries a conflict notice, and the other wording stays available until someone resolves it.

Three reasons support whole values over a character-level merge.

1. A line is a sentence or two. A merge of two rewrites of one sentence often produces a sentence neither person wrote.
2. A take is bound to the exact text it was voiced from. A merged text that nobody approved would be voiced at a cost.
3. Staleness is an equality test between a snapshot and the displayed text. That test stays exact.

The cost is that two people cannot type in the same line at the same time without a conflict notice. Typing in different lines merges cleanly. Q1 asks whether that is acceptable for `brief`, which can be long.

A client coalesces typing into one transaction per pause or per blur, so a line does not produce a transaction per keystroke.

### Order, sections and speakers

| Operation | Writes | Concurrent outcome |
| --- | --- | --- |
| Insert a line | `create` with `position` | Runs stay together (E2). The create touches the section. |
| Move a line, within or across sections | `set position` | Two moves of one line conflict on `position`. The line appears once. |
| Delete a section | `delete` of the section and of every line displayed in it | A line that someone edited concurrently stays alive, and its edit keeps the section alive. Lines nobody touched stay deleted. This is the track rule of the timeline. |
| Delete a speaker | `delete` of the speaker only | Lines keep their `speakerId`. It materializes as no speaker with a notice. Undoing the delete restores every assignment without a further write. |
| Assign a speaker | `set speakerId` | The write touches the speaker, so a concurrent delete of that speaker does not take effect. |
| Split a line | `set text` on the line and `create` of a second line | Not preserved as a unit. See fixture S9. |
| Join two lines | `set text` on the first and `delete` of the second | A concurrent edit of the second line keeps it alive, and its words then appear twice. |

A line whose displayed section is absent is detached. The timeline design allows the same state for clips. It materializes into a derived section at the end of the script with a notice.

### Takes

Voicing a line creates a generation request and later a take (E4). The request's create touches the line. The take's create and the outcome write do not, so a result that arrives for a deleted line is stored and the line stays deleted. Restoring the line shows the take, which was paid for.

A person can delete a take and can set `favorite`. Neither write revives the line.

The current take follows the current-result function of E4, and the take manifest of E5 supplies its label. `takes` is ordered by `sourceOrder`. The stored snapshots of existing takes become their manifests on conversion (K7 and E5).

## Storyboard document

### Entities and registers

| Entity | Registers | Notes |
| --- | --- | --- |
| Board (root) | `name`, `timelineId`, `brief`, `style`, `aspectRatio`, `setupStage`, `genre`, `directorModel`, `imageModel`, `videoModel`, `templateId`, `recastKey`, `importSource`, `setupShotCount`, `setupDirectedFrom`, `creativeContext`, `oneTake`, `lookPresetIds` | Each is one register. A list such as `lookPresetIds` is replaced as a whole. |
| Screenplay (keyed by the board, at most one) | `title`, `genre`, `scriptLink`, `motionDirection`, `directedShots` | Absent when the board has no screenplay. `scriptLink` holds the script id. `directedShots` is the Director's own shot list, written whole by a directing run (F4, Q2). |
| Shot | `position {orderKey}`, `sceneId`, `action`, `slug`, `motion`, `endState`, `sound`, `dialogue`, `narration`, one register per camera field, `graphicsDirection`, `graphicsReviewRules`, `duration {seconds, source}`, `entityIds`, `lookPresetIds`, `locationId`, `stillModel`, `clipModel`, `renderMode`, `production`, `scriptTextSnapshot`, `keyframeSelection`, `clipSelection` | `duration` is a group because `source` says where `seconds` came from. The shot has no status register. Status is derived from requests (E4). Unknown keys are one register each. |
| Graphics element (child of a shot) | `position {orderKey}`, `props` | `props` is the element as a whole. |
| Generation request (child of a shot) | `outcome` | Immutable payload as in E4. Its create touches the shot. |
| Render (child of a shot, keyed by its request) | none | Immutable payload under K1 to K7: kind, media reference by asset identity, request id, manifest hash, `sourceOrder`. Created by a job without reviving the shot. |
| Scene | `slugline`, `lighting`, `position {orderKey}` | A shot names its scene. Deleting a scene does not delete shots. |
| Transition (keyed by the pair of shot ids) | `direction` |  |
| Continuity | `shotIds`, `direction` | `shotIds` is one register. |
| Scene clip | `shotIds`, `referenceShotIds`, `referenceEntityIds`, `prompt` and its other fields | `shotIds` is one register. |
| Board member (keyed by the entity id) | `position {orderKey}` | Membership of the board's `entityIds`, as an add-wins set (E1). |
| Line assignment (keyed by script id and line id) | `assignment {shotId, orderKey}` | Replaces `script_line_ids`. `assignment` touches the shot. |

### Shots

A shot's place is its order key. The number `index` is not stored. Materialization writes 0 to n-1 in displayed order.

Deleting a shot also deletes the assignments and graphics elements displayed on it. Its renders are children and are hidden with it. A concurrent edit to the shot keeps the shot alive, as with tracks. The assignments that the delete removed stay removed, so their lines become unassigned.

`sceneId` is a reference inside one document that does not cascade. A shot whose scene is absent materializes without a scene and with a notice.

### Renders

Today a shot stores `keyframe`, `clip` and two version lists of media references without ids (F8), and one `status` with a `failure_reason`. The design gives each render an id, a request and a manifest (E4 and E5).

The displayed keyframe and clip follow the current-result function of E4 with `keyframeSelection` and `clipSelection`. A clip's manifest names the keyframe result it starts from (I5), so choosing another keyframe labels the existing clips out of date without any write to them.

The shot's `status` and `failure_reason` are derived per kind from the newest request that is not cancelled. Two overlapping jobs each write their own request, so an old job's late failure cannot replace a newer job's success.

On conversion of an existing board, the stored `keyframe` and `clip` become selections, and every existing render gets `sourceOrder` under K7 and no manifest. Existing renders are therefore "cannot verify", and no board changes what it shows.

### Line assignment

`script_line_ids` is an ordered list per shot with the rule that a line belongs to at most one shot. A list register per shot cannot hold that rule across shots under concurrency.

The assignment entity is keyed by the script and the line. Its one register says which shot and where in that shot's order. Three properties follow.

| Property | Why |
| --- | --- |
| A line is displayed in at most one shot | One register has one displayed value. |
| Two people who assign different lines to one shot both succeed | They write different entities. |
| Two people who assign one line to different shots produce a conflict on that line | They write the same register. The later stamp is displayed and the other is retained. |

Unassigning deletes the entity. The key includes the script id, so the assignments of a previously linked script are inactive while another script is linked and return if the link returns.

### Directing runs

A directing run is a generated writer under E6. It records the frontier it read, its writes name only what it read, and its values are deferential. A person's edit made while the run was working stays displayed, with the run's text as an alternative (S19).

A run that revises a board writes the registers of existing shots by id. Fixture S20 shows why: delete and recreate, combined with one concurrent human edit, leaves an old shot alive next to the new ones.

## References across script, storyboard and timeline

### The references

| From | To | Field today |
| --- | --- | --- |
| Screenplay `scriptLink` | Script document | `screenplay.script_id` |
| Line assignment key | Script line | `shot.script_line_ids` |
| Shot `scriptTextSnapshot` | Text of the assigned lines at the last sync | `shot.script_text_snapshot` |
| Script `storyboardId`, `timelineId` and board `timelineId` | Storyboard or timeline document | Row fields outside the document (F2) |
| Timeline clip | Script and line, or board and shot | `scriptId`, `scriptLineId`, `storyboardBoardId`, `storyboardShotId` (F9) |
| Speaker `entityId`, board members, shot `entityIds` | Library entity | Asset ids |
| Take, render | Media asset | `assetId`, media reference |

### Rules

| Code | Rule |
| --- | --- |
| L1 | Each document is its own replicated state with its own vectors. No transaction spans two documents, and no document's `deps` name another document's dots. |
| L2 | A reference to another document is an id. Writing it does not touch the target, and deleting the target does not change the source. |
| L3 | A reference whose target is absent is legal state. It is reported by a link function and never rejected on save. |
| L4 | A link function is pure. Its inputs are two resolutions. A resolution is one of: loaded, with the materialized document. Deleted, as reported by the server. Denied, when the reader lacks access. Not loaded. Every client with the same two resolutions computes the same notices. |
| L5 | The resolution state is supplied by a resolver and is not a property of a document. The function reports existence facts only for a loaded target. Deleted yields one "missing" notice for the reference. Denied and not loaded yield "unavailable" and nothing else. |
| L6 | The forward reference is authoritative: the board's `scriptLink`, and the clip's ids. The back-pointers on the script and board roots are navigation hints. A back-pointer that disagrees with the forward reference is a link notice. |
| L7 | An action that writes two documents generates every id first, creates the target, then writes the reference into the source. Each write is one transaction in its own document. A failure between the two leaves an unreferenced target, and a retry with the same ids completes it. |
| L8 | Deleting a document writes nothing into other documents (D9). Restoring it within the retention period resolves its links again without a write. |
| L9 | Assignments are active only for the script that `scriptLink` displays. With no displayed `scriptLink`, no assignment is materialized. |
| L10 | A fact about more than two documents is not a link notice. "Several boards link this script" is answered by a server lookup over the documents the caller can read in the project. Its answer is scoped to those documents and says so. |

### Link notices

| Notice | Pair | Condition |
| --- | --- | --- |
| Script missing | Board, script | `scriptLink` names a script whose resolution is deleted. One notice for the board, not one per line. |
| Script unavailable | Board, script | The script's resolution is denied or not loaded. No other notice is computed for the pair. |
| Line missing | Board, script | Both loaded. An active assignment names a line that the script does not display. |
| Line unassigned | Board, script | Both loaded. The script displays a line that no active assignment names. |
| Text drift | Board, script | Both loaded. A shot's `scriptTextSnapshot` differs from the joined text of its assigned lines. |
| Duration drift | Board, script | Both loaded. A shot whose duration source is audio differs from the summed duration of its lines' current takes. |
| Back-pointer mismatch | Any pair | Both loaded. One root's back-pointer names a document other than the one whose forward reference names it. |
| Clip target missing | Timeline, script or board | Both loaded. A clip names a line or a shot that is not displayed. |
| Different source version available | Timeline, script or board | Both loaded. The source result of the clip's active version is not the current result of its line or shot. This includes a clip on which someone deliberately selected an older take. The notice states which case applies: the clip has a selection, or it does not. |
| Source duration changed | Timeline only | The clip's active version has a different source duration than the version named by the clip's `timingBasis`. |
| Source input changed | Board or script, library | A result's manifest names an entity revision or asset hash that differs from the library's current one. |

"Source duration changed" replaces "timing differs". Comparing clip length with take duration would flag every trimmed or sped-up clip for ever. The clip gains a register `timingBasis` that names a version. Every write by a person to the clip's length, trim or speed, and the retime action, sets it to the active version in the same transaction. The notice appears only when the active version later changes to one with a different duration. It needs the timeline alone. This is amendment C5 to the timeline design.

Drift and unassigned lines are derived today as well (F5). The change is that "line missing" moves from a save error to a link notice. Two people can delete a line and assign it at the same moment in two documents, and no rule inside one document can refuse that.

### Bringing a new take or render into a timeline

Today the editor that receives a take reads the timeline and saves it back with the new version (F10). The design keeps the push and makes the notice the floor.

1. A client that holds edit access to the linked timeline creates a clip version on every clip that names the line or the shot. After a completion, the server does the same for the clips the request listed, as a separate transaction to the timeline that is authorized as the requester at the moment it is accepted (A18). Without edit access to the timeline nothing is written, and the request list shows the reason. The create does not revive the clip.
2. The version is a keyed entity with an immutable payload (K1 to K7). Its id comes from the source document, the source result and the clip. Its payload comes from the result and its request. Two writers produce the same id and the same bytes, and the second create changes nothing.
3. The push writes nothing else. It does not write the clip's selection, length, trim or position.
4. Whether the new version plays is decided by the current-result function of E4 inside the timeline. It plays only when the request was made with `adopt` and recorded that clip's selection state, the completion recorded a match, and nobody has selected on the clip since.
5. A client without access, or with the timeline not loaded, writes nothing. "Different source version available" appears for whoever opens the timeline, and applying it performs step 1 and, if the person chooses, a selection on the clip.
6. Retiming is an explicit action by a person and is an ordinary timeline transaction over the affected clips (D11, confirmed in review).

A pick of an older take in the script is not a request and is not carried to the timeline. The clip keeps its active version and shows the notice. Carrying it over is one explicit selection on the clip.

Step 6 changes current behavior, where a line that is voiced again shifts later voiceover clips (F14). The explicit action can move voiceover and shot clips together, which the current sync does not. It is not preserved as a unit under concurrency, like any multi-clip edit.

### Extract, derive and assemble

Extracting a script from a board creates the script, then writes `scriptLink`, the assignments and the snapshots in one board transaction. Deriving a board from a script and assembling a timeline follow L7 in the same way. Two people who extract from one board concurrently produce two scripts and a conflict on `scriptLink`. See fixture S16.

## Materialization and notices

Materialization turns replicated state into the document shape that exists today. It is a pure function of one document's state, as in the timeline design. It reads no other document, so link notices are never part of it.

The output is intended to validate against `scriptDocument` and `storyboardDocument`. Fixture S27 checks that for every fixture end state. The check has not been run.

### Script

| Code | Rule |
| --- | --- |
| M1 | `cast` is the visible speakers in order-key order. `sections` is the visible sections in order-key order. Each section's `lines` are the visible lines whose displayed `position` names it, in order-key order. |
| M2 | Detached lines are emitted in one derived section at the end. Its id is reserved and computed from the script id. |
| M3 | A `speakerId` whose speaker is absent is emitted as null. |
| M4 | `takes` is the line's visible takes ordered by `sourceOrder`. `currentTakeId` is the current take under E4. Requests are not part of the legacy shape. |
| M5 | `setup` is emitted when the `stage` register has a value. Unknown keys are emitted from their registers. |

### Storyboard

| Code | Rule |
| --- | --- |
| M6 | `shots` is the visible shots in order-key order with `index` rewritten from 0. |
| M7 | `keyframe` and `clip` are the current renders under E4. `keyframe_versions` and `clip_versions` are the visible renders of each kind ordered by `sourceOrder`. `status` and `failure_reason` are derived from requests. |
| M8 | `script_line_ids` of a shot is the active assignments whose displayed `assignment` names it, in order-key order. It is omitted when no `scriptLink` is displayed (L9). |
| M9 | A transition is omitted when either of its shots is absent. A continuity's `shot_ids` omits absent shots, and the continuity is omitted when fewer than two remain. This keeps the schema's check on shot references from failing (F7). |
| M10 | A scene clip is omitted when a shot it names is absent or its shots are not a consecutive run in displayed order. The entity stays in replicated state, so restoring the order restores the scene clip. |
| M11 | A `sceneId` whose scene is absent is omitted. |
| M12 | `entityIds` is the visible board members in order-key order. |
| M13 | `screenplay` is null when the screenplay entity is absent. Its `shots` come from `directedShots`. |

M2, M3, M9, M10 and M11 are lossy: the output hides state that the document still holds. The conversion rules for legacy saves list what each of them means in reverse.

### Notices inside one document

The notices of the timeline design apply unchanged: conflict on a register with more than one sibling, and detached for an entity whose container is absent. Each rule above that omits or rewrites something adds one notice.

| Notice | Raised by |
| --- | --- |
| Conflict | Any register with more than one sibling that is not deferential, including `text`, `position`, `assignment` and `scriptLink` |
| Alternative available | A register whose displayed value has a deferential sibling beside it (J5) |
| Detached | M2 |
| Speaker missing | M3 |
| Scene missing | M11 |
| Transition or continuity hidden | M9 |
| Scene clip hidden | M10 |
| Related operation | An unsettled relation (E7), on every line it names |
| Payload mismatch | A keyed entity that holds more than one payload (K4) |
| Not verified, stale | An adopted or selected result that is not a known match. No result becomes current by matching alone. |

A viewer receives the viewer form of the materialized document and no siblings (A5, A11). The viewer form holds the current result of each line and shot and no other take or render, no request, no manifest, no relation and no deleted entity. A viewer therefore sees the displayed value of a conflicted line and not the alternative. The files a viewer may read are the files the viewer form refers to. That set is smaller than the set the editor form refers to, and the server keeps the two apart.

## Undo, server role, agents, legacy clients and version history

### Undo

Undo is per document and per actor, by `retract`, as in the timeline design. An action that wrote two documents is two undo entries, one in each document. An editor may run them together. Nothing makes them atomic, and L3 keeps the state between them legal.

Undo of a pick is defined in E4. Consecutive undo and redo follow the undo chain of the timeline design, revision 4.

Recovery after a refusal, and the reissue under a new actor, use the recovery visitor of the timeline design, revision 4. The fields this design adds have these types there.

| Field | Type | Effect of recovery |
| --- | --- | --- |
| A request's `selectionSeen` for its parent line or shot, and the `restores` of a selection value | Dot in this document | Rewritten by the map. A request that saw a pick still covers it after both are reissued. |
| `readFrontier` | Vector in this document | Rewritten like `deps` |
| A request's `selectionSeen` for a linked timeline clip, and its copy in a pushed clip version | Dot in another document | Never rewritten here. If the timeline reissues that dot, the request does not cover the pick on that clip and its version is not in effect there (S68). |
| The actor and counter in an order key | Allocator component | Unchanged. Equal keys from copies of one actor sort by entity id. |
| `sourceOrder` | Stamp | Unchanged |
| Keyed ids of results and pushed versions, a relation's creating dot | Derived | Computed again from the reissued transaction |

A pending request whose payload holds a rewritten dot is reissued with the new payload. The server never accepted the first form, so K5 does not refuse it.

Job results are not on anyone's undo stack. Deleting a take or a render is a person's write and can be undone.

### Server role

The server accepts or refuses transactions, checks authorization at acceptance (A1 and A8 of the PRD), stores the log and snapshots, and relays. It does not merge and does not rewrite values.

The server does not enforce link rules. It may run the link functions to answer agent tools and to produce the notices for a headless caller. A link notice never causes a refusal.

The server writes for jobs with a completion actor of its own, one per document, and only under the completion permit that an accepted start grants (A10, A15). A completion is one transaction: on success the result's create and the request's outcome, on failure or cancellation the outcome alone. The conversion of a legacy document uses a separate migration actor. Agent tools write as the person who invoked them, under the rules of E6.

### Agent tools

The in-product agent edits both documents heavily. Its capabilities call `validateScriptLink` (`packages/protocol/src/script-link.ts`, called from `packages/agents/src/capabilities/scripts.ts` and `storyboards.ts`) and save whole documents with a compare-and-swap.

| Code | Requirement |
| --- | --- |
| A1 | Agent tools that change a script or a board emit transactions per entity. A whole-document save of a revised board against concurrent human edits is the worst input the conversion can receive. |
| A2 | A directing run that revises existing shots writes them by id (S19). |
| A3 | `validateScriptLink` keeps the checks that concern one document. "Referenced line exists" becomes a warning in every caller, because L3 makes the state legal. "A line in at most one shot" cannot fail on materialized output and stays as a check on whole-document input. |
| A4 | The storyboard capability assigns the board's shots to `screenplay.shots` before saving, at three places in `packages/agents/src/capabilities/storyboards.ts`. The web store documents the two lists as distinct (F4). This design needs one answer (Q2). |
| A5 | Every agent tool call that writes holds the frontier it read and sends it as `readFrontier` (J1). A tool that reads, waits for a model and then writes uses the frontier of the read. |
| A6 | Agent tools start generation by creating a request (E4) and state `adopt` explicitly. A batch tool that voices many lines defaults to `adopt` false. |
| A7 | Agent tools that split or join lines create the relation (E7). |

These codes are local to this section and are not the PRD amendments of the same letter.

### Legacy clients

A client that saves whole documents goes through the base-relative conversion of the timeline design. A missing base is a conflict, as there. Revision 1 listed differences and transactions. That was not enough, because the client edits a projection that hides state.

**Principle.** The converter recomputes the projection of the base, which is the exact document the client was sent. It compares the save with that projection field by field. It then translates each difference into writes on the hidden state with the rule for that field. Three general rules hold for every field.

| Code | Rule |
| --- | --- |
| V1 | A field that equals its value in the base projection produces no write. Whatever the projection hid stays as it is. |
| V2 | An entity that the base projection omitted and that is absent from the save is unchanged. Absence is a delete only for an entity the client was shown. |
| V3 | A changed field produces an ordinary edit. It names the displayed sibling, the actor's own and fallback siblings. It never names another person's sibling, so a legacy save cannot resolve a conflict. |

**Field rules.**

| Code | Field | Rule |
| --- | --- | --- |
| V4 | `speakerId` and `scene_id` shown empty because the target is absent (M3, M11) | Saved empty: no write, and the hidden reference stays. Saved with a value: `set` to that value. A legacy client cannot clear such a reference, because its save is identical to an unchanged one. A transaction client clears it with an explicit `set` to empty. |
| V5 | A continuity's `shot_ids`, or any list register with hidden members (M9) | The edit is computed on the visible list and applied to the full list. A hidden member stays directly after the nearest visible member that preceded it, or at the start. Members the save adds after a visible member go after that member's hidden followers. With \[A, B, C\] stored, \[A, B\] shown and \[A, B, D\] saved, the register becomes \[A, B, C, D\]. Removing B gives \[A, C, D\]. |
| V6 | A transition, continuity or scene clip omitted by M9 or M10 | Unchanged under V2. A save that adds an entity with the id or key of a hidden one writes that entity's registers. |
| V7 | A line in the derived section (M2) | Changed fields of the line are written. Its `position` is not written while it stays in the derived section, in any order. Moving it into a real section writes `position` with a new key, as an ordinary edit. |
| V8 | The derived section itself | Its title and place are ignored. Its absence from the save deletes the lines the base projection showed in it. A new line saved into it is created at the end of the last real section. |
| V9 | Array order | `set position` only for entities outside the longest subsequence that kept its relative order, with keys from `allocate`. `index` values in the save are ignored. |
| V10 | `script_line_ids` | Differences become writes on assignment entities. When the base projection omitted the field under L9, an absent field is no change. |
| V11 | A take or render added by the save | A result with no request and `sourceOrder` under K7. |
| V12 | `currentTakeId`, `keyframe`, `clip` | Let b be the base projection's value and s the saved value. If s differs from b, write the selection to s, or to none when s is empty. Otherwise write nothing. |
| V13 | `status`, `failure_reason` | Ignored. They are derived. |
| V14 | A field whose saved value equals the value now displayed at the head | No write, even when it differs from the base projection. The client has only repeated what the document already says. |

Revision 2 had a second case in V12 for a client that appends a take and leaves its current take unchanged, because rule 3 of E4 could then have made the new take current. That rule is withdrawn. An appended take has no request and cannot become current, so the case is removed.

**Client-side merge.** The per-unit merge code in the web stores (F11) takes remote changes into a local draft and then saves the whole document. Revision 1 said it keeps working. That holds only under two conditions.

| Code | Condition |
| --- | --- |
| W1 | The save names as its base the last version the client merged in, not the version it first loaded. Otherwise every remote value it adopted looks like a local change against the old base and is written again under the client's actor with a new stamp. |
| W2 | The merge never produces a value that neither side had, for a field that is one register. A merged value is a new write. |

V14 removes the rewrites of values that are still current. It does not help when the head has moved on: a remote value the client adopted earlier would then be written back as a concurrent sibling of the newer one. W1 is therefore a requirement on the web stores before a document type is replicated. I have not checked whether the stores track the merged version.

### Version history

Scripts and storyboards get the snapshot and version mechanism of the timeline: a version is a snapshot with its frontier, and restoring is a forward transaction (A3 of the PRD). They have no version table today (F15), so this is new storage in each case.

Restoring a version does not delete takes or renders created after it. They are paid results, and E4 decides whether one is current after the restore.

## Fixtures and budgets

Every outcome below is derived by hand from the rules in this document and in revision 3 of the timeline design. None has been executed. Unless a row says otherwise, the two people act concurrently, neither having seen the other's transaction, and the outcome is the same on every replica after both are delivered.

### Script

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S1 | Alice and Bob each rewrite the text of line L. | `text` holds two siblings. The later stamp is displayed. L carries a conflict notice. No merged text exists. Resolving to one removes the other. |
| S2 | Alice edits L's text. Bob changes L's speaker. | Both apply. No notice. |
| S3 | Alice inserts A1, A2, A3 after L. Bob inserts B1, B2, B3 after L. L is neither's own element. | The order is L, A1, A2, A3, B1, B2, B3 when Alice's actor id sorts first. The two runs never alternate. |
| S4 | Alice deletes section X, which displays L1, L2, L3. Bob edits L2's text. | X is alive and displays L2 with Bob's text. L1 and L3 are deleted. Notices follow the timeline's fixture for a track that survives its delete. |
| S5 | Alice deletes speaker P. Bob assigns P to line L. | P is alive. L displays P. |
| S6 | Lines L1 and L2 display speaker P. Alice then deletes P, with no concurrent write. | L1 and L2 materialize with no speaker and a speaker-missing notice. Their `speakerId` registers are unchanged. Alice's undo restores P and both lines display P again. |
| S7 (revised) | A request with `adopt` produces take K from L's text. Alice edits L's text before she receives K. Nobody selects. | Split in suite version 2. S7a, the edit reaches the server after the completion: K is current, the completion holds a match and its frontier, and K is labelled out of date on text on every replica. S7b, the edit reaches the server before the completion: the completion records no match, K is added and is not current, and L shows No take chosen with one result. |
| S8 | Alice deletes L. A job creates take K for L. | K is stored. L stays deleted. Alice's undo shows L with K. |
| S9 (revised) | L reads "one two". Alice splits it into L "one" and a new L2 "two", which creates a relation. Bob rewrites L as "one two three". | L holds two siblings, "one" and "one two three", with a conflict notice. L2 reads "two". The relation is unsettled. L and L2 both carry a related-operation notice that shows the two lines together. Choosing "keep the other edit" sets L to Bob's text and deletes L2. Choosing "keep the split" resolves L to "one". Either clears the notice. |
| S10 (revised) | Alice starts request K with `adopt`. The selection register is empty. She then picks take 2. K finishes. | Take 2 is current before and after K finishes. K is in the list of takes. K's request is not in effect, because the pick's dot is not in its `selectionSeen`. |
| S11 | A legacy client reads a script, moves one line and saves. Bob edits another line's text in between. | One `position` write for the moved line. Bob's text is unaffected. |

### Storyboard

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S12 | Alice assigns line X to shot 1. Bob assigns X to shot 2. | One assignment entity with two siblings. X appears in the `script_line_ids` of exactly one shot, chosen by the later stamp. Conflict notice on the assignment. |
| S13 | Alice assigns X to shot 1. Bob assigns Y to shot 1. | Shot 1 lists both, in order-key order. No notice. |
| S14 | Shot 1 displays lines V and W. Alice deletes shot 1. Bob assigns X to shot 1. | Shot 1 is alive and lists X only. The assignments of V and W are deleted. With the script loaded, V and W are reported unassigned. |
| S15 | A transition joins shots 2 and 3. Alice deletes shot 3. | The materialized board has no such transition and passes the schema check. A notice reports the hidden transition. Undoing the delete shows it again without a further write. |
| S16 | Two people extract a script from the same unlinked board. | Two scripts exist. `scriptLink` holds two siblings and a conflict notice. Only the assignments of the displayed script are materialized. For the pair of the board and the other script, the link function reports a back-pointer mismatch. |
| S17 | A scene clip covers shots 4, 5, 6. Alice moves shot 5 to the end. | The scene clip is omitted with a notice. Moving shot 5 back between 4 and 6 shows it again. |
| S18 (revised) | A request without `adopt` produces a keyframe for shot 1. Alice edits shot 1's action before she receives it. The shot has no other render and no selection. | The render is visible and labelled out of date on action. The shot has no current keyframe and shows No render chosen with one result. The outcome of suite version 1, current under rule 5, is superseded. |
| S19 (revised) | A directing run reads the board at frontier F and later sets `action` on shots 1 to 5 by id, with `deps` F. Carol edits the action of shot 3 after F. | Shot 3's `action` holds Carol's sibling and the run's deferential sibling. Carol's text is displayed. Shot 3 carries "alternative available", not a conflict. Shots 1, 2, 4, 5 show the run's text. The board has five shots. |
| S20 | A directing run deletes shots 1 to 5 and creates five new shots. Carol edits the action of old shot 3. | The board has six shots: the five new ones and old shot 3 with Carol's text. No notice relates old shot 3 to its replacement. |
| S21 | Alice adds entity E to the board. Bob, who saw an earlier add of E, removes it. | E is a member. |

### Links

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S22 | Line X is assigned to shot 1. Alice deletes X in the script. | The board is unchanged and its save is accepted. The link function reports "line missing" on shot 1. Undoing the delete clears the notice. |
| S23 | Shot 1 holds a snapshot of X's text. Alice edits X. | "Text drift" on shot 1. Accepting it writes `scriptTextSnapshot` and clears the notice. |
| S24 | A board links script S. Alice deletes S. | The board keeps `scriptLink`. The resolver reports S as deleted, and the link function returns one "script missing" notice. Restoring S within the retention period resolves the link without a write to the board. |
| S25 | Bob can read the board and cannot read script S. | The resolution is denied. The only notice is "script unavailable". No line is reported missing or unassigned. |
| S26 (revised) | Two clients receive take K for line X and each push it to clip C, one of them a day later. | C has one new version. Both creates have the same id and the same payload bytes. The version's place in C's list is given by `sourceOrder` and is the same after the first push and after the second. C's selection, length and position are unchanged. |
| S27 (revised) | Take K arrives while nobody has the timeline open. Its request has no entry for C. | No timeline write. The next person to open the timeline sees "different source version available" on C. Applying it creates the version of S26. The version is never in effect under rule 1. |

### Selection, requests and status (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S31 | Alice starts request K with `adopt`. Bob, who has not received the request, picks take 3. K finishes. | Take 3 is current. Bob's dot is not in K's `selectionSeen`. |
| S32 | Alice creates request R1 and then Bob creates R2, both with `adopt`, both seeing an empty selection. R2 finishes first and R1 second. | The result of R2 is current after R2 finishes and stays current after R1 finishes. R2 has the greater `sourceOrder`. |
| S33 | Line L has a selection of take 2. A request without `adopt` finishes with take K, a known match. | Take 2 is current. K is in the list. |
| S34 | Alice picks take 2 after request K was adopted. Later a new request M with `adopt` sees her pick and finishes. | Take 2 is current until M finishes. Then M's result is current, given that the completion recorded a match. K's request is not in effect again unless Alice undoes her pick before M finishes (S59). |
| S35 | Shot 1 has request R1, then R2, for a keyframe. R2 succeeds. R1 fails afterward. | The shot's status is succeeded. R1's outcome is failed and visible on R1. The materialized `failure_reason` is empty. |
| S36 | Alice's request with `adopt` records clip C with an empty selection. Dana selects an older version on C while the job runs. The result is pushed. | C plays Dana's version. The new version is in C's list. "Different source version available" is shown and states that C has a selection. |
| S37 | The setup of S36 without Dana's selection. | C plays the new version in the timeline by adoption, given that the completion recorded a match. C's length is unchanged. If the durations differ, "source duration changed" is shown. |

### Keyed results and versions (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S38 | A job delivers the create of result K twice, in two transactions with different stamps. | One result. `touched` holds both dots. `sourceOrder`, and so K's place in the list, is unchanged by the second delivery. |
| S39 | Two replicas without the server each create the clip version for the same result and clip, with durations 4000 and 4010. | One entity holding both payloads. The canonical payload is the one with the smaller hash, on every replica and in both delivery orders. A payload-mismatch notice is shown. A server that already holds one refuses the other. |

### Generated writes (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S40 | An agent tool holds a document handle pinned at frontier F and reads action A on shot 3. Carol's transaction setting B is delivered to the same process. The tool writes C. | The tool's transaction has `deps` F and names A's dot only. The register holds B and deferential C. B is displayed with "alternative available". |
| S41 | After S40 the agent rebases: it reads again at the new frontier, sees B, computes C2 and writes it. | The transaction has the new `readFrontier` and names B's dot and C's dot. C2 is the only sibling and is displayed. The activity record shows two generated writes with their frontiers. |

### Legacy saves over a lossy projection (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S42 | A continuity stores \[A, B, C\]. Shot C is deleted, so the client is sent \[A, B\]. It saves \[A, B, D\]. | The register becomes \[A, B, C, D\]. The projection is \[A, B, D\]. When C is restored the projection is \[A, B, C, D\]. |
| S43 | A transition between shots 2 and 3 is hidden because shot 3 is deleted. A legacy client changes shot 1's action and saves. | One write, on shot 1. The transition entity is untouched and reappears when shot 3 is restored. |
| S44 | Line L is detached and shown in the derived section. A legacy client edits L's text and saves. | One write, on `text`. L's `position` register and all its siblings are unchanged. L is still detached. |
| S45 | The setup of S44, but the client moves L into section X. | `position` is written with X and a new key, naming the displayed sibling. L is displayed in X and is no longer detached. |
| S46 | Speaker P is deleted. Line L is sent with no speaker. A legacy client saves L unchanged. Then P is restored. | No write on `speakerId`. After the restore L displays P. |
| S47 | The setup of S46, but a transaction client explicitly clears the speaker. Then P is restored. | `speakerId` is set to empty. After the restore L displays no speaker. |
| S48 | Line L has take J, which is current through the selection that conversion wrote. A legacy client appends take K, a known match, and leaves `currentTakeId` at J. | K is created under V11. The selection is written to J under V12. J is current. |
| S49 | A web client loaded version 1, merged version 2, in which Bob set L's text to X, and saves. Meanwhile Bob set L's text to Y in version 3. | With base version 2 (W1): no write on L, and L displays Y. With base version 1, which W1 forbids: X is written as a sibling of Y under the client's actor, and L shows a conflict. |

### Manifests (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S50 | Two keyframe requests for one shot. One omits an optional field and the other states its default. Their reference image is the same asset behind two different signed URLs. | Equal manifests and equal hashes. |
| S51 | A shot has a clip made from keyframe K1. Someone selects keyframe K2. | The clip result is a mismatch. The field difference names the keyframe result id. No write is made to the clip result. |
| S52 | A migrated take has text and voice snapshots that equal the displayed inputs and no direction snapshot. | "Cannot verify". It is current only when it is selected, which conversion does for a stored current take. It is not a known match, and no rule makes it current. The outcome of suite version 1, current under rule 4, is superseded. |

### Links and relations (added in revision 2)

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S53 | Boards B1 and B2 both link script S. S's back-pointer names B1. | The link function for B1 and S returns no notice. For B2 and S it returns a back-pointer mismatch. Neither call mentions the other board. The lookup of L10 returns B1 and B2 for a caller who can read both, and B2 only for a caller who cannot read B1, marked as limited to readable documents. |
| S54 | Dana trims clip C to half its length and sets double speed. | `timingBasis` names the active version. No notice. |
| S55 | After S54 a version with a different source duration becomes active. Dana then retimes. | "Source duration changed" appears when the version becomes active and clears when the retime writes `timingBasis`. |
| S56 | Alice joins L2 into L, which sets L's text and deletes L2 and creates a relation. Bob edits L2's text. | L2 is alive with Bob's text. L holds the joined text. The relation is unsettled, and both lines carry a related-operation notice. |

### Selection after undo, and recovery (added in revision 3)

In S58 to S65, each list of outcomes gives the current result after each step. S58 to S63, S65 and the first sentence of S64 were also run as a model of one register, `crdt_traces.py` in the project files. S66 to S68 were derived by hand.

| Code | Setup | Expected outcome |
| --- | --- | --- |
| S58 | A request R0 with adopt saw an empty register and its result is current. Alice picks A, picks B, undoes twice and redoes twice. | A, B, A, the result of R0, A, B |
| S59 | Alice picks A. Request R1 with adopt sees the pick, and its result is adopted. Alice picks B, undoes and redoes. | The result of R1, B, the result of R1, B |
| S60 | Alice picks A. R1 with adopt sees the pick. While the job runs she picks B. R1 completes with a match. She undoes. | B after the completion. The result of R1 after the undo. |
| S61 | Alice picks A, picks B and undoes. Request R2 with adopt is created after the undo and completes. | With a recorded match, the result of R2. With no match, A. |
| S62 | Alice has picked A. Alice picks B and Bob picks C concurrently, with Bob's stamp higher. Alice undoes. | C before and after the undo, on both replicas |
| S63 | The register is empty and the adopted result of R1 is current. Alice picks none, then undoes. | The result of R1, no current result, the result of R1 |
| S64 | The displayed pick names a take that is then deleted | No current result. Undoing the delete makes the take current again. |
| S65 | Alice has picked A, and R1, which saw that pick, has its result adopted. Alice picks B and Bob picks C concurrently. Both undo concurrently. | The result of R1 on both replicas, in every delivery order |
| S66 | Pending: a pick with `a:5` and a request with adopt that saw it, with `a:6`. Pending `a:4` is refused. | The reissued request's `selectionSeen` names the pick's new dot. Its result, completed with a match, is current, as it would be without the refusal. |
| S67 | A copy of an actor is refused as diverged. Beyond the shared transactions it holds an undone pick, a generated write, and two lines inserted into a gap where the other copy also inserted two. It reissues under a new actor. | `restores` and `readFrontier` name the new dots and entries. All four lines are present. Lines with equal keys sort by entity id on every replica. |
| S68 | A script request recorded `selectionSeen` for timeline clip C. A recovery in the timeline reissues the pick on C under a new dot. The result is then pushed. | The script's request is not rewritten. On C the pushed version is not in effect, C keeps playing the pick, and "different source version available" is shown. |

### Whole-suite checks

| Code | Check |
| --- | --- |
| S28 | Fixtures T1 to T21 of the timeline design pass with the timeline expressed as a profile. |
| S29 | The materialized end state of every fixture validates against `scriptDocument` or `storyboardDocument`. |
| S30 | Every fixture gives the same end state under every delivery order and with every transaction delivered twice. |
| S57 | Round trip. For every fixture end state, a legacy save of the unchanged projection produces no transaction. |

### Fixture suite version 2

Suite version 2 is the one authoritative list of fixtures for the timeline, script and storyboard profiles. Version 1 was T1 to T21 of the timeline design, revision 3, and S1 to S57 of revision 2 of this design, read together with the PRD's amendments. Version 1 could not be passed together with amendment A17: S18, for example, expected a result without adoption to become current. A prototype passes the gate on version 2 only.

| Group | Fixtures | Status in version 2 |
| --- | --- | --- |
| Timeline core | T1 to T21 | Unchanged |
| Undo chain | T22a to T22e | New, in the timeline design, revision 4 |
| Recovery | T23a to T23c, S66 to S68 | New |
| Script, storyboard and links | S1 to S6, S8 to S17, S19 to S33, S35, S36, S38 to S47, S49 to S51, S53 to S57 | Unchanged |
| Amended | S7, which is split into S7a and S7b. S34, S37 and S48. | The setup or the wording of the outcome changed with A17 and with undo of a pick |
| Superseded | S18, S52 | The outcome of version 1 is withdrawn, and the outcome stated in this revision replaces it |
| Selection after undo | S58 to S65 | New |
| Whole-suite checks | S28, S29, S30, S57 | Apply to every fixture of version 2 |

A later change to any expected outcome makes a version 3, listed in the same way. The rules of E4 that S10, S31 to S33, S36 and S27 exercise are the two that remain, and their outcomes are unchanged.

### Property tests for the order allocator

Added in revision 3: P8. With two copies of one actor that allocate equal keys, the order of all entities is total and the same on every replica, by the tie rule on entity id. The uniqueness of keys in the contract holds for actors that were never copied.

Fixtures show single cases. The allocator's contract is checked with generated inputs. Each property runs over random histories of inserts, moves, deletes and restores by two to five actors, with random offline branches merged in random order.

| Code | Property |
| --- | --- |
| P1 | Betweenness. Every result of `allocate(L, R)` satisfies `L < K < R`. |
| P2 | Uniqueness. No two allocations in a history return equal keys, including after an actor restart and after an actor reset. |
| P3 | Agreement. All replicas that have applied the same transactions list the visible elements in the same order. |
| P4 | Runs. When two or more actors each insert a run into the same gap on separate branches, every run is contiguous after merge. |
| P5 | Narrow gap. After 10,000 inserts into one gap, alternating between the front, the back and the middle of the inserted elements, P1 to P3 still hold and key size is reported. |
| P6 | Moves and deleted bounds. P1 to P3 hold when the neighbours of a gap were moved or deleted on another branch. |
| P7 | Total order. Comparison is antisymmetric and transitive over all keys produced. |

### Budgets

The timeline budgets B1 to B7 are measured for these documents at the sizes below. The sizes and the added budgets are proposals that need the same confirmation as B1 to B7. A budget measures cost. It does not establish correctness, which the fixtures and properties above are for.

| Code | Budget |
| --- | --- |
| B8 | Reference sizes: a script of 2,000 lines with 10 takes and 10 requests each, and a board of 300 shots with 20 renders and 20 requests each. B1 to B7 hold at these sizes. |
| B9 (revised) | Order keys. A run has the depth of its first element, so 1,000 lines typed in sequence by one author into an empty section have one component each, and the same run typed after another author's line has two. After 10,000 inserts replayed from a recorded editing session, the median key has at most 3 components and the longest at most 16, and no `d` exceeds 32 characters. |
| B10 | The current result of every line in the B8 script is derived in one pass over its requests and takes. Its cost is included in the materialization budget of the timeline design. |

No recorded editing session exists yet. Recording one is part of phase 0.

## Rollout, effect on other documents, risks and open questions

### Rollout

1. Phase 0 of the timeline design grows. Both prototypes, the custom core and the Automerge variant, implement profiles and E1 to E7, and run fixture suite version 2 and the properties P1 to P8. The gate and its lack of a preset preference are unchanged. The Automerge variant also measures its text type against D2.
2. Timelines ship first, as phase 3 of the PRD.
3. Scripts follow. They have the smaller model, and no native editor exists (F16), so the first clients are the web editor and the agent tools.
4. Storyboards follow scripts, with the assignment entity and the link functions.
5. Until a document type ships, it stays a whole-document format under the PRD's rules for those formats.
6. On conversion of an existing document, the stored `currentTakeId`, `keyframe` and `clip` become selections, existing results get `sourceOrder` under K7, and takes get manifests from their snapshots. No document changes what it shows.

This revision is approved for prototyping and not for implementation. Passing the fixtures and properties in a prototype is the precondition for asking again.

### Effect on the PRD

| Code | Change |
| --- | --- |
| P1 | The capability matrix gains a later phase in which scripts and storyboards are replicated documents. Until then both rows stay whole-document. |
| P2 | Editors receive full collaborative state and viewers the materialized document. Editors can therefore see deleted lines, retained alternatives of a line's text, and takes of deleted lines. This widens PRD decision D3. |
| P3 | Link notices need read access to both documents. A board shared without its script shows the link as unavailable (L5). The dependency closure for sharing should name the script of a shared board and the timeline of both. |
| P4 | A delivery copy of a script or a board contains the materialized document and the current take or render of each line or shot, with no alternatives. |

### Effect on the timeline design

| Code | Change |
| --- | --- |
| C1 | Container, touching-reference and non-reviving rules are expressed as a profile. Behavior is unchanged, and S28 checks it. |
| C2 | Clip versions are keyed entities with an immutable payload (K1 to K7) and are ordered by `sourceOrder`. |
| C3 | The active clip version follows the current-result function of E4. A clip gets a selection register that only a person writes. A version plays without a selection only under the adoption rule. |
| C4 | An ordinary `set` may carry the fallback flag (J5). The display rule and the naming rule of revision 3 are used as they are. This is the one change to the shared core's operations and needs your acceptance. If it is declined, generated values are displayed by stamp and S19 and S40 show a conflict with the run's text on top. |
| C5 | A clip gains the register `timingBasis`. |
| C6 | Generated writes into a timeline follow J1 to J4. |

### Effect on the script and storyboard link design

| Code | Change |
| --- | --- |
| X1 | "Referenced line exists" becomes a warning (L3). |
| X2 | Deleting a script or a board no longer writes into the other document (D9). |
| X3 | The timeline push adds a version and does not retime (D11). |
| X4 | `script_line_ids` is derived from assignment entities. |
| X5 | Voicing and rendering go through generation requests, and the back-sync modules (F10) are replaced by the keyed push. |

### Risks

| Code | Risk | Mitigation |
| --- | --- | --- |
| R1 | Whole-value text produces conflict notices when two people work on one line or one brief. | Per-line granularity keeps this rare for lines. Q1 covers the brief. |
| R2 | Split and join can duplicate words (S9, S56). | The relation of E7 shows both lines and offers the two consistent results. The merge itself is unchanged. |
| R3 | A client or agent tool that still rejects a missing line on save blocks a legal state. | X1 must reach every caller of `validateScriptLink` before boards are replicated. |
| R4 | A directing run that deletes and recreates shots leaves stray shots (S20). | Requirement A2 in the agent tools section. |
| R5 | Existing renders have no manifest, and existing takes lack some fields. They are "cannot verify" until regenerated. | Conversion turns the stored current values into selections, so nothing changes on screen. |
| R6 | Without automatic retiming, a timeline can play a take in a slot of the wrong length until someone retimes. | "Source duration changed", and one action that retimes voiceover and shot clips together. |
| R7 | Order keys grow under adversarial insert patterns. | P5 reports growth, and B9 bounds it on a recorded session. |
| R8 | The manifest field lists are proposals. A field the compiler reads and the manifest omits makes a stale result look like a match. | Q3. A test per compiler that changing any input it reads changes the manifest hash. |
| R9 | J1 depends on writers reporting the frontier they read. The server cannot verify it. | Pinned document handles, and S40 at the tool level. |
| R10 | An adopted result stays current when it goes stale, even if an older take matches the new text. | Shown as stale. One pick or one new request changes it. This is the cost of never switching the current result without a request or a pick. |
| R11 | The web stores' merge may write remote values again (S49). | W1 before a document type is replicated. Not yet checked in the code. |

### Open questions

| Code | Question | Default if unanswered |
| --- | --- | --- |
| Q1 | Is whole-value text acceptable for long fields such as `brief`, or should those get a sequence type? | Whole value everywhere. |
| Q2 | Is `screenplay.shots` a frozen record of the Director's output or a mirror of the board's shots? The web store says the first, and the agent capability writes the second. | Frozen record in one register, and the mirroring assignments are removed. |
| Q3 | Are the version 1 manifest field lists of E5 complete for each compiler? | The lists stand as proposals until each compiler is read. |
| Q4 | Closed. The timeline push stops retiming, confirmed in review. |  |
| Q5 | May document deletion stop clearing the other document's link (D9)? | Yes. |
| Q6 | Should the server compute link notices for agents, or should each tool load both documents? | The server computes them with the shared link functions. |
| Q7 | Is the deferential generated write accepted as a change to the shared core (C4)? | Yes. |
| Q8 | What is the default of `adopt` for a person's single "voice this line" or "render this shot"? | True for a single request by a person, false for batch and agent requests (A6). |
| Q9 | Should an adopted result yield to an older known match when it goes stale (R10)? | No. |

| Code | Question | Default if unanswered |
| --- | --- | --- |
| Q10 | Should opening a copied folder clear its timelines' references to scripts and storyboards of the original project (F18)? | Yes, as Duplicate does. Without it, a copy's link panel shows the original's documents, or missing links where the reader has no access. OQ13 of the technical design asks the same. |

Q5 and D12 change shipped behavior and were not addressed in the review. Q7 changes the shared core. These three need a decision before implementation. The others can follow their defaults through phase 0.
