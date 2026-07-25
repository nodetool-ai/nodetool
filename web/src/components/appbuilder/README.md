# App Builder

A WYSIWYG builder (powered by [Puck](https://puckeditor.com)) that turns a
workflow into a reactive, interactive app. It is the structured custom-app path
for Mini App mode.

## Model

Puck owns the layout; the semantics live in `@nodetool-ai/app-runtime`, the
framework-independent core the web runtime, the CLI `app debug` harness, and the
`app-tools` evals all share.

- An app is an **application document**: a Puck UI document plus typed bindings
  to workflow **operations**, **resources**, and declared **variables**. Nothing
  in the document computes.
- The running app holds **four state namespaces** — `inputs`, `outputs`,
  `variables`, and widget-local `view` — plus the **invocations** it started.
  Inputs and outputs are keyed `operationId:nodeId`, so two operations over the
  same workflow never collide.
- **Run identity**: every streaming message carries a `job_id`. The runtime
  drops any message from a run it did not start, which is what keeps a second
  tab, an overlapping run, or a graph-editor run out of the app's values.
- **Bindings key on node IDs**, never names (`op:main/in:<nodeId>`,
  `op:main/out:<nodeId>`, `var:<id>`, `view:<componentId>#<prop>`). Renaming a
  node in the graph editor does not break an app. Bare names still resolve —
  that is the legacy `app_doc` form and the migration path.
- **Widgets** bind one slot (read for displays, two-way for inputs) and emit
  **events** (`click` / `change`) that dispatch **actions** (`run`, `cancel`,
  `setVariable`, `toggleVariable`, `resourceCommand`, `openResource`).
- **Resource bindings** name a collection (a kind plus a project or a pinned
  id) rather than a document. A picker chooses a member; the chosen
  `ResourceRef` carries the document's `revision`, and the server rejects a
  write whose ref is behind. Entity data is never copied into the app store —
  widgets read it through TanStack Query, and the store holds refs and
  selection only.
- **Logic** is a closed vocabulary: `visibleWhen`, `disabledWhen`, and a
  `format` template (`{binding|number:2}`). Everything else — derived values,
  validation, transformation — is a node in the graph.

Bindings always reference something the workflow already declares: inputs bind
to **Input nodes**, displays to **Output nodes**, and other state to
**Variables**. Add the node to the workflow first — there are no free-form keys.

UI is the trigger: a button's click runs the workflow; an input's change can run
it too (reactive "run on change" apps). Reactive runs traverse `pure` and `read`
nodes only (`NodeMetadata.effect`), so a slider cannot resend an email; anything
else falls back to an explicit full run. Eligible graphs run in the browser via
the existing worker path.

## Pieces

- `appData.ts` — storage model: re-exports the shared `ApplicationDocument`
  parser and the empty-document helpers.
- `persistence.ts` — load/save the document on `workflow.app_doc`.
- Pure edits to the document's operations, variables, and resources, plus the
  bindable-target report the agent reads, live in `@nodetool-ai/app-runtime`
  (`src/doc-ops.ts`) so the editor, the CLI harness, and the eval bridge share
  one implementation.
- `workflowIO.ts` / `workflowState.ts` — a workflow's bindable surface
  (inputs, outputs, variables).
- `runtime/` — `appRuntimeStore` (a Zustand wrapper around the shared reducer,
  one store per app instance), `useAppRuntime` (the engine: claims invocations,
  folds the streaming runner into state, dispatches actions),
  `AppRuntimeContext` (binding resolution, conditions, formatting),
  `buildTriggerSubgraph` (reactive subgraph runs + the effect gate).
- `puck/` — the Puck integration:
  - `config.tsx` — the Puck `Config` (components, root, categories).
  - `widgets.tsx` — widget React components bound to the reactive runtime.
  - `fields.tsx` — custom binding fields (Input/Output/Variable/condition
    pickers), which write bindings in their ID form.
  - `conditionalWidget.tsx` — applies `visibleWhen` / `disabledWhen` / `format`
    to every widget in one place.
  - `ResourcePickerWidget.tsx` — chooses a member of a bound resource
    collection through the `resources` provider router.
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
  author the whole application document, not just its layout:
  - **layout** — add/update/remove/select widgets, set the title.
  - **operations** — `list/add/update/remove_operation`, keyed on input and
    output **node ids**.
  - **variables** — `list/declare/update/remove_variable`, with the
    user-scope-only persist rule enforced by app-runtime's doc-ops.
  - **resources** — `list/add/remove_resource`.
  - **binding inspection** — `ui_app_get_binding_targets` reports every
    bindable slot with both its display name and the ID-form token to store,
    so the agent never has to guess a binding.

  Each open editor registers a handler (`PuckAgentBinder`, via `usePuck`
  dispatch) under its workflow id, and every tool takes a required `workflow_id`
  naming which app to act on. The app document lives on `workflow.app_doc`, so the
  workflow id *is* the app's identity. Puck owns `ui`; `AppBuilderPage` holds the
  operations/variables/resources beside it and saves both together
  (app-runtime's `doc-ops.ts` holds the pure edits).
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

## Publishing

An app's own record (`applications`) carries the document; publishing writes an
immutable `application_versions` snapshot with a capability summary **derived**
from its bindings — the workflows it may invoke and the resource kinds it
touches. Rollback moves the release pointer.

A released app runs on the creator's secrets, so runs are metered. An app run
carries its `application_id` on the run request; the websocket runner checks the
budget before the job is created — refusing with a typed `BUDGET_EXCEEDED` error
rather than letting the run reach a provider — and settles the ledger row from
the run's recorded provider cost when it finishes. An unsettled run keeps
counting at its estimate, so a crash cannot free spend it may already have
incurred, and a budget backend that is unavailable never blocks a run: only an
explicit refusal does. The same ledger is the release telemetry, keyed by
`(applicationId, version, invocationId)`. The pre-run estimate comes from
`estimateWorkflowCost`; nodes it cannot price contribute nothing, so the figure
is a floor — enough to stop an obviously over-budget run, never a reason to
refuse one it cannot price.
