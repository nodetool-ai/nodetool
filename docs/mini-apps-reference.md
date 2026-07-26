---
layout: page
title: "Mini App Reference"
description: "Widget catalog, binding grammar, actions, conditions, format filters, and the app document schema."
---

The complete surface of the Mini App layer. For what these mean, see
[Mini Apps](mini-apps.md); for how to combine them, see
[Building Mini Apps](mini-apps-guide.md).

Everything here is defined in `packages/app-runtime`, which the web runtime, the
`nodetool app debug` harness, and the eval suites all share.

## Widgets

Every widget accepts `binding`, `visibleWhen`, `disabledWhen`, and `format` on
top of its own fields.

### Display

| Widget | Shows |
| --- | --- |
| Heading | Static text at H1–H3. |
| Text | Static or formatted text. |
| Markdown | Rendered Markdown. The right choice for streamed prose. |
| Image | An image value. Fit `contain` or `cover`, fixed height, placeholder. |
| Audio | An audio value with a player. |
| Video | A video value with a player, max height, placeholder. |
| JSON | A structured value, formatted. |
| Table | An array value as rows. Max height, placeholder. |
| Output | A value whose type varies; renders by shape. |
| Progress | The bound operation's progress. |

### Inputs

| Widget | Writes | Commits |
| --- | --- | --- |
| Workflow Input | The bound Input node, rendered from its declared type. | no |
| Text Input | Text. Single-line or multiline. | yes |
| Number Input | A number. Min, max, step. | yes |
| Slider | A number. Min, max, step. | yes |
| Switch | A boolean. | no |
| Select | One of a fixed option list. | no |
| Image Input | An image. | no |
| Audio Input | An audio file. | no |
| Video Input | A video file. | no |
| Document Input | A document. | no |
| Color Input | A color. | no |
| Resource Picker | The selected resource of a resource binding. | no |
| Resource Gallery | The selected resource, from a grid. Tile size. | no |
| Storyboard Scenes | Edits the bound storyboard through the resource provider. Fires no event. | no |

"Commits" means the control reports a settled value on release or blur, which is
what makes `release` pacing meaningful.

### Actions and layout

| Widget | Does |
| --- | --- |
| Button | Fires its click events. Variant `contained`/`outlined`/`text`, color `primary`/`secondary`/`warning`. |
| Panel | A titled container holding other widgets. |
| Columns | Two slots, `left` and `right`. |
| Divider | A horizontal rule. |

## Binding grammar

A binding is one string. Bindings key on node **IDs**, so renaming a node in the
graph editor never breaks an app.

| Token | Addresses |
| --- | --- |
| `op:<opId>/in:<nodeId>` | An operation input. |
| `op:<opId>/out:<nodeId>` | An operation output. |
| `op:<opId>/prop:<nodeId>#<prop>` | A node property driven by a widget. |
| `op:<opId>/exec#<field>` | Execution state: `running`, `progress`, `error`, `activity`. |
| `var:<variableId>` | A declared app variable. |
| `view:<componentId>#<prop>` | Widget-local state. Never persisted. |
| `node:<nodeId>#<prop>` | Legacy node property, resolved against the default operation. |
| `<name>` | Legacy bare name, resolved against the live graph. |

A bare name resolves by how the widget uses it: a write widget looks for an
Input node, a read widget looks for an Output node and then a variable, and a
condition or `format` token tries outputs, then inputs, then variables. A name
that matches nothing is a validation error, not a silent no-op.

## Actions

A widget event dispatches one action. Actions are data the runtime interprets.

| Action | Fields | Effect |
| --- | --- | --- |
| `run` | `operationId` | Runs the operation, subject to its policy. |
| `cancel` | `operationId`, optional `invocationId` | Cancels the operation's live runs, or one specific run. |
| `setVariable` | `variableId`, `value` or the firing widget's value | Writes a variable. |
| `toggleVariable` | `variableId` | Inverts a boolean variable. |
| `resourceCommand` | `resourceBindingId`, `command` | `read`, `create`, `update`, `delete`, or `upload` on a resource binding. |
| `openResource` | `resourceBindingId` | Opens the bound resource in its editor. |

