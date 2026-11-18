Editable source: [https://claude.ai/artifact/A3G4EixTAFqyvkkGsFDfZs](https://claude.ai/artifact/A3G4EixTAFqyvkkGsFDfZs). This file is an export, so edit the Claude Doc and export again.

# PRD: Cloud login, upload and sharing for the native graph editor and timeline

Nov 15, 2026 · @Matthias Georgi

## Summary

This is revision 5 of the PRD. Each section states the rules as they are specified now. What each revision changed is in the change log at the end and nowhere else.

Local work needs no account. The native node graph editor and the native timeline sign in through the system browser. The Electron desktop app shares that sign-in (D23). After the native apps, the desktop app gets the same cloud documents, sharing, Publish and Synchronize (D24). A signed-in user opens cloud documents, links a local project to a cloud project and synchronizes it by explicit action, and shares documents and projects.

The main rules:

1. Synchronization timing and merge behavior are separate. A cloud document sends edits while online. A linked local project exchanges changes only when the user asks. A document with CRDT support reconciles at the level of single properties whenever changes are exchanged, in either mode. The "Keep mine / Keep cloud" dialog remains only for formats without that support.
2. A project transfer is a staged operation with a commit, in both directions. CRDT transactions do not make a project and its files arrive together, so the PRD defines that contract itself.
3. Sharing states what a recipient receives. A viewer gets the current content only. Editors get the collaborative state, which contains alternative values and deleted content. A delivery copy is an immutable snapshot.
4. Timelines become replicated documents in phase 3, and scripts and storyboards in phase 5. Until its phase, each stays a whole-document format with today's merge behavior, labelled as transitional.
5. Generating a take, a keyframe or a clip is a recorded request. A separate start command, bound to what the payer approved, runs it once. What plays or shows as current changes only when a person picks, or by adoption under three stated conditions. A finished job never changes it by itself.
6. Links between a script, a storyboard and a timeline are reported, not enforced. A link can be resolved, missing or unavailable, and no save is refused because of one.
7. Edits made by agents, directing runs and jobs keep a person's concurrent edit on screen and offer their own value as an alternative.
8. Sharing, copies, storage and billing state what happens to takes, renders, requests and linked documents. An owner over the storage allowance can free storage.

Nothing in this document is implemented. No acceptance test in it has been run. The CRDT guarantees it relies on are specified and not yet demonstrated. The storyboard and script design is approved for prototyping only, and three of its decisions that change shipped behavior are still open. They are listed under blocking decisions as D7 to D9.

Three documents are behind this PRD. The timeline design has to take amendments A1 to A5, the storyboard and script design A16 to A19, and the technical design A6 to A8 and A20.

## Sources and verification

The repository is nodetool-ai/nodetool at commit 8372b34ee3952c918a4eb66a2cde7e75a72b11bf. F1 to F10 come from an inspection of the code at that commit. F11 to F14 come from a later reading, at the same commit, of the documentation files named and of one source file. F15 to F20 come from reading the code at commit 11a6da4a, main on 2026-11-16. At that commit I rechecked F2, F5, F6, F8, F9, F11 and F12. F8 changed for timelines, and the others hold. I did not recheck F1, F3, F4, F7, F10, F13 or F14. This document is written against revision 3 of the timeline design and revision 2 of the storyboard and script design. I did not read either design again for this revision. What this document says about their recovery procedure, fallback values and extensions rests on my notes of them.

### Verified in the repository

| Code | Finding | Path |
| --- | --- | --- |
| F1 | Project import always creates a new project and gives every row a new id. | `packages/project-services/src/project-archive.ts`, header comment and `IdRemapper` |
| F2 | A project file is limited to 1 GiB and 100,000 entries. One entry is limited to 4 GiB. | `packages/project-services/src/project-archive.ts`, `MAX_PROJECT_ARCHIVE_BYTES`, `MAX_PROJECT_ARCHIVE_ENTRIES` |
| F3 | A project file contains table rows, asset bytes and every file of the project's workspaces. The archived tables include conversations (`threads`, `messages`) and the version tables for workflows, timelines, sketches, apps and JS scripts. | `packages/project-services/src/project-archive.ts`, `packages/models/src/project-archive.ts` |
| F4 | A failed import leaves nothing visible: bytes are stored first and rows are inserted in one database transaction. | `packages/project-services/src/project-archive.ts`, header comment |
| F5 | Per-document sharing with viewer and editor roles covers storyboard, script, timeline, sketch, application and JS script. Workflows have their own sharing. A redeemed link never lowers a role. | `packages/models/src/document-sharing.ts`, `packages/models/src/workflow-share.ts` |
| F6 | Admin permissions `share_links` and `share_public` exist. | `packages/models/src/user-permissions.ts` |
| F7 | A public workflow link shows graph, name and description, and a signed-in visitor can duplicate the workflow. | `docs/workflow-sharing.md` |
| F8 | Moving a document between projects is one column write that leaves `updated_at` unchanged. At 11a6da4a, moving a timeline also moves its file (F17). | `packages/models/src/project-membership.ts` |
| F9 | The timeline router loads a sequence with the viewer role for its version endpoints, so a viewer can read version history today. | `packages/websocket/src/trpc/routers/timeline.ts` |
| F10 | No CRDT library is a dependency and no CRDT implementation exists. | Root and package manifests searched for Automerge and Yjs |
| F11 | A media generation is one durable record, opened before the provider call and keyed by an idempotency key and an input fingerprint. Accepting an existing key with another fingerprint is an error. The record has the submission states accepted, submitting, submitted and submission\_unknown, a provider request id and a durable cancel request. Its cost is the provider's stated cost or the catalog price, later reconciled to the billed amount. | docs/media-generation-tracking-design.md, docs/harnesses.md (nodetool generations), packages/models/src/durable-generation.ts (acceptGeneration) |
| F12 | An ambiguous FAL submission stays submission\_unknown and is not replayed. Recovered output is saved as shot history and selected only when the request still owns selection. Timeline destinations, node history and providers other than FAL still need their own adapters. | docs/plans/generation-recovery.md. Documentation only. The recovery worker was not read. |
| F13 | An agent run has a permission gate and one run budget with a USD cap, which its sub-agents share. | docs/AGENTS.md. Documentation only. |
| F14 | Agent tools exist that delete a saved version of a workflow, a timeline, a sketch and a JS script. | docs/AGENTS.md, capability table. Documentation only. |

Verified at `11a6da4a`.

| Code | Finding | Path |
| --- | --- | --- |
| F15 | An asset in a project is a file at a path in the project folder. A background job fills in its SHA-256 content hash after the row exists, and clears it when the file's fingerprint changes. The bytes can change in place under the same asset id. | `packages/models-core/src/schema/assets.ts`, `packages/project-services/src/project-hash-job.ts` |
| F16 | Each project folder holds `.nodetool/project.json` and an asset manifest `.nodetool/assets.json`. `.nodetool/` is reserved at every depth, and a folder that holds another project is nested and left out of the index, the watcher and export. | `packages/project-services/src/project-manifest.ts`, `packages/runtime-core/src/workspace.ts`, `packages/project-services/src/project-folder-scan.ts` |
| F17 | Workflows and timelines are JSON files in the project folder. The row records the file's path, the hash NodeTool last wrote and the last file error. A save keeps an unseen file edit as a version named "File edit replaced by a save". Moving a timeline to another project moves its file. | `packages/project-services/src/document-file-sync.ts`, `packages/models-core/src/schema/workflows.ts`, `packages/models/src/project-membership.ts` |
| F18 | Opening a folder keeps the ids of a project unknown on this install and of a project whose folder moved. A copy of a folder whose project still has its folder on this install becomes a new project with new ids. | `packages/project-services/src/project-folder-restore.ts`, `packages/websocket/src/lib/project-folder-open.ts` |
| F19 | A linked asset is a file outside the folder, used in place. Collect copies it into `Imported/` and keeps the asset id. Export refuses a project with linked files unless they are collected. | `packages/project-services/src/project-archive.ts` |
| F20 | Scripts, storyboards, sketches, apps, JS scripts and conversations are database rows, not files. One writer per folder is an in-process queue, and no lock file exists. | `packages/project-services/src/document-file-sync.ts`, `packages/asset-services/src/project-asset.ts` |

### Not verified in this pass

These statements come from revision 1 of this PRD, the technical design or the CRDT design. I confirmed them in earlier work on those documents and did not inspect them again at this commit: the three authentication modes, the OAuth authorization server for MCP, the native apps holding a pasted token in memory, compare-and-swap saves with merge, same-lane overlaps being legal, and the absence of a credential store in the native apps. I did not verify that stored provider credentials are outside the archived tables beyond reading the table list in F3.

This document relies on the findings F1 to F16 of the storyboard and script design, taken at the same commit. The ones this PRD uses: scripts and storyboards have no version table. The link lives on the storyboard. A new take or render is pushed into the timeline by a read and a compare-and-swap save. Deleting a linked script clears the board's link in a second write. A native storyboard component exists and no native script editor was found. Two of these rest on file headers and directory listings only, as that design states. The design's manifest field lists are proposals, because the prompt compilers were not read.

## Authority and limits of the CRDT design

Revision 3 of the timeline design decides how timeline edits merge. Revision 2 of the storyboard and script design decides how scripts and storyboards merge and how the three documents refer to each other. This PRD changes neither algorithm. Where the product needs something a design does not provide, or where the two disagree with this PRD, the point is listed below as an amendment for the design's authors to accept or reject.

### What the product takes from the timeline design

| Code | Rule in the timeline design | Product consequence |
| --- | --- | --- |
| C1 | A register keeps concurrent values. An ordinary edit replaces the displayed value and the author's own earlier values. Only explicit resolution removes other people's values. | Editing a field with a conflict does not clear the conflict. The app offers explicit resolution. |
| C2 | Undo is a retraction and never outranks another person's concurrent value. | Undo can reveal another person's value. The app says so. |
| C3 | A transaction applies as a unit on a replica. Competing edits resolve per register. | The product makes no promise that a multi-clip edit survives as a whole, and shows no notice that spans clips. |
| C4 | Tombstones are retained. Only the transaction log is truncated. | Deleted timeline content stays in the collaborative state. This affects privacy, storage and media retention. |
| C5 | A refused transaction voids itself and its dependents as whole transactions, with dot remapping and a local list of unsent edits. | The app shows unsent edits and lets the user apply or export them. |
| C6 | Same-lane overlaps are legal. Materialization never moves a clip to another track. | The app does not repair overlaps after a merge. |
| C7 | Automerge or the custom core is chosen after phase 0. | The PRD depends on neither. |
| C8 | The guarantees are specified and not executed. | No CRDT behavior ships before the gates in the rollout section. |

The two designs cover timelines, scripts and storyboards. They give no merge semantics to workflows, sketches, apps, JS scripts, project metadata, media, workspace files or conversations.

### What the product takes from the storyboard and script design

| Code | Rule in the design | Product consequence |
| --- | --- | --- |
| C9 | Text is a whole value. A line's text, a shot's action and a brief are each replaced as a unit. | Two people can work in different lines at once. Two people who rewrite the same line get a conflict to review, and no merged sentence is produced. |
| C10 | A line is assigned to a shot by one entity keyed by the line. | A line appears in one shot. Two people who assign it to different shots get a conflict on that line. |
| C11 | Documents share no transactions. A reference to an absent target is legal. | A link is reported as resolved, missing or unavailable. No save is refused because of a link. |
| C12 | Generation is a request that records whether to adopt its result and which selection it saw. The current result is derived. | What plays changes only through a pick or through a request that asked for it, under the conditions of A17. A pick made after the request began survives. |
| C13 | Results are immutable and are kept when their line or shot is deleted. | Paid takes and renders return when the line or shot is restored. They count toward storage and are visible to editors. |
| C14 | Generated writes name only what they read and defer to a person's concurrent value. | An agent or a directing run does not replace text a person typed while it was working. Its text is offered as an alternative. |
| C15 | A result's match with the displayed inputs has three outcomes. | The app labels a result up to date, out of date with the input that differs, or not verified. |
| C16 | A new take or render is added to linked clips as a version. Nothing retimes automatically. | Clip length and position change only through an explicit Retime. |
| C17 | A whole-document save is converted against the projection the client was sent. | Older clients keep working, with stated limits. |
| C18 | A split or a join records a relation. | When a split or join collides with another edit, both lines are shown together with two ways to settle it. |
| C19 | The fixtures and properties are specified and not executed. The design is approved for prototyping only. | No behavior of phase 5 ships before its gates. |

### Contradictions and required amendments

| Code | Issue | Proposed resolution | Amends |
| --- | --- | --- | --- |
| A1 | The timeline design says the server refuses only invalid transactions, "which a correct client does not produce". A correct client is refused when its access is revoked or the document is deleted. | Add a second refusal class for authorization and document lifecycle. All pending transactions go to the unsent list as whole transactions, and none is reissued to that document. | CRDT design, server role and risk R8 |
| A2 | The timeline design assumes one actor id per installation and document. A restored backup or a cloned app data folder reuses an actor id and its sequence numbers. A copied project folder alone does not, because the link is in the app's database. A check of the highest sequence number on connect misses two copies that connect at the same number and then each send a different next transaction. | A transaction gains a predecessor digest field. The server keeps a content digest per actor and sequence number and accepts by the cases I1 to I5 under Copies, backups and two processes. A diverged copy takes a new actor id and reissues through the recovery procedure. A second live connection for a connected actor takes a new actor id before it writes. | Timeline design: transaction format, identifiers, delivery and recovery |
| A3 | The timeline design does not define the effect of restoring a version. | A restore is a new transaction that writes the restored content as ordinary edits. It never rewinds vectors or removes alternatives it did not observe. | CRDT design, new section |
| A4 | The timeline design leaves open whether an explicit resolution is recorded (its Q6). | Yes. The activity record is required by this PRD. | CRDT design, Q6 |
| A5 | The timeline design defines state transfer to replicas and no read-only form. | The server materializes the document for viewers and sends no replicated state to them. | CRDT design and technical design |
| A6 | The technical design transfers a project as an archive with a delta variant in its phase 3, and detects conflicts per row. | Replace it with the staged transfer contract of this PRD, delivered in phase 2. | Technical design |
| A7 | The technical design keeps an id map per linked project and no replicated state. | The link record also holds each CRDT timeline's replicated state, frontier and actor. | Technical design |
| A8 | The technical design checks authorization when a document opens. | Check it when each transaction is accepted and when each transfer commits. | Technical design |
| A9 | SSD suggests that sharing a board should include its script and timeline in the dependency closure. SR8 of this PRD says a document grant exposes no other document. | The closure stays as it is. The share dialog lists the linked documents and offers to share them too. A linked document the recipient cannot open shows as unavailable. | SSD, effect P3 |
| A10 | SSD does not say when a generation is authorized or what happens to its result when the requester loses access while the job runs. | A request record authorizes nothing. A generation runs only on a separate start command, which the server authorizes when it accepts it. An accepted start is the only event that can lead to a charge. An accepted start gives the job a completion permit that covers its one result and its outcome and nothing else. | SSD, server role |
| A11 | SSD does not define what a viewer of a script or a storyboard receives. Its materialized document lists every visible take and render. | A viewer receives the materialized document reduced to the current result of each line and shot. No other takes or renders, no requests, no alternatives, no deleted entities. | SSD, materialization |
| A12 | SSD does not define references in a duplicate or a delivery copy. | Documents duplicated together keep their links, rewritten to the new ids. A document duplicated alone has its references to other documents cleared, and the app says so. | SSD, references |
| A13 | SSD requires six changes to the timeline design, C1 to C6. One of them, the deferential generated write, adds an operation variant to the shared core. | This PRD depends on them for phase 5 and for the selection rule on clips. They are decision D7. | Timeline design |
| A14 | The title and scope of this PRD name the native graph editor and the native timeline. Scripts have no native editor, and most of phase 5 is work in the web editors, the agent tools and the server. | The PRD covers what a user of cloud documents, linked projects and sharing experiences for these documents in any client. Editor work is listed under changes outside the native apps. | This PRD, scope |
| A15 | SSD lets agents and jobs write with their own actor. This PRD requires every accepted write to be authorized. | An agent writes under the authorization of the person who invoked it. A job writes only under its completion permit. | SSD, server role |
| A16 | SSD treats creating a request as starting a generation. A request is replicated content. It is received, copied, kept in versions and delivered more than once. | Separate the request record from its execution. The server keeps an execution ledger keyed by request id, with at most one execution and one charge per id. A request without an execution is shown as not started. The execution specification of a request is immutable, and start and cancel are server commands bound to its digest. | SSD, extension E4 |
| A17 | SSD chooses a current result by matching inputs when nothing is selected, in rules 3 to 5 of its extension E4. That makes a result current without a pick or an adopting request. It also adopts a result whose inputs changed while it was generated. | A result is current only through a pick, or through a request with adoption enabled when the request saw every pick and the completion recorded a match. The server accepts the completion and records in it the comparison with its own state and the frontier of that state. An input edit received later does not change it. Rules 3 to 5 are withdrawn. A line or shot can have results and no current one. | SSD, extension E4 |
| A18 | SSD lets the job push a result into linked timelines. Permission to generate in a script is not permission to write a timeline. | A push is a write to the timeline and is authorized against the timeline when it is accepted. | SSD, references |
| A19 | SSD removes a generated alternative when the person edits the field again. That is narrower than keeping every concurrent value until someone resolves it. | The removal stands. The removed text is written to the activity record. G6 is scoped to match. | SSD, extension E6. Both designs, activity record. |
| A20 | The technical design has no receiving contract, no commit attempts, no missing-file manifest, no revocation handle and no delivery snapshots. | Add them as this document specifies them, with the access filter on the Incomplete list, the erased list and the crash recovery of receiving. | Technical design |

"SSD" is the storyboard and script design. A2 adds a field to a transaction and a server check, and changes no merge rule. A13 is discussed in the SSD itself. A17 changes a derivation rule of the SSD and no merge rule. The others change no merge rule.

## Problem, goals and non-goals

### Problem

- The native apps run against the server bundled inside the app, as a local user. Work stays on one machine.
- Reaching a remote server means creating an access token in the web app and pasting it into the native Connect form on every launch.
- Moving a project to the cloud is a manual export and import. Each import creates a new project (F1), so the cloud copy cannot be updated.
- Sharing is per document and only the web app has the dialog.
- Two people who edit one timeline are reconciled by a whole-document compare-and-swap with a three-way merge on the client.

### Goals

| Code | Goal |
| --- | --- |
| G1 | A user signs in from either native app in under one minute without typing a password or a token into the app. |
| G2 | The sign-in survives restarts and serves both native apps and the Electron desktop app on the machine. |
| G3 | A user links a local project to a cloud project and synchronizes it by explicit action, repeatedly, without duplicates and without exposing a half-transferred project. |
| G4 | A user shares a document or a whole project from a native app or the desktop app, and knows what the recipient receives. |
| G5 | A recipient opens shared work in the browser, in a native app or in the desktop app. |
| G6 | Work is recoverable. Every edit is on disk before the app treats it as saved. A value that a person wrote and that loses to a concurrent value is retained until someone resolves it. A value that an agent, a directing run or a job suggested is retained until the person uses it, dismisses it or edits the field again, and its text is then in the activity record. A replaced whole document is in version history. A refused edit is in a list the user can act on. |
| G7 | Local work never requires an account. |
| G8 | The feature works against the hosted cloud, a self-hosted server in Supabase mode and a self-hosted server in SSO mode, and each is tested. |
| G9 | Two people who edit different properties of a timeline never see a document-level choice. This goal depends on the CRDT gates. |
| G10 | Two people who edit different lines of a script or different shots of a storyboard never see a document-level choice. This goal depends on the gates of phase 5. |
| G11 | What plays or shows as current never changes without a person's pick or a request for which adoption was explicitly enabled. This holds for takes, keyframes, shot clips and timeline clip versions. |
| G12 | A link between a script, a storyboard and a timeline is always described truthfully: resolved, missing or unavailable. A missing link never blocks work and is never repaired by a silent write to another document. |
| G13 | A generation runs at most once and is charged at most once, and only after an explicit start by the person who pays. Moving documents between devices or accounts never starts one. |

Each clause of G6 maps to a requirement and a test in the traceability table. G6 separates two kinds of retained value, because they are kept for different lengths of time (A19).

### Non-goals

- Live cursors and presence. CRDT reconciliation does not need them, and they remain a separate optional feature.
- Automatic background synchronization of linked local projects.
- Merge semantics beyond today's behavior for workflows, sketches, apps and JS scripts.
- Repair of overlapping clips or of multi-clip edits that survive in part.
- Removing deleted content, alternatives or results from the state of a timeline, script or storyboard. The owner can free their files (FR79).
- Two people typing in the same line of a script at the same time without a conflict notice.
- Automatic retiming of a timeline when a take or a render changes.
- Keeping a script, a storyboard and a timeline consistent as one unit. Each merges on its own.
- A native script editor.
- Teams, organizations and shared billing. Changes to pricing.
- A new sign-in for the web app or the mobile app. The web app does get the specific changes listed in the rollout section.
- SAML.

### Users

| Person | Need |
| --- | --- |
| Solo creator with two machines | Link a project, open it on the other machine, send changes both ways |
| Editor delivering to a client | A view link that shows the current cut and nothing else |
| Workflow author | A public link others can view and duplicate |
| Two collaborators on one timeline | Independent edits merge. Competing edits are kept and reviewable. |
| Writer and director on one production | One edits lines while the other assigns them to shots and renders. Neither blocks the other, and each sees when the other's document moved. |
| Person working next to an agent | Text they typed while a directing run or an agent was working stays on screen. |
| Person who picked a take | The pick stays when a job started earlier finishes. |
| Team on a self-hosted server | The same features with the company identity provider |
| Offline user | No prompts, no change to local behavior |

## Synchronization concepts and capability matrix

Three concepts are independent.

| Code | Concept | Meaning |
| --- | --- | --- |
| S1 | Cloud document | Opened from Cloud or Shared with me. Edits are sent while the app is online and queued on disk while it is offline. |
| S2 | Linked local project | A local project with a recorded link to a cloud project. Changes are exchanged only when the user chooses Synchronize. |
| S3 | Reconciliation | What happens to a document when changes are exchanged. It depends on the document kind, not on S1 or S2. |

Explicit synchronization decides when changes move. It does not decide how they combine. A linked CRDT timeline that is synchronized after a week offline merges property by property, exactly as a cloud timeline does continuously.

### Capability matrix

"Transitional" means today's behavior: the save is refused when the stored version changed, the client merges external changes into its draft, and the draft wins.

| Item | Local persistence | As a cloud document (S1) | In a linked project (S2) | Conflict behavior | Recovery |
| --- | --- | --- | --- | --- | --- |
| CRDT timeline, from phase 3 | Replicated state and pending transactions on disk | Transactions sent while online | Pending transactions sent and remote ones applied at Synchronize | Per register under the timeline design. Independent edits merge. Competing values are retained and reviewed. | Alternatives in state, unsent edits list, version history, activity record |
| Timeline on a legacy client or before phase 3 | Whole document and draft on disk | Whole-document save, transitional. From phase 3 the server converts the save relative to the client's base. | Whole document compared with the recorded base | Before phase 3: document-level choice. From phase 3: as a legacy client, including the missing-base response. | Version history, draft on disk |
| Replicated script or storyboard, from phase 5 | Replicated state and pending transactions on disk | Transactions sent while online | Pending transactions sent and remote ones applied at Synchronize | Per register under the storyboard and script design. Different lines and shots merge. Competing values of one field are retained and reviewed. Generated values defer to a person's. | Alternatives in state, unsent edits list, version history, activity record, results kept after their line or shot is deleted |
| Script or storyboard on a legacy client or before phase 5 | Whole document and draft on disk | Whole-document save, transitional. From phase 5 the server converts the save against the projection the client was sent. | Whole document compared with the recorded base | Before phase 5: document-level choice. From phase 5: as a legacy client, with the limits listed under scripts and storyboards. | Before phase 5: the replaced version is kept as a copy, because these kinds have no version table. From phase 5: version history. |
| Links between script, storyboard and timeline | Ids inside each document | Not synchronized on their own | Travel with the documents that hold them | None. A link is derived when two documents are read together and is shown as resolved, missing or unavailable. | Restoring the missing document resolves the link |
| Workflow | Whole document and draft on disk | Whole-document save, transitional | Whole document compared with the recorded base | Document-level choice when both changed | Version history |
| Sketch, app, JS script | Whole document and draft on disk | Whole-document save, transitional | Whole document compared with the recorded base | Document-level choice when both changed | Version history |
| Project metadata: name, document membership | Local database | Applied on the server in order of arrival | Compared with the recorded base | The later accepted change wins and is listed in the activity record. Deletions need review. | Activity record |
| Media assets | Files at a path in the project folder, each with an id and a content hash (F15) | Uploaded when a document refers to them | Files the cloud lacks are staged and committed with the transfer | None between different files. One file's bytes changed in place on both sides keeps both (V22). | Retained while anything refers to it |
| Workspace files | Files in the workspace folder | Not synchronized on their own | Files that a document requires always transfer. Others are optional. | Per file. When both changed, both are kept and the user picks. | The other file is kept beside it |
| Conversations | Local database | Not synchronized on their own | Optional, off by default. Added, never merged. | None. A conversation is copied whole under a new id when it exists on both sides. | Local copy stays |

The CRDT designs give nothing to the rows for workflows and below. A project is not a CRDT, and a transfer of a project is not a transaction of one. A script, its storyboard and its timeline are three separate replicated documents. Nothing merges them as a unit.

"Replicated document" below means a CRDT timeline from phase 3 and a script or storyboard from phase 5.

## Identity, state transfer and compatibility

### Identity and lineage

| Term | Definition |
| --- | --- |
| Cloud document identity | The document's id on one server. It never changes while the document exists. |
| Lineage | The fact that a local document descends from one cloud document on one server under one account. A link record on the local machine holds it. |
| Actor | One installation editing one CRDT timeline. Each installation has its own actor id for each document, as the timeline design requires. |
| Base | For a whole-document format, the content hash of the version last exchanged. For a CRDT timeline, the frontier last exchanged. |

A linked replicated document keeps its replicated state on the local machine: registers with all siblings, existence vectors, tombstones, the frontier, the actor id and the pending transactions. For scripts and storyboards the state also holds generation requests, every result with its input manifest, and relations. The materialized JSON is a view of that state. It is not a synchronization checkpoint, and the app never rebuilds state from it for a linked document.

A local document that was never published has no replicated state. Publication creates the state from the JSON document in one transaction by the publishing actor. For a script or a storyboard, the stored current take, keyframe and clip become selections in that transaction, so the published document shows what the local one showed.

### Three ways to get a copy

| Action | Identity | Carries | Synchronizes back |
| --- | --- | --- | --- |
| Download linked copy | Same lineage, new actor for this installation | Full replicated state for CRDT timelines, current versions and history for other documents, referenced files | Yes, by Synchronize |
| Duplicate | New document ids, no lineage | Current materialized content and referenced files. No alternatives, no tombstones, no history. | Never. It can be published as a new cloud project. |
| Export interchange file | None. A `.nodetool-project` file. | Materialized documents, version history rows, files. No replicated state and no link. | Never. Import creates a new unlinked project, as today (F1). |

The interchange file never carries synchronization state. Importing one cannot attach to an existing cloud project by accident.

References between documents follow the copy (A12).

| Copy | References to other documents |
| --- | --- |
| Download linked copy of a project | Unchanged. The documents keep their identities, so the links hold. |
| Download linked copy of one document | Unchanged. A linked document that is not on this computer shows as unavailable. |
| Duplicate of a project, or of several documents together | Rewritten to the new ids of the documents in the same duplicate. A reference to a document outside the duplicate is cleared. |
| Duplicate of one document | Cleared. The app states that the copy is not linked to the original's script, storyboard or timeline. A storyboard keeps the text snapshots of its shots. A timeline keeps its clips and their active versions. |
| Delivery copy | Cleared in every snapshot, as for a duplicate of one document. A snapshot holds no reference to the original or to an earlier snapshot. |
| Export interchange file | As today: import assigns new ids and rewrites references inside the file. |

### Copies, backups and two processes

Two different transactions are never accepted under one actor id and sequence number, for any timing of connections and uploads (FR71). The server enforces this when it accepts a transaction, and it uses two digests.

- The **content digest** of a transaction is a hash over its complete canonical encoding: actor, sequence number, predecessor digest, stamp, dependencies and writes. The server computes it and keeps it per actor and sequence number for as long as the document exists. Log truncation does not remove it.
- The **predecessor digest** is a field of the transaction. It holds the content digest of the same actor's previous transaction, and a fixed initial value for an actor's first transaction. It ties each transaction to one chain.

| Code | What the server sees | Result |
| --- | --- | --- |
| I1 | The sequence number is the actor's next one, and the predecessor digest equals the stored content digest of the previous transaction | Accepted. Its content digest is stored. |
| I2 | The sequence number was already accepted, and the content digest equals the stored one | A repeat. It is dropped and acknowledged as accepted. |
| I3 | The sequence number was already accepted, and the content digest differs | Diverged actor. Refused. The predecessor digest does not matter here. Two copies that share transaction 100 both produce a transaction 101 with the same predecessor digest and different content. |
| I4 | The sequence number is the actor's next one, and the predecessor digest differs from the stored content digest | Diverged actor. Refused. The sender's chain split at an earlier transaction. |
| I5 | The sequence number is beyond the actor's next one | Out of order, and not a divergence. The server answers with the number it expects, and the client sends from there. |

Only I2 drops a transaction, and only on equal content digests. An equal predecessor digest never identifies a repeat.

A refused copy takes a new actor id. It asks the server for the content digests of its old actor, finds the last sequence number at which its own content digest equals the server's, and reissues every later transaction through the recovery procedure of the timeline design. That includes transactions it had applied only locally. Transactions up to that point are already at the server and are not sent again.

| Situation | Behavior |
| --- | --- |
| A backup of a linked project, the app's data folder with the project folder, is restored or cloned to a second place | Both copies hold the same actor id and can produce different transactions with the same sequence number. The copy whose transaction reaches the server second is refused under I3 or I4, takes a new actor id and reissues its edits from the point where the copies diverged. This holds when one copy is behind, when both connect at the same sequence number before either sends, and when both edited offline and upload in any interleaving. Edits the server already accepted are not repeated. Lineage is kept, so both copies remain linked copies. A project folder copied without the app's data carries no link, because the link lives in the app's database. On the same install the copy opens as a new project with new ids (F18). On another install it keeps its ids and opens unlinked, and a publication from it takes new cloud ids where the old ones are taken. No actor is shared in either case. |
| Two copies are connected at the same time | The second connection for an actor is told that the actor is in use and takes a new actor id before it writes. The app says that another copy of this project is open elsewhere. |
| A whole-document linked copy is copied or restored | The recorded base is older than the cloud version, so the next Synchronize shows Cloud changes or Both changed. Nothing is overwritten without review. |
| Two app processes open one local project | One process writes. The second opens the project read-only and says which app holds it. |

### Durable pending record

Every edit to a cloud document or a linked document is written to disk before the app shows it as saved: a pending transaction for a CRDT timeline, a draft for a whole-document format. The record survives a crash and a restart. It is stored under the server and account that own it.

When the write fails, for example on a full disk, the app shows a persistent banner that changes are not being saved, stops showing the document as saved, keeps the edits in memory and offers to export the document to another location.

### Compatibility and capability negotiation

On connect, client and server exchange a protocol version, the document schema versions they read and write, and capabilities such as CRDT timeline transactions.

| Client and server | Behavior |
| --- | --- |
| Both support CRDT timeline transactions | Transactions |
| The client does not | The server converts whole-document saves relative to the client's base, under the timeline design. When the base is no longer retained, the client receives the existing conflict response, reloads, merges on its side and saves again. |
| The server does not | Whole-document saves, transitional |
| The document uses a schema version or entity type the client cannot write | The document opens read-only as a materialized view, with a prompt to update the app. The client never saves a reduced document. |
| The client's protocol version is too old for the server | Sign-in still works. Cloud documents are listed and open read-only, with a prompt to update. |

A document is converted to CRDT state once, on the server, when its phase is enabled for it: phase 3 for timelines, phase 5 for scripts and storyboards. A linked whole-document copy made before that conversion synchronizes once as a legacy client and then receives the replicated state. The conversion of a script or a storyboard changes nothing on screen: the stored current take, keyframe and clip become selections, and existing results are labelled not verified where their inputs were not fully recorded.

Capabilities are negotiated per document kind. A client can send transactions for timelines and whole documents for scripts.

## User flows

### Sign in

1. The status bar shows an Account control. Signed out, it reads **Sign in**.
2. **Sign in to NodeTool Cloud** opens the system browser. **Sign in to another server…** asks for a server address first.
3. The user signs in the way that server offers. The browser shows a consent page that names the app and the device.
4. After **Allow**, the app shows the account name and the server. The other native app and the Electron desktop app on the machine are signed in to the same account.

The Electron desktop app offers the same sign-in from its Settings (D23). Its consent page names it as the desktop app.

### The same flows in the desktop app

The desktop app is the web app running against its own local server. Each flow below also runs there, with the same rules and the same statuses (D24). The desktop app gets each one after the native apps have it in the same phase.

| Flow | Where it starts in the desktop app |
| --- | --- |
| Open and edit a cloud document | The Cloud and Shared with me groups beside the local projects. A cloud document opens in an editor tab with the two statuses. |
| Link a local project, Synchronize | **File → Publish to Cloud…** and **File → Synchronize…** in the application menu, and the same actions in the project's menu. The review sheet has the sections of the native sheet. |
| Share | Share… in the editor header and the command menu, on a cloud document or a linked project. |
| Receive shared work | The share page offers **Open in NodeTool** beside the native apps (phase 4). |
| Sign out | Settings, Cloud account. The dialog of Signing out with changes waiting counts the desktop app's own drafts. |

Runs of a cloud document follow D25. The kinds that open as cloud documents follow D26.

### Open and edit a cloud document

1. The browser of projects and documents has three groups: **On this computer**, **Cloud** and **Shared with me**.
2. A cloud document opens in a tab. The header shows a synchronization status and, separately, a count of items to review.
3. Edits are sent while online. Offline, they queue on disk and the status reads **Offline, 3 changes waiting, last connected 14:02**.

### Link a local project

1. **File → Publish to Cloud…** on a local project. Signed out, sign-in runs first.
2. A review sheet lists documents by kind, required files, optional files and conversations, the total size against the storage allowance, and anything that cannot be sent with the reason.
3. The transfer runs in the background with progress and **Cancel**. The user keeps editing. Edits made after the transfer started show as local changes when it finishes.
4. When the transfer commits, the project shows a cloud badge and a notice offers **Share** and **Open in browser**.

### Synchronize a linked project

1. The badge shows Up to date, Local changes, Cloud changes, Both changed, Needs review or Cloud status unknown, last checked 14:02.
2. Synchronize opens a sheet that lists what will be sent and what will be received, per document.
3. Replicated documents are listed as Will merge. Whole-document formats that changed on both sides ask for a choice. Deletions are listed in their own section and are off until the user confirms each one.
4. From phase 5, generation requests that were created offline are listed as Not started with their estimated cost. Synchronize transfers them as records and starts nothing. A second button, Synchronize and start N jobs, asks for an estimated batch budget and starts them after the commit.
5. After the commit, documents that now hold alternatives show a review count. The project can be Up to date and still have items to review.

### Get a copy

**Download linked copy**, **Duplicate** and **Export…** are three menu items with one line of explanation each, as defined in the identity section.

### Share

1. Share… in the document header or the File menu. A local-only project is offered Publish and share.
2. The dialog offers Copy view link, Copy edit link, for workflows Copy public link, and on SSO servers Invite people. A scope selector chooses This document or Whole project.
3. Under each link the dialog states what the recipient receives. The edit link states that editors receive alternative values and deleted content.
4. Share a delivery copy… creates a read-only snapshot of the current content and shares that instead.

### Receive shared work

1. The recipient opens the link in a browser. View and edit links ask them to sign in. A public link does not.
2. The page shows the document and offers **Open in NodeTool Timeline** or **Open in Node Editor**.
3. Opening shared work never starts a run.

### Sign out, switch account, lose access

1. Sign out removes the credential on this computer for both native apps and the Electron desktop app at once. Online, it also ends the device session on the server. Offline, the app says that the session will be ended on the server when this computer is next online, and that it can be ended now from Settings in the web app.
2. Sign out with changes waiting for cloud documents offers Keep changes on this computer, Wait and send and Cancel. Local changes in linked projects are not part of that choice. They stay in the project and move only at Synchronize.
3. After a switch to another account, the first account's waiting changes are listed as Waiting for account A and are never sent under the second account.
4. When access to a document is removed, the tab becomes read-only, the waiting changes move to Unsent edits, and the app offers Save as a local duplicate where the role allowed duplication.

## Project transfer contract

A transfer moves a consistent set of documents and files between a linked local project and its cloud project. It is used for the first publication, for every Synchronize and for Download linked copy. The mechanics belong to the technical design (A6). The guarantees are product requirements.

### Stages

| Stage | What happens | Visible in the cloud |
| --- | --- | --- |
| Capture | The app records a manifest: each document with its base and its captured version or frontier, and each required file with its content hash and size. The transfer has an id that the client chooses. | No |
| Stage | Files the cloud does not have are uploaded to a staging area that no reader can see. A file is identified by its content hash and never changes. | No |
| Commit attempt | The client sends one attempt: an attempt id, the manifest, the user's decisions and, when the user confirmed one, a missing-file manifest. One server operation checks authorization, checks that every required file is present or is named in the missing-file manifest, reconciles each document, and makes the result visible. | Yes, all at once, when an attempt commits |
| Finish | The client records the new bases. |  |

### Boundary between a transfer and live editing

Files and whole-document formats are committed as a set. Replicated documents are not replaced by a transfer. At commit, the pending transactions of each replicated document, up to the captured frontier, are submitted to that document and merge under its design.

A script, its storyboard and its timeline become visible in the same commit, each merged on its own. The commit does not check links between them. A recipient who synchronizes sees the same link notices as the sender.

This boundary keeps both promises. Collaborators who edit a cloud timeline during a transfer lose nothing, because the transfer adds transactions and overwrites no state. The transfer still appears at one moment, because the transactions, the documents and the file references become visible in the same commit.

### Guarantees

| Code | Guarantee |
| --- | --- |
| X1 | Edits made after capture are not part of the transfer. They stay pending and the project shows Local changes after the commit. |
| X2 | A first publication is not visible to anyone, including through a link, before its commit. |
| X3 | A transfer id names one transfer and its staging area. A commit attempt has its own id and an immutable content: the manifest, the decisions and the missing-file manifest. Repeating an attempt with the same id returns its recorded result, whether it committed or was refused, and has no further effect. The same attempt id with different content is rejected. At most one attempt of a transfer commits. A client that lost a response asks for the transfer's status by id and receives the result of every attempt. |
| X4 | A transfer that fails or is cancelled before a commit has no effect on the cloud project. Other collaborators' edits in that time are unaffected and remain. Staged files are discarded after seven days. |
| X5 | A commit cannot be cancelled. After a commit the app offers to restore earlier versions of whole-document formats. For a replicated document it offers a version restore, which is a new edit. |
| X6 | At commit, each whole-document format is compared with its recorded base. When the cloud version changed since capture, the attempt is refused as a whole, nothing becomes visible, staged files are kept, and the refusal lists the documents. After the user's review the client sends a new attempt with a new id under the same transfer id. The new attempt captures the reviewed documents again and may include local edits made since. Replicated documents never cause this refusal, because a concurrent edit merges. A replicated transaction that is invalid, comes from a diverged actor, lacks a dependency or fails authorization refuses the whole attempt, and nothing is written. The refusal names the document, the transaction and the class. The client recovers locally, captures again and sends a new attempt. |
| X7 | A required file is one that a transferred document refers to and that is not on the project's erased list. A required file that is missing locally, too large or over the storage allowance is never skipped silently. The user either fixes it, or confirms a missing-file manifest that names each such file with its size, the reason and the documents that refer to it. This is the one exception to the rule that a commit needs every required file. An attempt commits only when every required file is present or named there. The project is then marked Incomplete. A reader receives the mark and the list only for documents that reader can open: the missing files in the dependency closure of those documents, each with the referring documents among them. A file that only other documents refer to is not listed, counted or named for that reader (SR32). A later transfer that supplies a file removes it from the list, and the mark clears for a reader when that reader's list is empty. |
| X8 | A crash at any stage leaves either no effect or a committed transfer. On restart the app asks for the status by id and continues from the last completed stage. |
| X9 | Authorization is checked at commit. A transfer staged before access was removed does not commit. |

| Code | Guarantee |
| --- | --- |
| X10 | A linked file outside the project folder is collected into the folder before a transfer captures it, and keeps its asset id. When the user declines, the transfer does not start (D22). |

### What "only what changed" means

Change detection works per document: a document whose content equals its base is not sent. Transfer works per file: a file whose content hash the cloud already holds is not sent again. Resuming an interrupted transfer is repeating it with the same id, and staged files are skipped. There is no transfer of partial files.

### Receiving

Receiving is used by Synchronize and by Download linked copy. It has its own stages and guarantees, because two races exist only in this direction: a local edit made while a download is staged, and a cloud change between capture and the download of dependent files.

| Stage | What happens |
| --- | --- |
| Capture | The server records a revision set: one revision of each document the reader may open, and the files those revisions require, all taken at one moment. The set has an id and never changes. |
| Stage | The app downloads the revisions and the files it lacks into a local staging folder. |
| Check | For every whole-document format in the set, the app compares the local document with its recorded base and with the local version the sheet showed to the user. |
| Apply | Two steps in this order. Install: each staged file is written into a staging folder inside the project's reserved `.nodetool/` folder and flushed to disk. Installing can be repeated, and an installed file that no document refers to is not visible in the app. Commit: one local database transaction repeats the check, writes the documents, the file references and the new bases, and records the receive as applied. Placement then moves each file to its path in the project folder and writes workflow and timeline files through the document file sync. A replicated document applies the received transactions, or a snapshot with its frontier, and then its own pending transactions. |
| Finish | The app releases the revision set and deletes the staging folder. Both can be repeated. |

| Code | Guarantee |
| --- | --- |
| Y1 | Everything a revision set names stays downloadable until the receive finishes or is cancelled, or for seven days. A cloud edit, a deletion or a replaced file after capture does not change what the set delivers. The one exception is an owner's action that frees storage (FR79). A file that such an action frees is no longer served, the set counts as expired, and Y7 applies. |
| Y2 | The received documents and files belong to one moment and are consistent with each other. Cloud changes made after capture are not part of the receive, and the project shows Cloud changes afterward. |
| Y3 | Apply never replaces a local whole-document version that the user was not shown. When a local document changed after the sheet was shown, including a draft edited during staging, the apply is refused as a whole, nothing changes locally, staged files are kept, and the sheet lists those documents for a choice. The next apply is a new attempt. The user can also apply the other documents and leave the listed ones for later. |
| Y4 | A local edit to a replicated document during a receive never blocks it. The received transactions merge with it. |
| Y5 | A crash at any point leaves the local project either unchanged or fully updated, by the recovery table below. Unchanged means that no document, file reference or base changed. Installed files that nothing refers to can remain until cleanup. |
| Y6 | Each download is authorized when it is made. When access is removed during a receive, the remaining downloads are refused and nothing is applied. |
| Y7 | An expired revision set is not applied. The app captures a new one, and staged files that the new set also names are not downloaded again. |
| Y8 | A receive deletes a local document only through the confirmed destructive changes of the sheet. |

Recovery after a crash, for Y5. The new bases are written in the commit, so no state exists in which documents are updated and bases are not.

| Crash point | State on disk | On restart |
| --- | --- | --- |
| During staging | The staging folder holds some files. No document, reference or base changed. | The app continues the downloads. Complete staged files are checked by hash and kept. |
| During install, or after install and before the commit | Some or all files are in the file store. Nothing refers to them. No document, reference or base changed. | The app repeats the install, which skips files that are present with the right hash, and continues with the commit. When the receive is cancelled or its revision set expired, cleanup removes installed files that nothing refers to. |
| During the commit | The database rolls the transaction back. The state is that of the row above. | As in the row above. |
| After the commit, before or during Finish | Documents, references and bases are updated together, and the receive is recorded as applied. The revision set is still held and the staging folder exists. | The app reads the applied record and runs Finish. It does not apply again. |

Every file of a project folder lives at a path, media files included (F15), so replacing it cannot be part of the database transaction. The app writes the new content beside the target under a temporary name and flushes it during install. The commit records, per path, the hash before and the hash after. After the commit the app renames each temporary file over its target and marks the path done. On restart, the app finishes the paths of an applied receive before it opens the project. A target whose content no longer equals the recorded hash before is not replaced. The received content is kept beside it, and the app lists the file for a choice, as Y3 does for a document. Workflow and timeline files are written through the document file sync, which keeps an edit made outside NodeTool in that window as a version (F17).

## Deletion, moves and non-document conflicts

Four kinds of removal are separate, and each has its own authority.

| Kind | Decided by | Rule |
| --- | --- | --- |
| Deleting a clip, track or other entity inside a CRDT timeline | Timeline design | An edit that the delete did not observe keeps the entity. |
| Deleting a document or moving it to another project | The server, for a person with the owner role | Not a CRDT operation. A timeline edit never brings a deleted document back. |
| Deleting a cloud project | The owner | Ends every link and grant. Local copies become unlinked. |
| Removing access | The owner or an administrator | The server refuses every later write issued by that person. Completing a generation that the server had already accepted is not a write by that person and is not refused (see Completion of an accepted generation). |

A deleted cloud document or project is kept for 30 days and can be restored by its owner. During that time its transactions are refused with a lifecycle code (A1).

### Behavior table for linked projects and cloud documents

"Local" is this computer's linked copy. "Cloud" includes other collaborators.

| Code | Local | Cloud | Result |
| --- | --- | --- | --- |
| V1 | Edit a CRDT timeline | Edit the same timeline | Merge per register. No choice is asked. Competing values appear in review. |
| V2 | Edit a whole-document format | Edit the same document | **Keep local version**, **Keep cloud version** or **Keep both**. The version that is replaced goes to history, or to a copy where the kind has no history. |
| V3 | Edit a document | Delete the document | The edit stays local. The sheet offers **Restore cloud document** for the owner, **Keep as local duplicate**, or **Delete local copy too**. Nothing is restored automatically. |
| V4 | Delete a document | Edit the document | The sheet offers **Keep local deletion**, which deletes the cloud document, for the owner only, or **Restore from cloud**. The default is **Restore from cloud**. |
| V5 | Delete a document | No change | The deletion is listed under destructive changes and is sent only after the user confirms it. A person without the owner role cannot send it, and the local document is restored at the next receive. |
| V6 | Rename a document or project | Rename the same item | The change accepted later by the server wins. Both names are in the activity record. No dialog. |
| V7 | Move a document to another project | Edit the document | Both apply. Membership is metadata and does not change the document's version (F8). |
| V8 | Move a document to another project | Move it to a third project | The move accepted later wins and is recorded. |
| V9 | Move a document out of a shared project | A collaborator has changes waiting | The collaborator's access from the project ends. Their waiting changes follow the access-removed rule in V12. |
| V10 | Replace a media file in a document | Replace it differently | Replacing the file a document uses is an edit to the reference and follows V1 or V2. Both files are retained while referenced. |
| V11 | Change a workspace file | Change the same file | Both files are kept, the received one under a name with the device and date, and the user picks. |
| V12 | Changes waiting | Access removed, or account disabled | Every write is refused at acceptance. The waiting changes move to Unsent edits as whole transactions. The app offers **Save as a local duplicate** when the role allowed duplication, and **Export unsent edits** otherwise. |
| V13 | Changes waiting | Cloud project deleted | The link ends. The local project stays complete and becomes unlinked. Waiting changes remain part of the local project. Publishing again creates a new cloud project. |
| V14 | Any | A collaborator is added or removed | Takes effect at the server at once. It needs no synchronization and is never part of a transfer. |

Synchronize propagates a deletion only through the destructive changes section of the sheet, with each item confirmed. A transfer never deletes as a side effect.

Scripts, storyboards and their links, from phase 5.

| Code | Local | Cloud | Result |
| --- | --- | --- | --- |
| V15 | Edit a replicated script or storyboard | Edit the same document | Merge per register. No choice is asked. Competing values of one field appear in review. |
| V16 | Delete a line in a script | Assign that line to a shot in the storyboard | Both apply, each in its own document. The storyboard shows Line missing on the shot. Undoing the delete clears it. No save is refused. |
| V17 | Delete a script that a storyboard links | No change to the storyboard | The storyboard keeps its link and shows Script missing. Nothing is written to the storyboard. Restoring the script within 30 days resolves the link. Unlinking is an explicit action. This replaces today's second write that clears the link, and is decision D8. |
| V18 | Delete a line or a shot | A job finishes a take or a render for it | The line or shot stays deleted. The result is stored and returns when the line or shot is restored. It counts toward storage. |
| V19 | Pick a take, a keyframe or a clip version | A job finishes whose request did not see that pick | The pick stays. The new result is added to the list. A request that saw the pick and enabled adoption replaces it under the three conditions (see Generation and what is current). |
| V20 | Edit a field | An agent, a directing run or a job writes the same field from an older reading | The person's value stays displayed. The generated value is an alternative. |
| V21 | A new take or render is pushed to a timeline clip | The same result is pushed by another client, or a collaborator selected a version on that clip | One version exists. The clip's selection, length and position are unchanged. |

| Code | Local | Cloud | Result |
| --- | --- | --- | --- |
| V22 | Change a media file's bytes in place | Change the same file's bytes in place differently | Both are kept. The received bytes become a new asset under a name with the device and date, documents keep the local asset, and the path is listed. The replaced cloud bytes stay readable for 30 days. |

## Conflict and recovery experience

### Two statuses

A document shows two things that do not depend on each other.

| Status | Values |
| --- | --- |
| Synchronization | **Saved to cloud**. **Sending**. **Changes waiting** with a count. **Offline** with the time of the last connection. **Cloud status unknown** with the time of the last check. **Not saving** when the local write failed. **Access removed**. |
| Review | A count of notices, or nothing. |

A timeline can be fully synchronized and still hold unresolved alternatives. The app never shows a clean state for the second because of the first.

### Review of a CRDT timeline

The review panel lists the notices that the timeline design derives from the state. Each notice selects its clip or track on the timeline.

| Notice | What the user sees | Actions |
| --- | --- | --- |
| `conflict` | "Start time has two values: yours and Dana's." Each value with author and time. | Choose a value, which is an explicit resolution. Or leave it. |
| `partial` | "Your trim was applied and your move was not." | Open the related conflict. Edit again. |
| `replaced` | "This clip's track was deleted. It is shown on its earlier track." | Move the clip. Accept the placement. |
| `detached` | "This clip has no track." Listed outside the timeline. | Place it on a track. Delete it. |
| `cycle` | "These clips were grouped in a loop. The grouping was removed." | Regroup. |
| `clamp` | "The fade was shortened to fit the clip." | Edit the fade or the length. |

The limits of the timeline design are part of the experience.

- Editing a field that has a conflict changes the displayed value and keeps the others. The notice stays until someone chooses a value.
- A multi-clip edit can survive in part. The app shows a conflict on each affected clip and no notice that connects them.
- Two clips that a merge left overlapping stay overlapping. The app may highlight an overlap that appeared with received changes. It does not move clips.

### Review of a script or a storyboard, phase 5

The review panel lists the notices the storyboard and script design derives from one document's state. Each notice selects its line or shot.

| Notice | What the user sees | Actions |
| --- | --- | --- |
| Conflict | "This line has two versions: yours and Dana's." Both texts with author and time. The same for a shot's action, a line's place, a line's shot and the storyboard's linked script. | Choose one, which is an explicit resolution. Or leave it. |
| Alternative available | "The director suggested different text while you were editing." | Use the suggestion. Dismiss it. Editing the field again also removes it, and its text is then kept in the activity record (A19). |
| Related operation | "This line was split while Dana edited it." Both lines side by side. The same for a join. | Keep the split. Keep the other edit. |
| Detached | "These lines have no section." Listed at the end of the script. | Move the line into a section. Delete it. |
| Speaker or scene missing | "The speaker of this line was deleted." | Assign another. Restore the speaker. |
| Hidden transition, continuity or scene clip | "A transition is hidden because one of its shots was deleted." | Restore the shot. Delete the transition. |
| Result state | Up to date. Out of date, with the input that differs. Not verified. | Generate again. Pick another result. |
| Payload mismatch | "Two copies of this result disagree." | Report. This indicates a fault, not a user conflict. |

The limits of that design are part of the experience.

- There is no merging inside a line. Two rewrites of one line are two versions.
- A split or a join can leave words in two lines. The related-operation notice shows both and does not prevent it.
- A directing run that deletes and recreates shots can leave an old shot beside the new ones when someone edited it meanwhile. No notice connects them.
- A client that saves whole documents cannot resolve a conflict and cannot clear a speaker or scene that is already shown as empty.

### Generation and what is current, phase 5 and clip versions

A generation has two parts. The request is a record in the document. It says who asked, for which inputs, and whether the result may become current. It is replicated like any other content and it authorizes nothing. The start is a command that the requester, or an agent the requester invoked, sends to the server for one request. Only a start runs a job and spends credits (see Execution and billing). Generate on a cloud document while online does both. Generate while offline, or in a linked project, creates a request that is shown as Not started.

A result becomes current in only two ways (A17).

| Way | Conditions | How long it lasts |
| --- | --- | --- |
| A person picks it | None | Until someone picks again, or until a request with adoption enabled that saw this pick delivers a result under the three conditions below |
| Adoption | All three hold. (1) The request enabled adoption. (2) The request saw every pick on that line or shot. (3) The completion recorded a match. | While the three hold. A pick that the request did not see ends it, whenever that pick arrives. |

| Term | Definition |
| --- | --- |
| A request saw a pick | The pick was in the requester's copy of the document when the request was created. The request records the picks it saw. A pick made later, and a pick made on another device at the same time, are picks the request did not see. |
| Completion | The transaction that ends a job. The generation service submits it under the completion permit, and the server accepts it in order with the other transactions of that document. |
| Match | When the server accepts the completion, it compares the request's input manifest with the inputs of that line or shot in its own document state at that moment. The comparison is by value: the hash of the manifest against the hash of the values that state displays. The completion records the outcome, which is match, no match or cannot verify, and the frontier of the state it was compared against. Only match meets condition 3. |

The match is decided once, at the completion, against the server's state. An input edit that the server had not received at that moment does not change it, whenever the edit was made. That includes an edit made offline before the job finished. When such an edit arrives, the result stays current on every copy, including the copy of the person who made the edit, and is labelled out of date with the input that differs. Each copy computes the label from its current inputs, and the label clears when the inputs equal the manifest again.

The rule has two reasons. First, every copy derives the same current result from the same records, because the conditions use the request, the picks and the completion, and never a copy's own view of the inputs. Second, a copy cannot tell an edit made during the job from an edit made after it once the transaction log is truncated, so a rule that treated the two differently could not be computed from the document state. An input edit also says nothing about which result should play, and a pick does. The cost is risk R31: a result made from text that someone had already changed offline can be current, with the out-of-date label. The alternative withdraws the adoption when such an edit arrives. It is decision D19.

Nothing else changes what is current. A result never becomes current because it matches the inputs. When several requests meet the three conditions, the result of the newest request is current. Newest means the time the request was created, not the time its job finished.

| Situation | What the user sees |
| --- | --- |
| A person generates for one line or shot | Adoption is on by default. The result becomes current when its completion is accepted, if the three conditions hold. |
| The server had received an input edit before the completion | The result is added and labelled out of date. It is not made current. The request list says "Not made current: the inputs changed while this was generating." |
| The inputs change after a result became current, or an earlier edit reaches the server after the completion | The current result stays and is labelled out of date, with the input that differs. It is not swapped for another result. |
| The inputs were changed and changed back | The comparison is by value. The result matches when the server's state shows the manifest's values at the completion. |
| A batch or an agent generates | Adoption is off unless the person turned it on for that batch (D10). Results are added. A line or shot with results and no current one shows "No take chosen" or "No render chosen" with the number of results. |
| A person picks a result | It stays current until someone picks again, or until a request with adoption enabled that saw this pick delivers a result under the three conditions. A job whose request did not see the pick does not replace it, whatever its request said. |
| A pick that the request did not see arrives after the result became current | The pick is current on every copy. The result stays in the list, and the request list says "Not current: another result was picked." |
| Two jobs overlap | Each request has its own status. The line or shot shows the status of the newest request. An older job that fails late does not turn a newer success into a failure. |
| A result arrives for a deleted line or shot | Nothing is shown. The result is kept and appears if the line or shot is restored. |
| The file of the current result was erased | The line or shot shows "File erased" and plays nothing until someone picks another result (see Media retention and deletion). |

**Use new results** is one action on a section, a script or a storyboard. For every line or shot in it that has no current result, it picks the newest result that matches the displayed inputs. It is a person's pick and is undone as one edit.

Each line and shot has a list of its requests. A request is Not started, Queued, Running, Outcome unknown, Done, Failed or Cancelled, as the execution ledger reports it. The list shows the requester, the estimated or charged cost, the result and, when a result was not made current, the reason. A request that is Not started has a Start action for its requester and a Cancel action for every editor. A request that was started has a Stop action for its requester and the owner (see Cancelling).

### Links between script, storyboard and timeline, phase 5

A link panel, separate from the review panel, lists what the documents say about each other. It is computed from the documents the reader has open or can load.

| State or notice | Meaning | Actions |
| --- | --- | --- |
| Unavailable | The linked document is not shared with the reader or is not loaded. Nothing else is reported for that link. | Ask for access. Open the document. |
| Script missing, clip target missing | The linked document or entity was deleted. | Restore it, for the owner. Unlink. |
| Line missing, line unassigned | A shot refers to a deleted line, or a line is in no shot. | Assign. Remove the reference. |
| Text drift, duration drift | A shot's recorded text or duration differs from its lines now. | Accept the new text or duration. |
| Different source version available | A clip plays another take or render than the one current in the script or storyboard. The notice says whether someone selected that version on the clip. | Use the current one. Keep this one. |
| Source duration changed | The version a clip now plays has a different length than the one the clip was timed against. | Retime. Dismiss. |
| Source input changed | A library entity or asset used for a result has a newer revision. | Generate again. |

A link notice never refuses a save and never causes a write to another document. "Unavailable" is never shown as "missing". Whether several storyboards link one script is answered by a separate lookup that covers only documents the reader can open, and says so.

A new take or render reaches a linked timeline as a version on the clips that name its line or shot. The clip keeps its length and position. Retime is an explicit action that adjusts voiceover and shot clips together as one edit.

Adding that version is a write to the timeline. It is authorized against the timeline when the server accepts it, separately from the generation (A18).

| Case | Outcome |
| --- | --- |
| The requester can edit the timeline when the job completes | The version is added to the clips. Whether a clip plays it follows the two ways above. |
| The requester cannot edit the timeline at that moment | Nothing is added. The request list says "Not added to the timeline: no access". The script or storyboard keeps the result. |
| The timeline or the clip was deleted | Nothing is added and no error is reported. The link panel shows the missing target. |
| Any other failure | The server retries for 24 hours. After that the request list shows "Not added to the timeline" with Retry. |
| Later | Anyone who can edit the timeline sees Different source version available in the link panel and can add the version. Adding it twice has no further effect. |

### Undo

Undo removes the user's own value. When another person wrote the same property concurrently, that person's value is shown afterwards, and the app says: "Undo removed your change. Now showing Dana's value." When someone replaced the value after seeing it, undo does nothing for that property and the app says so.

### Rejected edits

A transaction the server refuses, and every waiting transaction that depends on it, moves to **Unsent edits** as a whole. The list names each edit, its values and the reason. The user can apply an edit again, export the list, or discard it. Nothing leaves the list without a user action.

### History and activity

Retained alternatives are not a history. They hold the current competing values and nothing earlier.

| Record | Content | Kept |
| --- | --- | --- |
| Version history | Materialized versions of a document, created on a schedule, on request and before a whole-document replacement | As today |
| Activity record | Explicit resolutions with the values removed, version restores, refused transactions, confirmed deletions, renames and moves that lost, and from phase 5 the text of each suggestion that an edit removed | With the document |

Restoring a version of a CRDT timeline creates a new transaction that writes the restored content as ordinary edits by the person who restores (A3). Collaborators receive it as an edit. Their concurrent values remain as alternatives. A restore never rewinds the collaborative state and can itself be undone.

Restoring a version of a whole-document format replaces the current version and adds the replaced one to history, as today.

From phase 5, scripts and storyboards have version history, which they lack today, and restoring one is a new edit as for timelines. A restore does not delete takes or renders created after the restored version. They were paid for, and the rules for what is current decide whether one of them shows.

The activity record of a replicated document also lists generated writes with the moment their inputs were read, and generation requests with the requester, each start, the charge and the outcome.

## Sharing model, dependencies and privacy

### What a recipient can do

| Capability | Public viewer, workflows only | Viewer | Editor | Owner |
| --- | --- | --- | --- | --- |
| See the document's structure: graph, tracks, clips, properties | Yes | Yes | Yes | Yes |
| Play the timeline or see results | Not applicable | Yes | Yes | Yes |
| Download original media files | No | Off by default. A link option turns it on. | Yes | Yes |
| Read version history | No | Off by default. A link option turns it on. | Yes | Yes |
| Receive alternative values, deleted content and the activity record | No | No | Yes | Yes |
| Edit | No | No | Yes | Yes |
| Duplicate into their own account | Yes, when signed in (F7) | Off by default. A link option turns it on. | Yes | Yes |
| Run a workflow or start a generation | Only in their own duplicate | No | Yes, paid by their own account or keys | Yes |
| Create links, change roles, remove people, delete | No | No | No | Yes |

The proposed default for a client review link is the current revision without history. Today a viewer can read a timeline's version history (F9), so this default is a change and is listed under blocking decisions.

A viewer who can play media receives media data. Turning off download removes the download action. It does not prevent a recipient from capturing what they can play, and the dialog does not claim that it does.

### How grants and options combine

A person can hold several grants that cover one document: through a view link, an edit link, a project link or an invitation. They combine by the rules below.

| Code | Rule |
| --- | --- |
| P1 | The role on a document is the highest role among the person's grants that cover it. |
| P2 | Download, history and duplication are each on for a viewer when any of that person's grants covering the document has the option on. An editor or an owner has all three. |
| P3 | Options are settings of the link, not of the person. A grant records the link it came from and reads that link's options at every request. Changing an option applies to everyone who joined through that link, from their next request. This also holds on a link that is disabled for new people. |
| P4 | Each scope has at most one active view link and one active edit link. Options are changed on the link. A second link with other options is not created. |
| P5 | Turning an option off does not withdraw what was already downloaded or duplicated. The dialog says so when an option is turned off. |
| P6 | The people list shows each person's effective role and options, and which grant gives each of them. |

An invitation carries its own options and follows the same rules.

### What each role receives from a timeline

| Role | Payload |
| --- | --- |
| Viewer | The materialized current document and the files it refers to. No siblings, no tombstones, no notices that quote alternative values, no pending or unsent edits (A5). |
| Viewer with history | The same for each saved version. |
| Editor | The full replicated state. It contains values that other people wrote and that lost, clips and tracks that were deleted with their properties and file references, and every generated version of a clip including discarded ones. |

The share dialog states the editor row in plain words before an edit link is copied.

For a replicated script or storyboard, from phase 5 (A11):

| Role | Payload |
| --- | --- |
| Viewer | The materialized current document with one result per line and shot: the current take, keyframe and clip. No other takes or renders, no requests, no input manifests, no alternatives, no deleted lines or shots, no relations. |
| Viewer with history | The same for each saved version. |
| Editor | The full replicated state. It contains lines and shots that were deleted, wordings that lost, text an agent suggested, every take and render including those of deleted lines and shots, and every request with its requester, inputs and cost. |

Link notices are computed on the reader's side from documents the reader can open. A viewer of a storyboard who cannot open its script sees the link as unavailable and learns nothing else about the script.

### Delivery copy

**Share a delivery copy** creates a snapshot: the document's current content and the files that content refers to, with exactly one version. A snapshot has a new identity. It holds no history, no alternatives, no deleted content, no generation requests and no reference back to the original. It never changes after it is created, and nobody can edit it. Recipients are viewers. The link options for original media download and for duplication apply. There is no history option and no editor role on a delivery copy (D13).

**Update delivery copy** creates a new snapshot from the original's current content. It never writes into an existing snapshot, because that would give the snapshot a history.

| Rule | Statement |
| --- | --- |
| Link | The delivery link is stable. It resolves to the latest snapshot and to nothing else. |
| Earlier snapshots | No recipient request returns an earlier snapshot, or a file that only an earlier snapshot refers to. This holds for the link, for a snapshot id and for a file address the recipient kept. The owner sees earlier snapshots for 30 days. They are then deleted, and their files are freed when nothing else refers to them. |
| Already obtained | Content that a recipient downloaded or duplicated before an update cannot be withdrawn. The dialog says so at every update. |
| Editing | A recipient who needs to change the content duplicates it, where duplication is on. The duplicate is theirs and is not connected to the delivery. |

Use a delivery copy when the recipient must not be able to obtain earlier or discarded material under any role.

### Dependency closure

One rule covers media assets and workspace files.

Sharing a document grants read access to its dependency closure and to nothing else in the project. The closure of a revision is every media asset and workspace file that the revision refers to, followed through nested references such as a clip's active generated version.

| Case | Behavior |
| --- | --- |
| A file is referenced by the current revision | Readable by every role that can open the document |
| A file is referenced only by history, an alternative value or deleted content | Readable only by a role that receives that material |
| A take or render that is not current, or that belongs to a deleted line or shot | Readable by editors only |
| A referenced document, such as the workflow behind a generated clip | Not shared by the reference. The recipient sees the clip's result and a note that the source is not shared. |
| A linked script, storyboard or timeline | Not shared by the link (A9). The share dialog lists the linked documents and offers to share them with the same role. Without that, the recipient sees the link as unavailable. A storyboard still shows the text snapshot of each shot, and a timeline still plays its clips. |
| A library entity used by a speaker, a storyboard or a shot | Its name and the images the current revision refers to are in the closure. The entity itself is not shared. |
| A required file is missing in the cloud | A placeholder with the file's name and "Not available". The document shows the Incomplete mark. The reader sees the missing files of the documents they can open and no others (X7). |
| Other documents, other files, conversations | Never readable through a document grant |

A project grant covers every document in the project and each document's closure. Conversations are never shared. Workspace files outside every closure are not shared.

### Links and grants

- Only the owner creates links, changes roles and removes people. Each scope has at most one active view link and one active edit link, and options are settings of the link (P3, P4).
- View and edit links require the recipient to sign in on the same server. A public link does not.
- Disabling a link stops new people from joining through it. People who already joined keep their grant, which keeps following the link's options (P3).
- Removing a person removes their grant on that scope. A separate grant, for example on the whole project, remains valid until it is removed too. The dialog lists every grant a person holds.
- A project grant gives its role on every document in the project. A document grant can raise a role on that document and never lowers it (F5).
- A copy that a recipient already downloaded or duplicated cannot be taken back. The dialog says so when a person with such a copy is removed.

### Sensitive content

| Where | What can be there | Who can receive it |
| --- | --- | --- |
| Version history | Earlier content, including material removed later | Roles with history |
| Alternative values and tombstones | Values that lost, deleted clips and tracks, deleted lines and shots, text an agent suggested | Editors |
| Results that are not current | Discarded takes and renders, and results of deleted lines and shots | Editors |
| Generation requests and input manifests | Who asked, the exact text and settings a result was made from, and the cost | Editors |
| A storyboard's text snapshots | The script's wording at the time of the last sync, even when the script is not shared | Every role that sees the storyboard |
| Node properties | Text a user typed into a node, which can include a key | Every role that sees the workflow |
| Workspace files | Any file the user placed there | Roles whose closure includes the file |
| Conversations | Prompts and replies | Nobody but the account that owns them |

Stored provider credentials are kept outside project content and are not transferred or shared. That statement covers credentials stored through the app's secret storage. It does not cover text a user wrote into a node property, a script or a workspace file. The app warns before publishing or sharing when a value looks like a secret. The check is best-effort and the warning says so.

### Media retention and deletion

A media file in the cloud is kept while any of these refers to it: the current revision of a document, a saved version, an alternative value or deleted content in a replicated document's state, a take or render in a script's or storyboard's state whether current or not, or a delivery copy. Removing a clip, a line or a shot therefore does not free its files while the state or history still holds them, and neither design removes tombstones or results.

A person with the editor role can delete a single take or render. That removes it from the lists. The deleted entry stays in the document's replicated state as deleted content, and that state still refers to the file. The delete therefore does not reduce the storage used, and the storage view lists the file as retained by deleted content. Neither CRDT design removes deleted content or results from the state.

The app does not promise physical deletion on removal. Deleting a document deletes its state and history after the 30-day restore period, and a file is deleted when the last reference is gone. A file that two documents refer to stays until both let go of it.

### Freeing storage

An owner over the storage allowance cannot start generations or upload (N7, X7). The owner frees storage in three ways (FR79). The storage view lists every file with its size, what keeps it and the action that frees it. The owner sees a warning before the allowance is reached. The threshold is proposed at 90 percent.

| Action | What it does | Limits |
| --- | --- | --- |
| Erase a file | Deletes the stored bytes of one media file from the cloud project and puts the file on the project's erased list. Every entry that refers to the file stays in the documents, their state and their versions, and shows "File erased" with who erased it and when. Storage use drops at once. | Refused while current content shows the file: the current result of a line or shot, the version a clip plays, the current revision of a workflow, sketch, app or other whole document, or the latest delivery snapshot. The dialog names that content, and the owner changes it first. Before the confirmation, the dialog lists the saved versions, results, alternatives and deleted content that refer to the file. |
| End a restore period now | Deletes a deleted document or project at once instead of after 30 days. Its files are freed when nothing else refers to them. | The dialog says that the document cannot be restored afterwards. |
| Delete a saved version | Removes one saved version of a document kind that allows it today (F14). Files that only that version referred to are freed. | A file that the replicated state of a timeline, script or storyboard still refers to is not freed this way. |

Rules for the erased list:

- A file on the list is not required by a transfer, is not uploaded again and is not served.
- A linked copy that already holds the file keeps it on disk. The entries show File erased there as well.
- The owner can take a file off the list. The next transfer from a copy that holds the file stores it again.
- A pick of a result whose file was erased can still arrive from a device that was offline. It takes effect as a pick, and the line or shot shows File erased and plays nothing until someone picks again.
- A reader sees erased files only for documents they can open, by the same rule as the missing-file list (X7).
- Each erase is written to the activity record with the person, the entries that referred to the file and, for a generated result, the request and who paid for it. Nothing is refunded.
- The app does not state that erasing removes copies that other people downloaded (SR19).

Erasing needs no change to either CRDT design. The entries and their references stay in the replicated state. The erased list is a record of the cloud project, outside every document. Buying more storage is a pricing matter and outside this document (D5).

## Account and authorization behavior

### Sign-in scope

- One sign-in on a machine serves both native apps and the Electron desktop app (D23). Signing in or out in one of the three applies to the other two.
- A machine can hold sign-ins to several servers. Each server has at most one signed-in account at a time. The Account control lists them and switches between them.
- Sign out removes the credential on this machine for all three apps at once, and ends the device session on the server as soon as the server can be reached (see Signing out offline). It does not sign the browser out.
- Each device session appears in the web app's Settings with app name, device name and last use, and can be revoked there.

### Scoping of local data

Credentials, drafts, pending transactions, unsent edits and project links are stored under the pair of server and account that created them.

| Situation | Behavior |
| --- | --- |
| Account B signs in on a server where account A has changes waiting | A's changes stay on disk, are listed as **Waiting for account A**, and are not sent. B cannot read cloud content through them. |
| B opens a local project that is linked under A | The project opens as a local project. The link is shown as belonging to A and is inactive. B can publish the project as a new cloud project under B, which creates a new lineage. |
| A signs in again | Authorization is checked again. Waiting changes for cloud documents are then sent automatically. Linked projects show Local changes and send nothing until A chooses Synchronize. |

### Signing out with changes waiting

| Choice | Result |
| --- | --- |
| **Keep changes on this computer** | Sign-out completes. The changes stay on disk under A. After A signs in again they are sent automatically. |
| **Wait and send** | Sign-out waits for the connection, sends, then completes. The user can cancel the wait. |
| **Cancel** | Nothing changes. |

The app never discards waiting changes as part of sign-out. The dialog counts only changes waiting for cloud documents in the app that signs out. Each app keeps its drafts in its own local server, so a sign-out in one app cannot count the other apps' changes. Those stay on disk under A, as with Keep changes on this computer. The Electron desktop app keeps its drafts in its own local server too, so its dialog counts only those. Local changes in a linked project are not waiting to be sent. They stay in the project and move only at Synchronize.

### Signing out offline

A machine that is offline cannot end its session on the server. Sign-out therefore has two outcomes, and the app reports them separately (A20).

| Outcome | When | What the user sees |
| --- | --- | --- |
| Local | When sign-out completes, online or offline. That is at once, unless the user chose Wait and send. It never depends on the server. The credential is removed for all three apps, and nothing more is sent under the account from this machine. | "Signed out on this computer." |
| Server, online | At once. The server ends the device session. | The session disappears from Settings in the web app. |
| Server, offline | When this machine is next online. At sign-in the server issued a revocation handle that can end this one session and do nothing else. The app keeps it after sign-out, uses it at the next connection and then deletes it. | "The session on the server will be ended when this computer is next online. To end it now, open Settings in the web app on another device." The Account control shows "Signed out, session not yet ended on the server" until the server confirms. |

The app never says that a session was ended before the server confirmed it. A machine that never comes online again keeps its server session until the session expires or is ended from Settings (R25). The revocation handle cannot read or write content.

### Revocation and disabled accounts

Authorization is checked when a transaction is accepted and when a transfer commits, against the grants at that moment. It is not derived from what was true when the document opened or when the token was issued.

| Event | Open connections | Short-lived token | Staged transfer | Queued writes |
| --- | --- | --- | --- | --- |
| A grant is removed | The document's connection is closed within one minute | Still authenticates. Authorizes nothing on that document. | Does not commit (X9) | Refused. Moved to Unsent edits (V12). |
| A link is disabled | Unaffected for people who joined | Unaffected | Unaffected | Unaffected |
| A device session is revoked | Closed within one minute | Refused once the server has processed the revocation, and not renewed | Does not commit until the user signs in again | Stay waiting under the account |
| The account is disabled | Closed within one minute | Refused, and not renewed | Does not commit | Stay on disk. Not readable as cloud content. |

### Execution and billing

Opening, receiving, synchronizing, copying, restoring or replaying shared work never starts a run and never spends. A run needs an explicit start by the person who pays for it, with that person's account or keys. A shared workflow or app is not run on the owner's behalf by a collaborator's action.

From phase 5 a generation involves four things that are kept apart (A10, A16).

| Thing | What it is | Where it lives |
| --- | --- | --- |
| Request record | The description of a wanted generation. Its **execution specification** is fixed when the record is created: kind, input manifest, destination line or shot, requester, adoption setting, provider, model and parameters. The hash of the specification is the **specification digest**. A change to any part of it is a new request with a new id. The record gains one thing afterwards, its outcome. | In the document. It is replicated, copied, restored and replayed like any content. It authorizes nothing. |
| Start command | "Run request R as specified", sent by the requester or by an agent the requester invoked. It carries the document id, the request id, the specification digest and the **approved estimate**, which is the cost estimate the payer was shown and confirmed for that specification. | Never in a document. It is a call to the server. |
| Cancel command | "Do not run request R", or "stop request R" once it runs. | Never in a document. It is a call to the server. |
| Execution ledger | The server's record per request id: the document the request was created in, the specification digest, the approved estimate, the state, the charge, the provider job and the outcome. It extends the durable generation record that exists today, which is keyed by an idempotency key and an input fingerprint (F11). The request id is that key and the specification digest is that fingerprint. | On the server, outside every document. It is not copied, restored or replayed with a document. |

The status that a request shows comes from the ledger. A copy that is offline shows the last state it received.

| Code | Rule |
| --- | --- |
| E1 | A request id has at most one execution and at most one charge. A start for a request that was already started returns the recorded execution and charges nothing. This covers a retry after a lost response, a start from two devices, a restored version and a replayed log. |
| E2 | Only the requester, or an agent the requester invoked, can start a request. Another person who wants the same generation creates their own request. |
| E3 | A start is accepted only under the conditions N1 to N7, which bind it to the specification and the estimate that the payer approved. A refused start charges nothing. |
| E4 | Generating again is a new request with a new id, a new approval and a new start. Whether a failed or cancelled job is charged follows the billing rules that exist today, which this document did not inspect beyond F11. |
| E5 | An agent's start is charged to the person who invoked the agent. Its approved estimate is the one admitted by the agent's permission gate and run budget, which exist today (F13). This document adds no spending control for agents. |
| E6 | Synchronize transfers request records and starts nothing. Starting several requests after a Synchronize is one batch start with an estimated batch budget (see Batch start). |
| E7 | A pick, an adoption, a push to a timeline and showing a result again after a restore cost nothing. None of them is a start. |
| E8 | A start is accepted only in the document where the request was created. A duplicate has new document ids, so a request record that it carries cannot be started there. The person generates again, which is a new request. A delivery copy holds no requests. |
| E9 | The first of start and cancel that the server accepts decides. A cancel accepted before any start is final. No version, copy or replay of the document changes the ledger. |
| E10 | The server records the state Dispatching before it calls a provider. A request in the state Unknown is submitted again only as the recovery class of its provider integration allows. |

### Starting a generation

The server accepts a start command only when every condition holds. A refused start charges nothing and names the condition.

| Code | Condition | When it fails |
| --- | --- | --- |
| N1 | The sender is the requester named in the record, or an agent that the requester invoked | Refused. |
| N2 | The requester has edit access to the document at that moment | Refused. |
| N3 | The record has reached the server in the document where it was created | Refused until the record arrives. In a duplicate it is always refused (E8). |
| N4 | The specification digest in the command equals the digest of the record the server holds, and the server holds one specification under that request id | Refused as a specification mismatch. The app shows the specification the server holds and asks for approval again. A request id that holds two different specifications cannot be started at all. |
| N5 | The server's estimate for that specification at this moment is not above the approved estimate | Refused as a changed estimate. The app shows the new estimate and asks for approval again. |
| N6 | The ledger state is Not started | A started request returns its recorded execution (E1). A request cancelled before its start is refused (E9). |
| N7 | The owner of the document is within the storage allowance | Refused. The owner frees storage (see Media retention and deletion). |

The server records an accepted start in the ledger with the approved estimate, in one database transaction. It is the only event that can lead to a charge. The generation record today takes its cost from the provider's stated cost or the catalog price and later reconciles it to the billed amount (F11). The charge can therefore differ from the approved estimate, and this document sets no cap on it (D18).

### Ledger states

| State | Meaning | Follows |
| --- | --- | --- |
| Not started | Neither a start nor a cancel was accepted. |  |
| Cancelled before start | A cancel was accepted first. Final. Nothing is charged. | Not started |
| Started | A start was accepted under N1 to N7. | Not started |
| Dispatching | The server recorded that it is about to call the provider. It writes this before the call. | Started |
| Running | The provider's job id is recorded. | Dispatching, Unknown |
| Unknown | The provider may or may not hold a job. The server stopped, or lost the response, after Dispatching and before it recorded a job id. | Dispatching |
| Done, Failed, Cancelled | Final. The outcome is written to the request record under the completion permit. | Started, Dispatching, Running, Unknown |

The request list shows Queued for Started and Dispatching, and Outcome unknown for Unknown. Started, Dispatching, Running and Unknown correspond to the submission states `accepted`, `submitting`, `submitted` and `submission_unknown` of the existing record (F11). Not started and Cancelled before start are new.

### Cancelling

A cancel is a call to the server, like a start. A cancel made offline is kept as a pending call, shown as Cancel pending, and sent on the next connection before any start from that device. The server orders the start and cancel commands of one request id, and the first one it accepts decides (E9).

| Order at the server | Result |
| --- | --- |
| A cancel is accepted while the request is Not started. Any editor can send it. | Cancelled before start. A later start is refused and the app names who cancelled. Nothing is charged. Generating again is a new request. |
| A start is accepted, then a cancel from the requester or the owner arrives | It is a stop request. Before Dispatching, no provider call is made, the state is Cancelled and nothing is charged. From Dispatching on, the server asks the provider to stop where the provider supports it. The job can still finish. The outcome and the charge follow E4. |
| A start is accepted, then a cancel from another editor arrives | Refused. The app says that the job is running and names the requester. |
| A start arrives for a request in a final state | Refused under N6, or answered with the recorded execution under E1. |

A restored version, an older copy and a replayed log carry request records. They never carry ledger state. A request that the ledger holds as Cancelled, Done or Failed shows that state in every version of the document and cannot be started again.

### Provider handoff

Between the server's call to a provider and the record of the provider's job id, the server can stop or lose the response. The provider may then hold a job that the ledger does not know. A request that is still Dispatching after a restart or a timeout becomes Unknown. The server does not call the provider again for it, except as the recovery class of that provider integration allows (E10).

| Recovery class | The integration can | Recovery of an Unknown request |
| --- | --- | --- |
| Keyed | Pass a caller-chosen idempotency key that the provider honors | The server submits again with the request id as the key. The provider returns the existing job or creates the only one. |
| Lookup | Find its own jobs at the provider by a reference it sent, with a documented time after which a job is listed | The server looks the job up. A job that is found is recorded and continues. When none is found after that time, the server submits once more with the same reference. |
| Manual | Neither | The server never submits again on its own. The requester sees Outcome unknown, with Check again and Generate again. Generate again is a new request with a new approval. Its dialog says that the first job may also have run and may be charged. |

Each provider integration declares its class, and an integration that declares none is Manual. This document assigns no class to any integration. The existing record keeps an ambiguous FAL submission as `submission_unknown` and does not replay it (F12), which is the Manual behavior. A result that a provider delivers later for an Unknown request and that carries the request's reference is attached to the request, and the state becomes Done. A test for each integration stops the server between the provider's acceptance and the record of the job id (AC68).

### Batch start

Synchronize and start N jobs lists each request with its estimated cost and asks for an **estimated batch budget**, prefilled with the estimated total. The budget limits a sum of estimates. It does not limit what is charged, and the dialog says so (D18).

The action sends one batch start: a batch id that the client chooses, the request ids in list order with their specification digests and approved estimates, and the budget. After the transfer commits, the server takes the requests in list order. It starts a request when N1 to N7 hold and the approved estimates of the requests this batch already started, plus this one, fit under the budget. The others stay Not started, each with its reason. When the transfer does not commit, nothing starts.

The server records the batch under its id. Repeating a batch start with the same id continues it. Requests that the batch already started return their recorded execution and count against the budget once. The remaining requests are evaluated against what is left of the budget. The same batch id with a different list or budget is rejected. A client that lost the response repeats the batch start or asks for the batch by id (AC69).

### Completion of an accepted generation

An accepted start gives the generation service a completion permit for that one request. The permit is not a credential of the requester, and it does not depend on the requester's access afterwards (A10, A15). A job ends with one completion, which is a transaction that the generation service submits under the permit. The server accepts at most one completion per request id, in order with the other transactions of that document. The completion carries the result, the outcome of the input comparison and the frontier it was compared against (see Generation and what is current).

| The permit allows | The permit never allows |
| --- | --- |
| Appending the one immutable result under the line or shot that the request named | Any other write to that document: text, order, selection, deletion, links or other requests |
| Writing that request's outcome | Any write to another document, including a linked timeline |

| Event while the job runs | Outcome |
| --- | --- |
| The requester's access is removed | The completion is accepted. The result was paid for. The owner can delete it. |
| The line or shot is deleted | The result is stored and not shown. It appears if the line or shot is restored. |
| The document is deleted | The job is cancelled where the provider allows it. A result that arrives within the 30-day restore period is stored and appears if the document is restored. |
| The document was purged | The result is discarded and its file is deleted. The charge follows E4. |
| The owner's storage allowance is exhausted | The result is stored, even when that puts the owner over the allowance (D16). New starts and uploads are refused until the owner is under it again (N7). The owner frees storage as described under Freeing storage. The amounts depend on D5. |
| A push to a timeline is due | It is a separate write with its own authorization (see Links between script, storyboard and timeline). |

## Functional requirements

A requirement keeps its id across revisions. Every requirement is P0 for its phase unless marked P1. The behavior behind each id is defined in the section named.

### Account

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR1 | Sign in through the system browser. The app shows no password field and asks for no pasted token. | 1 | User flows |
| FR2 | The sign-in persists across restarts in the operating system's credential store. | 1 | Security |
| FR3 | The hosted cloud is the default server. Another server can be entered, in Supabase mode or SSO mode. | 1 | Account |
| FR4 | The app shows who is signed in and to which server, and offers Sign out. | 1 | Account |
| FR5 | Local work never requires an account, and no dialog blocks a signed-out user. | 1 | Goals |
| FR6 | One sign-in serves both native apps and the Electron desktop app on the machine. | 1 | Account |
| FR7 | The web app's Settings list each device session and can revoke it. | 1 | Account |
| FR8 | The pasted-token Connect form stays available for scripts and headless runs. | 1 |  |
| FR28 | Credentials, drafts, pending transactions, unsent edits and links are scoped by server and account. Nothing is sent under another account. | 1 | Account |
| FR29 | Several servers, one account per server, and switching without loss of waiting changes. | 1 | Account |
| FR30 | Sign-out with changes waiting offers keep, wait or cancel. | 1 | Account |
| FR31 | Removed grants, revoked sessions and disabled accounts take effect on connections, transfers and queued writes as tabulated. | 1 | Account |
| FR76 | Sign-out completes locally whether or not the server can be reached. The server session is ended at once when online, and otherwise at the next connection through the revocation handle. The app states which of the two has happened. | 1 | Account |
| FR82 | The Electron desktop app signs in, shows the account and server, and signs out through the same session as the native apps. A sign-in or sign-out in any of the three apps shows in the other two within 5 seconds. The desktop app's local work and its local server are unaffected by the cloud sign-in. | 1 | Account |

### Cloud documents

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR9 | Browse the account's cloud projects and documents, and everything shared with the account. | 1 | User flows |
| FR10 | Open and edit a cloud workflow or timeline. Edits are sent while online. In phases 1 and 2 the merge behavior is transitional and the product says so in its documentation. | 1 | Capability matrix |
| FR11 | Every edit is on disk before it is shown as saved. A failed local write is shown and never hidden. | 1 | Identity |
| FR32 | Synchronization status and review status are shown separately, including offline and unknown states with the time of the last check. | 1 | Conflict and recovery |
| FR33 | Client and server negotiate protocol, schema and capabilities. An unsupported document opens read-only. No client saves a reduced document. | 1 | Identity |

### Linked projects and transfer

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR12 | Publish a local project with its documents, their history, the files they require, and optional files and conversations the user selects. | 2 | Transfer contract |
| FR13 | A review sheet before every transfer lists what is sent and received, required and optional files, sizes against the allowance, anything that cannot be sent, and destructive changes. | 2 | User flows |
| FR14 | A repeated publication or a retry updates the same cloud project and creates no duplicate, including after a lost response. | 2 | X3 |
| FR15 | A transfer that fails or is cancelled before commit has no effect on the cloud project. | 2 | X4 |
| FR16 | Progress, cancel before commit, and editing during a transfer. Edits after capture stay pending. | 2 | X1, X5 |
| FR17 | Download a cloud project as a linked copy that preserves lineage and replicated state. | 2 | Identity |
| FR18 | A state per linked project and per document, with the time of the last check. | 2 | User flows |
| FR19 | Publish a single document that is in no named project. P1. | 2 |  |
| FR20 | Send only files the cloud does not hold, by content hash, and resume by repeating the transfer. | 2 | Transfer contract |
| FR34 | A transfer is captured, staged and committed. A first publication is invisible before commit. | 2 | X2 |
| FR35 | At commit, whole-document formats are checked against their base and CRDT timelines merge. | 2, timelines in 3 | X6 |
| FR36 | A required file that cannot be sent is never skipped silently. The project is fixed or marked Incomplete. | 2 | X7 |
| FR37 | A crash or lost response around commit is resolved by the transfer's status. | 2 | X8 |
| FR38 | Download linked copy, Duplicate and Export are separate actions with the identities defined. | 2 | Identity |
| FR39 | A copied folder, a restored backup and a second process are handled as tabulated. | 2, actor rule in 3 | Identity |
| FR40 | Deletions propagate only after per-item confirmation in the review sheet, with the labels defined. | 2 | Deletion |
| FR73 | Receiving follows its stages and the guarantees Y1 to Y8: a fixed revision set, a check against local changes before apply, files installed before the commit, one local transaction that also writes the new bases, and the recovery table for crashes. | 2 | Transfer |
| FR74 | A commit is made through attempts that have their own ids and immutable content. Repeating an attempt returns its recorded result. A transfer's status lists every attempt. A missing-file manifest is the only way to commit without a required file. A reader sees the Incomplete mark and its list only for documents they can open. | 2 | Transfer, X3, X6, X7 |
| FR71 | The server accepts a transaction by the cases I1 to I5: as its actor's next one when the predecessor digest matches, and as a repeat only when its content digest equals the stored one. Any other transaction under an accepted sequence number is refused. A copy refused as diverged continues under a new actor id and reissues its edits. A second live connection for an actor takes a new actor id before it writes. | 3 | Identity |

### Conflicts, review and history

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR26 | For whole-document formats, detect that both sides changed before any write and ask per document: Keep local version, Keep cloud version, Keep both. This does not apply to CRDT timelines. | 2 | V2 |
| FR27 | Every replaced whole-document version is kept in history, or as a copy where the kind has no history, and can be restored. This includes a cloud version that a waiting draft replaces under transitional merge behavior. | 1 for cloud documents, 2 for linked projects | Capability matrix |
| FR41 | CRDT timelines reconcile per register whenever changes are exchanged, as cloud documents and in linked projects, with no document-level choice. | 3 | V1 |
| FR42 | A review panel lists conflict, partial, replaced, detached, cycle and clamp notices with the actions defined. | 3 | Conflict and recovery |
| FR43 | Ordinary editing keeps other people's alternatives. Explicit resolution removes them and is recorded in the activity record. | 3 | Conflict and recovery |
| FR44 | Undo states when it reveals another person's value and when it did nothing. | 3 | Conflict and recovery |
| FR45 | Restoring a version of a CRDT timeline is a new edit and is recorded. | 3 | Conflict and recovery |
| FR46 | Refused transactions and their dependents are listed as unsent edits that the user can apply, export or discard. | 3 | Conflict and recovery |
| FR47 | Legacy timeline clients keep working through base-relative conversion, with the missing-base response. | 3 | Identity |

### Sharing

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR21 | A share dialog in both native apps: create, copy and disable links, change roles, remove people. | 1 | Sharing |
| FR22 | Invite people by name on SSO servers. P1. | 1 |  |
| FR23 | Honor the admin permissions `share_links` and `share_public`. A blocked action is disabled with the reason. | 1 | F6 |
| FR24 | Share a whole project with one link or one invitation. | 4 | Sharing |
| FR25 | An Open in app action on the web share page. P1. | 4 |  |
| FR48 | Roles and link options grant exactly the capabilities tabulated. History, original media and duplication are off by default for viewers. | 1 | Sharing |
| FR49 | A grant gives read access to the dependency closure of what the role receives and to nothing else. | 1 | Sharing |
| FR50 | A viewer receives the materialized current document and no replicated state. | 1, timelines in 3 | Sharing |
| FR51 | Share a delivery copy, and update it. | 4 | Sharing |
| FR52 | The dialog states what each link gives, including what editors receive and that downloaded copies cannot be taken back. | 1 | Sharing |
| FR53 | The storage view shows media retained only by history or deleted content, and the app makes no claim of physical deletion while it is retained. | 3 | Sharing |
| FR77 | Grants and link options combine by P1 to P6. The people list shows each person's effective role and options and the grant that gives them. | 1. Project grants in 4. | Sharing |
| FR78 | Updating a delivery copy creates a new snapshot. The delivery link returns the latest snapshot and nothing earlier. Recipients of a delivery copy are viewers. | 4 | Sharing |
| FR79 | The owner can free storage: erase a file that no current content shows, end the restore period of a deleted document or project, and delete a saved version where the document kind allows it. An erased file is on the project's erased list and is not required, uploaded or served until the owner takes it off. The storage view shows what each action frees. | 2. Results in 5. | Sharing, Freeing storage |

### The desktop app

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR83 | The desktop app browses, opens and edits cloud documents under FR9 to FR11, FR32 and FR33, for the kinds of D26. Its drafts are in its own local server and follow FR11 and FR28 unchanged. | 1 | The same flows in the desktop app |
| FR84 | The desktop app shares documents with the dialog of FR21, FR23, FR48 and FR52. | 1 | Sharing |
| FR85 | The desktop app publishes and synchronizes a local project under FR12 to FR18, FR20, FR26 and FR40, with a review sheet that has the sections of FR13. | 2 | The same flows in the desktop app |
| FR86 | The desktop app shares a whole project under FR24, and the share page offers Open in NodeTool for it under FR25. | 4 | Sharing |
| FR87 | In the desktop app no access token, refresh token or revocation handle reaches the renderer. Cloud requests from the renderer carry no credential of their own. | 1 | SR3 |

### Scripts, storyboards, generation and links

| Code | Requirement | Phase | Defined in |
| --- | --- | --- | --- |
| FR54 | Replicated scripts and storyboards reconcile per register whenever changes are exchanged, as cloud documents and in linked projects, with no document-level choice. | 5 | V15 |
| FR55 | A review panel for scripts and storyboards lists the notices tabulated, with the actions defined. | 5 | Conflict and recovery |
| FR56 | A link panel shows each link as resolved, missing or unavailable, with the notices tabulated. A link never refuses a save and never causes a write to another document. Unavailable is never shown as missing. | 5 | Conflict and recovery |
| FR57 | A generation is a recorded request that states whether its result may become current. The current take, keyframe, shot clip and timeline clip version change only through a pick, or through adoption when the request enabled it, the request saw every pick on that line or shot, and the completion recorded a match against the server's state. An input edit that the server receives after the completion does not change that. A line or shot can have results and no current one. | 5. Clip versions with phase 3 if D7 is accepted before it ships. | Conflict and recovery |
| FR58 | Each line and shot lists its requests with status, requester, cost and result. The displayed status is that of the newest request. A request without a start shows as Not started. A result that was not made current shows the reason. | 5 | Conflict and recovery |
| FR59 | A new take or render reaches linked timeline clips as one version per clip. It changes no clip's selection, length or position. Retime is an explicit action. The push is authorized against the timeline when it is accepted, and a push that was not made is shown in the request list. | 5 | Conflict and recovery |
| FR60 | An edit by an agent, a directing run or a job never replaces a value a person wrote after the edit's inputs were read. The generated value is offered as an alternative until it is used, dismissed or the field is edited again. Its text is then in the activity record. | 5 | V20 |
| FR61 | Each result is labelled up to date, out of date with the differing input, or not verified. | 5 | Conflict and recovery |
| FR62 | A split or a join that collides with another edit shows both lines together with the two ways to settle it. | 5 | Conflict and recovery |
| FR63 | Scripts and storyboards have version history. A restore is a new edit, is recorded, and deletes no take or render. | 5 | Conflict and recovery |
| FR64 | Clients that save whole scripts or storyboards keep working through conversion. Saving an unchanged document changes nothing. The limits are documented. | 5 | Capability matrix |
| FR65 | Deleting a script, a storyboard or a timeline writes nothing into the documents that link it. The link shows as missing and resolves again on restore. | 5 | V17 |
| FR66 | Duplicates and delivery copies treat references to other documents as tabulated. | 2 for whole documents, 5 for replicated state | Identity |
| FR67 | The share dialog lists a document's linked script, storyboard and timeline, says which of them the recipient cannot open, and offers to share them. | 1 | Sharing |
| FR68 | The storage view shows takes and renders that are retained but not current, and those that belong to deleted lines and shots. | 5 | Sharing |
| FR69 | Converting an existing script or storyboard to a replicated document changes nothing a user sees. | 5 | Identity |
| FR70 | The Synchronize sheet lists generation requests that were not started, with estimated cost. Synchronize starts none of them. Synchronize and start N jobs is one batch start with its own id. It starts them after the commit, up to an estimated batch budget the user confirms. Repeating it continues the batch and starts no request twice. | 5 | Account |
| FR72 | A generation runs only on a start command that the server accepts under N1 to N7, bound to the request's specification digest and the estimate the payer approved. The server keeps an execution ledger with at most one execution and one charge per request id. A repeated start returns the recorded execution. | 5 | Account, E1 to E10 |
| FR75 | An accepted start gives the job a completion permit limited to its one result and its outcome. The server accepts one completion per request id, and it records the input comparison and its frontier. Completion after loss of access, deletion, purge and exhausted storage follows the table. A push to a timeline is authorized against the timeline. | 5 | Account |
| FR80 | The server orders the start and cancel commands of a request id, and the first one it accepts decides. A cancel accepted before a start is final. A cancel after a start is a stop request from the requester or the owner. No version, copy or replay of a document changes the ledger. | 5 | Account, Cancelling, E9 |
| FR81 | The ledger records Dispatching before the provider is called. A request whose handoff is uncertain is Unknown, and it is submitted again only as the recovery class of its provider integration allows. An integration without a declared class is never submitted again by the server. | 5 | Account, Provider handoff, E10 |

## Security and privacy requirements

A requirement keeps its id across revisions.

| Code | Requirement |
| --- | --- |
| SR1 | The app never handles the user's password or identity-provider credentials. Sign-in happens in the system browser. |
| SR2 | Credentials are stored only in the operating system's credential store, under server and account. Where none exists, the sign-in lasts for the session and the app says so. |
| SR3 | The long-lived credential is sent only to the server that issued it, over HTTPS. For a transfer, the app hands a short-lived access token to its own bundled local server over loopback, and to nothing else. In the Electron desktop app no token reaches the renderer, and the local server receives one only with a transfer call. |
| SR4 | Each device session can be revoked on its own. Sign out removes the local credential at once and ends the session on the server as soon as the server can be reached. The app never reports a session as ended before the server confirmed it. A disabled account loses native access as tabulated in the account section. |
| SR5 | Credentials stored through the app's secret storage are never transferred or shared. This requirement makes no claim about text in user-authored content. |
| SR6 | Before publishing or sharing, the app warns when a node property, script or workspace file holds a value that looks like a secret, and names the place. The warning states that the check is best-effort. |
| SR7 | The review sheet separates required files, optional workspace files and conversations. Optional files and conversations are off by default. |
| SR8 | A document grant exposes the document's payload for that role and its dependency closure. It exposes no other document, file, conversation, secret or spend. |
| SR9 | A public link exposes one workflow's graph, name and description, and nothing about the owner. |
| SR10 | Transfers are bounded by size and count limits and by the storage allowance. The review sheet shows the allowance before the transfer, and a limit that affects a required file follows X7. |
| SR11 | Deleting a cloud project ends its links and grants at once and deletes its documents, state, history and unreferenced media after the 30-day restore period. Local copies are untouched and become unlinked. |
| SR12 | An administrator of a self-hosted server can turn off link sharing, public sharing and native sign-in. |
| SR13 | A managed installation can pin the allowed server or turn cloud features off through a policy setting. |
| SR14 | Authorization is enforced when each transaction is accepted and when each transfer commits. |
| SR15 | Local data of one account is never sent under another account and never gives another account access to cloud content. |
| SR16 | A viewer's payload contains no alternative values, tombstones, pending or unsent edits, or activity record. |
| SR17 | An edit to a replicated document never restores a deleted document or project. No write issued by a person takes effect after that person's access was removed. The completion permit of an accepted generation is the one exception, limited as tabulated. |
| SR18 | Opening, receiving, synchronizing, copying, restoring or replaying never starts a run and never spends. A generation starts only on a start command, and a request id is executed and charged at most once. |
| SR19 | The product does not state or imply that a recipient's existing copy can be withdrawn, that disabling download prevents capture, that removing content deletes it from storage while it is retained, or that erasing a file removes copies that other people hold. |
| SR20 | Staged files are readable only by the transfer that staged them until commit. |
| SR21 | A viewer's payload of a script or a storyboard contains one current result per line and shot and no other take or render, request, input manifest, alternative, deleted entity or relation. |
| SR22 | A link notice reveals nothing about a document the reader cannot open except that the link is unavailable. The lookup of documents that link a script covers only documents the reader can open. |
| SR23 | A generation is authorized when the server accepts its start command, which is bound to the specification and the estimate that the payer approved. It is charged to the requester or to the person who invoked the agent. A request record authorizes nothing. No start is issued by opening, receiving, synchronizing, duplicating, restoring, adopting, picking or pushing. |
| SR24 | An agent writes under the authorization of the person who invoked it. A job writes only under the completion permit of a start the server accepted, which covers its one result and its outcome. Both are checked when the transaction is accepted. |
| SR25 | An input manifest contains no credential, no signed or temporary location and no provider request. |
| SR26 | The edit-link statement in the share dialog names what editors of a script or storyboard receive: deleted lines and shots, wordings that lost, every take and render, and each request with requester and cost. |
| SR27 | A storyboard shared without its script still shows the text snapshots of its shots. The share dialog says so before the link is copied. |
| SR28 | A delivery link gives access to the latest snapshot only. No recipient request returns an earlier snapshot or a file that only an earlier snapshot refers to. |
| SR29 | A revision set names only what its reader could open when it was captured. Each download from it is authorized when it is made, and removal of access ends it. |
| SR30 | The server never accepts two different transactions under one actor and sequence number. |
| SR31 | The revocation handle can end one device session. It cannot authenticate, read or write. |
| SR32 | The Incomplete mark, the missing-file list and the erased list reveal a file only to a reader who can open a document whose dependency closure holds it. They name only referring documents that this reader can open. Counts and sizes follow the same rule. |
| SR33 | Only the owner can erase a file, end a restore period or take a file off the erased list. An erased file is served to nobody. |
| SR34 | A start command is accepted only for the specification and the estimate that the payer approved. A cancelled or finished request is never started again, by any version, copy or replay of its document. |

Self-hosted servers in Supabase mode and in SSO mode get every feature. Invite by name is specific to SSO mode, which has a user directory. A server in Local mode has one user, so sign-in and sharing do not apply there.

## Acceptance criteria

Every criterion below is specified. None has been run. The fixtures are those of fixture suite version 2, which revision 3 of the storyboard and script design defines for all three profiles: T1 to T23 from revision 4 of the timeline design, and S1 to S68 with properties P1 to P8. Version 2 lists the outcomes it amends (S7, S34, S37, S48) and supersedes (S18, S52). The outcomes are hand-worked. None has been run either. A criterion that names a fixture is an integration test around it: the fixture's merge outcome, observed through the product on real clients and a real server. In this section, S1 to S68 mean those fixtures and not the synchronization concepts S1 to S3.

### Timeline reconciliation, phase 3

| Code | Scenario | Expected outcome | Basis |
| --- | --- | --- | --- |
| AC1 | Alice changes a clip's start in a linked copy while offline. Bob changes the same clip's volume in the cloud document. Alice synchronizes. | Both changes are present on both sides. No dialog, no notice. | New |
| AC2 | Alice and Bob both move the same clip. | The value with the higher stamp is displayed. The other is retained. A conflict notice is in the review panel of both. No document-level choice. | T1 |
| AC3 | Carol edits the conflicted property of AC2 in the ordinary way, then chooses a value in the review panel. | After the edit, the notice lists Carol's and the losing person's values. After the choice, one value remains and the activity record names the value removed and who removed it. | T20a, T20b |
| AC4 | Alice writes a value, Bob concurrently writes another, Alice undoes. Repeat with Bob writing after seeing Alice's value. | First case: Bob's value is displayed and the app names Bob. Second case: nothing changes and the app says so. | T15a, T15b, T15e |
| AC5 | A track is deleted while another person moves a clip away, moves a clip onto it, or edits a clip on it. Then the three-person case of T18e. | The outcomes of T18a to T18e. The detached clip is listed in the review panel and can be placed. | T18 |
| AC6 | A linked copy stays offline until the server's log no longer covers it, with edits waiting. It synchronizes. | It receives a snapshot, applies its waiting edits, and matches a client that stayed online. | T12 |
| AC7 | Every transaction is delivered twice. A client is killed and restarted between any two transactions. | Same document and notices as a single uninterrupted delivery. | T21b, T11 |
| AC8 | The log is truncated, then late transactions arrive, including a late delete and a late edit of a deleted entity. | Same result as without truncation. | T13, T17 |
| AC9 | The server accepts a transaction and the acknowledgement is lost. The client sends it again. | The repeat is dropped. The status becomes Saved to cloud. No duplicate edit. | T21b |
| AC10 | A waiting transaction is refused while later waiting transactions depend on it and others do not. | The independent ones are accepted. The refused one and its dependents are in Unsent edits as whole edits and can be applied again or exported. | T16a to T16c |
| AC36 | Alice restores a version while Bob has a concurrent edit to one clip. | The restored content is displayed except where Bob's value outranks it. Bob's value or the restored value is retained as an alternative. The restore is in the activity record and can be undone. | New, A3 |

### Transfer

| Code | Scenario | Expected outcome | Basis | Phase |
| --- | --- | --- | --- | --- |
| AC11 | The user edits a document after capture and before commit. | The cloud holds the captured version. The project shows Local changes. The next Synchronize sends the edit. | X1 | 2 |
| AC12 | A collaborator edits a cloud document between capture and commit. | For a CRDT timeline, in phase 3: the commit succeeds and both edits are present. For a workflow: the commit is refused as a whole, nothing from the transfer is visible, the user reviews, and a new attempt under the same transfer id commits without sending any file again. | X6 | 2. Timeline part in 3. |
| AC13 | Cancel during staging of a first publication. Then try to cancel after commit. | Before commit: no cloud project exists, including through a link. After commit: cancel is not offered and restore is. | X2, X4, X5 | 2 |
| AC14 | Kill the app during staging. Kill it after the commit request, before the response. | First: the restart continues and staged files are not sent again. Second: the status by id reports committed, bases are recorded, no duplicate project exists. | X3, X8 | 2 |
| AC15 | Send the same commit attempt twice. Then send the same attempt id with a changed manifest. | One effect, and the second call returns the recorded result. The changed content is rejected. | X3 | 2 |
| AC22 | Download a linked copy on a second machine, edit, synchronize. Duplicate the project, edit. Import an interchange file. | The linked copy updates the same cloud documents. The duplicate offers no Synchronize, and publishing it creates a new cloud project. The import is a new unlinked project. | Identity | 2 |
| AC25 | Open one local project in both native apps. | The second opens read-only and names the first. | Identity | 2 |
| AC29 | A file that a document requires is missing locally. | Without a confirmed missing-file manifest the attempt does not commit. With it, the project is marked Incomplete, and the mark and the file name are shown to a recipient who can open the document that requires the file, with a placeholder in that document. AC66 covers the manifest. | X7 | 2 |
| AC30 | A required file exceeds the allowance. An optional file exceeds it. | Required: as AC29. Optional: left out and listed with the reason. | X7, SR10 | 2 |
| AC33 | The three deletion cases V3, V4 and V5. | The labels and defaults of the behavior table. No deletion is sent without confirmation. | Deletion | 2 |
| AC58 | Start a receive of a project that holds a workflow and a CRDT timeline. While files download, edit the local workflow and the local timeline. Separately, change a cloud document and replace a cloud file after the revision set was captured. In further runs stop the app (a) after the files are installed and before the commit, (b) during the commit, (c) after the commit and before Finish, and (d) after the commit and before a workspace file is replaced. | The apply is refused as a whole, no local document changed, and the sheet lists the workflow. After the choice a new apply succeeds and downloads no file again. The timeline edit is merged and is never listed. In the second case the received content is that of the revision set, every file it names downloads, and the project shows Cloud changes afterward. In (a) and (b) no document, file reference or base has changed after the restart, the app repeats install and commit without downloading a file again, and the project is then fully updated. In (c) documents, references and bases are already updated together, the app does not apply again, and after Finish the revision set is released and the staging folder is gone. In (d) the workspace file holds the received content after the restart, or, when it was changed in between, both contents exist and the app lists the file. | FR73, Y1 to Y5 | 2. Timeline part in 3. |
| AC59 | Force a refusal by X6. Drop the response of the refused attempt and ask for the status. Send a new attempt with a changed manifest, drop the response of the commit and ask again. Send the first attempt id with the new manifest. | The status lists the first attempt as refused with its documents and the second as committed. Exactly one attempt committed. The reused id with other content is rejected. No file was sent twice. | FR74, X3, X6 | 2 |
| AC66 | Publish a project with one required file missing locally and one over the allowance. Try to commit without confirming. Confirm the missing-file manifest. Later supply the first file in another transfer. | The first attempt does not commit. The second commits, and the project is Incomplete with both files, their sizes, reasons and referring documents shown to a reader with a project grant. After the later transfer the first file leaves the list, and the mark stays until the second is resolved. | FR74, X7 | 2 |

### Identity and compatibility

| Code | Scenario | Expected outcome | Basis | Phase |
| --- | --- | --- | --- | --- |
| AC20 | A legacy client saves from a retained older base, from a base that is no longer retained, and over a conflicted property. | Both values retained. The conflict response followed by a successful save. The alternatives are not removed. | T8, T9, T20c | 3 |
| AC21 | An older client opens a document with an entity type it cannot write. | Read-only, with an update prompt. No save is sent. | New | 1 |
| AC23 | Restore a backup of a linked project's app data folder and project folder in a second place, or clone both, so that two copies hold one actor id and share transactions 1 to 100. A copy of the project folder alone does not set this up, because it carries no link. Run five cases. (a) One copy is behind the other and then sends. (b) Both are at sequence number 100, connect in turn, and each sends a different transaction 101. Both carry the same predecessor digest, which is the content digest of transaction 100. (c) Both edit offline and upload interleaved. (d) Both are connected at the same time. (e) One copy sends the same transaction 101 twice. In (b) and (c), the edits beyond transaction 100 on each copy include two inserts into the same gap, a pick, an undone pick, a request with adopt that saw a pick, and a generated write. | In (b) the first transaction 101 is accepted and the second is refused as a diverged actor under I3. It is not dropped as a repeat. In (e) the second send is dropped under I2 and acknowledged, and the document holds the edit once. In every case all edits from both copies are present once, and no two different transactions are accepted under one actor and sequence number. In (a) to (c) the refused copy continues under a new actor id and reissues its edits from the last transaction it shares with the server. In (d) the second connection takes a new actor id before it writes. After the reissue, every causal reference names the reissued dots: a request that saw a pick still covers it, and an undone pick restores the same selection. All inserted entities are present, and entities with equal order keys sort by entity id on every replica (fixtures T23a to T23c and S66 to S68). | A2, FR71, SR30 | 3 |
| AC24 | Restore a backup of a linked project that had edits waiting, some of which were already accepted. | Accepted edits are not repeated. Waiting edits that the server already holds are dropped as repeats. Edits made after the restore are sent under a new actor id. | A2, FR71 | 3 |

### Account, authorization and durability

| Code | Scenario | Expected outcome | Basis | Phase |
| --- | --- | --- | --- | --- |
| AC16 | The disk fills while the user edits a cloud document offline. | Within five seconds the status reads Not saving with a banner and an export action. Saved is never shown. After space is freed, the edits held in memory are written. | FR11 | 1 |
| AC17 | An editor has three changes waiting. Their grant is removed. They reconnect. | All three are refused. They are in Unsent edits. The tab is read-only. Save as a local duplicate is offered. The cloud document is unchanged. Timeline form in phase 3. | V12 | 1. Timeline form in 3. |
| AC18 | Account A has changes waiting. Account B signs in on the same server. Then A signs in again. | Nothing is sent under B. The changes are listed as waiting for A. After A signs in, changes for cloud documents are sent automatically. A linked project of A shows Local changes and sends nothing until Synchronize. | FR28 | 1 |
| AC19 | Sign out while offline with changes waiting for a cloud document, once for each choice. Then go online. | Keep: the credential is gone at once, the app says that the server session is not yet ended, and the changes are on disk. Once online, the session is ended through the revocation handle, the Account control stops showing the pending state, and nothing is sent until the next sign-in. Wait: sign-out completes after sending. Cancel: no change. | FR30, FR76 | 1 |
| AC32 | The owner deletes a cloud timeline. A collaborator's waiting edit arrives. | The edit is refused with the lifecycle code. The document stays deleted. The edit is in the collaborator's Unsent edits. Phase 3. | SR17, A1 | 3 |
| AC34 | Sign in from each native app and from the Electron desktop app against the hosted cloud, a self-hosted server in Supabase mode and a server in SSO mode. Revoke the device in Settings. | Sign-in completes, the other two apps are signed in within 5 seconds, and all three lose access within one minute of the revocation. | FR1 to FR7, FR82 | 1 |
| AC75 | With all three apps running and signed in, sign out from the Electron desktop app, once online and once offline. Then sign out from a native app after signing in again. | Each time the other two apps show signed out within 5 seconds and send no request with the credential after the sign-out. No app restores the credential afterward. Online, the device session disappears from Settings. Offline, every app shows that the server session is not yet ended until the server confirms. | FR76, FR82, SR4 | 1 |
| AC76 | In the desktop app, open a cloud workflow, edit it offline, quit the app 1 second after the last edit, start it again and go online. | The status reads Changes waiting while offline. After the restart the edit is still there and is sent. A native app signed in to the same account opens the document with the edit. | FR83, FR11 | 1 |
| AC77 | In the desktop app, open a cloud document, share it, then sign out from a native app while a save from the desktop app is in flight. | The share dialog states what each link gives. After the sign-out the desktop app sends no request with the credential, shows Signed out within 5 seconds, and keeps the edit as a draft. The renderer's memory and its IPC traffic hold no token at any point. | FR84, FR87, FR76 | 1 |
| AC78 | Publish a local project from the desktop app, then change it in a native app on the same account and choose Synchronize in the desktop app. | The review sheet lists the same sections and documents as the native sheet for the same project. The project publishes once, and the second transfer receives the change. | FR85, FR13, FR14 | 2 |
| AC35 | Open, receive and synchronize a shared workflow and a shared app. | No run starts. No credit or key is used. | SR18 | 1 |
| AC60 | A collaborator saves a cloud workflow while another user holds an offline draft of it. The draft wins on reconnect. | The collaborator's version is in the document's history, or kept as a copy where the kind has no history, and can be restored. | FR27 | 1 |

### Sharing and privacy

| Code | Scenario | Expected outcome | Basis | Phase |
| --- | --- | --- | --- | --- |
| AC26 | Open a view link for a timeline that has alternatives, deleted clips and history. Inspect every response the viewer's client receives. | No alternative value, no deleted entity, no history. The history endpoint refuses the viewer unless the link option is on. | SR16 | 1 for history, 3 for state |
| AC27 | Create a delivery copy of that timeline and open its link. Remove a clip in the original, update the delivery copy and open the same link again. Request the first snapshot by its id, and a file that only the first snapshot referred to. Try to edit as a recipient. | Each time: one version, no history, no alternatives, no deleted content, and only files of that snapshot's content are reachable. After the update the link returns the new snapshot. The first snapshot and the removed clip's file are refused to the recipient. No edit is accepted. | FR51, FR78, SR28 | 4 |
| AC28 | As a viewer, request a file of the current revision, a file referenced only by a deleted clip, and a file of another document in the project. | The first is served. The other two are refused. | FR49 | 1 |
| AC31 | Two documents refer to one file. Delete one document, then the other. Separately, delete the only clip that refers to a file. | The file stays after the first deletion and is deleted after the second and the restore period. The file of the deleted clip stays and is shown as retained by deleted content. | FR53 | 3 |
| AC62 | Give one person a view link without options and a project view link with download on. Turn download off on the project link. Then disable that link and turn duplication on. | The person can download while a covering grant allows it and cannot from the next request after it is turned off. The option change applies on the disabled link. The people list shows the role, the options and their source at each step. Files already downloaded are not affected, and the dialog said so. | FR77, P1 to P6 | 1. Project links in 4. |
| AC73 | A project holds document A, shared with a reader by a document grant, and document B, which is not shared. Commit a transfer with a missing-file manifest that names one file required only by B and one required by A. Erase a file that only B refers to. Read everything the reader can request for A and for the project. | The reader sees the Incomplete mark on A with A's missing file and A as the referring document. No response contains the name, size, hash or count of B's missing file or of the erased file, or the name of B. A reader with a project grant sees both missing files and the erased file. | FR74, FR79, SR32, X7 | 2 |
| AC74 | The owner is over the allowance. Attempt a start and an upload. As the owner, erase the file of a take that is not current, then try to erase the file of a current take. Synchronize from a linked copy that holds the first file. Connect a device that picked the erased take while offline. End the restore period of a deleted document. As an editor, try to erase a file. As the owner, erase a file that a collaborator's receive holds in its revision set and has not downloaded yet. | The start and the upload are refused. After the first erase, storage use drops by the file's size, the take shows File erased in the document and in a saved version, and the activity record names the owner, the request and the payer. The second erase is refused and names the line. The Synchronize uploads nothing for the erased file. The pick takes effect, and the line shows File erased and plays nothing. The deleted document's files are freed at once. The editor's erase is refused. The collaborator's download of the erased file is refused, the app captures a new revision set and downloads no other file again, and the receive applies with the entry shown as File erased. | FR79, N7, SR33 | 2. Results in 5. |

### Scripts, storyboards, generation and links

| Code | Scenario | Expected outcome | Basis | Phase |
| --- | --- | --- | --- | --- |
| AC37 | Alice edits one line in a linked copy while offline. Bob edits another line and a speaker in the cloud script. Alice synchronizes. | All changes are present on both sides. No dialog, no notice. | New, S2 | 5 |
| AC38 | Alice and Bob both rewrite the same line. | One wording is displayed and the other is retained. A conflict notice is in both review panels. No text exists that neither wrote. No document-level choice. | S1 | 5 |
| AC39 | Alice and Bob each type three lines after the same line while apart. | After the merge each person's three lines are together and in order. | S3, P4 | 5 |
| AC40 | Alice starts a take that should become current, then picks an older take. The job finishes. Repeat with Bob picking while unaware of Alice's request. | The picked take is current before and after the job finishes. The new take is in the list. | S10, S31 | 5 |
| AC41 | Two people each start a take that should become current. The later request finishes first. | The later request's take is current after it finishes and stays current after the earlier one finishes. | S32 | 5 |
| AC42 | Two keyframe jobs overlap on one shot. The newer succeeds. The older fails afterward. | The shot shows success. The request list shows the older failure. | S35 | 5 |
| AC43 | Alice assigns a line to shot 1 while Bob assigns it to shot 2. | The line is listed in exactly one shot. A conflict notice names both. | S12 | 5 |
| AC44 | A line that a shot uses is deleted in the script. Then the script is deleted and restored. Then a reader without access to the script opens the storyboard. | The storyboard's save is accepted and shows Line missing. Then Script missing, and no write reaches the storyboard. After the restore the link resolves. The reader sees Unavailable only, and no response to that reader's client names a line of the script. | S22, S24, S25 | 5 |
| AC45 | Two clients push the same new take to a clip, one a day later. Separately, Dana selects an older version on the clip while the job runs. | One version exists, at the same place in the list after both pushes. The clip's length and position are unchanged. Dana's version plays, and Different source version available is shown. | S26, S36, S38 | 5 |
| AC46 | Dana trims a clip and doubles its speed. Later a version with another duration becomes active. Dana chooses Retime. | No notice after the trim. Source duration changed after the new version. It clears after Retime. | S54, S55 | 5 |
| AC47 | A directing run revises five shots. Carol edits one of them while it works. | Carol's text is displayed on her shot with Alternative available. The other four show the run's text. The storyboard has five shots. | S19, S40 | 5 |
| AC48 | A legacy client saves an unchanged script and an unchanged storyboard that hides a transition, shows a detached line and shows a deleted speaker as empty. Then it edits the detached line's text. Then it appends a take and leaves the current take as it was. | The unchanged saves produce no change. The text edit changes the text only. The current take stays. | S43, S44, S46, S48, S57 | 5 |
| AC49 | Alice splits a line while Bob rewrites it. | Both lines carry Related operation and are shown together. Each of the two resolutions leaves a consistent pair and clears the notice. | S9 | 5 |
| AC50 | Open a view link for a script and a storyboard that have conflicts, deleted lines and shots, discarded takes and renders, and requests. Inspect every response. | One current result per line and shot. Nothing else from that list. | SR21 | 5 |
| AC51 | Delete a line while its take is being generated. Restore the line. | The line stays deleted when the take arrives. After the restore the take is listed. The storage view showed it as retained in between. | S8 | 5 |
| AC52 | Duplicate a storyboard alone. Duplicate a project that holds a script, its storyboard and their timeline. | The single duplicate has no script link and says so. In the project duplicate the three link to each other and not to the originals. | A12 | 5 |
| AC53 | Convert a corpus of existing scripts and storyboards. | Each materialized document equals the stored one after schema normalization, including the current take, keyframe and clip. | FR69 | 5 |
| AC54 | A person without edit access sends a start. A person opens, receives, synchronizes, duplicates and restores a storyboard that holds requests that were never started. An editor's access is removed while their job runs. | The start is refused and not charged. In the second case no job starts and nothing is charged. The third job's result is stored under its permit, and its one charge follows from the start that the server accepted. | SR23, A10, A16 | 5 |
| AC55 | A web client merges a collaborator's change into its draft and saves, after the collaborator changed the same field again. | No write to that field. The collaborator's latest value is displayed. | S49 | 5 |
| AC56 | Send a start and drop the response. Send the same start again from the same device, from a second device and after restoring an earlier version of the document. Send it in a duplicate of the document. | One job ran and one charge exists. Every repeated start in the original returns the recorded execution. The start in the duplicate is refused. | FR72, E1, E8 | 5 |
| AC57 | Create four requests offline in a linked project. Choose Synchronize. Then choose Synchronize and start 4 jobs with an estimated batch budget that covers the first two estimates. | After Synchronize the cloud holds four requests shown as Not started, no job ran and nothing was charged. After the second action two jobs ran in list order and two requests are still Not started. | FR70, E6 | 5 |
| AC61 | Start a generation. In separate runs remove the requester's access, delete the line, delete the document and restore it, purge the document, and fill the owner's storage. Use the job's permit to attempt a text edit and a write to another document. Complete a job whose requester cannot edit the linked timeline. | The results are stored in the first three runs and shown after the restores. The purged run stores nothing. The full-storage run stores the result and refuses the next start. Both extra writes are refused. No version reaches the timeline, the request list says so, and a person who can edit the timeline can add it. | FR75, A18 | 5 |
| AC63 | An agent generates takes for ten lines without adoption, five of which have a current take. Separately, a person generates for one line and edits its text while the job runs, and the edit reaches the server before the completion. | The five lines keep their current take. The other five show No take chosen with one result. Use new results makes each of them current as one edit that can be undone. The single result is added, labelled out of date and not current, and the request list gives the reason. | FR57, A17 | 5 |
| AC64 | An agent's rewrite arrives while Carol edits a line, so that it is offered as an alternative. Carol edits the line again. | The alternative is gone from the review panel. The activity record holds its text, author and time. | FR60, A19 | 5 |
| AC65 | Delete a take as an editor. Read the owner's storage use and the storage view. | The take is gone from the lists. Storage use is unchanged. The storage view lists the file as retained by deleted content. | FR68, R27 | 5 |
| AC67 | Approve a start for a request. In separate runs, before the start reaches the server: (a) raise the provider price so that the server's estimate is above the approved one, (b) send a start whose specification digest differs from the record, (c) have another editor cancel the request, (d) send the start and a cancel from two devices at the same moment. Also (e) cancel as another editor after the start was accepted, and (f) cancel before the start, restore a version of the document from before the cancel, and send the start again. | (a) and (b) are refused with nothing charged, and the app asks for approval of what the server holds. (c) The start is refused and names who cancelled. (d) One of the two is accepted first. Either the request is Cancelled before start and nothing ran, or it started and the cancel is a stop request from the requester. (e) The cancel is refused. (f) The request shows Cancelled in the restored version and the start is refused. In every run at most one execution exists. | FR72, FR80, N1 to N7, E9 | 5 |
| AC68 | For each provider integration, stop the server after the provider accepted the job and before the job id is recorded. Restart the server. | The request is Unknown. A Keyed integration submits again with the request id, and one provider job exists. A Lookup integration finds the job, or submits once after the listing time when none exists. A Manual integration submits nothing, and the requester sees Outcome unknown with Check again and Generate again. In no class do two provider jobs exist for one request id. | FR81, E10 | 5 |
| AC69 | Send a batch start for five requests with a budget that covers four estimates. Drop the response after three have started. Repeat the batch start with the same id, and then once more. Send the same id with a different budget. Separately, send two repeats of one batch start at the same time, on a real PostgreSQL database. Separately, start one of the five requests on its own before the batch start. | Four requests are started in list order, each with one execution. The fifth is Not started with the reason. Each started request counted against the budget once. The third send changes nothing. The changed batch is rejected. The simultaneous repeats start no request twice and reserve no more than the budget. The request started on its own is reported as already started, keeps its execution, and is not counted against the batch budget or attributed to the batch. | FR70, E1, E6 | 5 |
| AC70 | Bob generates a take for a line with adoption on. Alice is offline and has changed the line's text before the job finishes. The completion is accepted while the server holds the old text. Alice then connects. | Before Alice connects, the result is current on the server and for Bob, and the completion holds a match and its frontier. After her edit arrives, every copy including hers shows her text and the same current result, labelled out of date with the text as the input that differs. No copy shows another current result. Nothing is charged. | FR57, A17, R31 | 5 |
| AC71 | (a) Carol is offline and picks an existing take after Bob's request was created. Bob's result is adopted at the completion. Carol connects. (b) A person picks a take. A second person, whose copy holds that pick, generates with adoption on, and the completion records a match. | (a) Carol's pick is current on every copy after it arrives. Bob's result stays in the list, and the request list says that another result was picked. (b) The new result is current on every copy in place of the pick. A later pick replaces it again. | FR57, A17 | 5 |
| AC72 | A request is created for a line with text T. In separate runs: (a) the text is changed to U and back to T, and both edits reach the server before the completion, (b) both edits reach the server after the completion, (c) the change to U reaches the server before the completion and the change back after it. | (a) The completion records a match and the result is current. (b) The result is current throughout. It is labelled out of date while a copy shows U, and not after that copy shows T again. (c) The completion records no match and the result is not current. It stays not current after the text is T again, the request list gives the reason, and a person can pick it. | FR57, A17 | 5 |

AC52 has two forms. In phase 2 it runs on whole documents, which covers the first part of FR66. In phase 5b it runs again on replicated documents.

## Success metrics

The targets are proposals to confirm before each phase ships. Usage metrics come from the existing opt-in analytics and describe consenting users only. Correctness metrics come from server-side checks and tests.

| Area | Metric | Target | Phase |
| --- | --- | --- | --- |
| Completion | Sign-ins completed, of sign-ins started | 90% or more | 1 |
| Completion | Median time from Sign in to signed in | Under 45 seconds | 1 |
| Completion | Transfers that end in a commit or a clean cancel, of transfers started | 98% or more | 2 |
| Correctness | Cloud projects duplicated by a repeated publication or a retry | 0 | 2 |
| Correctness | Transfers that left part of their content visible without a commit, found by a server check | 0 | 2 |
| Correctness | Timelines whose materialized document differs between a client and the server after both report the same frontier, found by a periodic checksum | 0 | 3 |
| Reconciliation | Exchanges of CRDT timeline changes that asked for a document-level choice | 0 | 3 |
| Reconciliation | Share of concurrent timeline exchanges that produced no notice | Reported, no target | 3 |
| Understandable resolution | Participants in a moderated test who resolve a seeded conflict and explain the result of an undo that reveals another value | 8 of 10 | 3 |
| Understandable resolution | Median age of open conflict notices on active timelines | Under 7 days | 3 |
| Recoverability | Unsent edits that were applied again or exported, of unsent edits created | Reported, reviewed monthly | 3 |
| Recoverability | Reports of lost work traced to synchronization, transfer, sign-out or account switching | 0 | 1 to 3 |
| Privacy | Viewer responses that contained alternative values, deleted content or history without the option, found by the test in AC26 run against production builds | 0 | 1, 3 |
| Sharing | Signed-in native users who create a link within 7 days | 20% | 4 |
| Sharing | Links opened by a second account | 50% of links created | 4 |

Scripts and storyboards, all for phase 5.

| Area | Metric | Target |
| --- | --- | --- |
| Correctness | Scripts and storyboards whose materialized document differs between a client and the server at the same frontier, found by a periodic checksum | 0 |
| Correctness | Changes of a current take, keyframe, clip or clip version that followed neither a pick nor an adopting request, found by a server check over the activity record | 0 |
| Correctness | Timeline clips holding two versions for the same source result | 0 |
| Reconciliation | Exchanges of script or storyboard changes that asked for a document-level choice | 0 |
| Reconciliation | Share of generated writes that ended as an alternative beside a person's value | Reported, no target |
| Understandable resolution | Participants in a moderated test who explain why their pick stayed after a job finished, and who settle a split that collided with an edit | 8 of 10 |
| Recoverability | Paid results that became unreachable while their document existed | 0 |
| Privacy | Viewer responses for scripts and storyboards that contained anything excluded by SR21, found by the test in AC50 run against production builds | 0 |

Contract checks, measured on the server.

| Metric | Target | Phase |
| --- | --- | --- |
| Different transactions accepted under one actor and sequence number | 0 | 3 |
| Request ids with more than one execution or more than one charge | 0 | 5 |
| Jobs that ran without an accepted start command | 0 | 5 |
| Applies that replaced a local version the user was not shown | 0, from client reports | 2 |
| Recipient requests that returned an earlier delivery snapshot or one of its files | 0 | 4 |
| Sessions reported as ended to the user before the server ended them | 0 | 1 |
| Provider jobs submitted twice for one request id | 0 | 5 |
| Starts accepted for a request that was cancelled before its start, or with a specification digest other than the recorded one | 0 | 5 |
| Requests in the state Unknown for more than 24 hours | Reported, reviewed weekly | 5 |
| Charges above the approved estimate | Reported, with the size of the difference | 5 |
| Responses that named a missing or erased file to a reader who can open no document that refers to it, found by the test in AC73 run against production builds | 0 | 2 |

The number of conflict dialogs is not a target. A low number can mean good merging or hidden conflicts, and the metrics above measure each of those directly.

## Rollout

Cloud editing ships first with transitional merge behavior. CRDT timelines ship in their own phase when the CRDT design's gates pass. The alternative, holding all cloud features until the CRDT is ready, would delay sign-in, sharing and linked projects for work that does not depend on it.

| Phase | Users get | Depends on | Exit criteria |
| --- | --- | --- | --- |
| 1. Sign-in and cloud documents | Browser sign-in shared by both native apps and the Electron desktop app, account scoping, the Cloud and Shared with me groups, editing of cloud documents with transitional merge, durable drafts, the two statuses, the share dialog for documents with the new viewer defaults and the rules for combined grants, sign-out with separate local and server outcomes, recovery of a cloud version that a draft replaced | Nothing in the CRDT design | FR1 to FR11, FR21 to FR23, FR27 for cloud documents, FR28 to FR33, FR48 to FR50, FR52, FR67, FR76, FR77 for document grants and FR82 pass on macOS, Windows and Linux against the hosted cloud, a self-hosted server in Supabase mode and a server in SSO mode. AC16, AC18, AC19, AC21, AC28, AC34, AC35, AC60, AC62 for document links and AC75 pass. The sign-in metrics hold in a two-week beta. |
| 2. Linked projects | Publish, Synchronize, staged transfer with resume and commit attempts, receiving from a fixed revision set with a check against local changes, the three kinds of copy, deletion review, document-level choices for whole-document formats. Timelines are whole-document in this phase. | Amendments A6 and A7 in the technical design | FR12 to FR20, FR26, FR27 for linked projects, FR34 to FR40, FR66 for whole documents, FR73, FR74 and FR79 pass on the three server kinds. AC11 to AC15, AC22, AC25, AC29, AC30, AC33, AC52 on whole documents, AC58 with its crash cases and without its timeline part, AC59, AC66, AC73 and AC74 without its results pass. A 1 GB project makes a round trip with identical content. The kill tests of AC14 pass at every stage. |
| 3. CRDT timelines | Per-register reconciliation for cloud and linked timelines, the review panel, unsent edits, activity record, forward version restore, legacy conversion, the retained-media view | CRDT phase 0 gate passed with the timeline fixtures of suite version 2 (T1 to T23) and the budgets. CRDT phase 1 shadow-mode results for the legacy conversion. CRDT phase 2 conformance between TypeScript and C++. Amendments A1 to A5 accepted. | FR41 to FR47, FR53 and FR71 pass in the web editor and the native timeline. AC1 to AC10, AC17 and AC32 in timeline form, AC20, AC23 in its five cases, AC24, AC26, AC31, AC36 and the timeline part of AC58 pass. The divergence metric and the count of different transactions under one actor and sequence number are 0 in a four-week beta. |
| 4. Project sharing and delivery | One link or invitation for a whole project, delivery copies, Open in app | Phases 1 and 2. Delivery copies of timelines need phase 3 only to drop collaborative state, and work on whole documents before it. | FR24, FR25, FR51, FR77 for project grants and FR78 pass. AC27 and AC62 for project links pass. |
| Candidates, not committed | Background synchronization, presence and live cursors, comments, teams, link expiry and passwords, removal of tombstones, an enforced cap on generation charges, a spending control for agents, ripple and split intent | Separate decisions. Tombstone removal and intent records need their own CRDT designs. |  |

Phase 5 has two parts. Each contract is in the exit criteria of the phase that ships the behavior it governs.

| Phase | Users get | Depends on | Exit criteria |
| --- | --- | --- | --- |
| 5a. Replicated scripts | Per-register reconciliation for cloud and linked scripts, the review panel, requests with a separate start and the execution ledger, the rules for the current take, Synchronize and start, result labels, version history, legacy conversion, generated edits that defer to people | Phase 3 shipped. The storyboard and script design approved for implementation, which it is not today. Fixture suite version 2 and properties P1 to P8 passing in the prototype. Decisions D7, D10, D12 and D14 to D20. A recovery class declared and tested for every provider integration that ships. Amendments A16, A17 and A19 are written into revision 3 of that design. The web script editor and the agent tools sending transactions, or the web stores meeting the design's condition W1. The take manifest checked against the voicing path. | FR54, FR55, FR57, FR58, FR60 to FR64, FR68 to FR70, FR72, FR75, FR80 and FR81 pass for scripts. AC37 to AC42, AC48 to AC51, AC53 to AC57, AC61 without its timeline part, AC63 to AC65, AC67 to AC72 and the results of AC74 pass in script form. The divergence metric and the count of request ids with more than one execution or charge are 0 in a four-week beta. |
| 5b. Replicated storyboards and links | The same for storyboards, line assignment by entity, the link panel, the keyed push to timelines with explicit Retime, deletion without a write to linked documents | Phase 5a. Decisions D8 and D9. Every caller of the link validation accepting a missing line as a warning. The keyframe and clip manifests checked against the render path. The directing run writing shots by id. Timeline amendments C2, C3 and C5 in place. Amendment A18 written into the storyboard and script design. | FR56, FR59, FR65 and FR66 for replicated documents pass, and the phase 5a requirements pass for storyboards. AC43 to AC47, AC52 on replicated documents and the timeline part of AC61 pass. |

The desktop app's work in each phase has its own exit criteria (D24). They do not hold the phase for the native apps.

| Phase | The desktop app gets | Exit criteria |
| --- | --- | --- |
| 1 | Cloud documents of the kinds of D26, the two statuses, drafts, the share dialog, sign-out with the dialog of FR30 | FR83, FR84 and FR87 pass on macOS, Windows and Linux against the three server kinds. AC76 and AC77 pass. |
| 2 | Publish to Cloud, Synchronize and the review sheet | FR85 passes against the three server kinds. AC78 passes. |
| 4 | Project sharing and Open in NodeTool | FR86 passes. |

If the CRDT gate fails or slips, phases 1, 2 and 4 are unaffected. Timelines keep whole-document behavior, goal G9 is unmet, and the documentation keeps saying so. Phase 5 does not start before phase 3. If phase 5 fails or slips, scripts and storyboards keep whole-document behavior and today's link behavior, and goals G10 to G12 are unmet for them.

Phase 5 is mostly work outside the native apps: the web editors, the agent tools, the generation services and the server. The native storyboard component needs it to edit cloud and linked storyboards per register. Until then it edits them as whole documents.

### What phases 1 and 2 may claim

Before phase 3, the product describes timeline collaboration as it is: two people who edit one timeline are merged on the client with the local draft winning, and a linked timeline that changed on both sides asks for a document-level choice. No text in the app or the documentation mentions retained alternatives, per-property merging or selective undo before phase 3 ships.

Before phase 5 the same holds for scripts and storyboards. Until then a finished job can still change the current take, a new take still shifts later voiceover clips, deleting a script still clears the storyboard's link, and a missing line is still a save error. The documentation describes that behavior and none of phase 5.

### Changes outside the native apps

The web app's own sign-in is unchanged. These web and server changes are in scope.

| Change | Phase |
| --- | --- |
| Consent page for native sign-in, and device sessions in Settings | 1 |
| Viewer defaults, link options for history, original media and duplication, and the statements in the share dialog | 1 |
| Linked documents listed in the share dialog | 1 |
| Authorization at acceptance and commit, and closing of connections on revocation | 1 |
| Staged transfer endpoints and the Incomplete mark | 2 |
| 30-day restore of deleted documents and projects | 2 |
| Review panel, unsent edits and activity record in the web timeline editor | 3 |
| Project scope in sharing, delivery copies, Open in app on the share page | 4 |
| Web script editor: transactions, review panel, request list, result labels | 5a |
| Agent tools and directing runs: transactions per entity, the frontier they read, requests with an explicit adopt setting, relations for split and join | 5a |
| Voicing and rendering services: requests, per-request status, input manifests, results keyed by request | 5a for takes, 5b for renders |
| Version tables for scripts and storyboards | 5a and 5b |
| Web storyboard editor and native storyboard component: transactions, line assignment, link panel | 5b |
| Timeline: selection on clip versions, keyed pushed versions, Retime, the timing basis of a clip | 5b, or 3 where D7 allows |
| Link validation accepts a missing line as a warning in every caller | 5b |
| Revocation handle issued at sign-in, and an endpoint that accepts it without a credential | 1 |
| Electron desktop app: the shared sign-in in Settings, and `desktop` as an app on the consent page and in device sessions | 1 |
| Electron desktop app: the Cloud and Shared with me groups, cloud document tabs with drafts and the two statuses, and the share dialog over a cloud client in the web app | 1 |
| Electron desktop app: Publish to Cloud and Synchronize in the application menu, and the review sheet in the web app | 2 |
| Electron desktop app: project sharing, and Open in NodeTool on the share page | 4 |
| Options stored on the link and read at every request, one active link per role and scope, and the people list with effective role, options and source | 1 |
| A version kept when a draft replaces a cloud version under transitional merge | 1 |
| Revision sets for receiving, commit attempts with recorded results, the missing-file manifest | 2 |
| Predecessor digest and content digest check per actor at acceptance, with content digests kept for the life of the document | 3 |
| Delivery snapshots, a link that resolves to the latest one, deletion of earlier ones after 30 days | 4 |
| Start and cancel commands bound to the specification digest, the execution ledger on the existing generation record with the Dispatching and Unknown states, a declared recovery class per provider integration, the completion permit, and the batch start with its estimated budget | 5a |
| Push to a timeline authorized against the timeline, with retry and the entry in the request list | 5b |
| Access filter on the Incomplete mark, the missing-file list and the erased list | 2 |
| Erased list, the erase action, ending a restore period, and the actions in the storage view | 2 |

## Risks and open questions

### Risks

| Code | Risk | Mitigation |
| --- | --- | --- |
| R1 | Storage grows with every publication, and with history, alternatives and deleted content that the CRDT designs retain | An allowance shown before every transfer. Identical files stored once. The storage view shows what retains each file. |
| R2 | Users expect automatic synchronization of linked projects | The badge names the state and the time of the last check. Background synchronization is a candidate. |
| R3 | In phases 1 and 2, two people on one timeline can lose an edit to the draft-wins merge | Stated in the documentation. Version history keeps replaced versions from phase 1 (FR27, AC60). Phase 3 removes the cause. |
| R4 | The CRDT gate fails or slips | Phases 1, 2 and 4 do not depend on it. |
| R5 | Editors are surprised that they can obtain deleted and discarded material | The statement in the share dialog, and delivery copies |
| R6 | Review notices are ignored and accumulate | The review count in the header, and the metric on the age of open notices |
| R7 | Existing view links lose access to history when the viewer default changes | A one-time notice to owners with the option to turn history on per link |
| R8 | A link spreads further than intended | Disable link, the people list, admin permissions |
| R9 | Linux desktops without a credential store | Session-only sign-in with a clear message |
| R10 | A literal key in user-authored content is published or shared | The best-effort warning of SR6, described as best-effort |
| R11 | Project sharing touches every document read path on the server | It ships in phase 4 on its own |
| R12 | Amendments A1 or A2 are rejected | Phase 3 cannot make revocation or copied folders safe without an equivalent. The phase stays blocked until one is agreed. |
| R13 | A commit that is refused repeatedly because a busy workflow keeps changing | The sheet lets the user commit the other documents and leave that one for later |
| R14 | Phase 5 depends on work in the web editors, the agent tools and the generation services, which this PRD does not own | Phase 5 blocks no earlier phase. Its dependencies are listed in the rollout table and under changes outside the native apps. |
| R15 | Users do not understand why a new take did not become current | The request list gives the reason: a pick that the request did not see, an input edit that the server had received before the completion, or adoption that was not enabled. The moderated test in the metrics covers it. |
| R16 | Every existing take and render is labelled not verified after conversion | The label carries no warning mark. Conversion keeps what is current. Regenerating gives a verified result. |
| R17 | Editors of scripts and storyboards receive more than editors do today: deleted lines, suggested text, requests with requester and cost | The statement of SR26, the delivery copy, and decision D3 as widened |
| R18 | A storyboard shared without its script still shows the script's wording in its snapshots | SR27 states it in the dialog. A delivery copy that leaves out the text snapshots of its shots is a candidate. |
| R19 | The deferential generated write is declined (D7) | Generated values are then displayed by time, over a person's concurrent text, with a conflict notice. FR60 and AC47 would be rewritten to that outcome, and V20 with them. |
| R20 | Without automatic retiming a timeline plays a take in a slot of the wrong length until someone retimes | Source duration changed, and one Retime action. The review of the design confirmed this trade. |
| R21 | The input lists that decide "up to date" miss an input a compiler reads, and a stale result is labelled up to date | A test per compiler that changing any input it reads changes the manifest. Listed as a dependency of phases 5a and 5b. |
| R22 | A whole-document client cannot clear a speaker or scene that is shown as empty, and cannot resolve conflicts | Documented under FR64. The clients that matter are moved to transactions in phase 5. |
| R23 | Requests created offline are not started by Synchronize, and a user expects them to run | The sheet lists them as Not started with their estimated cost and offers Synchronize and start N jobs. The request list shows Not started with a Start action for the requester. |
| R24 | A batch leaves many lines with results and no current one, and nothing plays until a person acts | "No take chosen" with the count, and Use new results as one action for a section, a script or a storyboard. The person can turn adoption on for a batch. |
| R25 | A machine that is signed out offline and never comes online again keeps its session on the server | The app says so at sign-out and names Settings in the web app. The credential is removed from the machine, so the session cannot be used from it. |
| R26 | A restored backup or a cloned app data folder is refused as a diverged actor and has to reissue many edits | Reissue uses the recovery rule of the timeline design and loses no edit (AC23). It happens once per copy. |
| R27 | Deleting takes and renders frees no storage, so an owner over the allowance cannot get under it that way | The owner erases files that no current content shows, ends restore periods and deletes saved versions (FR79). The storage view says what keeps each file and what each action frees. |
| R28 | A completed job puts the owner over the allowance | Starts are refused while the owner is over it, so the overage is bounded by the jobs that were running. |
| R29 | The approved estimate and the estimated batch budget limit estimates, and a job costs more than its estimate | The dialog says that the budget applies to estimates. A start is refused when the server's estimate rose above the approved one (N5). The request list shows the charge per request afterward. An enforced cap is decision D18. |
| R30 | Recipients of a delivery copy ask to edit it | They duplicate it where duplication is on, or the owner sends an edit link to the original with its statement (D13). |
| R31 | A result made from text that a collaborator had already changed offline becomes current, because the server had not received the edit at the completion | The out-of-date label names the input that differs on every copy, and Generate again is one action. The alternative rule is decision D19. |
| R32 | An erase removes a result that a collaborator paid for | Only the owner can erase. The dialog lists what refers to the file. The activity record names the request and the payer. The owner can take the file off the erased list while a linked copy still holds it. |
| R33 | Provider integrations in the Manual class leave requests as Outcome unknown, and Generate again can pay for a second job | The dialog says so. A late result that carries the request's reference is attached. An integration moves to Keyed or Lookup where its provider supports it. The number of Unknown requests is a metric. |
| R34 | The mapping of the ledger to the existing generation record, and the recovery class of each integration, rest on documentation and one source file that this document read, not on a test | The technical design verifies each integration before phase 5a. AC68 runs for each integration. |

### Open questions that do not block

| Code | Question | Working answer |
| --- | --- | --- |
| Q3 | Do client-review links need an expiry date or a password? | Not in phases 1 to 4. Candidate. |
| Q6 | Should the Electron app share the native sign-in? | Yes. Decided on 2026-11-17 as D23. |
| Q8 | Is the hosted cloud still labelled alpha when this ships? | If so, the sign-in dialog says it and the review sheet states the retention terms. |
| Q9 | How long are staged files of an abandoned transfer kept? | Seven days |
| Q10 | How long is the activity record kept? | As long as the document |
| Q11 | Do runs started from a native app on a cloud document use cloud credits? | Yes, as in the web app, and only on an explicit action. Local runs are unchanged. |

Q1, Q2, Q4, Q5 and Q7 are decided in this document or moved to the blocking decisions.

## Blocking product decisions

Each has a recommended default. The document is written as if the default is chosen. D3 also covers what editors of scripts and storyboards receive (SR26). D13 to D20 are choices I made where a review left alternatives open. D21 and D22 were added on 2026-11-16 from the project folder code and are open. D23 was decided on 2026-11-17 and D24 on 2026-11-18. D25 and D26 were added on 2026-11-18 and are open.

| Code | Decision | Recommended default | Consequence of the default | Blocks |
| --- | --- | --- | --- | --- |
| D1 | Does cloud editing ship before CRDT timelines? | Yes, with transitional merge and wording that says so | Sign-in, sharing and linked projects ship without waiting. Timeline co-editing keeps the draft-wins merge until phase 3 (R3). | Phase 1 |
| D2 | Do viewers get version history by default? | No. Current revision only, with history as a link option | Client review links expose only the current cut. Existing view links lose history until the owner turns it on (R7). | Phase 1 |
| D3 | Is it acceptable that editors receive alternative values and deleted content? | Yes, with the statement in the dialog and delivery copies as the way to withhold it | The timeline design stays unchanged. Withholding that material from editors would need a change to the CRDT state transfer. | Phase 3 |
| D4 | Are deleted cloud documents and projects restorable for 30 days? | Yes | Restore cloud document and Keep as local duplicate have a defined meaning. Deletion is not immediate, and the privacy text must say 30 days. | Phase 2 |
| D5 | What is the storage allowance, and does retained content count? | Everything retained counts. The storage view shows the breakdown. The amount needs your number. | Users see why deleting a clip does not free space. Without an amount, the review sheet cannot show the allowance. | Phase 2 |
| D6 | Are amendments A1 to A5 accepted into the CRDT design? | Yes | The CRDT design gains a second refusal class, a sequence check with a predecessor digest and a content digest per actor at acceptance, a restore rule, an activity record and a read-only form. No merge rule changes. | Phase 3 |
| D7 | Are the six changes to the timeline design that the storyboard and script design requires accepted, including the deferential generated write? | Yes | The timeline core gains one operation variant. Clip versions get a selection that only a person writes. Declining the deferential write changes FR60 as described in R19. | Phase 5. The selection rule for clip versions in phase 3. |
| D8 | Does deleting a script or a storyboard stop clearing the other document's link? | Yes | The link shows as missing and comes back on restore. Users unlink explicitly. Today's automatic unlink goes away. | Phase 5b |
| D9 | Does a shot that refers to a deleted line stop being a save error? | Yes | It becomes a notice in the link panel. Every caller of the validation changes. | Phase 5b |
| D10 | When does a generation make its result current by default? | A single generation started by a person enables adoption. A batch and an agent do not, unless the person turns it on. In every case adoption also needs that the request saw every pick and that the completion recorded a match. | A person who clicks Generate sees the result, unless they changed the inputs meanwhile. A background batch never replaces what someone picked or what is showing, and it can leave lines with results and no current one (D15). | Phase 5a |
| D11 | Are replicated scripts and storyboards part of this PRD as phase 5, although most of the work is outside the native apps? | Yes, as a phase that blocks no earlier phase | One document defines sharing, copies, storage and billing for all three linked document kinds. The alternative is a separate PRD that would repeat those sections. | Phase 5 |
| D12 | Do viewers of a script or a storyboard receive only the current result of each line and shot? | Yes | A review link shows the chosen take and keyframe and none of the discarded ones. | Phase 5a |
| D13 | Is a delivery copy an immutable, view-only snapshot that each update replaces with a new one? | Yes | A delivery never has history and never exposes an earlier state. Recipients cannot edit it. A recipient who must edit duplicates it, or gets an edit link to the original. No role gives edit access to the original without its alternative values and deleted content (D3). | Phase 4 |
| D14 | Is a generated suggestion removed when the person edits the field again, with its text kept in the activity record? | Yes | The review panel does not fill with stale suggestions, and editors can still find the text. The alternative keeps every suggestion until it is dismissed and changes extension E6 of the storyboard and script design. | Phase 5a |
| D15 | May a line or shot have results and no current one? | Yes | Nothing is shown or played there until a person picks or uses Use new results. The alternative chooses by matching inputs, which makes a result current without a pick or an adopting request. | Phase 5a |
| D16 | Is a completed result stored when that puts the owner over the storage allowance? | Yes, and new starts are refused until the owner is under it | A paid result is never discarded for lack of space. The owner can exceed the allowance by the jobs that were running. | Phase 5a |
| D17 | Can only the requester start a request? | Yes | Nobody is charged for a request that another person wrote. A second person creates their own request. | Phase 5a |
| D18 | Do the approved estimate and the batch budget limit estimates, or is the charge capped? | They limit estimates, and the product calls them estimates | A job can cost more than its estimate, and the request list shows the charge. A cap needs a price that each provider guarantees before the job, or a reserved maximum per job, and it would refuse providers that offer neither. It is a candidate. | Phase 5a |
| D19 | An input edit made before a job finished reaches the server after the completion. Does the adopted result stay current? | Yes. The match is decided once, at the completion, against the server's state | The result stays current with the out-of-date label on every copy (R31). The alternative withdraws the adoption when such an edit arrives. It needs a new server-written operation in the storyboard and script design, it changes what plays as a side effect of a synchronization, and it leaves the line with an older result or none. | Phase 5a |
| D20 | How does an owner over the storage allowance recover? | By erasing files that no current content shows, ending restore periods and deleting saved versions (FR79) | An erased result is gone for everyone, including a collaborator who paid for it (R32). The alternatives are a larger allowance, which is a pricing change, and storage that the owner reserves before others may generate, which adds a step to every generation. | Phase 2. Results in phase 5a. |

| Code | Decision | Recommended default | Consequence of the default | Blocks |
| --- | --- | --- | --- | --- |
| D21 | Is a replicated timeline's file in the project folder a projection of the replicated state? | Yes. An edit to the file in another app becomes transactions against the file NodeTool last wrote. | A remote edit that arrives while another app edits the file is kept. An editor that saves a stale buffer reverts remote changes as one listed edit that can be restored. The alternative keeps the file as the authority and loses such remote edits. | Phase 3 |
| D22 | How does a transfer handle linked files outside the project folder? | Collect them into the folder first, and otherwise cancel | The asset keeps its id and travels as a file of the folder. Nothing is uploaded from a path outside the folder. | Phase 2 |
| D23 | Does the Electron desktop app share the sign-in of the native apps? | Yes. Decided by Matthias on 2026-11-17. | One sign-in serves three apps. The desktop app reads and writes the same session record under the same lock as the native apps, and a sign-out in any app ends the credential for all three. Its local server stays in Local mode and keeps its own launch token. What else the desktop app gets is D24. | Phase 1 |
| D24 | Does the desktop app get cloud documents, sharing, Publish and Synchronize? | Yes, after the native apps. Decided by Matthias on 2026-11-18. | FR83 to FR87. In each phase the desktop app's work follows the native apps' work and does not hold the native exit criteria. Its own criteria are listed under Rollout. | Phases 1, 2 and 4 |
| D25 | Where does Run on a cloud document go in the desktop app? | To the cloud server, as in the web app (Q11), over a connection the desktop app's main process opens | Runs use cloud credits and the cloud's providers, the same as in the browser. The main process holds an access token while it opens that connection. The alternative runs cloud documents on the local server with local keys, which makes the same document cost different things in different apps. | Phase 1 for the desktop app |
| D26 | Which kinds open as cloud documents in the desktop app? | Workflows and timelines in phase 1, as in the native apps. Sketches, apps, JS scripts, scripts and storyboards once their reference sets exist (technical design WP2.10). Until then their rows offer Open in browser. | The desktop app never edits a kind whose file references the server cannot check. The alternative opens every kind the web app edits in phase 1 and leaves their file references unchecked. | Phase 1 for the desktop app |

In review of the storyboard and script design you confirmed one behavior change that this document relies on: a new take or render no longer retimes the timeline. D8 and D9 were not addressed there.

## Decision and change log

The sections above state only the current rules. This section holds the history of the document.

Changes on 2026-11-18. Revision 5 is kept.

| Topic | Before | After |
| --- | --- | --- |
| Electron desktop app | Sign-in only (D23). Cloud documents, linked projects and sharing in the desktop app were a non-goal. | The desktop app gets them after the native apps (D24). The summary, G4, G5, the flows, FR83 to FR87, SR3, AC76 to AC78, the rollout and the changes outside the native apps name it. The non-goal is removed. |
| Desktop sign-out dialog | The desktop app held no drafts and showed no dialog | It counts the desktop app's own drafts, as each native app does |
| Open decisions | None for the desktop app | D25 for runs of a cloud document, D26 for the kinds it opens |

Changes on 2026-11-17. Revision 5 is kept.

| Topic | Before | After |
| --- | --- | --- |
| Electron desktop app | Non-goal. Q6 answered that it keeps its own web session. | Shares the native sign-in (D23). G2, FR6, FR82, SR3, AC34, AC75, the sign-in and sign-out flows, the sign-in scope and the changes outside the native apps name it. Cloud documents in the desktop app stay a non-goal. |
| Sign-out dialog | Counted changes waiting for cloud documents | Counts the changes of the app that signs out. The other apps' changes stay on disk. |

Changes on 2026-11-16, for main at `11a6da4a`. Revision 5 is kept. Project folders, file-backed workflows and timelines, and content hashes landed on main after the commit of F1 to F14.

| Topic | Before | After |
| --- | --- | --- |
| Sources | F1 to F14 at `8372b34e` | F15 to F20 at `11a6da4a`. F8 notes the timeline file move. |
| Media assets | Immutable, content-addressed files | Files at a path with an id and a content hash. V10 reworded, V22 added. |
| Copied folders | A copied folder shared an actor | Link state is in the app's database, so a folder copy carries no link. The identity row, A2, AC23 and R26 name a restored backup or cloned app data instead. |
| Receiving | Files installed into a content-hash store | Staged in `.nodetool/`, then placed at their paths. Document files go through the document file sync. |
| Linked files | No rule | X10 and decision D22 |
| Timeline file | No rule | Decision D21 |

Changes from revision 4, in answer to its review. No scope was added. D18 to D20 are new decisions.

| Review point | Revision 4 | Revision 5 |
| --- | --- | --- |
| Actor identity | "The same digest" could be read as the predecessor digest, which two diverged transactions share | A predecessor digest ties the chain. A content digest decides repeats. Cases I1 to I5. FR71, AC23 in five cases. |
| Start and approval | A start named only a request id | An immutable execution specification with a digest. A start carries the digest and the approved estimate and is accepted under N1 to N7. FR72, SR34, AC67. |
| Cancellation | Any editor could cancel an unstarted request, and the order against a start was undefined | Start and cancel are server commands, and the first one accepted decides. A cancel before a start is final. The ledger is outside every document. E9, FR80, AC67. |
| Provider handoff | Undefined between the provider's acceptance and the record of the job id | Dispatching is recorded before the call. Unknown is a state. Recovery classes Keyed, Lookup and Manual. E10, FR81, AC68, F11, F12. |
| Spending limit | A limit that was checked against estimates | Named estimated batch budget. A start is refused when the estimate rose. No cap on the charge. D18, R29. |
| Batch start | No rule for repeating the action | A batch id. A repeat continues the batch and starts no request twice. AC69. |
| Adoption | "Matched when the job completed", without an event or a frontier | The completion is a transaction that the server accepts. It records the comparison with the server's state and the frontier. A later input edit does not change adoption. D19, R31, AC70, AC72. |
| Pick wording | "Until someone picks again" | Also until a request that saw the pick delivers a result under the three conditions. AC71. |
| Incomplete list | Shown to everyone who opens the project | Filtered by the reader's documents and their closures. X7, SR32, AC73. |
| Storage recovery | Only deleting a document freed storage | Erase a file, end a restore period, delete a saved version. The erased list. Y1 excepts what these actions free. FR79, SR33, AC74, D20, R32. |
| Receiving and crashes | Y5 without a boundary between files and the database | Files are installed before the commit. Bases are written in the commit. Recovery table. Workspace files through recorded renames. AC58 with crash cases. |
| Structure | Sections narrated earlier revisions, and tables were split by revision | Each rule is in its section. Tables are merged by topic. History is only in this section. |
| Ids | FR1 to FR78, SR1 to SR31, AC1 to AC66, R1 to R30, D1 to D17, F1 to F10 | Kept. FR79 to FR81, SR32 to SR34, AC67 to AC74, R31 to R34, D18 to D20 and F11 to F14 added. |

Changes from revision 3, in answer to its review. The phases are unchanged.

| Review point | Revision 3 | Revision 4 |
| --- | --- | --- |
| Actor identity | A copied folder was to be detected by an actor check at connect | Sequence and digest per actor at acceptance. A different transaction under an accepted number is refused, and the copy reissues under a new actor id. FR71, SR30, AC23 in four cases. |
| Synchronization and spending | A request created offline started when Synchronize committed | Request record, start command and execution ledger are separate. Synchronize starts nothing. Synchronize and start N jobs has a spending limit. FR70, FR72, E1 to E8, AC56, AC57. |
| Delivery copy | An update wrote a new version into the duplicate | Each update is a new immutable snapshot. The link returns only the latest. Recipients are viewers. FR78, SR28, AC27, D13. |
| Receiving | "The same contract in the other direction" | A fixed revision set, a check against local changes, one local transaction, Y1 to Y8. FR73, SR29, AC58. |
| Commit after a refusal | One commit per transfer id, repeated after review | Commit attempts with their own ids and recorded results. X3 and X6 revised. FR74, AC59. |
| Generation completion | A result was stored after loss of access, with no stated limit | A completion permit for one result and one outcome. Outcomes for deletion, purge and exhausted storage. A push is authorized against the timeline. FR75, AC61, A18, D16. |
| Adoption | The generation table let a batch result become current by matching inputs | Current only by a pick, or by adoption under three conditions. A line or shot can have no current result. FR57, A17, AC63, D10, D15. |
| Generated alternatives | G6 read as if every alternative were retained until resolved | G6 is scoped to people's values. A suggestion that an edit removes is in the activity record. A19, AC64, D14. |
| Offline sign-out | Sign-out ended the server session | A local outcome at once and a server outcome when the server is reachable, through a revocation handle. Linked projects wait for Synchronize after sign-in. FR76, SR31, AC19. |
| Take and render deletion | "Freed only when no saved version refers to it" | The deleted entry still refers to the file. Nothing is freed. AC65, R27. |
| Viewer options | Not defined across several grants | P1 to P6. Options are link settings and apply to people who already joined. FR77, AC62. |
| Phase 1 recovery | FR27 in phase 2 | FR27 in phase 1 for cloud documents. AC60. |
| Incomplete transfers | Complete required files and an Incomplete commit were both stated | The missing-file manifest is the one exception. X7, AC66. |
| Phase traceability | FR67 missing from the phase 1 exit list. AC52 only in 5b. | FR67 in the phase 1 exit list. AC52 on whole documents in phase 2 and on replicated documents in 5b. |

Changes from revision 2 of this PRD.

| Area | Revision 2 | Revision 3 |
| --- | --- | --- |
| Scope of CRDT behavior | Timelines only | Timelines in phase 3. Scripts and storyboards in a new phase 5. |
| Capability matrix | Storyboards and scripts in one row with sketches, apps and JS scripts | Their own rows before and from phase 5, and a row for links |
| Goals | G1 to G9 | G10 to G12 added: independent edits of scripts and storyboards, no change of what is current without a pick or a request, truthful links |
| Non-goals | No statement on text, retiming or cross-document consistency | Co-typing in one line, automatic retiming, consistency of the three documents as a unit and a native script editor are non-goals |
| Generation | "A run needs an explicit action" | A recorded request, authorized and charged at acceptance, with rules for what becomes current and for jobs that outlive access |
| Links | Not covered | Three states, link panel, no enforcement, no write across documents |
| Deletion | V1 to V14 | V15 to V21 added |
| Review | Timeline notices | Script and storyboard notices, generation and current result, links |
| Sharing | Roles and payloads for timelines | Payloads for scripts and storyboards, linked documents offered in the dialog, new sensitive content rows |
| Dependency closure | Referenced documents are not shared | Unchanged, and stated for linked documents against the design's suggestion (A9) |
| Copies | Three kinds | References to other documents defined per kind |
| Storage | Retained by history, alternatives and deleted content | Also by takes and renders that are not current or belong to deleted lines and shots |
| History | Storyboards and scripts keep a copy of a replaced version | Version history from phase 5 |
| Requirement ids | FR1 to FR53, SR1 to SR20, AC1 to AC36 | Kept unchanged. FR54 to FR70, SR21 to SR27 and AC37 to AC55 added. |
| Amendments | A1 to A8 | A9 to A15 added |
| Decisions | D1 to D6 | D7 to D12 added. D3 widened. |
| Rollout | Four phases | Phase 5 in two parts. Statement of what may be claimed before it. |

Changes from revision 1 of this PRD.

| Area | Revision 1 | Revision 2 |
| --- | --- | --- |
| Goals | G6 "No silent data loss" | G6 lists four testable recoverability clauses. G9 added for timeline merging, tied to the CRDT gates. G3 names the transfer guarantee. G8 requires a test per server kind. |
| Non-goals | "Live co-editing with shared cursors" and the web app as a whole | Only cursors and presence. Only the web app's sign-in. Overlap repair, multi-clip intent and storage reclaim added. |
| Synchronization | Timing and merge described together | Three concepts and a capability matrix |
| Timeline conflicts | Keep mine, Keep cloud, Keep both for every document | Per-register reconciliation and review for CRDT timelines. Keep local version, Keep cloud version, Keep both only for whole-document formats. |
| Delete and edit | "Counts as both changed, and Keep mine restores it" | Behavior table V1 to V14 with separate authority for entity, document, project and access |
| Transfer | Upload and download of an archive, resume in phase 3 | Staged transfer with capture, commit and status by id, in phase 2 |
| Identity | A link between a local and a cloud project | Lineage, actor, base, replicated state, three kinds of copy, copied folders and backups |
| Compatibility | Not covered | Capability negotiation, read-only fallback, legacy conversion |
| Viewer role | Opens the document and its version history | Current revision only. History, original media and duplication are link options. |
| Workspace files | Uploaded, never visible to collaborators, although documents depend on them | Required files follow the dependency closure. Optional files are off by default. |
| Secrets | "Never uploaded" and a warning | Stored credentials are excluded. Detection in user content is best-effort and described as such. |
| Deletion of media | SR11 implied deletion with the project | Retained while referenced, including by history and deleted content. 30-day restore. |
| Account | Sign-in, sign-out, one server | Scoping by server and account, switching, offline sign-out choices, revocation table |
| Authorization | On open | On every accepted transaction and every commit |
| Metrics | Included "conflict dialogs under 2%" | Removed. Completion, correctness, reconciliation, resolution, recoverability and privacy metrics. |
| Rollout | Three phases, CRDT not considered | Four phases. Phase 3 depends on the CRDT gates. Phases 1 and 2 are transitional for timelines. |
| Requirement ids | FR1 to FR27, SR1 to SR13 | Kept. FR6 and FR7 raised to P0. FR10, FR15, FR20 and FR26 reworded. FR20 moved to phase 2. FR24 and FR25 moved to phase 4. FR28 to FR53 and SR14 to SR20 added. SR5 to SR8 and SR11 reworded. |
| Terms | Upload, Get changes, Revoke link | Publish, Synchronize, Disable link |

### Resolved inconsistencies from revision 1

| Inconsistency | Resolution |
| --- | --- |
| Resume appeared in the upload flow and was delivered in phase 3 | Resume is part of the staged transfer and ships in phase 2 |
| "Only what changed" mixed document changes with byte transfer | Change detection is per document. Transfer is per file by content hash. No partial files. |
| Web changes were required while the web app was a non-goal | The non-goal is the web app's sign-in. The rollout section lists the web changes. |
| Shared sign-in was a goal and P1 | FR6 and FR7 are P0 in phase 1 |
| Self-hosted Supabase mode had no exit test | Every phase's exit criteria name the three server kinds |

## Traceability

"None" in the CRDT column means the guarantee holds without the CRDT designs. "SSD" is the storyboard and script design. Every test listed is specified and not run.

| Guarantee | Requirements | CRDT dependency | Acceptance tests |
| --- | --- | --- | --- |
| An edit is on disk before it is shown as saved | FR11, FR28 | None | AC16, AC19 |
| Independent timeline edits merge without a document-level choice | FR41 | Register model, C1. Gates of phase 3. | AC1 |
| A competing value is retained until someone resolves it explicitly | FR41, FR42, FR43 | C1, T1, T20, A4 | AC2, AC3 |
| Undo never outranks another person's value, and the app says what it revealed | FR44 | C2, T15 | AC4 |
| One sign-in serves the three desktop apps, and a sign-out ends it in all of them | FR6, FR76, FR82 | None | AC34, AC75 |
| The desktop app's renderer never holds a credential | FR87, SR3 | None | AC77 |
| A refused edit is recoverable | FR46, FR31 | C5, T16, A1 | AC10, AC17, AC32 |
| A replaced whole-document version is recoverable | FR26, FR27 | None | AC12, AC33, AC60 |
| No part of a transfer is visible before its commit | FR15, FR34, FR37 | None | AC13, AC14 |
| A repeated or retried transfer creates no duplicate | FR14, FR74 | None | AC14, AC15, AC59 |
| A transfer does not overwrite concurrent cloud work | FR35 | Transactions merge at commit, A6 | AC12 |
| Edits made during a transfer are not marked as sent | FR16 | Frontier at capture, for timelines | AC11 |
| A required file is never skipped silently | FR36, FR74, SR10 | None | AC29, AC30, AC66 |
| A timeline edit cannot restore a deleted document or bypass removed access | SR14, SR17, FR31 | A1 | AC17, AC32 |
| A linked copy keeps lineage, and a duplicate never synchronizes back | FR17, FR38, FR39, FR71 | A2, A7 | AC22, AC23, AC24 |
| Truncating the log changes nothing the user sees | None in this PRD | C4, T13, T17 | AC8 |
| A legacy client cannot erase newer work or alternatives | FR33, FR47 | Base-relative conversion, T8, T9, T20c | AC20, AC21 |
| A viewer receives the current content only | FR48, FR50, SR16 | A5 | AC26 |
| A grant exposes the dependency closure and nothing else | FR49, SR8 | None | AC28 |
| A delivery copy holds no earlier or discarded material | FR51, FR78, SR28 | None | AC27 |
| One account's local data is never sent under another | FR28, FR29, SR15 | None | AC18 |
| Restoring a version does not rewind collaborative state | FR45 | A3 | AC36 |
| Media is kept while anything retains it, and the app says so | FR53, SR19 | C4 | AC31 |
| Opening or synchronizing shared work never runs or spends | SR18 | None | AC35, AC57 |
| Two writers never have different transactions accepted under one actor and sequence number | FR71, SR30 | A2. The recovery rule of the timeline design. | AC23, AC24 |
| A generation is authorized only by an accepted start, and a request id is executed and charged at most once | FR70, FR72, SR23, SR24 | A16 | AC54, AC56, AC57 |
| Synchronize starts no generation | FR70, SR18 | A16 | AC57, AC69 |
| A receive never replaces a local version the user was not shown | FR73, SR29 | None for whole documents. Replicated documents merge. | AC58 |
| A commit attempt has one recorded result | FR74 | None | AC59 |
| A job writes only its one result and its outcome | FR75, SR24 | A10, A15, A18 | AC61 |
| A result is current only by a pick or by adoption under the three conditions, and every copy that holds the same records shows the same current result | FR57, FR58 | A17. SSD extension E4. Timeline amendment C3. | AC40, AC41, AC42, AC45, AC63, AC70, AC71, AC72 |
| A suggestion that an edit removes stays recoverable | FR60 | A19 | AC64 |
| Sign-out never reports a server outcome that has not happened | FR76, SR4, SR31 | None | AC19 |
| A recipient's effective role and options follow P1 to P6 | FR77 | None | AC62 |
| A delivery link returns the latest snapshot only | FR78, SR28 | None | AC27 |
| Independent edits of a script or storyboard merge without a document-level choice | FR54 | SSD register model and order keys. Gates of phase 5. | AC37, AC39 |
| Competing wordings of one line are both kept and no merged text is produced | FR54, FR55 | SSD decision on whole-value text | AC38 |
| A line is in at most one shot | FR54 | SSD line assignment entity | AC43 |
| A link is described truthfully and never blocks a save or writes across documents | FR56, FR65 | SSD link rules L1 to L10 | AC44 |
| A pushed result creates one version and changes no timing | FR59 | SSD keyed payload rules. Timeline amendments C2 and C5. | AC45, AC46 |
| A generated edit does not replace a person's concurrent value | FR60 | SSD extension E6. Timeline amendment C4, decision D7. | AC47 |
| An unchanged whole-document save changes nothing | FR64 | SSD conversion rules V1 to V14 | AC48, AC55 |
| A collided split or join is shown on both lines | FR62 | SSD extension E7 | AC49 |
| A viewer receives one current result per line and shot and nothing else | SR21 | None for whole documents. Materialization from phase 5. | AC50 |
| A paid result is kept while its document exists | FR68 | SSD results as non-reviving entities | AC51 |
| Copies carry or clear links as defined | FR66 | None | AC52 |
| Conversion changes nothing on screen | FR69 | SSD conversion of current values into selections | AC53 |
| A transaction is dropped as a repeat only when its content digest equals the accepted one | FR71 | A2 | AC23 |
| A start runs only the specification and the estimate that the payer approved | FR72, SR34 | A16 | AC67 |
| A cancelled or finished request is not started again by a version, a copy or a replay | FR80, SR34 | A16 | AC56, AC67 |
| After an uncertain handoff, the server submits a request again only as the recovery class of its integration allows | FR81 | None | AC68 |
| A repeated batch start starts no request twice and counts each start against the budget once | FR70 | None | AC69 |
| A reader learns of a missing or erased file only through a document they can open | FR74, FR79, SR32 | None | AC73 |
| An owner over the allowance can get under it without deleting a document | FR79, SR33 | None | AC74 |
| A crash during a receive leaves the local project unchanged or fully updated | FR73 | None | AC58 |
