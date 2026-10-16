# Keeping and finding work: protocols

This page is for the coordinator. Never give it to a participant. See
[README.md](README.md) for how to use a protocol.

These journeys share one risk: a save that succeeds while a surface the user
checks says nothing is there. Run the "Empty states agree with saves" and
"Names survive a reload" checks in [ux-review.md](../ux-review.md) on each.
When the participant cannot find a saved result, compare what each surface
lists, as [SKILL.md](../../SKILL.md) section 7 describes.

## `image`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `image` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A generated image visible on screen, and the same image reached
again after a reload through visible navigation.

**Checks.** Record which surface the participant used to find the image again
and whether another surface said it was empty.

**Routes.**

- "+ New", then the "Sketch" guided flow (card title "Image"): Idea, Brief,
  Look, then "Generate your image". The result is a sketch document listed
  under Documents, "Creative documents".
- A workflow with an image generation node. Its output is saved to the
  Library.

**Fakes.** Every generated image is a 256 × 256 colour gradient from "Test
Image Model".

## `image-reuse`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 70 actions, 15 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `image-reuse` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A generated image and an edit made from it, both reached again after
a reload through visible navigation.

**Checks.**

- Check that each image fills the layer it was placed in. An image in the
  top-left corner of a larger canvas is a regression of round 6's fit fix.
- Record which Generate the participant pressed for the edit: the layer's
  own button in the inspector, or the tool bar's.

**Routes.**

- The "Sketch" guided flow, then "Generate your image". In the editor, the
  layers panel's "From image" adds an image-to-image layer with the image as
  its source. Its prompt and Generate button are in the inspector.
- Opening a result as a variation in the editor, then the same layer.

**Fakes.** The brief arrives with "fake" in all five fields, and retyping them
costs about 15 actions, which is why the limits here are higher than a
standard task's. The edit is the same 256 × 256 gradient as the original. The
Editor Assistant has no tool calls on the fakes, so asking it for an edit gets
a chat reply.

**Known behavior.**

- The tool bar's Generate opens a new text-to-image form and ignores a
  selected generation layer. This is an open product decision (round 6 D3).
  Round 6 brought the layer's own Generate into view when its prompt is
  focused.
- The tool bar's Generate form names the model by its id
  ("test-image-model"), while the inspector shows "Test Image Model".
- The layer inspector shows a raw storage path under a placed image.

## `photo`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Assets | One photo, for example `holiday-photo.jpg` |
| Goal | The `photo` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A changed image visible after a reload, reached through visible
navigation. Record whether the change was generated or painted by hand.

**Checks.** Read every error under the generation controls at full size. A
fixed "Generation failed." with no reason is a feedback finding.

**Routes.**

- The "Sketch" guided flow's "Upload an image to edit", then an
  image-to-image layer with the photo as its source.
- Library upload ("Upload files"), then opening the photo in the editor.
- Painting by hand with Brush or Pencil, then "Save" (Ctrl+S) or "Save as
  Asset" from the toolbar's overflow menu.

**Fakes.** The edit is the same gradient as text-to-image, whatever the
photo.

**Known behavior.** The layer inspector shows a raw storage path such as
"/api/storage/1/….jpg" under a placed photo.

## `name-find`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `name-find` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** After a reload, the item is opened from a surface that shows the
name the participant chose.

**Checks.** Compare the typed name with every place it appears: the tab, the
Documents panel, the Library, and the Home strip.

**Routes.** Renaming by double-clicking a tab, or from a document's row.

**Known behavior.** "New text file…" makes a Library file, not a document,
although the "+ New" menu lists it under "Blank documents". The Documents
panel's empty state says "Text files and uploads are in the Library." Whether
text files should be documents is an open product question.

**Regression.** `web/tests/journeys/text-file.spec.ts` checks that quickly
typed text arrives intact.

## `rename`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `rename` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** After a reload, the new name on every surface that lists the item,
and the old name on none.