The visual editor exposes **Run workflow**, **Cancel run**, **Set variable**,
and **Toggle variable**. The resource actions are set through the agent or by
editing the document.

### Triggers and pacing

Events fire on `click` (Button) or `change` (input widgets). A change event has a
pace:

| Pace | Fires |
| --- | --- |
| `live` | On every change. |
| `release` | When the control commits — slider release, input blur. Only offered on committing controls. |
| `debounce` | Trailing, after a quiet moment. |

## Conditions

`visibleWhen` and `disabledWhen` each hold a binding, an operator, and a
literal. An unresolvable condition is treated as no condition, so a broken
binding never silently hides a widget.

| Operator | Editor label | True when |
| --- | --- | --- |
| `notEmpty` | is not empty | The value is set, non-empty, and not `false`. |
| `empty` | is empty | The value is unset, empty, or `false`. |
| `eq` | equals | Equal, after coercing the literal to the value's type. |
| `neq` | does not equal | Not equal. |
| `gt` / `gte` | is greater than / is at least | Numeric comparison. A non-numeric value never satisfies one. |
| `lt` / `lte` | is less than / is at most | Numeric comparison. |
| `contains` | contains | A string contains the substring, or an array contains the item. |

Literals are stored as strings and coerced to the shape of the value they are
compared against, so `count gt "3"` compares numbers and `dark eq "true"`
compares booleans.

## Format templates

`format` renders `{binding}` tokens in place of the raw value, with one optional
filter: `{op:main/out:n1|truncate:80}`. An unknown filter or unresolvable
binding renders as the empty string.

| Filter | Argument | Result |
| --- | --- | --- |
| `number` | digits | The value as a number, optionally fixed to N digits. |
| `date` | `short` | Locale date-time, or locale date with `short`. |
| `upper` | — | Uppercased. |
| `lower` | — | Lowercased. |
| `join` | separator | An array joined; defaults to `", "`. |
| `truncate` | length | Cut to N characters with an ellipsis. |

## Document schema

An application row holds one `ApplicationDocument` in its `document` column.
Schema version 3 is current; version 1 and 2 documents are lifted to 3 on load,
with one implicit `main` operation bound to the workflow they came from.

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

### Operations

```ts
interface OperationBinding {
  id: string;
  name: string;
  workflowId: string;
  workflowVersion?: number;   // pinned in a release, floating in a draft
  inputs: Record<string, InputMapping>;    // keyed by node id
  outputs: Record<string, OutputMapping>;  // keyed by node id
  policy: "parallel" | "replace" | "queue";
  timeoutMs?: number;
}
```

| Input mapping | Value comes from |
| --- | --- |
| `{ from: "widget" }` | The bound widget. The default when an input has no mapping. |
| `{ from: "variable", variableId }` | An app variable. |
| `{ from: "constant", value }` | A fixed value. |
| `{ from: "resource", resourceBindingId }` | The resource currently selected for that binding. |

| Output mapping | Value goes to |
| --- | --- |
| `{ to: "display" }` | The output slot display widgets read. |
| `{ to: "variable", variableId }` | An app variable, *and* the display slot. |

| Policy | On a second run while one is live |
| --- | --- |
| `parallel` | Start anyway. |
| `replace` | Cancel the live runs, then start. The default. |
| `queue` | Wait for them to settle, then start. |

An operation's `workflowId` points at a workflow the app binds. Several
operations may point at the same one with different mappings, and an app that
binds three workflows declares three operations.

### Variables

```ts
interface VariableDeclaration {
  id: string;
  name: string;
  type?: { type: string; optional?: boolean } | null;
  default?: unknown;
  scope: "instance" | "user";  // this open app, or persisted per user
  persist: boolean;            // only user-scoped variables may persist
}
```

