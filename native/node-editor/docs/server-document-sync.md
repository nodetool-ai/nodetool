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
workflow pauses writes and offers `conflictWorkflow` beside the unchanged local
`workflow`. The host can present a comparison and the following actions:

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

The shared web document-sync controller supports operation-level merges for
participating editors. Native workflow synchronization currently offers a
whole-workflow comparison and deliberate resolution. It does not automatically
merge concurrent graph operations.

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
The editor still resolves whole workflows. Operation-level graph merging is
not implemented.

## Verification

[WorkflowAutosaveTests](../tests/server/WorkflowAutosaveTests.cpp) drives actual
HTTP and MsgPack websocket paths. It covers debounce, bound-only eligibility,
concurrent edits, CAS revision advancement, skipped and failed saves, explicit
conflict resolution, live clean reload, dirty conflict, deleted remote, scoped
stale responses, unsupported graph metadata and local-file detachment.
[WorkflowSessionTests](../tests/server/WorkflowSessionTests.cpp) retains manual
save, authentication, execution and reconnect coverage.

[ServerSyncHostTest](../tests/ui/ServerSyncHostTest.cpp) exercises automatic CAS
conflict opening, status-button reopening after Later, pointer-driven keep-local
and reload, deleted-workflow recovery through the file chooser, persistent
server attention after saving the copy, credential-switch closure and stale
control isolation. It also captures the host and dialog in dark and light
schemes. [ServerSyncPanelTest](../tests/server/ServerSyncPanelTest.cpp) covers
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
