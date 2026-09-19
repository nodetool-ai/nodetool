# Agent-Owned Godot Projects — Design Question

**Status:** Open design question

## Decision requested

Design the NodeTool game architecture for this product direction:

> The agent owns and maintains a game. It manages the game source and generated
> assets, may write any Godot code the game needs, and works in a dedicated
> project folder. A shipped template may seed the game, but it must not remain
> the authority over the source after creation.

The review must decide what a game is in NodeTool, where its files live, how the
agent and workflows update it, and how NodeTool runs untrusted agent-authored
Godot code safely. The answer should replace or narrow the current model in
which a workflow graph fills a fixed template and an export node produces the
Godot project.

This document describes the current implementation, the requested product
model, constraints, conflicts, and review questions. The reviewer should not
need prior discussion to understand the decision.

## Requested review output

Return a design with these sections:

1. Recommended ownership model and why it is better than the alternatives.
2. The smallest agent-facing interface that covers project creation, source
   editing, generated-asset installation, verification, playtesting, and build
   export.
3. Persistent data shapes and ownership relationships among a NodeTool project,
   workspace, game, workflow, asset, and chat thread.
4. Folder layout and path rules for local and virtual workspaces.
5. End-to-end sequences for creating a game, editing code, regenerating one
   asset, verifying, and exporting a build.
6. Security model for running agent-authored GDScript and importing a project.
7. Local and cloud execution behavior.
8. Migration from the current template/export-node design.
9. Failure modes, recovery behavior, versioning, and concurrent-edit rules.
10. Test seams, harness coverage, and staged implementation plan.

Name rejected alternatives and the facts that rule them out. Mark assumptions
that require product confirmation.

## Product intent

The game is a long-lived software project, not a one-time media export. The
agent should be able to:

- create or open a Godot project
- inspect and edit any source file in that project
- add scripts, scenes, resources, tests, and configuration
- generate and revise images, sprite sheets, tilesets, sound effects, and music
- install generated assets at stable project-relative paths
- keep code changes when an asset is regenerated
- run checks and a playtest loop
- export a distributable build separately from the source tree
- resume the same game in later turns without rediscovering its location

A template is allowed as a starter. It may provide a working loop, placeholder
assets, scenes, scripts, input mappings, and smoke tests. After the initial
copy, the mutable project folder is authoritative. A template update or asset
workflow rerun must not reset agent-authored source.

The phrase “separate folder” has four intended separations that the design must
make explicit:

- shipped templates are read-only package files
- each mutable game has its own workspace-relative source directory
- generated source assets are installed inside that game without sharing paths
  with another game
- distributable builds and archives do not overwrite the source directory

Whether each game needs its own `Workspace` row, or only its own directory
inside a project workspace, is open.

## Current architecture

### NodeTool projects

A NodeTool project is a database row that groups related work. The row contains
an id, user id, name, free-text kind, lifecycle timestamps, and an optional
project-agent thread id. It does not contain a root directory or game-specific
state.

The project schema is in:

- `packages/models/src/schema/projects.ts`
- `packages/protocol/src/api-schemas/projects.ts`
- `packages/models/src/project.ts`

The project document union currently includes storyboards, scripts, timelines,
sketches, applications, and JavaScript scripts. There is no game document
type. Workspace files can appear as restorable project tabs when their
workspace belongs to the project, but a folder is not itself a project
document.

Deleting a project deletes rows with the same `project_id`, including assets,
workflows, threads, jobs, predictions, and workspaces. This ownership rule is
implemented in `Project.deleteOwned` in `packages/models/src/project.ts`.

### Workspaces

A runtime `Workspace` is the file interface used by agents, nodes, and workflow
runs. Paths are relative to its root. The interface rejects traversal outside
that root and supports local folders and virtual object storage.

Relevant files:

- `packages/runtime/src/workspace.ts`
- `packages/runtime/src/storage-workspace.ts`
- `packages/models/src/workspace.ts`
- `packages/models/src/schema/workspaces.ts`
- `packages/websocket/src/lib/workflow-workspace.ts`

A workspace database row has `id`, `user_id`, `name`, `path`, `project_id`, and
`is_default`. A workflow may hold a `workspace_id`. The runtime interface has
these important properties:

