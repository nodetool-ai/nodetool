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
- `NODETOOL_PROJECT_MIGRATION=auto`. The server confirms for each user with the
  configured projects folder at startup. Headless servers, CI and tests use it.

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
| `running` | The server or a `nodetool projects migrate` command works through it. | `paused`, `done` |
| `paused` | The user paused. Nothing bulk runs, after a restart too. | `running` |
| `done` | Every step ran. Failures are listed. | `running` (retry) |

The server enforces every transition and answers a rejected one with
`INVALID_INPUT`. `confirm` requires `plan_shown`. `pause` requires `confirmed`
or `running`. `resume` requires `paused`. `retry` requires `done` or `running`
with at least one failure. Every mutation is refused with `FORBIDDEN` where the
migration does not apply.

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
directory. Confirm stores it as the user's `PROJECTS_DIR` setting. On macOS
the plan warns when the location is under `~/Documents`, `~/Desktop`,
`~/Downloads`, iCloud Drive (`~/Library/Mobile Documents`) or `/Volumes`,
because the OS asks for permission there.

Progress is read from the database, so work done by another process counts:
`total` is the asset count recorded at confirmation, and `done` is `total`
minus the assets still waiting. The current project is known only to the
process doing the work. Failures are stored with the state, at most 50 of them
plus a count. A failure is an asset whose copy did not verify or could not be
read, or a project whose folder could not be made or reached.

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

`nodetool projects migrate` prints the plan and the state. With `--yes` it
confirms, with `--location <dir>` when given, and runs the migration to the
end in the command's process. It continues a confirmed or running migration.
It refuses a paused one. No other command runs a bulk step: commands that run
workflows only use the lazy folder creation above. Every asset step takes the
project's cross-process folder lock, so a server and a command never move one
asset at the same time.

## Failure cases

| Case | Result |
| --- | --- |
| Server stops while `running` | The next start continues. Every step is idempotent. |
| Server stops while `paused` | The next start does nothing bulk until resume. |
| A copy does not match | The legacy object stays. The asset is listed as failed. Retry moves it again. |
| A project folder cannot be reached or made | Its assets stay in asset storage. The project is listed as failed. |
| The location is not a writable directory | Confirm is refused, and the state stays `plan_shown`. |
| What is deleted | A legacy object is deleted only after its copy in the folder is verified, as in [the move protocol](../workspaces.md#existing-assets-move-into-the-folder). Hidden workspaces keep their files. The dialog says that nothing is lost, not that nothing is deleted. |
