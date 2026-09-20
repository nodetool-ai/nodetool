---
name: nodetool-app-builder
description: "Build or repair a NodeTool mini app: operations, widgets, bindings, variables, resources. Use when the deliverable is a screen a person runs, not a graph."
---

# Build NodeTool mini apps

A mini app is a screen over one or more workflows: widgets bound to Input and
Output nodes, a run trigger, and the variables that hold what the app remembers.
The graph stays the graph. The app is a second document (`ApplicationDocument`)
that names it.

Use this skill when the user wants something to click. Use
`nodetool-workflow-builder` when the deliverable is the graph itself, and fix
the graph there first: an app over a broken workflow only reports that the app
is broken.

## The workflow decides what the app can do

Before placing a widget, confirm the bound workflow satisfies all four. Each one
is a wiring failure the app surface cannot work around.

1. Anything the user changes needs an **Input node**. The exception is a node
   setting, reachable through an `op:<id>/prop:<nodeId>#<prop>` binding.
2. Anything the user sees needs an **Output node**. A graph that ends without
   one produces nothing an app can display.
3. Every input needs a default, so the first run is one click.
4. Run the workflow on its own first (`nodetool debug`, or `run_workflow`).

## The loop

1. **Find or create the app.** `list_apps`, then `get_app`. New app:
   `create_app {name, description, project_id?, from_workflow_id?}`.
   `from_workflow_id` binds the first operation, so there is something to run
   the moment a widget lands.
2. **Read the editor.** `edit_app {application_id, steps: []}` with no steps
   returns the tool catalog and the app's current state. Do this before the
   first edit in a session rather than guessing a schema.
3. **Declare the operations.** One operation is one workflow plus its wiring
   (`ui_app_add_operation`). An app with several modes has several operations,
   each with its own state.
4. **Read the bindable surface.** `ui_app_get_binding_targets` lists the inputs,
   outputs, node settings and variables that exist. Bindings point at node
   **ids**, so a rename in the graph editor never breaks the app. Never invent a
   binding string.
5. **Place and wire the widgets.** `ui_app_add_component` /
   `ui_app_update_component`, plus `ui_app_declare_variable` for anything the
   app remembers and `ui_app_add_resource` for a document it reads or edits.
   Read **Mini app contract** below for the widget catalog, binding forms,
   actions, conditions and format filters.
6. **Check the wiring.** `debug_app {application_id, run: false}`. Free,
   instant, and the only thing that catches a binding pointing at nothing. Run
   it after every edit pass.
7. **Run it.** `debug_app {application_id, interact: [...]}` executes the real
   workflows and spends real money. Run it to confirm the app works, not to
   explore. A long run takes minutes: pass `poll: true` for a session id and
   read `GET /api/debug/sessions/<id>` until it settles.
8. **Report** the app id, its operations, and the verdict. Do not claim an app
   works on a `run: false` check alone.

`edit_app` applies its steps in order against the saved document and writes once
at the end. Pass `base_updated_at` to refuse the save if the app changed
underneath. With the app open in a browser, the same tools are callable directly
as `ui_app_*` against the live document.

## Four verdict failures that are not about the graph

`debug_app` reports these, and each one is an app-layer mistake with a fixed
remedy.

| Verdict | What it means | Fix |
|---|---|---|
| Binding references a missing input/output/variable | The widget points at a node the workflow no longer has | Re-read `ui_app_get_binding_targets` and rebind |
| No run trigger | Nothing in the app can start an operation | Add a Button with a `run` action, or a change event |
| Display widget never receives a value | The bound output produced nothing on a completed run | Check the Output node is connected in the graph |
| Output mapped to an undeclared variable | An operation writes a variable that does not exist | `ui_app_declare_variable` first |

## Three warnings that only bite a real user

Structural checks pass and the app still fails the person using it. Fix these
before handing an app over.

- **A run button with no `disabledWhen` on `op:<id>/exec#running`.** No policy
  refuses the second click, so the user drives a race: the run is cancelled and
  restarted, stacked, or started alongside, depending on the operation's
  concurrency rule.
