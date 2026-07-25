# Mini-App Platform: The Graph Is the Only Program

Status: proposal. Companion to the "NodeTool Mini-App Platform Architecture" doc
(Google Drive); this spec is the simplified alternative ("Plan B") that keeps
the Application entity, typed bindings, invocation identity, resource
unification, and publishing — and removes the proposed expression/procedure/
script language stack.

## One-sentence design

An application is a UI document plus typed bindings to workflow operations and
resources; all computation and orchestration stay in workflow graphs, and the
only logic the UI layer holds is closed-vocabulary widget props.

## Why this shape

The current Mini-App builder (`web/src/components/appbuilder/`, ~4,900
production lines) has four real problems:

1. **Runs contaminate each other.** `OutputUpdate`, `NodeUpdate`,
   `NodeProgress`, and `Chunk` in `packages/protocol/src/messages.ts` carry
   `workflow_id` + node identity but no `job_id`. Overlapping runs, second
   tabs, and graph-editor runs all fold into the same values.
2. **Renames break apps.** Input/Output/SetVariable bindings use node *names*
   (`web/src/components/appbuilder/workflowIO.ts`). The ID-based form
   (`node:<nodeId>#<prop>`, `nodeBinding.ts`) already exists but covers only
   node-property bindings.
3. **One app = one workflow.** `workflow.app_doc` makes the workflow ID the app
   identity. An app cannot expose two operations, and the app document is
   excluded from `workflow_versions` (graph only), so it has no history.
4. **Sharing is unsafe.** Secrets resolve per owner `user_id`
   (`packages/models/src/secret-helper.ts`); there is no run-as mechanism and
   no spend enforcement, only per-prediction cost *recording*.

None of these problems require a new programming language. The larger
architecture doc proposes three (a restricted expression language, a
declarative procedure language, and sandboxed scripts) plus a transactional
command bus — while its own non-goals section says the Mini-App layer must not
become a second programming environment. This spec takes that guardrail
literally.

The binding constraint is agent authorability. Every authoring concept must be
covered by agent tools and eval suites (`packages/agents/src/evals/`:
`app-tools`, `graph-planner`, …). Two authoring surfaces the agent already
knows — the graph and the UI document — beat five it half-knows.

Orchestration already has a home: `WorkflowNode`
(`packages/core-nodes/src/nodes/workflow.ts`) runs a sub-workflow with dynamic
inputs/outputs on a child `WorkflowRunner`. A multi-step app flow is a workflow
that calls workflows, and it gets the graph editor, validator, `nodetool
debug`, agent tools, and (future) effect gating for free.

## Core concepts

Exactly four things are authorable at the app layer:

| Concept | What it is | Programmable? |
|---|---|---|
| UI document | Puck layout + widget configuration | No — declarative props only |
| Operation binding | Named, typed reference to a workflow | No — configuration |
| Resource binding | Named, scoped reference to a resource collection | No — configuration |
| Variable | Declared, typed app state slot | No — written by widgets and operation outputs |

Everything that computes, branches, loops, calls providers, or touches
external systems is a workflow graph.

### Application entity

Follow the sibling-editor pattern (`timeline_sequences`, `storyboards`,
`image_documents`: entity table + JSON `document` column + tRPC router +
per-instance web store + agent bridge).

Table names follow the sibling tables' unprefixed convention (`storyboards`,
`timeline_sequences`), not the older `nodetool_`-prefixed one.

```
applications
  id            text pk
  user_id       text
  project_id    text          -- project-scoped, like storyboards
  name          text
  description   text
  document      text (json)   -- ApplicationDocument, schema-versioned
  created_at / updated_at

application_versions
  id             text pk
  application_id text
  version        integer       -- monotonic per application
  document       text (json)   -- immutable snapshot: UI doc + bindings +
                               -- variables + pinned workflow versions
  released       integer (bool)
  created_at
```

`ApplicationDocument` (the draft) is:

