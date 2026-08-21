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
  that is the legacy `workflow.app_doc` form, read on import only.
- The **widget catalog** lives in `@nodetool-ai/app-runtime` (`src/widgets.ts`)
  — one table carrying each type's label, binding mode, editor fields, and
  slots, read by the CLI `app debug` harness, the `app-tools` eval bridge (what
  `ui_app_list_component_types` reports headlessly), and the mobile renderer. A
  new widget is added there first, then implemented in `puck/config.tsx` +
  `puck/widgets.tsx` and in `mobile/src/components/app_runtime/widgets.tsx`; a
  type missing from either renderer shows as an unknown widget on that surface.
  The Puck config declares its own fields (it holds the render functions and
  default props), so `puck/__tests__/configCatalog.test.ts` asserts the two
  agree type for type and field for field — that test is what keeps the agent
  from being offered a widget the editor cannot place, or the reverse.
- **Widgets** bind one slot (read for displays, two-way for inputs) and emit
  **events** (`click` / `change`) that dispatch **actions** (`run`, `cancel`,
  `setVariable`, `toggleVariable`, `resourceCommand`, `openResource`). A `run`
  names its operation; the runtime runs **that** operation's workflow, fetching
  it when it is not the one the view already holds.
- **Operation outputs land in two places**: the display slot a widget reads and,
  when the operation maps the output `to: "variable"`, an app variable. That is
  how one operation hands a value to the next without a procedure language.
- **Run policy** (`replace` / `queue` / `parallel`) decides what a second run
  means while one is in flight: cancel the live one, wait for it, or ask the
  server for a concurrent slot. `timeoutMs` fails the invocation when it
  elapses.
- **Variables** start from their declared `default`. A `user`-scoped variable
  with `persist: true` survives a reload (`localStorage`, keyed by application
  or workflow id); `instance` variables and widget-local `view` state do not.
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
- Pure edits to the document's operations, variables, and resources, plus the
  bindable-target report the agent reads, live in `@nodetool-ai/app-runtime`
  (`src/doc-ops.ts`) so the editor, the CLI harness, and the eval bridge share
  one implementation.
- `workflowIO.ts` / `workflowState.ts` — a workflow's bindable surface
  (inputs, outputs, variables).
- `appThemes.ts` — the named-theme registry `ApplicationDocument.theme`
  resolves against. A theme decides how the page is presented (surface, content
  width, framing); widget styling stays with the widgets and the design tokens.
- `runtime/variablePersistence.ts` — `localStorage` for user-scoped variables
  declared `persist: true`, keyed by application or workflow id.
- `runtime/` — `appRuntimeStore` (a Zustand wrapper around the shared reducer,
  one store per app instance), `useAppRuntime` (the engine: resolves each
  operation's workflow and runner, claims invocations, folds the streaming
  runner into state, dispatches actions under the operation's run policy),
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
- `AppDataPanel.tsx` — the operations/variables/resources editor that docks
  beside the canvas (the **App Data** toggle in the editor header). Every edit
  goes through app-runtime's `doc-ops`, the same pure functions the agent's
  `ui_app_*` tools call, so hand edits and agent edits produce identical
  documents.
- `AppBuilderShell.tsx` — the editing surface, independent of storage: it seeds
  Puck from a document, holds the operations/resources/variables beside it, and
  emits the **whole** document on save. Below 638px — where Puck folds its
  header actions into a chevron menu — the App Data panel covers the canvas
  instead of docking beside it. The assistant docks on `ApplicationSurface`,
  so it stays on the right in Design, Run, and Settings.
- `ApplicationAppBuilder.tsx` — the container over an `applications` record:
  loads with `applications.get`, saves with `applications.update` carrying
  `baseUpdatedAt`. A lost compare-and-swap raises an alert and a banner with a
  Reload action; the canvas is never refetched out from under the user. It is
  the only container — an app document has one home, the `applications` table.

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
  dispatch) under its application id, and every tool takes a required
  `application_id` naming which app to act on. An app is its own resource, so
  the application id is its identity; `target_workflow_id` on the operation
  tools names a workflow the app *runs*. Puck owns `ui`; the app tab's Design
  view holds the operations/variables/resources beside it and saves both
  together (app-runtime's `doc-ops.ts` holds the pure edits).
- `ui_*` (existing workflow tools) edit the graph. `FrontendToolRuntimeSync`
  (shared with the editor's right panel) is mounted here and the page sets the
  current workflow, so adding Input/Output/SetVariable nodes works — which is what
  bindings reference.

So one conversation can add an Input node and bind a control to it, or add a Set
Variable node and wire app state to it.

## Where it shows up

Apps are opened from the **Apps** panel in the left sidebar — the only entry
point. "New app" starts an empty one; "Create app from workflow" scaffolds a
one-way copy bound to that workflow. Each opens one `application` workspace
tab. A workflow never presents itself as an app, and there is no route keyed by
workflow id: `/miniapp/:workflowId` survives only as a legacy redirect
(`components/applications/LegacyAppRedirect.tsx`) that resolves to the app
binding that workflow, or 404s.

There is no Generate-from-workflow button any more: nothing auto-fills a
canvas with a widget per workflow input and output. An empty app starts empty,
and the assistant panel — reachable with or without a workflow bound — is what
builds it.

The mobile app renders the same documents natively (`mobile/src/components/app_runtime/`)
on top of the same `@nodetool-ai/app-runtime` core — it runs apps, it does not
edit them.

An app with its own record opens in the workspace: the app library's tab renders
`ApplicationSurface`, whose **Design** view is the builder canvas, whose **Run**
view is `ApplicationRunView`, and whose **Settings** view is publishing,
budgets, and telemetry. The Run view renders the **released** snapshot — its
document and the workflow graphs the release pinned — falling back to the draft
only while nothing is published.

## Publishing

An app's own record (`applications`) carries the document; publishing writes an
immutable `application_versions` snapshot with a capability summary **derived**
from its bindings — the workflows it may invoke and the resource kinds it
touches. Rollback moves the release pointer.

A release is **pinned**, not a copy of a moving target. Publishing freezes each
operation's workflow twice over: it writes a row in that workflow's own version
history and records the number on the snapshot's `workflowVersion`, and it
copies the graph JSON plus a sha256 onto the release itself, so the snapshot
survives the version row being pruned or the workflow deleted. Editing the
workflow afterwards moves the draft only. Publishing an operation whose workflow
is missing throws rather than shipping a release that references nothing.

Running one is the **Run** view in `ApplicationSurface`, which reads
`applications.releasedDocument` and hands the pinned graphs to the runtime as
workflow overrides — a release runs the graphs it froze, not whatever the
workflow says today. With nothing released the view falls back to the draft and
says so.

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
