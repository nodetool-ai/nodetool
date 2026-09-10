# Project scoping PRD

Status: agreed product scope, implementation pending.

Companion: [Implementation tasks](tasks.md).

## Problem

A creator working on multiple deliverables needs to know which work belongs
together and resume each deliverable without rebuilding their working context.
NodeTool groups project documents, but its shared tab list and inconsistently
scoped resource surfaces allow unrelated work to appear together. A project
selector must control resource ownership and execution context as well as
navigation.

## Product outcome

One project represents one deliverable, such as a film, campaign, or app.
Selecting it brings back its working session and makes its resources the
default context for browsing, creation, and agent work. Personal provides the
same capabilities for experiments and work without a named deliverable.

## Agreed decisions

The decision IDs preserve the product discussion's references.

| ID | Decision | Required behavior |
| --- | --- | --- |
| D1 | Project selection | A persistent selector sits above document tabs. It supports finding, switching, creating, and managing projects. Lists, search, pickers, and mentions use the selected project. |
| D2 | Project session | Each project remembers its open tabs, order, active document, and selected chat. Switching preserves drafts. First opening shows the overview. Closing every tab leaves the project selected. |
| D3 | Resource ownership | Documents, workflows, assets, entities, project files, chats, and generated outputs belong to a project. |
| D4 | Creation and execution | New work inherits its originating project. Running generations and agents continue there after a switch. The selector shows background activity. |
| D5 | Global resources | Account settings, credentials, installed models, and reusable templates remain global. Creating from a template produces project-owned work. |
| D6 | Personal and migration | Personal is permanent and a project is always selected. A one-time migration assigns only unassigned resources to Personal. Existing project assignments remain intact. |
| D7 | Project meaning | A named project represents one deliverable. Nested projects and client hierarchies are outside this release. |
| D8 | Independent reuse | Copying into another project creates independent copies and includes referenced assets and entities. Edits never propagate between projects. |
| D9 | Multiple conversations | Each project supports multiple chat threads. New threads receive project context and can work with its resources. |
| D10 | Lifecycle | Finished projects can be archived. Deleting a project deletes its contents after confirmation. Personal cannot be deleted. |

## Experience

```text
[ Project name v ]                              [ Account ]
-----------------------------------------------------------
Project navigation | This project's open document tabs
                   | Active document
                   | Project chat / inspector
```

### Switching and resuming

The project name remains visible above the working area. Switching restores
the destination's session rather than opening every document it owns. Returning
to a project restores its drafts and focus. Reopening the application restores
the selected project and its saved session, with Personal as the fallback.
Tabs from other projects do not appear in the selected project's tab bar.

Opening a link to a document in another project switches to its owning project
before displaying it. A failed or superseded switch must not leave the header,
tabs, and resource panels showing different projects.

### Creating and finding work

Creating documents, importing files, uploading media, generating outputs, and
starting chats use the originating project's identity. Asset browsing, entity
selection, mentions, resource search, and agent resource tools use that same
scope. Scope must be enforced through resource operations, not just hidden
rows in the interface or instructions in an agent prompt.

Each supported resource type needs an explicit ownership path, including
resource types missing from the existing project overview. Project files must
use the workspace interface on both local and cloud storage.

### Background work and conversations

Switching projects does not cancel work. An upload, generation, or agent turn
started in A continues to read and write A even while B is selected. Activity
indicators identify the owning project and provide a route back to its work.

Projects have multiple independent conversation histories. Project context
does not mean inserting another thread's full conversation into a new thread.
Selecting a thread cannot silently redirect its resource operations to the
project most recently selected elsewhere.

### Copying between projects

An explicit copy action selects a destination project. The copy includes the
referenced assets and entities needed to use the document independently.
References in the copied content point to the destination copies. Multiple
references to the same dependency within one copy operation reuse its copied
identity. Source resources remain unchanged.

The destination must remain usable after the source project is deleted.
Missing dependencies or a failed copy must produce a clear failure rather
than report a complete copy with broken references. Global prerequisites,
such as installed models and credentials, remain global.

### Migration and lifecycle

