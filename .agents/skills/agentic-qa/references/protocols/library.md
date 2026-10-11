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

**Known behavior.** Library folders hold files, and the Documents panel lists
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
