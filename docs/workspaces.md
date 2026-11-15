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
