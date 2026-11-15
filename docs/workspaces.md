---
layout: page
title: "Workspaces"
description: "Workspace folders that runs, agents, and the Code node read and write through relative paths, with production limits and error messages."
---

A workspace is a folder root that workflow runs, agent tasks, and chat sessions read and write through relative paths. Nodes and tools confine file operations to it.

```
<data dir>/workspaces/        # NODETOOL_WORKSPACES_DIR, the default workspace for each user
~/projects/campaign           # a workspace you added in the app
```

## Project folders

Every project has one folder, recorded as a workspace row. Creating a project creates `<PROJECTS_DIR>/<project name>` (default `~/NodeTool`, see [Configuration](configuration.md#environment-variables-index)) and adds ` 2`, ` 3` and so on when the name is taken. The projects folder must be an absolute path to a writable directory. A folder you name in Settings must already exist. With `NODETOOL_WORKSPACE_STORAGE=cloud` the folder is the key prefix `workspaces/<user>/projects/<sha256 of the project id>` in the asset bucket, or the next free `projects/` key when a game already uses that one. If the folder cannot be created, the project is not created either. Personal gets its folder when it is first created, and an imported project gets one at import. When either folder cannot be made, the project stays, runs in it report the missing folder, and the next startup tries again.

Each folder holds `.nodetool/project.json`, which names the project:

```json
{ "format": "nodetool.project", "version": 1, "id": "<project id>", "name": "My Film" }
```

Personal's folder is your default workspace, unless a native game uses it. Then Personal gets a new folder and the game keeps its workspace. On startup, each project from before project folders keeps its oldest workspace that no game uses, or gets a new folder when it has none. Its other workspaces and their files stay as they are.

A native game never writes into a project folder. Each game workspace is its own row under the managed workspaces folder. Deleting a project leaves the files in its project folder in place.

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

The project API returns `folder: { path, origin, is_accessible }`, where `origin` is `created` or `adopted`. `path` is null for a cloud folder and for every folder on a server with `NODETOOL_ENV=production`, which also ignores a `PROJECTS_DIR` saved in a user's Settings. While [existing assets move into the folder](#existing-assets-move-into-the-folder), `folder` also carries `moving: { done, total }`.

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

NodeTool never replaces a file when it picks a name. The file is created exclusively, so when another NodeTool process took the name first, or a file with it already exists in the destination folder, the new file gets the next free suffix. An asset created before project folders, or by an upload or an agent tool, keeps its bytes in [asset storage](storage.md) and reads as before until its file is moved into the folder.

### Existing assets move into the folder

Assets created before project folders keep their bytes in asset storage under `<owner>/<asset id>.<ext>`. NodeTool moves them into their project's folder in the background. The move starts when the server starts, after every project has its folder, and again when a project is opened. A project shows "Moving files into the project folder" with a count while it runs. Every asset stays readable throughout, under the same ID and the same URL.

Each asset moves on its own, in this order:

1. The target path is recorded on the asset row.
2. The stored object is copied to that path. The file is created exclusively, so no file is replaced.
3. The copy is compared with the stored object by size and partial hash.
4. The row gets `workspace_path` and the file's fingerprint.
5. The stored object is deleted.
6. The recorded target is removed from the row.

The file goes where the asset was filed: the names of its folders become directories, and the file is named like any other asset file. An asset named "fox" in the folder "Shots" becomes `Shots/fox.png`. A name that is taken gets a numeric suffix. A folder whose name starts with a dot, or is `node_modules`, gets a leading underscore, because the asset index skips such directories. An asset in no project is assigned to Personal first.

A server that stops between two steps continues on its next start. The recorded target tells it which file is its own copy, so the asset ends with one file. A copy that was cut short is removed and written again. A file at the target that holds other content belongs to someone else and stays, and the copy takes the next free name. The asset index gives no row to a file that is a recorded target.

The move leaves these alone:

- An asset that references a file in place, and that file.
- Thumbnails, video proxies and other files derived from an asset. They stay in asset storage.
- An asset row with no stored object.
- An asset whose row changed within the last minute. A later pass moves it.
- An asset of a project whose folder is unreachable.

A folder row is deleted once no asset is filed under it. Its directory is created first, so an empty folder stays a folder on a local disk. A folder row that still holds an asset the move left alone stays.

When a copy does not match the stored object, the copy is removed, the stored object stays, and the asset is tried again five minutes later or on the next start.

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

### Folders in the asset browser

Within a project, the asset browser's folders are the directories of the project folder. A directory made in Finder shows up as a folder once the index has caught up, with its media inside. The view across every project and loose assets keep their folder rows.

- **Create folder** makes a directory. No folder row is created inside a project. An object store has no empty directories, so on a cloud deployment an empty folder appears once it holds a file.
- **Move to folder** moves the asset's file into the directory and updates its path. A name already taken there gets a numeric suffix.
- **Rename** on a folder renames the directory and rewrites the path of every asset under it in one request and one database statement. Moving a folder into another works the same way. A name in use is refused.
- **Delete** on a folder deletes the assets under it with their files. The directory goes too, unless it still holds files that have no asset row.

An asset whose bytes are not in the folder yet sits under the path its old folder rows spell, and it follows a rename of that folder.

A directory has no row, so its id names its project and path: `dir:<project id>:<path>`, each part URI-encoded. The project root is the user's home folder, whose id is the user id. `assets.list`, `get`, `recursive`, `update`, and `delete` accept these ids. The id changes when the folder is renamed. The rules live in `packages/protocol/src/project-directories.ts` and `packages/asset-services/src/project-asset-directories.ts`.

Each asset shows the state of its file in the grid, the list, and the viewer. **Missing** marks an offline asset and offers **Relink** and **Remove**. Relink appears in the desktop app, which can read a picked file's location. **Linked** marks an asset that uses a file outside the project folder in place.

## Manage workspaces in the app

Workspaces have their own full-screen page at `/workspaces` (not a Settings tab):

1. Open the app menu (click the logo at the top of the left rail).
2. Choose **Workspaces**.
3. Click **Add Workspace** and pick a directory. The path must be absolute, exist, be a directory, and be writable.
4. Use the star on a row to make it the default workspace. The default workspace has no remove button.

![Workspaces page](assets/screenshots/workspaces-page.png)

A row marked **Inaccessible** points at a folder the server can no longer reach. Workspaces also appear in the **Workspace** view of the left panel (a file tree of the current one) and under **Advanced** in the workflow form. Runs no longer read the workflow form's workspace. Every user gets a default workspace the first time the list loads.

## What a cloud deployment allows

A workspace pointing at a host folder browses the server's filesystem, so `NODETOOL_ENV=production` refuses create, update, and delete (`packages/websocket/src/trpc/routers/workspace.ts`). Each user's server-managed workspace under the data dir stays readable. `NODETOOL_WORKSPACE_STORAGE=cloud` (the production default) keeps it in the asset bucket instead of on disk. See [Configuration](configuration.md#environment-variables-index).

`workspace.list` returns `can_manage`, which the UI reads through `useWorkspaces()`. On a cloud deployment every workspace surface is present and only **Add Workspace** is missing.

## Where workspaces are used

- Agent and chat file tools.
- The Code node. Its `workspace.*` API (`read`, `write`, `list`, `stat`, `mkdir`, `remove`, `copy`, `move`) is confined to the workspace unless **Allow Host Filesystem** is on. The cloud profile ignores that switch.

## API

The tRPC `workspace` router has `list`, `create`, `update`, `delete`, `listFiles`, `readFile`, and `writeFile` (`packages/websocket/src/trpc/routers/workspace.ts`). Paths passed to the file procedures are workspace-relative. Absolute paths are refused and traversal answers `403`. Binary reads use `GET /api/workspaces/:id/download/:path` (`packages/websocket/src/workspace-api.ts`).

## If it fails

| Message | Cause |
|---|---|
| `Managing workspace folders is disabled in production` | Create, update, or delete with `NODETOOL_ENV=production` |
| `This workspace is not readable in production` | Reading a workspace row that points at a host folder, in production |
| `Path must be absolute`, `Path does not exist`, `Path is not a directory`, `Path is not writable` | Folder validation when adding a workspace |
| `Absolute paths not allowed, use relative paths` | A file procedure got a path starting with `/` |
| `Path traversal not allowed` (`403`) | A relative path escaped the workspace root |
| `Cannot delete the default workspace`, `Cannot delete workspace with linked workflows` | Delete refused |
| `Project folder not found: <folder>` | A run's project folder is missing, unreachable or not recorded. Reconnect the drive, restore the folder, or use **Locate**, then run again |
| `This folder is inside the folder of project "<name>"`, `contains the folder of`, `is already the folder of` | Opening or locating a folder that overlaps another project's folder |
| `This folder is a copy of project "<name>"` | The folder's manifest names a project whose folder still exists |
| `This folder belongs to project "<name>"` | Locate was given another project's folder |
| `Opening a folder as a project is disabled on this server` | Open folder or Locate with `NODETOOL_ENV=production` |
| `Path '<path>' is inside .nodetool/, which NodeTool reserves for its own files` | A tool, node or script used a path in `.nodetool/` |

## Related docs

- [Workflow Editor](workflow-editor.md)
- [Storage Guide](storage.md)
- [Node Reference: `nodetool.code`](nodes/nodetool/code/)
