---
layout: page
title: "Mini App Reference"
description: "Every widget, binding, action, condition, and format filter, plus the app document schema."
---

Every part of a Mini App, in tables. For what these things are, read
[Mini Apps](mini-apps.md); for how to put them together, read
[Building Mini Apps](mini-apps-guide.md).

All of it is defined in `packages/app-runtime`, shared by the browser, the
`nodetool app debug` harness, and the test suites — so all three behave the same.

## Widgets

A widget is one thing on the app screen. Every widget can be wired to a value
(`binding`), shown only under a condition (`visibleWhen`), greyed out under a
condition (`disabledWhen`), and reformatted before display (`format`), on top of
its own settings.

### Widgets that show something

| Widget | Shows |
| --- | --- |
| Heading | Fixed text at H1–H3. |
| Text | Fixed or formatted text. |
| Markdown | Rendered Markdown. The right choice for streamed prose. |
| Image | An image. Fit `contain` or `cover`, fixed height, placeholder. |
| Audio | An audio file, with a player. |
| Video | A video, with a player, max height, placeholder. |
| Sketch | A sketch document, layers composited. Max height, optional canvas size. |
| Timeline | A timeline sequence, with its tracks and clips. Max height, optional metadata. |
| JSON | Structured data, formatted. |
| Table | A list, as rows. Max height, placeholder. |
| Output | A value whose type varies; picks a display based on what arrives. |
| Progress | How far along the run is. |

Sketch and Timeline take a document reference — `{type: "sketch", id}` or
`{type: "timeline", id}` — which is what the nodes that produce them emit. They
also accept the document inline, so a node that returns the payload rather than
a saved id renders too. Binding one to Image or Video instead shows nothing: a
reference is not a media URL. On mobile these summarize the document (canvas
size and layer count; duration, tracks, and clips) rather than drawing it.

### Widgets the user changes