On the first startup using this feature, create or resolve Personal for the
resource owner and assign unassigned resources to it. Preserve IDs, content,
references, and existing project assignments. Repeated startup or an
interrupted migration must not duplicate Personal or move subsequently
assigned resources. Existing tabs and conversation history remain reachable.

Archive retains project contents and supports restoring the project. Archived
projects remain discoverable through project management without crowding the
normal selector. Delete confirmation identifies the project and explains that
its contents will be removed. Deletion must not remove another project's
copies or permit background operations to recreate deleted contents.

## Release acceptance criteria

| ID | Scenario | Pass condition |
| --- | --- | --- |
| AC1 | Switch A to B and back | A restores its tab order, active document, selected chat, and unsaved draft. Only A's tabs appear. |
| AC2 | First open and close all tabs | A new project opens its overview. Closing all tabs leaves its project context active. |
| AC3 | Browse and select resources | Lists, search, pickers, mentions, and agent queries return the selected project's resources plus explicitly global resource types. |
| AC4 | Create through different entry points | UI, API, and agent creation assign the intended project consistently. Invalid project ownership is rejected. |
| AC5 | Switch during work | A generation and agent turn started in A finish in A after switching to B. An upload started in B belongs to B. Activity links return to the correct project. |
| AC6 | Multiple chats | A can create and reopen multiple threads. Switching to B shows B's threads and uses B's resources. Returning to A restores its selected thread. |
| AC7 | Copy with dependencies | Copy a document with repeated asset and entity references into B, edit the copies, and delete A. B still works and its internal references resolve. |
| AC8 | Migrate existing content | Assigned resources keep their projects. Unassigned resources enter Personal without losing content or references. Rerunning migration produces no additional changes. |
| AC9 | Archive and delete | Archive preserves contents and can be reversed. Confirmed deletion removes the project's contents without affecting independent copies. Personal cannot be deleted. |
| AC10 | Interrupted navigation and restart | Rapid switches, failed loads, direct document links, and application restart keep the selector, session, and resource scope consistent. |
| AC11 | Complete coverage | A resource and entry-point inventory has no unhandled project-owned type or unscoped creation path. Local and cloud workspace behavior follow the same ownership rules. |

## Scope boundaries

| ID | Outside this release |
| --- | --- |
| N1 | Team membership, project sharing permissions, and collaboration roles. |
| N2 | Nested projects, client hierarchies, and synchronized shared asset or entity libraries. |
| N3 | A redesign of individual document editors or migration of global credentials and model installations into projects. |

## Implementation questions

These details need resolution during the tasks below. They do not change the
agreed ownership model.

| ID | Question | Resolve in |
| --- | --- | --- |
| Q10 | How should legacy references spanning assigned projects be preserved without breaking documents or introducing new shared ownership? | T1, T2 |
| Q11 | Which linked document dependencies must also be copied, and how should unsupported external dependencies be reported? | T1, T8 |
| Q12 | Should deletion wait for running work or explicitly cancel it, and how are retries prevented from writing afterward? | T9 |
| Q13 | What existing move actions remain valid when moving a resource could break another document's references? | T1, T8 |

## Starting points in the codebase

These findings came from source inspection, not a live visual walkthrough.

| ID | Finding | Source |
| --- | --- | --- |
| F1 | Project opening adds all project documents to a shared tab list and selects the overview. | [WorkspaceTabsStore](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/WorkspaceTabsStore.ts), [useProjects](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/useProjects.ts) |
| F2 | The entity library query searches assets without a project filter, while the overview has a project-specific entity section. | [useEntities](https://github.com/nodetool-ai/nodetool/blob/main/web/src/serverState/useEntities.ts), [ProjectEntitiesSection](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/projects/ProjectEntitiesSection.tsx) |
| F3 | Assets carry a project field, but the inspected upload payload does not carry project context. | [AssetStore](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/AssetStore.ts), [asset schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/schema/assets.ts) |
| F4 | The project document summary union omits workflows, and project metadata has one agent-thread pointer. | [project-summary](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/project-summary.ts), [project schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/schema/projects.ts) |
