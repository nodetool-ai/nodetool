---
name: api-apps
description: "Call nodetool.apps from a code action: list, read, create and edit mini apps through the App Builder steps, and debug an app's wiring or run it. Load before the first call into nodetool.apps."
---

# nodetool.apps

A mini app is a UI of widgets bound to workflow operations and variables, so
someone can run a task without the graph. How to design one, and every App
Builder tool, is `nodetool-app-builder`. This is the call reference.

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({limit})` | Lists apps, newest first, with their operations. | App rows |
| `get(id)` | Reads the app document: operations, variables and the widget tree. | The document |
| `create(name, {description, project_id, from_workflow_id, document})` | Creates an app. `from_workflow_id` binds its first operation to a workflow. `document` starts from a whole app document. | `{application_id, …}` |
| `edit(id, steps, {name, description, workflow_ids, base_updated_at})` | Applies App Builder steps in order to the saved document, then saves once. | The result of each step and the app state |
| `debug(id, {params, interact, run, timeout_ms, poll})` | Checks every binding and simulates the app. | A pass/fail verdict with issues, and the final state of each widget |

## edit

Each step is `{tool, input}`. `tool` is an App Builder tool name, such as
`ui_app_add_operation` or `ui_app_add_component`. The `ui_app_` prefix may be
left out.

- `edit(id, [])` answers the catalog of every tool with its schema, and the
  current state of the app. Call it first.
- `workflow_ids` loads the bindable surface of workflows the app does not use
  yet, so a widget can bind to one.
- `base_updated_at` refuses the save when the app changed after you read it.

## debug

- `{run: false}` checks the wiring only. It is free and takes milliseconds.
  Run it after every wiring change.
- A full run executes the real workflows and spends real money. Run it to
  confirm that the app works, not to explore.
- `interact` scripts the user actions in order: `{set: {key, value}}`,
  `{click: <widget>}`, `{change: {…}}`, `{run: <operationId>}`,
  `{cancel: <operationId>}`, `{seedResource: {id, items}}`. A widget is named
  by its component id, by a type only one widget has, or by a unique label.
  Without `interact`, the natural run trigger of the app is clicked.
- `poll: true` returns a session id at once for a long run.

```js
const { application_id } = await nodetool.apps.create("Caption maker",
  { from_workflow_id: wfId });
const catalog = await nodetool.apps.edit(application_id, []);
await nodetool.apps.edit(application_id, [
  { tool: "ui_app_add_component", input: { /* from the catalog schema */ } }
]);
const check = await nodetool.apps.debug(application_id, { run: false });
```
