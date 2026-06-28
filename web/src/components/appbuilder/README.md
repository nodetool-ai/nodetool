# App Builder

A WYSIWYG builder that turns a workflow into a reactive, interactive app. It is
the structured successor to the basic inputs-form app mode and the freeform
`html_app` (VibeCoding) UI.

## Model

The app is reactive and event-driven:

- The running app holds a flat **state** dictionary (`Record<string, unknown>`).
- Workflow **inputs** are state keys (keyed by the input node `name`). Input
  widgets write them.
- Workflow **outputs** stream into state keys (keyed by the output node `name`)
  as the graph runs. This is where NodeTool's streaming model drives the UI:
  `output_update` / `chunk` messages land in state and bound widgets re-render
  live.
- **Widgets** bind one state key (read for displays, two-way for inputs) and
  emit **events** (`click` / `change`) that dispatch **actions**
  (`run`, `cancel`, `setState`, `toggleState`).

UI is the trigger: a button's click runs the workflow; an input's change can run
it too (reactive "run on change" apps). Eligible graphs run in the browser via
the existing worker path — no server round-trip.

## Pieces

- `appSchema.ts` — `AppSpec` / `Widget` / `AppAction` types, validation, defaults.
- `persistence.ts` — load/save the spec on `workflow.settings` (JSON string under
  a reserved key; no backend change).
- `workflowIO.ts` — extract a workflow's bindable inputs and outputs.
- `runtime/` — `appRuntimeStore` (reactive state), `useAppRuntime` (the engine:
  wires the streaming runner into state, dispatches actions), `AppRuntimeContext`.
- `widgets/` — `WidgetDefinition` interface, the registry, and the widget library.
- `RuntimeWidget.tsx` / `AppRuntimeView.tsx` — render a spec live and reactively.
- `editor/` — the WYSIWYG surface: palette, drag/resize grid canvas, inspector
  (props / binding / events). `AppBuilder.tsx` is the shell; `AppBuilderPage.tsx`
  is the route that fetches the workflow, hosts it, and saves.
- `../../stores/AppBuilderStore.ts` — editor state with undo/redo.

## Where it shows up

`MiniAppPage` renders `AppRuntimeView` when the workflow has a spec (priority:
app spec → `html_app` → default form). The builder lives at its own route,
`/app-builder/:workflowId`; open it from the app-mode side panel ("App Builder").
