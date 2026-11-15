---
layout: page
title: "Project folders"
description: "The folder every project owns, where runs, agents, and the Code node read and write through relative paths, how Files shows it, and the production limits."
---

Every project has one folder. Workflow runs, agent tasks, and chat sessions in that project read and write it through relative paths. Nodes and tools confine file operations to it. The Files section of the left panel shows it.

```
~/NodeTool/My Film            # PROJECTS_DIR, one folder per project
~/NodeTool/My Film/.nodetool  # NodeTool's own files, hidden from Files
```

## Project folders

Creating a project creates `<PROJECTS_DIR>/<project name>` (default `~/NodeTool`, see [Configuration](configuration.md#environment-variables-index)) and adds ` 2`, ` 3` and so on when the name is taken. The projects folder must be an absolute path to a writable directory. A folder you name in Settings must already exist. With `NODETOOL_WORKSPACE_STORAGE=cloud` the folder is the key prefix `workspaces/<user>/projects/<sha256 of the project id>` in the asset bucket, or the next free `projects/` key when a game already uses that one. If the folder cannot be created, the project is not created either. Personal gets its folder when it is first created, and an imported project gets one at import. When either folder cannot be made, the project stays, runs in it report the missing folder, and the next startup tries again.

Each folder holds `.nodetool/project.json`, which names the project:

```json
{ "format": "nodetool.project", "version": 1, "id": "<project id>", "name": "My Film" }
```

Personal's folder is the default folder from before project folders, unless a native game uses it. Then Personal gets a new folder and the game keeps its own. On startup, each project from before project folders keeps its oldest folder that no game uses, or gets a new one when it has none. Its other folders and their files stay as they are.

A native game never writes into a project folder. Each game keeps its own folder under the managed folder, `NODETOOL_WORKSPACES_DIR`. Deleting a project leaves the files in its project folder in place.

### Open a folder as a project

On the desktop app, **New project → Open folder…** makes a folder you already have into a project (`projects.openFolder({ path, name? })`). No file moves. NodeTool writes only `.nodetool/project.json`, and only when the folder has none. The folder must be inside `NODETOOL_LOCAL_FILE_ROOTS` (your home folder by default), exist, and be writable. A folder that is another project's folder, sits inside one, or contains one is refused with that project's name. The check compares real paths, so a symlink into a project folder is refused too. A server with `NODETOOL_ENV=production` refuses it and shows no **Open folder** entry.

When the folder already has `.nodetool/project.json`:

| The manifest's project | Result |
| --- | --- |
| Unknown on this install | The project is created under that id |
| Yours, and its recorded folder is gone | The project moves to this folder |
| Yours, and its recorded folder still exists | Refused: `This folder is a copy of project "<name>"` |

### Locate a moved folder

A project whose folder is renamed, moved or on an unplugged drive shows **Folder not found** on its card and above its Files. Runs in it do not start. **Locate** points the project at the folder's new place (`projects.relocate({ project_id, path })`) with the same checks as opening a folder. It refuses a folder whose `.nodetool/project.json` names a different project, and writes the manifest into a folder that has none.

The project API returns `folder: { path, origin, is_accessible, workspace_id }`, where `origin` is `created` or `adopted`. `workspace_id` addresses the folder in the `workspace` file procedures. `path` is null for a cloud folder and for every folder on a server with `NODETOOL_ENV=production`, which also ignores a `PROJECTS_DIR` saved in a user's Settings.

## Where runs read and write

Every run reads and writes the folder of its own project:

| Run | Project |
| --- | --- |
| Chat turn, agent run | The thread's project |
| Workflow run | The workflow's project |
| Job, headless run | The job's project |
| JS script run | The script's project |
| `nodetool workflows run <file>` with no stored workflow | Personal |

A record with no project of its own runs in Personal. The folder is chosen once, when the run starts. A run started in one project keeps writing there after you switch to another project. When the folder is unreachable, the run does not start and reports `Project folder not found: <folder>`. No other folder is used in its place.

NodeTool owns `.nodetool/` in every folder. Agent file tools, the Code node, JS scripts and save nodes cannot read, write, list or delete anything in it, and listings leave it out.

## Assets are files in the folder

A workflow output or an asset a node saves is one file in its project's folder plus an asset row. The file goes to `Generated/`, which stays flat. Its name is the asset's name with whitespace as dashes and the extension of its content type, so an image named "fox in snow" is `Generated/fox-in-snow.png`. A second asset of the same name is `fox-in-snow-2.png`. An auto-saved output takes the title of its node, or `<kind>_<node id>` when the node has none.

The row keeps the asset's ID and the file's path in `workspace_path`. URLs and document references use the ID, so they stay valid when the file is renamed. Renaming the asset in NodeTool renames its file, and deleting the asset deletes its file. Moving an asset to another project, as assigning an entity does, moves its file into that project's folder under the same directory. Each of these is refused while a folder it needs is unreachable.

NodeTool never replaces a file when it picks a name. The file is created exclusively, so when another NodeTool process took the name first, or a file with it already exists in the destination folder, the new file gets the next free suffix. An asset created before project folders, or by an upload or an agent tool, keeps its bytes in [asset storage](storage.md) and reads as before.

### The asset index follows the folder

NodeTool compares a project's folder with its asset rows when the project is opened, after NodeTool writes a file into the folder, and, for a folder on this computer, when a file in it changes while the project is open. It applies these rules:

| Folder | Asset row | Result |
| --- | --- | --- |
| The file is at the row's path and unchanged | Exists | Nothing changes. |
| The file is at the row's path and changed | Exists | The row records the new size, modification time and partial hash. The asset keeps its ID. Its thumbnail is replaced, its video proxy is remade, and its waveform is computed again. |
| The file is gone and exactly one file with no row has the same content | Exists | The row points at that file. A file moved or renamed outside NodeTool keeps its asset ID. |
| The file is gone and no file, or more than one, has the same content | Exists | The asset is marked offline. It reports as missing and its URL serves nothing. |
| An image, video, audio or 3D file | None | A row is created. No thumbnail is built. |
| Any other file | None | No row is created. The file gets a row the first time something uses it as an asset. |

A move is often a copy followed by a delete. A media file with the same content as an asset's file therefore gets no row for its first 10 seconds. When the asset's file is gone by then, the asset points at the new file and keeps its ID. When both files are still there, the new file is a copy and gets its own row.

The comparison never deletes a row and never changes a file. It skips `.nodetool/`, every directory whose name starts with a dot, and `node_modules/`. It does not follow symbolic links. A row that already names a file in a skipped directory is still checked.

An offline asset comes back when a file appears at its path again, or when it is relinked. Relink (`assets.relinkExternal`) takes a path relative to the folder, or on a local server an absolute path. A file inside the folder is used where it is. A file outside the folder is copied in next to where the asset's file was. Removing an offline asset deletes its row.

#### Changes made in another app

While a project is open, NodeTool watches its folder. A file saved, moved, renamed, added or deleted by another app is compared within a few seconds, and only the changed paths are looked at. The asset keeps its ID, and its thumbnail URL changes so that no cached picture of the old file is shown. The web app tells the server which project is open with the [`set_open_project`](websocket-api.md#set_open_project) command. The watcher stops when no client has the project open. A change made while the project is closed is picked up the next time it is opened.

A folder in object storage is not watched, because only NodeTool writes to it. It is compared when the project is opened and after NodeTool writes into it.

#### Same content, different files

"The same content" is decided in two steps. Every comparison uses a partial fingerprint: the file's size and a hash of its first and last 1 MiB. A background job also reads each indexed file once, as a stream, and stores the SHA-256 of the whole file in `nodetool_assets.content_hash`. The job reads one file at a time and continues after a restart with the files that have no hash yet. A file that changes loses its hash until the job has read it again.

When an asset's file is gone and exactly one file with no row has its partial fingerprint, the row points at that file. When several do, the stored SHA-256 decides: each candidate is read in full and the one that matches is the asset's file. When the asset has no SHA-256 yet, or no candidate matches, the asset is marked offline.

Known limit: a single candidate is matched on the partial fingerprint alone, even when the asset has a SHA-256, because reading the whole candidate during a comparison would hold up every other change to the folder. A file that was deleted and replaced by a different file of equal size with equal first and last 1 MiB is therefore read as a move, and the asset points at the new file. The background job then stores the new file's SHA-256.

#### The asset manifest

Each project folder carries `.nodetool/assets.json`, next to `.nodetool/project.json`. It lists every asset whose file is in the folder:

```json
{
  "format": "nodetool.assets",
  "version": 1,
  "assets": [
    {
      "id": "<asset-id>",
      "path": "Generated/fox-in-snow.png",
      "size": 482113,
      "mtime": 1763232000000,
      "partial_hash": "<sha-256 of the first and last 1 MiB plus the size>",
      "content_hash": "<sha-256 of the whole file>"
    }
  ]
}
```

`content_hash` is absent until the background job has read the file. NodeTool rewrites the manifest a moment after the index changes. New contents go to `.nodetool/assets.json.tmp` first and replace the manifest once they are complete, so an interrupted write leaves the previous manifest intact. The database stays the source NodeTool reads assets from. The manifest travels with the folder.

## Workflows are files in the folder

Each workflow of a project is a JSON file in the project's folder, `Workflows/<name>.workflow.json`. The file is the document. The database row is the copy NodeTool runs from and reads when it lists workflows.

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

The file name is the workflow's name, and the file has no `name` field. Characters a file name cannot carry become spaces. The file is pretty-printed with these keys in this order and ends with a newline, so a diff shows only what changed. Owner, access, thumbnails and timestamps stay in the database. Version history stays in the database too. Example and package workflows are templates and are written to no folder.

### Saving in NodeTool writes the file

Every save of a workflow writes its file: the editor and its autosave, the REST and tRPC API, the agent's workflow tools, and restoring a version. The write happens in the `Workflow` model, after the row is saved. The row then records the file's path in `file_path` and the SHA-256 of its content in `file_hash`. Saving a workflow that did not change leaves the file byte-identical.

Renaming a workflow renames its file. Deleting a workflow deletes its file. Moving a workflow to another project moves its file to that project's folder. A file edit NodeTool has not seen is kept as a version before the file leaves the old folder. When that edit is not valid, the move is refused with an error that names the file, and the workflow and its file stay where they are. A second workflow with the same name gets `<name>-2.workflow.json`. NodeTool creates a new file exclusively and never replaces a file it did not write for that workflow.

A workflow is saved even when its folder cannot be reached. The file is written, and renamed when the name changed, the next time the folder is compared. The same holds for a workflow saved by a host that does not write project files, such as a CLI command run against the database. `file_hash` keeps naming the file as NodeTool last wrote or imported it, so the comparison can tell a file nobody touched, which it writes, from a file that was edited, which it imports.

A save never replaces a file edit NodeTool has not seen. Before it writes, the save compares the file with `file_hash`. When the file was edited since, for example by a `git pull` while the project was closed, the file's content is kept as a version named "File edit replaced by a save" and the save is then written. When the edited file is not valid, the file is left as it is and its error is recorded in `file_error`. The workflow is saved in the database either way.

### Editing the file updates the workflow

A workflow file can be edited by hand, replaced by git, or changed by an agent with its file tools. NodeTool compares the files with the rows whenever it compares the asset index: when the project is opened, after NodeTool writes into the folder, and when a file changes while the project is open.

| File | Result |
| --- | --- |
| Its hash equals `file_hash` | Nothing changes. |
| Its hash differs and the file is valid | The workflow as it was is kept as a version named "Before file edit". The file's content is stored and open editors are told. |
| Its hash differs and the file is not valid | The workflow is kept as it was. The reason is recorded in `file_error`. The file is not written again until it is valid. |
| The file is gone | `file_error` reads "File missing". The workflow is kept. Saving it in NodeTool, or **Restore** above its editor, writes the file again. |
| The file was renamed or moved in the folder | The workflow follows it and takes the new file name as its name. A rename that changes only the case of the name counts, also in a folder that ignores case. |
| A new file with an ID no workflow has | A workflow is created in this project. |
| A new file with the ID of another workflow | The file gets a new ID, is rewritten with it, and becomes a new workflow. Duplicating a workflow file does this. |

The whole file can be edited except `id`. A changed `id` in a file NodeTool knows is set back. A file without an `id` gets one. A `run_mode` that is missing or `null` reads as `workflow`.

An edited graph passes the checks `update_workflow` runs before it is stored: unknown node types, providers and models the runtime does not have, and wiring handles left in property values. A refused file gives the error that tool gives. The agent's workflow tools remain the better way for an agent to change a workflow, because they return the error in the tool result. A node keeps the position the file gives it. A node the file gives no position is placed automatically.

All edits made to a file between two comparisons are stored as one change and leave one version. NodeTool does not rewrite a file it imports, so a text editor that has it open sees no change it did not make. The two exceptions are a restored `id` and a new ID for a duplicate.

An exact copy of a workflow file waits 10 seconds before it becomes a workflow, as a copied media file does. When the original is gone by then, the copy is where the workflow moved to.

When a workflow was saved by a host that writes no files and its file was edited as well, the file is imported and the saved workflow is the version. Restoring a version in NodeTool writes the row and the file together, so the restored graph is not taken for a file edit.

### What the editor shows

The workflow and timeline editors show the state of the document's file above the canvas. It updates within a few seconds of the change on disk.

- An invalid file shows its error and **Open file**, which opens the file in a file tab. The document keeps its last valid version, and that version still runs. Fixing the file clears the error.
- A missing file shows **File missing** with **Restore** and **Delete**. Restore writes the file again from the document. A document that did not change since its file was last written gets a byte-identical file. Delete asks first, then deletes the document.

An editor open on a document whose file was imported takes the new content. An editor with unsaved changes keeps them. A node or clip that both the file and the draft changed keeps the draft's value and is listed in the conflict banner, where the file's value can be taken instead.

### Workflows from before project folders

A workflow that has no file gets one when the server starts and when its project is next compared. The step writes one file per workflow and records `file_path` and `file_hash`. Running it again writes nothing. A workflow that belongs to no project gets its file in the Personal folder once the Personal project exists.

## Timelines are files in the folder

Each timeline of a project is a JSON file in the project's folder, `Timelines/<name>.timeline.json`. It follows the rules of a workflow file: the file is the document, the database row is the copy NodeTool renders from, and the same save and compare steps keep the two in step.

```json
{
  "format": "nodetool.timeline",
  "version": 1,
  "id": "<timeline id>",
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "duration_ms": 0,
  "document": { "tracks": [], "clips": [], "markers": [] }
}
```

The file name is the timeline's name, and the file has no `name` field. `document` is the timeline document that `get_timeline` returns. A clip names its media by asset ID in `currentAssetId`, as the stored document does, so the file holds no media and no path. Owner, the linked workflow, `revision` and timestamps stay in the database. Version history stays in the database too.

### Saving a timeline writes the file

Every save of a timeline writes its file: the editor's save, the tRPC and REST API, `edit_timeline`, `set_timeline_document` and the other agent tools that change a timeline, a finished storyboard, and restoring a version. The write happens in the `TimelineSequence` model, after the row is saved. The row records `file_path`, `file_hash` and `file_error` as a workflow row does. Recording them does not raise `revision` or `updated_at`.

Renaming, deleting, a name that is taken, and a folder that cannot be reached behave as they do for a workflow. Moving a timeline to another project moves its file to that project's folder, and an unseen or invalid file edit is treated as it is for a workflow. Copying a timeline into another project writes a file for the copy.

A save never replaces a file edit NodeTool has not seen, as for a workflow. A valid file that was edited since NodeTool last wrote or imported it is kept as a version named "File edit replaced by a save", with the settings the file had, before the save is written. A file that is not valid is left as it is, and its error is recorded in `file_error`. The timeline is saved in the database either way.

### Editing the file updates the timeline

The comparison is the one in [Editing the file updates the workflow](#editing-the-file-updates-the-workflow), with the same table, and it runs at the same times. For a timeline the rows mean this:

| File | Result |
| --- | --- |
| Its hash differs and the file is valid | The timeline as it was is kept as a version named "Before file edit". The file's content is stored, and `revision` and `updated_at` are raised. |
| Its hash differs and the file is not valid | The timeline is kept as it was, with its `revision`. The reason is recorded in `file_error`. The file is not written again until it is valid. |
| The file was renamed or moved in the folder | The timeline follows it and takes the new file name as its name. A rename that changes only the case of the name counts, also in a folder that ignores case. |
| A new file with an ID no timeline has | A timeline is created in this project. |
| A new file with the ID of another timeline | The file gets a new ID, is rewritten with it, and becomes a new timeline. |

An editor that has the timeline open reloads when `revision` rises. A save that still names the state from before the file edit is refused with `Timeline has been modified since last load`, and a write that carries the old `revision` is refused as a conflict. An edit to the file that changes no content raises neither.

An edited document passes the checks `set_timeline_document` runs before it is stored. Fields a hand-written document leaves out are filled in, such as a track's `index` and a clip's `status`. A track that a clip names and the file does not declare is added. An asset reference in the form the asset tools print, `asset://<short id>.<ext>`, becomes the asset's full ID. A document with validation errors is refused, and `file_error` lists the errors that tool reports.

`fps`, `width` and `height` are stored as the file gives them. A file that leaves one out keeps the value the timeline has. `duration_ms` is the end of the last clip. NodeTool computes it from the document when it imports the file, so an edit to the clips need not update it.

Restoring a version writes the row and the file together and raises `revision`. The restored document is not taken for a file edit.

### Timelines from before project folders

A timeline that has no file gets one when the server starts and when its project is next compared, as a workflow does. Running the step again writes nothing.

## Files in the left panel

The left panel lists **Chats**, **Documents** and **Files** under the name of the open project. Files is a tree of the project folder. It updates when a run or a tool adds a file, and it hides `.nodetool/`.

Double-click a file to open it. A `.workflow.json` file opens the workflow editor on its workflow, and a `.timeline.json` file opens the timeline editor on its timeline. The document is the one whose `file_path` is that file. Any other file opens in a file tab, and so does a document file that no workflow or timeline owns yet.

Right-click a file or folder to reveal it in your file manager. The menu reads **Reveal in Finder** on macOS, **Show in File Explorer** on Windows and **Show in file manager** on Linux. It appears in the desktop app only. The browser app and a cloud deployment show the tree without it, because the files are not on your machine.

New project folders go under `PROJECTS_DIR`. The old `/workspaces` page and its folder picker no longer exist, and its address opens the Files section.

## What a cloud deployment allows

A folder on the host would let a user browse the server's filesystem, so `NODETOOL_ENV=production` returns `path: null` and ignores a saved `PROJECTS_DIR`. Only the server-managed folder under the data dir stays readable. `NODETOOL_WORKSPACE_STORAGE=cloud` (the production default) keeps folders in the asset bucket instead of on disk. See [Configuration](configuration.md#environment-variables-index).

## Where project folders are used

- Agent and chat file tools.
- The Code node. Its `workspace.*` API (`read`, `write`, `list`, `stat`, `mkdir`, `remove`, `copy`, `move`) is confined to the project folder unless **Allow Host Filesystem** is on. The cloud profile ignores that switch.

## API

Projects create and adopt their folders through `projects.create`, so no API creates, repoints or deletes a folder. The tRPC `workspace` router has `list`, `listFiles`, `readFile`, and `writeFile` (`packages/websocket/src/trpc/routers/workspace.ts`). Paths passed to the file procedures are workspace-relative. Absolute paths are refused and traversal answers `403`. Binary reads use `GET /api/workspaces/:id/download/:path` (`packages/websocket/src/workspace-api.ts`).

`projects.documents` returns each workflow and timeline with `file: { path, state, error }`, where `state` is `ok`, `invalid` or `missing`. `projects.documentByFile({ id, path })` returns the workflow or timeline whose file is `path` in the project's folder, or null. `projects.restoreDocumentFile({ type, ref })` writes a document's file again from its row. When the reconcile records a new `file_error`, or clears one, the owner's clients get a `resource_change` with `resource_type: "documentfile"`.

## If it fails

| Message | Cause |
|---|---|
| `This workspace is not readable in production` | Reading a folder that points at a host path, in production |
| `Absolute paths not allowed, use relative paths` | A file procedure got a path starting with `/` |
| `Path traversal not allowed` (`403`) | A relative path escaped the workspace root |
| `Project folder not found: <folder>` | A run's project folder is missing, unreachable or not recorded. Reconnect the drive, restore the folder, or use **Locate**, then run again |
| `This folder is inside the folder of project "<name>"`, `contains the folder of`, `is already the folder of` | Opening or locating a folder that overlaps another project's folder |
| `This folder is a copy of project "<name>"` | The folder's manifest names a project whose folder still exists |
| `This folder belongs to project "<name>"` | Locate was given another project's folder |
| `Opening a folder as a project is disabled on this server` | Open folder or Locate with `NODETOOL_ENV=production` |
| `Path '<path>' is inside .nodetool/, which NodeTool reserves for its own files` | A tool, node or script used a path in `.nodetool/` |

## Related docs

- [Projects](projects.md)
- [Workflow Editor](workflow-editor.md)
- [Storage Guide](storage.md)
- [Node Reference: `nodetool.code`](nodes/nodetool/code/)