**Checks.** Read the tab, the Documents panel, the Library, and the Home strip
after the reload. Search the screenshots after the rename for the old name.

**Routes.** Double-clicking the item's tab, or "Rename" in the tab's context
menu. The save notice repeats the new name.

**Known behavior.** None open. In round 6 a workflow renamed twice by its tab
showed only the new name everywhere after a reload.

## `organize`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `organize` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** After a reload, both items are inside the group the participant
named.

**Checks.** After each move that reports success ("Asset updated!"), check
the next screenshots for the item in its new place. Record whether the
participant grouped with a project or a Library folder.

**Routes.**

- Library folders: drag a file onto a folder, or the context menu's "Move to
  existing folder".
- A project: the project selector's "New project" asks for a name and makes
  the project active. Documents made there belong to it.

**Known behavior.** Until UX study 6, a folder made from the Library panel
stayed hidden after "Create" behind a "Show folders" toggle, and the default
name "New Folder" was not selected. The study 6 PR shows the folder tree after
"Create" and selects the name. Library folders hold files, and the Documents panel lists
documents by project. A grouping that mixes a workflow and a text file
therefore spans two surfaces.

## `undo-delete`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `undo-delete` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** This journey records behavior rather than requiring a restore.
Report whether deletion warned, whether anything restored the item, and what
each surface that showed the item says afterwards.

**Checks.** Count the toasts after the delete. Check every open tab and
recent list for the deleted item.

**Known behavior.** A deleted asset cannot be restored: there is no trash and
no undo toast, and that needs a server-side soft delete. The confirmation
says "You can right click selected assets and download them before
deleting." Report a participant blocked here as "seen again", not as a new
finding.

## `copy-edit`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `copy-edit` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A second, separately named item exists, and the original is
unchanged after the copy was edited.

**Checks.** Read the node and edge counts in the status bar before and after
each Ctrl+Z, in both documents.

**Routes.** A workflow row in the Documents panel has a Duplicate button next
to Delete. It creates "Name (1)" in the same project and opens it.

## `projects`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Start a separate space in this app for a new piece of work, with a
name you choose, and make something in it. Then go back to where you were
before, check that the new thing is not mixed in there, and then get back to
your new space and the thing you made."

**Pass.** A project with the participant's name exists, the item is listed in
that project and not in the starting one, and the participant returned to it.

**Checks.**

- Read the project selector's label after every switch.
- Record which open tabs disappear or stay when the project changes.
- After the return, compare the item's name and contents with the first
  screenshot of it.

**Routes.**

- The project selector at the left of the tab bar (aria "Select project"):
  "New project", then "Project name" and "Create project". The menu also has
  "Search projects", "Personal", and the project list.
- The "Projects" rail button and the project list's "+ New project".
- The rail's "Documents" panel lists the active project's documents. The
  Library lists every project's files.

**Known behavior.** A participant may expect the Library to follow the
project. Record it as a comprehension finding only when it led to a wrong
conclusion.

## `upload-many`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | None |
| Assets | Three photos with different names, for example `beach.jpg`, `forest.jpg`, and `city.jpg` |

**Goal.** "You have three photos of your own. Put all three into this app and
find a place where you can see them together. Then leave the page, come
back, and check that all three are still there with their names."

**Pass.** After a reload, one surface shows all three photos, each with its
own name and its own picture.

**Checks.**

- Record whether the participant chose the three files in one file chooser
  or one at a time, and how many actions the uploads took.
- Read every thumbnail at full size. A placeholder icon in place of a
  picture is a finding (compare round 7 F14).
- Check that no photo appears twice and none is missing, before and after
  the reload.
- Count the toasts after the upload.

**Routes.**

- The rail's "Library" (assets) panel with "Upload files", or a drop onto
  it.
- The Home composer's attach control, which attaches to a message instead.
  A participant that only attaches has not reached the Library.

**Fakes.** None on this path. Uploads go to the test server's storage.
