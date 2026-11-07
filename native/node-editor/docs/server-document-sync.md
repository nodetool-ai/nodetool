# Server workflow synchronization

[WorkflowSession](../src/server/WorkflowSession.cpp) owns one explicit server
binding. Opening a server workflow or a successful deliberate server save
establishes that binding. A local snapshot with an ID does not establish it.
Hosts must call `detachServerWorkflow()` before loading a local file, including
one with the same ID as the current server workflow.

[WorkflowAutosave](../src/server/WorkflowAutosave.h) debounces edits for 750 ms.
Autosave only starts for a dirty, bound workflow with a known revision. It uses
the existing `POST /trpc/workflows.autosave` mutation with graph,
`expected_updated_at`, `save_type: autosave`, `force: false` and the web client's
version-retention inputs. The server owns the effective retention policy.
This creates server versions. It does not create server documents from local
files. The web workflow hook currently runs periodically rather than using this
native debounce.

Only one manual save or autosave may run at a time. Edits during a request remain
dirty and schedule a follow-up using the acknowledged revision. Rate-limited
responses retain dirty state and retry after the server's 30-second window.
Failures retain the local snapshot. They expose an error and permit explicit
retry. Missing acknowledgement revisions stop further automatic writes.
Graph-only autosave cannot acknowledge changes to other workflow metadata.
Those changes remain dirty for a deliberate full save.

The server's autosave schema strips unknown root graph and lineage-link fields.
Native autosave refuses such graphs before sending them. This preserves local
work rather than claiming those fields were saved. Node and edge extra fields
use the server's passthrough schema. This guard is a compatibility limitation,
not complete arbitrary-JSON persistence parity.

## Live changes and conflicts

The authenticated existing `/ws` connection automatically receives MsgPack
`resource_change` messages. No subscription command or polling loop is added.
The native session handles `resource_type: workflow`, checks resource ID and
revision, and fetches the authoritative workflow over REST. Message metadata is
never treated as a complete workflow. Notices for other workflows and known
revision echoes are ignored. Reconnecting also refreshes the bound workflow to
recover notices missed while disconnected.