The visual editor's variable picker lists the Set Variable channels the graph
publishes. Typed variables with a scope, default, and persistence are declared
through the agent or by editing the document.

### Resources

```ts
interface ResourceBinding {
  id: string;
  name: string;
  kind: "asset" | "timeline" | "storyboard" | "sketch";
  scope: { projectId?: string; fixedId?: string };
  operations: ("read" | "create" | "update" | "delete")[];
}
```

## ApplicationBundle

The portable form of an app: the document plus the full graph of every workflow
it binds, in one JSON file. Export, import, and the shipped example apps all use
it.

```ts
interface ApplicationBundle {
  schemaVersion: number;        // 1
  app: ApplicationDocument;     // operations reference workflows[].key
  workflows: { key: string; name: string; graph: Graph }[];
}
```

Inside a bundle each `OperationBinding.workflowId` holds a bundle-local `key`
rather than a real id. Import creates the workflows and rewrites the keys to the
new ids, the same indirection `.nodetool` workflow bundles use for `bundle://`
asset refs. A bundle exported from a released app carries the pinned graphs, so
it reproduces what that release ran.

## Instance state

| Namespace | Key | Holds |
| --- | --- | --- |
| `inputs` | `opId:nodeId`, or `opId:nodeId#prop` | `{ value, dirty, revision }`. `dirty` is true once a widget rather than a default wrote it. |
| `outputs` | `opId:nodeId` | `{ value, invocationId, status, revision }`. Status is `empty`, `pending`, `streaming`, or `done`. |
| `variables` | variable id | The current value. |
| `view` | `componentId:prop` | Widget-local state. |
| `invocations` | job id | `{ id, operationId, status, progress, error, startedAt }`. |

Invocation status is `pending`, `running`, `completed`, `failed`, or
`cancelled`. Streamed values append: strings concatenate, structured items
collect into a list. A message whose `job_id` this instance did not start is
dropped.

## Agent tools

The builder agent edits the open document through these frontend tools. Every
one takes an `application_id` — the app's own id, listed in the `ui_context`
block. A workflow id is never accepted; the workflows an app runs are named by
`target_workflow_id` on its operations.

| Area | Tools |
| --- | --- |
| Layout | `ui_app_get_snapshot`, `ui_app_list_component_types`, `ui_app_add_component`, `ui_app_update_component`, `ui_app_remove_component`, `ui_app_select_component`, `ui_app_set_title` |
| Operations | `ui_app_list_operations`, `ui_app_add_operation`, `ui_app_update_operation`, `ui_app_remove_operation` |
| Variables | `ui_app_list_variables`, `ui_app_declare_variable`, `ui_app_update_variable`, `ui_app_remove_variable` |
| Resources | `ui_app_list_resources`, `ui_app_add_resource`, `ui_app_remove_resource` |
| Bindings | `ui_app_get_binding_targets` |

## CLI

```bash
npm run dev:nodetool -- app debug <application_id>
npm run dev:nodetool -- app debug my-app.json --params '{"prompt":"hi"}'
npm run dev:nodetool -- app debug <id> --no-run    # static wiring check
npm run dev:nodetool -- app debug <id> --json      # full AppDebugReport

# Scripted interactions
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"prompt","value":"hi"}},{"click":"Button-1"}]'
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"tone","value":"terse","operationId":"draft"}},{"run":"draft"}]'
```

The harness runs every declared operation, not only the first. Widgets are
clicked by component id, unique type, or unique label. The bundle lands in
`nodetool-debug/app-<id>-<ts>/` with `report.json`, `report.md`, `app.json`,
`workflow.json`, and one `server/run-N.messages.jsonl` per triggered run.

Not simulated: `visibleWhen`, `disabledWhen`, `format`, and `from: "resource"`
inputs.

## Related

- [Mini Apps](mini-apps.md) — concepts and runtime
- [Building Mini Apps](mini-apps-guide.md) — recipes per use case
- [App Builder](app-builder.md) — the editor
- [CLI](cli.md) — the full command reference