```ts
interface Workspace {
  readonly localDir: string | null;
  key(path: string): string;
  read(path: string): Promise<Uint8Array | null>;
  readText(path: string): Promise<string | null>;
  write(
    path: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(
    path?: string,
    opts?: { recursive?: boolean }
  ): Promise<WorkspaceEntry[]>;
  delete(path: string): Promise<boolean>;
  deleteAll(path: string): Promise<number>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  materialize(path: string): Promise<string>;
  absorb(localPath: string, path: string): Promise<void>;
  scratchDir(): Promise<string>;
}
```

`localDir` is null for cloud-backed workspaces. Byte movement must use the
workspace interface. A host program either needs a local workspace or must
materialize input into scratch storage and absorb outputs explicitly.

A project-agent chat does not currently resolve its workspace from the
project id. Chat workspace resolution uses the conversation’s bound workflow
when one exists and otherwise uses the user’s default workspace. The durable
lookup is `threadWorkspaceWorkflowId` in
`packages/websocket/src/session/chat-turn.ts`. This means a project can own
workspace rows while its agent thread still writes to a different workspace
unless a workflow binding supplies the intended one.

### Assets

Generated media is stored as a NodeTool asset. Assets have `project_id`,
workflow, node, and job provenance. Media tools may also write a workspace
copy when given an output path.

Relevant files:

- `packages/models/src/schema/assets.ts`
- `packages/runtime/src/context.ts`
- `packages/agents/src/tools/asset-persist.ts`

`ProcessingContext.createAsset` stamps the current `projectId`, `workflowId`,
`jobId`, and node id. A Godot project cannot use an `asset://` identifier as a
runtime file path. The bytes must be copied into the project directory and its
Godot resources must reference the copied path. The current Godot writer does
this during project export.

This creates two related records:

1. the NodeTool asset, which carries provenance and can be reused
2. the installed file inside the Godot project, which Godot reads

The new design must define which record owns the stable mapping and how a
regeneration updates it.

### Shipped Godot templates

Three hand-written Godot 4.3 projects are checked into:

```text
packages/godot-templates/templates/platformer/
packages/godot-templates/templates/topdown/
packages/godot-templates/templates/shmup/
```

Each template contains:

```text
manifest.json
project.godot
assets/
scenes/
scripts/
test/smoke.gd
```

The package loader is `packages/godot-templates/src/index.ts`. It resolves the
source or packaged template directory, lists templates, locates Godot, and runs
headless checks. Packaged backends stage the template directory as a runtime
asset.

Each template runs with checked-in placeholder assets before generation. Its
`manifest.json` declares:

- template id and Godot minor version
- image, sprite-sheet, tileset, sound-effect, and music slots
- exact cell sizes, frame counts, durations, loop flags, and generation prompts
- a short list of hook scripts or scenes intended for edits

The manifest schema is `gameAssetManifest` in
`packages/protocol/src/game-assets.ts`:

```ts
{
  version: 1,
  template: string,
  godot: string,
  slots: GameSlotSpec[],
  hooks: string[]
}
```

Slot ids map to deterministic files. Dots become underscores:

| Slot kind             | Installed path                                       |
| --------------------- | ---------------------------------------------------- |
| sprite sheet          | `assets/sprites/<slot>.png` and `.tres`              |
| tileset               | `assets/tiles/<slot>.png` and `.tres`                |
| image                 | `assets/images/<slot>.png`                           |
| sound effect or music | `assets/audio/<slot>.<extension>` and import sidecar |

### Asset checks and slot metadata

The generation pipeline validates one asset at a time through game checker
nodes:

- `nodetool.game.SpriteSheet`
- `nodetool.game.Tileset`
- `nodetool.game.SeamlessImage`
- `nodetool.game.SoundEffect`
- `nodetool.game.MusicLoop`

A checker emits a stored image or audio reference. Its metadata contains a
`SlotFill` under `metadata.nodetool_slot`. The fill records the slot id and
layout facts such as cell size, animation frame ranges, duration, or loop flag.
The checker output carries both the accepted bytes and the metadata needed to
write Godot resources.

A bare `SlotFill` is insufficient because it does not locate the media bytes.
`resolveFills` in `packages/game-nodes/src/fills.ts` rejects a bare fill and
requires the checker’s media output or a full filled-slot record.

The pure writer in `packages/godot/src/writer.ts` accepts a template manifest
and filled manifest. It produces text resources and a list of asset copies. It
does not read pixels. `checkGodotProject` validates generated resource ids and
references.

