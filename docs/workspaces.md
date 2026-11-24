---
layout: page
title: "Project folders"
description: "Every project is a folder on your disk. What NodeTool writes there, how edits from other apps are picked up, and how to move, open or copy a project folder."
---

Every project has one folder. Generated media, uploads, workflows, timelines and other documents of the project are files in it, and every run, agent and Code node in the project reads and writes there. The **Files** section of the left panel shows it.

```
~/NodeTool/My Film/
├── Generated/                     # media NodeTool generated
│   └── fox-in-snow.png
├── Imported/                      # files you uploaded or dropped
├── Workflows/
│   └── Product shot.workflow.json
├── Timelines/
│   └── Launch cut.timeline.json
├── Storyboards/  Scripts/  Apps/  Sketches/  JsScripts/
└── .nodetool/                     # NodeTool's own files, hidden from Files
```

Because the folder is the project, you can back it up, put it in git, edit a file in another app, or copy it to another computer.

## Where the folder lives

A new project gets the folder `~/NodeTool/<project name>`. A name already taken gets ` 2`, ` 3` and so on.

- **One project elsewhere**: on the desktop app, **Location** in the **New project** dialog puts the folder in another directory, such as a project drive or a client folder. It must exist and be writable, and it cannot be inside another project's folder.
- **All new projects elsewhere**: change **PROJECTS DIR** under **Settings → Integrations → Folders**. The folder must already exist. Existing projects keep their folders.
- **Personal** is the project for loose work. Its folder is NodeTool's own managed folder.

Deleting a project leaves its files on disk.

## Assets are files in the folder

Every asset is a file in its project's folder:

- **Generated media** goes to `Generated/`, named after the prompt or the asset. A generation from "A red fox, in the snow" is `Generated/A-red-fox-in-the-snow.png`. A second file with the same name gets `-2`.
- **Uploads** go to `Imported/`. A file dropped on a folder in the **Files** tree goes to that folder instead.
- **Node and agent outputs** with a file name, such as a Save node with **Save to workspace** on, go where they say.

Renaming an asset in NodeTool renames its file, and deleting the asset deletes the file. Moving an asset to another project moves its file. NodeTool never overwrites a file when it picks a name.

Thumbnails and video previews are not stored in the folder.

### Use a Personal asset in a project

Personal works as your library. In a named project, image pickers (entity images, timeline references, **Replace clip…**) show a **This project** tab and a **Personal** tab. Picking from Personal copies the file into the project's `Imported/` folder as a new asset. The copy is independent: editing or deleting it leaves the original alone. Picking the same asset again reuses the copy. The assistant follows the same rule when it puts another project's asset into a storyboard, timeline or sketch.

## Folders in the asset browser

Within a project, the folders of the [Asset Explorer](asset-management.md) are the directories of the project folder. A directory you make in Finder or File Explorer appears once NodeTool has seen it.

- **Create folder** makes a directory.
- **Move to folder** moves the file. A name already taken there gets a numeric suffix.
- **Rename** on a folder renames the directory, and every asset in it follows.
- **Delete** on a folder deletes its assets and their files. The directory stays if it still holds files that are not assets.

On a server, an empty folder appears only once it holds a file.

## Workflows are files in the folder

Each workflow, timeline and document of the project is a file named after it:

| Document | File |
|---|---|
| Workflow | `Workflows/<name>.workflow.json` |
| Timeline | `Timelines/<name>.timeline.json` |
| Storyboard | `Storyboards/<name>.storyboard.json` |
| Script | `Scripts/<name>.script.json` |
| Mini app | `Apps/<name>.app.json` |
| Sketch | `Sketches/<name>.sketch.ora`, an OpenRaster file that Krita and GIMP open |
| JS script | `JsScripts/<name>.jsscript.json` |

Every save in NodeTool writes the file, whether you, autosave or the assistant saved. Renaming renames the file, deleting deletes it, and moving to another project moves it. Version history and sharing stay in NodeTool, not in the file. Example workflows and templates are not written to any folder.

Double-click a document file in **Files** to open it in its editor.

### Editing a file in another app

You can edit these files in a text editor, replace them with `git pull`, or let another tool change them. While the project is open, NodeTool picks the change up within a few seconds. Otherwise it does so the next time you open the project.