- **An operation with nothing bound to `exec#error`.** The run fails and the app
  looks idle. Bind a Text or Markdown widget to the error field.
- **A media input widget with no default behind an unguarded run trigger.**
  Image, Sketch Pad, Camera Capture, Audio, Audio Recorder, Video and Document
  all let the run start with the input unset, which is a paid call the user
  never got to fill in. Guard the trigger with a `notEmpty` condition. A
  Workflow Form is exempt: it renders every input of its operation, so there is
  no single binding to guard.

## What the headless check does not simulate

Layout, styling, focus and scroll. Stored resource collections: a run never
reads the database, so seed one with `{"seedResource": {"id": "<binding>",
"items": [...]}}` as an interaction step or a `resource:<binding>` key in
`params`. `openResource` has no editor to open. The report lists all of this
under `notSimulated` — read it before reporting a green verdict.

## Shipping

- `nodetool apps export-bundle <id> -o my.app.json` packages the app plus the
  full graph of every workflow it binds. `apps import-bundle` recreates both and
  rewrites the bundle-local workflow keys to real ids.
- **Publish** takes a snapshot: it saves the current screen as a version and
  locks in the current graph of every workflow the app runs, so a released app
  keeps working while the drafts keep moving. A spending limit caps what it may
  cost, and every run counts against it (`applications.publish`, `released`,
  `budget`, `usage` on tRPC).
- Shipped examples: `GET /api/applications/examples`, installed with
  `POST /api/applications/examples/:slug/install`.
- `nodetool app build "<prompt>" -p <provider> -m <model>` runs the whole
  spec → plan → author → check → run → judge loop and emits a verified bundle.
  It is a batch build for the CLI and the eval suite. **There is no `build_app`
  agent tool**: an agent builds an app the way a person does, with `create_app`,
  `edit_app` and `debug_app`.

## Reference

**Mini app contract** below carries the widgets, bindings, actions,
conditions, format filters and document shape.

In a NodeTool checkout, these repository sources go further:

- `docs/mini-apps-guide.md` — eleven worked recipes, from a one-shot form to a
  chat app.
- `docs/mini-apps-reference.md` — every widget and setting in full.
- `docs/harnesses.md` § nodetool app debug — the harness, its bundle layout,
  and the build loop.

## Mini app contract

The parts an app is assembled from. A checkout's
`docs/mini-apps-reference.md` carries every widget and setting in full.

### Tools

Every tool takes `application_id`. A workflow id is never accepted: the
workflows an app runs are named by `target_workflow_id` on its operations.

| Area | Tools |
|---|---|
| Layout | `ui_app_get_snapshot`, `ui_app_list_component_types`, `ui_app_add_component`, `ui_app_update_component`, `ui_app_remove_component`, `ui_app_select_component`, `ui_app_set_title` |
| Operations | `ui_app_list_operations`, `ui_app_add_operation`, `ui_app_update_operation`, `ui_app_remove_operation` |
| Variables | `ui_app_list_variables`, `ui_app_declare_variable`, `ui_app_update_variable`, `ui_app_remove_variable` |
| Resources | `ui_app_list_resources`, `ui_app_add_resource`, `ui_app_remove_resource` |
| Bindings | `ui_app_get_binding_targets` |

Headless, each is a step in `edit_app {application_id, steps: [{tool, input}]}`.
The `ui_app_` prefix is optional in a step. With the app open in a browser they
are callable directly.

### Bindings

| Binding | Points at |
|---|---|
| `op:<opId>/in:<nodeId>` | An input of one of the app's workflows |
| `op:<opId>/out:<nodeId>` | An output of one of the app's workflows |
| `op:<opId>/prop:<nodeId>#<prop>` | A node setting, driven by a widget |
| `op:<opId>/exec#<field>` | Run status: `running`, `progress`, `error`, `activity` |
| `var:<variableId>` | A value the app remembers |
| `view:<componentId>#<prop>` | State belonging to one widget, never saved |