A clean workflow adopts the fetched snapshot through `workflowOpened`. A dirty
workflow merges the remote edits when every notice since the last comparison
carried `ops`, as described in [Operation-level merge](#operation-level-merge).
Otherwise a dirty workflow pauses writes and offers `conflictWorkflow` beside
the unchanged local `workflow`. The host can present a comparison and the
following actions:

- `reloadRemoteWorkflow()` deliberately adopts the fetched remote snapshot.
- `keepLocalWorkflow()` deliberately saves the local snapshot against the
  compared remote revision. A newer concurrent write still rejects that save.
- Leaving the conflict unresolved keeps local work and blocks writes.

Deletion blocks writes and leaves the remote comparison empty. A missing or
unreadable remote never becomes an unconditional create. Explicitly save a local
file or deliberately create a separate server workflow to recover deleted work.
Credential, document, and fetch epochs discard stale completions. Explicit
reload may reset the host's graph undo history. Saving and failed requests do
not issue a graph-replacement signal.

## Operation-level merge

The server attaches `ops` to a `resource_change` when a headless `ui_*` tool or
another agent capability made the write. The web merges such a write into a
dirty draft in `mergeExternalGraph` in
[WorkflowManagerStore.ts](../../../web/src/stores/WorkflowManagerStore.ts). A
notice without ops, such as another client's autosave, replaces the whole
document there. The web never merges after a failed autosave on its own.

[WorkflowMerge](../src/document/WorkflowMerge.cpp) ports the web rules from
[documentMerge.ts](../../../web/src/stores/documentMerge.ts) and
[workflowMerge.ts](../../../web/src/stores/workflowMerge.ts):

- Nodes and edges merge by ID. Remote-only units are inserted at their remote
  index, and the rest keep the local order.
- A node merges three slots separately: `ui_properties.position`, a data group
  and its remaining fields. The data group holds what the web keeps in ReactFlow
  node data: `data`, the dynamic slot fields and the display fields of
  `ui_properties`, such as `title`, `color`, `collapsed` and `bypassed`. An edge
  merges as one value.
- A slot only one side changed takes that side. Where both changed it the local
  draft wins. The remote value is listed as a conflict only when an op touched
  that unit. Ops without a known `ui_*` tool, such as `update_graph`, count every
  contested unit.
- A remote delete of a unit the draft changed, and a remote change to a unit the
  draft deleted, keep the local result and list a conflict.
- An edge whose endpoint no longer exists is dropped and listed.
- Lineage links follow `mergeGraphLinks`. Other root members merge per key, with
  the local draft winning a contest. Unknown members survive from the side that
  won their slot.

The session merges against the last server copy it holds, then adopts the
remote revision as its base, as the web does. The host applies the merged graph
through one `replaceGraph` command labelled "Merge server changes", so Undo
returns to the local draft. The web applies the merge without an undo entry.
A merged graph the document refuses, for example
one with a missing parent, falls back to the whole-workflow comparison. An
autosave rejected as stale after an ops notice arrived waits for that merge
instead of raising a conflict. A manual save rejected as stale still raises the
whole-workflow conflict, and so does any comparison that runs without a notice,
such as the one after reconnecting, when it finds a newer revision.

When the merge lists conflicts, writes pause and the existing comparison opens.
The local document already holds the merged result, with the local value in
each contested unit. **Keep local version** saves it against the remote
revision. **Reload server version** replaces it with the remote snapshot. The
dialog lists each conflict in the web's banner wording. Unlike the web, there is
no per-unit accept action.

## Editor controls

The editor status bar displays server save state separately from local-file
state. Its server button and **More → Server sync** open a nonmodal comparison
dialog. A new conflict opens it automatically. Choosing **Later** closes the
dialog while the attention indicator and write pause remain in place. Reopen
it from the status button to resolve the conflict.

The dialog exposes the bound-only autosave toggle, save errors and retry,
read-only local/server comparisons, and explicit **Reload server version** or
**Keep local version** actions. Each JSON preview is limited to 64 KiB and can
be scrolled. Narrow windows stack the comparisons. These previews do not
replace the session's authoritative snapshots or execution values.

**Save local copy as…** writes a captured snapshot atomically through the local
file chooser. It preserves the active server binding, dirty state, undo index,
conflict and current local-file path. A deleted remote disables reload and
keep-local actions while leaving this recovery action available. Credentials
changes, opening another workflow and loading a local file close the dialog.
Operation-level merges that list conflicts use the same dialog, as described
above.

## Verification

[WorkflowAutosaveTests](../tests/server/WorkflowAutosaveTests.cpp) drives actual
HTTP and MsgPack websocket paths. It covers debounce, bound-only eligibility,
concurrent edits, CAS revision advancement, skipped and failed saves, explicit
conflict resolution, live clean reload, dirty conflict, deleted remote, scoped
stale responses, unsupported graph metadata and local-file detachment. It also
covers operation-level merges, listed conflicts, the host applier and a stale
autosave that waits for a merge. [WorkflowMergeTest](../tests/document/WorkflowMergeTest.cpp)
covers the merge rules, unknown members and the single undo step.
[WorkflowSessionTests](../tests/server/WorkflowSessionTests.cpp) retains manual
save, authentication, execution and reconnect coverage.

[ServerSyncHostTest](../tests/ui/ServerSyncHostTest.cpp) exercises automatic CAS
conflict opening, status-button reopening after Later, pointer-driven keep-local
and reload, deleted-workflow recovery through the file chooser, persistent
server attention after saving the copy, credential-switch closure and stale
control isolation. It checks that an operation merge is one undo step and that
a listed conflict appears in the dialog. It also captures the host and dialog in
dark and light schemes. [ServerSyncPanelTest](../tests/server/ServerSyncPanelTest.cpp) covers
read-only editing, comparison scrolling and narrow layout, retry, deletion and
delayed remote responses crossing a document switch.

Run native suites with:

```sh
ctest --test-dir "$HOME/.cache/node-editor-autosave-build" --output-on-failure
```

Set `NODETOOL_PARTIAL_LIVE_URL` to a disposable backend to enable the optional
live cases. The autosave case creates and deletes its own workflow, persists a
real Prompt graph through versioned autosave, and proves clean and dirty
external updates over the server's actual websocket broadcasts. It makes no
provider calls.