```ts
interface ApplicationDocument {
  schemaVersion: number;          // real branching in the parser, unlike
                                  // today's parseAppDocument
  ui: PuckData;                   // unchanged Puck document
  operations: OperationBinding[];
  resources: ResourceBinding[];
  variables: VariableDeclaration[];
  theme?: ThemeRef;
}
```

No screens, routes, procedures, expressions, or scripts in v1. Screens can be
added later as `ui: Record<screenId, PuckData>` without touching bindings,
because bindings are app-scoped.

### Operation bindings

```ts
interface OperationBinding {
  id: string;                     // stable; UI and widgets reference this
  name: string;                   // display only
  workflowId: string;
  workflowVersion?: number;       // pinned in releases, floating in drafts
  inputs: Record<string, InputMapping>;   // keyed by input node ID
  outputs: Record<string, OutputMapping>; // keyed by output node ID
  policy: "parallel" | "replace" | "queue";
  timeoutMs?: number;
}

type InputMapping =
  | { from: "widget" }            // bound widget supplies the value
  | { from: "variable"; variableId: string }
  | { from: "constant"; value: unknown }
  | { from: "resource"; resourceBindingId: string };  // passes a ResourceRef

type OutputMapping =
  | { to: "display" }             // available for widget binding
  | { to: "variable"; variableId: string };
```

The same workflow may be bound twice with different mappings
(`translateTitle`, `translateBody`). Replacing the workflow behind a binding
does not touch the UI as long as the mapped input/output node IDs still
resolve. All mappings key on node **IDs**; the runtime derives the name-based
`params` object the run protocol needs at the execution boundary, so graph
renames never break apps.

"Run analysis, let the user review, then publish" is two operations plus a
variable: operation A writes its result to variable `analysis`
(`to: "variable"`), a display widget shows it, and operation B reads it
(`from: "variable"`). No procedure language.

### Resource bindings

The persistent layer already exists (`assets`, `timeline_sequences`,
`storyboards`, `image_documents` tables; `routers/{timeline,storyboards,
sketch}.ts`; the web stores and agent bridges). What is missing is a common
envelope:

```ts
interface ResourceRef { kind: ResourceKind; id: string; revision?: number }

interface ResourceBinding {
  id: string;
  name: string;
  kind: "asset" | "timeline" | "storyboard" | "sketch";
  scope: { projectId?: string; fixedId?: string };  // collection or pinned doc
  operations: ("read" | "create" | "update" | "delete")[];
}
```

Providers wrap the existing routers; they do not replace the sibling stores.
Interactive editing widgets (gallery, picker, scene list, clip strip) issue
provider commands with the current `revision`; the server rejects stale writes
(optimistic concurrency — add a `revision` column to the three document
tables). Workflows receive `ResourceRef` values through operation-binding
input mappings and return them from outputs.

### Variables

```ts
interface VariableDeclaration {
  id: string;
  name: string;
  type: TypeMetadata;             // reuse the node-sdk type system
  default?: unknown;
  scope: "instance" | "user";     // instance = this open app; user = persisted
  persist: boolean;               // only user-scoped variables may persist
}
```

No workspace scope, no session scope, no persistence policies beyond this in
v1. Persisted variables get a small keyed table
(`application_id, user_id, variable_id, value, updated_at`).

### Widget props instead of an expression language

Presentation logic is a closed vocabulary of declarative props, validated
structurally like every other Puck field:

```ts
type StateRef =
  | { source: "variable"; variableId: string }
  | { source: "output"; operationId: string; outputNodeId: string }
  | { source: "input"; operationId: string; inputNodeId: string }
  | { source: "execution"; operationId: string;
      field: "running" | "progress" | "error" };

interface Condition { ref: StateRef;
  op: "eq" | "neq" | "gt" | "lt" | "empty" | "notEmpty"; value?: unknown }
```

Widgets gain: `visibleWhen?: Condition`, `disabledWhen?: Condition`, and
`format?: string` (a `{ref}` template string with a fixed filter set:
`number:2`, `date:short`, `upper`, `truncate:80`). That is the entire logic
surface. If real apps outgrow it, the revision path is to **adopt** an existing
serializable expression language (CEL or JSONLogic) for the `Condition` and
`format` slots — not to design one, and not before the pressure exists.

