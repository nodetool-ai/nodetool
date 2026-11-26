# Project folder migration on upgrade

An install from before [project folders](../workspaces.md) holds projects
without a folder, workflows and timelines without a file, and asset bytes in
asset storage. [PRD T9](prd.md#t9-migration) moves all of that into project
folders. This page says when that happens and what the user sees first.

## Where it applies

The migration asks first on a local desktop app or a local server: local
workspace storage and `NODETOOL_ENV` other than `production`. It does not ask,
and runs at startup as before, in these cases:

- `NODETOOL_WORKSPACE_STORAGE=cloud`.
- `NODETOOL_ENV=production`.
- An install with nothing to move: no project without a folder, no workflow or
  timeline without a file, and no asset with bytes in asset storage. The state
  is recorded as `done` the first time it is read.
- `NODETOOL_PROJECT_MIGRATION=auto`. The server confirms with the configured
  projects folder for each user who has not confirmed, at startup and when the
  status is read. A user who only read the plan counts as not confirmed.
  Headless servers, CI and tests use it.

The native editors show no dialog of their own. They work through the server,
so they get the migration that the server runs.

## States

The state is a JSON value in the user's `app_settings` row
`PROJECT_FOLDER_MIGRATION`, so the desktop server and a `nodetool` command
share it through the SQLite database. The settings list never shows it.

| State | Meaning | Next |
| --- | --- | --- |
| `not_started` | No row. The plan was never read. | `plan_shown` |
| `plan_shown` | A client read the plan. | `confirmed` |
| `confirmed` | The user confirmed, with the chosen location. | `running`, `paused` |
| `running` | The server or a `nodetool projects migrate` command works through it. | `paused`, `done`, `confirmed` |
| `paused` | The user paused. Nothing bulk runs, after a restart too. | `running` |
| `done` | Every step ran. Failures are listed. | `running` (retry) |

The server enforces every transition and answers a rejected one with
`INVALID_INPUT`. `confirm` requires `plan_shown`. `pause` requires `confirmed`
or `running`. `resume` requires `paused`. `retry` requires `done` or `running`
with at least one failure. Every mutation is refused with `FORBIDDEN` where the
migration does not apply, including an install with nothing to move.

A run claims `running` with its own id, its process id and its host, and
writes a heartbeat every 15 seconds. It stops at its next check once the state
belongs to another run, as after a pause and a resume. A server continues a
`confirmed` or `running` state that no live process works on: the owner
process on the same machine has exited, or the heartbeat is older than a
minute. It looks at startup, on each status read and every 30 seconds. Every
state change commits only while the row still holds what it read, so a server
and a command never overwrite each other's change. A run that stops on an
error gives the state back as `confirmed` and starts again 30 seconds later.

## Before and after confirmation

These run before confirmation, as they must for the app to work:

- Personal gets its folder when projects are listed. It adopts the default
  workspace from before project folders, and no file moves.
- A project gets its folder when a run or a chat turn in it starts
  (`resolveProjectWorkspace`). It keeps its oldest workspace, as step 1 of the
  migration does. The run's agent tools and generated assets use that folder.
  The resolver the asset and document services share never creates a folder,
  so an upload or a document save in a project without one creates none.
- Saving a workflow or timeline in a project that has a folder writes that
  document's file.
- New, imported and opened-folder projects get their folders as today.

These wait for confirmation:

- Folders for every other project without one, with `.nodetool/project.json`
  (T9 steps 1 and 2). The extra workspaces of a project become hidden here.
- Files for every workflow and timeline that has none (T9 step 3).
- The asset move (T9 step 4), from startup, from opening a project, and from
  the move job's own follow-ups. The process-wide move job asks the migration
  state before each pass and before each asset, so pause takes effect after
  the asset being moved.

A folder created before confirmation stays where it was created. The chosen
location applies to the folders created after confirmation. Locate moves an
existing one.

## Plan, location and progress

The plan counts the projects that get a folder, the assets to move, and the
workflows and timelines that get a file. It names each project with more than
one workspace, the workspace it keeps, and the ones it hides. It names the
location: the user's `PROJECTS_DIR` setting, else the environment variable,
else `~/NodeTool`.

A changed location must be an absolute path to an existing, writable
directory. Confirm writes and removes a small file there first, because macOS
refuses a folder the app has no permission for only when it writes. The path
is stored without `..` segments or a trailing separator. Confirm stores it as
the user's `PROJECTS_DIR` setting, in the same transaction as the move to
`confirmed`. A confirmation that loses a race with another writes neither. On
macOS the plan warns when the location is under `~/Documents`, `~/Desktop`,
`~/Downloads`, iCloud Drive (`~/Library/Mobile Documents`) or `/Volumes`,
because the OS asks for permission there. The check ignores letter case and
also follows a link to one of those folders.

Progress is read from the database, so work done by another process counts:
`total` is the asset count recorded at confirmation, and `done` is `total`
minus the assets still waiting. The current project is known only to the
process doing the work. Failures are stored with the state, at most 50 of them
plus a count. A failure is an asset whose copy did not verify or could not be
read, an asset whose file is missing from asset storage, an asset larger than
the upload size limit, or a project whose folder could not be made or reached.
A failed asset is listed again by every run until it moves. Retry looks for
missing files again.

## API

`projects.migration` in the tRPC projects router, with schemas in
`@nodetool-ai/protocol/api-schemas/projects`:

| Procedure | Input | Effect |
| --- | --- | --- |
| `status` (query) | none | State, location, progress, failures, `applies` |
| `plan` (mutation) | `location?` | The plan. Moves `not_started` to `plan_shown`. Checks `location` when given |
| `confirm` | `location?` | Stores the location and starts the run |
| `pause`, `resume`, `retry` | none | The transitions above |
| `dismiss` | none | Hides the finished state in the client |

## CLI

`nodetool projects migrate` prints the plan and the state, and changes
nothing, also with `NODETOOL_PROJECT_MIGRATION=auto`. With `--yes` it
confirms, with `--location <dir>` when given, and runs the migration to the
end in the command's process. It continues a confirmed migration. A migration
that another live process runs is waited for, and taken over if that process
stops. It refuses a paused one, and refuses `--location` once the migration
was confirmed with another location. Where the migration does not ask, it
runs the steps for the local user and lists what failed. It exits with status
1 when a failure is listed or the migration is not `done`. No other command runs a bulk step: commands that run
workflows only use the lazy folder creation above. Every asset step takes the
project's cross-process folder lock, so a server and a command never move one
asset at the same time.

## Failure cases

| Case | Result |
| --- | --- |
| Server or command stops while `running` | A server continues it at once when the stopped process ran on the same machine, otherwise once the heartbeat is a minute old. Every step is idempotent. |
| A run stops on an error | The state goes back to `confirmed`, and the run starts again 30 seconds later. |
| Server stops while `paused` | The next start does nothing bulk until resume. |
| An asset changed within the settle time, or a direct upload may still arrive | The run waits the settle time once and moves it then. An asset still not ready moves the state back to `confirmed`, and the server runs it again later. A command reports the migration as unfinished. |
| A copy does not match | The legacy object stays. The asset is listed as failed. Retry moves it again. |
| A project folder cannot be reached or made | Its assets stay in asset storage, and its workflows and timelines have no file yet. The project is listed as failed. Retry tries both again. |
| The location is not a writable directory | Confirm is refused, and the state stays `plan_shown`. |
| What is deleted | A legacy object is deleted only after its copy in the folder is verified, as in [the move protocol](../developer/project-folders.md#existing-assets-move-into-the-folder). Hidden workspaces keep their files. The dialog says that nothing is lost, not that nothing is deleted. |
