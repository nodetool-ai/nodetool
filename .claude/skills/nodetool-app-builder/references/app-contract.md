# Mini app contract

The parts an app is assembled from. Full detail in
[docs/mini-apps-reference.md](../../../../docs/mini-apps-reference.md).

## Tools

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

## Bindings

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

## Actions

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

## Conditions

`visibleWhen` and `disabledWhen` each hold a binding, an operator and a
comparison value typed as text and converted to match. Operators: `notEmpty`,
`empty`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`. A condition whose
binding points at nothing is treated as no condition, so broken wiring never
silently hides a widget.

## Format templates

`format` replaces `{binding}` tokens, optionally through one filter:
`{op:main/out:n1|truncate:80}`. Filters: `number`, `date`, `upper`, `lower`,
`join`, `truncate`. An unknown filter or a dead binding renders as nothing.

## Widgets

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

## Document shape

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

## Runtime state, keyed

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
