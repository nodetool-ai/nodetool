Editable source: [https://claude.ai/artifact/C7vB5BB2k1GvXrya2k2hvn](https://claude.ai/artifact/C7vB5BB2k1GvXrya2k2hvn). This file is an export, so edit the Claude Doc and export again.

# Native cloud sync: technical design and implementation plan

Nov 15, 2026 · @Matthias Georgi

## Revision 5

Revision 5, 2026-11-18, records decision D24: the Electron desktop app gets cloud documents, sharing, Publish and Synchronize, after the native apps. It changes no rule of the native apps. Decisions D25 and D26 of the PRD are open, and this design follows their defaults.

| Change | Where |
| --- | --- |
| The desktop app's cloud client: cloud requests and transfer calls that the account helper authorizes, a cloud tRPC client in the web app, a media scheme, drafts in the desktop app's local server | Architecture (K17), Cloud documents, sharing and transfer in the desktop app |
| The local server of the desktop app receives an access token with a transfer call | Trust boundaries, The Electron desktop app |
| Tests TC116 to TC125, failure cases FC30 to FC32, risks TR11 and TR12 | Tests for phase 1, Tests for phase 2, Failure cases, Risks |
| Work packages WP1.14, WP1.15, WP2.14 and WP4.4 | Implementation plan |

## Revision 4

Revision 4, 2026-11-17, records decision D23: the Electron desktop app shares the sign-in of the native apps. It changes no rule of the native apps.

| Change | Where |
| --- | --- |
| The desktop app as a third client of the session record, through a helper process that links `native/account` | Architecture (K16), The Electron desktop app |
| `desktop` as an app name at sign-in | Sign-in protocol |
| Tests TC109 to TC115, failure cases FC28 and FC29, risk TR10 | Tests for phase 1, Failure cases, Risks |
| Work package WP1.13 | Implementation plan |

## Revision 3

Revision 3, 2026-11-16, brings this design up to main at `11a6da4a`. Main is 109 commits past `ff95e848` and adds project folders (PF07 to PF14, PF16 to PF18) and the fixes for nested folders. Revision 3 adds no requirement. Each change follows from a repository fact that changed, and each has a test that fails without it.

| Change | Where |
| --- | --- |
| Repository facts rechecked at `11a6da4a`. RF7, RF8, RF9 and RF13 revised. RF18 to RF28 added. | Verified repository facts |
| The blob store reuses `assets.content_hash`. An asset id no longer fixes its bytes. Committed files are placed in the cloud project folder. A changed asset travels as Put asset file. | Blob store, Operations of a transfer |
| Capture rules CF1 to CF6. Tests TC95 to TC105 and TC108. | Capture from the project folder, Tests for phase 2 |
| Link state against folder copies and moves | Identity |
| Receive staging under `.nodetool/`, placement through the document file sync, and the window in which an outside file edit becomes a version | Receiving |
| Project lock file in `.nodetool/` with a stale rule | Deletion, restore and storage |
| The timeline file against the replicated state. TC106, TC107, TR9. | Local side, Tests for phase 3 |
| PG7 revised. PG9 to PG13, decisions D21 and D22, OQ11 to OQ13, WP2.11 to WP2.13 and WP3.9 added. | Open decisions, Implementation plan |

## Revision 2

Revision 2, 2026-11-16, answers the review of the four documents. It adds no requirement. Each change replaces a mechanism that did not deliver a guarantee already written down, and each has a test that fails without it. The two CRDT designs were revised at the same time, to revision 4 of the timeline design and revision 3 of the storyboard and script design. References in this document to their rules and fixtures mean those revisions.

| Review point | Change | Where |
| --- | --- | --- |
| 1. Consecutive undo fails | Undo chain with link cells. Fixtures T22a to T22e. | Timeline design, Undo and redo. TC49 here. |
| 2. Undoing a pick loses the result | A restored pick carries `restores` and counts as a selection in effect. Empty selection and `none` are defined. Fixtures S58 to S65. | Current result. Storyboard and script design, E4. |
| 3. One closure for access and retention | Four reference sets read by role, a separate retention rule, and an attach rule | Reference sets and file authorization |
| 4. Second app has no access token | One shared session record with the access token, a generation file, and a recheck that stops a refresh from storing credentials after sign-out | Credential storage and the second app, Sign-out |
| 5. Decisions not bound to a revision | A decision names the revision and hash it was made on. The server verifies payload hashes and derives required files. | Sending, steps 3 and 7 |
| 6. Coarse transfer authorization | Membership, lifecycle and access per operation at commit, owner for delete and move, access epoch rows | Sending, steps 4 and 5. Order of access changes against writes. |
| 7. Partial acceptance of replicated transfers | Withdrawn. The attempt is validated whole and refused whole. | Transfer and replicated documents |
| 8. Completions without a result | Two completion shapes, separate capabilities for completion and migration, and a terminal state that a sweeper attaches | Completion, Completion permit |
| 9. Batch budget under concurrent retries | Batch row lock around each admission, and a rule for executions started elsewhere | Batch start |
| 10. Recovery misses extension fields | A typed recovery visitor over every field with causal identity, and a tie rule for forked order keys | Both CRDT designs. TC48 here. |
| 11. Phase 2 operations not modelled | Operation table, recovery copies, and an editing instance id in place of the session shortcut | Operations of a transfer, Transitional merge |
| 12. Incompatible prototype gates | One fixture suite, version 2, with a list of amended and superseded outcomes. The amendments are written into both designs. | Storyboard and script design, Fixture suite version 2 |
| Plan: normalization | Identity encoding keeps strings exact. NFC only in manifest matching. | Identity |
| Plan: crash tests | Process kill at a pause hook, a file system fault layer for flushes, and PostgreSQL for races between processes | Harnesses |
| Plan: debounce escape hatch | Removed from TR6 | Risks of this design |

The implementation order follows the review. It is in the plan under Order of work after the review.

## Summary and scope

This document specifies how to build PRD revision 5 in nodetool-ai/nodetool, and in which order. Phase 1 (sign-in and cloud documents) is specified to the level of tables, endpoints and tests. Phase 2 is specified as contracts and algorithms. Phases 3 to 5 are specified as server and client interfaces, because their merge behavior is gated on CRDT prototypes that have not run.

Nothing here is implemented, and no test in it has been run. Repository statements were checked at commit `11a6da4a` (main on 2026-11-16). Revision 1 read them at `ff95e848`, and revision 3 kept a fact from that reading only where its files are unchanged between the two commits. Both are newer than the PRD's `8372b34e`. The section on repository facts says what was read in code and what was not.

The PRD is the source of truth. This document replaces the earlier technical design, which is two PRD revisions behind, and takes nothing from it. Where the CRDT designs disagree with the PRD, amendments A1 to A20 of the PRD apply.

Five design decisions shape everything else.

| Code | Decision | Reason |
| --- | --- | --- |
| DD1 | Native sign-in extends the OAuth authorization server that already serves MCP, with a new scope, a new token prefix and device sessions. No second sign-in protocol. | The server already has PKCE, loopback redirects, grants a user can revoke, and rotating refresh tokens (RF1). |
| DD2 | One authorization function decides every read and write: `effectiveAccess(user, kind, id)`. Saves, transactions, transfer commits, downloads and generation starts call it at the moment they are accepted. | SR14 and A8 require the check at acceptance. One function is one place to test. |
| DD3 | Files move as content-addressed blobs, identified by SHA-256, in a new blob table beside the asset table. | Assets carry a SHA-256 content hash that a background job fills in, and capture computes it where it is still missing (RF7, CF4). The transfer contract depends on it. |
| DD4 | All link state, drafts and pending work of the native apps live in the local NodeTool database, in the same file as the local project rows. | Receiving needs one local transaction that writes documents and bases together (Y5). Two files cannot give that. Keeping link state out of the project folder also means that a copied folder carries no actor id (RF24). |
| DD5 | The execution ledger is the existing generation record, extended. Before phase 5a the durable lifecycle is generalized from FAL to every provider that ships. | The durable record covers only FAL in code (RF3). The PRD's contracts need it for every provider. |

Three findings change what the PRD assumes. They are listed with their consequences under open decisions: the durable generation record is FAL-only (PG1), deleting a project deletes its content at once (PG2), and two native apps that share one rotating refresh token will revoke each other unless refresh is serialized (PG3). The project folder work on main adds PG9 to PG13: asset bytes change under one id, workflows and timelines are files that other apps edit, a linked timeline has two local forms, linked media lies outside the folder, and the folder lock covers one process only.

## Sources, decision defaults and amendments

For revision 1 I read the PRD in full at its revision 5, the timeline design at revision 3 in full, and these parts of the storyboard and script design at revision 2: the current-state findings, the shared core and extensions E1, E4, E5, E6 and E7, the references section, the server role, agent tools, legacy clients, and rollout. For revision 2 I also read its fixtures S1 to S57 and its undo section. I did not read its per-document entity tables in full. For revision 3 I read docs/workspaces.md, the project sections of docs/projects.md and the code named in RF7 to RF9 and RF18 to RF28. I read this document, the PRD's identity, transfer and receiving sections, and the current-state sections of both designs again. The table below names the revisions that revision 1 was written against. Both designs have since been revised with this document.

| Source | Link | Used as |
| --- | --- | --- |
| PRD revision 5 | [PRD: Cloud login, upload and sharing](https://claude.ai/artifact/A3G4EixTAFqyvkkGsFDfZs) | Source of truth for behavior, ids FR, SR, AC, X, Y, I, N, E, P, V, D |
| Timeline design revision 3 | [CRDT design for the timeline document](https://claude.ai/artifact/ApkeMonzUm2vKcFCoFASNM) | Merge rules, transaction shape, fixtures T1 to T21, with A1 to A5 applied |
| Storyboard and script design revision 2 | [CRDT design for storyboards and scripts](https://claude.ai/artifact/4xQimkm7Uhd2MA5PSTz887) | Extensions E1 to E7, with A16 to A19 applied |

### Decision defaults used

None of D1 to D20 is decided. This design uses the default the PRD documents for each. The last column says what changes in this design if the decision goes the other way.

| Code | Default used | If decided otherwise |
| --- | --- | --- |
| D1 | Cloud editing ships before CRDT timelines | Phases 1 and 2 wait for the phase 3 gate. No design change. |
| D2 | Viewers get no history unless the link option is on | The migration of existing view links sets the history option on instead of off. |
| D3 | Editors receive alternatives and deleted content | State transfer to editors needs a filtered form. Not designed here. |
| D4 | Deleted documents and projects are restorable for 30 days | The trash table of phase 2 is dropped, and V3 and V4 lose Restore. |
| D5 | Everything retained counts. The amount is not set. | The allowance is one configuration value. Until it is set, the server treats it as unlimited and N7 never fails. |
| D6 | A1 to A5 accepted | Phase 3 stays blocked (R12 of the PRD). |
| D7 | The six timeline changes are accepted, including the deferential write | Generated values display by stamp. The activity hook for A19 is not needed. |
| D8 | Deleting a script or storyboard writes nothing to linked documents | The delete path keeps today's second write. |
| D9 | A missing line is a notice, not a save error | `validateScriptLink` callers stay as they are. |
| D10 | Adoption is on for a single generation by a person, off for batches and agents | Only the default value of `adopt` in the request builders changes. |
| D11 | Phase 5 is part of this plan | Phase 5 leaves this document. |
| D12 | Viewers of scripts and storyboards get one current result per line and shot | The viewer materializer lists all visible results. |
| D13 | A delivery copy is an immutable snapshot | Not designed here. |
| D14 | A suggestion is removed by the next edit and its text goes to the activity record | The naming rule for generated siblings changes in the core. |
| D15 | A line or shot may have results and no current one | The derivation gains the match rules that A17 withdrew. |
| D16 | A completed result is stored even over the allowance | The completion path gains a refusal and a discard. |
| D17 | Only the requester starts a request | N1 widens to any editor, and the ledger row's payer becomes the starter. |
| D18 | Budgets limit estimates. No cap on the charge. | A cap needs a reserved maximum per job in the ledger and a provider guarantee. Not designed here. |
| D19 | The match is decided once, at the completion | A server-written withdraw operation is added to the storyboard and script profile. |
| D20 | The owner frees storage by erase, ending restore periods and deleting versions | The erased list and its filters are dropped. |
| D21 | For a linked or cloud timeline the replicated state in the local database is the local authority. The timeline file is a projection of it, and an edit to the file is converted against the last file the app wrote (Local side of phase 3). | File as authority: each file edit replaces the state through the whole-document adapter, and siblings and tombstones the file cannot show are lost. Or no file for replicated timelines: folder copies and git history no longer carry them. |
| D22 | A transfer that requires a linked file collects it into the project folder first, after the person confirms, as export does today (CF6). | Upload in place: capture hashes the outside file at every Synchronize, and a receiver gets it as a new file in Imported/. Or refuse the transfer and name the files. |
| D23 | Decided on 2026-11-17: the Electron desktop app shares the sign-in through the helper of WP1.13. | Not applicable. |

### Amendments applied

| Code | Where this design applies it |
| --- | --- |
| A1 | Two refusal classes in the transaction endpoint (phase 3). Class 2 covers authorization and lifecycle. |
| A2 | Predecessor digest in the transaction, content digest per actor and sequence number, cases I1 to I5 (phase 3). |
| A3, A4 | Restore as a forward transaction, and the activity table (phase 3). |
| A5, A11 | The server writes the materialized document into the existing document row. Viewers read that row and never receive state. |
| A6 | The staged transfer of phase 2 replaces any archive-based synchronization. The archive stays as the interchange file. |
| A7 | The local link tables hold id map, bases, replicated state, frontier and actor per document. |
| A8 | `effectiveAccess` is called when each write is accepted (DD2). |
| A16 | Request record, start command, cancel command and ledger are four separate things. The request's specification is immutable and has a digest. |
| A17 | Rules 3 to 5 of extension E4 are not implemented. The completion is a transaction that carries the match outcome and its frontier, written at acceptance. |
| A18 | A push is a separate timeline transaction, authorized as the requester when it is accepted. |
| A19 | The server writes the text of a removed suggestion to the activity table when it accepts the edit that removes it. |
| A20 | Receiving contract, commit attempts, missing-file manifest, revocation handle, delivery snapshots, and the access filter on the Incomplete and erased lists are all specified below. |

## Verified repository facts

Revision 1 read each fact at commit `ff95e848`. Revision 3 rechecked them at commit `11a6da4a`. Where `git diff ff95e848..11a6da4a` shows no change to the files named, the earlier reading stands, and the Basis column says so. RF7, RF9 and RF13 were read again, RF8 gained a sentence, and RF18 to RF28 are new. "Code" means I read the source lines named. "Partly" means I read part of the file or matched by search, and the note says which part. Nothing was executed.

| Code | Fact | Where | Basis |
| --- | --- | --- | --- |
| RF1 | An OAuth 2.1 authorization server exists: `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/revoke`, with PKCE S256 and redirect URIs limited to https or loopback http. Clients, grants and tokens are database rows. A grant has `revoked_at`. Refresh tokens rotate, and `rotated_from` makes reuse of a rotated token detectable. Its scope is fixed to `mcp`, and its `nta_` tokens are accepted on `/mcp` only. | `packages/websocket/src/routes/oauth-as.ts`, `packages/websocket/src/oauth/validate.ts`, `packages/models/src/schema/mcp-oauth.ts`, `docs/authentication.md` | Code for the schema, the file header and the redirect check. The token endpoint body was not read. Unchanged at `11a6da4a` by `git diff`. |
| RF2 | The pending authorize request and the authorization code are held in process memory for 10 minutes. | `packages/websocket/src/oauth/pending-store.ts` | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF3 | The durable generation lifecycle is FAL-only. For any other provider `onGenerationAccepted` writes no durable record, except a plain prediction row for unit-billed app runs. | `packages/execution/src/generation-lifecycle.ts`, `createFalGenerationLifecycleHooks` and its comment | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF4 | Acceptance inserts with `ON CONFLICT DO NOTHING` on `(user_id, idempotency_key)`. An existing key with another fingerprint throws `DurableGenerationIdempotencyConflictError`. An existing key with the same fingerprint returns the row, and the caller skips the provider. The key is `fal_ai:<origin.request_id>` when the caller supplied a request id, otherwise the generation id. | `packages/models/src/durable-generation.ts` (`acceptGeneration`), `generation-lifecycle.ts` lines 285 to 342 | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF5 | The attempt and the generation are set to `submitting` before the provider call returns its request id. The recovery worker submits only attempts that are still `accepted`. An attempt without a provider request id in any other state is rescheduled as `submission_unknown` and never submitted again. After 24 hours it becomes `needs_attention` and is no longer polled. A provider webhook can still finalize it. | `packages/execution/src/generation-recovery-worker.ts` lines 36 to 44 and 568 to 630, constants `UNRESOLVED_ATTEMPT_DEADLINE_MS` | Code for those lines. The webhook path was not read. Unchanged at `11a6da4a` by `git diff`. |
| RF6 | Recovery applies a saved output to three destinations: `storyboard_keyframe`, `storyboard_clip` and `timeline_clip`. The storyboard adapter selects the new render when the attachment asked for selection and the shot has nothing selected or already shows that asset. Cancellation is a `cancel_requested_at` write that only the generation's own user can make. | `packages/websocket/src/generation-recovery.ts`, `DurablePrediction.requestCancellation` | Partly. The timeline adapter was not read. Unchanged at `11a6da4a` by `git diff`. |
| RF7 | An asset row has an id, a size, `external_path` for a file used in place outside the folder, `workspace_path` relative to its project's folder, and `content_hash`: the SHA-256 of the whole file at `workspace_path`, in hex. A background job fills `content_hash` one file at a time after the row exists. It is null until then, and again once the file's recorded size or modification time changes. The job stores a hash only while the row still records the fingerprint it read the file under. | `packages/models-core/src/schema/assets.ts`, `packages/project-services/src/project-hash-job.ts`, `Asset.recordContentHash` in `packages/models/src/asset.ts` | Code at `11a6da4a` |
| RF8 | A project has `deleted_at`, described as a tombstone kept after content deletion to reject delayed writes. Deleting a project removes its content at once. Document tables have no deletion marker. Deleting a project moves a folder NodeTool created to the trash, deletes its key prefix in object storage, and keeps a folder the user brought, minus `.nodetool/`. | `packages/models/src/schema/projects.ts`, `packages/models/src/project.ts` (`tombstoneOwned`), `packages/project-services/src/project-delete.ts` (header) | Code for the schema and the tombstone write. The content deletion was not traced. Unchanged at `11a6da4a` by `git diff`. |
| RF9 | Project import assigns new ids through `IdRemapper`, also inside JSON files of the project folder. The archive is limited to 1 GiB and 100,000 entries. It carries every file of the project folder under `workspaces/` and leaves `.nodetool/` out. A project with linked files is exported only after `prepareProjectExport` collects them, and is refused otherwise. | `packages/project-services/src/project-archive.ts` | Code at `11a6da4a` for the header, the constants and `prepareProjectExport` |
| RF10 | Document sharing has two tables: collaborators with a role, and share links with a token, a role and `revoked_at`. Neither has options, a link reference on the collaborator, or a project scope. | `packages/models/src/schema/document-sharing.ts` | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF11 | The timeline version endpoints `versions.list` and `versions.get` load the sequence with the viewer role. | `packages/websocket/src/trpc/routers/timeline.ts` lines 644 and 656 | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF12 | Version tables exist for workflows, timelines, image documents and JS scripts. None exists for scripts or storyboards. | `packages/models/src/schema/` listing | Listing. Unchanged at `11a6da4a` by `git diff`. |
| RF13 | The native apps keep the bearer token in memory and read it from `NODETOOL_TOKEN` or a Connect form. No keychain library is referenced under `native/`. The matches for "keychain" there are signing scripts and test comments. A search for `Authorization` in C++, header, QML and JavaScript files under `native/` finds 48 files at both `ff95e848` and `11a6da4a`. Revision 1 counted 47 with another file filter. | `native/node-editor/README.md`, `native/timeline/README.md`, search under `native/` | README text and search |
| RF14 | Per-user quotas cover tokens and media spend. No storage quota exists. Admission of a generation runs through `withGenerationAdmission`, `admitSpend` and `admitQuota`. | `packages/websocket/src/quota-gate.ts` header, `credit-gate.ts`, `packages/models/src/schema/user-quotas.ts` | Partly. Headers and a search for storage columns. Unchanged at `11a6da4a` by `git diff`. |
| RF15 | Permission flags `share_links` and `share_public` exist. | `packages/models/src/user-permissions.ts` | Code. Unchanged at `11a6da4a` by `git diff`. |
| RF16 | Supabase token verification is cached in process for 60 seconds. | `docs/authentication.md` | Documentation only. Unchanged at `11a6da4a` by `git diff`. |
| RF17 | Resource change events go through an outbox table and a fanout module, so they reach clients on another replica. | `packages/models/src/schema/resource-change-outbox.ts`, `packages/websocket/src/lib/resource-change-fanout.ts` | File presence only. Unchanged at `11a6da4a` by `git diff`. |
| RF18 | An asset in a project is a file at a path in the project folder plus a row. When the file changes in place, the row keeps the asset id and records the new size, modification time and partial hash. A file moved or renamed outside NodeTool keeps its id when exactly one file without a row has the same partial fingerprint, and the stored `content_hash` decides between several. The comparison runs when the project opens, after NodeTool writes into the folder, and from the folder watcher. | `packages/project-services/src/project-index.ts` (header), `docs/workspaces.md` | Partly. The header table and the documentation. The comparison code was not traced. |
| RF19 | Each project folder holds `.nodetool/project.json` and `.nodetool/assets.json`. The manifest lists every asset whose file is in the folder with id, path, size, modification time, partial hash and, once the job ran, `content_hash`. It is written through a temporary file 1 to 10 seconds after the index changes. The database stays the read path. | `packages/project-services/src/project-manifest.ts` | Code for the header, the constants and the entry type |
| RF20 | Workflows and timelines are JSON files in the project folder, `Workflows/<name>.workflow.json` and `Timelines/<name>.timeline.json`. The row records `file_path`, `file_hash` (SHA-256 of the file as NodeTool last wrote or imported it) and `file_error`. A save writes the file after the row and keeps an unseen file edit as a version named "File edit replaced by a save". The comparison imports a valid edited file after it keeps the row as a version named "Before file edit", records an invalid one in `file_error`, creates a document from a new file, and gives a file with another document's id a new id. A row newer than its untouched file gets its file from the next comparison. | `packages/project-services/src/document-file-sync.ts` (header), `packages/models-core/src/schema/workflows.ts`, `packages/models/src/schema/timeline-sequences.ts` | Code for the header table and the schema columns |
| RF21 | The folder watcher runs for a local folder from the moment a client has the project open (`set_open_project`) until no client has. It collects changed paths for 300 ms, at most 2 seconds, and compares only those. A folder in object storage is not watched. It is compared when the project opens and after NodeTool writes into it. | `packages/project-services/src/project-watch.ts` | Code for the header and the constants |
| RF22 | One writer per folder is an in-process queue, `withProjectFolderLock`, keyed by user and project. Asset saves, the comparison, the document file sync and the move of legacy asset bytes take it. The hash job does not. The queue does not exclude a second process, and no lock file exists in `.nodetool/` or elsewhere. | `packages/asset-services/src/project-asset.ts` lines 152 to 177, `packages/project-services/src/project-hash-job.ts` (header) | Code for the function. A search for lock files found none. |
| RF23 | `.nodetool/` is reserved at every depth: run code cannot read, write, list or delete in it. A directory that holds `.nodetool/`, or that a workspace row records as another project's or a game's folder, is a nested folder. The workspace refuses paths in it, and the index, the watcher, the hash job, the manifest writer, the document file sync and export leave it out. The index also skips every dot directory, `node_modules` and symbolic links. | `packages/runtime-core/src/workspace.ts` (`NestedFolders`), `packages/project-services/src/project-folder-scan.ts`, `docs/workspaces.md` | Code for `NestedFolders` and the skip rule |
| RF24 | Opening a folder decides identity by `.nodetool/project.json`. A project unknown on this install is created under that id, and its assets, workflows and timelines keep their ids. The user's own project whose recorded folder is gone moves to the folder and keeps every row. The user's own project whose recorded folder still exists makes the folder a copy: a new project, new ids for every asset, workflow and timeline, and references to the replaced ids rewritten in the folder's workflow and timeline files. An id that another row on this install holds is replaced. Another user's project and a deleted one are refused. | `packages/project-services/src/project-folder-restore.ts` (header), `packages/websocket/src/lib/project-folder-open.ts`, `remapAssetReferences` in `packages/asset-services/src/asset-references.ts` | Code for the headers, the copy branch and the rewrite function |
| RF25 | A linked asset has `external_path`: a file outside the folder, used in place. Collect copies each linked file into `Imported/`, checks the copy and keeps the asset id. Export refuses a project with linked files unless they are collected. `content_hash` and the watcher cover files in the folder only. | `prepareProjectExport` in `project-archive.ts`, the schema comments in `assets.ts`, `docs/projects.md` | Code for the export check. Collect from the documentation only. |
| RF26 | Scripts, storyboards, sketches, apps, JS scripts and chats are database rows and not files in the folder. The document file sync has adapters for workflows and timelines only, and the archive carries the other kinds in `records.json`. A copied folder therefore carries none of them, and its timeline files keep the original ids of the scripts and storyboards they name. | `document-file-sync.ts`, `DOCUMENT_KINDS` in `project-folder-restore.ts`, `project-archive.ts` (header) | Code. The kept script and storyboard ids follow from the rewrite map of RF24. |
| RF27 | The native graph runner opens the model SQLite database itself with better-sqlite3 and reads and writes asset, workflow, script, storyboard, image document and timeline rows through the production schemas. It adds the timeline file columns and saves a timeline by a compare-and-swap on the row. It writes no project file, so the next comparison writes the file for it. | `native/graph-runner/guest/host/models.mjs` (`openModelRepository`, `MODEL_TABLES`), `native/graph-runner/guest/host/models-documents.mjs` (`updateTimelineSequence`) | Partly. Those functions. Which native app runs the graph runner was not checked. |
| RF28 | Using an asset of another project in a document copies it into the project's `Imported/` directory as a new asset. Agent tools return `copied_assets`. The copy records the source id and the source's partial hash in `copied_from_hash`. | `packages/asset-services/src/copy-asset-to-project.ts` | Code for the header and the keys |

Not verified, and used below only where marked: the agent run budget with a USD cap (the PRD's F13, read in `docs/AGENTS.md` only), whether the native apps write into the project folder other than through the server's workspace, whether the two native apps share one bundled server process, which native app runs the graph runner of RF27, and which provider voices a script line. The last one decides how much of DD5 phase 5a needs (PG1).

The PRD's F12 says timeline destinations still need an adapter. A `timeline_clip` adapter exists now (RF6). The PRD's F11 describes one durable record per media generation. That holds for FAL only (RF3).

## Architecture

The cloud server stays the only authority. It authenticates, authorizes each write, stores documents and blobs, and keeps the ledger. A native app holds a credential in the operating system's store, and a local database that carries drafts, pending work and link state for each pair of server and account.

_The diagram of components on the computer and on the server, and what passes between them, is in the editable source._

Every arrow ends at the access module's decision: a request, a save, a commit and a file read are each authorized when the server accepts them.

| Code | Component | Location | New or changed | First phase |
| --- | --- | --- | --- | --- |
| K1 | Authorization server with the `native` scope, device sessions and the revocation handle | `packages/websocket/src/routes/oauth-as.ts`, `packages/websocket/src/oauth/`, `packages/models` | Changed | 1 |
| K2 | Access module: `effectiveAccess`, link options, reference sets, access epochs | `packages/websocket/src/lib/document-access.ts` (exists), new `packages/protocol/src/closure.ts` | Changed and new | 1 |
| K3 | Capability negotiation | New tRPC procedure `sync.capabilities` | New | 1 |
| K4 | Native credential and account service, one C++ library used by both apps | New `native/account/` | New | 1 |
| K5 | Local cloud store: tables `cloud_*` in the local NodeTool database | `packages/models` schema and migrations, opened as the apps open it today (WP0.4) | New | 1 |
| K6 | Native share dialog and Cloud browser | `native/node-editor/qml`, `native/timeline/qml`, shared parts in `native/ui_primitives` | New | 1 |
| K7 | Blob store: content-addressed objects and their rows | New `packages/models` tables, `packages/storage` | New | 2 |
| K8 | Transfer service: capture, stage, commit attempts, revision sets | New `packages/cloud-sync` (HTTP-independent), routes in `packages/websocket` | New | 2 |
| K9 | Transfer client, run inside the app's bundled local server | `packages/cloud-sync` client half | New | 2 |
| K10 | Trash and purge job, storage accounting, erased list | `packages/models`, `packages/project-services` | New | 2 |
| K11 | Replicated document service: acceptance, digests, snapshots, materialization into the document row | New `packages/crdt-server`, on the core chosen in CRDT phase 0 | New | 3 |
| K12 | Activity table | `packages/models` | New | 3 |
| K13 | Project grants, delivery copies and snapshots | `packages/models`, K2 | New | 4 |
| K14 | Execution ledger, start, cancel and batch commands, completion permit | `packages/models/src/durable-generation.ts`, `packages/execution` | Changed | 5a |
| K15 | Provider-neutral durable lifecycle with a declared recovery class | `packages/execution/src/generation-lifecycle.ts`, `packages/runtime/src/providers/` | Changed | 5a |
| K16 | Desktop app account client: the account helper process over K4, the main-process client with its request forwarder, the Settings section | New `native/account-helper/`, new `electron/src/cloudAccount.ts`, `web/src/components/settings/` | New | 1 |
| K17 | Desktop app cloud client: authorized cloud requests and transfer calls through K16, the cloud tRPC client and the document origin in the web app, the media scheme, the review sheet | `native/account-helper/`, `electron/src/cloudAccount.ts`, new `electron/src/cloudRequests.ts`, `web/src/trpc/`, new `web/src/components/cloud/` | New | 1, transfer in 2 |

Trust boundaries.

- The long-lived credential leaves the keychain only toward the server that issued it (SR3). The app's bundled local server receives a short-lived access token over loopback for a transfer and never the refresh token.
- In the desktop app the session lives in the account helper. Electron's main process sees a token only while it forwards a request that the helper built, to the server origin or, for a transfer call, to the desktop app's own local server. The renderer never receives one. The desktop app's local server receives an access token only inside a transfer call, as a native app's bundled server does.
- A blob is readable only through a row that ties it to a project. The object store's own addresses are never handed to a client for longer than 60 seconds, and never for a delivery copy.
- The ledger and the activity table are outside every document. No document write can change them.
- A job has no user credential. It writes through the completion permit, which the transaction validator enforces by shape (phase 5a).

## Phase 1 design: sign-in and cloud documents

Phase 1 depends on nothing in the CRDT designs. It delivers FR1 to FR11, FR21 to FR23, FR27 for cloud documents, FR28 to FR33, FR48 to FR50, FR52, FR67, FR76, FR77 for document grants, and FR82.

### Sign-in protocol

The app runs the authorization code flow with PKCE against the existing authorization server (RF1).

1. The app opens a listener on `127.0.0.1` at a free port and creates a code verifier and a `state` value.
2. It opens the system browser at `/oauth/authorize` with `client_id=nodetool-native`, `scope=native`, `resource=<server origin>`, the S256 challenge, the loopback redirect, `app` (`node-editor`, `timeline` or `desktop`) and `device_name`.
3. The user signs in to the web app the way that server offers, in Supabase mode or SSO mode. The consent page shows the app and the device name as text and asks Allow or Deny.
4. The app receives the code on the loopback listener, checks `state`, and exchanges the code at `/oauth/token`.
5. The response carries an access token, a refresh token, the session id, the user id and display name, and a revocation handle. The handle is returned by this exchange only, never by a refresh.

| Item | Contract |
| --- | --- |
| Client | `nodetool-native` is a seeded public client. Dynamic registration is not used for it. |
| Scope | `validateScope` accepts `mcp` or `native`. A grant holds exactly one. |
| Access token | Prefix `ntd_`, lifetime 15 minutes. Accepted on every route as that user, except routes that create credentials: access tokens, OAuth consents and other sessions. Refused on `/mcp`. |
| Refresh token | Rotates on every use, as today. Lifetime 90 days of inactivity (proposal). |
| Revocation handle | Prefix `ntr_`, 256 random bits, stored as a hash on the grant. `POST /oauth/session/end` with the handle and no credential ends that one grant. It answers 200 for an active or already ended grant and 404 for an unknown handle. The authentication chain never accepts an `ntr_` value (SR31). |
| Device session | The grant row gains `kind`, `app_name`, `device_name`, `last_used_at` and `revocation_handle_hash`. Settings in the web app list grants of kind `native` and revoke them (FR7). |
| Validation | Each request looks up the token hash and checks that the grant is active and the account enabled. A result may be cached for at most 30 seconds. |
| Local mode | The `native` scope is refused. A server in Local mode has one user. |
| Administrator switch | A server setting turns the `native` scope off (SR12). The authorize endpoint then answers `access_denied` with a reason the app shows. |

The pending authorize request and the code move from process memory to a database table with the same 10-minute lifetime (RF2). Without that, a sign-in whose consent and token exchange reach different replicas fails. Whether production still runs two replicas was not checked in this pass.

### Credential storage and the second app

| Item | Contract |
| --- | --- |
| Store | macOS Keychain, Windows Credential Manager, the Secret Service on Linux. One library in `native/account/` wraps them. Whether it uses QtKeychain or direct platform calls is decided by a spike (WP0.2). |
| Session record | One keychain item per server and user: service `ai.nodetool.native`, account `<server origin>` followed by the user id. Its value is one record with `state` (`signed_in` or `signed_out`), `generation` (an integer), the refresh token, the access token, the access token's expiry, and the revocation handle with a `pending` flag. Both apps read and write the whole record, and only while they hold the lock file `account.lock`. |
| Generation file | `session.gen` in the shared data folder, one per server and user: 16 bytes that hold the generation and the state. It holds no secret. It is written under the lock, before the session record, at every sign-in, refresh and sign-out. Each app reads it from a shared memory mapping or with a 16-byte file read (WP0.2 decides which). |
| Request rule | Before a process attaches the credential to a request, and before it starts a refresh, it compares the generation in the file with the generation of the tokens it holds. Equal: it proceeds. Different: it takes the lock, reads the session record and adopts it. A record in state `signed_out` means the request is not sent. |
| Repair | Under the lock, a file generation above the record's generation means a process stopped between the two writes. When the file says `signed_out`, the reader completes the sign-out in the record. Otherwise the reader sets the file to the record's generation. |
| Index | `accounts.json` in the shared data folder lists servers, account ids and display names for the Account control. It holds no secret, and no decision reads it. |
| No store available | The tokens stay in the memory of one app. The other app signs in separately and gets its own device session. The Account control says that the sign-in lasts until the app closes (SR2). |
| Lost rotation | The server accepts the previous refresh token once more within 60 seconds when the token that replaced it was never used, and answers with a new rotation. Outside that case a rotated token revokes the grant, as today. |

Revision 1 let the second app adopt the rotated refresh token and skip the server call. That left it with an expired access token, so TC4 could not pass (review point 4). The access token and its expiry are now part of the shared record, and a refresh runs as follows.

1. Take `account.lock`, waiting at most 15 seconds. On timeout the request fails as offline, and the next request tries again.
2. Read the session record and note the generation in the file. When the state is `signed_out`, drop the tokens in memory and stop.
3. When the record's access token expires more than 60 seconds from now, adopt the record's tokens and generation and release the lock. No server call is made. This is the second app's case.
4. Otherwise call `/oauth/token` with the record's refresh token, with a 10-second limit.
5. Read the generation file again. When it changed since step 2, discard the response, release the lock and start again at step 1. A sign-out has intervened, and the new tokens are never stored.
6. On success write the file with the generation plus one, then the record with the new refresh token, access token, expiry and generation. Adopt them and release the lock.
7. On `invalid_grant` write `signed_out` to the file and the record and show the sign-in prompt. On a network failure change nothing and release the lock.

The lock serializes refreshes, so two apps whose tokens expire together make one call to the token endpoint and both end with the same valid access token (FC1, TC4). Without the lock the second app would present a rotated token and reuse detection would end the session for both (PG3). Without the 60-second rule, a crash between the server's rotation and the record write would do the same (FC2, TC5).

### Sign-out

Sign-out has a local step that always completes and a server step that completes when the server answers (FR76).

| Step | Action | State shown |
| --- | --- | --- |
| Local 1 | Take `account.lock`, waiting at most 15 seconds. When it cannot be taken, continue. Step 5 of the refresh protects against the holder. |  |
| Local 2 | Write the generation file: the generation plus one, state `signed_out`. From this write on, the request rule stops both apps from attaching the credential to a new request. |  |
| Local 3 | Write the session record: state `signed_out`, both tokens removed, the revocation handle marked pending. |  |
| Local 4 | Drop the tokens from memory, abort the app's cloud requests that are in flight and close its sockets. The other apps do the same when their watch on the generation file fires, at most 1 second later, or at their next request. The desktop app's helper polls the file every second (The Electron desktop app). | "Signed out on this computer." |
| Server, reachable | Call `/oauth/session/end` with the handle. On 200, delete the handle. | Signed out |
| Server, unreachable | Keep the handle. Retry at each connectivity change and at app start, with backoff from 5 seconds to 15 minutes. | "Signed out, session not yet ended on the server" |

What this guarantees, and what it does not. No request that either app starts after local step 2 carries the credential, because each request compares the generation first. A refresh that was in flight during the sign-out discards its response at its step 5, so no credential is stored again. A request that was already on the wire cannot be recalled. It is aborted locally, and the server stops accepting the session when it processes the handle. The file watcher only speeds up the other app's display. Nothing in the guarantee depends on it.

The handle is in the record from sign-in on, so a crash at any point of the local steps leaves a state that the repair rule completes at the next start or the next request of either app, never a session that nothing on the machine can end. The app shows the session as ended only after a 200 from the server.

### The Electron desktop app

D23 makes the Electron desktop app a third client of the session record. It runs the same library as the native apps rather than a second implementation of the rules above.

A TypeScript implementation in Electron's main process was rejected. `account.lock` is a `flock` lock on macOS and Linux and a `LockFileEx` lock on Windows (`native/account/src/storage.cpp`). Node has no API for either, and a lock the native apps do not honor breaks FC1 and FC16 across apps. A second implementation of the refresh, sign-out and repair rules would also need its own copy of TC4 and TC16 to TC18.

| Item | Contract |
| --- | --- |
| Helper | `nodetool-account-helper`, a C++ executable in `native/account-helper/` that links `nodetool_account` and the platform keychain store. Electron's main process starts one per launch and exchanges JSON lines with it over stdin and stdout. It is packed as `resources/account-helper/` and built the way the VST host is. |
| What the helper owns | The `AccountSession` for the server, the sign-in flow with its loopback listener, the keychain reads and writes, the lock, the generation file, sign-out with the retries of `/oauth/session/end`, and the managed policy check (WP1.9). It is the only part of the desktop app that reads the session record. |
| HTTP | The library has no network stack. The helper asks the main process to send each request: an `http` message with method, URL, headers, body, deadline and required origin. It blocks on the answer. The main process sends it with Chromium's network stack (`net.fetch`) and never follows a redirect. It answers status 0 without sending when the URL is not HTTPS on the server origin the helper was started for, or when it differs from the request's required origin. The token endpoint calls carry tokens in their bodies, so a refresh token is in the main process's memory while such a request is in flight, and nowhere else outside the helper. |
| Browser | The helper sends the authorize URL. The main process opens it with `shell.openExternal` only when its origin is the server origin and its path is `/oauth/authorize`. A refused or failed open is reported back and ends the attempt with a message. |
| Renderer | Receives the state only: signed out, signing in or signed in, display name, server, whether the server end is pending, whether policy allows cloud features, whether a keychain exists, and a message. It can ask to sign in, to cancel and to sign out. No token, handle or record crosses the IPC boundary. |
| Local server | It runs in Local mode, and Electron's windows reach it with the per-launch local client token (`electron/src/localClientToken.ts`). That token authenticates the desktop app's windows to its own server and is unrelated to the cloud session. The local server holds the desktop app's drafts and receives an access token only inside a transfer call (Cloud documents, sharing and transfer in the desktop app). |
| App name | `desktop`. The authorization server accepts it beside `node-editor` and `timeline`. The consent page and the device sessions in Settings name it the NodeTool desktop app. The three apps share one device session (OQ1), and the name records the app that signed in. |
| Data folder | `NodeTool/native` under the generic data location, as the Qt apps' `sharedDataDir()` computes it: `$XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on macOS, `%LOCALAPPDATA%` on Windows. The helper applies the same rules without Qt. |
| Server | `NODETOOL_CLOUD_SERVER` when it is an HTTPS origin, otherwise `https://api.nodetool.ai`, as in the Qt apps. Any other value turns sign-in off. |
| Noticing the other apps | The helper reads the generation file and `accounts.json` every second. A sign-in or sign-out in a native app shows in the desktop app within 1 second plus one IPC message. The desktop app holds the credential nowhere but the helper, so a sign-out the helper notices needs no abort elsewhere. |
| Helper missing or stopped | The Settings section says that cloud sign-in is unavailable. A helper that exits is started again after 1, 5 and 30 seconds, then left stopped until the next launch. Local work does not depend on it. The operating system releases `account.lock` with the process. |
| Sign-out with waiting changes | The desktop app counts its own drafts in its local server and shows the dialog of FR30 when there are any. The native apps' drafts stay on disk under the account, as with Keep changes on this computer. |
| Quit | The main process closes stdin. The helper cancels a sign-in that waits for the browser and exits. A code exchanged after the cancel is ended on the server, as the Qt controller does. |

The guarantees of the Sign-out section hold unchanged. The desktop app is one more process that applies the request rule, the refresh algorithm and the sign-out steps through the same library. Every request it sends with the credential, the cloud requests of the next section included, is built by the helper and passes through the library's rules.

What this does not guarantee: the main process can read a refresh token while it forwards a token request. Code that controls the main process already controls the app, as code in a Qt app's process can read what its network stack sends.

### Cloud documents, sharing and transfer in the desktop app

D24 gives the desktop app the cloud features of the native apps. The renderer is the web app, so the editors, the share dialog and the project views exist. What the desktop app lacks is a way for the renderer to reach the cloud server without holding a credential, a store for drafts, and the review sheet. The rules of the native apps hold unchanged: the statuses, the saved-state rule, scoping by server and account, the transfer stages. This section defines only how the desktop app meets them.

A design that gives the renderer an access token was rejected. The renderer runs page code and loads media from many origins, and SR3 keeps every token out of it. A design in which the desktop app's local server proxies the cloud was rejected too. The local server would then hold a usable credential for the whole session, which SR3 allows only for the length of a transfer call.

| Item | Contract |
| --- | --- |
| Cloud request | The renderer calls `cloud.request` over IPC with method, path, headers without `Authorization`, and body. The main process accepts it only for the signed-in origin, with a path under `/trpc/`, on the list of file routes (`/api/assets/` and the transfer file routes), or one of the cloud window's boot reads (GET `/api/config` and GET `/api/nodes/metadata`), and refuses every path the server excludes for access tokens. It hands the request to the helper as a `request` message. The helper calls `authorizeRequest()`, attaches the access token and sends the request through the existing `http` forwarder. On 401 it calls `refresh(rejected)` and sends once more. It answers with status, headers without `Set-Cookie` and body. The renderer never sees a request with the credential. |
| Request rule in the desktop app | The helper applies the generation check of the request rule before every attach, so a sign-out in a native app stops the next cloud request of the desktop app even before the 1-second poll notices it (FC30). The main process aborts every pending cloud request when the state changes to signed out and answers it with `SIGNED_OUT`. |
| Cloud tRPC client | The web app gains a second tRPC client whose links send through `cloud.request`. Its router type is `AppRouter`, because the cloud runs the same server. The local window uses it for the Cloud and Shared with me groups only. Their query keys start with server and account, so a local and a cloud document with the same id never share a cache entry (TC124). |
| Cloud window | D27. A cloud document opens in the cloud window: one window per launch for the signed-in server and account. `cloud.openDocument` opens it, or focuses it, and opens the document there. The main process records which window is the cloud window and for which server and account. The page asks that at boot with one synchronous IPC call, so its origin never comes from its URL. In the cloud window `BASE_URL` is the cloud origin: the default tRPC client, `restFetch` and every other `fetch` to that origin go through `cloud.request`, `GlobalWebSocketManager` opens its sockets through the relay, and the window refuses its page's requests to the local server's `/api/`, `/trpc/` and `/ws`. The only exception is its drafts client, which calls `cloudLocal.drafts.*` on the local server. The page shows the account as signed in and holds no token. Its navigator lists only the Cloud and Shared with me groups. The window closes when the account signs out or another account signs in, after the dialog of FR30 when drafts wait. |
| Media | The main process registers the privileged scheme `nodetool-cloud:`. Its handler maps a URL to a file route of the signed-in origin, forwards a GET with its `Range` header through `cloud.request`, and streams the answer. The media boundary of the web app (`utils/resolveMediaUri.ts`) resolves an asset of a cloud document to that scheme. The handler refuses another origin, a route off the list and any request while signed out (TC121). |
| Drafts | The renderer writes drafts through the desktop app's local server, `cloudLocal.drafts.*` with the local client token, the same rows the native apps write (WP1.10). The desktop saver follows `CloudDocument`'s states and the saved-state rule: the draft commits within 750 ms, a save goes out after it, and Saved to cloud shows only after the accept. The saver is TypeScript, so its states are checked against the same scenarios as the Qt saver (TC120, TR11). |
| Share dialog | `ShareDocumentDialog` over the cloud client. Its statements, the people list and the admin permissions are the web app's. |
| Transfer call | A transfer runs in the desktop app's local server, as in the native apps (K9). The renderer calls `cloud.transfer` over IPC with a `cloudTransfer.*` procedure and its input without a token. The main process hands it to the helper as a `transfer` message. The helper calls `authorizeRequest()`, adds `origin`, `account_id` and `access_token` to the input, and sends it through the `http` forwarder to the local server's `/trpc/` with the local client token, which the main process adds. The forwarder accepts the local server's loopback origin as a second required origin only for `transfer` messages. The local server receives the access token only in that call and keeps it no longer than the call. |
| Review sheet | A React sheet with the stages of `TransferController` (Capturing, Reviewing, Running, CollectFirst, Finished, Failed) and its `readLink` rule: it asks `cloudTransfer.link` first and publishes or synchronizes from the answer. File → Publish to Cloud… and File → Synchronize… in the application menu open it for the project of the focused window, enabled for a project folder with a full id while signed in. |
| Runs of a cloud document | D25: Run goes to the cloud server, as in the web app. The helper answers a `socketToken` message with an access token for one WebSocket upgrade. The main process opens the socket with it in the `Authorization` header, drops the token after the upgrade, and relays frames to the renderer over IPC. The server's periodic re-validation and its `session_revoked` event close the socket (WP1.2). A sign-out closes it from the client side. |
| Kinds | D26: workflows and timelines in phase 1. A row of another kind offers Open in browser. |

What this does not guarantee: code that runs in the renderer can make authenticated cloud requests through `cloud.request` while the account is signed in, as page code in the hosted web app can with that app's session. It cannot read the token, so it loses that ability at sign-out and cannot carry it to another process (TR12).

Helper protocol, version 2. Version 1 messages are unchanged.

| Direction | Message | Fields |
| --- | --- | --- |
| Main to helper | `request` | `id`, `method`, `path`, `headers`, `body`, `timeoutMs` |
| Main to helper | `transfer` | `id`, `procedure`, `input`, `localOrigin`, `timeoutMs` |
| Main to helper | `socketToken` | `id` |
| Main to helper | `requestCancel` | `id` |
| Helper to main | `response` | `id`, `status`, `headers`, `body`, `error` (`SIGNED_OUT`, `OFFLINE` or empty) |
| Helper to main | `socketTokenResult` | `id`, `token` or `error` |

As built (WP1.14, helper): the helper answers the four messages on six request threads. A `request` carries no body and no headers, in either direction: the main process keeps the renderer's headers and body and the response's, and the helper sees the status only, which is all the 401 rule needs. Media ranges and large tRPC answers therefore never cross the helper's pipe, whose lines stop at 1 MB. A transfer answers `transferResult` with the router's status, reason and unwrapped result rather than a raw response, because `LocalTransferClient::call` in `native/account` reads the router's answer for the native apps already. The helper refuses a path under `/oauth/` and paths of no route's shape itself, before the main process applies its list. When the record says signed out, the helper's one-second read makes the session adopt it, which cancels the requests it authorized that are still waiting (TC119). The main process half follows in WP1.14's second part.

As built (WP1.14, main process): `electron/src/cloudRequests.ts` holds the pending requests and transfer calls. It applies the list of routes, keeps the allowlisted renderer headers and the body, and sends a helper `http` message only when the message names a pending id, the signed-in origin and the method and path that request was made with. A transfer's `http` message must target `<local server>/trpc/<procedure>`, and main adds the local client token there. The renderer gets the status, the content headers and the body, never the `Authorization` header. A state other than signed in ends every pending request with `SIGNED_OUT` and sends `requestCancel` for each, and a helper exit ends them as offline. Media goes through the privileged `nodetool-cloud:` scheme: `nodetool-cloud://<server host>/api/assets/...` and `/api/storage/...` map to a GET on the signed-in origin, passes `Range`, never follows a redirect, and answers 401 when signed out. The WebSocket relay follows in WP1.14's third part.

As built (WP1.14, socket relay): `electron/src/cloudSocket.ts` opens `wss://<server host>/ws` and nothing else, since the renderer names no URL. The token goes only into the upgrade headers of one `ws` connection, which follows no redirect. A socket belongs to the window that opened it. Only that window can send on it or close it, at most four per window, and they close when the window is destroyed. The server closes a socket with code 4401 when the native session ends or the token that opened it expires. A sign-out here closes every socket with the same code and tells its window. In both cases the renderer opens a new socket when it needs one. The relay uses Node's network stack, unlike `net.fetch`, so it does not follow the system proxy settings.

As built (WP1.15, renderer client): `web/src/lib/cloud/cloudFetch.ts` is a `fetch` over `cloud.request`, and `web/src/trpc/cloudClient.ts` builds the cloud tRPC client on it with the same links as the local one. `documentOrigin.ts` holds the origin of an open document and prefixes a cloud document's query keys with server and account, while local keys stay as they are (TC124). A cloud server answers `get_url` with a signed HTTPS URL, which the renderer loads as it is. Only a URL or path on the server itself goes through `nodetool-cloud:` (`cloudMedia.ts`), so the scheme also accepts `/api/storage/*`, where a server without signed URLs serves asset bytes. `CloudWebSocket.ts` gives `WebSocketManager` a socket over the main process's relay through its new `createSocket` option. `index.html` allows `nodetool-cloud:` in `img-src`, `media-src` and `connect-src`. `CloudDocumentSaver.ts` is the native saver's rule in TypeScript, with persist and send each running one call at a time, and `localDraftStore.ts` writes its drafts through `cloudLocal.drafts.*`. Its tests run the native saver scenarios with the same fakes (TC120).

As built (WP1.15, cloud window): `electron/src/cloudWindow.ts` owns the one cloud window and `cloudWindowHost.ts` binds it to a `BrowserWindow`. The window has its own session partition, `persist:nodetool-cloud`, which the design did not name. The web app keeps its tabs, settings and caches in persisted stores, so without it the two windows would read and overwrite each other's saved state. The partition also gets no local client token, so the local server treats the window's requests as any other page's, and it has its own permission policy and `nodetool-cloud:` handler. The drafts client therefore cannot call `cloudLocal.*` with a plain `fetch` from that session. It calls `cloud.local` instead (IPC `CLOUD_LOCAL_CALL`, `electron/src/cloudLocal.ts`). Main answers only the cloud window, only the `cloudLocal.drafts.*` and `cloudLocal.openState.*` procedures, and replaces the server key and account in the input with the ones of the window's origin, so the page cannot read another account's rows. In the page, `web/src/lib/cloud/cloudWindow.ts` reads the origin, `BASE_URL` uses its server, and `installCloudWindowFetch.ts`, imported first by the entry, replaces `window.fetch`. Requests to the cloud origin go through `cloud.request`, and requests to the local `/api/`, `/trpc/` and `/ws` are refused. The navigator's ordinary groups come from the page's own server, which is the cloud server here, so the window shows the account's documents and shares through them and hides the separate Cloud groups. A document asked for before the page is ready waits in the main process, up to 32. The page takes them once, after its boot, and opens each as a tab.

As built (WP1.15, cloud savers): `web/src/lib/cloud/cloudSavers.ts` is `TrpcCloudSaver` with the workflow and timeline kinds of `native/account/src/cloud_savers.cpp`, and its tests run the native saver scenarios. A save names the revision it edits, an `ALREADY_EXISTS` refusal is sent again on the latest revision up to three times, and a document in a newer schema or on a server whose capabilities refuse this client's saves opens read-only. The desktop app's workflow saves send `client_id` `desktop`, where the native apps send `native`.

As built (WP1.15, cloud window drafts): in the cloud window the web editors keep their own saves, which already name the revision they edit. `web/src/lib/cloud/CloudDraftMirror.ts` keeps each open workflow's unsent edits in the local drafts store, written after a pause in typing, at least every few seconds while typing, and again after a failed write. It accepts the draft once the editor's save lands on a new revision. A workflow that opens with a waiting draft takes it up again as unsaved edits, so the next save sends it on the latest revision. A draft the server refused (`unsent`) is left as it is. `web/src/hooks/timeline/useCloudWindowTimelineDrafts.ts` does the same for an open timeline, reading the dirty state of `useTimelineAutosave` and resuming a draft through `applyExternalMerge` with undo history paused. Whether the saver should replace the editors' saves instead is an open decision.

As built (WP1.15, sign-out): Sign out in Settings counts the account's drafts in the local server (`web/src/lib/cloud/waitingDrafts.ts`). With none it signs out at once. Otherwise `CloudSignOutDialog` offers to keep them on this computer and sign out, to wait until they are sent, or to cancel. Wait counts again every 2 seconds and signs out when no waiting draft is left, and it is offered only while some draft is waiting, since a refused draft is never sent. When the local server does not answer, the dialog says so and offers keep and cancel. Nothing is deleted in any case.

As built (WP1.15, TC125): drafts are scoped by the window's server and account, so a cloud window of account A writes and reads only A's drafts. When another account signs in without a sign-out in between, as a native app can do, the main process ends every pending cloud request and socket of the first account (`accountChanged` in `electron/src/cloudAccount.ts`). A request, transfer or socket from a cloud window that belongs to another account than the signed-in one is answered as signed out (`CloudWindow.mayCallCloud`), also while that window is still closing. A's drafts stay in the local server and are taken up when A signs in again.

As built (WP2.14, review rows): `web/src/lib/cloud/transferReview.ts` ports `TransferReview`, `unreviewedOperations` and `unreviewedFileOperations` from `native/account` to TypeScript, with readers for the local router's `send.capture`, `receive.capture` and `send.run` answers. Its tests are the review cases of `native/account/tests/transfer.cpp`, so both sheets build the same rows and collect the same decisions (TR11). `web/src/lib/cloud/TransferController.ts` ports the stages and calls of the Qt `TransferController`, and `transferCalls.ts` makes the router calls through `window.api.cloud.transfer`, parsing each answer with the router's output schema. `TransferController.test.ts` runs the Qt sheet scenarios against it with the same queued fake router (TC123). The Qt cases about which server a transfer may reach have no counterpart, since the main process sends every call to its own local server. The controller hands the sheet message keys, not sentences, so the sheet translates them. `web/src/components/cloud/CloudTransferSheet.tsx` shows the stages, and `CloudTransferHost` opens it from File > Publish to Cloud… and File > Synchronize… for the main window's project. Both entries read the link, as `readLink` does in the native apps. The main window reports whether the entries apply, so they are enabled only for a project folder with a full id while signed in.

As built (WP2.11, workspace file rows): both review sheets give every `put_workspace_file` operation a send row keyed by its path, a new file as well as a changed one, since a workspace file belongs to no document. The row reads "New in the project folder, will be sent" or "Changed in the project folder, will be sent".

### Local data scoping and durable drafts

New tables in the local NodeTool database. Every row carries `server_key` (SHA-256 of the server origin, first 16 hex characters) and `account_id`. Every query filters on both, and the access layer takes them as required arguments.

| Table | Content |
| --- | --- |
| `cloud_drafts` | One row per cloud document with unsent work: kind, document id, the base `updated_at`, the base content hash, the draft document, state `waiting` or `unsent`, the refusal reason for `unsent` |
| `cloud_open_state` | Last known role, options and last successful contact per document, for the offline and unknown statuses |

The saved state of a cloud document follows one rule, which is FR11.

1. An edit changes the in-memory document. The status is Sending or Changes waiting. It is not Saved.
2. Within 750 ms the app writes the draft row in a transaction with full synchronous flushing. Only after that commit may the edit count as stored locally.
3. The app sends the save. On acceptance it deletes the draft row and stores the new base in one transaction. Only then does the status read Saved to cloud.
4. When the local write fails, the status reads Not saving within 5 seconds, a banner offers Export, the edits stay in memory, and the write is retried every 2 seconds.

Account B never sends account A's rows, because the sender selects by the signed-in pair. Sign-out with waiting rows offers the three choices of FR30 and deletes nothing.

### Authorization at acceptance

`effectiveAccess(userId, kind, id)` returns the role, the three options and the grants that give each. It implements P1 to P6.

| Change | Detail |
| --- | --- |
| Link options | `document_shares` gains `allow_history`, `allow_download`, `allow_duplicate`, all off by default, and `disabled_at`. A disabled link admits nobody new and keeps its options live (P3). |
| Source of a grant | `document_collaborators` gains `share_id`, null for an invitation, and its own three option columns for invitations. Options of a link-based grant are read from the link at every request and never copied. |
| One link per role | A unique index on document type, document id and role over links that are not disabled (P4). |
| Migration | Existing links get all options off (D2). Existing `revoked_at` values become `disabled_at`. Owners of existing view links on timelines see a one-time notice (R7 of the PRD). |
| History | `versions.list` and `versions.get` require editor, or viewer with `history` (RF11, AC26). |
| Duplicate and download | The duplicate procedures and the original-file download route require the option for viewers. Playback routes do not, and the dialog says that playback delivers media (SR19). |

Revocation follows the table of the PRD's account section.

| Event | Mechanism | Bound |
| --- | --- | --- |
| A grant is removed | The next request recomputes access and is refused. A `grant_removed` event on the change bus makes each replica close the document's subscriptions for that user. | 60 seconds, which covers the 30-second cache and one missed event |
| A device session is revoked | The token lookup fails after the cache expires. A `session_revoked` event closes the session's connections. Every WebSocket also validates its credential again every 30 seconds. | 60 seconds |
| The account is disabled | The same lookup. In Supabase mode the existing 60-second verification cache applies (RF16). | 60 seconds |

### Reference sets and file authorization

Revision 1 stored one dependency closure per revision and used it for both access and retention. That fails in two directions (review point 3). A file that only an alternative or a deleted entity refers to would be unavailable to an editor. And for scripts and storyboards the stored document is the editor form, so its closure would give a viewer the discarded renders that the viewer payload leaves out.

`refsOf(kind, content)` is a pure function in the protocol package. It returns the files that a piece of content refers to, followed through nested references such as a clip's active version. A file is named by asset id in phase 1. From phase 2 it is named by asset id together with the content hash the asset had when the set was written, because a file changed in place keeps its asset id (RF18). Rules below that speak of a file's hash read that column. The server stores four sets per document in a table `document_refs` with the columns document kind, document id, scope, version id and file. The rows of a scope are rewritten in the transaction that writes the content they describe.

| Scope | Computed from | Readable by |
| --- | --- | --- |
| `viewer` | The viewer payload of the current revision. For scripts and storyboards from phase 5 that is the viewer form, with one current result per line and shot. | Everyone who can open the document |
| `editor` | Everything an editor receives for the current revision. For a whole document that is the document. For a replicated document it also covers every retained sibling, every deleted entity, every result and the inputs named in request manifests. | Editors and the owner |
| `version_viewer` | The viewer payload of one saved version | Viewers whose access includes history, editors and the owner |
| `version_editor` | The full content of one saved version or recovery copy | Editors and the owner |

For the two kinds that phase 1 opens as cloud documents, workflows and whole-document timelines, the viewer and editor sets of a revision are equal. The table has the four scopes from phase 1 so that the read path does not change when they start to differ in phases 3 and 5.

**Read rule.** A request for a file by someone who is not its owner is allowed when the file is in a set of a document that person can open, and the scope is one their access may read. Anything else is refused with 404, the same answer as for a file that does not exist (FR49, AC28).

**Attach rule.** A reference is not proof of permission. When a save, a transaction or a transfer commit adds a file to a document's `editor` set that the set did not hold before, the server accepts the write only when one of these holds at acceptance: the writer owns the asset or uploaded the blob, or the file is in a set the writer may read on a document that the writer may duplicate. Otherwise the write is refused with `FILE_NOT_READABLE` and the reference it names, and nothing is written. A client therefore gains nothing by writing a known asset id of another project into a document it controls (TC19). From phase 2 an accepted attach from another project adds a `project_blobs` row for the document's own project in the same transaction, and a read never resolves through another project's row.

**Retention rule.** Retention reads a different set from authorization. A file is retained while any retention root names it: any of the four scopes of any document, including documents in `deleted_documents` inside their restore period, every delivery snapshot that is not purged, every live revision set, every staged transfer younger than seven days, and every ledger row that holds a saved output not yet attached to its document. Cleanup, purge and storage use read the union of these roots. Erase is the one operation that removes a file a root still names, under the rule in the phase 2 section.

Elsewhere this document still says "closure" in three senses, which map onto the sets as follows. Access to a file means the read rule. "Current content shows the file", in the erase rule and in delivery, means the `viewer` set of a current revision or the file list of the latest delivery snapshot. Storage and cleanup mean the retention roots.

As built (WP2.10): `refsOf` accepts every kind a grant can name: workflows, timelines, storyboards, scripts, sketches, apps and JS scripts, each as a whole document. A sketch's content is its document together with its thumbnail asset, and a layer's image is read from inside its `ntlayer:` envelope. A field named like `entityId` or `entity_ids` names assets, because a library entity is an image asset. Workflows, timelines, sketches and JS scripts have version tables, so their version scopes are filled. Storyboards, scripts and apps have none, so only their current sets exist. `packages/websocket/src/lib/document-refs.ts` loads, reads and versions each kind from one table, and the read rule and the attach rule take every kind a person holds a grant on. The storage routes no longer scan the stored rows of the other kinds for 32-character ids, so an id under a field that names no asset, such as a sketch's bound workflow or a board's template, no longer makes a file readable. The erase and the filtered lists still cover workflows and timelines, the two kinds a project transfer carries.

### Transitional merge, and the version it must keep

Cloud workflows and timelines keep today's compare-and-swap save. When a save is refused, the client merges and saves again from the current base, and its draft wins. That second save replaces a version another person wrote, so the server must keep it (FR27, AC60).

Revision 1 keyed this rule on the device session. Both native apps share one device session, so two independent editors could replace each other's work with no version kept (review point 11). A shared authentication session is not an editing identity.

Rule: a client gives each open document in each process an editing instance id of 128 random bits, new at every open. Every save carries it together with the base revision. The document row stores `last_writer_instance`. Before the server applies an accepted save whose instance id differs from `last_writer_instance`, it writes the stored revision to the version table. A save by the same instance continues its own last save and writes no version, as autosave does today. A save without an instance id counts as a new instance. Both kinds that phase 1 opens as cloud documents have a version table (RF12). A client that sends a false instance id can only cause more versions of its own saves, or lose a version of a revision that it wrote itself. The test is TC8.

### Capability negotiation

`sync.capabilities` returns the protocol version, and per document kind the schema versions the server reads and writes and its modes (`whole` in phase 1). The client sends its own protocol version in a header on every request.

| Case | Behavior | Enforced by |
| --- | --- | --- |
| The document's schema version is above what the client writes | The client opens it read-only with an update prompt | Client |
| A client still saves such a document | The server refuses with `SCHEMA_DOWNGRADE` | Server, so FR33 does not rest on client behavior |
| The client's protocol version is below the server's minimum | Listing and reading work. Writes are refused with `CLIENT_TOO_OLD`. | Server |

### Native surfaces

The Account control, the three groups On this computer, Cloud and Shared with me, the two statuses, and the share dialog are QML in both apps over the existing tRPC procedures. The share dialog states what each link gives (FR52) and lists the linked script, storyboard and timeline with whether the recipient can open each (FR67). Before a link is copied, `findSecretLike(document)` from the protocol package reports node properties whose value matches a key pattern, and the dialog names them and says the check is best-effort (SR6).

A managed installation reads a policy file from the operating system's managed location with two keys: whether cloud features are on, and the list of allowed servers (SR13). The format per platform is part of WP1.9.

### Tests for phase 1

Each row is a test to write. None exists. "AC" names the PRD criterion it implements or supports.

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC1 | Sign in from each app against a server in Supabase mode and one in SSO mode | The app holds a session. The other app shows the account within 5 seconds without a browser. | AC34 |
| TC2 | Present an `ntd_` token on `/mcp`, and an `nta_` token on a REST route | Both refused with `invalid_token` | SR3 |
| TC3 | Present an `ntr_` handle as a bearer token on every authenticated route class | Refused everywhere. The grant is still active afterward. | SR31 |
| TC4 | Both apps hold an access token that expires at the same second, and both refresh | Exactly one call reaches `/oauth/token`. Both apps hold the same new access token, read from the session record, and each completes an authenticated request with it. The grant is active. | PG3 |
| TC5 | Kill the app after the server rotated the refresh token and before the keychain write. Restart within 60 seconds, and in a second run after 60 seconds. | First run: the session continues. Second run: the grant is revoked and the app asks for sign-in. No waiting change is lost in either. | PG3 |
| TC6 | Run the consent step on one server process and the token exchange on another | The exchange succeeds | RF2 |
| TC7 | Sign out offline with a waiting change, once per choice. Kill the app between the generation file write and the record write. Go online. | The cases of AC19. After the kill, the repair rule completes the sign-out at the next start. The server session ends through the handle, and the app shows it as ended only after the 200. | AC19 |
| TC8 | User A saves a cloud workflow. User B, with an offline draft, reconnects, is refused, merges and saves. Repeat with A and B as the two native apps of one user on one device session. | The version table holds A's document. Restoring it yields A's content. The same holds in the second run. | AC60 |
| TC9 | Fill the disk while editing a cloud document offline | Not saving within 5 seconds. Saved is never shown. After space is freed the edits are written without user action. | AC16 |
| TC10 | Account A has a waiting row. B signs in on the same server and opens the same document. A signs in again. | No request under B carries A's content. A's row is sent after A's sign-in. | AC18 |
| TC11 | A viewer requests a file of the current revision, a file only an older version refers to, and a file of another document in the project. Repeat with the history option on. | Served, 404, 404. With history: served, served, 404. | AC28 |
| TC12 | The grant matrix of AC62 without project links | Role, options and their source at each step as P1 to P6 give them. An option change applies on the next request. | AC62 |
| TC13 | Remove an editor's grant while they hold an open document and a waiting change | The subscription closes within 60 seconds. The save is refused. The row is `unsent` with the reason. The cloud document is unchanged. | AC17 |
| TC14 | A client with a lower schema version opens and then forces a save | Read-only in the app. The forced save gets `SCHEMA_DOWNGRADE` and changes nothing. | AC21 |
| TC15 | Open and receive a shared workflow and a shared app, then read the prediction table and the job table | No new row | AC35 |

Tests added in revision 2 for account coordination and the attach rule. A recording proxy between the apps and the server logs every request with its start time and whether it carries a credential.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC16 | App A signs out while app B has a refresh in flight. The harness holds the token endpoint's response until A's local steps are done, then releases it. | B discards the response. The session record is `signed_out` and holds no token. No request that either app started after the generation write carries the credential. The session ends through the handle. | FR76, review point 4 |
| TC17 | App B sends 50 requests per second and holds an open socket. App A signs out. | No request that B started after the generation write carries the credential. B's socket closes within 1 second, and B shows the signed-out state. | FR76 |
| TC18 | Kill app A with a process kill between the generation file write and the record write, once during a sign-out and once during a refresh. Then app B makes a request. | Sign-out: B completes the sign-out and sends nothing. Refresh: B sets the file to the record's generation, and the session continues through the lost-rotation rule. | Repair rule |
| TC19 | An editor of document D saves D with a reference to an asset id from another user's private project. Then request the file as that editor and as a viewer of D. | The save is refused with `FILE_NOT_READABLE` and D is unchanged. Both requests return 404. | SR8, attach rule |
| TC109 | Two helpers stand in for two apps, against one data folder and a file-backed test keychain. Sign in through one, sign out through the other, then the reverse. | Each helper reports the other's change within 2 seconds. After each sign-out neither returns a credential, and no later refresh writes a token into the record. | FR82, AC75 |
| TC110 | The fake server answers a token request with a 302 to another host. Separately, ask the forwarder to send to another origin, to an `http` URL, and with a required origin that differs from the URL. | The refresh fails as offline. The forwarder sends nothing in each case and answers status 0. The other host receives no request. | SR3 |
| TC111 | The helper asks the main process to open a URL that is not the server's authorize endpoint | The URL is not opened, and the attempt ends with a message | SR1 |
| TC112 | TC16 with the helper as the app that signs out while a native app's refresh is held back, and again with a native app signing out while the helper's refresh for a cloud request is held back | The held response is discarded. The record is signed out and holds no token. | FR76 |
| TC113 | Kill the helper during a sign-in after the record write, and during a sign-out after the generation file write. Start it again. | The repair rule completes each case as in TC18. A restarted process that only ends pending sessions runs the repair first, so the killed sign-out's handle is ended too. The desktop app shows the state the record holds. | Repair rule |
| TC114 | Record every IPC message from the main process to the renderer during a sign-in, a refresh and a sign-out | No message holds a token, a revocation handle or the record | SR3 |
| TC115 | Authorize with `app=desktop`, and with an unknown app | `desktop` reaches the consent page, which names the desktop app. The unknown app is refused. | FR82 |

Tests added in revision 5 for the desktop app's cloud client. The fake server issues tokens with a recognizable prefix, and a recorder logs every IPC message between main process and renderer.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC116 | Open, edit, save and share a cloud workflow in the desktop app, with one refresh during the session | No IPC message, renderer-visible response header or body holds a token, a refresh token or a revocation handle | FR87, SR3 |
| TC117 | Ask `cloud.request` for another origin, an `http` URL, `/oauth/token`, a credential-creating route, a path off the list, and a request whose answer is a redirect | Nothing is sent in the first five cases, and the call fails. The redirect is not followed. | FR87, FC31 |
| TC118 | TC4 with three apps: both native apps and the desktop helper hold access tokens that expire together, and each sends a request | One call to the token endpoint. All three end with the same valid access token. | FR6, FC1 |
| TC119 | TC17 with the desktop app as app B: it sends 50 cloud requests per second while a native app signs out | No request that the helper built after the generation write carries the credential. Pending requests answer `SIGNED_OUT`. The renderer shows Signed out within 5 seconds. | FR76, FC30 |
| TC120 | Run the saver scenarios of the Qt `CloudDocument` tests against the desktop saver, with the same fake server: edit, offline edit, refused save, failed local write, kill after the draft commit | The same statuses in the same order, and the same draft rows | FR11, FR83, TR11 |
| TC121 | Load `nodetool-cloud:` URLs for another origin, a route off the list, while signed out, and with a `Range` header | The first three are refused. The ranged request returns the bytes of that range. | SR3, SR8 |
| TC124 | Open a local workflow and a cloud workflow that have the same id in two tabs, and edit each | Each tab reads and saves its own document. No query result of one appears in the other. | FR83 |
| TC125 | AC18 in the desktop app: account A's drafts, then account B signs in on the same server | Nothing is sent under B. A's drafts are listed as waiting for A. | FR28, FR83 |

## Phase 2 design: linked projects and transfer

Phase 2 delivers the transfer contract X1 to X9, the receiving contract Y1 to Y8, the three kinds of copy, deletion review, the 30-day restore and storage recovery. Timelines are whole documents in this phase.

### Identity

| Item | Design |
| --- | --- |
| Link record | Local table `cloud_links`: local project id, server key, account id, cloud project id, state. One row per linked project. |
| Document link | Local table `cloud_link_documents`: link, kind, local id, cloud id, base content hash, base cloud revision, and from phase 3 the replicated state, frontier and actor id (A7). |
| Id map | A first publication keeps the local ids as cloud ids. When the server reports that an id is taken by a row outside this lineage, the client publishes that document under a new id and records the pair. References inside documents are rewritten at the boundary in both directions with the existing `IdRemapper` (RF9). In the common case the map is the identity. |
| Base of a whole document | SHA-256 of the canonical JSON encoding of the document: sorted keys, every string byte for byte as stored, shortest round-trip numbers. This is the identity encoding defined below. `updated_at` is not used, because a move leaves it unchanged (F8 of the PRD) and local and cloud clocks differ. |
| Duplicate | Runs the existing import path with new ids and writes no link row. References follow the PRD's copy table (FR66). |
| Interchange file | Unchanged. The export never reads `cloud_*` tables, and a test asserts that the archive table list excludes them. |

The id collision answer tells a client that an id exists on the server. Ids are 128 random bits, so it reveals nothing a client could use.

**Two encodings, kept apart.** The identity encoding is used for document hashes, attempt digests and transaction digests. It keeps every string exactly as stored. Revision 1 normalized strings to NFC there, which maps distinct strings to one, so two different documents could hash equal and a real change could look like no change. The matching encoding is the manifest encoding of the storyboard and script design (rule I6). It normalizes strings to NFC so that two requests with the same meaning match, and it is used for input manifests and for nothing else. TC33 checks both directions.

**Folder copies and moves.** Link state never goes into the project folder, `.nodetool/` included. Link rows, bases, replicated state, actor ids and pending transactions are rows of the local database (DD4), keyed by the local project and document ids. Opening a folder decides those ids by RF24, and the link follows from them.

| Folder opened | Ids | Link |
| --- | --- | --- |
| Moved or renamed on the same install | Kept | The link rows still apply. The next capture compares the files with their bases, so edits made meanwhile count as local changes. |
| Copied on the same install | New for the project, its assets, workflows and timelines | None. The copy is an unlinked project, as a Duplicate is. |
| Copied to another install | Kept | None on that install. Publishing it finds every id taken outside this lineage, so it becomes a new cloud project under new ids through the id map. The first cloud project is unchanged. |

Counterexample to keeping link state in `.nodetool/`: copy a linked folder on one install and open both copies. Both are linked with the same bases and both hold actor X at sequence number 100. Under the rule above the copy has no actor and no link, so a second actor arises only from a restored backup or a cloned data folder of the app itself, which is the AC23 setup. Tests TC95 and TC96.

### Blob store

| Item | Design |
| --- | --- |
| Object key | `blobs/<sha256>` in the existing storage adapter. The object holds the bytes that one exchange named and stays while a retention root names its hash. |
| Row | `project_blobs`: project id, hash, size, committed transfer id or null, created time. A blob without a committed row is staged. |
| Upload | The client declares hash and size. The server computes the hash of the received bytes and refuses a mismatch with `HASH_MISMATCH`. The client then hashes the file again, stores the new hash on the asset row and amends the manifest. An object the store already holds under that hash is not sent again, but only when the same owner already has a committed row for it. |
| Reads | Every read resolves through a committed row of a project the reader may open. A staged row is readable by nothing but its transfer (SR20). |
| Asset link | `assets.content_hash` exists and is the same SHA-256 (RF7), so the blob store adds no second hash. An asset id does not fix its bytes, because a file changed in place keeps its id (RF18). A cloud asset row records the hash of the bytes the last committed transfer gave it, and changed bytes travel as Put asset file. |
| Placement | On the server a project's files live in its folder in object storage (`docs/workspaces.md`, Project folders). Step 10 of the commit writes each asset row with its `workspace_path` and `content_hash`, and a `transfer_placements` row for every file it puts or deletes, asset or not. A placement task then copies `blobs/<hash>` to the path under the folder lock, keeps any bytes it replaces as a recovery copy, records an asset's fingerprint and deletes the placement row. The comparison of RF18 treats a path with a placement row as a path in flux: it neither marks the row offline nor gives the copied file a second row. A sweeper repeats every placement older than 30 seconds, in every server process and at start. A table replaces the `placement_pending` column of revision 3 because workspace files and deletes have no asset row to carry the flag. TC102. |
| Cleanup | A daily job deletes staged rows older than seven days, and objects that no row names. |

The "cloud already holds this file" shortcut is scoped to the owner's own projects. Across owners it would let anyone test whether a given file exists on the server.

### Sending: capture, stage, commit attempt

| Endpoint | Input | Output |
| --- | --- | --- |
| `transfer.open` | Transfer id chosen by the client, cloud project id or none for a first publication, the manifest | The hashes the server needs, the storage allowance and current use |
| `transfer.stageFile` | Transfer id, hash, size, bytes | Stored or already present |
| `transfer.commit` | Transfer id, attempt id, manifest, decisions, optional missing-file manifest, document payloads | The attempt's recorded result |
| `transfer.status` | Transfer id | State of the transfer and the result of every attempt |
| `transfer.cancel` | Transfer id | Cancelled, or the commit result when one attempt already committed |

The manifest lists every operation of the transfer, by the operation table below, with document kind, cloud id, base revision, base hash and captured hash, and each required file with hash, size and referring documents. Each decision names its document, the choice, and the cloud revision and hash that the review sheet showed for that document. Document payloads travel with the commit call, not in staging, so a staged transfer holds files only.

`transfer.commit` runs in one database transaction with a row lock on the transfer.

1. Compute the attempt digest over the identity encoding of the manifest, the decisions, the missing-file manifest and the hash of each payload. Look up the attempt id. A stored attempt with the same digest returns its recorded result. A stored attempt with another digest is rejected with `ATTEMPT_CONTENT_MISMATCH`.
2. When the transfer is already committed, record this attempt as refused with `ALREADY_COMMITTED` and return.
3. Verify the payloads. Compute the identity hash of every document payload. A hash that differs from the manifest's captured hash refuses the attempt with `PAYLOAD_HASH_MISMATCH`. Run `refsOf` on every verified payload. A file it returns that is not in the manifest's required files, the missing-file manifest or the erased list refuses the attempt with `MANIFEST_INCOMPLETE`. The server therefore derives the required files itself and never trusts the client's list.
4. Lock the access epoch rows of the project and of every target document in share mode (see the order of access changes below). Check that the sender is the owner or an editor of the project at this moment (X9). For a first publication, check the allowance.
5. For every operation, lock the target document's row and check three things: the document is in this project now, it is not in `deleted_documents`, and `effectiveAccess` gives the sender the role that the operation table requires. Check the attach rule for every file the operation adds. Collect every failure with its code: `DOCUMENT_NOT_IN_PROJECT`, `DOCUMENT_DELETED`, `ACCESS_REMOVED`, `OWNER_REQUIRED` or `FILE_NOT_READABLE`.
6. Check that every required file has a staged or committed blob row, or is named in the missing-file manifest, or is on the erased list (X7).
7. For each whole document, compare the stored content hash with the manifest's base hash. On a mismatch the operation may proceed only when its decision names exactly the stored revision and hash as the one the person reviewed. A decision that names any other revision does not count. Collect every uncovered mismatch with the stored revision and hash.
8. For each replicated document, from phase 3, validate every carried transaction in order by steps 1 to 4 of the acceptance function, against the state under the lock and without writing. Collect every refusal.
9. When steps 5 to 8 collected anything, record the attempt as refused with the list and return. Nothing else was written (X6).
10. Apply every operation as its row of the operation table says, with its history effect, the reference set rows, the asset rows and the missing-file rows, and mark the staged blob rows as committed. For a first publication, insert the project row here and nowhere earlier (X2).
11. Record the attempt as committed with the new cloud revisions, and set the transfer to committed.

Steps 1, 2 and 11 give X3: an attempt id has one recorded result, and at most one attempt of a transfer commits, because step 2 and step 11 run under the same lock. A refused attempt writes only its own row.

Step 7 binds a decision to the revision the person reviewed (review point 5). The person reviews cloud revision B and chooses Keep local. A collaborator saves C before the commit. The decision names B, the stored revision is C, and the attempt is refused with C in the list. C is replaced only by a later attempt whose decision names C. Step 5 closes the case of review point 6: a document that moved to another project while the transfer was staged still has a matching content hash, because a move does not change the content version, and it is refused on membership.

As built (WP2.7, send half): the client is `packages/project-services/src/cloud-send-client.ts`, with a `cloud_sends` row per transfer that holds the captured manifest and payloads, so every attempt carries the same content. The attempt id is recorded before the commit is sent. After a crash the client asks `transfer.status` for that attempt's result, and a committed attempt only updates the local bases, so a commit is never sent twice for one capture. A first publication uses the local project id as the cloud project id and creates the `cloud_links` row when it commits. A document deleted locally becomes a delete operation only when the deletion review confirms it. This half captures documents and the asset files they name. Workspace files no document names, and the id map for an id taken on the cloud, are not built yet. `CloudHttpTransport` in `cloud-http-transport.ts` speaks the tRPC wire format of `native/account/src/trpc_call.h` and streams file bytes over the REST routes. Its caller passes the fetch that applies its egress policy.

As built (WP2.7, local router): the app drives both halves through the `cloudTransfer` tRPC router of its bundled server (`packages/websocket/src/trpc/routers/cloud-transfer.ts`): `send.capture`, `send.run`, `send.cancel`, `receive.capture`, `receive.run` and `resume`. Each call names the cloud origin and account, and the calls that reach the cloud carry the short-lived access token. The router derives the server key from the origin as `native/account` does and continues a send or receive only for the local user, server and account it was captured for. The fetch it hands `CloudHttpTransport` (`packages/project-services/src/cloud-origin.ts`) sends only to that origin and follows no redirect. The origin must be https, or http to a loopback host. A stale token answers `CLOUD_SIGNED_OUT`, and a cloud failure `CLOUD_UNREACHABLE` when a retry can help and `CLOUD_REFUSED` when it cannot. A capture that finds files outside the folder answers `collect_first` with their asset ids (CF6). The router answers only on a SQLite server.

As built (WP2.8a, native client): `native/account/include/nodetool/account/cloud_transfer.h` holds `LocalTransferClient`, which calls that router with the session's origin, account and access token, renews the token once when the cloud refuses it, and reads each answer into plain structs. `TransferReview` builds the review sheet from a send capture and a receive capture: Send, Receive, Choice, Deletion and Problem rows. A document deleted on this computer is one Deletion row whichever half lists it. It restores the cloud version until the person confirms Keep local deletion (V4, V5). A `BASE_CHANGED` refusal turns its document into a Choice row that names the stored hash, and Keep local on it becomes the decision of the next `send.run`.

As built (WP2.8b, review sheet): `native/account/qt` holds `TransferController` and `qt/qml/TransferPanel.qml`. `receive.capture` names each document's cloud revision hash, and `send.capture` names each captured document, so the sheet shows names and receive decisions name cloud ids. Synchronize runs `receive.run` first. When the receive replaced a document, the controller cancels the captured send and captures it again, so a send never carries a local copy the person chose to replace. A document the person kept local is refused once with `BASE_CHANGED`. When the stored hash is the revision the sheet showed, the controller repeats `send.run` with Keep local for it. A newer revision asks again. The badge and the copy actions are not built yet.

As built (WP2.8c, menu entries): File > Publish to Cloud… and File > Synchronize… open the sheet in both apps. The local `cloudTransfer.link` query answers `unlinked`, `linked` with the cloud project id, or `linked_elsewhere` for a link to another server or account. With `readLink` set, `TransferController` asks before it captures, and a project linked elsewhere fails with a sign-in hint. The entries are enabled only for a project folder on the bundled server of this launch.

### Capture from the project folder

A linked project's media, workflows and timelines are files that other apps change at any time (RF18, RF20), and the watcher runs only while the project is open (RF21). Capture reads the folder under these rules. Each names the case that fails without it.

| Code | Rule | Counterexample without it | Test |
| --- | --- | --- | --- |
| CF1 | Capture first runs the asset and document comparison of the whole folder under the project folder lock (RF22) and reads the rows before it releases the lock. | A `git pull` replaced a workflow file while the project was closed. Capture reads the row, sends the old graph, and records a base that the file no longer matches. | TC97 |
| CF2 | A workflow or timeline travels as a document only. Capture leaves every path that a row names in `file_path`, and every `*.workflow.json` and `*.timeline.json` path, out of the workspace files. A receive never keeps two files at such a path. | The timeline file also travels as a workspace file. Both sides changed it, so V11 keeps the received file beside the local one. The comparison finds a second file with the timeline's id, gives it a new id and creates a second timeline. | TC98 |
| CF3 | A document whose file is invalid (`file_error` set to a validation error) is not captured, and the review sheet lists it with the error. A document whose file is missing is captured from its row and listed. | Capture sends the last valid row and moves the base to it. The person's newer edit in the invalid file is later imported over a received version without review. | TC99 |
| CF4 | A required asset is named by its `content_hash` when the row records one and the file still has the recorded size and modification time. Otherwise capture hashes the file as a stream after it releases the lock, checks the fingerprint again after the read, and stores the hash with the conditional write of the hash job (RF7). Capture does not wait for the job. | Capture runs before the job reached a new 20 GB file, so the manifest has no identity for it. | TC100 |
| CF5 | Workspace files are found by the index's own scan, which leaves out `.nodetool/`, nested folders, dot directories, `node_modules` and symbolic links (RF23). | An outer project captures the `projects/<id>/` folder of an inner project and publishes another project's files, or captures `.git/`. | TC101 |
| CF6 | An asset with `external_path` is collected into the folder before capture, after the person confirms, or the transfer does not start. This is the default of decision D22. | A linked 40 GB file is uploaded from outside the folder. It has no maintained hash and no watcher (RF25), so an edit after capture goes unseen, and a receiver on another machine has no path for it. | TC103 |

CF4 has the limit of the hash job. A file whose bytes change while its size and modification time stay the same keeps its stored hash, and capture names the old hash. When the cloud lacks that hash, the upload is refused on mismatch and capture hashes again. When the owner's cloud already holds it, the upload is skipped and the cloud keeps the old bytes. Whether the comparison clears the hash when only the partial hash changes was not traced. A full hash of every required file at each Synchronize closes the case at the cost of reading every file. It is OQ11.

As built (WP2.11, Collect step): a capture that needs a file outside the folder answers `collect_first` with the asset ids, and the review sheet stops at Collect first. Collect calls `assets.collect` on the bundled server, which copies every linked file of the project into `Imported/`, keeps each asset's id and clears its `external_path` once the copy is verified, as export does. No cloud token goes with the call. When every file was copied, the sheet captures the project again. A linked file that is missing, changed since it was linked, or not verified fails the transfer and is named with its reason, so nothing is sent without it. Cancel sends nothing. Workspace files that no document names (CF2, CF5) are not captured yet.

### Operations of a transfer

Revision 1 modelled document payloads and files and nothing else. This table is the complete vocabulary for phase 2 (review point 11). An operation outside it is refused by schema. A failed precondition refuses the whole attempt at step 9.

| Operation | Payload | Precondition at commit | Role at commit | Identity | History effect | Repeat |
| --- | --- | --- | --- | --- | --- | --- |
| Create document | Document and captured hash | No row with the id exists, live or deleted, outside this lineage | Editor of the project | The local id is kept. On a collision the client takes a new id and records the pair. | None | The attempt's recorded result. A new attempt that finds its own row sends a replace. |
| Replace whole document | Document, base revision and hash, captured hash | The stored hash equals the base hash, or a Keep local decision names the stored revision and hash | Editor of the document | Unchanged | The stored revision goes to the kind's version table. Scripts and storyboards have none before phase 5, so theirs goes to `recovery_copies` for 30 days (V2). | Recorded result |
| Keep both | The local document and a decision | The decision names the stored revision and hash | Editor of the project | The local version is created under a new id that the manifest names. The cloud document is unchanged. The link records the pair. | None | Recorded result. The id is fixed by the manifest, so nothing is created twice. |
| Keep cloud | None | None | None | No cloud write. The receive brings the cloud revision, and the local one goes to a local recovery copy. | None | Nothing to repeat |
| Saved versions | Version rows the cloud lacks, by version id and hash, for kinds with a version table | The version id is absent | Editor of the document | Version ids are kept | Rows are added and never replaced | An id present with the same hash is skipped. Another hash is refused. |
| Rename | New name and base name | The document is in this project | Editor of the document | Unchanged | The later acceptance wins, and both names go to the activity record (V6) | The same name again changes nothing |
| Move to another project | Target project and base project | The document is in the base project now | Owner of the document, and editor of the target project | Unchanged. The content revision and hash do not change (V7). | Activity row. The later move wins (V8). Grants from the old project stop applying (V9). | A document already in the target counts as done |
| Delete document | Id, base hash and the confirmation from the deletion review | The document is in this project and its stored hash equals the base hash | Owner of the document | The row moves to `deleted_documents` | The 30-day restore period starts | A document this transfer already deleted counts as done |
| Put workspace file | Path, hash, and base hash or none | The stored hash at the path equals the base hash, or the path is absent for a new file. Otherwise both files are kept and the path is listed. | Editor of the project | The path | The replaced file stays retained for 30 days through a `recovery_copies` row | The same hash at the path counts as done |
| Put asset file | Asset id, path, new hash, and the base hash | The cloud asset's hash equals the base hash. Otherwise both are kept: the sent bytes become a new asset beside it under a name with the device and date, documents keep the existing id, and the path is listed (V22 of the PRD). | Editor of the project | The asset id | The replaced bytes stay retained for 30 days through a recovery\_copies row | The same hash on the asset counts as done |
| Delete workspace file | Path and base hash | The stored hash equals the base hash | Owner of the project | The path | As for a put | An absent path counts as done |
| Add conversation | Thread and messages. Optional and off by default. | The sender owns the conversation | Editor of the project | The id is kept when it is free. A conversation whose id exists is copied whole under a new id. | None. Conversations are never merged. | The recorded id pair makes a repeat change nothing |
| Replicated document | The pending transactions up to the captured frontier, from phase 3 | Every transaction passes step 8 | Editor of the document | Actor and sequence numbers | Activity rows as in the acceptance function | A repeated transaction is acknowledged under I2 |

`recovery_copies` is a table with document kind, document id or workspace path, the replaced content or blob hash, the operation that replaced it, and a purge time. It exists because the PRD requires a recovery copy for kinds that have no version table, before phase 5 gives scripts and storyboards one.

### Order of access changes against writes

The access check and the write it authorizes must not be separable by a revocation (review point 6). Every document and every project has a row in a table `access_epochs`. A transaction that changes a grant, a link, a role, a document's project or its deleted state locks the affected epoch rows for update and increments them. A transaction that accepts a write locks the epoch rows of the document and of its project in share mode before it calls `effectiveAccess`, and holds them until it commits. This covers saves, CRDT transactions, transfer commits, generation starts and revision set captures.

A revocation therefore either commits first, and the write sees it and is refused, or it waits for the write, which was authorized at the moment it committed. No interleaving accepts a write after the revocation committed. SQLite has a single writer, so the rule holds there without the rows. The test is TC34, on PostgreSQL.

### Receiving: revision set, stage, check, apply

| Endpoint | Input | Output |
| --- | --- | --- |
| `receive.capture` | Cloud project id, or one document id | Revision set id, expiry, and per document: cloud revision, content hash, and the files it requires |
| `receive.document` | Set id, document id | The captured revision |
| `receive.file` | Set id, hash | The bytes, or `ERASED` |
| `receive.release` | Set id | Released. Repeating it is harmless. |

A revision set is rows, not copies: `revision_sets` and `revision_set_entries` with the document revision or the blob hash. A captured revision has to stay readable after later saves. For a kind with a version table, the capture writes the stored revision as a version row when no row holds it yet. For scripts and storyboards before phase 5 it writes a `recovery_copies` row. A file named by a live set is a retention root until the set is released or seven days old (Y1). Each call authorizes the reader again (Y6, SR29). An entry exists only for documents the reader could open at capture, and its file list is the reference set that the reader's role may read.

As built (WP2.5): the service is `packages/project-services/src/cloud-receive.ts`, the tRPC router `receive`, and `GET /api/receive/:set_id/files/:hash` for the bytes. A file row is `revision_set_files`. An entry stores, besides the version id, the payload fields that the version table does not hold, such as a workflow's tags and run mode, so the captured payload hashes to the transfer hash the capture returned. A capture reuses the newest version when it holds the stored content and otherwise writes a manual version named "Kept for a download", which the autosave limit never prunes. A set that expired, was released or names a version the owner deleted answers `REVISION_SET_EXPIRED`. A file whose bytes are gone answers `ERASED`. A document deleted after capture is refused like a removed grant, because each call authorizes the reader again.

The local apply follows the PRD's stages. The design adds where each fact is stored, so that the recovery table of Y5 can be tested.

| Step | Storage effect |
| --- | --- |
| Stage | Files under `<project folder>/.nodetool/cloud-staging/<set id>/`, named by hash. `.nodetool/` is reserved, so no run, no comparison and no watcher sees them (RF23). A row in `cloud_receives` with state `staging`. |
| Install | Each staged file is flushed and checked against its hash. State `installed`. |
| Commit | Under the project folder lock: run the comparison of CF1, then one transaction on the local database repeats the check against `cloud_link_documents.base_hash` and against the hashes the sheet showed, writes the document rows, the asset rows with `workspace_path`, `content_hash` and `placement_pending`, the new bases and the pending placements, and sets state `applied`. |
| Placement | Still under the lock. Each staged file is renamed to its path when the target is absent or still has the recorded hash, the asset's fingerprint is recorded and `placement_pending` is cleared. Each workflow and timeline file is written through the document file sync, which records `file_hash`, so the comparison takes it for NodeTool's own write (RF20). A target with other content is kept, the received content goes beside it, and the path is listed. |
| Finish | Release the set, delete the staging folder, delete the `cloud_receives` row. |

DD4 is what makes the commit step one transaction. On restart, the app reads `cloud_receives`: `staging` resumes downloads, `installed` repeats the check and commits, `applied` finishes the placements and runs Finish. No other state exists. A row with `placement_pending` after a crash is a path in flux for the comparison, as on the server, so the asset is not marked offline in between.

The lock is held from the comparison to the last placement, so no comparison in the same process runs in between. A person who edits a received document's file in another app inside that window loses nothing: the document file sync keeps the unseen edit as a version named "File edit replaced by a save" before it writes, and the receive result lists the document as changed during the receive (TC104). The lock covers one process only (RF22). A second process that writes the same folder is kept out by the project lock file below.

As built (WP2.7, receive half): the client is `packages/project-services/src/cloud-receive-client.ts` and its rows are `cloud_links`, `cloud_link_documents`, `cloud_link_files` and `cloud_receives`. The capture records each document's status against its base and the local copy, and the decisions it takes without the person: a document only the cloud changed is received, one only the local side changed is kept, and one both sides changed is received only when the person says so. A pending placement is a `transfer_placements` row with the set id, the same row the server uses, so the comparison treats the path as in flux without a `placement_pending` column. A placement copies the staged file to a free path with `absorbNew`. When the target holds the hash of the last exchange in `cloud_link_files`, the client first renames the target into the staging folder and hashes the moved bytes. Bytes another app saved since the check go back to the path, and the received file goes beside it. Only bytes that still equal the base are replaced. After a crash in that step, the moved bytes are put back before the placement repeats. The folder lock is reentrant within one task, which lets the receive run the comparison and write document files while it holds the lock. The capture output names each file's name, content type and path, which the client needs for a file it has no asset for.

### Deletion, restore and storage

| Item | Design |
| --- | --- |
| Deleting a cloud document | The row moves to a table `deleted_documents` with its kind, id, owner, project, payload, sharing rows, deletion time and purge time. Its version rows and reference set rows stay. Live tables and their read paths are unchanged. |
| Deleting a cloud project | The project row is tombstoned as today, and its documents move to `deleted_documents` instead of being removed (PG2). Links and grants stop resolving at once (SR11). |
| Restore | The owner moves the row back within 30 days. The id is unchanged, so links resolve again. |
| Purge | A daily job deletes rows past their purge time, their versions, and blobs that no committed reference names. "End a restore period now" sets the purge time to now and runs the job for that row. |
| Storage use | Sum of the sizes of distinct blob hashes with a committed row in the owner's projects, including those held only by versions, deleted documents and snapshots. The storage view groups each blob by what refers to it, from the retention roots. |
| Allowance | One value per plan. Unset means unlimited (D5). |
| Erase | Owner only. Refused while the hash is in the viewer set of any current revision in the project or in the file list of a latest delivery snapshot, and the refusal names that content. Otherwise the blob row and object are removed, a row is written to `project_erased_files`, and the activity table records who, which entries and, for a result, the request and payer. |
| Incomplete and erased lists | Served per reader: a row is returned only when its hash is in a reference set that the reader may read, with only those documents named. Counts and sizes are computed over the filtered rows (SR32, AC73). |

As built (WP2.9, erase): the tables are `project_erased_files`, one row per project and hash with the size, the asset ids with that content and the time, and `project_missing_files`, one row per project and asset id with the hash and size the sender knew and the reason. `packages/project-services/src/project-erase.ts` holds the erase, its preview and taking a file off the list, served as `storage.erasePreview`, `storage.erase` and `storage.unerase`. A person with a role on a document of the project who is not its owner gets `FORBIDDEN`, anyone else `NOT_FOUND`. The erase locks the project's files and then every workflow and timeline row of the project, refuses while a current revision refers to an asset with the hash or a file of the project's folder has it, and names each. Otherwise it deletes every blob row of the project for the hash, staged or committed, writes the erased row, and appends a `file_erased` row to the activity record of each document whose saved versions or deleted copy refer to the file. The object is deleted after the commit when no row of any project and no live revision set names it, and otherwise by the blob cleanup later. The transfer commit takes the project's files lock before any document row, the order the erase uses. It does not require an erased file, accepts a document that refers to an asset the erased row names, deletes the rows it staged for an erased hash before it commits its rows, records the confirmed missing files that are not erased, and removes the missing rows of the required files it supplied. Open does not ask for an erased file's bytes. A capture leaves erased files out of a document's files and lists them in `erased_files`, and `receive.file` answers `ERASED` for a hash on the project's erased list even while another project keeps the object. The local receive returns those asset ids as `erased_files`. Not built yet: the delivery snapshot check, which arrives with delivery snapshots in phase 4, and the request and payer of a generated result, which arrive with results in phase 5. The filtered lists follow.

As built (WP2.9, filtered lists): `storage.projectFileLists` (`packages/websocket/src/lib/project-file-lists.ts`) returns the Incomplete mark, the missing files and the erased files of a project for the caller. A row is returned only when the current content of a workflow or timeline of the project that the caller can open refers to one of its assets, or a saved version does and the caller may read history. The row names only those documents, an erased row lists only the asset ids they refer to, and the byte totals cover the returned rows. The mark is set while the caller's missing list is not empty. The references are read from the content with `refsOf` rather than from the stored reference sets, because a set holds only files with an asset row the owner owns, and a missing file usually has none on the server. The owner sees every row, including rows no document refers to now. A caller who can open no document of the project gets `NOT_FOUND`. Project grants arrive in phase 4, so a reader with a project grant is not served yet.

A lock file `.nodetool/open.lock`, held by the process that opened the project for writing, names the app, its process id, the host, the process start time and the project id. A second process opens the project read-only and names the holder (AC25). A copied folder carries the file. A lock that names another project id, or a process on this host that is not running with that start time, is therefore stale and is replaced. A lock from another host cannot be checked: the app offers to open read-only, or to take over after the person confirms that no other computer has the project open. The folder lock of RF22 is in-process and cannot give AC25. TC105.

As built (WP2.13, lock file): `native/account/include/nodetool/account/project_lock.h` holds the lock file both native apps link. The file is JSON with `app`, `pid`, `host`, `start_time` and `project_id`. The start time is a token of the platform, compared only for equality: the boot id and the start ticks on Linux, the start seconds and microseconds on macOS, and the creation time on Windows. A process that runs but whose start time cannot be read counts as the holder, so a lock is never replaced while its holder may still write. The check and the write run under an operating system lock on `.nodetool/open.lock.guard`, so two apps that open the folder at the same moment cannot both take it. Release removes the file only while it still names the releasing process. `ProjectLocks`, one per app, counts the windows of that app on one project, so the file goes when the last of them closes or the app ends. `account_project_lock_tests` runs the stale rules, the take-over and the race on all three platforms. In both apps `ProjectLockState` (`native/account/qt`) takes the lock when the bundled server names a project folder that exists on this computer, and `ProjectLockBanner.qml` names the holder. While another app holds it, the timeline model is read-only in the timeline app and the tab refuses every edit in the node editor. Check again takes the lock after the other app closed the project. For a holder on another computer, Open for editing asks whether that computer still has the project open, then takes the lock over. The lock covers the document editors only. Asset imports through the server and the desktop app's editors do not take it.

### Tests for phase 2

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC20 | Send one commit attempt from two connections at the same moment | One transaction commits. Both callers receive the same recorded result. | AC15 |
| TC21 | Send two different attempts of one transfer at the same moment, both valid | Exactly one is committed. The other is recorded as refused with `ALREADY_COMMITTED`. | X3 |
| TC22 | Kill the server process inside step 10 | After restart the transfer is not committed, no document, project or blob row from it is visible, and repeating the attempt commits. | X8 |
| TC23 | Upload bytes whose hash differs from the declared one | Refused. No blob row. | SR20 |
| TC24 | As another account, open a transfer that names the hash of a file the first account holds | The server asks for the bytes | Blob scope |
| TC25 | Before a first publication commits, request the project by id, by a share token created for that id, and list projects | Not found in all three | AC13 |
| TC26 | The crash points (a) to (d) of AC58 | The outcomes of AC58, read from `cloud_receives` after each restart | AC58 |
| TC27 | Capture a revision set. Save the document twice and delete one of its files from every current revision. Download everything the set names. | The captured revision and every file are served | Y1, Y2 |
| TC28 | Delete a cloud project, restore it on day 29, and in a second run let day 31 pass | Restored with identical documents, versions and links. In the second run the rows and unreferenced blobs are gone. | D4, SR11 |
| TC29 | The reader, project and erase arrangement of AC73 | Outcomes of AC73, checked on every response body of that reader | AC73 |
| TC30 | Export an interchange file from a linked project and import it | The import is unlinked and holds no `cloud_*` row | AC22 |
| TC31 | Round trip of a 1 GB project with 10,000 files | Every document hash and blob hash equal after publish, linked download on a second machine, edit and synchronize | Phase 2 exit |

Tests added in revision 2 for decisions, authorization and the operation table.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC32 | Review cloud revision B of a document and choose Keep local. A collaborator saves revision C. Commit. | Refused. The refusal lists the document with revision C and its hash, and C is unchanged. A new attempt whose decision names C commits. | X6, review point 5 |
| TC33 | Commit a payload whose bytes do not match its captured hash. Separately commit a payload that refers to a file the manifest does not list. Separately hash two documents whose text differs only in Unicode normalization form. | `PAYLOAD_HASH_MISMATCH`. `MANIFEST_INCOMPLETE`. Two different identity hashes, and equal manifest hashes when the same two strings are manifest inputs. | Step 3, encodings |
| TC34 | Remove an editor's grant and accept a save by that editor from two connections at once, 1,000 times, on PostgreSQL. Repeat with a transfer commit and with a generation start. | In every run the write is refused, or it committed before the removal. No write is accepted after the removal committed. | SR14, review point 6 |
| TC35 | Stage a transfer. Then, in three separate runs, move one of its documents to a project the sender cannot open, delete one of its documents, and lower the sender to viewer on one document. Commit. | Each attempt is refused and names the document with `DOCUMENT_NOT_IN_PROJECT`, `DOCUMENT_DELETED` or `ACCESS_REMOVED`. Nothing is written. | Review point 6 |
| TC36 | As an editor who is not the owner, commit a delete and a move | Refused with `OWNER_REQUIRED` | Operation table |
| TC37 | One transfer for each row of the operation table. Commit it, repeat it with the same attempt id, and send it again under a new attempt id. | The first commit has the row's effect and history effect. Both repeats change nothing. | Review point 11 |
| TC38 | Replace a script and a storyboard by transfer, and replace a workspace file. Open each recovery copy. | The replaced content is readable for 30 days and equals the old content | V2 |

Tests for the project folder.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC95 | Link a project. Copy its folder on the same install and open the copy with Open folder. | The copy is a new project with new ids and no `cloud_links` row, and Synchronize is not offered for it. The original's link rows and bases are unchanged. | Folder copies |
| TC96 | Copy a linked folder to a second install of the same account and open it there. Publish it. | The project keeps its ids and has no link row. The publication finds every id taken outside this lineage, so the new cloud project has new ids. The first cloud project is unchanged. | Folder copies |
| TC97 | Close a linked project. Replace a workflow file with an edited valid one. Open the project and Synchronize within 100 ms, before the watcher's quiet time ends. | The manifest carries the file's graph and its identity hash. The row has a version named "Before file edit". | CF1 |
| TC98 | Both sides edit one linked timeline as a whole document in phase 2. Synchronize and choose Keep both. | Exactly one extra timeline exists, from Keep both. No manifest names a `*.timeline.json` path as a workspace file. | CF2 |
| TC99 | Make a workflow file invalid and Synchronize. In a second run delete the file instead. | Invalid: the workflow is not in the manifest, the sheet shows the error, and the base is unchanged. Missing: the row is sent and the sheet lists the missing file. | CF3 |
| TC100 | Add a 20 GB file with the hash job stopped and Synchronize. In a second run another app appends to the file while capture reads it. | First run: the manifest names the SHA-256 that capture computed, and the row holds it. Second run: capture finds the fingerprint changed after its read, stores nothing and hashes again. | CF4 |
| TC101 | Put an inner project folder, a `.git/` directory and a symbolic link to an outside folder into a linked project. Synchronize with every optional file selected. | No path under the inner folder, `.git/`, `.nodetool/` or the link target is in the manifest or on the sheet. | CF5 |
| TC102 | Kill the server process after a commit and before placement. Open the cloud project in the web app. Restart the server. | Before the restart the asset is not offline and has no second row. After it the sweeper places the file, records its fingerprint and clears the flag. | Placement |
| TC103 | Synchronize a project that has a linked file. Choose Collect. In a second run choose Cancel. | Collect: the file is copied into `Imported/`, the asset keeps its id, and the transfer carries it as a file of the folder. Cancel: no transfer starts and nothing is staged. | CF6, D22 |
| TC104 | Hold a receive after the comparison of its commit step. Edit the received workflow's file in another app. Release. | The row and the file hold the received graph. The edit is a version named "File edit replaced by a save". The receive result lists the workflow. | Receive window |
| TC105 | Open a project in one app. Copy its folder and open the copy in the second app. Then kill the first app and open the original in the second. | The copy opens for writing, because its lock names another project id. While the first app runs, the original opens read-only and names it. After the kill it opens for writing. | Lock file |
| TC108 | Change one asset's bytes in place on this computer, and in another way through a second linked copy that has synchronized. Synchronize. | Both are kept: the received bytes are a new asset under a name with the device and date, documents keep the local id, and the path is listed. The cloud's replaced bytes are readable as a recovery copy for 30 days. | Put asset file, V22 |

Tests added in revision 5 for transfers from the desktop app.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC122 | Publish and synchronize a project from the desktop app while recording IPC traffic and the local server's request log | The renderer's traffic holds no token. The local server receives an access token only in `cloudTransfer.*` calls that the forwarder sent with the local client token. A `transfer` message for another local origin is refused. | SR3, FR85 |
| TC123 | Run the review sheet scenarios of the Qt `TransferController` tests against the React sheet, with the same fake local server: publish, synchronize, linked elsewhere, collect first, a refused keep-local, cancel | The same calls in the same order and the same stages | FR13, FR85, TR11 |

## Phase 3 design: CRDT timelines

This section fixes the server and client interfaces around the merge core. It does not choose the core. That choice is the gate of CRDT phase 0, between the custom core and the Automerge variant, on the timeline fixtures of suite version 2 and budgets B1 to B7. Nothing in this section starts before that gate, the shadow-mode results of CRDT phase 1 and the conformance of CRDT phase 2.

### Storage

| Table | Content |
| --- | --- |
| `crdt_documents` | Document kind and id, the snapshot of the state, its frontier, the profile version, the retained log floor |
| `crdt_transactions` | Document, actor, sequence number, content digest, predecessor digest, stamp, body, acceptance order. Truncation sets the body to null and keeps the row, so digests live as long as the document (I1 to I5). |
| `crdt_served_bases` | For whole-document clients: the state at each served version, kept for the last 20 versions and at most 24 hours |
| `crdt_actor_leases` | Document, actor, connection id, expiry. Renewed every 30 seconds. |
| `document_activity` | Document, order, type, acting user, payload, time (A4) |

The existing `timeline_sequences.document` column keeps holding the materialized document. The server rewrites it in the transaction that accepts a transaction. Every reader that exists today, including viewers, exports and agent tools that read, keeps working and never sees state (A5, SR16).

### Acceptance

One function accepts a transaction. It runs in a database transaction that holds a lock on the document's `crdt_documents` row, so acceptance is serial per document on any number of replicas.

1. Lifecycle: when the document is in `deleted_documents`, refuse with class 2, code `DOCUMENT_DELETED` (A1, SR17).
2. Authorization: `effectiveAccess` for the sending user must give editor. Otherwise refuse with class 2, code `ACCESS_REMOVED` (SR14).
3. Identity, by the stored digest rows of the actor: I2 returns an acknowledgement and writes nothing. I3 and I4 refuse with class 2, code `DIVERGED_ACTOR`. I5 answers `EXPECTED_SEQUENCE` with the number and writes nothing.
4. Validation by the timeline design's rules N1 to N5, schema, stamp bound and track type. A failure refuses with class 1 and the index of the failing write.
5. Apply to the state, append the transaction row with both digests, write the materialized document and its reference set rows, append activity rows for an explicit resolution or a restore, and enqueue the fan-out.

The content digest is SHA-256 over the canonical encoding of actor, sequence number, predecessor digest, stamp, dependencies and writes, with the canonical rules used for document hashes in phase 2. The server computes it. A digest sent by a client is ignored.

| Refusal | Client behavior |
| --- | --- |
| Class 1, invalid | Recovery of the timeline design: the refused transaction and its dependents become void, the rest are reissued with a dot map |
| Class 2, `ACCESS_REMOVED` or `DOCUMENT_DELETED` | Every pending transaction moves to Unsent edits as a whole. None is reissued to that document (A1). |
| Class 2, `DIVERGED_ACTOR` | Take a new actor id. Fetch the stored digests of the old actor. Find the last sequence number where the local content digest equals the server's. Reissue every later transaction under the new actor through the recovery procedure (A2). |

The actor lease only improves the experience: a second connection for a leased actor is told `ACTOR_IN_USE` and takes a new actor id before it writes. The guarantee of SR30 comes from step 3 alone. A lease that expired during a network partition lets two writers through, and step 3 still refuses the second.

### Wire protocol

New message types on the existing MsgPack WebSocket, per subscribed document: `crdt_hello` with actor and applied vector, `crdt_tx`, `crdt_ack`, `crdt_refuse` with class and code, `crdt_snapshot` with state and frontier, and `crdt_remote` for transactions of others. A client behind the retained log receives a snapshot. A viewer's subscription receives the materialized document and no `crdt_*` message.

A whole-document save from a legacy client enters the same acceptance function after the base-relative conversion. A missing base returns the existing conflict response (FR47).

### Local side

A linked or cloud timeline keeps its state snapshot, frontier, actor id and pending transactions in `cloud_link_documents` and a table `cloud_pending_transactions`. A pending transaction is committed locally before the edit shows as stored, by the same rule as a draft in phase 1. The native timeline uses the C++ core of CRDT phase 2, and the web editor the TypeScript core.

**Timeline file (D21).** A replicated timeline keeps its file `Timelines/<name>.timeline.json` (RF20). The default for D21 makes the replicated state the authority and the file a projection. After each accepted or local transaction, the document file sync writes the materialized timeline and records `file_hash`. An edit to the file in another app is turned into transactions by comparing the file with the last file NodeTool wrote, not with the current state. Those transactions go through local acceptance like any other edit. A file that does not parse is refused as today and changes nothing.

Counterexample to the file as authority: a collaborator moves clip A, and the transaction arrives while this computer's file still holds the old position. Another app shortens clip B in that file. Reading the whole file as the new state moves A back. The comparison against the last written file yields only the change to B, so both changes stay (TC106). The limit is TR9. An editor that saves a buffer it read before the last projection reports the old values as edits, and they revert the remote change as new transactions. The activity record and the version named "Before file edit" keep the reverted state restorable (TC107). The alternative keeps the file as the authority and rebuilds the replicated state from it. It keeps the folder exact but loses concurrent remote edits such as the move of A. This decision is open for Matthias.

### Transfer and replicated documents

A commit attempt carries, for each replicated document, the pending transactions up to the captured frontier. Step 8 of `transfer.commit` validates all of them without writing. Step 10 calls the acceptance function for each of them inside the commit transaction.

Revision 1 committed the attempt and reported the refused transactions per document. That is withdrawn (review point 7). It let a script update be left out while the storyboard and timeline updates of the same capture became visible, and it still reported the transfer as committed. That breaks the guarantee that a captured set becomes visible as a whole.

X6 says that a replicated document never causes the refusal for a changed base. That holds: an edit that someone else made concurrently merges and refuses nothing. It does not require a commit with a hole in it. An invalid transaction, a diverged actor, a missing dependency or a removed access refuses the whole attempt with `REPLICATED_REFUSED`, the document, the transaction and the refusal class. Nothing is written. The client runs the recovery for that class locally, captures again and sends a new attempt under the same transfer id. When the class is removed access or a deleted document, the client takes that document out of the capture and its edits go to Unsent edits (A1). The PRD says this under X6 since 2026-11-16. The withdrawn partial commit is listed as PG4.

### Restore and activity

Restoring a version computes the difference between the materialized current document and the version, and submits it as one ordinary transaction by the restoring person (A3). The acceptance function appends a `restore` activity row. An explicit resolution appends a `resolution` row with the values it removed (A4).

### Tests for phase 3

The merge fixtures of suite version 2 belong to the CRDT phases. The rows below test what this design adds around them.

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC40 | The five cases of AC23 against the acceptance function, each also with the two senders on different server processes | The outcomes of AC23. The digest table never holds two different digests for one actor and sequence number. | AC23 |
| TC41 | Truncate the log, then send a repeat of a truncated transaction and a different transaction under its sequence number | The repeat is acknowledged under I2. The other is refused under I3. | FR71 |
| TC42 | Let an actor lease expire while its holder is partitioned. A copy with the same actor connects and writes. The first holder returns and writes. | One of the two is refused as diverged and reissues under a new actor. Every edit is present once. | SR30 |
| TC43 | Remove an editor's grant between two of their transactions on one open connection | The first is accepted, the second refused with `ACCESS_REMOVED`. No reissue is attempted. | AC17 |
| TC44 | Subscribe as a viewer to a timeline with conflicts and deleted clips, and record every frame | No `crdt_*` frame. The materialized document holds no sibling and no deleted entity. | AC26 |
| TC45 | Commit a transfer that carries three pending transactions, the second of which is invalid | The attempt is refused and names the document and the second transaction. Nothing from the attempt is visible in any document. After the local recovery, a new attempt commits with the first transaction and without the void ones. | PG4 |
| TC46 | Kill the server between applying a transaction and writing the materialized document | Neither is stored. The client's repeat is accepted once. | AC9 |
| TC47 | Compare the materialized document on the server and on a client at equal frontiers, hourly in the beta | Equal | Divergence metric |

Tests added in revision 2 for recovery.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC48 | AC23 with richer content. Two copies of one actor each hold, beyond transaction 100, an insert into the same gap, a pick, an adopting request that saw that pick, an undo of a pick, and a generated write. One copy is refused as diverged and reissues under a new actor. | After recovery the reissued request's `selectionSeen` names the new dot of the reissued pick, and its adoption is in effect exactly as before. `readFrontier` and `restores` hold the new dots. The two inserts with identical order keys are both present and sort by entity id on every replica. No reference into another document was rewritten. | Review point 10 |
| TC49 | The undo fixtures T22a to T22e of suite version 2 through the server: three edits, three undos and three redos, with remote writes between them | The outcomes of the suite on every replica and in the materialized document | Review point 1 |

Tests for the timeline file, under the default for D21.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC106 | A remote transaction moves clip A of a linked timeline. Before its projection is written, another app shortens clip B in the timeline file. | The timeline holds A at its new position and B shortened. The file is rewritten with both, and its hash equals `file_hash`. The transaction made from the file edit names clip B only. | D21 |
| TC107 | An editor reads the timeline file, a remote transaction moves clip A and is projected, and the editor then saves its old buffer unchanged. | Clip A moves back in one new transaction marked as a file edit. The activity record lists it, and restoring the version named "Before file edit" returns A to the remote position. | TR9 |

## Phase 4 design: project sharing and delivery

Phase 4 adds a project scope to the access module and an immutable snapshot store. It needs phases 1 and 2 and nothing from the CRDT work.

### Project grants

| Item | Design |
| --- | --- |
| Tables | `project_collaborators` and `project_shares`, with the same columns as their document counterparts after phase 1, including options, `share_id` and `disabled_at` |
| Access | `effectiveAccess` adds the person's project grants on the document's project to the set it reduces by P1 and P2. A document grant can raise a role and never lowers one. |
| Read paths | Every document read and list goes through `effectiveAccess`. A lint rule and a test that enumerates the tRPC procedures and REST routes of the document kinds assert that none loads a document by owner id alone. |
| Shared with me | The list query unions document grants and project grants |
| Never shared | Conversations, and workspace files outside every closure |

R11 of the PRD is the reason for the enumeration test: project sharing reaches every read path, and one missed path is a privacy fault.

### Delivery copies

| Item | Design |
| --- | --- |
| Tables | `delivery_copies`: id, source kind and id, owner, link token, options for download and duplication. `delivery_snapshots`: delivery id, sequence number, the materialized document with cross-document references cleared, the list of blob hashes its payload refers to, creation time, and purge time once superseded. |
| Create and update | Each inserts a snapshot row with the next sequence number, in one transaction that also sets the purge time of the previous one to 30 days ahead. No statement updates a snapshot row. |
| Link | The token resolves to the snapshot with the highest sequence number, read at each request |
| Files | `GET /api/delivery/<token>/files/<hash>` streams the blob through the server when the hash is in the latest snapshot's file list. No object-store address is issued for a delivery. |
| Earlier snapshots | Readable by the owner only, through an owner route that takes the snapshot id |

Streaming through the server costs egress on the application server. A signed object-store address would stay valid after an update for as long as it lives, which SR28 does not allow.

### Tests for phase 4

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC50 | The sequence of AC27, with the recipient keeping every address it was given | After the update: the link returns the new snapshot, the old snapshot id is refused, and the kept address of the removed clip's file is refused | AC27 |
| TC51 | Update a delivery from two sessions at once | Two snapshots with consecutive numbers. The link returns the higher one. | FR78 |
| TC52 | For every document procedure and route, call it as a user who holds only a project view grant, and as a user with no grant | Reads succeed for the first within the viewer payload. Everything is refused for the second. | FR24 |
| TC53 | AC62 with project links | Outcomes of AC62 | AC62 |

## Phase 5 design: scripts and storyboards

Phase 5 runs scripts and storyboards on the replicated document service of phase 3, with a profile for each. The storyboard and script design is approved for prototyping only, so this section is an interface plan, not a build order. It starts after phase 3 ships and after fixture suite version 2 and properties P1 to P8 pass in the prototype. Suite version 2 is the one authoritative list of fixtures for all three profiles. It is defined in revision 3 of the storyboard and script design, and it replaces the outcomes of S7, S18, S48 and S52, which amendment A17 withdrew (review point 12).

### What changes against the storyboard and script design

| Amendment | Design text it replaces | What is built |
| --- | --- | --- |
| A16 | A request starts a job when it is created | The request entity is content. Its payload is the execution specification: kind, input manifest, destination, requester, adoption setting, provider, model and parameters. It is immutable under the keyed-payload rules K1 to K5. The specification digest is SHA-256 of its canonical encoding. Starting is a server command (see Generation contracts). |
| A17 | Rules 3 to 5 of extension E4, which choose a current result by matching | Not built. The derivation below has two ways only. |
| A17 | The job writes result and outcome, and nothing records a match | The completion transaction carries `match` and `matchFrontier`, which the server fills in when it accepts it |
| A18 | The job pushes into linked timelines | The push is a separate transaction to the timeline, authorized as the requester when accepted |
| A19 | A person's next edit removes a generated alternative, which then exists only in history | The server writes the removed text to the activity table at acceptance |

### Current result

The current result of a line, or of a shot for one kind, is a pure function of the document state. Every replica with the same state computes the same answer (G11).

A sibling of the selection register holds a result id or `none`, which is a pick of nothing. The siblings in effect are the non-fallback siblings when there are any, and otherwise the fallback siblings. A fallback sibling exists only as the restore value of an undone pick. It carries `restores`: the dots that stood for the selection before that pick.

A request covers a sibling when the sibling's dot is in the request's `selectionSeen`, or when the sibling is a fallback and every dot in its `restores` is in `selectionSeen`. Let Q be the requests on that line or shot for which all of these hold: `adopt` is true, the outcome is succeeded, the completion recorded `match`, the result is visible, and the request covers every sibling in effect.

1. When Q is not empty, the current result is that of the request in Q with the greatest `sourceOrder`, then the greatest id.
2. Otherwise, when the register displays a sibling whose value is a visible result, it is that result. The displayed sibling follows the register's display rule, so a fallback is displayed only when no other sibling exists.
3. Otherwise there is none. This covers an empty register, a displayed `none`, and a displayed pick whose result is deleted.

Revision 1 took only the non-fallback siblings. Undoing a pick restores the earlier pick as a fallback, so the function returned no result, or let an older adopting request win (review point 2). With `restores`, undoing a pick returns the current result to what it was before the pick. That holds when the pick came before a request, while its job ran, and after its result was adopted (fixtures S58 to S61). When another person's pick arrived in the meantime, that pick is in effect and is shown (S62). An empty register has no sibling to cover, so every adopting request with a match qualifies. A `none` is a pick like any other: a request that did not see it is not in effect (S63).

I ran these rules and the review's two counterexamples as an executable model, crdt\_traces.py. The revision 1 function fails as the review describes, and the function above passes S58 to S65. The model covers one register and no server.

One consequence differs from the PRD's wording that a pick the request did not see ends the adoption. An undone pick is no longer in the state, so the adoption applies again. The alternative drops `restores`: undo then returns the earlier pick and never the adopted result. It is listed as OQ7.

`sourceOrder` is the request's stamp, so "newest" is the creation of the request and never the end of its job. The out-of-date label is separate from this function: a replica compares the result's manifest with its own displayed inputs.

### Completion

A completion is one transaction by the document's completion actor, in one of two shapes. On success it has two writes: a create of the result under the request's line or shot, and a set of the request's outcome to succeeded with the result id. On failure, timeout or cancellation it has one write: a set of the outcome to failed with the reason, or to cancelled. Revision 1 allowed only the first shape, so a failed or cancelled job could not record its outcome in the document (review point 8). The match comparison below applies to the first shape only.

The acceptance function handles it in the same per-document order as every other transaction. Inside the lock it computes the manifest of the line's or shot's displayed inputs in the server's state, compares hashes, and writes `match`, `no_match` or `cannot_verify` and the state's frontier into the outcome value before it computes the content digest. The ledger row's `completion_dot` goes from null to this transaction's dot in the same database transaction, which is what limits a request to one completion.

Because the server is the only author of the completion and writes the match into it, no client supplies a match, and an input edit that the server receives later cannot change the stored value (D19).

### Deferential writes and the activity record

A generated write carries its read frontier and sets the fallback flag (extension E6, decision D7). A19 needs the server to tell a generated alternative from a fallback that an undo left behind, because only the first goes to the activity record. The sibling therefore records `origin: generated`. When the acceptance function applies a person's write that removes such a sibling, it appends a `suggestion_removed` activity row with the text, its author and its stamp. The `origin` field is an addition to extension E6 that the storyboard and script design does not have, listed as PG5.

### Push to a timeline

After a completion is accepted, a server task takes each linked timeline clip the request listed. It calls `effectiveAccess` for the requester on the timeline at that moment. With editor access it submits the keyed clip version through the timeline's acceptance function. Without it, it records `not_added: no_access` on the ledger row. A missing timeline or clip records nothing as an error. Any other failure is retried with backoff for 24 hours and then recorded as `not_added` with Retry (FR59).

This replaces the attachment adapters of today's recovery worker for these targets (RF6). The storyboard adapter currently selects a new render at completion under a condition of its own. That write is removed, because only a person's pick writes the selection register.

### Viewers, versions, conversion

| Item | Design |
| --- | --- |
| Viewer payload | The materializer has a viewer mode that keeps the current result of each line and shot and drops every other result, request, manifest, relation and deleted entity (A11, SR21). The document row holds the editor form, and the viewer form is computed per read and cached by revision. |
| Version tables | New `script_versions` and `storyboard_versions`, with a snapshot and its frontier per version (RF12) |
| Conversion | One server transaction per document by the migration actor, under the migration capability. The stored current take, keyframe and clip become selections. Existing results get `sourceOrder` from their creation time and id. A corpus test compares materialized output with the stored document (AC53). |
| Agent tools and directing runs | They write transactions per entity through a document handle pinned to one frontier, and create requests with an explicit `adopt` |
| Link validation | Every caller of `validateScriptLink` treats a missing line as a warning before storyboards are replicated (D9) |

### Tests for phase 5

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC60 | Evaluate the current-result function on the states of AC40, AC41, AC63, AC70, AC71 and AC72, on three replicas that received the transactions in different orders | The same answer on all three, equal to the PRD's outcome | Those criteria |
| TC61 | Submit a completion with a client-chosen `match` value through the transaction endpoint as an editor | Refused by shape. Only the server actor may write an outcome. | A17 |
| TC62 | Deliver two completions for one request, on two server processes at once | One is accepted. The second is refused and no second result exists. | FR75 |
| TC63 | Complete a job whose requester lost edit access to the timeline, then restore the access and press Retry | No version after the completion and `not_added: no_access` in the request list. One version after Retry. | AC61 |
| TC64 | A person's edit removes a generated alternative. Separately, a person's edit removes a fallback left by their own undo. | One `suggestion_removed` row with the text in the first case. None in the second. | AC64 |
| TC65 | Read a script and a storyboard as a viewer through every read procedure, with conflicts, deleted entities and unpicked results present | One current result per line and shot, and nothing else from that list | AC50 |

Tests added in revision 2 for the current result and for media access by role.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC68 | A script with a discarded take. A storyboard with a discarded render and a deleted shot that has a render. A timeline with one file that only a retained alternative refers to and one that only a deleted clip refers to. Request each file as a viewer, as a viewer with history, and as an editor. | Viewer: 404 for every one. Viewer with history: served only when a saved version's viewer payload shows the file. Editor: every file is served. | AC50, review point 3 |
| TC69 | Run the selection fixtures S58 to S65 of suite version 2 against the server's current-result function and against both client cores | The outcomes of the suite, equal on all three | Review point 2 |

## Generation contracts

The PRD maps its execution ledger onto the durable generation record and flags that mapping as resting on documentation (R34). I read the code. The mapping holds for FAL and for no other provider (RF3). This section states what exists, what the ledger adds, and what has to be generalized first.

### What exists, and what it already gives

| PRD rule | Existing behavior, FAL only | Gap |
| --- | --- | --- |
| E1, one execution per request id | A second acceptance of the same idempotency key with the same fingerprint returns the existing row, and the caller skips the provider (RF4) | The key is unique per user, and is the caller's request id only when the caller sent one |
| N4, specification mismatch | The same key with another fingerprint raises an idempotency conflict (RF4) | The fingerprint is computed from the provider request, not from a specification stored in a document |
| E10, Dispatching before the call | `submitting` is written on the generation and the attempt before the provider returns a request id (RF5) | None for FAL |
| E10, Unknown is not replayed | Recovery submits only `accepted` attempts and never `submitting` or `submission_unknown`. After 24 hours the generation is `needs_attention` (RF5). | None for FAL. This is the Manual class. |
| Late result for an Unknown request | A provider webhook can still finalize an unresolved attempt (RF5) | The webhook path was not read |
| Cancel | A `cancel_requested_at` write by the generation's own user (RF6) | No cancel before start, no cancel by the owner, no ordering against a start |
| N5 and N7 | Admission checks credits, quota and permission flags before the provider call (RF14) | No approved estimate, no storage allowance |

### Ledger

The ledger is the `predictions` table with new columns. No second table, so the recovery worker, cost reconciliation and the generations list keep working on it.

| Column | Meaning |
| --- | --- |
| `request_doc_kind`, `request_doc_id`, `request_id` | The document the request was created in, and its id there |
| `idempotency_key` | Set to `req:<document id>:<request id>` for ledger rows. With `user_id` set to the requester, the existing unique index gives one row per request, because only the requester can start (E2) and a cancel before start is written under the requester's id as well. |
| `input_fingerprint` | The specification digest |
| `approved_estimate` | The estimate the payer confirmed, in USD |
| `ledger_state` | `cancelled_before_start`, `started`, `dispatching`, `running`, `unknown`, `done`, `failed`, `cancelled`. Not started is the absence of a row. |
| `cancelled_by`, `stop_requested_by` | Who cancelled before the start, or asked to stop |
| `batch_id` | The batch that started it, or null |
| `completion_dot` | The dot of the one accepted completion |
| `push_status` | Per linked clip: added, or not added with the reason |

`ledger_state` is derived from the existing status columns where they exist: `accepted` is started, `submitting` is dispatching, `submitted` is running, `submission_unknown` is unknown. It is stored for the two states that have no equivalent today, and a test asserts that the stored and the derived value never disagree.

### Start

`generation.start(documentId, requestId, specDigest, approvedEstimate)` runs in one database transaction.

1. Read the request entity from the server's state of that document. When it is absent, refuse with `REQUEST_NOT_RECEIVED` (N3). A duplicate of the document has other document ids, so its copy of the record is never found here (E8).
2. When the entity holds more than one payload, refuse with `SPEC_AMBIGUOUS`. When the digest of its one payload differs from `specDigest`, refuse with `SPEC_MISMATCH` and return the stored specification (N4).
3. The caller must be the requester in that payload, or an agent run whose invoking user is the requester (N1). `effectiveAccess` must give the requester editor on the document now (N2).
4. Compute the server's estimate for the specification. When it is above `approvedEstimate`, refuse with `ESTIMATE_CHANGED` and return the new estimate (N5).
5. When the document owner's storage use is above the allowance, refuse with `STORAGE_EXCEEDED` (N7).
6. Run the existing admission for credits, quota and permission flags.
7. Insert the ledger row with state `started`, using `ON CONFLICT DO NOTHING` on the unique index. When a row already exists: for `cancelled_before_start` refuse with `CANCELLED` and name `cancelled_by`. For any other state return the recorded execution (E1, N6).
8. Grant the completion permit and hand the request to the durable lifecycle.

A refusal in steps 1 to 6 writes nothing, so it charges nothing and leaves the request startable (E3).

### Cancel, and its order against a start

`generation.cancel(documentId, requestId)` uses the same unique index, which is what orders the two commands.

| Ledger row when the cancel runs | Caller | Result |
| --- | --- | --- |
| None | Any editor of the document | Insert `cancelled_before_start` with `ON CONFLICT DO NOTHING`. When the insert wins, the cancel is final. When it loses, a start won the race, and the next rows apply. |
| `started`, not yet dispatching | Requester or owner | State `cancelled`. No provider call. No charge. |
| `dispatching`, `running` or `unknown` | Requester or owner | Record `stop_requested_by` and set `cancel_requested_at`, which the existing lifecycle acts on where the provider supports it. The job can still finish. |
| Any started state | Another editor | Refused with `RUNNING`, naming the requester |
| Final | Anyone | Returns the final state |

The first insert to commit decides, and both commands treat a lost insert as "read the row and follow the table". No version, copy or replay of a document reaches this table (E9). The transition from `started` to `dispatching` and the cancel of a `started` row are both compare-and-swap writes on `ledger_state`, so exactly one of them succeeds.

A cancel made offline is a row in the local table `cloud_pending_commands`, sent on reconnect before any start from that device.

### Provider handoff and recovery class

Every provider adapter that can run a ledger request declares `recoveryClass`: `keyed`, `lookup` or `manual`. An adapter that declares nothing is `manual`.

| Class | Adapter must provide | Recovery of `unknown` |
| --- | --- | --- |
| `keyed` | `submit(request, idempotencyKey)` where the provider honors the key | Submit again with the ledger's key |
| `lookup` | `findByReference(reference)` and `listingDelayMs` | Look up. When nothing is found after the delay, submit once more with the same reference. |
| `manual` | Nothing | Never submit. The requester sees Outcome unknown with Check again and Generate again. |

The existing FAL path is `manual` with a late webhook, and stays so until a test shows that FAL honors a key or lists by reference. This document assigns no other class. I did not check any provider's API for idempotency keys.

The work that DD5 names: `createFalGenerationLifecycleHooks` returns early for every provider that is not FAL. The lifecycle becomes provider-neutral, with FAL's queue and webhook handling behind the adapter interface. Until a provider is on the durable lifecycle, a server restart during its call loses the job without a record, and E1, E10 and FR81 cannot hold for it. A provider that is not on it cannot be offered for ledger requests. Which provider voices script lines was not checked, and phase 5a ships takes, so this is the first thing to establish (PG1).

### Batch start

`generation.startBatch(batchId, items, budget)` with `items` as an ordered list of request id, specification digest and approved estimate. A table `generation_batches` holds the batch id, the caller, the digest of items and budget, the transfer it waits for, the budget and the reserved total. A table `generation_batch_items` holds one row per batch and request id, unique on that pair, for every item the batch started or found started.

1. An existing batch id with another digest is rejected with `BATCH_CONTENT_MISMATCH`.
2. When the batch names a transfer, nothing starts until that transfer is committed.
3. Take the items in list order. For each item run one database transaction that first locks the batch row for update.
4. Inside it, when an item row exists, return its recorded execution.
5. Otherwise, when a ledger row for the request exists already, started by a single start or by another batch, insert the item row as `already_started` with that execution. It reserves nothing from this batch. The ledger row's `batch_id` is not changed. Only the insert that starts an execution writes a `batch_id`.
6. Otherwise, when the reserved total plus the item's approved estimate is above the budget, return `not_started: budget` and write nothing. Otherwise run the start procedure inside this transaction. On acceptance add the estimate to the reserved total, stamp the new ledger row with the batch id and insert the item row as started. On refusal return the reason and write nothing.
7. The provider handoff runs after the transaction commits. The batch lock is never held across a provider call.
8. Return every item with its execution or its reason.

Revision 1 read the running total, compared it and added to it with no lock. Two simultaneous calls could each see room for a different item and together exceed the budget (review point 9). A unique request id prevents a second execution of one request. It does not protect a sum. The row lock makes each admission one step with its reservation. Two calls that run at once each take the first item that has no row, in list order, so the items start in list order, and the fifth item of AC69 is refused in both calls.

Repeating the call returns the recorded executions and evaluates only the items that were not started, against what is left of the budget (AC69). The budget bounds a sum of approved estimates. It does not bound charges (D18).

### Completion permit

The generation service runs in the server process, so the permit is not a network credential. The acceptance function takes an internal capability beside the transaction. A client cannot name a capability, and a client transaction that uses a server actor id is refused.

| Capability | Actor | What it may write |
| --- | --- | --- |
| `completion` | `server:completion`, one per document | One of the two completion shapes, for a request whose ledger row has `attach_state` `pending` and a null `completion_dot`, under the line or shot the request names |
| `migration` | `server:migration`, one per document | The one conversion transaction, while the document's conversion state is `converting` |
| `maintenance` | None | Nothing in this design. A later need gets a capability of its own and does not widen another. |

Revision 1 had one server actor and refused everything from it except a completion. That also refused the conversion, which used the same actor (review point 8).

A completion is authorized by the ledger row and not by `effectiveAccess` of the requester, so it is accepted after the requester lost access (A10, A15).

**Terminal state, output and attachment.** Three facts have to survive a crash together: the job ended, its output is stored, and the document says so. The ledger row gains `terminal_outcome` (succeeded, failed or cancelled), `output_blob`, and `attach_state` (`none`, `pending`, `attached`, `held` or `discarded`).

1. When the provider reports a terminal state, or a cancel wins before dispatch, one database transaction writes `terminal_outcome`, the blob hash of the stored output for a success, and `attach_state` `pending`. The output is a retention root from this moment.
2. The attach step builds the completion transaction from the ledger row alone and submits it with the completion capability. The acceptance function writes the document transaction, sets `completion_dot` and sets `attach_state` to `attached` in one database transaction. The result id is derived from the document and the request (K1), so building the transaction twice names the same entity.
3. A sweeper runs step 2 for every row that has been `pending` for more than 30 seconds, in every server process and at start.
4. For a document in `deleted_documents`, step 2 sets `held`, and a restore sets it back to `pending`. For a purged document it deletes the output and sets `discarded`.

A crash after step 1 leaves a `pending` row, and the sweeper attaches it. Revision 1's permit accepted only rows in a started state, which stranded such a row. When two processes attach one row at once, the check for a null `completion_dot` under the document lock lets one through (TC62).

| Event while the job runs | Handling |
| --- | --- |
| The requester's access is removed | Accepted, by the second rule |
| The line or shot is deleted | The result create is non-reviving. The result is stored and not visible. |
| The document is in `deleted_documents` | The completion is held on the ledger row with its saved output. It is submitted when the document is restored. |
| The document was purged | The saved output is deleted and the row records `discarded`. |
| The owner is over the allowance | Stored. The next start fails N7 (D16). |

### Tests

| Code | Scenario | Expected outcome | AC |
| --- | --- | --- | --- |
| TC70 | Send a start and a cancel for one request from two connections in the same millisecond, 1,000 times | Each run ends in exactly one of two states: `cancelled_before_start` with no provider call, or started with the cancel treated by the table. Never both, never a provider call after a winning cancel. | AC67 (d) |
| TC71 | Send the same start from two server processes at once | One ledger row, one provider submission | AC56 |
| TC72 | Runs (a), (b), (c), (e) and (f) of AC67 | The refusal codes above, and no ledger row in (a) and (b) | AC67 |
| TC73 | For each adapter, stop the process after the scripted provider accepted the job and before the request id is bound. Restart. | State `unknown`. Provider submissions for that key: one for `manual`, one job for `keyed`, at most one more submission for `lookup` and one job found. | AC68 |
| TC74 | For each provider offered for ledger requests, assert that its adapter runs on the durable lifecycle | The test fails for any provider that returns from acceptance without a durable row | PG1 |
| TC75 | The sequence of AC69 | Outcomes of AC69, with the running total equal to the sum of four estimates | AC69 |
| TC76 | Restore a document version from before a cancel, and replay its log into a fresh replica, then start | Refused with `CANCELLED` in both | E9 |
| TC77 | Raise the catalog price between approval and start | `ESTIMATE_CHANGED`, no row | AC67 (a) |

Tests added in revision 2 for completions and batches.

| Code | Scenario | Expected outcome | Covers |
| --- | --- | --- | --- |
| TC66 | As an editor, submit a transaction under the completion actor's id and one under the migration actor's id. With the migration capability, submit a second conversion transaction after the conversion ended. | All three are refused | Review point 8 |
| TC67 | A job that fails, and a job that is cancelled after dispatch | The request's outcome in the document is failed with the reason, or cancelled, on every replica. No result entity exists. | Review point 8 |
| TC78 | Kill the server process after the ledger row has its terminal outcome and before the completion is attached. Start a new process. Run it for a success, a failure and a cancel before dispatch. | The sweeper attaches exactly one completion in each run. Success: one result, and the outcome succeeded with the match. Failure and cancel: the outcome only. `completion_dot` is set and `attach_state` is `attached`. | Review point 8 |
| TC79 | Send the batch start of AC69 from two server processes at the same moment on PostgreSQL, 1,000 times. In a second arrangement one of the five requests was started by a single start before the batch. | Four requests are started in list order, the reserved total equals four estimates, and the fifth is not started for budget in both responses. Second arrangement: that item is `already_started`, reserves nothing and keeps its own `batch_id`, and the batch starts the other four. | AC69, review point 9 |

## Storage recovery and erase

The tables and the erase rule are in the phase 2 section. This section states the orderings that make FR79 safe against concurrent work.

| Case | Rule | Test |
| --- | --- | --- |
| Erase against a pick | Erase runs in a transaction that locks the project row, reads the viewer sets of current revisions and the latest delivery snapshots, and refuses when the hash is in it. A save or a pick that would make the file current takes the same lock. Whichever commits second sees the other. | TC80 |
| A pick arrives after the erase | The pick is accepted, because it is a legal edit. The entry shows File erased. Nothing restores the file. | AC74 |
| Erase against a live revision set | The erase succeeds. `receive.file` answers `ERASED` for that hash. The client treats the set as expired, captures a new one, and skips files it already staged (Y1, Y7). | AC74 |
| Erase against a staged transfer that names the hash | The erased list wins. The commit does not require the file, and the staged blob is not committed. | TC81 |
| Taking a file off the list | Deletes the erased row. The next transfer from a copy that holds the file stages it again as a required file. | AC74 |
| Same hash in two of the owner's projects | Erase removes the row of one project. The object is deleted only when no committed row of any project names the hash. | TC82 |
| Purge against restore | The purge job and restore both take the row of `deleted_documents` with a lock. A restore that commits first makes the purge skip the row. | TC28 |

| Code | Scenario | Expected outcome |
| --- | --- | --- |
| TC80 | Erase a take's file and pick that take, from two connections at once, 1,000 times | Each run ends in one of two states: the erase was refused and the take plays, or the erase succeeded and the line shows File erased. Never a current take that plays a file the server no longer holds without the label. |
| TC81 | Stage a transfer that requires a file, erase that file's hash in the project, then commit | The attempt commits without the file. The entry shows File erased. Storage use does not include it. |
| TC82 | Two projects of one owner refer to one hash. Erase it in the first. | The second still serves the file. Storage use drops by nothing, because the hash is still held once. |

TC82 shows a consequence the PRD does not state: erasing a file that another project of the same owner also holds frees no storage. The storage view has to say which projects hold a file. It is listed as PG6.

## Security and privacy requirements mapped to mechanisms

Every SR of the PRD has a mechanism and a test here or in a phase section. Requirements that are statements about wording (SR19, SR26, SR27) are checked by a review of the dialog text and are not listed.

| SR | Mechanism | Test |
| --- | --- | --- |
| SR1, SR2 | System browser with PKCE. The refresh token exists only in the keychain item, or in memory when no store exists. A test scans the app's preferences, logs and the local database for the token value after sign-in. | TC1, TC90 |
| SR3 | The refresh token is sent only to `/oauth/token` of its own server origin over https. The bundled local server receives an access token and never a refresh token. | TC2, TC90 |
| SR4, SR31 | Device sessions are grants. The handle endpoint ends one grant and nothing accepts the handle as a credential. | TC3, TC7 |
| SR5 | The transfer manifest is built from document rows, asset rows and workspace files. The secrets table is not in its table list, and a test asserts the list. | TC30 |
| SR6 | `findSecretLike` runs before publish and share. Best-effort, and the dialog says so. | Unit tests on patterns |
| SR7, SR10 | The review sheet is built from the manifest, which separates required files, optional files and conversations, and from `transfer.open`, which returns allowance and use | AC30 |
| SR8, SR16, SR21, SR22 | `effectiveAccess` plus the reference sets, read by role, and the attach rule. Viewers read the materialized row, in viewer mode for scripts and storyboards. Link notices are computed on the client from documents it could load. | TC11, TC44, TC65 |
| SR9 | Unchanged public workflow route | Existing tests |
| SR11 | Tombstone at once, `deleted_documents` for 30 days, purge job | TC28 |
| SR12, SR13 | Server setting for the `native` scope, existing permission flags, and the managed policy file | TC91 |
| SR14, SR17 | Acceptance function steps 1 and 2. Commit steps 4 and 5, under the access epoch rows. | TC13, TC43, AC32 |
| SR15 | Required `server_key` and `account_id` on every local query | TC10 |
| SR18, SR23, SR34 | Only `generation.start` inserts a started ledger row, and a test asserts that no other code path can reach provider submission for a ledger request | TC15, TC76, TC92 |
| SR20 | Staged blob rows are readable only by their transfer | TC25 |
| SR24 | Agent writes run as the invoking user through `effectiveAccess`. Job writes pass the shape rule of the completion permit. | TC61, AC61 |
| SR25 | The manifest encoder takes a fixed field list per kind and has no free-form field. A test feeds it a specification with a signed address and a key and asserts the refusal. | TC93 |
| SR28 | Delivery files are streamed through the server against the latest snapshot | TC50 |
| SR29 | Revision set entries are created per reader, and each call authorizes again | TC94 |
| SR30 | Digest rows and the per-document lock | TC40, TC42 |
| SR32, SR33 | Filtered lists, owner-only erase | TC29 |

| Code | Scenario | Expected outcome |
| --- | --- | --- |
| TC90 | After sign-in and one transfer, search the preferences, `accounts.json`, every log file, the local database and the bundled server's environment for the refresh token, the access token and the handle | Not found outside the keychain |
| TC91 | Turn the `native` scope off on the server. Separately, set a policy that allows one server and try another. | Sign-in is refused with the reason in both cases. Local work is unaffected. |
| TC92 | Open, receive, synchronize, duplicate, restore and replay a document with unstarted requests, with a scripted provider that records every call | Zero provider calls and zero ledger rows |
| TC93 | Build a manifest from inputs that contain a signed address, a bearer token and a provider request id | The encoder refuses the unknown fields. The stored manifest holds none of them. |
| TC94 | Capture a revision set as a reader, remove the reader's grant, then request each entry | Every request is refused. Nothing was applied locally. |

## Failure cases and how each test is run

The phase sections hold the test rows. This section lists the failure cases this design had to close that the PRD's criteria do not name, and the harness each kind of test needs.

### Failure cases closed by a design rule

| Code | Failure | Without the rule | Rule | Test |
| --- | --- | --- | --- | --- |
| FC1 | Both native apps refresh one rotating token at the same time | Reuse detection revokes the session for both | Refresh under a lock file, with the tokens and the expiry in one shared record | TC4 |
| FC2 | Crash between the server's token rotation and the keychain write | The next refresh presents a rotated token and the session is revoked | The previous token is accepted once within 60 seconds while its successor is unused | TC5 |
| FC3 | Consent and token exchange reach different server processes | The code is unknown to the second process | Pending requests and codes in the database | TC6 |
| FC4 | Crash between deleting the credential and storing the revocation handle | A session that nothing on the machine can end | The handle is stored first | TC7 |
| FC5 | A viewer's client ignores the read-only state and saves an older schema | A reduced document replaces a newer one | The server refuses a schema downgrade | TC14 |
| FC6 | Two attempts of one transfer are both valid and arrive together | Two commits | The transfer row lock, and the committed check inside it | TC21 |
| FC7 | A client declares a hash that its bytes do not have | A file under a wrong identity, served to everyone who needs that hash | The server hashes what it receives | TC23 |
| FC8 | Another account names a hash to learn whether the server holds the file | Existence of private content is revealed | The already-present shortcut is scoped to the owner | TC24 |
| FC9 | An actor lease expires during a partition and two copies write | Two different transactions under one dot | The lease is a courtesy. The digest check decides. | TC42 |
| FC10 | A transaction inside a transfer commit is refused | A commit with a hole: some documents of one capture update and one does not | The whole attempt is refused, and the client recovers locally and sends a new attempt | TC45 |
| FC11 | A start and a cancel race | Both take effect | One unique index orders them | TC70 |
| FC12 | A provider outside the durable lifecycle is restarted mid-call | A paid job with no record, and a second job on retry | Only providers on the durable lifecycle run ledger requests | TC74 |
| FC13 | An erase and a pick of the same result race | A current result without a file and without the label | Both take the project row lock | TC80 |
| FC14 | A client sends its own `match` value | A result becomes current without the server's comparison | Only the server actor writes an outcome | TC61 |

Failure cases from the review of 2026-11-16. Each was a gap between a guarantee and the mechanism that revision 1 gave for it.

| Code | Failure | Rule | Test |
| --- | --- | --- | --- |
| FC15 | The second app adopts a rotated refresh token and is left with an expired access token | Access token and expiry are in the shared session record | TC4 |
| FC16 | A refresh that was in flight finishes after a sign-out and stores credentials again | The generation is read again before the write, and a changed generation discards the response | TC16 |
| FC17 | Two apps on one device session replace each other's saves and no version is kept | Editing instance id per open document | TC8 |
| FC18 | A viewer reads a discarded render through the editor form's references, or an editor cannot read a file that only an alternative refers to | Four reference sets, read by role | TC68 |
| FC19 | A client writes a foreign asset id into its own document to gain the file | Attach rule | TC19 |
| FC20 | A Keep local decision made on revision B replaces revision C | A decision names the revision and hash it was made on | TC32 |
| FC21 | A document leaves the project while a transfer is staged, and the commit writes it | Membership, lifecycle and access are checked per operation at commit | TC35 |
| FC22 | A revocation commits between an access check and the write it authorized | Access epoch rows | TC34 |
| FC23 | The server stops between a terminal ledger state and the document write | `attach_state` and the sweeper | TC78 |
| FC24 | Two simultaneous batch starts exceed the budget | Batch row lock around each admission | TC79 |
| FC25 | A second consecutive undo does nothing | Undo chain with link cells, timeline design revision 4 | TC49 |
| FC26 | Undoing a pick shows no result or an older adoption | `restores` on the restored selection | TC69 |
| FC27 | A reissue under a new actor leaves `selectionSeen` naming old dots | Typed recovery visitor | TC48 |
| FC28 | The desktop app runs its own lock or session logic and refreshes while a native app holds `account.lock` | The desktop app runs the native library in the account helper | TC109, TC112 |
| FC29 | A redirect or a forged URL makes Electron's main process send a token to another host | The forwarder sends only HTTPS to the session's origin and never follows a redirect | TC110 |
| FC30 | A native app signs out, and the desktop app sends a cloud request before its 1-second poll notices | The helper applies the generation check before each attach | TC119 |
| FC31 | Page code in the renderer asks `cloud.request` for a route that creates a credential, or for another host | The main process accepts only listed paths on the signed-in origin, and the server refuses credential-creating routes for access tokens | TC117 |
| FC32 | A transfer call sends the access token to a process that is not the desktop app's local server | The forwarder sends a `transfer` message only to the loopback origin of the local server the main process started, with its local client token | TC122 |

### Harnesses

| Kind of test | Harness | Exists |
| --- | --- | --- |
| Server contracts: access, transfer, ledger | Vitest against SQLite and PGlite through the dual-dialect fixtures of `packages/models` | The fixtures exist |
| Races inside one process | A test helper that holds two transactions at a named point and releases them in a chosen order, plus repeated unordered runs | New |
| Races between server processes: TC20, TC21, TC34, TC62, TC70, TC71, TC79 | Two server processes on one real PostgreSQL instance. PGlite runs inside one process and cannot show a lock wait between two. | New. Whether CI has a PostgreSQL service was not checked. |
| Crash points | A pause hook at each named step. The process reports that it reached the step and blocks. The harness ends it with a process kill and starts a new process on the same database and files. A thrown exception is not used: it runs rollback and cleanup code that a dead process never runs. | New |
| Durability of local writes | For the local apply and for drafts, a run on Linux behind a file system fault layer that drops writes which were not flushed before the kill, and that can stop between a write and its rename | New. Linux only. A process kill alone does not lose page cache, so it cannot show a missing flush. |
| Provider handoff | `ScriptedProvider` with a hook that accepts the job and then fails the response | `ScriptedProvider` exists. The hook is new. |
| Native apps | Qt tests against a real server process, with a fake browser that completes the loopback redirect and a recording proxy that logs every request | New |
| Three server kinds | The same suite against the hosted cloud, a Supabase-mode server and an SSO-mode server with a test identity provider | New for SSO and Supabase |

A test that proves a rule must fail when the rule is removed. Each race and crash test is first run against a build with its rule disabled, and that failing run is recorded in the pull request, as the repository's standards require for new checks.

## Implementation plan

The phases are those of the PRD. Phase 1 is approved for planning and is broken down to work packages with their tests. Later phases list work packages and gates. Sizes are relative: S is one pull request, M is a few, L is a series behind a feature flag. I give no dates, because no package has been estimated by the people who would build it.

Every package follows the repository's rules: schema changes in both dialects with a versioned migration, tRPC and Fastify schemas for every new endpoint, tests in the package's test directory, and the four post-change checks.

### Order of work after the review of 2026-11-16

The review set this order. It replaces nothing in the phase tables below. It says which specification work has to be done before each phase's packages start. Each step ends when its tests exist and fail against a build with the rule disabled.

| Code | Step | Packages | Tests that close it | What it unblocks |
| --- | --- | --- | --- | --- |
| A1 | Account coordination and file access by role | WP0.2 as extended, WP1.5, WP1.6 and WP1.8 as revised | TC4, TC8, TC16 to TC19 | The rest of phase 1 |
| A2 | The transfer operation schema, decisions bound to a revision, authorization per operation, access epochs | WP2.0 (new): the operation table as schemas, with TC32 to TC38 written first. Then WP2.4. | TC32 to TC38 | Phase 2 implementation |
| A3 | Undo chain, selection with `restores`, the recovery visitor, then suite version 2 on both prototypes | CRDT phase 0 against revision 4 of the timeline design and revision 3 of the storyboard and script design | Suite version 2, TC48, TC49, TC69 | The phase 3 gate and the phase 5 gate |
| A4 | Terminal transitions of a generation and atomic batch admission | WP5.1 and WP5.3 as revised | TC66, TC67, TC78, TC79 | Phase 5 |
| A5 | Provider lifecycle, independent of the other steps | WP5.0 | TC73, TC74 | Offering a provider for ledger requests |

Transfers and the CRDT integration stay behind their gates. A1 is the only step in front of phase 1.

### Before phase 1

| Code | Work | Output | Blocks |
| --- | --- | --- | --- |
| WP0.1 | Decide D1 and D2 | Two decisions | Phase 1 |
| WP0.2 | Spike: one keychain item read by two separately built apps on macOS, Windows and Linux, behavior without a Secret Service, and the generation file read by both apps through a shared mapping or a file read, with the lock file's behavior when its holder is killed | A choice between QtKeychain and platform calls, and the signing requirement on macOS | WP1.8 |
| WP0.3 | Read the `/oauth/token` handler and the consent page. Confirm how reuse of a rotated refresh token is handled today and how many server processes production runs. | Confirmed or corrected contracts for TC5 and TC6 | WP1.1 |
| WP0.4 | Establish how each native app reaches the local database, and whether the two apps share a bundled server process | The owner of the `cloud_*` tables and of the transfer client. RF27 answers part of it: the graph runner opens the model database itself. | WP1.10 |

### Phase 1: sign-in and cloud documents

| Code | Work package | Size | Depends on | Tests |
| --- | --- | --- | --- | --- |
| WP1.1 | Authorization server: `native` scope, seeded client, `ntd_` tokens, device session columns, revocation handle and `/oauth/session/end`, pending store in the database, the 60-second rule for a lost rotation | M | WP0.3 | TC2, TC3, TC5, TC6 |
| WP1.2 | Authentication chain: accept `ntd_`, exclude credential-creating routes, 30-second validation cache, `session_revoked` and `grant_removed` events that close connections, periodic re-validation of WebSockets | M | WP1.1 | TC13 |
| WP1.3 | Web app: consent page for the `native` scope with app and device name, device sessions in Settings, the server setting that turns native sign-in off | S | WP1.1 | TC91 |
| WP1.4 | Access module: link options, `disabled_at`, `share_id`, invitation options, `effectiveAccess`, the unique link index, the migration with the owner notice, gating of history, duplicate and download | L | None | TC11, TC12 |
| WP1.5 | `refsOf` for workflows and timelines, the four reference sets written at save, the read rule and the attach rule | M | WP1.4 | TC11 |
| WP1.6 | `last_writer_instance`, the editing instance id on every save, and the version written before a save from another editing instance | S | None | TC8 |
| WP1.7 | `sync.capabilities`, the protocol header, `SCHEMA_DOWNGRADE` and `CLIENT_TOO_OLD` | S | None | TC14 |
| WP1.8 | `native/account`: keychain wrapper, `accounts.json`, the shared session record and the generation file, the refresh and sign-out algorithms under the lock, the repair rule, the sign-in flow with the loopback listener, the sign-out state machine | L | WP0.2, WP1.1 | TC1, TC4, TC7, TC90 |
| WP1.9 | Managed policy file per platform | S | WP1.8 | TC91 |
| WP1.10 | Local `cloud_drafts` and `cloud_open_state`, the saved-state rule in both apps, one request layer that attaches the credential in place of the scattered header writes (RF13) | L | WP0.4, WP1.8 | TC9, TC10 |
| WP1.11 | Native surfaces: Account control, Cloud and Shared with me, the two statuses, the share dialog with its statements, linked documents and the secret warning | L | WP1.4, WP1.10 | TC15, AC62 |
| WP1.13 | Electron desktop app (D23): `native/account-helper` and its JSON-lines protocol, the main-process client in `electron/src/cloudAccount.ts` with the request forwarder and the browser check, the account section in Settings, `desktop` on the authorization server, the consent page and device sessions, packaging in the desktop release, and a CI workflow on macOS, Windows and Linux | M | WP1.8, WP1.9 | TC109 to TC115, AC75 |
| WP1.12 | Test rig for the hosted cloud, a Supabase-mode server and an SSO-mode server, on macOS, Windows and Linux. Two-week beta with the sign-in metrics. | M | All | AC34 |

WP1.4 to WP1.7 touch only the server and the web app and do not depend on the sign-in work, so they can start at once. WP1.4 changes what existing view links expose and should ship first, on its own, with its notice.

Exit: the PRD's phase 1 exit criteria, and TC1 to TC15 passing on the three server kinds. TC109 to TC115 pass on macOS, Windows and Linux.

Work packages added in revision 5 for the desktop app (D24). They start after WP1.10 and WP1.11 and do not hold the exit above.

| Code | Work package | Size | Depends on | Tests |
| --- | --- | --- | --- | --- |
| WP1.14 | Helper protocol version 2 (`request`, `transfer`, `socketToken`), `electron/src/cloudRequests.ts` with the path list and the abort on sign-out, the IPC calls in the preload, the `nodetool-cloud:` scheme, the WebSocket relay of D25 | M | WP1.13, WP1.2 | TC116 to TC119, TC121 |
| WP1.15 | Web app in the desktop app: the cloud tRPC client and document origins, the Cloud and Shared with me groups, the cloud window (D27) with the two statuses, the TypeScript saver over `cloudLocal.drafts`, the share dialog over the cloud client, sign-out with the dialog of FR30 | L | WP1.14, WP1.10 | TC120, TC124, TC125, AC76, AC77 |

Exit for the desktop app in phase 1: TC116 to TC121, TC124 and TC125 pass on macOS, Windows and Linux, and AC76 and AC77 pass against the three server kinds.

### Phase 2: linked projects

Gate: decisions D4, D5, D20 and D22.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP2.1 | Reuse of `content_hash` with the hash check at capture (the column and its job exist, RF7), `project_blobs`, hashed upload, scoped presence check, cleanup job | M | None |
| WP2.2 | `deleted_documents`, restore, purge job, and project deletion that keeps content for 30 days | M | None |
| WP2.3 | Storage accounting, the allowance value, the storage view data | M | WP2.1 |
| WP2.4 | `packages/cloud-sync` server half for sending: open, stage, commit attempts with the operation table and decisions bound to a revision, access epoch rows, status, cancel | L | WP2.1 |
| WP2.5 | Revision sets and the receive endpoints | M | WP2.1 |
| WP2.6 | Pause hooks with a process kill, the race helper, and the two-process rig on PostgreSQL | S | None |
| WP2.7 | Transfer client: local link tables, capture, staging, apply with `cloud_receives`, workspace file renames, resume | L | WP2.4, WP2.5, WP2.6 |
| WP2.8 | Native surfaces: review sheet, badge, deletion review, the three copy actions, the project lock file | L | WP2.7 |
| WP2.9 | Erase, the erased list, the filtered Incomplete and erased lists | M | WP2.3, WP2.4 |
| WP2.10 | Reference set functions for sketches, apps, JS scripts, scripts and storyboards as whole documents | M | WP1.5 |

Work packages added in revision 3.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP2.11 | Capture from the project folder: the comparison before capture, CF1 to CF6, the Collect step of D22 | M | WP2.1 |
| WP2.12 | Placement under the folder lock, document files through the document file sync, `placement_pending` and the server sweeper | M | WP2.5, WP2.7 |
| WP2.13 | The lock file `.nodetool/open.lock` with the stale rules, and read-only opening in both native apps | S | WP0.4 |

WP2.1, WP2.2 and WP2.6 can start during phase 1. Exit: the PRD's phase 2 exit criteria, TC20 to TC31, TC95 to TC105, TC108, and the kill tests at every named step.

Work package added in revision 5.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP2.14 | The desktop app's Publish to Cloud and Synchronize: the application menu entries, the React review sheet with `readLink`, transfer calls through the helper | M | WP2.8, WP1.14 |

Exit for the desktop app in phase 2: TC122, TC123 and AC78 pass.

### Phase 3: CRDT timelines

Gate: CRDT phase 0 passed on the timeline fixtures of suite version 2 and on the budgets, with revision 4 of the timeline design as the specification, shadow-mode results of CRDT phase 1, conformance between TypeScript and C++ in CRDT phase 2, and decisions D3, D6, D7 and D21.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP3.1 | `packages/crdt-server`: tables, the acceptance function with both digests, refusal classes, snapshots, truncation that keeps digest rows | L | Gate |
| WP3.2 | Materialization into the document row and closure rows inside acceptance | M | WP3.1 |
| WP3.3 | Wire messages, actor leases, the web editor on transactions | L | WP3.1 |
| WP3.4 | Native timeline on the C++ core with local pending transactions and recovery | L | WP3.1 |
| WP3.5 | Whole-document adapter and served bases | M | WP3.1 |
| WP3.6 | Activity table, forward restore, review panel and Unsent edits in both editors | L | WP3.3, WP3.4 |
| WP3.7 | Replicated documents in transfer commit and receive, validated as a whole before anything is written | M | WP3.1, phase 2 |
| WP3.8 | One-time conversion of existing timelines, and the checksum comparison for the beta | M | WP3.2 |

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP3.9 | Timeline file as a projection under D21: write after each transaction, and turn a file edit into transactions against the last written file | M | WP3.4, D21 |

Exit: the PRD's phase 3 exit criteria, TC40 to TC47, TC106 and TC107.

### Phase 4: project sharing and delivery

Gate: phases 1 and 2, decision D13.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP4.1 | Project grant tables, `effectiveAccess` with project scope, the enumeration test over every document procedure and route | L | WP1.4 |
| WP4.2 | Delivery copies, snapshots, the streaming file route, the 30-day deletion of superseded snapshots | M | WP2.1, WP1.5 |
| WP4.3 | Open in app from the share page, and the project scope in both share dialogs | M | WP4.1 |
| WP4.4 | The project scope in the desktop app's share dialog, and Open in NodeTool on the share page with the desktop app's link handler | S | WP4.3, WP1.15 |

Phase 4 does not need phase 3 and can run beside it. Exit: the PRD's phase 4 exit criteria and TC50 to TC53.

### Phase 5: scripts and storyboards

Gate for 5a: phase 3 shipped, the storyboard and script design approved for implementation, fixture suite version 2 and P1 to P8 passing in the prototype, decisions D7, D10, D12 and D14 to D20, and amendments A16, A17 and A19 written into that design. Gate for 5b: 5a, decisions D8 and D9, and A18.

| Code | Work package | Size | Depends on |
| --- | --- | --- | --- |
| WP5.0 | Provider-neutral durable lifecycle with `recoveryClass`, and every provider that will be offered for ledger requests moved onto it | L | None |
| WP5.1 | Ledger columns, `generation.start`, `generation.cancel`, `generation.startBatch`, owner stop | L | WP5.0 |
| WP5.2 | Script profile, version table, conversion, viewer mode | L | Gate |
| WP5.3 | Completion transaction with server-written match, the completion and migration capabilities, both completion shapes, the terminal state with the attach sweeper, held completions for deleted documents | M | WP5.1, WP5.2 |
| WP5.4 | Web script editor, agent tools and directing runs on transactions with pinned frontiers and explicit `adopt` | L | WP5.2 |
| WP5.5 | Request list, result labels, Synchronize and start, pending commands offline | M | WP5.1, WP5.4 |
| WP5.6 | Take manifest checked against the voicing path, with a test that every input the compiler reads changes the hash | M | WP5.2 |
| WP5.7 | 5b: storyboard profile, line assignment, version table, link functions and link panel, native storyboard component | L | 5a |
| WP5.8 | 5b: push to timelines with authorization and retry, removal of the completion-time selection write, `validateScriptLink` callers, keyframe and clip manifests | L | WP5.7 |

WP5.0 depends on nothing in this plan. It closes a gap that exists today for every provider but FAL, and it is the longest unknown in phase 5, so it should start early as its own track.

If the phase 3 gate fails or slips, phases 1, 2 and 4 ship as planned, WP5.0 still has value by itself, and phase 5 does not start.

## Open decisions, risks and claims not verified

### Where the PRD and the repository or this design disagree

Each item needs your decision or a correction to the PRD. Until then this design uses the stated default.

| Code | Finding | Consequence | Default used here |
| --- | --- | --- | --- |
| PG1 | The durable generation record is FAL-only in code (RF3). The PRD's F11 and its ledger mapping read as if it covered every media generation. | E1, E10, FR72 and FR81 cannot hold for a provider outside the durable lifecycle. Phase 5a ships takes, and I did not check which provider voices a line. | WP5.0 generalizes the lifecycle first, and only providers on it run ledger requests (TC74) |
| PG2 | Deleting a project deletes its content at once and keeps a tombstone (RF8). D4 assumes a 30-day restore. | Restore needs content to be kept. Today's behavior was merged on 2026-11-15 and would change. | Documents move to `deleted_documents` for 30 days |
| PG3 | Both native apps share one rotating refresh token, and reuse of a rotated token revokes the grant (RF1). The PRD requires one sign-in for both apps and does not address this. | Without a rule, the apps sign each other out. | One shared session record under a lock, with the access token in it, and the 60-second rule (FC1, FC2, FC15, FC16). The alternative is one device session per app, shown as two rows in Settings, with sign-out ending both. |
| PG4 | X6 says a replicated document never causes a commit to be refused. A single transaction can still be refused as invalid or diverged. | The commit must either fail or proceed without it. | Withdrawn in revision 2. The whole attempt is refused and the client recovers locally. X6 needs one sentence in the PRD that says so. |
| PG5 | A19 sends a removed suggestion to the activity record. The state cannot tell a generated alternative from an undo's fallback. | The server cannot know which removed sibling to record. | A sibling records `origin: generated`, an addition to extension E6 |
| PG6 | An erase frees storage only when no other project of the owner holds the same file. | FR79's "storage use drops at once" does not hold in that case. | The storage view names every project that holds a file |
| PG7 | The PRD treats media files as content-addressed. Assets have ids and no content hash (RF7). | Publication has to hash every required file once, and local asset rows gain a hash. | `content_hash` on assets. Revised in revision 3: the column exists and a background job fills it in (RF7). Capture reuses it and computes a missing one itself (CF4). |
| PG8 | Phase 1 keeps a replaced cloud version "in history, or as a copy where the kind has no history". Phase 1 opens only workflows and timelines as cloud documents, and both have a version table. | The copy rule is not needed until scripts and storyboards open as cloud documents. | Version table in phase 1. From phase 2, kinds without a version table use recovery copies, as the operation table states. |

Gaps found against `11a6da4a`.

| Code | Finding | Consequence | Default used here |
| --- | --- | --- | --- |
| PG9 | An asset's bytes change in place under the same id (RF18). The PRD treats an asset as immutable content. | Two linked copies can change one asset's bytes in different ways, and the operation table had no row for it. | The "Put asset file" operation. Both versions are kept, the received one as a new asset (V22, TC108). |
| PG10 | Workflows and timelines are files that people edit outside NodeTool (RF20). | Capture from the database alone misses a file edit that the watcher has not compared yet. | Capture runs the comparison first (CF1, TC97) |
| PG11 | A copied folder on another install keeps its ids (RF24). | A publication from the copy would collide with the original's cloud ids. | A publication takes new ids for every id already held outside its lineage (TC96) |
| PG12 | A project can use linked files outside its folder (RF25). | Capture cannot hash or stage a file that the folder does not hold. | D22: Collect first, otherwise cancel (CF6, TC103) |
| PG13 | Copied folders keep the script and storyboard ids that their timeline files name, while the scripts and storyboards stay behind as rows (RF26). | A copy's timeline points at another project's documents. | OQ13: clear the references in a copy, as Duplicate does |

### Risks of this design

| Code | Risk | Mitigation |
| --- | --- | --- |
| TR1 | A keychain item shared by two apps needs a common access group on macOS and may prompt on Linux | WP0.2 before any other native work. Session-only sign-in is the fallback the PRD already allows. |
| TR2 | The access change of WP1.4 touches every share path that exists today | It ships alone, with TC11 and TC12, before the native work depends on it |
| TR3 | The reference function misses a reference kind, and a viewer cannot load a file the document shows | A test per document kind that every asset the renderer requests is in the closure, run on the example documents |
| TR4 | A version row for every alternation of writers grows the version tables in phases 1 and 2 | Measured in the beta. Existing pruning of versions was not checked. |
| TR5 | Streaming delivery files through the application server costs egress and memory | Range requests and backpressure on the route. Measured before phase 4 ships. |
| TR6 | Materializing the document inside every acceptance is too slow for large timelines | Budget B1 of the timeline design covers apply plus materialize. If it fails, the phase 0 gate fails and the design returns to review. Revision 1 offered a debounce as a fallback. That is removed: moving materialization out of acceptance separates document state, viewer output and reference sets, and needs a consistency design of its own. |
| TR7 | Moving non-FAL providers onto the durable lifecycle changes billing and recovery behavior for workflows that run today | WP5.0 ships per provider behind a flag, with the handoff test for each |
| TR8 | The per-document lock serializes acceptance, and a busy document queues | Acceptance is one small transaction. Measured in CRDT phase 1 shadow mode. |

| Code | Risk | Mitigation |
| --- | --- | --- |
| TR9 | A text editor that saves a stale buffer of a timeline file reverts remote changes as new transactions (D21) | The revert is one listed transaction and the version named "Before file edit" restores it (TC107). The project lock does not prevent it, because other apps do not take the lock. |
| TR10 | The helper inside the Electron bundle is a third signed binary that reads the keychain item. On macOS it may prompt when another app created the item (TR1). The WP1.13 workflow is also the first CI build of the macOS and Windows keychain stores. | WP0.2 covers the helper. The WP1.13 workflow compiles the library and runs its tests on all three platforms. |
| TR11 | The saver and the review sheet exist twice, in C++ for the native apps and in TypeScript for the desktop app, and their states drift apart | TC120 and TC123 run the Qt test scenarios against the TypeScript versions with the same fake servers. A scenario added to one suite is added to the other in the same pull request. |
| TR12 | Page code in the renderer can act as the signed-in account through `cloud.request` without reading the token | The path list, the server's refusal of credential-creating routes for access tokens, and the renderer's content security policy. The exposure equals that of page code in the hosted web app. |

### Open questions

| Code | Question | Working answer |
| --- | --- | --- |
| OQ1 | One device session for both apps, or one per app (PG3)? | One, as the PRD says |
| OQ2 | Lifetime of an inactive native session | 90 days |
| OQ3 | Does the hosted cloud run more than one server process without sticky routing? | Assumed yes, so the pending store moves to the database |
| OQ4 | May a first publication keep local ids as cloud ids? | Yes, with a new id on collision |
| OQ5 | Is egress through the application server acceptable for delivery files? | Yes. The alternative leaves a window in which an old address still works. |
| OQ6 | Should FAL be tested for an idempotency key or a lookup by reference, to move it out of the Manual class? | Yes, as part of WP5.0 |

Questions added in revision 2.

| Code | Question | Working answer |
| --- | --- | --- |
| OQ7 | After a pick is undone, does an adoption that the pick had ended apply again? | Decided by Matthias on 2026-11-16: yes. Undo returns the current result to what it was before the pick. |
| OQ8 | May the access token be stored in the keychain record beside the refresh token? | Yes. The alternative is one refresh per app in turn, with two token calls in TC4. |
| OQ9 | Two copies of one actor allocated identical order keys. Keep the keys with a tie rule, or regenerate them? | Keep them. Equal keys sort by entity id. |
| OQ10 | Should a document rejected inside a transfer for removed access block the whole attempt, or only leave the capture? | It refuses the attempt once. The client then captures without it. |

Questions added in revision 3.

| Code | Question | Working answer |
| --- | --- | --- |
| OQ11 | Should capture rehash every file, rather than trust a stored `content_hash` whose size and modification time still match? | No. A full rehash of a large project is slow. The CF4 limit stands, and a rehash runs on HASH\_MISMATCH. |
| OQ12 | Opening a folder whose ids match a cloud project of the same account: offer to link it? | Not in phase 2. It opens unlinked, and linking it is a later feature. |
| OQ13 | Should a copied folder's timelines drop their script and storyboard references (PG13)? | Yes, as Duplicate does. The design of the storyboard and script CRDT asks the same as Q10. |

### Not verified

- No server test in this document has been run. The undo chain and the current-result function were run as a model of one register, 28 checks in `crdt_traces.py`. That model is not the prototype of CRDT phase 0 and has no server, no second register and no recovery.
- The rules added in revision 2 for account coordination, reference sets, transfer operations, access epochs, completions and batches were checked by reading and not by execution.
- I did not read the `/oauth/token` handler, the consent page, the FAL webhook path, the timeline attachment adapter, the project content deletion, or any provider's API contract.
- For revision 3 I read how the native graph runner opens the model database (RF27). I did not establish which native app runs it, whether the two apps share a bundled server process, or how the cloud server writes asset files into object storage.
- File locking, a shared memory mapping and keychain access by two separately signed apps were not tested on any platform. WP0.2 does that.
- The cost of the share locks on access epoch rows under load was not measured.
- The agent run budget and its USD cap are known from `docs/AGENTS.md` only. E5 of the PRD rests on it.
- For revision 2 I read the fixtures S1 to S57, the undo, server role, legacy and rollout sections of the storyboard and script design. I did not read its per-document entity tables in full. For revision 3 I read the header tables of the folder comparison and the document file sync, not every branch of their code. I did not check whether the comparison clears `content_hash` when only the partial hash changes. CF1 to CF6, the lock file and D21 were checked by reading, and TC95 to TC108 have not run.
