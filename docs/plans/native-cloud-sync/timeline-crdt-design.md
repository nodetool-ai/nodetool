Editable source: [https://claude.ai/artifact/ApkeMonzUm2vKcFCoFASNM](https://claude.ai/artifact/ApkeMonzUm2vKcFCoFASNM). This file is an export, so edit the Claude Doc and export again.

# CRDT design for the timeline document

Nov 15, 2026 · @Matthias Georgi

## Summary

This document is now at revision 4, of 2026-11-16. Revision 4 corrects undo, extends recovery to every field that holds causal identity, and writes the PRD's amendments A1 to A5 into this design. The changes are listed under Changes in revision 4. The text below describes revision 3 and holds except where that list says otherwise.

This is revision 3. The second review kept the separation of registers, existence and materialization, and found seven places where a guarantee contradicted a rule. This revision adds no architecture. It replaces those rules with operational definitions, removes two mechanisms that were not ready, and gives each case a fixture with an expected outcome.

The design is not approved for production implementation. Its merge rules are specified and not executed. Phase 0 is the test.

| Code | Decision | Changed in revision 3 |
| --- | --- | --- |
| D1 | A register keeps every concurrent value. An ordinary edit replaces the displayed value and the author's own earlier values. Only an explicit resolution removes other people's values. | Yes. One rule for what an edit names. |
| D2 | A transaction applies as a unit on each replica and holds at most one write per entity and register. Conflicts resolve per register. | Yes. Normalization and duplicate handling. |
| D3 | Each entity carries `touched` and `removed` vectors. Deleting a track deletes the clips on it, and a write into a clip also touches its track. | Yes. Track deletion. |
| D4 | Undo of a value is a retraction. It removes the author's value and never displays a restored value over another person's value. | Yes. Replaces undo as a competing write. |
| D5 | Collection truncates the transaction log and nothing else. Tombstones are kept. | Yes. Tombstone removal is withdrawn. |
| D6 | The whole-document adapter diffs against the client's base and follows the ordinary edit rule. | Aligned with D1 |
| D7 | Materialization never moves a clip to another track and never changes overlaps. A clip without a present track is detached. | Detachment is stated as a normal, rare outcome |
| D8 | A write is marked reviving or not. Job results are clip versions bound to a dependency hash. | No |
| D9 | Ripple and split intent records are research outside the core. | No |
| D10 | Phase 0 builds this core and an Automerge variant against the same fixtures. The choice rests on fixtures, measured budgets and total implementation burden. | Yes. The preset preference is removed and budgets are numeric. |
| D11 | Recovery from a refused transaction reissues whole transactions with a map from old dots to new dots and drops dependents of the refused one. | Yes. Replaces write-level omission. |

## Changes after review

The first review's points remain addressed as in revision 2. This table covers the second review. Each point is accepted.

| Point | Defect in revision 2 | Rule in revision 3 | Section | Fixture |
| --- | --- | --- | --- | --- |
| 1 | Undo wrote the prior value with a new stamp, which displayed it over another person's concurrent value. | Undo is a `retract`. The restored value is a fallback that is displayed only when no other value exists. | Undo and redo | T15 |
| 2 | Recovery kept `seen` and `observed` that named dots of pending transactions, and it omitted single writes. | Dots are mapped. Transactions are reissued whole or dropped with their dependents, and each is validated again. | Server role | T16 |
| 3 | Tombstone removal lost deletion information, and recreating an id had no rules. | Tombstones are not removed. Log truncation remains. | Collection | T17 |
| 4 | A track delete that observed a placement left the clip alive on an absent track. | A track delete deletes its clips. The cases against concurrent moves and edits are tabulated. Detachment is a stated outcome. | State model | T18 |
| 5 | T1 required a `partial` notice across two entities, which the definition could not produce. | The guarantee is narrowed. `partial` exists within one entity only, and T1 expects a `conflict` notice on B. | Transactions, Notices | T1, T19 |
| 6 | Two rules disagreed on which siblings an edit names. | One table defines it for ordinary edits, explicit resolution, undo and the adapter. | State model | T20 |
| 7 | Two writes of one transaction to one register were ambiguous. Duplicates and snapshot frontiers were unspecified. | Transactions are normalized. Delivery, duplicates and snapshot frontiers are defined. | Transactions, Delivery | T21 |
| Gate | The custom core was favored whenever Automerge needed an existence and undo layer. | The preference is removed. The gate compares fixtures, numeric budgets and total burden. | Phase 0 |  |

## Changes in revision 4

The review of 2026-11-16 covered this design together with the storyboard and script design, the PRD and the technical design.

| Code | Problem in revision 3 | Change | Section | Fixtures |
| --- | --- | --- | --- | --- |
| H1 | A second consecutive undo did nothing, with one user and no concurrency. An undo entry kept only the dot of its own transaction, and that dot is gone after the entry above it was undone. | Undo chain. Each register keeps link cells that name the sibling which currently stands for each entry. | Undo and redo | T22a to T22e |
| H2 | Recovery rewrote `seen`, `dots`, `observed`, `deps` and undo entries. The extensions add more fields that hold dots, and copies of one actor can allocate equal order keys. | A typed recovery visitor with a rule per field type, and a tie rule for equal order keys | Fields that hold causal identity | T23a to T23c |
| H3 | The PRD's amendments A1 to A5 lived in the PRD only, and risk R8 and question Q6 contradicted them | The amendments are stated here as rules | Amendments from the PRD | None new |
| H4 | The fixtures of three profiles were spread over two designs and an amendment list | One fixture suite, version 2, defined in revision 3 of the storyboard and script design. T1 to T21 are in it unchanged. | Phase 0 | Suite version 2 |

Update on 2026-11-16, for main at `11a6da4a`. Revision 4 is kept.

| Code | Problem in revision 4 | Change | Section | Fixtures |
| --- | --- | --- | --- | --- |
| H5 | The design treated a timeline as a database row. On main it is also a file in the project folder that other apps can edit (F14). | The file is a whole-document client of the replicated state, under decision D21 of the technical design | Whole-document clients | None in suite version 2. Technical design TC106 and TC107. |

## Current state

Findings from the repository at commit `8372b34e`.

| Code | Finding | Where |
| --- | --- | --- |
| F1 | The document is flat. `tracks`, `clips`, `markers`, `trackFolders`, `mediaTracks` and `transcript` are arrays of objects with string ids. A clip names its lane with `trackId` and its position with absolute `startMs` and `durationMs`. | `packages/protocol/src/api-schemas/timeline.ts`, `timelineDocument` |
| F2 | Document-level values are `tempo`, `master`, `setup`, `camera2d`, `source`, `templateId`, `scriptEnabled`, `dropFrame`, `storyboardMaterializations`. `fps`, `width`, `height` and the name live on the sequence row. | same file, `timelineSequenceResponse` |
| F3 | A clip has about 100 fields. Several are nested lists: `versions` (takes), `effects`, `audioEffects`, `animations`, `paramCurves`, `notes` (up to 4,096), `caption.words`. A track has `effects`, `chords` (up to 4,096) and `automation` (up to 256 lanes of 10,000 points). | same file |
| F4 | Track order is the integer `index`. Clips reference each other through `linkId`, `parentId` and `sourceClipId`. | same file |
| F5 | Saves are whole documents with compare-and-swap on `updated_at`. The native app sends `timeline.update` with `baseUpdatedAt` 750 ms after the last edit. | `native/timeline/README.md`, `packages/models/src/timeline-sequence.ts` |
| F6 | On a refused save, both editors run a three-way merge by unit: track, track folder, clip, marker, media track, transcript line, plus document scalars. A unit changed on both sides keeps the draft and reports a conflict. | `web/src/stores/timeline/merge.ts`, `native/timeline/src/server/sync/TimelineMerge.cpp` |
| F7 | A unit is the whole clip. Two people changing different fields of one clip is a conflict today, and one of the edits is refused. | same files |
| F8 | External writes carry the op list they were made with on the `resource_change` message, and the merge uses it to tell which units a write touched. | `docs/adr/0001-document-sync-draft-wins.md` |
| F9 | Edits already have a shared, pure vocabulary: timeline ops with `apply`, `parse` and `serialize`, used by the server bridge, the browser store and agent tools. | `packages/timeline/src/ops/` |
| F10 | External changes never enter the undo stack, and the native app rebases undo checkpoints over an adopted external change. | ADR 0001, `rebaseHistoryDocument` in `TimelineMerge.h` |
| F11 | The native merge is a C++ port of the web merge, held to the same behavior by shared fixtures. | `native/parity/`, `native/timeline/src/server/sync/` |
| F12 | The native app keeps fields it does not model and sends them back unchanged. | `native/timeline/README.md`, sections Server open and Modelled fields |
| F13 | Overlapping clips on one lane are legal and meaningful. With no explicit transition, the later picture clip fades in across the overlap, and an audio cross-fade is two overlapping clips with fades. The overlap check in placement has no caller outside its tests. Groups with a parent cycle already render unparented. | `native/timeline/docs/DESIGN.md (Auto dissolve, Groups), native/timeline/README.md (Audio)` |

| Code | Finding | Where |
| --- | --- | --- |
| F14 | At `11a6da4a` a timeline is also a JSON file, `Timelines/<name>.timeline.json`, in its project folder. The row records the file's path and the hash NodeTool last wrote. An edit made in another app is read into the row when the folder is compared, and a save keeps an unseen file edit as a version. The native graph runner saves the row by compare-and-swap and writes no file. | `packages/project-services/src/document-file-sync.ts`, `packages/models/src/schema/timeline-sequences.ts`, `native/graph-runner/guest/host/models-documents.mjs` |

The gap this design closes is F7 together with the cost of F5: merge runs only after a refused save, works on whole clips, and needs a common base that long-lived offline copies do not have.

## Guarantees and invariants

Each guarantee names the rule that delivers it and maps to fixtures in phase 0.

| Code | Guarantee |
| --- | --- |
| G1 | Convergence. Two replicas that have applied the same set of transactions hold the same state and materialize the same document and notices. |
| G2 | Local atomicity. A replica applies all writes of a transaction or none. Conflicts resolve per register, so a transaction can win one register and lose another. |
| G3 | Retained alternatives. A value written concurrently with the displayed value stays in state until its author replaces it or a person resolves the conflict explicitly. An edit by someone else does not remove it. |
| G4 | Existence. An entity is absent only when every reviving write into it was observed by a delete. |
| G5 | Validity. The materialized document passes the timeline schema. Every difference between register values and the document is listed as a notice. |
| G6 | Stable truncation. Truncating the transaction log changes neither the state nor the result of any later transaction. |
| G7 | Undo. Undoing a value removes the author's own value. Another person's value is never replaced or outranked by the undo. |

The design does not promise the following.

- A multi-entity edit is not preserved as a unit against concurrent edits, and no notice ties its parts together across entities.
- Clips that two people place on the same lane can overlap.
- Undo does not always return a field to its earlier value. When another person wrote the field concurrently, undo reveals that person's value.
- Storage for deleted entities is not reclaimed in this design.

The materialized document satisfies these invariants.

| Code | Invariant |
| --- | --- |
| I1 | Every clip names a track that is present and whose type accepts the clip. |
| I2 | `durationMs` is at least 1 and `startMs` is at least 0. |
| I3 | Ids are unique within each array. |
| I4 | Tracks have a total order with contiguous `index` values. |
| I5 | The `parentId` relation between clips has no cycle. |
| I6 | Array sizes are within the schema limits. |

## State model

The state is a map from entity id to entity. Tracks, clips, markers, track folders, media tracks, transcript segments and clip versions are entities. Each entity has a type, an optional parent entity, a set of registers and two existence vectors.

### Identifiers

An actor is one installation of a client editing one document. The actor id is stable across sessions. A dot is a pair of actor and sequence number, and each transaction has one dot. Sequence numbers of one actor are contiguous, so a version vector with entry `n` for an actor covers that actor's transactions 1 to `n`. A stamp is a hybrid logical clock value of wall time, counter and actor, which gives a total order.

A transaction holds at most one write per entity and register. The rule is in the transactions section. It follows that a dot identifies at most one sibling in a register, and that dot, entity and register together identify a write.

### Registers

A register holds a set of siblings.

```ts
type Sibling = { value: Json; dot: Dot; stamp: Stamp; fallback: boolean };
type Register = Sibling[];
```

Two writes change a register.

| Write | Effect |
| --- | --- |
| `set(value, seen)` | Remove the siblings whose dots are in `seen`. Add a sibling with the value, the transaction's dot and stamp, and `fallback: false`. |
| `retract(dots, restore?)` | Remove the siblings whose dots are in `dots`. When `restore` is given, add a sibling with that value, the transaction's dot and stamp, and `fallback: true`. |

The displayed value is the highest-stamp sibling among those with `fallback: false`. When there is none, it is the highest-stamp fallback sibling. A register has a conflict when it holds more than one sibling with `fallback: false`. Fallback siblings never appear in a conflict.

Both writes remove named dots and add at most one sibling. Concurrent writes do not name each other, so the resulting set is the same in every delivery order. The displayed value is a function of the set.

### What a write names

Revision 2 gave two different answers. This table is the only rule.

| Author | `seen` or `dots` contains |
| --- | --- |
| Ordinary edit | The displayed sibling, every sibling written by the same actor, and every fallback sibling the replica holds |
| Explicit conflict resolution | Every sibling the replica holds |
| Undo and redo | As defined in the undo section |
| Whole-document adapter | The ordinary edit rule, evaluated on the state at the client's base |

Changing a field that has a conflict does not acknowledge the alternatives. The other people's values stay, and the conflict notice continues with the new displayed value. A person removes them only by choosing a value in the conflict UI. A legacy client that never shows alternatives therefore never removes one.

An actor's ordinary edit always names that actor's earlier siblings, so a register holds at most one non-fallback and one fallback sibling per actor. The state has no other limit on siblings. A limit that drops the lowest stamp would break convergence, because a later write can name the dropped sibling on one replica and find it missing on another.

A register group such as `placement` with `trackId` and `startMs` is one register whose value is the whole tuple.

### Existence

Existence does not read registers. Each entity carries two version vectors.

| Vector | Content | Updated by |
| --- | --- | --- |
| `touched` | For each actor, the highest sequence number of a reviving write that touched the entity | `create`, reviving `set`, `touch` |
| `removed` | The pointwise maximum of the `observed` vectors of all deletes of the entity | `delete` |

A reviving write touches the entity it writes, every ancestor of that entity, and every entity in its `touches` list. A client puts the track into `touches` for each write into a clip: the track the write places the clip on, or otherwise the track of the clip's displayed placement on the authoring replica. The list is part of the write, so every replica applies the same touches.

An entity is alive when some actor has a `touched` entry greater than its `removed` entry. An entity is visible when it and all its ancestors are alive. A `delete` carries `observed`, which is the entity's `touched` vector on the deleting replica. Both vectors only grow and merge by pointwise maximum. A deleted entity keeps its registers.

| Case | Rule |
| --- | --- |
| Concurrent deletes | The entity is absent when each reviving write was observed by at least one of the deletes. |
| Resurrection | A reviving write that no delete observed makes the entity alive again with its registers. |
| Delete after resurrection | A delete whose `observed` covers the reviving dot removes the entity again. |

### Deleting a track

Deleting a track is one transaction. It holds a `delete` of the track and a `delete` of every clip that the deleting replica displays on that track, each with that entity's own `observed`. A track delete that observed a placement therefore removes the placed clip with the track.

| Concurrent with the track delete | Result |
| --- | --- |
| Nothing | The track and its clips are absent. |
| Someone moves a clip from the track to another track | The move was not observed, so the clip is alive on the other track. The deleted track stays absent. |
| Someone moves a clip onto the track | The move touches the clip and the track. Both are alive. The track holds that clip only. |
| Someone edits a clip on the track without moving it | The edit touches the clip and, through `touches`, the track. Both are alive. The other clips are absent. |

Undo of a track delete is a `touch` on the track and on each clip the delete removed.

A clip can still end up alive with an absent track. Alice moves a clip to track 2. Bob, who has not seen the move, renames the clip, which touches the clip and track 1. Carol has seen only Alice's move and deletes track 2 with the clip. Bob's write keeps the clip alive. Its only placement value names track 2, which is absent. Materialization handles this case and reports it. It is a normal outcome of these rules and not a sign of damaged state.

Track order uses a fractional key in an `order` register. Ties sort by entity id.

## Transactions and merge rules

A transaction is the unit of authoring, transport and undo. It is not a unit of conflict resolution.

```ts
type Transaction = {
  dot: Dot;
  stamp: Stamp;
  deps: VersionVector;      // delivery order only
  writes: Write[];
};

type Write =
  | { kind: "create"; entity: Id; type: EntityType; parent?: Id;
      registers: Record<string, Json>; reviving: boolean; touches?: Id[] }
  | { kind: "set"; entity: Id; register: string; value: Json; seen: Dot[];
      reviving: boolean; touches?: Id[]; displayStamp?: Stamp }
  | { kind: "retract"; entity: Id; register: string; dots: Dot[];
      restore?: Json }
  | { kind: "delete"; entity: Id; observed: VersionVector }
  | { kind: "touch"; entity: Id };
```

`retract` adds nothing to `touched`. `displayStamp` is used only by redo and is defined there.

### Normalization

The server refuses a transaction that breaks one of these rules. A client coalesces its edits before it sends.

| Code | Rule |
| --- | --- |
| N1 | At most one of `create`, `delete` and `touch` per entity. |
| N2 | At most one `set` or `retract` per entity and register. Each key in a `create`'s `registers` counts as a write to that register, so a transaction cannot create an entity and also set one of the registers it created. The client puts the final value into the `create`. |
| N3 | Every dot in `seen` and `dots`, and every entry of `observed`, is covered by `deps` or belongs to an earlier transaction of the same actor. |
| N4 | A write to an entity needs that entity's `create` in `deps` or in the same transaction. The same holds for `parent` and for every id in `touches`. |
| N5 | The order of `writes` has no meaning. A replica applies creates, then register writes, then existence writes. |

With N1 and N2, no two writes of a transaction act on the same part of the state, so N5 loses nothing.

### Delivery and duplicates

A replica keeps `applied`, a version vector of the transactions it has applied. For an incoming transaction with dot `(a, n)`:

1. When `n` is at most `applied[a]`, the transaction is a duplicate and is dropped.
2. When `n` equals `applied[a] + 1` and `deps` is covered by `applied`, the replica applies all writes in one step and sets `applied[a]` to `n`.
3. Otherwise the transaction waits in a buffer.

A named dot that is not in the register is ignored. This is safe because of N3 and step 2: the dot is covered by `applied`, so the write it refers to was applied and its sibling was already removed by another write.

### What a transaction guarantees

A replica never exposes half a transaction. After that, each register resolves on its own.

Alice moves clips A and B with stamp 10. Bob moves B and C with stamp 11. A displays Alice's value. B displays Bob's value, holds Alice's value as a sibling and has a `conflict` notice. C displays Bob's value. Alice's edit survives in part, and no notice connects A and B. The state does not record which writes formed a transaction, and the surviving siblings cannot reconstruct it once one of them is replaced. A client may group notices by transaction while it still has the log. That grouping is a local hint.

Within one entity the state is sufficient. A `partial` notice is emitted when one dot is the displayed sibling in one register of an entity and a non-displayed sibling in another register of the same entity. It lasts while both siblings exist. A left trim writes `placement` and `extent`. Against a concurrent move, the move can win `placement` while the trim wins `extent`. The clip is valid, matches neither intent, and carries a `conflict` notice on `placement` and a `partial` notice.

### Clips that must stay aligned

The timeline schema has no field that links clips today. Clips have `parentId` for groups, and a group does not share a position. When linked clips are added, their shared position must be one register. The stamp cannot provide it.

The reserved model is a `link` entity with an `anchorMs` register. A linked clip's `placement` holds `link` and `offsetMs` next to `trackId` and its last absolute `startMs`. Materialization computes `startMs` as the anchor plus the offset. Moving the linked clips writes one register, so two concurrent moves leave the clips aligned at one of the two positions and keep the other as a sibling. When the link is absent, the clip uses its stored `startMs`.

### Reviving and non-reviving writes

A write with `reviving: false` updates its register by the sibling rule and adds nothing to `touched`. Registers and existence are separate parts of the state, and each merges without reading the other. A non-reviving write that arrives before a delete and one that arrives after it produce the same state: the register holds the value and the entity is absent.

People's edits are reviving. Writes made by the server or a job are not: job status, progress, derived waveform and thumbnail references. A non-reviving `create` adds its dot to the new entity's `touched` and not to its ancestors.

### Job results

A clip already stores `versions`, and each version records `jobId`, `assetId`, `status` and `dependencyHash`. A job result is a non-reviving `create` of a clip version entity under the clip. The job never writes which version is active.

Materialization derives the active version in this order.

1. The version named by the clip's `activeVersion` register, when that version is visible. Only a person's edit writes this register.
2. Otherwise the successful version with the highest stamp whose `dependencyHash` equals the clip's current dependency hash.
3. Otherwise none, and the clip shows as stale.

A result that arrives for inputs that have since changed is stored and selectable, and it does not replace the output. A result that arrives for a deleted clip does not bring the clip back.

When decision D7 of the PRD is accepted, rule 2 of this list is replaced. The active version then follows the current-result function of the storyboard and script design, revision 3, extension E4: a person's pick, or a request with adoption whose completion recorded a match. A clip can then have versions and no active one, and no version becomes active by matching alone. The outcome of T7 is the same under both rules.

## Materialization and notices

Materialization is a pure function from state to a document and a list of notices. It reads no clock, no media metadata and no transaction log. The TypeScript and C++ implementations must return identical output for every fixture.

### What materialization does not do

Revision 1 moved overlapping clips to a derived overflow lane. That is removed. Overlapping clips on one lane are legal in the editor. A later picture clip with no explicit transition fades in across the overlap, and an audio cross-fade is two overlapping clips with fades. Moving a clip to another track would change compositing order, track effects, mute state and routing, so materialization never changes a clip's track.

Materialization also does not clamp a clip to the length of its source. The source length is media metadata outside the replicated state. A client that has the metadata shows a warning as it does today and writes nothing.

A client that applies a remote transaction can compare overlaps before and after and show a hint when a merge created one. The hint is local and transient. It is not part of the state.

### Steps

The steps run in this order. Each later step sees only what earlier steps kept.

1. Existence. Keep visible entities.
2. Limits. When an array exceeds its schema limit, keep the entities with the lowest create stamp, then lowest id, and mark the rest detached. This runs before references so that nothing later refers to an entity that was cut.
3. Display. Choose the displayed sibling of each register by the rule in the state model. Emit `conflict` and `partial` notices.
4. Links. Compute `startMs` for linked clips.
5. References. When the displayed placement of a clip names a track that is not kept, use the highest-stamp non-fallback placement sibling whose track is kept. When there is none, the clip is detached. Either result emits a notice.
6. Groups. When `parentId` values form a cycle, every clip on the cycle materializes without a parent. The renderer already resolves a cycle this way.
7. Cross-register clamps. Fades longer than the clip are shortened to its duration. No step shortens `extent`, and `extent` is validated as a whole when written, so no duration falls below 1.
8. Order. Sort tracks by order key and id, and assign `index`.
9. Derived values. Choose each clip's active version.

A detached clip stays in the state with its registers and is left out of the document arrays. A person can place it again from the notice. Nothing chooses a new track for it. Detachment happens on limit overflow and in the track deletion case described in the state model.

### Track type

A track's `type` is written by `create` and has no `set`. The server refuses a transaction that places a clip on a track whose type does not accept it. Both facts are known when the transaction is validated, because the track's create is in the transaction's dependencies. A concurrent edit cannot make a valid placement incompatible.

### Notices

| Kind | Emitted when | Ends when |
| --- | --- | --- |
| `conflict` | A register holds more than one non-fallback sibling. Lists each value, actor and stamp. | A person resolves it, or the authors of the other values replace them |
| `partial` | One dot is the displayed sibling in one register of an entity and a non-displayed sibling in another register of that entity | Either sibling is removed |
| `replaced` | Step 5 used a placement sibling other than the displayed one | The placement is rewritten or the track returns |
| `detached` | A visible entity has no place in the document | It is placed or deleted |
| `cycle` | A group cycle was resolved by removing parents | A parent is rewritten |
| `clamp` | A fade was shortened | The fade or the extent is rewritten |

No notice spans entities. A notice needs no information beyond the current state.

Notices are computed from state. They are the same on every replica and they survive restart, snapshot transfer and collection.

## Undo and redo

Undo is local and selective. It reverses the person's own transactions, newest first. Each entry on the undo stack keeps the transaction's dot, its writes, and for each `set` the value and stamp it wrote and the value the author's replica displayed before the write. Each `set` also takes part in the undo chain of its register, defined below.

### Decision

Undo of a value is a retraction and not a competing write. Revision 2 wrote the prior value with a new stamp, which displayed it over another person's concurrent value. The alternative of treating undo as an ordinary write was rejected, because it makes the newest undo outrank work the undoing person may never have seen.

### Undo chain

Revision 3 kept only the dot of an entry's own transaction. That fails with one user. The value is 0. Alice writes 10 with dot `a:1` and 20 with dot `a:2`, and the second write removes `a:1`. Undoing the second write restores 10 as a fallback with dot `a:3`. Undoing the first write then finds `a:1` absent and does nothing, so Alice cannot get back to 0. The value 10 is in the register, under a dot the first entry does not know.

For one actor and one register, the entries E1 to En that wrote the register form a chain in stack order. The actor keeps link cells L0 to Ln beside them. Li holds the dot of the sibling that currently stands for the value after Ei. L(i-1) holds the dot of the sibling that stands for the value beneath Ei. When Ei is written, Li is the dot of its transaction. Cells are local to the actor and are never sent.

| Action | Condition | Emitted write | Cell update |
| --- | --- | --- | --- |
| Undo of Ei | Li is a sibling in the register | `retract` with `dots` holding Li and `restore` holding the value that was displayed before Ei. When nothing was displayed before Ei, there is no `restore`. | L(i-1) becomes the dot of this retract, or empty when it restored nothing |
| Undo of Ei | Li is absent | Nothing. Someone replaced or resolved the value after seeing it. The person is told, and the entry counts as undone. | None |
| Redo of Ei | L(i-1) is a sibling, or it is empty and nothing was displayed before Ei | `set` of Ei's value with `seen` holding L(i-1) and the actor's own siblings, and `displayStamp` holding Ei's original stamp | Li becomes the dot of this set |
| Redo of Ei | Otherwise | Nothing. Someone wrote the register after the undo. The person is told. | None |
| New edit after undos | Always | An ordinary `set`. It names the actor's own siblings and every fallback, which includes the cell of the top entry still in effect. | The undone entries and their cells are dropped. The new entry is appended with its own cell. |

The example again. Undo of E2 retracts `a:2` and restores 10 with dot `a:3`, and L1 becomes `a:3`. Undo of E1 finds L1 in the register, retracts `a:3` and restores 0 with dot `a:4`, and L0 becomes `a:4`. The register displays 0. Redo of E1 sets 10 with `seen` holding `a:4` and the stamp of `a:1`, and L1 becomes its dot `a:5`. Redo of E2 sets 20 with `seen` holding `a:5` and the stamp of `a:2`.

When another person removes the sibling that a cell names, the undo of that entry is skipped, and so is the undo of every entry beneath it in that register. Each of those entries had its cell removed by the entry above it, and only an undo writes a cell again (T22d). An undo or redo of a transaction with several writes is one transaction that holds the writes whose conditions are met.

I ran the revision 3 rule and the chain as a model of one register with two actors and every causal delivery order, in `crdt_traces.py` in the project files. The revision 3 rule stops at 10 as described. The chain passes T22a to T22e and converges. The model has no server, one register and no recovery.

### Undo of a `set`

The client emits `retract` with `dots` holding the entry's link cell and `restore` holding the recorded prior value. For an entry that was never undone and redone, the link cell is the dot of the write itself. In the table below, "the undone dot" means the link cell.

| State of the register on the undoing replica | Result |
| --- | --- |
| The undone dot is the only non-fallback sibling | The fallback value is displayed. The field returns to its prior value. |
| The undone dot and other people's siblings are present | The author's value is removed. The highest-stamp remaining value is displayed, whether or not it was displayed before. The fallback sibling is stored and not displayed. |
| The undone dot is absent | Someone replaced or resolved the value after seeing it. Nothing is emitted for this register and the person is told. |

In the review's example the original value is 0, Alice writes 10 and Bob concurrently writes 20 with the higher stamp. Alice undoes. The register holds Bob's 20 and a fallback 0. It displays 20, and it has no conflict. If Alice's stamp had been higher, 10 would have been displayed before the undo and 20 after it. Undo reveals Bob's value. It does not bring back 0, because 0 is nobody's current intent while Bob's value exists.

A transaction that arrives later and was concurrent with the retraction behaves the same way. Its sibling is not a fallback, so it is displayed over the restored value on every replica.

### Redo of a `set`

Redo emits a `set` of the undone value. `seen` holds the link cell beneath the entry and the actor's own siblings. That cell is the fallback dot that the undo added, unless a deeper entry was undone and redone since, in which case it is the dot of that redo. `displayStamp` holds the stamp of the original write, and the new sibling carries that stamp in place of the transaction's stamp. The register then displays what it displayed before the undo. `displayStamp` may not exceed the transaction's stamp. When the cell's sibling is absent, someone wrote the register after the undo, and redo is skipped for it.

### Undo of `create` and `delete`

| Undone write | Emitted write | Behavior against other edits |
| --- | --- | --- |
| `create` | A `delete` whose `observed` holds only the author's own entry from `touched` | The delete cannot cover another actor's dot, so an edit by anyone else keeps the entity alive, whether it was seen or arrives later. When the local replica already shows another contributor, nothing is emitted and the person is told. |
| `delete` | A `touch` on each entity the delete removed | The entity returns with its registers. A concurrent delete that did not observe the touch leaves it alive. A later delete that observed it removes it. |

Redo of an undone create is a `touch`. Redo of an undone delete is a `delete` whose `observed` is the original vector joined with the dot of the undo's `touch`.

Undo of a move of linked clips is a `retract` on the link's anchor.

## Clocks, delivery and collection

### Clocks

A stamp is a hybrid logical clock value. A client sets it above every stamp it has seen, so a write that names a sibling always has a higher stamp than that sibling. The server refuses a transaction whose wall time is more than five minutes ahead of its own clock. Stamps choose the displayed sibling and nothing else. A wrong clock can change which concurrent value is displayed. It cannot remove a value or an entity.

### Delivery

The server is the hub. Clients send transactions to it and receive from it. Every replica applies transactions by the delivery rule in the transactions section. The server assigns no order beyond that.

A snapshot is a state together with its frontier, a version vector. The state holds the effect of exactly the transactions the frontier covers. The server sends a snapshot to a client that is behind the retained log.

1. The client checks that the frontier covers every transaction it has received from the server. The server is the only source, so this holds unless the server lost data, in which case the client stops and reports.
2. The client replaces its state with the snapshot and sets `applied` to the frontier.
3. The client applies its own pending transactions in sequence order. Their `deps` hold only transactions the client had received, which the frontier covers.

After step 2, a dot that a pending write names and that is missing from a register is covered by `applied`, so the ignore rule applies as it does in log replay.

### Collection

Collection in this design is truncation of the transaction log. The server drops a prefix of the log when every connected client has acknowledged it or when it is older than the log retention period. No merge rule reads the log, and a client behind the retained log receives a snapshot. The state is unchanged, which is G6.

### Tombstones are not removed

Revision 2 dropped the tombstone of an entity 90 days after its delete and let a late editor recreate the entity. That is withdrawn. The second review showed that removal loses more than register values. Alice creates an entity with dot `a1`. It is deleted and its tombstone is dropped. Bob returns with a late delete that observed `a1`, and Carol returns with a late edit. Without removal, the entity's vectors hold `a1` and Bob's delete, and Carol's edit revives the original entity. With removal, Carol recreates the entity with a new contribution that Bob's delete cannot cover, so existence and later undo differ. Two offline clients could also recreate different versions of one id.

A deleted entity keeps its id, type, parent, registers and both vectors without a time limit. The cost is storage, which phase 0 measures against a budget.

A later design may remove tombstones. It has to define one of the following, and it needs its own review.

- Retained deletion metadata: which fields of a tombstone are kept so that late deletes, late edits and undo give the same result as without removal.
- An epoch boundary: a point after which older transactions are refused, with the recovery exception documented in full, including concurrent recreation of one id, the immutable type, ownership and children.

### Test for G6

For every fixture and every random history, the prototype truncates the log at a random point, restarts one replica from a snapshot, delivers the remaining transactions including late ones, and compares state, document and notices with a run that never truncated.

## Server role

### Validation

The server validates a transaction before it applies or forwards it. It checks authorization, the schema of each written value, sequence contiguity for the actor, that `deps` is known, the stamp bound, track type on placement, and that no write targets an immutable field. A transaction is accepted or refused as a whole. A refusal carries a code and the index of the failing write.

### Recovery from a refused transaction

A client applies its pending transactions locally before the server sees them. When the server refuses the transaction with dot `(a, n)`, it has applied nothing from actor `a` with a sequence number of `n` or higher, and it will accept none of the later pending transactions, because sequence numbers are contiguous. Those sequence numbers are unused on every other replica, so the client keeps its actor id and reuses them.

Recovery works on whole transactions. It never removes a single write from a transaction.

### Dependents

A pending transaction U depends on a pending transaction T when one of these holds, directly or through another pending transaction.

- A `seen`, `dots` or `observed` value in U names T's dot.
- U writes to, parents under, touches or places a clip on an entity that T creates.
- U is the undo or redo of T.

### Steps

1. Mark the refused transaction and all its dependents as void.
2. Discard the local state and load a snapshot from the server.
3. Take the surviving pending transactions in their original order and give them new sequence numbers from `n`. Record a map from each old dot to its new dot.
4. Rewrite references in each surviving transaction. A dot of an accepted transaction is unchanged. A dot in the map is replaced by its new dot. In `observed` and `deps`, the entry for actor `a` becomes the new sequence number of the last surviving transaction whose old number was at most the old entry, or `n - 1` when there is none. Stamps are unchanged.
5. Validate each surviving transaction with the server's rules against the snapshot and the transactions reissued before it. A transaction that fails is void together with its dependents, and steps 3 to 5 run again for the rest.
6. Apply and send the surviving transactions.
7. Move the void transactions to a local list of unsent edits with their values, and show the list to the person. Rewrite the undo stack with the map and remove the entries of void transactions.

### Examples

Pending A sets a value to 10 with dot `a:5`. Pending B sets it to 20 and names `a:5`. An unrelated pending transaction `a:4` is refused. A becomes `a:4` and B becomes `a:5`, and B's `seen` is rewritten from `a:5` to `a:4`. The register holds 20 and has no conflict.

A transaction that creates a track is refused. The pending transaction that creates a clip on that track depends on it and is void as a whole. Both appear in the list of unsent edits. A later pending transaction that edits an unrelated clip is reissued.

A value that another person wrote concurrently was not named before recovery and is not named after it, so it remains a sibling.

### Fields that hold causal identity

Revision 3 rewrote `seen`, `dots`, `observed`, `deps` and the undo entries. The storyboard and script design adds fields that also hold dots or vectors. A reissue that leaves one of them unchanged alters behavior: a pick that is reissued under a new dot is no longer in a later request's `selectionSeen`, and that request's adoption stops applying. Recovery therefore uses one visitor with a rule per field type. It runs in the recovery after a refusal and in the reissue under a new actor (amendment A2). A profile declares the type of every field in its payloads and register values. A field with no declared type fails the build of the profile, so a new field cannot be missed.

| Field type | Fields | Rule |
| --- | --- | --- |
| Dot in this document | `seen`, `dots`, the `restores` of a selection value, a request's `selectionSeen` for its parent entity, undo entries and link cells | Replaced by the map. A dot of an accepted transaction is unchanged. |
| Vector in this document | `deps`, `observed`, `readFrontier` | The reissuing actor's entry is rewritten as in step 4. Under a new actor, the old actor's entry is cut to the last sequence number shared with the server, and the new actor gets an entry. |
| Dot or vector in another document | A request's `selectionSeen` for a linked timeline clip, and the copy of it in a pushed clip version | Never rewritten by this document's recovery. When the other document reissues the dot, the reference names a dot that no sibling has. The request then does not cover that pick, and its adoption is not in effect there. The failure is toward not adopting. |
| Stamp | Sibling stamps, `displayStamp`, `sourceOrder` | Unchanged |
| Allocator component | The actor and counter inside an order key | Unchanged. See the next paragraph. |
| Derived identity | Keyed entity ids, the creating dot of a relation, the predecessor digest | Not stored as a reference. Computed again from the reissued transaction. |
| Written by the server | The frontier in a completion, the completion's dot on the ledger | The server does not run recovery, and a client never reissues a server transaction |

A pending create whose immutable payload holds a dot from the map is reissued with the rewritten payload. The server never accepted the first form, so it holds no payload for that id, and the rule against a second payload does not apply.

Equal order keys. Two copies of one actor allocate with the same actor id and counter and can return the same key for two entities. Regenerating a key during recovery would move an entity that a person placed, and it cannot change a key that the other copy already had accepted. Keys are therefore kept, and the order stays total by a tie rule: equal keys sort by entity id. The allocator's claim that no two keys are equal holds for an actor that was never copied. After a reset the new actor id starts its counter at 1. Its keys cannot equal an earlier key, because the actor component differs.

The first rule under Dependents covers every field of the first three types: U depends on T when any of them names T's dot.

### Whole-document clients

Clients that do not speak transactions save the whole document with the `updated_at` of the version they loaded, as they do today. The server converts the save to one transaction. Revision 1 stated two different diff bases. The rule is now one.

The server keeps, for each document version it has served to a whole-document client, the state at that version. The proposed retention is the last 20 served versions and at most 24 hours.

The server authors the transaction with one actor per user and legacy client. It follows the ordinary edit rule from the state model, evaluated on the state at the base.

| Situation | Behavior |
| --- | --- |
| The base is the current version | Diff the submitted document against it. Each changed register group becomes a `set` that names the displayed sibling, the actor's own siblings and the fallback siblings. |
| The base is retained and older | Diff the submitted document against the base. Each changed group becomes a `set` that names the same three kinds of sibling as they were at the base. Registers the client did not change are not written. |
| The base is not retained | Return the existing `CONFLICT` response. The client reloads, runs its own three-way merge and saves again with a current base. |

In the first review's example Dana and Alex both load the original. Dana saves a new start for a clip. Alex saves a new start for the same clip from the old base. Alex's write names the original value. Dana's value is not named, so it stays as a sibling and a `conflict` notice lists both. Alex's value is displayed because its stamp is newer, which is the draft-wins rule of ADR 0001.

A legacy save never performs an explicit resolution. Alternatives that a legacy client does not show stay in the state until someone resolves them in a client that shows conflicts.

| Diff result | Write |
| --- | --- |
| Entity in the base and missing from the submission | `delete` with `observed` set to the entity's `touched` at the base. Edits made after the base keep the entity. |
| Entity missing from the base and present in the submission | `create` |
| Entity created by others after the base | No write. The client never saw it, so its absence is not a delete. |

The response contains the materialized document and notices after the merge, and the client replaces its copy with it.

The timeline file in the project folder (F14) is a further whole-document client. Under the default for D21 of the technical design, the file is a projection written after each transaction. An edit to the file is diffed against the last file NodeTool wrote, which serves as the base, by the rules of this section. Counterexample to diffing against the current state: a remote transaction moves clip A while another app shortens clip B in the file. Against the current state, the file's old position of A reads as a move back. Against the last written file, only the change to B is a write. If Matthias chooses the file as the authority instead, this paragraph is withdrawn, and the technical design states how the replicated state follows the file.

## Amendments from the PRD

The PRD's amendments A1 to A5 are part of this design from revision 4. Where earlier text disagrees, this section holds.

| Code | Rule |
| --- | --- |
| A1 | Refusals have two classes. Class 1 is an invalid transaction, handled by the recovery above. Class 2 is authorization or lifecycle: access removed, or the document deleted. A class 2 refusal happens to a correct client. Every pending transaction then moves to the unsent list as a whole, and none is reissued to that document. |
| A2 | A transaction carries the content digest of the actor's previous transaction. The server keeps a content digest per actor and sequence number for as long as the document exists, and log truncation does not remove it. It accepts by the cases I1 to I5 below. A diverged copy takes a new actor id and reissues through the recovery procedure with the recovery visitor. A second live connection for a connected actor takes a new actor id before it writes. |
| A3 | Restoring a version is a new transaction that writes the restored content as ordinary edits. It never rewinds a vector and never removes an alternative it did not observe. |
| A4 | An explicit resolution is written to a durable activity record with the values it removed. This closes Q6. |
| A5 | The server materializes the document for viewers and sends them no replicated state. |

| Case | Condition | Result |
| --- | --- | --- |
| I1 | The sequence number is the actor's next one, and the predecessor digest equals the stored content digest of the previous transaction | Accepted. Its content digest is stored. |
| I2 | The sequence number was already accepted, and the content digest equals the stored one | A repeat. It is dropped and acknowledged as accepted. |
| I3 | The sequence number was already accepted, and the content digest differs | Diverged actor. Refused. |
| I4 | The sequence number is the actor's next one, and the predecessor digest differs from the stored content digest | Diverged actor. Refused. |
| I5 | The sequence number is beyond the actor's next one | Out of order. The server answers with the number it expects. |

The content digest is computed over the exact bytes of every string. No Unicode normalization is applied, because it would give two different transactions one digest.

## Intent records for ripple and split

Revision 1 stored a shift record for a ripple edit and an inheritance record for a split, and it dropped them once they were stable. Dropping a shift record moved a clip back. Intent records are removed from the core.

### Behavior without them

| Edit | Writes | Result against a concurrent edit |
| --- | --- | --- |
| Ripple insert or delete | One `placement` write per shifted clip | A clip that another person adds to the lane concurrently is not shifted and can overlap its neighbors. The overlap is legal and visible. |
| Split | A `set` on the original's `extent` and a `create` for the right half | A property that another person changes on the original concurrently does not reach the right half. |

Both results are deterministic and valid, and both lose intent. The first releases ship with this behavior and say so.

### Conditions for adding intent records later

An intent record changes how other registers are read, so removing one changes the document unless its effect is first written into those registers. A later design must meet all of these conditions.

1. An intent applies only to a write that is concurrent with it. A write that observed the intent has already taken it into account.
2. The server folds an intent at a numbered checkpoint. Folding writes the intent's effect into each affected register value and keeps the sibling's dot and stamp, so later writes that name the sibling still match.
3. A client's acknowledgement of a checkpoint states that it has sent every transaction it created before it received the checkpoint. Without that statement, an intent is not stable.
4. The server refuses a transaction created before a checkpoint it does not include. The client rebases its pending writes onto the folded state and keeps their `seen` values.
5. The fold passes the G6 test: materialization before and after the fold is identical, and so is the result of a transaction delivered afterward.

This is research work with its own review. It does not block the core.

## Automerge comparison and phase 0

### Automerge

Revision 1 rejected Automerge on two grounds: that it merges inside a clip's fields, and that it discards losing values. Both were wrong. A register group can be stored as a whole-object value that is replaced, never merged. `getConflicts()` returns the concurrent values that lost. Automerge also provides tested causal bookkeeping, a compact format, sync and a Rust core with a C interface that Qt can call.

The remaining differences are narrower, and none is established without a test.

| Code | Question | What the prototype measures |
| --- | --- | --- |
| Q1 | Does Automerge's map delete give edit-beats-delete, including edits into children and references to tracks? If not, existence needs a layer above it. | The existence fixtures against both implementations |
| Q2 | Can undo of a create be limited to the author's own contribution? | The undo fixtures |
| Q3 | Can a job write avoid reviving an entity? | The job fixtures |
| Q4 | How large are the document and the history for a real timeline, and how long do load and materialization take in TypeScript and in C++? | A 5,000-clip document with 50,000 edits |
| Q5 | Does history compaction keep the conflict information? | The G3 and G6 tests |

### Phase 0: executable semantic prototype

Phase 0 builds two implementations of one interface in TypeScript: the core specified here and a variant on Automerge. Both run in memory against a simulated network that reorders, delays, duplicates and partitions. No production code depends on either.

The fixtures are written before either implementation, with the expected state, document and notices checked in. Every fixture runs in all delivery orders that its transactions allow.

| Code | Fixture | Expected outcome |
| --- | --- | --- |
| T1 | Alice moves A and B, Bob moves B and C with the higher stamp | A displays Alice's value. B displays Bob's value, holds Alice's value and has a `conflict` notice. C displays Bob's value. No `partial` notice. |
| T2 | Left trim against a concurrent move | Valid clip, `conflict` on `placement`, `partial` on the clip |
| T3 | Write, concurrent overwrite, delete that saw only the overwrite | The entity is alive |
| T4 | Two concurrent deletes with different observations, then a late edit | The entity is alive after the late edit and absent before it |
| T5 | Create, another person's edit, undo of the create | The entity stays |
| T6 | Delete, undo, concurrent delete | Alive. A later delete that saw the undo removes it. |
| T7 | Job result before and after a delete, and after an input change | The clip is not revived. The stale result is stored and not active. |
| T8 | Dana and Alex save whole documents from one base | Both values are retained with a `conflict` notice |
| T9 | Whole-document save with a missing base | `CONFLICT`, then a save from a current base succeeds |
| T10 | Random histories with all write kinds, random delivery, duplicates and partitions | G1 on state, document and notices |
| T11 | Serialize, restart, continue | Same as an uninterrupted run |
| T12 | Snapshot transfer to a client with pending transactions | Same as log replay |
| T13 | Log truncation at a random point, then late transactions | G6 |
| T14 | Stamp more than five minutes ahead | Refused. Recovery as in T16. |

The second review's cases:

| Code | Fixture | Expected outcome |
| --- | --- | --- |
| T15a | Value 0. Alice writes 10, Bob concurrently writes 20 with the higher stamp. Alice undoes. | Displays 20. Siblings are Bob's 20 and a fallback 0. No conflict. |
| T15b | As T15a with Alice's stamp higher | Displays 10 before the undo and 20 after it |
| T15c | Alice writes 10 with no concurrent write, then undoes, then redoes | Displays 0 after undo and 10 after redo. After redo the sibling carries the original stamp. |
| T15d | As T15a, then Alice redoes | Displays 20, with Alice's 10 as a sibling and a `conflict` notice, as before the undo |
| T15e | Alice writes 10. Bob sees it and writes 20. Alice undoes. | Nothing is emitted. Displays 20. |
| T16a | Pending `a:4` is refused. Pending `a:5` sets 10 and pending `a:6` sets 20 naming `a:5`. | After recovery one sibling with value 20 and no conflict |
| T16b | A refused track create followed by a clip create on that track and an unrelated edit | The clip create is void as a whole. The unrelated edit is accepted. Two entries in the unsent list. |
| T16c | A pending delete that observed a pending edit of the same actor, with an earlier transaction refused | The entity is absent after recovery |
| T17 | Alice creates an entity. It is deleted. The log is truncated. Bob's late delete that observed `a1` and Carol's late edit arrive in both orders. | The same state in both orders and the same as without truncation. The entity is alive with its original registers and Carol's edit. Carol's undo of her edit returns the field to its earlier value and leaves the entity alive, because a retraction does not change existence. |
| T18a | A clip is placed on a track. Someone who saw the placement deletes the track. | The track and the clip are absent |
| T18b | Track delete concurrent with a move of one of its clips to another track | The clip is alive on the other track. The deleted track is absent. |
| T18c | Track delete concurrent with a move of a clip onto the track | The track and that clip are alive |
| T18d | Track delete concurrent with a rename of a clip on the track | The track and that clip are alive. The other clips are absent. |
| T18e | The Alice, Bob and Carol case from the state model | The clip is detached with a notice |
| T19 | T2, then a third person rewrites `extent` | The `partial` notice ends. The `conflict` on `placement` stays. |
| T20a | Bob's value is displayed and Alice's is a sibling. Carol makes an ordinary edit. | Carol's value is displayed. Alice's value stays. The `conflict` notice lists Carol's and Alice's values. |
| T20b | As T20a, then Carol resolves explicitly | One sibling, no notice |
| T20c | As T20a with Carol on a legacy client | Same as T20a |
| T20d | Three actors alternate 1,000 concurrent ordinary edits to one register | At most three non-fallback siblings at any time |
| T21a | A transaction that creates an entity and sets a register the create contains | Refused under N2 |
| T21b | Every transaction of T10 delivered twice | Same state as single delivery |
| T21c | A transaction that names a dot outside its `deps` | Refused under N3 |
| T21d | A snapshot whose frontier does not cover a transaction the client received | The client stops and reports |

Fixtures added in revision 4. The one authoritative list for all three profiles is fixture suite version 2 in revision 3 of the storyboard and script design. T1 to T21 are in it unchanged.

| Code | Fixture | Expected outcome |
| --- | --- | --- |
| T22a | The value is 0. Alice writes 10, 20 and 30. She undoes three times and redoes three times. Nobody else writes. | Displays 20, 10, 0, 10, 20, 30. At the end the register holds one sibling, not a fallback, with the stamp of the original third write. |
| T22b | As T22a. Bob writes 7 concurrently with all of Alice's writes. | Bob's 7 is displayed after each undo. After the third undo the siblings are Bob's 7 and a fallback 0. Each redo returns Alice's value as a sibling of Bob's, with a conflict notice. |
| T22c | As T22a. Bob's concurrent 7 arrives between the first and the second undo. | The same states as T22b from that point on |
| T22d | As T22a. After the first undo, Bob sees the restored value and writes 50. Alice undoes twice and redoes three times. | Every later undo and redo is skipped for this register, and Alice is told. Displays 50. |
| T22e | Alice writes 10 and 20, undoes, writes 25, and undoes twice | Displays 25, 10, 0 |
| T23a | Pending writes of 10 with `a:5` and 20 with `a:6`, and a pending undo of the second with `a:7`. Pending `a:4` is refused. | After recovery the link cells name the new dots. One more undo displays the value from before the first write. |
| T23b | Two copies of one actor each insert a different track into the same gap, with equal order keys. One is refused as diverged and reissues under a new actor. | Both tracks are present with equal keys, and they sort by entity id on every replica |
| T23c | T16c under a new actor: a pending delete that observed a pending edit of the old actor, both reissued | The entity is absent after recovery. `observed` holds an entry for the new actor. |

### Budgets

The measurement document has 5,000 clips on 40 tracks, 50,000 transactions from 8 actors, and 20,000 deleted entities. These numbers are proposals for you to confirm or change before phase 0 starts.

| Code | Measure | TypeScript | C++ |
| --- | --- | --- | --- |
| B1 | Apply one remote transaction and update the materialized document | 2 ms | 1 ms |
| B2 | Materialize the whole document | 50 ms | 20 ms |
| B3 | Load the state from storage | 300 ms | 150 ms |
| B4 | Stored state, relative to the JSON document | 4 times | 4 times |
| B5 | Snapshot on the wire, compressed, relative to the compressed JSON document | 3 times | 3 times |
| B6 | Memory for the state, relative to the parsed JSON document | 5 times | 5 times |
| B7 | Catch up on 1,000 missed transactions | 500 ms | 250 ms |

The C++ column for the Automerge variant is measured through its C interface. The custom core has no C++ implementation in phase 0, so its C++ numbers are estimated from the TypeScript run and marked as estimates.

### Gate

A candidate that fails a fixture is out unless the failure is fixed within phase 0. Between candidates that pass, the decision compares three things and records the numbers.

1. Budgets B1 to B7.
2. Total implementation burden: the code we would own in TypeScript and again in C++, the merge rules we would have to prove and test ourselves, and the sync, persistence and encoding we would write or take from a library.
3. Integration cost: binary size, build, and the interface between the library and the Qt application.

A layer for existence and undo on top of Automerge does not decide the outcome. Such a layer still relies on Automerge's causal bookkeeping, synchronization, persistence and encoding, and that is counted under point 2. If neither candidate passes, the design returns to review.

### Later phases

| Phase | Content | Validates |
| --- | --- | --- |
| 1 | Shadow mode on the server. Every whole-document save also goes through the adapter, and the materialized result is compared with the saved document. | The adapter and the JSON round trip. It does not validate the merge algorithm, because production saves in this phase are serialized by the existing compare-and-swap. |
| 2 | The chosen core in TypeScript and C++ with shared conformance fixtures taken from phase 0 | That both languages agree |
| 3 | Transaction sync for the web editor and the native timeline. Conflict and detached notices in the UI. | Live collaboration |
| 4 | Log truncation in production. Research on intent records and tombstone removal. | Storage growth |

## Risks and open questions

| Code | Risk | Mitigation |
| --- | --- | --- |
| R1 | Conflicts that nobody resolves stay in the state | At most two siblings per actor and register. The UI shows a conflict badge until resolved. |
| R2 | Tombstones grow without limit | Measured under B4 and B6 with 20,000 deleted entities. Removal needs the separate design named in the collection section. |
| R3 | Concurrent deletes remove an entity that no single person saw in full | Stated in the existence rules. Undo of either delete restores it. |
| R4 | Undo reveals another person's value where the person expected the old value | Stated under G7 and in the list of what is not promised. The UI names whose value is now shown. |
| R5 | Detached clips appear in normal use | Only in the case of T18e and on limit overflow. The notice offers placement. |
| R6 | `displayStamp` lets a client write an old stamp | It can only lower a value's rank. The server refuses a value above the transaction's stamp. |
| R7 | Retaining state for served versions costs storage | 20 versions and 24 hours per document, measured in phase 1 |
| R8 | Recovery drops more than the person expects when many pending edits depend on one refused transaction | The unsent list keeps every value. Class 1 refusals are validation failures, which a correct client does not produce. Class 2 refusals happen to correct clients and move every pending edit to the unsent list (amendment A1). |

| Code | Open question |
| --- | --- |
| Q6 | Closed by amendment A4: an explicit conflict resolution is written to a durable activity record with the values that were removed. |
| Q7 | Are the budgets B1 to B7 the right numbers? |
| Q8 | Should an actor id be retired when an installation is removed, and how are its vector entries compacted? |
| Q9 | When linked clips are added to the schema, does the reserved link entity fit the editing model, including slipping one member? |
| Q10 | Should a stale whole-document save be displayed over newer values, as ADR 0001 implies, or should the newer value stay displayed? |
| Q11 | Is revealing another person's value the right result of undo, or should undo be refused while a concurrent value exists? |

I checked the repository findings in the current state section against the code and the native design notes. The undo chain of revision 4 was run as a model of one register, fixtures T22a to T22e. No other rule in this document has been executed. The examples and fixture outcomes were worked by hand, and phase 0 is where they are tested.
