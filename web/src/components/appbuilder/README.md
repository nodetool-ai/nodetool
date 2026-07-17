# App Builder

A WYSIWYG builder (powered by [Puck](https://puckeditor.com)) that turns a
workflow into a reactive, interactive app. It is the structured custom-app path
for Mini App mode.

## Model

Puck owns the layout/document model; a thin reactive layer connects widgets to
the workflow:

- The running app holds a flat **reactive state** dictionary
  (`Record<string, unknown>`).
- Workflow **inputs** are state keys (the input node `name`). Input widgets
  write them; running the workflow feeds them as params.
- Workflow **outputs** stream into state keys (the output node `name`) as the
  graph runs — NodeTool's streaming model drives the UI: `output_update` /
  `chunk` messages land in state and bound widgets re-render live.
- **Variables** (NodeTool `SetVariable` channels) back any other app state.
- **Widgets** bind one state key (read for displays, two-way for inputs) and
  emit **events** (`click` / `change`) that dispatch **actions** (`run`,
  `cancel`, `setState`, `toggleState`).

Bindings always reference something the workflow already declares: inputs bind
to **Input nodes**, displays to **Output nodes**, and other state to
**Variables**. Add the node to the workflow first — there are no free-form keys.

UI is the trigger: a button's click runs the workflow; an input's change can run
it too (reactive "run on change" apps). Eligible graphs run in the browser via
the existing worker path.

## Pieces

- `appData.ts` — storage model: a Puck `Data` document + version. Helpers to
  create / parse / check.
- `persistence.ts` — load/save the document on `workflow.settings` (JSON; no
  backend change).
- `workflowIO.ts` / `workflowState.ts` — a workflow's bindable surface
  (inputs, outputs, variables).
- `runtime/` — `appRuntimeStore` (reactive state), `useAppRuntime` (the engine:
  wires the streaming runner into state, dispatches actions), `AppRuntimeContext`.
- `puck/` — the Puck integration:
  - `config.tsx` — the Puck `Config` (components, root, categories).
  - `widgets.tsx` — widget React components bound to the reactive runtime.
  - `fields.tsx` — custom binding fields (Input/Output/Variable pickers).
  - `useWidgetRuntime.ts` — binds a widget's props to reactive state + events.
  - `BuilderWorkflowContext.tsx` — supplies the bindable surface to fields.
  - `PuckAppEditor.tsx` — the `<Puck>` editor wrapper.
- `AppRuntimeView.tsx` — the live `<Render>` wrapper (used by app mode).
- `AppBuilderPage.tsx` — the `/app-builder/:workflowId` route: fetch, edit, save.

## Agent

The builder embeds the same agent chat the other editors use (`AppBuilderAgentPanel`
→ `ChatView` + `GlobalChatStore`), bound to the workflow's thread. The agent has
**both** tool sets at once because frontend tools are a global registry:

- `ui_app_*` (this folder's `puck/puckAgentBridge.ts` + `lib/tools/builtin/puck.ts`)
  read and edit the open Puck document — add/update/remove/select widgets, set the
  title. The open editor registers a handler (`PuckAgentBinder`, via `usePuck`
  dispatch) that the tools drive.
- `ui_*` (existing workflow tools) edit the graph. `FrontendToolRuntimeSync`
  (shared with the editor's right panel) is mounted here and the page sets the
  current workflow, so adding Input/Output/SetVariable nodes works — which is what
  bindings reference.

So one conversation can add an Input node and bind a control to it, or add a Set
Variable node and wire app state to it.

## Where it shows up

`WorkflowAppView` renders `AppRuntimeView` for every workflow: its saved app
document when present, otherwise a form/results layout generated from the
graph's Input/Output nodes (`generateAppData`). The builder lives at
`/app-builder/:workflowId`; open it from a workflow's View mode with
**App Builder**.
