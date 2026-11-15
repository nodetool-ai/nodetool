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

Every asset NodeTool creates is one file in its project's folder plus an asset row: a workflow output, an asset a node saves, an image an agent generates in a chat, and a file you upload. Generated files go to `Generated/`, which stays flat. Its name is the asset's name with whitespace as dashes and the extension of its content type, so an image named "fox in snow" is `Generated/fox-in-snow.png`. A second asset of the same name is `fox-in-snow-2.png`. An auto-saved output takes the title of its node, or `<kind>_<node id>` when the node has none.

A file dropped on a directory in the Files tree is saved in that directory. A file uploaded anywhere else, such as on the canvas or in the asset browser, goes to `Imported/`. An upload names its project, and NodeTool refuses a project you do not own. An agent output with `output_file` is saved at that path, and a Save file node with "Save to workspace" on saves at its file name. Each is the asset's only file, so the agent and the next node read the same bytes the asset shows.

The row keeps the asset's ID and the file's path in `workspace_path`. URLs and document references use the ID, so they stay valid when the file is renamed. Renaming the asset in NodeTool renames its file, and deleting the asset deletes its file. Moving an asset to another project, as assigning an entity does, moves its file into that project's folder under the same directory. Each of these is refused while a folder it needs is unreachable.

### Use a Personal asset in a project

Personal is the library. In a named project, the image pickers (entity images, timeline references, **Replace clip…**) show **This project** and **Personal** tabs. Picking from Personal copies the file into the project's `Imported/` directory as a new asset, and the document stores the copy's ID. The copy is independent: editing or deleting it leaves the Personal original unchanged, and the reverse. Picking the same unchanged asset again returns the same copy. The copy's metadata records the source asset's ID and content hash (`copied_from_asset_id`, `copied_from_hash`), and a client cannot change them. A copied entity stays an entity, and its swapped reference image is copied with it.

Agent tools follow the same rule. When `edit_storyboard`, `edit_timeline`, `set_timeline_document`, the timeline code tools (`set_timeline_code`, `edit_timeline_code`, `rebake_timeline_code`) or `edit_sketch` stores an asset of another project, it copies the asset first, stores the copy's ID, and returns `copied_assets: [{ source_asset_id, asset_id }]`. The server function behind both is `copyAssetToProject` in `@nodetool-ai/asset-services`, reached from the web through `assets.copyToProject`.

NodeTool never replaces a file when it picks a name. The file is created exclusively, so when another NodeTool process took the name first, or a file with it already exists in the destination folder, the new file gets the next free suffix. An asset created before project folders keeps its bytes in [asset storage](storage.md) and reads as before.

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

## Files in the left panel

The left panel lists **Chats**, **Documents** and **Files** under the name of the open project. Files is a tree of the project folder. It updates when a run or a tool adds a file, and it hides `.nodetool/`.

Right-click a file or folder to reveal it in your file manager. The menu reads **Reveal in Finder** on macOS, **Show in File Explorer** on Windows and **Show in file manager** on Linux. It appears in the desktop app only. The browser app and a cloud deployment show the tree without it, because the files are not on your machine.

New project folders go under `PROJECTS_DIR`. The old `/workspaces` page and its folder picker no longer exist, and its address opens the Files section.

## What a cloud deployment allows

A folder on the host would let a user browse the server's filesystem, so `NODETOOL_ENV=production` returns `path: null` and ignores a saved `PROJECTS_DIR`. Only the server-managed folder under the data dir stays readable. `NODETOOL_WORKSPACE_STORAGE=cloud` (the production default) keeps folders in the asset bucket instead of on disk. See [Configuration](configuration.md#environment-variables-index).

## Where project folders are used

- Agent and chat file tools.
- The Code node. Its `workspace.*` API (`read`, `write`, `list`, `stat`, `mkdir`, `remove`, `copy`, `move`) is confined to the project folder unless **Allow Host Filesystem** is on. The cloud profile ignores that switch.

## API

Projects create and adopt their folders through `projects.create`, so no API creates, repoints or deletes a folder. The tRPC `workspace` router has `list`, `listFiles`, `readFile`, and `writeFile` (`packages/websocket/src/trpc/routers/workspace.ts`). Paths passed to the file procedures are workspace-relative. Absolute paths are refused and traversal answers `403`. Binary reads use `GET /api/workspaces/:id/download/:path` (`packages/websocket/src/workspace-api.ts`).

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