Anything beyond formatting and visibility — derived values, validation rules,
data transformation — is a (pure, cacheable, browser-platform) node in the
graph, where it is testable and visible to the agent.

### Actions

The action vocabulary grows from four to six, all referencing bindings by ID:

```
run        { operationId }
cancel     { operationId | invocationId }
setVariable    { variableId, value | fromWidget }
toggleVariable { variableId }
resourceCommand { resourceBindingId, command, args }   // e.g. upload, delete
openResource    { resourceBindingId, ref }             // open in its editor
```

Event pacing (`live` / `release` / `debounce`) stays as it is today
(`puck/useWidgetRuntime.ts`).

## Runtime

### Run identity (prerequisite, protocol change)

Add `job_id` to `OutputUpdate`, `NodeUpdate`, `NodeProgress`, and `Chunk`,
stamped at the kernel actor or the relay
(`packages/workflow-runner/src/browser.ts` already stamps
`GenerationComplete` this way). The app runtime drops any streaming message
whose `job_id` does not match a live invocation it started. This is the fix
for cross-run contamination and it benefits every surface (web editor, mobile,
CLI), not just apps.

### State model

One store per open app instance (a factory like `TimelineInstance.tsx`, not
today's process-global `Map` keyed by workflow ID, which shares one store
across every context that opens the same workflow; its disposal is tied to
workflow removal in `WorkflowManagerStore`, not to closing an app). Inside it,
four namespaced maps
instead of one flat `Record<string, unknown>`:

```ts
interface AppInstanceState {
  inputs:  Map<string /* opId:nodeId */, { value; dirty; revision }>;
  outputs: Map<string /* opId:nodeId */, { value; invocationId; status; revision }>;
  variables: Map<string /* variableId */, unknown>;
  view: Map<string /* componentId:prop */, unknown>;   // never persisted
  invocations: Map<string /* invocationId */, InvocationState>;
}

interface InvocationState {
  id: string;                     // == job_id
  operationId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number; error?: string; startedAt: number;
}
```

Transport messages are translated into typed store events at the WebSocket
boundary; reducers are pure and the streaming fold rules (`append`/`replace`/
`done` on `OutputUpdate.disposition`) live in one place. No command bus, no
transaction layer: a `run` action performs validate → snapshot inputs →
create invocation → mark outputs pending as one synchronous reducer batch,
which is all the atomicity a single-threaded store needs.

Entity data (resource documents, asset lists) is **not** copied into this
store. Widgets read it through the existing TanStack Query + tRPC layer; the
store holds only `ResourceRef`s and selection state (view domain).

### Framework-independent core

Extract the reducer + fold + dispatch core into a package consumed by three
things: the React adapter (`useSyncExternalStore`), the CLI `nodetool app
debug` harness (`packages/cli/src/app-debug/` currently re-implements the fold
rules and hand-copies the widget catalog as `WIDGET_MODES`), and the
`app-tools` eval suite. The widget catalog (modes, bindable props, action
events) moves to the same shared package. This ends the three-way drift and
makes the harness test the real semantics.

## Publishing and governance

Publishing creates an `application_versions` row with `released = true`:
an immutable snapshot of UI + bindings + variables + **pinned workflow
versions** (extend `workflow_versions` usage; today it stores `graph` only,
which is sufficient since the app document lives in the application row).
Rollback moves the release pointer.

The open decision with no in-repo precedent is funding: whose keys and whose
money does a published app run on? The recommended v1 answer is
**creator-funded with hard budgets**:

- Runs of a released app execute with the creator's secrets but under an
  app-scoped budget row (`application_id, period, max_usd, max_invocations`),
  checked server-side before job creation and settled from the existing
  `predictions` cost records. Pre-run estimates come from
  `packages/node-sdk/src/cost-estimate.ts`.
- Exceeding the budget fails the run with a typed error; nothing silently
  spends.