### Project layout join

`joinGodotProject` in `packages/game-nodes/src/project.ts` currently combines
four responsibilities:

1. validate fills against the selected template manifest
2. generate Godot resources and copy media bytes
3. copy or preserve template source files
4. check references and optionally invoke headless Godot

It has two layout modes:

- `create` copies the template and writes generated resources
- `refresh` preserves every existing template file, including scripts and
  scenes, while replacing generated resources and copied asset files

`refresh` is selected when `project.godot` already exists and overwrite is
false. It also rewrites references when generated audio uses a different file
extension from the placeholder.

This preservation rule protects edits, but it also leaves the template export
operation as the mechanism that updates an agent-owned project.

### Export Godot Project node

`nodetool.game.ExportGodotProject` is implemented in
`packages/game-nodes/src/nodes/game.ts`.

Inputs:

```ts
{
  template?: string;
  name?: string;
  fills?: (ImageRef | AudioRef)[];
  directory?: string;
  verify?: boolean;
}
```

Outputs:

```ts
{
  output: { directory: string; verified: boolean; archive: string };
  directory: string;
  files: string[];
  verified: boolean;
  verification: Record<string, unknown>;
  errors: string[];
  archive: string;
}
```

The node:

- requires a workspace and project name
- loads a shipped template
- accepts zero, some, or all template slots
- keeps template placeholders for omitted slots
- defaults the destination to `games/<slug>`
- never overwrites existing scripts and scenes during refresh
- writes `<directory>.zip`
- defaults verification to true
- reports `verified: true` only when Godot ran and returned no errors and no
  dangling references

The node is the final node in the guided Game flow’s generated asset workflow.
The graph is expected to remain rerunnable as an asset-generation recipe.

### Agent Godot capabilities

The agent capability module is:

- `packages/agents/src/capabilities/godot.specs.ts`
- `packages/agents/src/capabilities/godot.ts`

It exposes:

| Capability             | Current behavior                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `list_game_templates`  | Lists shipped templates, slots, and hooks                                                |
| `export_godot_project` | Requires every manifest slot, joins a template with checked assets, and writes a project |
| `verify_godot_project` | Checks references, imports the project, checks scripts, and runs `test/smoke.gd`         |

The export capability defaults to `godot/<name>`, unlike the node’s
`games/<slug>`. It accepts `overwrite`. The default is false, so later exports
preserve existing scripts and scenes.

The generic file capabilities already let an agent read, create, and edit text
files anywhere inside its resolved workspace:

- `read_file`
- `write_file`
- `edit_file`
- `list_directory`
- `glob`
- `grep`

The current `godot-game` skill in `.agents/skills/godot-game/SKILL.md` tells the
agent to export first, then edit the manifest’s hook files. It permits a new
scene when a hook needs one, but the template and hook list still define the
expected customization surface. This conflicts with the requested ability to
write any Godot code and restructure the project.

### Guided Game flow

The existing product design is
`docs/creation-flows/game-prd.md`. Its main decisions are:

- the game document is a workflow, not a new document type
- `settings.game` stores setup state on that workflow
- a model writes the game design, then a pure graph builder creates one
  generation and checker chain per template slot
- every checker feeds one `ExportGodotProject` node
- the graph run writes `games/<slug>` and a zip
- the project agent takes over after the first build
- later graph runs regenerate assets while refresh mode preserves edited code

The graph is the stored generation recipe. The exported directory is the
playable deliverable. No persistent game record links that directory, its
installed files, its source assets, and its workflow except by conventions in
workflow settings and paths.

### Verification and Godot execution

`verifyWithGodot` runs three checks:

1. `godot --headless --path <dir> --import --quit`
2. `godot --headless --path <dir> --check-only -s <script>` for every `.gd`
3. `godot --headless --path <dir> -s res://test/smoke.gd`

Verification runs only when `Workspace.localDir` is available and a Godot
binary is found. A virtual workspace reports that verification was skipped.

`runGodotHeadless` in `packages/godot-templates/src/index.ts` calls
`child_process.spawn` directly with a timeout. It captures stdout and stderr,
but it does not isolate filesystem access, network access, subprocesses, or
other host capabilities available to GDScript. Headless Godot is not a code
sandbox.

