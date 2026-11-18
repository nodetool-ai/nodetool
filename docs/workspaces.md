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

Creating a project creates `<PROJECTS_DIR>/<project name>` (default `~/NodeTool`, see [Configuration](configuration.md#environment-variables-index)) and adds ` 2`, ` 3` and so on when the name is taken. On the desktop app, **Location** in the **New project** dialog puts the folder in another directory (`projects.create({ name, location })`), such as a project drive or a client folder outside `PROJECTS_DIR`. The location must exist, be writable, and be inside `NODETOOL_LOCAL_FILE_ROOTS`, which the desktop app leaves open to any folder. A location that is another project's folder, or lies inside one, is refused with that project's name. A server with `NODETOOL_ENV=production` refuses a location. The projects folder must be an absolute path to a writable directory. A folder you name in Settings must already exist. With `NODETOOL_WORKSPACE_STORAGE=cloud` the folder is the key prefix `workspaces/<user>/projects/<sha256 of the project id>` in the asset bucket, or the next free `projects/` key when a game already uses that one. If the folder cannot be created, the project is not created either. Personal gets its folder when it is first created, and an imported project gets one at import. When either folder cannot be made, the project stays, runs in it report the missing folder, and the next startup tries again.

Each folder holds `.nodetool/project.json`, which names the project:

```json
{ "format": "nodetool.project", "version": 1, "id": "<project id>", "name": "My Film" }
```

Personal's folder is the default folder from before project folders, unless a native game uses it. Then Personal gets a new folder and the game keeps its own. When the [migration](#upgrading-from-before-project-folders) runs, each project from before project folders keeps its oldest folder that no game uses, or gets a new one when it has none. Its other folders and their files stay as they are.

A native game never writes into a project folder. Each game keeps its own folder under the managed folder, `NODETOOL_WORKSPACES_DIR`. Deleting a project leaves the files in its project folder in place.

### A folder inside another project's folder

One project's folder can lie inside another's. Personal's folder is the managed folder, and the managed folder holds `projects/<64 hex characters>`: the folder of every project on a cloud deployment, of every imported project, and of every native game.

A directory inside a project folder is another folder when either is true:

- It holds a `.nodetool/` directory.
- A workspace row records it as the folder of a project or of a game.

The files in it belong to that project or game. These surfaces of a run in the outer project refuse a path in the inner folder:

| Surface | How it is guarded |
| --- | --- |
| Agent file tools, the Code node, JS scripts, save nodes with **Save to workspace** | They read and write through the outer folder's workspace, which refuses every operation on such a path: read, stat, list, write, copy, move, delete, and the staging of a file or directory for a host binary. |
| `media_edit`, `media_probe` | They hand real paths to libav. Each input and output path is read once, the way the workspace reads it, and that one result is both checked by the workspace's rule and opened. `workspace/x`, `x`, `C:/x` and a path written with backslashes are therefore one file to the check and to the reader. |
| `yt_dlp` | yt-dlp expands the output template from the server's environment before it writes, so a template is refused when it starts with `~`, holds a `$`, or holds a `%` that does not open a field, and when it starts with a type prefix such as `thumbnail:`. Its directory must be literal: a field such as `%(id)s` is allowed in the file name only, so no field can choose the directory. The download and mux of two formats checks every path yt-dlp prints before it muxes or removes the file, since yt-dlp also prints a file it skipped because it already exists. The template is also refused when yt-dlp and the workspace would read it as different files, as `workspace/dl/x.%(ext)s` or a path with backslashes would be: yt-dlp writes the literal path, while the mux and the cleanup open the workspace's reading, which could remove the project's own file. The capability passes no other path to yt-dlp. |
| Document tools (`convert_document`, the PDF tools), sandbox file transfers, the SQLite database path node | They open real paths with `node:fs`, or hand one to the workflow. The resolved path, which is the one opened, is checked by the workspace's rule first. |
| Save nodes with **Save to workspace** off, including Save Text, Save Audio, Save Video, Save Image, Save 3D Model and Save Document with a fixed path | They write to the folder the node names with `node:fs`. The final path is checked by the workspace's rule before any directory is created. A path outside the project's own folder is your choice and is not judged. The `.nodetool/` directory and another project's folder inside it are refused, whether the folder, the file name or a `..` segment reaches them. A symbolic link inside the project's folder that leads out of it, or points at nothing, is refused too, since the write would follow it. The file is opened without following a link, and on Linux the opened file is checked again, so a link swapped in after the check does not redirect it. |
| Media named by a `file://` URI or an absolute path | The path is checked by the same rule before a storage adapter or the file system is asked. A path outside the project's own folder is read as before. Under the cloud profile such a path is never read. |

A path is judged as written and as it really is. A symbolic link inside the outer folder that points at an inner folder is refused like the inner folder itself. A path written outside the folder that really leads into it is judged the same way: a link elsewhere on the host, `/proc/self/root/...`, a dangling link a write would follow, a macOS firmlink (matched by the folder's device and inode), and on Windows the `\\?\` and `\\.\` prefixes and the administrative share of the local machine (`\\localhost\C$\...`).

A folder that a workspace row names is matched without regard to case, and so is `.nodetool`. Another spelling of either, such as a Windows short name (`GAMES~1`, `NODETO~1`) or a name with trailing dots or spaces (`.nodetool.`), is caught only through the real path, so the check relies on the operating system's `realpath` returning the canonical name. The workspace compares that real path with the reserved directory and with the other project's folder, so a link or an alias of `.nodetool/` is refused like `.nodetool/` itself. Tests model such an alias with a link, since Linux has no short names. A folder marked by `.nodetool/` is found on disk under any spelling.

A name that differs from an existing project file only in case is the same file on macOS and Windows. That is not a project boundary, because a run may write any file in its own folder.

Not guarded:

- **The Claude Agent provider's own file tools.** That provider runs the Claude Code CLI with the project folder as its working directory and with permission prompts off. The CLI's `Read`, `Write`, `Edit`, `Glob`, `Grep` and `Bash` open files themselves and never ask the workspace, so a chat or agent run on that provider can reach an inner folder on a local install.
- **Host binaries a node starts in the folder**, such as Blender and ManimGX. They run in a temporary directory inside the folder and can open any path your user account can.

The refusal is the one for `.nodetool/`, with its own message. Listings leave the inner folder out. Deleting a directory that holds an inner folder deletes the outer project's files around it and leaves the inner folder as it is. A directory that holds an inner folder cannot be moved or renamed. The outer folder's own root is never excluded.

The workspace remembers what it learned about a directory for 10 seconds. A project folder created inside a folder that a long run already holds is therefore refused to that run within 10 seconds, and can be reached by it until then. The price of the check is one `stat` per directory on a local folder and one listing request per directory on object storage, each at most once in 10 seconds per run. When the check itself fails, because the database or the storage does not answer, the operation is refused with `Path '<path>' could not be checked against the folders of other projects`. It is never answered as a missing file.

Everything else in the outer project treats the directory as not its own:

| Reader or writer of the outer project | What it does with the inner folder |
| --- | --- |
| Asset index, on open and on changed paths | Does not list it. Creates no asset row for a file in it. |
| Workflow and timeline files | Reads, rewrites and creates no document from a file in it. |
| Folder watcher | Drops a change in it before any comparison starts. |
| Full-hash job, `.nodetool/assets.json` | Reads no file in it and lists none. |
| Asset browser folders, project export | Leave it out. |
| Rename, move or delete of an asset or document whose row names a file in it | Leaves the file in the inner folder as it is. |
| New bytes for an asset whose row names a file in it | Go to a new file under `Imported/` in the outer folder. The asset uses that file from then on. |
| Save or upload of an asset into a directory in it, or at a path in it | Refused. No file is written there. |
| Create, rename or move of an asset browser folder into it, or of a folder that holds it | Refused. No row is rewritten. |

A directory that only leads to an inner folder, such as `projects/`, is still the outer project's. So is a directory with neither mark.

An import writes `.nodetool/created.json` into the new project's folder before it writes any other file, so the folder is another project's from its first file on. A project open at that moment takes none of the imported files as its own.

The outer project can have rows that name a file in an inner folder, created before this rule applied. The next comparison marks such an asset offline and such a document's file as missing, and changes no file. Removing the asset or deleting the document removes the row only. **Relink** points the asset at a file of the outer project. Saving the document, or **Restore**, writes it a file of its own under `Workflows/` or `Timelines/` in the outer folder.

### Open a folder as a project

On the desktop app, **New project → Open folder…** makes a folder you already have into a project (`projects.openFolder({ path, name? })`). No file moves. In a folder that was never a project, NodeTool writes only `.nodetool/project.json`. The folder must be inside `NODETOOL_LOCAL_FILE_ROOTS` (your home folder by default), exist, and be writable. A folder that is another project's folder, sits inside one, or contains one is refused with that project's name. The check compares real paths, so a symlink into a project folder is refused too. A server with `NODETOOL_ENV=production` refuses it and shows no **Open folder** entry.

### Open a project folder from another machine

A project folder carries its workflows, timelines, storyboards, scripts, mini apps, JS scripts and sketches as files, its media, and the asset manifest. Copy the folder to another machine and open it there with **Open folder…**. The project opens with its workflows, timelines and assets, and the references between them work.

Chats are not files in the folder. They stay on the machine they were made on, and the **Open folder** dialog says so. A reference from a workflow or a timeline to one of them names a document the new machine does not have. Linked media stays where it is too, because its file is outside the folder.

What happens depends on the project `.nodetool/project.json` names:

| The manifest's project | Result |
| --- | --- |
| Unknown on this install | The project is created under that ID. Each asset in `.nodetool/assets.json` gets a row with the ID and path the manifest records. Each document file is created as its document under the ID in the file. |
| Yours, and its recorded folder is gone | The project moves to this folder and keeps every row and ID. |
| Yours, and its recorded folder still exists | The folder is a copy. It becomes a second project with a new ID, named after the folder unless you typed a name. Its assets, workflows and timelines get new IDs. |
| Another user's, or a project you deleted | Refused: `This folder belongs to a project that cannot be opened here` |

A copy shares no ID with the project it was copied from. NodeTool writes the new IDs into the copy: `.nodetool/project.json`, `.nodetool/assets.json`, and each workflow and timeline file, where an asset, workflow or timeline ID of the original is replaced by the ID of the copy's own asset, workflow or timeline. The original project, its rows and its folder are not changed. Editing a workflow in the copy changes the copy's file only. A copy of a folder NodeTool created still carries `.nodetool/created.json`, which names the original project and does not apply to the copy.

A folder opened this way is a folder you brought, on either machine. Deleting its project keeps every file in it except `.nodetool/`.

An asset whose file is not in the folder gets its row and is marked offline. It reports as missing, and Relink or restoring the file at its path brings it back. The rest of the project opens. A media file the manifest does not list gets a new row, as in any folder.

An ID in the folder that a row on this install already has is replaced by a new ID. This happens when the asset, workflow or timeline ID belongs to another user or to another project. The references to it in the folder's workflow and timeline files are rewritten to the new ID, and the row that had the ID is not changed. References are rewritten only for IDs of the 32-character form NodeTool generates.

A copy also gets its own asset for each file of the original project that the copied `.nodetool/assets.json` leaves out, when the copy has that file at the same path. The copy's references to it then name the copy's asset, and the original's asset is not changed.

An open that fails after it rewrote IDs in the copy's files removes the rows it made. Before it rewrites a file it records each new ID with the ID it replaced in `.nodetool/restore-ids.json`, and the next open of the folder maps those IDs as well, so the references resolve. The open that succeeds removes the record. Two opens of folders run one after the other, in one server and across processes that share its database, so two projects never get the same folder.

The files in the folder are read as untrusted input. A manifest entry is used only when its ID has the form NodeTool generates and its path names a file place inside the folder. A path that leaves the folder, names `.nodetool/`, is absolute, or reaches its file through a symbolic link out of the folder is left out. A folder that cannot be read stops the open, and no row is kept. A manifest's fingerprint is compared with the file, and its full SHA-256 is never stored: the background job computes it. Opening a folder never deletes or moves a file in it. The only files it changes are `.nodetool/project.json`, `.nodetool/assets.json` and `.nodetool/restore-ids.json`, and the workflow and timeline files in which an ID was replaced.

### Locate a moved folder

A project whose folder is renamed, moved or on an unplugged drive shows **Folder not found** on its card and above its Files. Runs in it do not start. **Locate** points the project at the folder's new place (`projects.relocate({ project_id, path })`) with the same checks as opening a folder. It refuses a folder whose `.nodetool/project.json` names a different project, and writes the manifest into a folder that has none.

The project API returns `folder: { path, origin, is_accessible, workspace_id }`, where `origin` is `created` or `adopted`. `workspace_id` addresses the folder in the `workspace` file procedures. `path` is null for a cloud folder and for every folder on a server with `NODETOOL_ENV=production`, which also ignores a `PROJECTS_DIR` saved in a user's Settings. While [existing assets move into the folder](#existing-assets-move-into-the-folder), `folder` also carries `moving: { done, total }`.

## Where runs read and write

Every run reads and writes the folder of its own project:

| Run | Project |
| --- | --- |
| Chat turn, agent run | The thread's project |
| Workflow run | The workflow's project |
| Job, headless run | The job's project |
| JS script run | The script's project |
| `nodetool workflows run <file>` with no stored workflow | Personal |

A `run_job` message that names a saved workflow without a graph takes the workflow's project from the database. A `run_job` that carries its own graph does not look the workflow up, so the client names the project in `project_id`. The server accepts only a project the caller owns and otherwise refuses the run with `Project not found`. A graph run without `project_id` uses Personal's folder. The web editor sends `project_id` for Run, Run node and the asset transform run.

A record with no project of its own runs in Personal. The folder is chosen once, when the run starts. A run started in one project keeps writing there after you switch to another project. When the folder is unreachable, the run does not start and reports `Project folder not found: <folder>`. No other folder is used in its place.

NodeTool owns `.nodetool/` in every folder. Agent file tools, the Code node, JS scripts and save nodes cannot read, write, list or delete anything in it, and listings leave it out. The name is reserved at every depth, so a run in Personal cannot reach `projects/<id>/.nodetool/` of [a folder inside it](#a-folder-inside-another-projects-folder) either. Only a path segment that is exactly `.nodetool` counts: `.nodetool.md` and `fox.nodetool` are ordinary files. Deleting a directory keeps every `.nodetool/` below it, and a directory that holds one cannot be moved. The other files of a folder inside the run's folder are out of reach in the same way. In the native graph runner, node code that calls `fs.rm` with `recursive` or `fs.rename` on a directory with a `.nodetool/` anywhere below it gets `EACCES`, and nothing is removed or moved.

## Assets are files in the folder

Every asset NodeTool creates is one file in its project's folder plus an asset row: a workflow output, an asset a node saves, an image an agent generates in a chat, and a file you upload. Generated files go to `Generated/`, which stays flat. Its name is the asset's name with whitespace as dashes and the extension of its content type, so an image named "fox in snow" is `Generated/fox-in-snow.png`. A second asset of the same name is `fox-in-snow-2.png`. An auto-saved output takes the title of its node, or `<kind>_<node id>` when the node has none. A generation from the Create tab or a chat takes the first eight words of its prompt, so "A red fox, in the snow" is `Generated/A-red-fox-in-the-snow.png`. A generation with no prompt keeps `<capability>-<time>-<id>`.

A file dropped on a directory in the Files tree is saved in that directory. A file uploaded anywhere else, such as on the canvas or in the asset browser, goes to `Imported/`. An upload names its project, and NodeTool refuses a project you do not own. An agent output with `output_file` is saved at that path, and a Save file node with "Save to workspace" on saves at its file name. Each is the asset's only file, so the agent and the next node read the same bytes the asset shows.

The row keeps the asset's ID and the file's path in `workspace_path`. URLs and document references use the ID, so they stay valid when the file is renamed. Renaming the asset in NodeTool renames its file, and deleting the asset deletes its file. Moving an asset to another project, as assigning an entity does, moves its file into that project's folder under the same directory. Each of these is refused while a folder it needs is unreachable.

### Use a Personal asset in a project

Personal is the library. In a named project, the image pickers (entity images, timeline references, **Replace clip…**) show **This project** and **Personal** tabs. Picking from Personal copies the file into the project's `Imported/` directory as a new asset, and the document stores the copy's ID. The copy is independent: editing or deleting it leaves the Personal original unchanged, and the reverse. Picking the same unchanged asset again returns the same copy. The copy's metadata records the source asset's ID and content hash (`copied_from_asset_id`, `copied_from_hash`), and a client cannot change them. A copied entity stays an entity, and its swapped reference image is copied with it.

Agent tools follow the same rule. When `edit_storyboard`, `edit_timeline`, `set_timeline_document`, the timeline code tools (`set_timeline_code`, `edit_timeline_code`, `rebake_timeline_code`) or `edit_sketch` stores an asset of another project, it copies the asset first, stores the copy's ID, and returns `copied_assets: [{ source_asset_id, asset_id }]`. The server function behind both is `copyAssetToProject` in `@nodetool-ai/asset-services`, reached from the web through `assets.copyToProject`.

NodeTool never replaces a file when it picks a name. The file is created exclusively, so when another NodeTool process took the name first, or a file with it already exists in the destination folder, the new file gets the next free suffix. An asset created before project folders keeps its bytes in [asset storage](storage.md) and reads as before until its file is moved into the folder.

Large files are copied in chunks where the folder is a directory on the host. Saving an asset from a file on disk, renaming an asset's file and moving it to another directory read the file in pieces of about 1 MiB, so a file of 1 to 2 GiB does not need that much memory. The bytes go to a hidden staging file beside the target, `.<name>.<pid>.<id>.tmp`, and the target is then given the whole file in one step that fails when anything is at that name. A file another app saved under the name during the copy is never replaced, and the copy takes the next free suffix. A copy that fails removes only its staging file. A server that stops mid-copy leaves at most the staging file, which has no row. The partial content hash and the full content hash already read by range or by stream. A folder in object storage reads the whole file, because the storage adapters take bytes, and so does the move of an asset from before project folders. Those reads are bounded by `NODETOOL_MAX_UPLOAD_BYTES`.

### Upgrading from before project folders

An install from before project folders has projects without a folder, workflows and timelines without a file, and asset bytes in asset storage. On the desktop app and on a local server, NodeTool asks before it moves them. The first launch after the upgrade shows what will happen: how many projects get a folder, how many files move, which projects have more than one workspace and which of those stop being shown, and the folder new project folders go in. **Change location** picks another folder, which must exist and be writable, and becomes the `PROJECTS_DIR` setting. On macOS a folder under Documents, Desktop, Downloads, iCloud Drive or an external volume makes macOS ask for permission first, and the dialog says so. **Move files** starts the migration. **Not now** asks again on the next launch.

Until then, a project from before project folders gets its folder only when a run or a chat turn in it starts. The other projects, files and assets wait. While the migration runs, one panel shows how many files moved, the project being worked on, **Pause** and **Resume**, and the files that could not move with **Try again**. When it is done it says where the files are. A paused migration stays paused after a restart, and a running one continues.

The migration runs without asking with `NODETOOL_WORKSPACE_STORAGE=cloud`, with `NODETOOL_ENV=production`, and on an install that has nothing to move. Set `NODETOOL_PROJECT_MIGRATION=auto` to skip the question on a headless server or in tests: the server confirms with the configured projects folder at startup. [`nodetool projects migrate --yes`](cli.md#nodetool-projects) confirms from the command line and runs the migration to the end. The states, the API and the failure cases are in the [migration spec](https://github.com/nodetool-ai/nodetool/blob/main/docs/project-folders/migration-ux.md).

### Existing assets move into the folder

Assets created before project folders keep their bytes in asset storage under `<owner>/<asset id>.<ext>`. NodeTool moves them into their project's folder in the background. The move starts once the [migration](#upgrading-from-before-project-folders) is confirmed, after every project has its folder. From then on it starts again when the server starts and when a project is opened. A project shows "Moving files into the project folder" with a count while it runs. Every asset stays readable throughout, under the same ID and the same URL.

Each asset moves on its own, in this order:

1. The target path and the SHA-256 of the stored object are recorded on the asset row.
2. The stored object is copied to that path. The bytes are written under a hidden staging name beside it, `.<asset id>.nodetool-move.tmp`, and the path is then given the whole file in one exclusive step. No file is replaced. The row records that the copy was published, with the file's modification time.
3. The copy is read back, and its SHA-256 is compared with the stored object's.
4. The row gets `workspace_path` and the file's fingerprint, when the stored object is still the one that was read.
5. The stored objects and the file are read again, and each stored object that holds exactly the file's bytes is deleted. When the file changed since the copy, the stored object is kept.
6. The recorded target and hash are removed from the row.

The file goes where the asset was filed: the names of its folders become directories, and the file is named like any other asset file. An asset named "fox" in the folder "Shots" becomes `Shots/fox.png`. A name that is taken gets a numeric suffix. A folder whose name starts with a dot, or is `node_modules`, gets a leading underscore, because the asset index skips such directories. Folder names follow the Windows rules on every system, so a folder moved on Linux or macOS opens on Windows: each of `<>:"/\|?*` and every control character becomes a hyphen, trailing dots and spaces are removed, and a device name such as `CON`, `NUL` or `COM1` gets the suffix `-folder`, also before a dot (`NUL.backup` becomes `NUL-folder.backup`). An asset in no project is assigned to Personal first.

A server that stops between two steps continues on its next start. The recorded target tells it which file is its own copy, so the asset ends with one file. A file at the target is the move's own copy only when the move published it: the row records that it did and the file still has the modification time it had then, or the server stopped between the two steps that publish it, so the staging file is still a second name of the file. The next run uses its own copy when it holds the stored bytes. A path holds the whole copy or nothing, so a copy that was cut short leaves only the staging file. The next run removes it, also when it finds the asset moved or its stored object gone. A file at a target path is deleted only when it is the copy an earlier run published of bytes the asset no longer has: it hashes to the SHA-256 the row recorded, and the stored object holds newer bytes. A file with the same bytes that the move did not publish, such as one a creator put there, stays, and the copy takes the next free name. Any other file there, an empty file included, belongs to someone else and stays as well. The asset index gives no row to a file that is a recorded target. On a file system without hard links, such as exFAT, the copy is created exclusively and written in place, and a copy that was cut short stays in the folder under the target name.

Bytes stored for an asset while it moves are never deleted. An update of the asset's bytes writes to asset storage for as long as the row names no file. That update and the move of the same project take turns: the update stores its bytes and saves the row while the move is not at work, and reads the row again first. The turns hold across processes that share a SQLite database, such as the desktop server and a `nodetool` command, through a lock per project folder in `<database file>.locks/`. The holder first takes an operating system lock, an exclusive transaction on an empty SQLite file there. The operating system keeps it while the holder's process exists, even when that process is suspended or its event loop is blocked, and drops it when the process exits. It reaches every process that shares the database, across PID namespaces too, since SQLite relies on the same file locks for the database. Under it the holder takes a lock file that names it. A lock file whose process has exited is taken over at once. A lock file that was not touched for 15 seconds is taken over as well, unless its process is known to still run. This only matters on a file system without byte-range locks, where the operating system lock does not exclude. A process that waits five minutes for another one's lock gives up with an error. On PostgreSQL the turns hold within one server process. The update keeps the target and hash a stopped move recorded on the row. When the move has named a file by then, the update writes that file. When the stored object still does not have the recorded hash, it is kept, the row is pointed back at it, the copy of the earlier bytes is removed, and a later pass moves the new bytes. A stored object that cannot be read is kept as well, and the asset is tried again later. The move reads stored objects directly, so a failed read is never answered from the file in the folder.

An asset can have stored objects under more than one key: `<owner>/<asset id>.<ext>`, the flat `<asset id>.<ext>` from before owner prefixes, and for a 3D model or font a `.bin` name from before its type had an extension. `nodetool storage migrate-keys` leaves a flat object in place when the owner key exists, so the objects can hold different bytes. The move copies the first one it finds, in that order. Another object is deleted only when it holds the same bytes as the file. One that holds other bytes is stale: it stays in asset storage, and the server logs it. Readers ask for the owner key first, which answers from the file once its object is gone.

The move leaves these alone:

- An asset that references a file in place, and that file.
- Thumbnails, video proxies and other files derived from an asset. They stay in asset storage.
- An asset row with no stored object. The move records this on the row, without changing `updated_at`, and the row stops counting as waiting, so the migration can finish. Each pass lists it as failed with the reason "The file is missing from asset storage". A retry of the migration, or any save of the row such as a bytes update, makes the move look for its bytes again. A stored object that asset storage cannot be asked about, because of a network or permission error, is not taken for a missing one: the asset is tried again later.
- A stored object larger than the read limit: `NODETOOL_MAX_UPLOAD_BYTES`, or 2 GiB when it is not set. The storage adapters read an object whole, so the move does not read a larger one. It stays in asset storage and is listed as failed with a reason that names the limit. The server does not try it again until it restarts.
- An asset whose row changed within the last minute. A later pass moves it.
- An asset made for a direct upload to object storage that has no size yet, for two hours after it was made. The client can upload to its URL for that long.
- An asset of a project whose folder is unreachable.

A folder row is deleted once no asset is filed under it. Its directory is created first, so an empty folder stays a folder on a local disk. A folder row that still holds an asset the move left alone stays.

When a copy does not match the stored object, or the asset row changed while its bytes were copied, the copy is removed, the stored object stays, and the asset is tried again five minutes later or on the next start. Every pass lists such an asset as failed until it moves, also a pass that runs before its next try, so a migration that is paused and resumed still lists it.

### The asset index follows the folder

NodeTool compares a project's folder with its asset rows when the project is opened, after NodeTool writes a file into the folder, and, for a folder on this computer, when a file in it changes while the project is open. It applies these rules:

| Folder | Asset row | Result |
| --- | --- | --- |
| The file is at the row's path and unchanged | Exists | Nothing changes. |
| The file is at the row's path and changed | Exists | The row records the new size, modification time and partial hash. The asset keeps its ID. Its thumbnail is replaced, its video proxy is remade, and its waveform is computed again. |
| The file is gone and exactly one file with no row has the same content | Exists | The row points at that file and takes its file name as the asset name. A file moved or renamed outside NodeTool keeps its asset ID. |
| The file is gone and no file, or more than one, has the same content | Exists | The asset is marked offline. It reports as missing and its URL serves nothing. |
| An image, video, audio or 3D file | None | A row is created. An image, video or audio file gets its thumbnail before the row is announced. A 3D file gets none. |
| Any other file | None | No row is created. The file gets a row the first time something uses it as an asset. |

A move is often a copy followed by a delete. A media file with the same content as an asset's file therefore gets no row for its first 10 seconds. When the asset's file is gone by then, the asset points at the new file and keeps its ID. When both files are still there, the new file is a copy and gets its own row.

After NodeTool writes into the folder, only the paths it wrote are compared. The other triggers compare the whole folder. A folder in object storage is read with one flat listing, which also tells which directories are the folders of other projects. A copy that [Collect](storage.md#external-assets) published and has not yet given to its asset belongs to the linked asset, so it gets no row, even when NodeTool stopped before the row moved. The next Collect reuses it when it still holds the linked file's bytes.

The comparison never deletes a row and never changes a file. It skips `.nodetool/`, every directory whose name starts with a dot, `node_modules/`, and every [folder of another project or game](#a-folder-inside-another-projects-folder) inside this one. It does not follow symbolic links. A row that already names a file in a directory skipped by its name is still checked. A row that names a file in another project's folder is marked offline.

An offline asset comes back when a file appears at its path again, or when it is relinked. Relink (`assets.relinkExternal`) takes a path relative to the folder, or on a local server an absolute path. A file inside the folder is used where it is. A file outside the folder is copied in next to where the asset's file was. Removing an offline asset deletes its row.

#### Changes made in another app

While a project is open, NodeTool watches its folder. A file saved, moved, renamed, added or deleted by another app is compared within a few seconds, and only the changed paths are looked at. The asset keeps its ID, and its thumbnail URL changes so that no cached picture of the old file is shown. The server then tells the clients that list the folder's files, so the Files tree shows the new name without Refresh. The web app tells the server which project is open with the [`set_open_project`](websocket-api.md#set_open_project) command, sent on the shared socket. The Files tree and the asset browser open that socket while they are shown. The watcher stops when no client has the project open, and moves with the project when Locate points it at another folder. A change made while the project is closed is picked up the next time it is opened.

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

`content_hash` is absent until the background job has read the file. NodeTool rewrites the manifest a moment after the index changes. New contents go to `.nodetool/assets.json.tmp` first and replace the manifest once they are complete, so an interrupted write leaves the previous manifest intact. The database stays the source NodeTool reads assets from. The manifest travels with the folder, and [opening the folder on another machine](#open-a-project-folder-from-another-machine) restores the asset IDs from it.

### Folders in the asset browser

Within a project, the asset browser's folders are the directories of the project folder. A directory made in Finder shows up as a folder once the index has caught up, with its media inside. The view across every project and loose assets keep their folder rows.

- **Create folder** makes a directory. No folder row is created inside a project. An object store has no empty directories, so on a cloud deployment an empty folder appears once it holds a file.
- **Move to folder** moves the asset's file into the directory and updates its path. A name already taken there gets a numeric suffix.
- **Rename** on a folder renames the directory and rewrites the path of every asset under it in one request and one database statement. Moving a folder into another works the same way. A name in use is refused.
- **Delete** on a folder deletes the assets under it with their files. The directory goes too, unless it still holds files that have no asset row.

An asset whose bytes are not in the folder yet sits under the path its old folder rows spell, and it follows a rename of that folder.

A directory has no row, so its id names its project and path: `dir:<project id>:<path>`, each part URI-encoded. The project root is the user's home folder, whose id is the user id. `assets.list`, `get`, `recursive`, `update`, and `delete` accept these ids. The id changes when the folder is renamed. The rules live in `packages/protocol/src/project-directories.ts` and `packages/asset-services/src/project-asset-directories.ts`.

Each asset shows the state of its file in the grid, the list, and the viewer. **Missing** marks an offline asset and offers **Relink** and **Remove**. Relink appears in the desktop app, which can read a picked file's location. **Linked** marks an asset that uses a file outside the project folder in place.

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

A workflow that has no file gets one when the [migration](#upgrading-from-before-project-folders) runs, and when its project is next compared. The step writes one file per workflow and records `file_path` and `file_hash`. Running it again writes nothing. A workflow that belongs to no project gets its file in the Personal folder once the Personal project exists.

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

A timeline that has no file gets one when the [migration](#upgrading-from-before-project-folders) runs, and when its project is next compared, as a workflow does. Running the step again writes nothing.

## Other documents that are files in the folder

These documents are JSON files in the project folder too. Each follows the rules of a timeline file: every save writes the file, a rename renames it, a delete deletes it, a move to another project moves it, a copy into another project gets a file, and the comparison imports an edited file, refuses an invalid one and creates a document from a new file.

| Document | File | `format` | The file carries | An edited file is checked with | Versions |
| --- | --- | --- | --- | --- | --- |
| Storyboard | `Storyboards/<name>.storyboard.json` | `nodetool.storyboard` | `document` | The schema the storyboard save route checks a document with (`storyboardDocument`) | None. An import replaces the storyboard without a version, and a file edit a save replaces is not kept. |
| Script | `Scripts/<name>.script.json` | `nodetool.script` | `document` | The schema the script save route checks a document with (`scriptDocument`) | None, as for a storyboard. |
| Mini app | `Apps/<name>.app.json` | `nodetool.app` | `description`, `document` | The parser `create_app` reads a document with (`parseApplicationDocument`) | None. The versions of an app are its published releases, and an edit is no release. |
| Sketch | `Sketches/<name>.sketch.json`, with its layer images in `Sketches/<name>.sketch/` | `nodetool.sketch` | `width`, `height`, `background_color`, `workflow_id`, `document` | The rule every sketch write applies (`sketch` and `layerBindings` present), positive integer size, and every layer image file present | Yes, as for a JS script. |
| JS script | `JsScripts/<name>.jsscript.json` | `nodetool.jsscript` | `document` | The validation `save_js_script` runs (`validateJsScriptDoc`, with the owner's secret names), refused on the errors that tool refuses | Yes. An import keeps the script as it was as a version named "Before file edit", and a file edit a save replaces is kept as "File edit replaced by a save". |

A sketch file keeps each raster layer's pixels as a PNG in the sketch's folder, and the layer's `data` in the file is the path of that PNG, relative to the file. A vector layer keeps its SVG inline. Reading the file reads the images back into the document, and the file hash covers the file and its images. A rename, a move and a delete take the folder along, the asset index skips it, and Files shows the sketch file without it.

The file name is the document's name, and the file has no `name` field. Owner, links to other documents and timestamps stay in the database. The editor of each of these documents shows the state of its file, and `projects.documents`, `projects.documentByFile` and `projects.restoreDocumentFile` include them.

## Files in the left panel

The left panel lists **Chats**, **Documents** and **Files** under the name of the open project. Files is a tree of the project folder. It updates when a run or a tool adds a file, and it hides `.nodetool/`.

Double-click a file to open it. A `.workflow.json` file opens the workflow editor on its workflow, a `.timeline.json` file opens the timeline editor on its timeline, a `.storyboard.json` file opens the storyboard editor on its storyboard, a `.script.json` file opens the script editor on its script, a `.app.json` file opens the app editor on its app a `.jsscript.json` file opens the JS script editor on its script, and a `.sketch.json` file opens the sketch editor on its sketch. The document is the one whose `file_path` is that file. Any other file opens in a file tab, and so does a document file that no workflow or timeline owns yet.

Right-click a file or folder to reveal it in your file manager. The menu reads **Reveal in Finder** on macOS, **Show in File Explorer** on Windows and **Show in file manager** on Linux. It appears in the desktop app only. The browser app and a cloud deployment show the tree without it, because the files are not on your machine.

New project folders go under `PROJECTS_DIR`. The old `/workspaces` page and its folder picker no longer exist, and its address opens the Files section.

## What a cloud deployment allows

A folder on the host would let a user browse the server's filesystem, so `NODETOOL_ENV=production` returns `path: null` and ignores a saved `PROJECTS_DIR`. Only the server-managed folder under the data dir stays readable. `NODETOOL_WORKSPACE_STORAGE=cloud` (the production default) keeps folders in the asset bucket instead of on disk. See [Configuration](configuration.md#environment-variables-index).

### Object storage must honor conditional writes

A folder in object storage creates every new file with a conditional write, so a file is never replaced when NodeTool picks a name. S3 and S3-compatible endpoints get `If-None-Match: *`. An endpoint that accepts the header and ignores it, as older MinIO releases do, would replace the file instead.

Before its first conditional write, each S3 adapter probes the endpoint. It writes a scratch object under `.storage-probe/` twice, the second time with `If-None-Match: *`, and expects the second write to be refused with `412` or `409`. It then deletes the scratch object. When the second write succeeds, the adapter refuses every conditional write, creates no file, and fails with `The storage endpoint <endpoint> ignores the If-None-Match header on writes`. A check followed by a plain write is not used as a fallback, because two writers could pass the check together.

The probe costs three requests for each adapter, once per server start. A probe that fails for another reason, such as a network error or a missing write permission, is not remembered and runs again on the next write. A scratch object that cannot be deleted stays in `.storage-probe/` and is harmless. Supabase Storage answers a non-upsert upload over an existing object with `409`, so it needs no probe. AWS S3, Cloudflare R2 and current MinIO honor the header.

A listing of a folder that cannot be read fails the operation. The nested-folder check relies on listings, so a Supabase listing error, or an unreadable directory on disk, refuses the path instead of reading as an empty directory. Supabase listings read every page, not only the first 1,000 entries.

## Where project folders are used

- Agent and chat file tools.
- The Code node. Its `workspace.*` API (`read`, `write`, `list`, `stat`, `mkdir`, `remove`, `copy`, `move`) is confined to the project folder unless **Allow Host Filesystem** is on. The cloud profile ignores that switch.

### Native editors

The native timeline, node editor and chat are clients of the server, so they read and write project folders through it. Each tells the server which project it has open, so the folder is watched while it is open, and each refreshes its asset and document lists when another app changes a file there. The timeline and the node editor show the project's folder with Show in file manager, Folder not found with Locate, Missing assets with Relink, and the file errors of the open timeline or workflow.

The node editor runs a workflow of Personal, or of no project, in process. A workflow of any other project runs on the server, so its files land in that project's folder. Without a server connection, such a run does not start. The in-process runner refuses paths in `.nodetool/` the way the server does.

Opening a `Workflows/*.workflow.json` or `Timelines/*.timeline.json` file directly in a native editor keeps its `format`, `version` and `id` when it saves, and writes no `name` into it.

## API

Projects create and adopt their folders through `projects.create`, so no API creates, repoints or deletes a folder. The tRPC `workspace` router has `list`, `listFiles`, `readFile`, and `writeFile` (`packages/websocket/src/trpc/routers/workspace.ts`). Paths passed to the file procedures are workspace-relative. Absolute paths are refused and traversal answers `403`. Binary reads use `GET /api/workspaces/:id/download/:path` (`packages/websocket/src/workspace-api.ts`).

`projects.migration` holds the [upgrade from before project folders](#upgrading-from-before-project-folders): `status`, `plan`, `confirm({ location? })`, `pause`, `resume`, `retry` and `dismiss`. The server checks every transition.

`projects.documents` returns each workflow and timeline with `file: { path, state, error }`, where `state` is `ok`, `invalid` or `missing`. `projects.documentByFile({ id, path })` returns the workflow or timeline whose file is `path` in the project's folder, or null. `projects.restoreDocumentFile({ type, ref })` writes a document's file again from its row. When the reconcile records a new `file_error`, or clears one, the owner's clients get a `resource_change` with `resource_type: "documentfile"`.

## If it fails

| Message | Cause |
|---|---|
| `This workspace is not readable in production` | Reading a folder that points at a host path, in production |
| `Absolute paths not allowed, use relative paths` | A file procedure got a path starting with `/` |
| `Path traversal not allowed` (`403`) | A relative path escaped the workspace root |
| `Project folder not found: <folder>` | A run's project folder is missing, unreachable or not recorded. Reconnect the drive, restore the folder, or use **Locate**, then run again |
| `This folder is inside the folder of project "<name>"`, `contains the folder of`, `is already the folder of` | Opening or locating a folder that overlaps another project's folder |
| `This folder belongs to a project that cannot be opened here` | The folder's manifest names a project of another user, or a project you deleted |
| `This folder belongs to project "<name>"` | Locate was given another project's folder |
| `The storage endpoint <endpoint> ignores the If-None-Match header on writes` | The folder's S3-compatible storage does not support conditional writes. Use AWS S3, Cloudflare R2, current MinIO, or a local project folder |
| `Read the migration plan before confirming it`, `Only a migration that is under way can be paused` | A migration request in the wrong state. Read `projects.migration.status` first |
| `Opening a folder as a project is disabled on this server` | Open folder or Locate with `NODETOOL_ENV=production` |
| `Path '<path>' is inside .nodetool/, which NodeTool reserves for its own files` | A tool, node or script used a path in `.nodetool/`, at any depth |
| `Path '<path>' is in the folder of another project inside this one` | A tool, node, script, upload or asset save used a path in [a folder inside this one](#a-folder-inside-another-projects-folder). Open that project to use its files |
| `Path '<path>' holds the folder of another project` | A tool, node or script moved a directory that contains the folder of another project or a `.nodetool/` directory |
| `"<path>" is in the folder of another project`, `holds the folder of another project and cannot be renamed or moved` | An asset browser folder was created in, moved into, or renamed around [a folder inside this one](#a-folder-inside-another-projects-folder) |
| `The file <path> is in the folder of another project and gets no asset in this one` | A tool asked for an asset of a file in [a folder inside this one](#a-folder-inside-another-projects-folder). Use the file from its own project |

## Related docs

- [Projects](projects.md)
- [Workflow Editor](workflow-editor.md)
- [Storage Guide](storage.md)
- [Node Reference: `nodetool.code`](nodes/nodetool/code/)