- Viewer-funded and workspace-funded models are later options behind the same
  budget check.

A release also carries a derived (not hand-written) capability summary: the
workflows it may invoke (its operation bindings), the resource kinds and
operations it uses (its resource bindings), computed at publish time and
enforced when the server resolves a binding ID against the release. There is
nothing else to declare because there is nothing else the app layer can do.

## Reactive execution

The current reactive subgraph mechanism (`buildTriggerSubgraph.ts`, long-lived
`reactiveJobIdRef`) stays, gated by one new `NodeMetadata` field:

```ts
static readonly effect: "pure" | "read" | "write" | "external" = "external";
```

Default `external` (conservative); `cacheTtl: "forever"` nodes are `pure` by
definition. Reactive runs may only traverse `pure`/`read` nodes; anything else
requires an explicit `run` action. No planner, no dependency index in v1 — the
existing trigger-subgraph builder plus this gate covers the "slider must not
resend an email" requirement.

## Migration

1. Legacy `workflow.app_doc` stays readable. On first edit (or publish), the
   builder creates an `applications` row: imports the Puck doc, creates one
   operation binding to the host workflow, resolves name bindings to node IDs
   (unresolved ones become validation errors), and converts widget state keys.
   `app_doc` becomes a read-only mirror, then is dropped once web, CLI, and
   the template generator use application records.
2. Regenerate shipped artifacts: ~50 `web/public/app-preview/*.json` bundles,
   `app_doc` blocks in `packages/base-nodes/nodetool/examples/`, and
   `scripts/generate-template-apps.mjs` output.
3. Fix stale docs in the same change: `appbuilder/README.md` and `appData.ts`
   still describe `workflow.settings` persistence and an implicit fallback
   layout, both removed behaviors.

## Build order

Each phase ships a user-visible outcome.

- **P0 — run identity.** `job_id` on streaming messages, stamped at
  kernel/relay; consumers updated. *Ships:* overlapping runs, second tabs, and
  editor runs stop contaminating app values.
- **P1 — stable bindings + namespaced state.** ID-based bindings with name→ID
  resolver and rename propagation in the graph editor; the four-namespace
  store; per-instance store factory; document `schemaVersion` with real parse
  branching. *Ships:* rename-safe apps, no more key collisions.
- **P2 — shared runtime core.** Extracted reducer/fold core + shared widget
  catalog consumed by web, `app debug`, and evals. *Ships:* the CLI harness
  and evals test the real runtime.
- **P3 — Application entity + operations.** Tables, router, migration
  adapter, multi-operation bindings, agent tools gain application identity
  (`ui_app_*` extended with binding/variable tools). *Ships:* app library;
  apps with several operations.
- **P4 — resource bindings.** Provider envelope over existing routers,
  `revision` columns, resource widgets, `ResourceRef` through operations.
  *Ships:* apps that edit timelines/storyboards/sketches safely.
- **P5 — conditions + effect gating.** `visibleWhen`/`disabledWhen`/`format`
  props; `effect` metadata + reactive gate. *Ships:* conditional UI; safe
  reactivity.
- **P6 — publish.** Releases, budgets, capability summary, telemetry keyed by
  `(applicationId, version, invocationId)`. *Ships:* apps usable by people
  other than their author.

Unscheduled until demand proves them: multiple screens, a procedure language,
sandboxed app scripts (reuse `packages/agents/src/js-sandbox.ts` if that day
comes), CEL/JSONLogic expressions, workspace-scoped variables.

## Revision triggers

- Apps accumulate awkward chains of operations with review gates between them
  → add a minimal procedure model (sequence / await / branch only).
- `format` templates sprout conditional needs → adopt CEL or JSONLogic in the
  `Condition`/`format` slots.
- Child-runner overhead makes graph-calls-graph orchestration sluggish →
  optimize `WorkflowNode` (shared runner pool), still no new language.
- Published-app demand favors viewer- or workspace-funded runs → swap the
  funding source behind the existing budget check.