The agent-facing `verify_godot_project` capability is currently categorized as
`read`, even though it executes project scripts. The export capability is
categorized as `write`, and the workflow node can verify as part of a graph
run. This classification was acceptable only under an assumption that shipped
scripts and narrow hook edits were trusted enough to run. It must be revisited
when the explicit product requirement is arbitrary agent-authored Godot code.

## Current lifecycle

The guided path works as follows:

1. A workflow stores the brief, template, style, models, and project name.
2. The graph generates each manifest asset and validates it with a checker.
3. `ExportGodotProject` copies the template to `games/<slug>` and installs the
   checked assets.
4. The export optionally runs headless Godot and creates a zip.
5. The project agent edits hook scripts and scenes in the exported directory.
6. A later graph run regenerates assets and calls the export node again.
7. Refresh mode preserves source files and replaces generated resources and
   media.

This creates two possible authorities:

- the workflow and template define the initial structure and asset slots
- the exported folder contains the current game code and may diverge from both

The current design avoids overwriting the folder but does not model that folder
as the primary game resource.

## Requested lifecycle

The requested model starts from an agent-owned project folder:

1. Create a game identity and assign its source directory.
2. Optionally seed that directory from a template exactly once.
3. Let the agent inspect, add, move, or edit any Godot source file.
4. Generate assets through direct media calls or reusable workflows.
5. Install selected asset versions at stable paths in the game directory.
6. Update Godot resources or scenes without resetting unrelated source.
7. Check references, parse scripts, and run approved verification or playtests.
8. Keep the same game identity, directory, and agent thread across later turns.
9. Export distributable builds and archives outside the source directory.

Templates and workflows become optional inputs to the game. Neither is the
game itself.

An illustrative layout is below. It is not a decision:

```text
games/<game-id>/
  project.godot
  scenes/
  scripts/
  assets/
    generated/
    imported/
  test/
  .nodetool/
    game.json
    asset-map.json

builds/<game-id>/
  <platform exports and source archives>
```

The reviewer should decide whether NodeTool metadata belongs in hidden files,
database rows, workflow settings, asset metadata, or a combination. Godot must
not depend on NodeTool-only metadata to run after download.

## Facts that expose the design conflict

- **F1 — The current document is a workflow.** The Game flow decision says the
  workflow is the game document, while the requested model says the mutable
  Godot source directory is the game.
- **F2 — Workspace selection is not project selection.** A project-agent thread
  resolves a workflow workspace or the user default. It does not automatically
  resolve a workspace owned by the project.
- **F3 — Export paths disagree.** The graph node defaults to `games/<slug>` and
  the agent capability defaults to `godot/<name>`.
- **F4 — Slot completeness disagrees.** The graph node accepts partial fills and
  placeholders. The agent export capability requires every manifest slot.
- **F5 — Code authority is implicit.** Refresh preserves source files, but no
  game record declares that the folder is authoritative or records which
  template files have diverged.
- **F6 — Asset identity is split.** NodeTool owns the generated asset record,
  while Godot owns a copied file. The mapping exists only while export computes
  it from slot metadata and deterministic paths.
- **F7 — The hook model is too narrow.** The current skill directs edits toward
  manifest hooks. The requested agent can replace the scene tree, add systems,
  and write any code.
- **F8 — Verification executes code.** The capability is classified as a read
  and the export node verifies by default, but arbitrary GDScript executes with
  the Godot process’s host permissions.
- **F9 — Cloud storage is not an executable folder.** File editing works through
  a virtual workspace, but Godot verification currently requires `localDir`.
- **F10 — Source archives are coupled to asset refresh.** The export node writes
  a zip every time it updates assets, although source archiving and generated
  asset installation are different operations.

## Constraints and proposed invariants

The reviewer may challenge these, but must address each one.

- The mutable Godot source must never live under
  `packages/godot-templates/templates/`.
- Every agent file operation must remain confined to the resolved workspace.
- A game must have a stable id. Renaming a game must not silently move or fork
  its source.
- The source directory must remain stable across chat turns and workflow runs.
- Generated asset installation must be idempotent and must not rewrite unrelated
  source files.
- Regenerating one asset must preserve scripts, scenes, and all other installed
  assets.
- Godot paths must be normal `res://` project paths. Downloaded projects must run
  without NodeTool.
- NodeTool asset provenance must survive installation so the agent can identify
  and replace the source asset later.
- A skipped verification must never be reported as successful verification.
- Running agent-authored code must be a distinct, correctly classified action
  with an explicit trust and isolation model.
