# Project folders PRD

Status: implemented. The PRD merged in [#7585](https://github.com/nodetool-ai/nodetool/pull/7585). The tickets merged in PF01 [#7604](https://github.com/nodetool-ai/nodetool/pull/7604), PF02 [#7606](https://github.com/nodetool-ai/nodetool/pull/7606), PF03 [#7607](https://github.com/nodetool-ai/nodetool/pull/7607), PF04 [#7608](https://github.com/nodetool-ai/nodetool/pull/7608), PF05 [#7610](https://github.com/nodetool-ai/nodetool/pull/7610), PF06 [#7614](https://github.com/nodetool-ai/nodetool/pull/7614), PF07 [#7611](https://github.com/nodetool-ai/nodetool/pull/7611), PF08 [#7615](https://github.com/nodetool-ai/nodetool/pull/7615), PF09 [#7616](https://github.com/nodetool-ai/nodetool/pull/7616), PF10 [#7617](https://github.com/nodetool-ai/nodetool/pull/7617), PF11 [#7620](https://github.com/nodetool-ai/nodetool/pull/7620), PF12 [#7621](https://github.com/nodetool-ai/nodetool/pull/7621), PF13 [#7618](https://github.com/nodetool-ai/nodetool/pull/7618), PF14 [#7619](https://github.com/nodetool-ai/nodetool/pull/7619), PF15 [#7613](https://github.com/nodetool-ai/nodetool/pull/7613), PF16 [#7622](https://github.com/nodetool-ai/nodetool/pull/7622), PF17 [#7623](https://github.com/nodetool-ai/nodetool/pull/7623). The user guide is [Project folders](../workspaces.md).

Builds on: [Project scoping PRD](../project-scoping/prd.md). That PRD decides
which resources a project owns. This one decides where a project's files live
and resolves its open points on project files and generated outputs.

## Problem

A creator has three places where work lands, and they do not line up.

- A project groups chats and documents but has no location on disk.
- A workspace is a folder an agent or run works in. Chats and agent runs use
  one per-user default folder, whatever project they belong to.
- Assets live in an internal store under opaque names
  (`<dataDir>/assets/<user>/<assetId>.<ext>`). Generated media lands there, so
  other apps cannot find it by name.

A creator cannot open a project in Finder, edit a file in another app, or
predict where an agent's output went.

## Solution

**A project is a folder. NodeTool keeps an index of that folder and does not
keep a second copy of it.**

The creator sees one concept. The word "workspace" leaves the product. It
stays in code as the interface that reads and writes a project folder, on disk
for a local install and in object storage for the cloud.

```text
My Film/                          the project
  Workflows/
    Storyboard to stills.workflow.json
  Timelines/
    Teaser cut.timeline.json
  Generated/
    fox-in-snow.png               every generated output
  Imported/
    interview.wav                 files dropped into NodeTool
  footage/                        anything the creator or agent adds
  .nodetool/                      NodeTool's own data, hidden
    project.json
    assets.json
    cache/
```

Premiere and Lightroom work the same way for media: a catalog over files on
disk, an offline badge with relink when a file moves, and a collect step for
media that lives elsewhere. Obsidian and VS Code work the same way for the
folder: open any folder and it becomes the working context.

## Agreed decisions

IDs D1 to D7 keep their meaning from the design discussion.

| ID | Decision | Required behavior |
| --- | --- | --- |
| D1 | One project, one folder | Every project has exactly one folder. A new project creates one. "Open folder as project" adopts an existing one. Personal has a folder too. |
| D2 | Asset bytes live in the folder | An asset is a file in the project folder plus an index row. The row keeps a stable ID and a project-relative path. Generated outputs go to `Generated/` under readable names. |
| D3 | The agent works in the folder | Chats, agent runs, workflow runs, and jobs read and write the folder of their project. No per-user fallback folder remains. |
| D4 | Reconcile with the disk | NodeTool scans on open and watches for changes. A moved file is rematched. A missing file shows a badge with Relink. NodeTool never drops a row because a file disappeared. |
| D5 | Linked media | A file outside the folder can be referenced in place. "Collect files" copies linked media into the folder. |
| D6 | Cloud uses the same model | A cloud project folder is a key prefix in object storage with the same layout. Local behavior takes priority where the two conflict in scheduling. |
| D7 | Sidebar | The sidebar shows the selected project as Chats, Documents, and Files. Files is the folder tree. |
| D8 | Workflows and timelines are JSON files | Each workflow and timeline is a readable JSON file in the folder. Chats, storyboards, scripts, sketches, apps, and JS scripts stay in the database for now. |
| D9 | Index on demand | The Files tree shows every file. A file gets an asset row when it is image, video, audio, or 3D media, or when something first uses it. |
| D10 | Copy between projects | Using an asset from another project copies it into the current folder. Personal serves as the library. |
| D11 | `.nodetool/` is reserved | NodeTool owns this directory. Agents and file tools cannot write to it. Deleting `cache/` loses nothing. |
| D12 | Delete respects ownership of the folder | Deleting a project removes NodeTool's records. A folder NodeTool created goes to the OS trash. An adopted folder stays, minus `.nodetool/`. |

## User stories

| ID | Story | Acceptance criteria |
| --- | --- | --- |
| US1 | Create a project | A folder appears at `<projects dir>/<name>` with `.nodetool/project.json`. A name collision gets a numeric suffix. The Files tree shows the folder. |
| US2 | Open a folder as a project | Choosing a folder creates a project over it without moving or copying files. Media files appear in the asset browser. Other files appear only in the Files tree. A folder that is inside, or contains, another project folder is refused with a message naming that project. |
| US3 | Generate media | An image generated in a chat, a workflow run, or an agent step exists once on disk, in `Generated/`, with a name derived from its title. The asset browser, the chat message, and the Files tree show the same file. |
| US4 | Let an agent work on files | An agent started in project A lists, reads, and writes A's folder. After switching to project B mid-run, its writes still land in A. A write to `.nodetool/` is refused. |
| US5 | Edit a file in another app | Saving `Generated/fox-in-snow.png` from an image editor updates its thumbnail in NodeTool within a few seconds. The asset ID and every reference to it stay valid. |
| US6 | Move or rename a file outside NodeTool | The asset keeps its ID and shows its new path. Documents that use it still render it. |
| US7 | Delete a file outside NodeTool | The asset shows "Missing" wherever it appears. Relink accepts a replacement file. Remove deletes the row. Nothing is removed automatically. |
| US8 | Edit a workflow file by hand or with git | Changing `Workflows/x.workflow.json` on disk updates the open editor. An invalid file shows an error on that document and the last valid version stays runnable. Renaming the file renames the workflow. |
| US9 | Link large footage | Importing a file above the size threshold, or choosing "Link" in the import dialog, references it in place. "Collect files" copies every linked file into `Imported/` and repoints the rows. |
| US10 | Use an asset from Personal | Picking a Personal asset in project A copies the file into A's folder and references the copy. Editing the copy leaves the original unchanged. |
| US11 | Lose and recover the folder | With the folder unreachable (drive unplugged, folder moved), the project opens with "Folder not found" and a Locate action. Runs and agent turns refuse to start with that reason. After Locate, assets resolve again without re-import. |
| US12 | Copy a folder to another machine | Opening the copied folder restores the project's workflows, timelines, and assets with working references. Chats and database documents do not travel. The open dialog says so. |
| US13 | Delete a project | A NodeTool-created folder lands in the OS trash. An adopted folder keeps every file except `.nodetool/`. The confirmation dialog states which case applies. |
| US14 | Use a cloud project | The Files tree, `Generated/`, and document files behave as they do locally. "Open folder as project" is absent. Download returns the folder as an archive. |

## Technical design

### Current state

Findings come from source inspection.

- **F1.** `nodetool_workspaces.project_id` links a workspace to a project
  ([schema](../../packages/models/src/schema/workspaces.ts)). The
  [project row](../../packages/models/src/schema/projects.ts) has no folder
  and creating a project creates no workspace.
- **F2.** `resolveWorkflowWorkspace` uses `workflow.workspace_id` when set
  and otherwise the per-user default
  ([workflow-workspace.ts](../../packages/execution/src/service/workflow-workspace.ts)).
  Threads and jobs have no workspace, so every chat turn gets the default.
- **F3.** The [`Workspace` interface](../../packages/runtime-core/src/workspace.ts)
  already covers a local directory and an object-store prefix behind one set
  of methods, with `observeWorkspace` change events.
- **F4.** Asset bytes live at `<user>/<assetId>.<ext>` in asset storage.
  Workflow auto-save and `context.createAsset` create rows whose `project_id`
  is `"default"`. Agent media tools sometimes write a second copy into the
  workspace.
- **F5.** External assets already reference a local file in place through
  `external_path`, with a size and mtime fingerprint, an offline state, and
  relink ([plan](../plans/external-asset-refs.md),
  [lookup](../../packages/asset-services/src/external-asset-lookup.ts)).
  The storage adapter resolves a missed key through the asset row, so readers
  keep using ID-based keys and URLs.
- **F6.** Native games create one workspace per project under
  `<managed>/projects/<sha256(projectId)>`.
- **F7.** Project delete wipes the files of every workspace listed under the
  project. Project export includes them.
- **F8.** Workflows store `graph` in `nodetool_workflows`. Timelines store
  `document` in `timeline_sequences` with a `revision` counter. Both have
  version tables.
- **F9.** The file tree exists:
  [`WorkspaceTree`](../../web/src/components/workspaces/WorkspaceTree.tsx),
  mounted in the left panel with a project ID.

### T1. Project folder

- Add `projects.workspace_id`. It names the one workspace row that is the
  project folder. The workspace row keeps `path`: an absolute directory
  locally, a storage key in the cloud.
- Add `workspaces.origin` with values `created` and `adopted`. D12 reads it.
- `projects.create` creates the folder and the row in one operation. The
  default parent is a `PROJECTS_DIR` setting, `~/NodeTool` unless changed.
- `projects.openFolder({ path })` adopts a folder. It validates the path with
  the existing local-path guard, refuses nesting in either direction, and is
  refused in production.
- `projects.relocate({ path })` backs Locate and "Move project folder".
- Personal's folder is the existing default workspace. No files move.
- Renaming a project does not rename its folder. "Move project folder" does.
- Cloud projects use the managed key shape from F6.

`.nodetool/project.json` identifies the folder:

```json
{ "format": "nodetool.project", "version": 1, "id": "<project id>", "name": "My Film" }
```

Opening a folder that carries this file:

| Case | Result |
| --- | --- |
| The ID is unknown on this install | Restore the project under that ID (US12). |
| The ID is known and its recorded folder is gone | Relocate the project to this folder. |
| The ID is known and its recorded folder still exists | Treat this folder as a copy. Mint a new project ID and new document and asset IDs, and rewrite the references in the copied files. |

### T2. Workspace resolution

Replace `resolveWorkflowWorkspace(workflowId, userId)` with
`resolveProjectWorkspace(projectId, userId)`.

| Caller | Project comes from |
| --- | --- |
| Chat turn, agent run | `thread.project_id` |
| Workflow run | `workflow.project_id` |
| Job, headless run | `job.project_id` |
| JS script run | `js_scripts.project_id` |

The resolver returns null when the folder is unreachable, and the caller
reports that. It never substitutes another folder. `workflow.workspace_id`
is no longer read and is dropped after migration. The project ID is fixed
when the run starts, which satisfies the switch-during-work rule in the
scoping PRD.

`Workspace.key()` rejects any path whose first segment is `.nodetool`. This
one check covers agent file tools, Code nodes, and Save-to-workspace nodes.

### T3. Assets as files

Add `nodetool_assets.workspace_path`: the file's path relative to its
project folder. Readers resolve bytes in this order:

1. `workspace_path` in the project's folder.
2. `external_path` (linked media, local only).
3. The legacy storage key `<user>/<assetId>.<ext>`.

The lookup that already serves `external_path` after a key miss (F5) gains
step 1. URLs and document references stay ID-based, so no document format
changes. Step 3 keeps every existing asset readable before migration.

All asset creation goes through one function in `asset-services`:

```ts
saveProjectAsset({
  projectId, userId, name, contentType, bytes | localPath,
  directory?,            // default "Generated" for outputs, "Imported" for imports
  path?,                 // exact project-relative path, when the caller chose one
  provenance?            // workflow_id, node_id, job_id, timeline_id
}): Promise<Asset>
```

It writes the file once, then creates the row with `project_id` and
`workspace_path`. A name collision gets a numeric suffix. Callers to move:
workflow output auto-save, `context.createAsset`, the agent media and
binary-output tools, uploads, and Save-file nodes. When an agent names an
output file, the row points at that file and no second copy is written.

Within a project, asset folders are directories. Rows with
`content_type = "folder"` are replaced by directory listings. The fingerprint
stored on each row is size, mtime, and a partial content hash (first and last
1 MiB plus size). A full hash of multi-gigabyte footage is too slow to run on
every scan, so a background job computes the full SHA-256 of each indexed
file and stores it on the row. `Generated/` stays flat.

The folder also carries `.nodetool/assets.json`, a manifest of asset ID,
path, and fingerprint. The indexer writes it. The database remains the
runtime read path. The manifest exists so that a copied folder restores the
same IDs (US12).

### T4. Reconciler

A `ProjectIndex` module in `project-services` compares the folder with the
index. It runs on project open, on `observeWorkspace` events for NodeTool's
own writes, and on file-system watch events for outside changes. Watch
events are debounced. A cloud folder has no outside writers and needs only
the first two triggers.

| Disk | Index | Action |
| --- | --- | --- |
| File present, fingerprint equal | Row | None. |
| File present, fingerprint differs | Row | Update the fingerprint. Invalidate thumbnail, peaks, and proxy. The ID stays. |
| File absent, an unindexed file has the same fingerprint | Row | Update `workspace_path` to that file, and the asset name to its file name. |
| File absent, no match | Row | Mark offline. |
| Media file present | No row | Create a row. Build the thumbnail when the file is first displayed. |
| Other file present | No row | None. Create a row on first use. |

The scan skips `.nodetool/`, dot-directories, and `node_modules/`. It does
not follow symlinks that leave the folder. It lists each directory once and
compares by path map, so cost stays linear in file count.

Rematching a moved file uses the full hash when both sides have one. Until
the background job has hashed a file, the partial fingerprint decides, and
two candidates with the same partial fingerprint leave the row offline for
Relink instead of guessing.

### T5. Workflows and timelines as files

The file is the document. The database row is an index and a cache that the
runtime keeps reading.

```json
{
  "format": "nodetool.workflow",
  "version": 1,
  "id": "<workflow id>",
  "description": "",
  "tags": [],
  "run_mode": null,
  "settings": {},
  "graph": { "nodes": [], "edges": [] }
}
```

```json
{
  "format": "nodetool.timeline",
  "version": 1,
  "id": "<timeline id>",
  "fps": 30, "width": 1920, "height": 1080, "duration_ms": 0,
  "document": {}
}
```

- The filename is the document name. Files hold no `name` field. Renaming in
  NodeTool renames the file.
- Files are pretty-printed with a fixed key order so that diffs stay small.
- Owner, access, thumbnails, and timestamps stay in the database only.
- Add `file_path` and `file_hash` to `nodetool_workflows` and
  `timeline_sequences`. `file_hash` is the hash of the content last synced.
- Save in NodeTool: update the row, then write the file through a temporary
  file and a rename, then store the new `file_hash`.
- The reconciler handles the file side:

| File state | Action |
| --- | --- |
| Hash equals `file_hash` | None. |
| Hash differs and the file validates | Snapshot the current row as a version, import the file, raise `revision`. Open editors reload through the existing revision check. |
| Hash differs and the file fails validation | Keep the row. Show the error on the document. |
| File absent | Show "File missing" with Restore (rewrite from the row) and Delete. |
| New file with an unknown ID | Create the document. |
| New file whose ID belongs to another file | Assign a new ID and rewrite the file. This is the result of duplicating a file in Finder. |

An agent may edit these files with its file tools, as a person may with a
text editor. Every import runs the validation that `update_workflow` and
`set_timeline_document` run, so a file edit cannot store a graph those tools
would refuse. The whole file is editable except `id`, which the reconciler
restores when it changes. The agent's workflow and timeline tools remain the
recommended path because they report validation errors in the tool result.

Version history stays in the database. Example and package workflows are
global templates and are not written to any folder.

### T6. Linking, collecting, copying

- Linking keeps the existing `external_path` behavior and size threshold. The
  import dialog adds an explicit Link choice.
- "Collect files" copies each linked file into `Imported/`, sets
  `workspace_path`, and clears `external_path`. It is resumable per asset.
- Project export and any future sync run Collect first, or refuse and list
  the linked files.
- Cross-project use (D10) calls the existing project copy path, which already
  remaps asset references, with the destination folder as the target.

### T7. Delete, archive, export

- Delete follows D12. Replace the unconditional file wipe (F7) with a branch
  on `workspaces.origin`. `created` moves the folder to the OS trash locally
  and deletes the prefix in the cloud. `adopted` removes `.nodetool/` only.
  Rows from before T1 all read `created`, so `created` counts only when the
  folder carries `.nodetool/created.json`, which names the project and is
  written when NodeTool creates the folder. Any other folder is handled as
  `adopted`.
- Archive leaves the folder in place.
- Export archives the folder plus the database documents that do not live in
  it.

### T8. Web UI

- The left panel shows the project name, then Chats, Documents, and Files.
- Files is `WorkspaceTree` over the project folder. Opening a
  `.workflow.json` or `.timeline.json` opens its editor. Other files open in
  the existing file tab. A context menu adds "Reveal in Finder" on desktop.
- The asset browser reads directories as folders and shows Missing and
  Linked badges.
- Remove the `/workspaces` page, the workspace selector on workflows, and
  the workspace chip. A redirect sends `/workspaces` to the project's Files.
- Copy follows [Brand & Verbal Guidelines](../BRAND.md). The UI says
  "project folder" and never "workspace".

### T9. Migration

Each step is idempotent and safe to interrupt.

1. Give every project a folder. A project that has one workspace keeps it.
   A project with several keeps the first, by creation time, as its folder.
   The other rows and their files stay untouched and are no longer shown.
   A project with none gets a new folder.
2. Write `.nodetool/project.json` into each folder.
3. Write a file for each workflow and timeline, and store `file_path` and
   `file_hash`.
4. Move asset bytes in the background, one asset at a time: record the
   target on the row, copy the legacy object to
   `<folder>/<asset folder path>/<name>`, verify the copy, set
   `workspace_path`, then delete the legacy object. The legacy key keeps
   resolving until the object is deleted, and the row names the file before
   that. See
   [existing assets move into the folder](../developer/project-folders.md#existing-assets-move-into-the-folder).

## Delivery order

| Phase | Content | Ships alone |
| --- | --- | --- |
| P1 | T1, T2, and the Files section of T8. One folder per project, agents and runs work in it. | Yes |
| P2 | T3 for new assets, and T4 for assets. Generated outputs land in `Generated/`. | Yes |
| P3 | T5. Workflow and timeline files. | Yes |
| P4 | T6, T7, the rest of T8, and step 4 of T9. | Yes |

## Testing decisions

| Acceptance | Test boundary | Prior art |
| --- | --- | --- |
| US1, US2, US11, US12, US13 | `projects` tRPC router against a temporary directory | Router tests in `packages/websocket/tests` |
| US3, US4 | `resolveProjectWorkspace` and `saveProjectAsset`, then a chat turn and a workflow run that assert one file on disk and one row | `packages/execution` workspace tests, `asset-autosave` tests |
| US4 reserved directory | `Workspace.key()` in `runtime-core`, for the local and the storage-backed implementation | Existing workspace escape tests |
| US5, US6, US7, D9 | `ProjectIndex.reconcile` over a temporary directory, one test per row of the T4 table, plus a 50,000-file folder that asserts linear time | External asset offline and relink tests |
| US8 | Document file sync, one test per row of the T5 table | Timeline revision conflict tests |
| US9, US10 | Collect and cross-project copy through the asset and project routers | `project-document-copy` tests |
| US14 | The same reconcile and asset tests against a storage-backed workspace | Storage workspace tests in `runtime-core` |
| ID boundary | An asset ID from the agent `assets` capability resolves to bytes at `workspace_path` | Required by the [resource ID principles](../../AGENTS.md#resource-id-principles) |
| UI | Playwright: create a project, generate an image, see it in Files, rename it on disk, see the new name | `web` e2e suite |

Register the new selfchecks in the harness registry so `harness gate`
selects them.

## Out of scope

- Storyboards, scripts, sketches, apps, JS scripts, and chats as files.
- A per-project database inside the folder.
- Sync between a local folder and a cloud project.
- Team sharing and permissions.
- Version control features beyond readable files.
- Several folders in one project.
- Native games. They keep their own per-project workspace (F6) and are not
  moved into the project folder.

## Resolved questions

| ID | Question | Decision |
| --- | --- | --- |
| Q1 | Do native games move into the project folder? | No. Out of scope until their direction is clear. |
| Q2 | What happens to a project with several workspaces? | The first one becomes the project folder. |
| Q3 | Does `Generated/` split by type or date? | No. It stays flat. |
| Q4 | Does a full content hash run in the background? | Yes. See T3 and T4. |
| Q5 | How are direct edits to a workflow or timeline file validated? | With the same validation as the editing tools. See T5. |