Two legacy forms still resolve: `node:<nodeId>#<prop>` against the default
operation, and a bare name looked up in the live graph. A name matching nothing
is an error, not a silent no-op. Prefer the id forms for anything new.

### Actions

A widget event runs one action. There is nowhere to write code.

| Action | Settings |
|---|---|
| `run` | `operationId` |
| `cancel` | `operationId`, optional `invocationId` |
| `setVariable` | `variableId`, and a `value` or the widget's own value |
| `toggleVariable` | `variableId` |
| `resourceCommand` | `resourceBindingId`, `command`: `read`, `create`, `update`, `delete`, `upload` |
| `openResource` | `resourceBindingId` |

Events fire on `click` (buttons) or `change` (everything the user edits). A
change event has a pace: `live`, `release` (only on controls that commit), or
`debounce`.

### Conditions

`visibleWhen` and `disabledWhen` each hold a binding, an operator and a
comparison value typed as text and converted to match. Operators: `notEmpty`,
`empty`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`. A condition whose
binding points at nothing is treated as no condition, so broken wiring never
silently hides a widget.

### Format templates

`format` replaces `{binding}` tokens, optionally through one filter:
`{op:main/out:n1|truncate:80}`. Filters: `number`, `date`, `upper`, `lower`,
`join`, `truncate`. An unknown filter or a dead binding renders as nothing.

### Widgets

**Show something:** Heading, Text, Markdown (the right choice for streamed
prose), Image, Audio, Video, Sketch, Timeline, JSON, Table, Output, Progress,
Gallery, Image Compare.

Sketch and Timeline take a document reference, `{type: "sketch", id}` or
`{type: "timeline", id}`, which is what the nodes producing them emit. Binding
one to Image or Video shows nothing: a reference is not a media URL.

**Take input:** Workflow Form, Workflow Input, Text Input, Number Input, Slider,
Switch, Select, Image Input, Sketch Pad, Audio Input, Audio Recorder, Video
Input, Camera Capture, Document Input, Color Input, Resource Picker, Resource
Gallery, Storyboard Scenes.

A Workflow Form renders every input of one operation in graph order, so an Input
node added later shows up with no app edit. Place inputs one by one when the
layout matters. Audio Recorder and Camera Capture write the same
`{type, uri, asset_id}` ref an upload writes. The Sketch Pad flattens each
stroke to a PNG travelling inline as a data URI, so keep it near its 512×384
default rather than the 2048px ceiling.

**Chat:** Chat Thread (`binding` is the conversation, `streamBinding` the reply
arriving from the current run), Chat Composer, Model Select. The thread folds a
settled reply into the conversation variable, which only happens when `binding`
is a variable and `streamBinding` is an output.

**Buttons and layout:** Button, Panel, Columns (`left` and `right` slots),
Divider.

### Document shape

```ts
interface ApplicationDocument {
  schemaVersion: number;      // 3
  ui: PuckData;               // { root, content, zones }
  operations: OperationBinding[];
  resources: ResourceBinding[];
  variables: VariableDeclaration[];
  theme?: { id: string };
}
```

A resource is a handle to a real document the app may read or edit:
`{id, name, kind: "asset" | "timeline" | "storyboard" | "sketch", scope, operations}`.

A bundle is the app plus the full graph of every workflow it runs, with each
operation's `workflowId` holding a bundle-local key that import swaps for a real
id.

### Runtime state, keyed

| Group | Keyed by | Holds |
|---|---|---|
| `inputs` | `opId:nodeId`, or `opId:nodeId#prop` | `{value, dirty, revision}` |
| `outputs` | `opId:nodeId` | `{value, invocationId, status, revision}` |
| `variables` | variable id | The current value |
| `view` | `componentId:prop` | One widget's own state |
| `invocations` | job id | `{id, operationId, status, progress, error, startedAt}` |

Output status is `empty`, `pending`, `streaming` or `done`. Streamed values
accumulate: text joins, structured items collect into a list. An output slot is
cleared at the start of every run.