- Local and cloud workspaces must share file semantics. Execution may differ,
  but the difference must be represented in results rather than hidden.
- Deleting a NodeTool project must have defined behavior for the game source,
  installed asset copies, generated asset records, builds, and active jobs.
- Concurrent workflow and agent writes must not silently discard source edits.
- Existing template-generated games need a migration or compatibility path.

## Candidate ownership models

The review should compare at least these options.

### O1 — Folder convention only

A game is a directory such as `games/<id>`. The project agent stores the path
in memory or workflow settings and uses generic file tools. No new game record
or document type is added.

This has the smallest implementation but weak identity, discovery, migration,
concurrency, asset mapping, and deletion semantics. A later conversation may
not know which folder is authoritative.

### O2 — Game document that points to a directory

Add a persistent game resource with an id, `project_id`, `workspace_id`, source
path, Godot version, optional template origin, optional generation workflow ids,
and asset mappings. The source remains normal workspace files. The document
provides identity, UI discovery, lifecycle, and agent operations.

The design must prevent the database document and source metadata from becoming
two competing authorities.

### O3 — NodeTool project kind with one assigned workspace root

Treat a NodeTool project whose kind is `game` as the game identity. Assign one
workspace or workspace subdirectory as its source root. The project agent owns
all source and generated assets there. No separate game row exists.

This keeps one product-level identity, but the current project model permits
many documents and workspaces and does not have a canonical root. The free-text
`kind` field is not currently an invariant.

### O4 — Workflow remains the game record

Keep `settings.game` and add a durable source-directory pointer, asset map, and
agent tools around it. The workflow remains the record and asset-generation
recipe while the folder is its mutable output.

This preserves the guided flow but continues coupling game identity to one
workflow. It must explain games created without a workflow and games with
multiple asset workflows.

### O5 — Game resource owns source, workflows are attached recipes

Create a game resource that owns the directory and metadata. Zero or more
workflows may generate or transform its assets. Templates are creation inputs.
The project agent operates on the game resource and generic file tools are
scoped to its source root.

This most directly matches the requested lifecycle, but adds a resource type,
server capabilities, UI integration, persistence, deletion, copying, and
migration work.

## Design questions

- **Q1 — Canonical identity:** Is the game a NodeTool project, a new game
  document, a workflow, or only a workspace folder? Which object owns the
  stable id?
- **Q2 — Source authority:** Which state is authoritative for project structure,
  installed asset mappings, Godot version, and template origin? What is stored
  in the database versus the source tree?
- **Q3 — Workspace assignment:** Does every game receive a workspace row, or a
  reserved directory inside a project workspace? How does the project-agent
  thread resolve it without relying on a workflow binding?
- **Q4 — Agent scope:** Should generic file tools be scoped to the game source
  root, or should game-specific tools accept project-relative paths? How is
  accidental editing of another game prevented?
- **Q5 — Template role:** Is template use a one-time copy, a recorded upstream,
  or an ongoing merge source? Is creating a blank Godot project supported?
- **Q6 — Asset installation:** What interface copies a NodeTool asset into the
  game, chooses a stable destination, writes `.tres` or scene references, and
  records provenance? Is the current slot contract retained as an optional
  helper rather than the project model?
- **Q7 — Asset updates:** How does a later generation replace one installed
  asset without rerunning a whole export? How are file-extension changes,
  sprite-frame layout changes, and references handled?
- **Q8 — Workflow relationship:** Can a game have zero, one, or many asset
  workflows? How does a workflow target a game without owning it? Should the
  `ExportGodotProject` node be replaced by an asset-install node, narrowed to a
  one-time bootstrap node, or retired?
- **Q9 — Agent interface depth:** What small interface hides workspace
  resolution, asset materialization, provenance updates, reference checks,
  verification results, and build output handling? Avoid one tool for each
  file operation when generic file tools already cover source editing.
- **Q10 — Arbitrary Godot code:** Which Godot files may the agent write? The
  product direction says any file, so any restriction must be a security rule,
  not a template convention.
- **Q11 — Execution security:** Is agent-authored GDScript trusted, approved per
  run, containerized, delegated to an isolated worker, or never run on the host?
  How are imports, editor plugins, network access, subprocesses, and filesystem
  access handled?
- **Q12 — Permission categories:** Which operations are reads, writes, executes,
  or external actions? `verify_godot_project` cannot remain a read if it runs
  arbitrary project scripts.