- **A valid edit** is imported. The document as it was is kept as a version named "Before file edit", so you can go back. Open editors show the new content. An editor with unsaved changes keeps them and lists any conflict.
- **An edit that is not valid** is not imported. The editor shows the error and **Open file**. The last valid version keeps working until you fix the file.
- **A renamed or moved file** renames the document. A copied file becomes a new document.
- **A new file** in the right place becomes a new document.
- **A deleted file** shows **File missing** above the editor, with **Restore**, which writes the file again, and **Delete**.

If a file was edited while NodeTool also saved the document, NodeTool keeps the file's version as "File edit replaced by a save" before it writes its own. Workflows, timelines, sketches and JS scripts have versions. Storyboards, scripts and mini apps do not, so an edit to their file replaces them without a version.

## When a file goes missing

NodeTool notices when a media file in the folder is renamed, moved, edited or deleted by another app.

- **Renamed or moved inside the folder**: the asset follows the file and keeps working everywhere it is used.
- **Edited**: the asset keeps its place and gets a new thumbnail.
- **Deleted or moved out of the folder**: the asset shows **Missing**, with **Relink** to point it at a file and **Remove** to drop it. Putting the file back brings it back.
- **New media file**: an image, video, audio or 3D file you add to the folder becomes an asset.

An asset marked **Linked** uses a file outside the project folder in place. See [Link or copy media](projects.md#link-or-copy-media).

### Folder not found

A project whose folder was renamed, moved, or is on a drive that is not connected shows **Folder not found** on its card and above its files. Runs in it do not start. Click **Locate** and pick the folder's new place. NodeTool refuses a folder that belongs to a different project.

## Open a folder as a project

On the desktop app, **New project → Open folder…** turns a folder you already have into a project. No file moves. NodeTool adds only its `.nodetool/` folder. A folder that is, contains, or sits inside another project's folder is refused.

### Open a project folder from another machine

Copy a project folder to another computer and open it there with **Open folder…**. The project opens with its workflows, timelines, documents and assets, and the references between them keep working.

- **Chats do not travel.** They stay on the computer they were made on.
- **Linked media does not travel**, because its file is outside the folder.
- **A copy of a project you already have** opens as a second, independent project.
- **A folder from a project of another user, or one you deleted**, is refused with `This folder belongs to a project that cannot be opened here`.

An asset whose file is missing from the copied folder opens as **Missing**. The rest of the project opens.

## A folder inside another project's folder

A project's folder can sit inside another's. Personal's folder holds the folders of imported projects, for example. Runs, the assistant and nodes in the outer project cannot read or write the inner folder, its files are not the outer project's assets, and the asset browser leaves it out. Open the inner project to use its files.

## Upgrading from before project folders

An install from before project folders asks before it moves anything. The first launch after the upgrade shows how many projects get a folder, how many files move, and where the folders go. **Change location** picks another folder. On macOS, a folder under Documents, Desktop, Downloads, iCloud Drive or an external drive makes macOS ask for permission first. **Move files** starts the move. **Not now** asks again on the next launch.

While files move, a panel shows the progress, the project being worked on, **Pause** and **Resume**, and any files that could not move, with **Try again**. Every asset stays usable during the move. A project card shows "Moving files into the project folder" with a count.

From a terminal, [`nodetool projects migrate --yes`](cli.md#nodetool-projects) runs the same move to the end.

## On a server

A self-hosted server with `NODETOOL_ENV=production` keeps project folders in its asset storage, not on a disk you can browse. **Location**, **Open folder…**, **Locate** and **Reveal in Finder** are not offered there. See [Storage](storage.md).

## If it fails

| Message | What to do |
|---|---|
| `Project folder not found: <folder>` | The project's folder is missing or on a disconnected drive. Reconnect it, restore the folder, or use **Locate**, then run again |
| `This folder is inside the folder of project "<name>"` | Pick a folder that is not inside, and does not contain, another project's folder |
| `This folder belongs to project "<name>"` | **Locate** was given another project's folder. Pick this project's own folder |
| `This folder belongs to a project that cannot be opened here` | The folder belongs to another user's project, or to a project you deleted |
| `Path '<path>' is inside .nodetool/, which NodeTool reserves for its own files` | A node, script or the assistant tried to use NodeTool's own folder. Use another path |
| `Path '<path>' is in the folder of another project inside this one` | Open that project to use its files |
| `Opening a folder as a project is disabled on this server` | The server runs in production mode, which keeps folders in its own storage |

## Related

- [Projects](projects.md)
- [Asset Management](asset-management.md)
- [Storage](storage.md)
- [Project Folder Internals](developer/project-folders.md)