"Commits" means the control reports a final value when you let go or click away.
That's what makes on-release pacing possible — see
[Triggers and pacing](#triggers-and-pacing).

| Widget | Takes | Commits |
| --- | --- | --- |
| Workflow Input | Whatever the bound Input node declares, rendered to match. | no |
| Text Input | Text. Single-line or multiline. | yes |
| Number Input | A number. Min, max, step. | yes |
| Slider | A number. Min, max, step. | yes |
| Switch | On or off. | no |
| Select | One option from a fixed list. | no |
| Image Input | An image. | no |
| Sketch Pad | A drawing the user makes on the spot. Canvas size, white or transparent paper. | yes |
| Audio Input | An audio file. | no |
| Video Input | A video. | no |
| Document Input | A document. | no |
| Color Input | A color. | no |
| Resource Picker | Picks which document a resource points at. | no |
| Resource Gallery | The same, from a grid of tiles. Tile size. | no |
| Storyboard Scenes | Edits the bound storyboard directly. Fires no event. | no |

The Sketch Pad is the sketch editor's canvas with a four-tool chrome — brush,
pencil, eraser, fill, plus colors, stroke size, undo and clear. Each finished
stroke flattens the drawing to a PNG and writes it as `{type: "image", uri}`, so
bind it to an Image Input and the workflow reads it the way it reads an upload.
White paper is the default because an image model is fed an opaque picture;
transparent keeps the alpha for a mask or an overlay. Nothing is written until
the user draws, so a pad wired to a run does not fire it on load. The drawing
travels inline as a data URI, so keep the canvas near its 512×384 default
rather than at the 2048px ceiling.

### Chat and AI

| Widget | Does |
| --- | --- |
| Chat Thread | Shows a conversation. `binding` is the conversation (an app variable, or an output that emits messages), `streamBinding` the reply arriving from the current run. Max height, placeholder. |
| Chat Composer | Writes the next message and runs the operation. `binding` is the workflow input it sends to, `historyBinding` the conversation variable it appends to. Sends the message text, a message object, or the whole conversation. Optional image attachments. |
| Model Select | Picks a model and writes its reference. Kind: language, image, video, speech, transcription, or embedding. |

A conversation is a list of `{role, content}` objects. Anything else a binding
holds — a streamed string, a media ref, a list of results — reads as one
assistant turn, so a thread bound straight to an LLM output still renders.

The thread does the bookkeeping a second turn needs: when a run settles, it
folds the streamed reply into the conversation variable. An output slot is
cleared at the start of every run, so a reply left there alone would disappear
the moment the user sends again. This only happens when `binding` is a variable
and `streamBinding` is an output.

### Buttons and layout

| Widget | Does |
| --- | --- |
| Button | Runs its click action. Style `contained`/`outlined`/`text`, color `primary`/`secondary`/`warning`. |
| Panel | A titled box holding other widgets. |
| Columns | Two side-by-side slots, `left` and `right`. |
| Divider | A horizontal line. |

## Bindings

A binding is the string that says what a widget is wired to. You usually pick
these from a menu rather than typing them. They point at node **ids**, so
renaming a node in the graph editor never breaks an app.

| Binding | Points at |
| --- | --- |
| `op:<opId>/in:<nodeId>` | An input of one of the app's workflows. |
| `op:<opId>/out:<nodeId>` | An output of one of the app's workflows. |
| `op:<opId>/prop:<nodeId>#<prop>` | A setting on a node, driven by a widget. |
| `op:<opId>/exec#<field>` | Run status: `running`, `progress`, `error`, `activity`. |
| `var:<variableId>` | A value the app remembers. |
| `view:<componentId>#<prop>` | State belonging to one widget. Never saved. |
| `node:<nodeId>#<prop>` | Old form of a node setting, resolved against the default operation. |
| `<name>` | Old form: a bare node name, looked up in the live graph. |

A bare name is looked up according to how the widget uses it: a widget the user
types into looks for an Input node, a widget that displays looks for an Output
node and then a variable, and a condition or `format` token tries outputs, then
inputs, then variables. A name that matches nothing is an error, not a silent
no-op.

## Actions

A widget event runs one action. Actions are settings the runtime carries out —
there's nowhere to write code.

| Action | Settings | Effect |
| --- | --- | --- |
| `run` | `operationId` | Runs that workflow, following its concurrency rule. |
| `cancel` | `operationId`, optional `invocationId` | Cancels that operation's runs, or one specific run. |
| `setVariable` | `variableId`, and a `value` or the widget's own value | Writes a variable. |
| `toggleVariable` | `variableId` | Flips an on/off variable. |
| `resourceCommand` | `resourceBindingId`, `command` | `read`, `create`, `update`, `delete`, or `upload` on a resource. |
| `openResource` | `resourceBindingId` | Opens that document in its editor. |

The visual editor offers **Run workflow**, **Cancel run**, **Set variable**, and
**Toggle variable**. The resource actions are set through the agent or by editing
the document.

### Triggers and pacing

Events fire on `click` (buttons) or `change` (everything the user edits). A
change event also has a pace, which decides how often it fires while the user is
still editing:

| Pace | Fires |
| --- | --- |
| `live` | On every change. |
| `release` | Once, when the control settles — the slider is let go, the field loses focus. Only offered on controls that commit. |
| `debounce` | Once, after a short pause in editing. |

## Conditions

`visibleWhen` and `disabledWhen` each hold a binding, an operator, and a value to
compare against. A condition whose binding points at nothing is treated as no
condition, so broken wiring never silently hides a widget.

| Operator | Editor label | True when |
| --- | --- | --- |
| `notEmpty` | is not empty | The value is set, non-empty, and not `false`. |
| `empty` | is empty | The value is unset, empty, or `false`. |
| `eq` | equals | Equal, after converting your value to the same type. |
| `neq` | does not equal | Not equal. |
| `gt` / `gte` | is greater than / is at least | Numbers. A non-number never satisfies these. |
| `lt` / `lte` | is less than / is at most | Numbers. |
| `contains` | contains | Text contains the substring, or a list contains the item. |

You always type the comparison value as text, and it's converted to match what
it's compared against — so `count gt "3"` compares numbers and `dark eq "true"`
compares on/off.

## Format templates

`format` replaces `{binding}` tokens with the value, optionally passed through
one filter: `{op:main/out:n1|truncate:80}`. An unknown filter or a binding that
points at nothing renders as nothing.

| Filter | Argument | Result |
| --- | --- | --- |
| `number` | digits | The value as a number, optionally to N decimal places. |
| `date` | `short` | Local date and time, or just the date with `short`. |
| `upper` | — | UPPERCASE. |
| `lower` | — | lowercase. |
| `join` | separator | A list joined into text; defaults to `", "`. |
| `truncate` | length | Cut to N characters, with an ellipsis. |

## Document schema

The rest of this page is the saved shape of an app — useful when editing a
document by hand or reading one the agent wrote.

An app is stored as one `ApplicationDocument`. Version 3 is current; version 1
and 2 documents are upgraded on load, gaining one implicit `main` operation bound
to the workflow they came from.

```ts
interface ApplicationDocument {
  schemaVersion: number;      // 3
  ui: PuckData;               // the layout: { root, content, zones }
  operations: OperationBinding[];
  resources: ResourceBinding[];
  variables: VariableDeclaration[];
  theme?: { id: string };
}
```

### Operations

One operation is one workflow the app can run, plus its wiring.

```ts
interface OperationBinding {
  id: string;
  name: string;
  workflowId: string;
  workflowVersion?: number;   // fixed in a published app, latest in a draft
  inputs: Record<string, InputMapping>;    // keyed by node id
  outputs: Record<string, OutputMapping>;  // keyed by node id
  policy: "parallel" | "replace" | "queue";
  timeoutMs?: number;
}
```

| Input mapping | Where the value comes from |
| --- | --- |
| `{ from: "widget" }` | The widget wired to it. The default when nothing else is set. |
| `{ from: "variable", variableId }` | A value the app remembers. |
| `{ from: "constant", value }` | A fixed value. |
| `{ from: "resource", resourceBindingId }` | Whichever document that resource currently points at. |

| Output mapping | Where the value goes |
| --- | --- |
| `{ to: "display" }` | The slot display widgets read. |
| `{ to: "variable", variableId }` | A variable, *and* the display slot. |

| `policy` | If you start a run while one is already going |
| --- | --- |
| `parallel` | Start anyway. |
| `replace` | Cancel the running one, then start. The default. |
| `queue` | Wait for it to finish, then start. |

Several operations may point at the same workflow with different wiring, and an
app that runs three workflows declares three operations.

### Variables

```ts
interface VariableDeclaration {
  id: string;
  name: string;
  type?: { type: string; optional?: boolean } | null;
  default?: unknown;
  scope: "instance" | "user";  // this open app, or saved per user
  persist: boolean;            // only user-scoped variables may be saved
}
```

The visual editor's variable picker lists the Set Variable channels the graph
publishes. Typed variables with a scope, default, and persistence are declared
through the agent or by editing the document.

### Resources

A resource is a handle to a real document the app may read or edit.

```ts
interface ResourceBinding {
  id: string;
  name: string;
  kind: "asset" | "timeline" | "storyboard" | "sketch";
  scope: { projectId?: string; fixedId?: string };
  operations: ("read" | "create" | "update" | "delete")[];
}
```

## Bundles

A bundle is an app packaged for sharing: the app plus the full graph of every
workflow it runs, in one JSON file. Export, import, and the shipped example apps
all use it.

```ts
interface ApplicationBundle {
  schemaVersion: number;        // 1
  app: ApplicationDocument;     // operations reference workflows[].key
  workflows: { key: string; name: string; graph: Graph }[];
}
```

Inside a bundle, each operation's `workflowId` holds a local nickname (`key`)
instead of a real id. Importing creates the workflows and swaps the nicknames for
the new ids — the same trick `.nodetool` workflow bundles use for their asset
references. A bundle exported from a published app carries the locked-in graphs,
so it reproduces exactly what that release ran.

## What one open app holds

| Group | Keyed by | Holds |
| --- | --- | --- |
| `inputs` | `opId:nodeId`, or `opId:nodeId#prop` | `{ value, dirty, revision }`. `dirty` turns true once a widget rather than a default wrote it. |
| `outputs` | `opId:nodeId` | `{ value, invocationId, status, revision }`. Status is `empty`, `pending`, `streaming`, or `done`. |
| `variables` | variable id | The current value. |
| `view` | `componentId:prop` | State belonging to one widget. |
| `invocations` | job id | `{ id, operationId, status, progress, error, startedAt }`. |

A run's status is `pending`, `running`, `completed`, `failed`, or `cancelled`.
Streamed values accumulate: text is joined, structured items collect into a list.
A message from a job this app didn't start is thrown away.

## Agent tools

The builder agent edits the open app through these tools. Every one takes an
`application_id` — the app's own id, listed in the `ui_context` block. A workflow
id is never accepted; the workflows an app runs are named by
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
npm run dev:nodetool -- app debug <id> --no-run    # check the wiring, don't run
npm run dev:nodetool -- app debug <id> --json      # full report

# Script the clicks and typing
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"prompt","value":"hi"}},{"click":"Button-1"}]'
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"tone","value":"terse","operationId":"draft"}},{"run":"draft"}]'
```

The harness runs every operation the app declares, not just the first. Widgets
are clicked by component id, by type if only one exists, or by label if it's
unique. Results land in `nodetool-debug/app-<id>-<ts>/` as `report.json`,
`report.md`, `app.json`, `workflow.json`, and one
`server/run-N.messages.jsonl` per run.

Not simulated: `visibleWhen`, `disabledWhen`, `format`, and inputs that come from
a resource.

## Related

- [Mini Apps](mini-apps.md) — concepts and runtime
- [Building Mini Apps](mini-apps-guide.md) — recipes per use case
- [App Builder](app-builder.md) — the editor
- [CLI](cli.md) — the full command reference