- **Q13 — Cloud behavior:** Should cloud verification materialize the whole
  source tree into scratch storage, run in an isolated worker, and absorb only
  declared outputs? If execution is unavailable, what checks still run?
- **Q14 — Builds:** Where do desktop, web, mobile, and source-zip exports live?
  Are builds workspace files, assets, jobs, or all three with one owner?
- **Q15 — Versioning and recovery:** Are game source snapshots stored by the
  workspace, as archives, in Git, or as game-document versions? What happens
  after a bad agent edit?
- **Q16 — Concurrency:** How are agent edits, workflow asset installs, Godot
  imports, and builds serialized or checked for stale writes?
- **Q17 — UI integration:** How does a creator open the game, inspect files,
  see installed assets and verification status, download source, and start the
  project agent?
- **Q18 — Migration:** How are existing workflow-backed games with
  `settings.game` and `games/<slug>` adopted without moving or overwriting their
  source?
- **Q19 — Copy and delete:** What does copying a game copy? What does deletion
  remove? How are shared NodeTool assets handled?
- **Q20 — Extensibility:** Can the same ownership model later support imported
  Godot repositories, Git-backed projects, multiple levels, plug-ins, and games
  that do not use a shipped asset manifest?

## Minimum product scenarios

The selected design must describe these scenarios without hidden manual steps.

### A1 — Start from a template

1. Create a game named “Autumn Fox.”
2. Seed the platformer template into its source directory.
3. Give the project agent the game identity and source root.
4. Let the agent replace the movement script and scene structure.
5. Verify or report why execution is unavailable.
6. Reopen the same game in a later conversation.

### A2 — Start without a shipped template

1. Create an empty Godot 4 project.
2. Let the agent write `project.godot`, scenes, scripts, and tests.
3. Add generated art and audio.
4. Verify and export it without inventing a template manifest.

### A3 — Regenerate one asset

1. Select the current player sprite’s NodeTool source asset.
2. Generate and check a replacement.
3. Install it into the existing game.
4. Update dependent Godot resources only when the layout changed.
5. Preserve all source edits and other assets.
6. Record the new provenance and keep the old version recoverable.

### A4 — Multiple asset workflows

1. Attach one workflow for character sheets and another for music.
2. Run either workflow independently.
3. Install selected outputs into one game.
4. Do not make either workflow the game’s owner.

### A5 — Agent-authored code fails

1. The agent edits several scripts.
2. A syntax check or smoke test fails.
3. Return exact script errors and retain the changed source for inspection.
4. Let the agent repair or restore the previous version.
5. Never claim that a skipped or failed check passed.

### A6 — Cloud workspace

1. Create and edit a game in object storage.
2. Install generated assets without requiring a local filesystem.
3. Run storage-only validation.
4. Either execute Godot in an isolated worker or return a specific unavailable
   result.
5. Preserve the same source and asset mappings when later opened locally.

### A7 — Existing guided-flow game

1. Open a workflow with `settings.game` and an existing `games/<slug>` folder.
2. Adopt that folder as the authoritative source without recopying its template.
3. Keep the existing generation workflow as an attached recipe.
4. Preserve all edited scripts, scenes, generated assets, and verification
   history.

## Decision criteria

A preferred design should:

- make the mutable game source the clear authority
- let the agent write arbitrary valid Godot source without template-specific
  restrictions
- keep the agent’s file scope narrow enough to prevent cross-game writes
- separate project creation, asset installation, source verification, and build
  export
- keep workflows useful without making a workflow mandatory
- hide asset-copy and Godot-resource bookkeeping behind a small interface
- preserve NodeTool asset provenance and project ownership
- work with local and virtual workspaces
- classify and isolate code execution correctly
- provide recovery from bad edits and stale concurrent writes
- give the UI and agent one stable game id
- migrate current games without data loss
- keep a downloaded Godot project independent of NodeTool

## Risks the review must address

- **R1 — Host code execution:** GDScript run by Godot can act with the Godot
  process’s OS permissions. A timeout is not isolation.
- **R2 — Split authority:** Database metadata, workflow settings, and source
  files can disagree about the current game.
- **R3 — Lost edits:** An asset refresh, template update, or stale agent write
  can overwrite source created in another turn.
- **R4 — Broken references:** Moving or changing generated files can leave
  `.tscn`, `.tres`, scripts, and import sidecars pointing at missing paths.
- **R5 — Untraceable assets:** A copied PNG or WAV can lose the id and generation
  record of its NodeTool source.
- **R6 — Cloud divergence:** A design that depends on `localDir` may work in
  Electron and fail in cloud storage.
- **R7 — Unbounded project copies:** Source archives and build outputs can become
  large duplicates with unclear retention.
- **R8 — Path identity:** Deriving a directory from a mutable display name can
  orphan the project after rename or collide with another game.
- **R9 — Project deletion:** Workspace files and shared assets have different
  ownership semantics and may be deleted too much or too little.
- **R10 — Tool sprawl:** Adding shallow tools for every Godot file action can
  make the agent interface larger without hiding difficult behavior.

## Existing implementation that can be reused

The new design should preserve useful modules unless the ownership model makes
them obsolete:

- slot schemas and fill acceptance in `packages/protocol/src/game-assets.ts`
- deterministic Godot resource ids and resource writers in `packages/godot/`
- game checker nodes in the image and audio node packages
- media-ref byte loading and project-scoped asset creation
- the workspace interface and local or virtual adapters
- template loading and placeholder projects in `packages/godot-templates/`
- reference checks in `packages/godot/src/check.ts` and
  `packages/game-nodes/src/project.ts`
- Godot import, script-check, and smoke-run result shapes
- project ownership, project-agent threads, and resource-change notifications
- the CLI harness registry and existing game pipeline fixtures

Reuse does not require preserving the current `ExportGodotProject` interface or
keeping a workflow as the game record.

## Existing tests and harness coverage

Current behavior is covered in these areas:

- `packages/godot/tests/` tests deterministic project writing and reference
  checks
- `packages/godot-templates/tests/` tests template manifests and optional real
  Godot execution
- `packages/game-nodes/tests/game-nodes.test.ts` tests the export node, partial
  fills, refresh behavior, outputs, and errors
- `packages/agents/tests/capabilities-godot.test.ts` tests agent export and
  verification
- `packages/protocol` tests the game manifest, slot prompts, and graph builder
- `packages/cli/fixtures/graph-resources/platformer-asset-pack.fake.json` runs a
  graph fixture through project export
- `packages/cli/src/harness/registry.ts` registers the Godot game pipeline
  checks
- `web/src/components/setup/game/__tests__/` tests guided-flow summaries and
  verification reporting

The review should identify which tests remain contract tests, which should be
replaced, and what new end-to-end fixture proves agent-owned source survives
asset updates.

## Likely affected areas

This list is an impact map, not a proposed patch:

| Area                                              | Current role                                               |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `packages/protocol/src/game-assets.ts`            | Template slot and filled-asset contracts                   |
| `packages/godot/`                                 | Pure Godot text-resource writer and checker                |
| `packages/godot-templates/`                       | Shipped starter projects and headless runner               |
| `packages/game-nodes/`                            | Template nodes, fill resolution, project join, export node |
| `packages/agents/src/capabilities/godot*`         | Agent template export and verification tools               |
| `.agents/skills/godot-game/SKILL.md`              | Current template-first agent procedure                     |
| `packages/runtime/src/workspace.ts`               | Local and virtual file interface                           |
| `packages/models/src/{project,workspace}.ts`      | Persistent project and workspace ownership                 |
| `packages/protocol/src/api-schemas/projects.ts`   | Project resources shown in the UI                          |
| `packages/websocket/src/session/chat-turn.ts`     | Project-agent workspace resolution                         |
| `packages/websocket/src/trpc/routers/projects.ts` | Project summaries, tabs, lifecycle                         |
| `web/src/components/setup/game/`                  | Guided game creation and landing state                     |
| `packages/protocol/src/game-graph.ts`             | Current template-slot workflow builder                     |
| `docs/creation-flows/game-prd.md`                 | Current workflow-as-game product decision                  |
| `packages/cli/src/harness/registry.ts`            | Required headless verification surface                     |

## Out of scope for this design question

- choosing a specific game premise, visual style, or shipped template
- improving model-generated sprite quality
- implementing a Godot source editor in the browser
- adding a general Git hosting product
- deciding which platforms NodeTool should export first
- implementing the selected architecture in this document

The design may require Git, a browser editor, or an isolated worker later. If
so, state the dependency and keep the initial interface compatible with it.
