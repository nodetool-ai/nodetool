# Shared variables and direct input bindings

## Purpose

Let creators bind a node input directly to a typed variable and edit that value
from other bound inputs, app controls, or a variables panel. Make it clear when
an edit changes configuration, when work starts, and how state moves between
items or feedback iterations.

This is a proposed implementation plan. It covers document contracts, runtime
behavior, the editor, app integration, agent authoring, migration, and tests.
It builds on the existing scheduler and coordinates with the
[control-flow regions plan](control-flow-regions.md) and the
[reactive sessions plan](reactive-sessions-events.md), which defers typed
bindings and revision-checked publication to this plan. It does not require
regions before shared input editing can ship.

The first release is A1–A4. It adds four things:

1. `workflow.parameters` and `node.bindings` in the workflow document.
2. One pure resolver that writes variable values into node properties when a
   run starts, used by every host that executes a graph.
3. Validation rules for bindings in the existing validators.
4. The `Bind variable…` menu, bound-field label and variables panel in the editor.

Loopback with replace and append (A10), `Run N times` (A11), app integration
(A5), project sharing (A9), run-local state (A6) and reactive execution (A8)
follow it. The contracts in A2 cover all scopes from the start
so later deliveries do not change saved documents.

Terms: creators see one word, **variable**. In code and in this plan, a
variable owned by a workflow is a **workflow parameter**, because it is also a
run input that callers can override by name (D14). **Binding** means a node
field takes its value from a variable instead of a typed value or a wire.

## Existing behavior to preserve

| Finding | Inspected behavior | Consequence |
|---|---|---|
| F1. [Workflow variable nodes](../../packages/core-nodes/src/nodes/variable.ts) | Set Variable publishes by name. Get Variable streams published values with `iteration` correlation on its output. | Existing graphs can depend on repeated emissions without wires. |
| F2. [VariableChannel](../../packages/runtime/src/variable-channel.ts) | `first()` returns the first publication. `stream()` replays the full history and then follows new publications. The runner closes a channel when its last writer finishes. | This is not a latest-value variable. Changing it in place would change existing workflows. |
| F3. [Prompt substitution](../../packages/text-nodes/src/nodes/text-extra.ts) | `{{ name }}` awaits `first()` only when the name has a registered Set Variable writer. The node's own dynamic inputs win on conflict. Unmatched names stay as literal text. | A new variable whose display name matches a legacy channel must not change what a Prompt renders. Name resolution needs a defined precedence (A7). |
| F4. [Workflow Input nodes](../../packages/core-nodes/src/nodes/input.ts) | The `nodetool.input.*` nodes are the external run interface. The [runner](../../packages/execution-core/src/runner.ts) checks required inputs, then dispatches `params[name]` or the node's `value` property through each node's `process()`. | Workflows already have typed parameters. New parameter definitions must coexist with this contract, not fork it (D14). |
| F5. [App node-property bindings](../../packages/app-runtime/src/bindings.ts) | `op:<opId>/prop:<nodeId>#<prop>` lets a widget drive any node property. The [web host](../../web/src/components/appbuilder/nodeBinding.ts) and the [server](../../packages/websocket/src/session/job-execution.ts) overlay those values onto the node properties of the run's frozen graph before execution. | Snapshot resolution into node properties already exists for apps. Direct bindings should reuse that path (D15), not add a second one. |
| F6. [App variable declarations](../../packages/app-runtime/src/document.ts) | Scope is `instance` or `user`, and only `user` variables persist. [`mergeVariables`](../../packages/app-runtime/src/operations.ts) adds every Set Variable channel name as an `instance` variable whose ID is the name. | The ownership table must map the existing `user` scope. Name-derived IDs violate the stable-ID rule and need a migration (A7). |
| F7. [App state](../../packages/app-runtime/src/state.ts) | Variables hold current values without revisions. Input slots carry a `revision`. Invocation ownership, ordered by `startedAt`, prevents superseded runs from updating owned slots. | Reuse the ownership protections. Revision-checked publication (D12) requires adding variable revisions to the reducer (A5). |
| F8. [Node result cache](../../packages/runtime/src/context.ts) | `getCachedResult` and `cacheResult` key on node type and node properties. | Values materialized into properties before execution are part of the key without cache changes. Values injected later would not be. |
| F9. [Item correlation](../correlation-design.md) | Item sources establish identity, downstream nodes execute for matching items, and parent values can be reused. Independent item sources require explicit joins. | Shared scalar parameters must not introduce another item stream. |
| F10. [Feedback loops](../workflow-loops.md) | Loop owns initial state, feedback, iteration matching, limits, and completion. | Variable binding must not bypass the existing cycle rules. |

The distinction between a collection and an item stream already exists.
[Text List](../nodes/nodetool/constant/textlist.md) outputs a list value.
[List Generator](../nodes/nodetool/generators/listgenerator.md) exposes individual
`item` values and a complete `output` list. The
[ForEach implementation](../../packages/core-nodes/src/nodes/control.ts)
turns a collection into item emissions. Emitting items does not guarantee that
each downstream branch finishes before the next item starts.

These are inspected examples, not an inventory of every editor shortcut that
creates lists or iteration. A1 below requires that inventory before implementation.

## User model and decisions

The interface should explain the feature as: "Bind fields to the same variable
to edit them together. Each run uses the values from when it started." User
copy says `variable` everywhere, including conversion actions. It never says
`parameter`, `snapshot`, `scope` or `revision` outside variable details and
diagnostics.

Decision identifiers D1–D13 retain the decisions from the design discussion.
D14 and D15 come from the code inspection in F4 and F5.

| Decision | Contract |
|---|---|
| D1. Separate values, events, and streams. | A variable holds a current value. An event requests an action. A stream carries successive items or chunks. Updating one does not silently become another. |
| D2. Separate reading and watching. | Read samples once. Watch observes committed changes. Replay is an explicit stream behavior. Direct input binding uses a run snapshot by default. |
| D3. Infer scope from ownership. | Creation location supplies the default owner. Scope determines access, sharing and persistence. Workflow, project, app-instance, app-user, run, and iteration ownership are explicit in the contract without requiring a routine scope picker. |
| D4. Keep feedback explicit. | Loop carries state between feedback iterations. Future regions use their declared state ports and completion rules. |
| D5. Define execution and concurrency. | Edits update controls immediately. Runs capture input revisions. Concurrent writes follow explicit ownership and conflict rules. |
| D6. Make dependencies visible. | A variables panel lists references, current values, scope, and writers. Selecting a variable highlights its uses. |
| D7. Bind from an input menu. | A field has one source: literal, wire, or variable. Binding is saved as structured document data. |
| D8. Retain familiar controls. | Bound inputs keep their normal editors, with read-write or read-only access and a visible variable label. |
| D9. Separate editing from execution. | Editing a variable does not start provider work. Automatic execution requires a separate, explicit trigger policy. |
| D10. Publish outputs explicitly. | A computation writes state through an explicit write operation or declared app output mapping. Input binding alone never writes computed results back. |
| D11. Share across workflows explicitly. | Project variables can supply several workflows. Sharing preserves existing bindings and requires authorized project access. Workflow parameters remain reusable through project-specific mappings. |
| D12. Snapshot shared reads and check shared writes. | Capture project values at run start. Publication checks the expected revision and preserves conflicting results for review. |
| D13. Keep sharing separate from triggering. | Project writes update controls without starting workflows. Cross-workflow automation needs explicit orchestration and bounded feedback. |
| D14. Extend the existing input contract. | A workflow parameter has a stable ID and an external name. External names share one namespace with Input node names, and a collision fails validation. Run requests keep addressing inputs by name in `params`. Converting an Input node to a parameter keeps its external name, so API, CLI, app and agent callers keep working. |
| D15. Resolve by materialization. | At admission, one pure resolver writes each resolved value into the bound property of the admitted graph, the same transformation F5 applies to app overlays. Nodes, Python workers, correlation analysis and the cache (F8) see an ordinary property value. Binding metadata does not reach node code. |

## Node editor interaction

```text
Generate Image                         Generate Video
Prompt [A forest]                      Prompt [Slow pan]
Style  [Cinematic]                      Style  [Cinematic]
       Bound: Style                           Bound: Style
```

Editing either Style control commits one update to the same variable. Both
controls and the variables panel show that committed value. Draft text stays
local until a valid edit commits. Read-only controls show the value without
offering an editor and use the `inert` treatment that wire-driven properties
already use (see [node editor pitfalls](../../web/src/components/AGENTS.md#node-editor-pitfalls)),
so they also leave the tab order. Binding direction is available as text and an accessible
label, not only an icon or color.

The input menu offers `Set value`, `Connect wire`, and `Bind variable…`.
The picker lists compatible variables under `This workflow` first, then
`Shared in project`, and offers `Create variable from this value`. Creation
uses the field's type and current valid value and defaults to this workflow.
Do not ask for scope or persistence during this action. Variables created in an
app belong to that app instance by default. Loop state belongs to its loop
automatically and is exposed through state inputs and outputs.

Offer `Share with project…` in variable details when another workflow needs the
value. Preview the expanded access and affected workflows, then promote ownership
without breaking existing bindings. Keep the stable variable ID and atomically
update the definition and mappings. Reject promotion if the caller cannot write
the workflow or share into the project. Reversing sharing requires resolving
external references explicitly.

Keep ordinary fields compact: show the variable name, with scope and access in
details and accessible descriptions. Show scope inline when needed to distinguish
matching names. Sharing and inspection reveal ownership and persistence, while
normal binding and editing require no scope decisions.

Connecting a wire to a bound input offers `Replace variable binding` before
changing its source. Unbinding retains the current value as a local literal.
Both changes are undoable. Deleting a variable names the affected fields and
offers to rebind them or keep the current value in each. It must not silently
leave fallback values running.

Selecting the binding label opens its details: name, type, scope, current
value, edit access, and references. Revisions are available in advanced
diagnostics rather than routine editing. Show a preview of
affected controls when editing from the panel. Renaming retains identity.
Copying nodes within a workflow retains bindings. Pasting into another workflow
brings copies of the bound variables with new IDs, named as in the source, with
a numeric suffix where a name is taken. A pasted binding never attaches to an
existing variable by name. The creator can rebind afterwards.

Follow the [design system](../DESIGN.md), [UX guidelines](../UX_GUIDELINES.md),
and [primitives strategy](../../web/src/components/ui_primitives/STRATEGY.md).
Keep binding actions keyboard accessible and usable in narrow node inspectors.

## Ownership and document contract

| Scope | Delivery | Lifetime and persistence | Execution access |
|---|---|---|---|
| Workflow parameter | A4 | Definition and current value saved with the workflow. Editing the variable edits the workflow. | Each run receives an immutable snapshot. Runs never write it. Loopback writes happen between runs (A10). |
| App instance | A5 (exists) | Belongs to the open app instance, as today. | An operation maps the value into workflow inputs at invocation. Output mappings may write results back under ownership checks. |
| App user | A5 (exists) | The existing `user` scope (F6): persisted per user across instances. | Same as app instance. |
| Project variable | A9 | Owned by a project and always persisted. | Runs read it through parameter mappings. Publications use revision checks. |
| Run-local variable | A6 | Initialized for one run and discarded at its end unless explicitly exported. | Ordered Read and Write operations. A direct binding remains a snapshot, not a live read. |
| Iteration state | Regions plan | Owned by one loop invocation and its parent item identity. | Updated through feedback or region state ports at the defined iteration commit. |

Persistence follows from scope. Only app variables keep their existing
`instance` or `user` choice. No other scope adds a persistence setting.

Use one logical definition and binding contract across surfaces, with adapters
to existing app state and execution contexts. Do not create a second app store
or place runtime subscriptions in graph JSON. Agent memory remains a separate
domain with its existing contracts.

A variable definition needs a stable resource ID, display name, type, owner,
and a value or an explicit unset state. A binding identifies
the variable, target input, and edit access. Store IDs rather than paths or
names as identity. Apply the repository's full-ID and short-ID boundary rules.

A starting shape for A2 to confirm against the protocol graph schema:

```text
workflow.parameters[]   { id, name, type, value | unset, required, description }
node.bindings[]         { target: "property" | "dynamic", name, variable_id, access: "read" | "read_write" }
workflow.loopbacks[]    { id, source: { node_id, output }, variable_id, write: "replace" | "append" }
project mapping         { workflow_id, parameter_id, project_variable_id }
```

Keep `node.bindings` beside `node.properties`, not inside it, so existing
readers of `properties` keep seeing literals. A property listed in `bindings`
with an incoming data edge fails validation (D7). While a field is bound, its
`properties` entry is ignored. Unbinding writes the variable's current value
into it, as the node editor section requires. A document from a newer schema
that an older client cannot read must fail to open with a version message
rather than drop `bindings` on save.

Variables are not a secret store. Reject binding a secret-typed or credential
field, and never copy a secret into a variable value or run provenance.

Validate at authoring and execution boundaries. Read-write bindings require
compatible writes as well as reads, including enums and numeric constraints.
Reject incompatible types rather than coercing them silently. Missing required
variables fail preflight with the field and variable identified. Unset, null,
and an empty list remain distinct. Media values retain resource references and
use the existing rendering resolution boundary.

Read-only binding is a control behavior, not authorization. The variable owner
must enforce write access through every UI, agent, and server entry point.

## Sharing across workflows

A reusable workflow declares a parameter such as Brief. Its project-specific
mapping can bind that parameter to `Campaign brief`, a project variable. Other
workflows can map their parameters to the same ID. Keep project mappings outside
the reusable workflow definition so exporting or moving the workflow does not
silently grant access to another project's state. Promotion creates this mapping
for existing local references without requiring creators to reconnect inputs.

```text
Workflow A → publish → Project / Campaign brief
                                ↓ snapshot when B starts
                           Workflow B
```

Workflow B reads the captured revision even if A publishes another brief during
B's execution. To consume A's new result, start B after publication through an
explicit action or orchestration dependency. Sharing alone establishes no ordering.
Display readers and writers across authorized workflows in variable details.
Do not reveal names or values from inaccessible resources.

Project sharing is part of the architecture and delivery plan. Its UI may follow
workflow-local bindings. Workspace-wide variables remain deferred. Snapshot and
publication rules apply equally to manual, agent, app, and headless execution.

## Execution semantics

At run admission, the resolver produces the admitted graph in four steps:

1. Start from each parameter's saved value, or from its project variable when
   the workflow maps one (A9).
2. Apply `params` supplied by the caller, by external name. App operations
   already produce `params` through `resolveOperationParams` (A5).
3. Write each parameter's value into every property bound to it (D15).
4. Apply app node-property overlays (F5). An overlay targets one property of
   one node, so it wins over the binding for that node only. Validation warns
   when an app overlays a bound property.

A required parameter with no value after step 2, or a mapped project variable
the caller cannot read, fails preflight instead of falling back to the saved
value. Record the `{ variable_id, revision }` set with the run, using existing
access and redaction rules. Because the cache keys on properties (F8), a changed
value cannot reuse an incompatible result.

The resolver is a pure function over the graph, the parameter values and the
overrides. Put it beside the graph helpers in `@nodetool-ai/protocol`, which
the server, `execution-core` and the web app already depend on. Every host
that executes a graph calls it: the server job path, the CLI, and the
browser runner that [`runInlineGraphJob`](../../web/src/lib/workflow/runInlineGraphJob.ts)
uses for pure-browser graphs. Project and app-user values are read from their
owner on the server, never taken from a request body. A browser run that needs
them fetches them first, or the graph runs on the server.

Resolving before correlation analysis means a bound value behaves as a
constant property reused for every applicable item. It does not create an
iteration root or subscribe the node to edits.

For workflow parameters, the authority for the current value is the open
workflow document. An edit is a document change: undoable, marked dirty, and
saved with the workflow like any property edit. Cross-client conflicts follow
the existing workflow save behavior, which A1 records. A run started from the
editor uses the document state it was started with.

During a run, controls show current editable values and offer inspection of the
values used by that run. Show `Changed since this run started` when applicable.
Future items and feedback iterations within that run keep the same parameter
snapshot. Restart explicitly to use new configuration.

For app and project variables, where several clients can write the same value,
commit through one authority with expected revisions. Update subscribed controls from committed revisions without
echoing received updates as new writes. Reject stale concurrent edits with a
visible reload/reapply choice. Undo is another checked write, not a rollback of
unrelated changes. A same-value state write creates no change event. Repeated
action requests remain events and are not deduplicated as state.

For run-local state, Read must be ordered after the intended Write through an
execution dependency. Unordered competing writes fail validation where statically
detectable and fail with a conflict at runtime otherwise. No last-arrival-wins
accumulator shared across parallel items. Use explicit collection/reduction or
sequential region state instead.

App output mappings retain existing invocation ownership. App variables have
no revision today (F7), so A5 adds one to the reducer. Then check the target
revision captured for publication so a late result cannot overwrite a newer
manual edit. Report an uncommitted result and retain its output for inspection.
Cancellation, retries, and duplicate delivery must not commit an output twice.

Project publication uses the same revision check against the shared authority.
Two workflows replacing the same revision cannot both succeed. Keep the losing
result available and show: `This variable changed while the workflow was running.`
Offer `Keep current value` or `Use result`. Choosing Use result performs another
checked write against the displayed revision, never an unconditional overwrite.
Append is a separate write kind, defined in
[Loopback](#loopback-using-a-result-as-the-next-input). Numeric counters remain
deferred. Replacement writes must not simulate either through read-modify-write.

Watch is a later capability with an explicit subscription lifetime and cleanup.
It must not keep ordinary finite workflows open indefinitely. Automatic runs
are also deferred. If added, their policy must state which changes trigger work,
debounce behavior, cancellation, queue limits, and whether output-originated
changes can trigger again. Cancellation cannot undo already submitted provider work.

## Lists, per-item execution, and feedback

Use the following explanation in help and examples:

> A list holds several values. Processing each item repeats work for those
> values. Feedback repeats work using the previous result. A shared variable
> supplies a setting unless you explicitly turn its value into items.

| Situation | Required behavior |
|---|---|
| Style bound to a string variable while prompts arrive as items | Every prompt uses the same captured Style. No extra executions arise from the binding. |
| Reference images bound to a list-valued input | Pass the complete list as one input value. |
| A list variable is intended to drive a scalar prompt input | Use an explicit `ForEach` conversion. A future `Use each item` shortcut must expose and serialize that conversion. Do not silently flatten the list. |
| Two inputs derive from the same item source | Preserve their shared correlation identity so results match the correct item. |
| Inputs derive from unrelated item sources | Preserve explicit Zip or Cross requirements. Do not infer pairing or combinations from variable names or lengths. |
| The list is edited while its run is active | The active run retains its captured list and item identities. The next run uses the edit. |
| Each prompt needs repeated refinement | Each item starts its own Loop with independent feedback state. |
| Each item depends on the previous item's result | Use sequential stateful iteration from the regions plan. Ordinary item emission does not provide this guarantee. |
| Each run should start from the previous run's result | Use a loopback target, manually or with `Run N times`. |
| Results from several runs should build up a list | Use an `append` loopback target on a list variable. |

Preserve existing convenient item-driven execution. Describe it as `Process each
item` in the UI instead of treating every repetition as the same kind of loop.
Show `Whole list` versus `Each item` where an actual conversion exists, and show
known invocation counts without implying that unknown counts are zero.
Adding a variable binding must not add a second fan-out or change existing joins.

An empty collection passed whole remains one empty-list value. Expanding it
produces no item invocations. Existing collectors keep their current behavior.
New sequential regions follow their separately defined empty-loop contract.
Never use a shared variable's last value as the missing output of an empty loop.

## Feedback and state publication

```text
Prompts → ForEach → Loop.initial
                     Loop.value → Improve → Evaluate
                          ↑          │          │
                          └─ next ───┘          └─ condition → Loop
                     Loop.done → Collect → app output mapping

Style variable → run snapshot → Improve.Style
```

The diagram is conceptual. Actual edges must satisfy the existing loop scope
rules. Carry related feedback state together, for example draft, critique, and
score. Keep each parent item isolated. Collect final results outside the feedback
body according to the existing aggregation constraints.

Input read-write access means editing configuration. It does not cause Improve
to publish its output to Style, nor does publishing a result restart the run.
Snapshot reads and end-of-operation publication can safely refer to the same app
variable across separate invocations because publication does not trigger work.

For any future live Watch/Write path, include variable dependencies in validation
and tracing. Reject a same-run reactive cycle without an explicit supported loop
owner, seed, and termination policy. Origin metadata prevents notification echoes,
but cannot prove an algorithm converges. A timeout alone is not loop semantics.

The same rule applies across workflows: A watching B's output and B watching A's
output requires an orchestration owner, seed, stop condition, and execution
budget. Validation must consider declared cross-workflow subscriptions as well
as visible graph edges. Project sharing ships without those automatic triggers.

The regions plan owns sequential iteration, state commits, Keep, Continue, and
Break. This plan consumes those contracts. Preserve existing Loop behavior until
explicit conversion, including its current handling of missing feedback.

## Loopback: using a result as the next input

Loopback writes a chosen output into a variable so the next run starts from it.
It covers repeated image edits and inpainting, image-to-image feedback for
animation frames, extending a video from its last frame, progressive
upscaling, hand-refined text drafts, and collecting references across runs.

The editor already supports repeated edits by adding a node per step: the
output quick actions (Upscale, Remove background, Edit) create a new node wired
to the output. Loopback is the alternative that keeps the graph unchanged and
keeps the steps in the node's existing output history (`NodeHistoryViewer`,
`selected_generation`).

Loopback follows D9 and D10. It is an explicit write, and writing never starts a
run. Only the `Run N times` command, which the creator starts deliberately,
runs the workflow more than once.

### Loopback targets

A loopback target links one node output to one variable with a write kind:

```text
workflow.loopbacks[]   { id, source: { node_id, output }, variable_id, write: "replace" | "append" }
```

The first `Use as input` on an output asks which variable to write and saves
the target. Later uses write to it directly. Variable details list loopback
targets as writers (D6). Validation checks that the output type is compatible
with the variable for `replace`, or with the list's item type for `append`.

### Write kinds

- **Replace** sets the variable to the output value. It follows the existing
  rules: a document edit for workflow variables, and a revision-checked write
  for app and project variables.
- **Append** adds one item to the end of a list-typed variable. The owner
  performs it as one operation, not as read, modify and write. Two appends to an
  app or project variable both succeed, in commit order, so append needs no
  expected revision and has no conflict dialog. Each item records its source
  (job ID, node, output and generation), and a second append with the same
  source is ignored, so retries and duplicate delivery cannot add an item twice.
  A list has a maximum length, set in A2, and an append beyond it fails with
  `This list is full. Remove items to add more.`

The app reducer already has an `append` disposition (F7), but its `appendValue`
concatenates strings. A list variable must push the item instead, so a string
item becomes one entry.

Appends from parallel items within one run remain unsupported, because their
order is undefined. Collect the items in the run with the existing collection
nodes, then replace or append the collected list once.

### Manual loopback

`Use as input` and `Add to list` appear on an output in the node history viewer
and on the output quick actions. They write the selected result, not the whole
batch, when an output produced several items. For a workflow variable the
write is an ordinary undoable document edit (Q2). Going back means picking an
older result in the node history and using it again. Loopback adds no history
store of its own. Media values are written as asset references.

### Run N times

`Run N times…` in the Run menu runs the workflow repeatedly, applying the
workflow's loopback targets between runs:

1. Show the step count, the loopback targets that will be written, and the cost
   estimate before starting.
2. Each step is a normal run: it uses the values from when it started, appears in
   node history, and counts against existing budgets.
3. After a step completes, write each loopback target from that step's output.
   A source that produced more than one item stops the sequence with an error
   naming the output, because there is no selected result.
4. Stop when the count is reached, a step fails, a budget is reached, or the
   creator presses Stop. Stop cancels the current step and starts no further
   steps. Writes from completed steps remain.

The progress label reads `Step 3 of 5`. Editing a variable during the sequence
applies from the next step, as with any run. For a variable that is also a
loopback target, the next loopback write replaces or extends the edited value.
Each write in the editor is its own undoable edit.

Headless repeats (`nodetool run --repeat 5`, API, agents) carry loopback values
between steps in memory and leave the saved workflow unchanged. `--save` writes
the final values back as one edit.

This differs from the Loop node. Loop repeats inside one run, needs graph
wiring and a stop condition, and keeps intermediate values inside the run.
`Run N times` works on an unchanged workflow, and every step is an inspectable
run. The count is fixed before starting, so it is not the automatic execution
that A8 defers.

Put the sequence in shared, non-React code so the CLI, API and agents run the
same loop. Use the finite-operation adapter
from the [reactive sessions plan](reactive-sessions-events.md#smallest-first-implementation)
if it exists by then, rather than a second run loop.

## Agent and headless authoring

Agents and scripts author bindings through the same document contract as the
editor. No surface gets a private binding format.

- The `ui_*` workflow-document tools and `create_workflow`/`update_workflow`
  accept parameter definitions, `node.bindings` and `loopbacks`, and validate
  them with the rules above.
- `validate_workflow` and `nodetool validate` report binding errors with the
  node, property and variable named: missing definition, incompatible type,
  bound field with an incoming edge, name collision with an Input node (D14),
  inaccessible project variable, and a loopback target whose output type does
  not match its variable.
- The workflow DSL gains a way to declare a parameter and bind a property to
  it. Regenerate the DSL and sandbox copies as the
  [node change checklist](../../packages/AGENTS.md#adding-or-changing-a-node)
  requires.
- `nodetool run`, `run_workflow` and the REST run routes keep passing values
  through `params` by external name. `debug_workflow` output lists the
  resolved parameter set and revisions for the run.
- Agent-visible variable IDs follow the short-ID rules, with one ID form per
  tool result.

Update the [workflow builder skill](../../packages/system-skills/nodetool-workflow-builder/SKILL.md)
and node help in the same change that ships each authoring surface (A7).

## Open questions and recommendations

Each recommendation is the working default for A2 until a reviewer overrides it.

### Q1. Is a parameter a node, a document definition, or both?

Recommendation: a document definition, listed beside Input nodes in one
external interface.

An Input node is a graph source. The runner dispatches its value along
outgoing edges through the node's own `process()` (F4). Binding a property to an
Input node would therefore be a wire, which already exists. A parameter is a
property source with no edges, so it does not belong on the canvas as a node.

- The workflow's external interface (what the run form, app builder, API and
  agents list) is the union of Input nodes and parameters, in one name space
  (D14).
- Input nodes stay the right tool for values that flow along edges: media,
  streaming inputs such as `RealtimeAudioInput`, and transforming inputs such as
  `MessageDeconstructor`.
- Offer conversion only when every outgoing edge of the Input node
  targets a node property, and the node's `process()` applies no transform the
  parameter type cannot express. `StringInput.max_length` converts to a
  parameter constraint. An Input node with any other transform keeps its node
  form. The conversion keeps the external name, so `params` callers keep working.
  The menu item reads `Convert to variable`.
- The variables panel lists both kinds and labels Input nodes as `Input node`,
  so creators see one list of what a run accepts.

### Q2. Does a parameter edit autosave or create a version?

Recommendation: no new save or versioning behavior. Store the value once and
make the edit an ordinary document edit.

- The value lives in `workflow.parameters[].value`, not in each bound node.
  One edit then changes one field, makes one undo step and one revision, however
  many nodes are bound.
- Workflow versions already distinguish `manual` from `autosave`, and the
  [workflow version model](../../packages/models/src/workflow-version.ts) prunes
  old autosaves per workflow. Parameter edits go through that path unchanged, so
  frequent edits cannot flood the manual history.
- Commit continuous controls on release, not on every drag frame, and text on
  blur or Enter. This keeps undo steps and autosaves to one per deliberate edit.
- [`workflowDocumentRevision`](../../packages/protocol/src/workflow-document-revision.ts)
  hashes nodes, edges and links, with an explicit list of node `data` fields.
  A2 must add `bindings` to that list and pass `parameters` and `loopbacks`
  as new inputs.
  Otherwise a variable edit leaves the revision unchanged and revision-based
  conflict checks miss it.

### Q3. Where are project variables stored?

Recommendation: a new `project_variables` table in `models`, accessed only
through `project-services`, with compare-and-set on a revision column.

- Columns: `id` (32-hex), `project_id`, `user_id`, `name`, `type` and `value`
  as `jsonText`, `revision` integer, `updated_at`, and `updated_by_job_id`
  (nullable, for provenance). Follow the
  [add-a-model steps](../../packages/models/AGENTS.md#adding-a-new-model) for
  both dialects.
- Publish with the
  [returning pattern for CAS](../../packages/models/AGENTS.md#returning-pattern-for-cas):
  `UPDATE … WHERE id = ? AND revision = ?`, with zero rows meaning conflict. App
  instances already use this shape and raise `AppInstanceConflictError`
  ([app instance model](../../packages/models/src/app-instance.ts)). Use the
  same error contract, not a new one.
- Store mappings in a second table keyed by `(workflow_id, parameter_id)`
  pointing at `project_variable_id`, with `project_id` copied in. This keeps
  them out of the workflow document, as the sharing section requires. A workflow
  belongs to one project through its existing `project_id` column. A mapping
  whose `project_id` no longer matches the workflow's, after a move, is
  inactive and reported in preflight instead of resolving.
- [Projects](../../packages/models/src/project.ts) have a single owner
  (`user_id`) and no member table. Authorization for A9 is therefore an owner
  check on both the project and the workflow. Multi-member projects would
  extend that check and are not a prerequisite.
- Media values hold asset references, never bytes. Cap the serialized value
  size so the table cannot become a blob store.

### Q4. How do name-derived app variables migrate?

Recommendation: migrate on first edit, not by a bulk rewrite.

`mergeVariables` synthesizes these declarations from Set Variable channel names
each time a document loads (F6). Many are never saved, so a database migration
would miss them and could change documents nobody touched.

- While unedited, a synthesized variable stays as today: ID equals the channel
  name, `instance` scope, and the variable mirrors the channel.
- When a creator renames, retypes, binds or sets a default on one, the app editor
  saves a real declaration with a fresh 32-hex ID and a `channel` field naming
  its source channel. In the same save it rewrites `var:<name>` bindings in the
  Puck document to `var:<id>`. The bindings parser already accepts bare names as
  the legacy form, so documents saved earlier keep working.
- Re-key persisted `user` values from the old name to the new ID in the same
  write, or a returning user loses their saved value.
- `debug_app` reports a declaration whose `channel` no longer exists in the
  graph, instead of letting the binding go silently empty.

### Q5. Can a variable bind to a dynamic property or a list element?

Recommendation: bind declared static properties and typed dynamic inputs.
Reject untyped dynamic slots and anything below the top level.

- Dynamic inputs already separate a typed declaration (`dynamic_inputs`) from
  the current value (`dynamic_properties`), as
  [`graph.ts`](../../packages/protocol/src/graph.ts) documents. A declared slot
  has a type to check against, so it can be bound like a static property.
- An undeclared slot behaves as `any`. Binding it would bypass D1's type checks.
  Offer `Set type` first, then allow binding.
- Address the target explicitly, for example
  `{ target: "property" | "dynamic", name }`, so a static property and a dynamic
  slot with the same name cannot collide. Renaming a dynamic slot moves its
  binding in the same edit.
- A list-valued property binds as a whole value. Element-level or nested-path
  binding stays out of scope, as the vvvv section states.

## Delivery plan

Items appear in delivery order. Their codes are stable and do not reflect order.

- [ ] **A1. Inventory and fixtures.** Enumerate existing variable readers/writers,
  prompt substitution, app mappings, list-entry shortcuts, item sources, joins,
  and tests. Capture representative behavior before changing it. Verify list
  shortcuts against their serialized graph and executor, not only UI labels.
  Also record: every `nodetool.input.*` dispatch path and required-input check
  (F4), both app overlay implementations (F5), every caller of
  `mergeVariables` (F6), the node cache callers (F8), and how concurrent
  workflow saves from two clients resolve today.
- [ ] **A2. Shared contracts.** Add versioned definitions and source bindings to
  protocol/document schemas. Define scopes, revisions, compatibility, import,
  authorization, and persistence, including project ownership and external
  parameter mappings. Save/load/export must preserve bindings or explicitly
  report mappings that require reconnection. Include `parameters`,
  `node.bindings` and `loopbacks` in `workflowDocumentRevision` (Q2). Define
  the replace and append write kinds for every scope.
- [ ] **A3. Headless parameter execution.** Resolve snapshots and overrides before
  scheduling by materializing them into the admitted graph (D15). Replace the
  two app overlay implementations (F5) with calls to the same resolver, and call
  it from the browser runner. Add preflight errors, run
  provenance, and equivalent CLI/API/agent behavior. Preserve item correlation,
  existing variable streams, and the `params` contract for Input nodes.
- [ ] **A4. First editor delivery.** Implement workflow-scoped parameters, the
  input picker, shared editing, reference inspection, unbind, undo/redo, and
  changed-since-run feedback. Infer scope at creation and avoid routine scope
  prompts. Ship direct bindings without requiring Watch or regions.
- [ ] **A10. Loopback and append.** Add loopback targets, `Use as input` and
  `Add to list` on node history and output quick actions, and the replace and
  append write kinds for workflow variables. Append pushes list items with a
  source key for duplicate suppression and a length cap.
- [ ] **A11. Run N times.** Add the repeat command in shared code, the Run menu
  entry with estimate and `Step k of N` progress, and the CLI `--repeat` and
  `--save` flags.
  Stop on count, failure, budget or Stop, keeping completed writes.
- [ ] **A5. App integration.** List workflow parameters as operation inputs next
  to Input nodes, so the existing `resolveOperationParams` mappings (`widget`,
  `variable`, `constant`, `resource`) feed them with no new mapping kind. Key
  them by parameter ID the way Input nodes are keyed by node ID. Reuse the
  existing reducer and ownership model for results. Add variable revisions to
  the reducer (F7) and revision conflict handling for edits made during
  execution. Keep the `instance` and `user` scopes and their persistence as they
  are. Keep separate instances isolated. Route list-variable appends through
  the A10 write kind instead of `appendValue`.
- [ ] **A9. Project sharing.** Add the project variable and mapping tables (Q3),
  checked publication, and authorized reference discovery. Implement `Share with
  project…` and picker groups without breaking existing bindings. Test concurrent
  workflow writes, cross-client edits, permissions, and project export/import.
- [ ] **A6. Explicit mutable state.** Add ordered run-local Read/Write only after
  scheduling dependencies and conflicts are defined. Integrate iteration state
  through the regions plan rather than inventing a separate accumulator mechanism.
- [ ] **A7. Compatibility and discoverability.** Preserve legacy Set/Get and
  prompt behavior. In Prompt templates, a legacy channel with a registered
  writer keeps precedence over a new variable of the same name (F3), and
  validation warns about the shadowing. Migrate name-derived app variable IDs
  (F6, Q4). Offer deliberate conversion of Input nodes and Set/Get pairs, with
  a preview of changed semantics.
  Add examples for shared Style, whole-list references, item batches, per-item
  refinement, and an image edit chain with loopback. Update node help and agent authoring guidance alongside implementation.
- [ ] **A8. Optional reactive execution.** Design Watch and automatic execution
  separately after finite-run behavior ships. Require explicit lifetime, triggering,
  concurrency, and cycle contracts before enabling them.

Dependencies: A2 follows A1. A3 follows A2. A4 requires A3. A10 requires A4.
A11 requires A10. A5 and A9 each require A4 and are independent of each other
and of A10 and A11. When A5 or A9 ships, loopback targets may write app or
project variables with the same write kinds. A9's contracts are part of A2.
A6 depends on the applicable region contracts. A7 accompanies each delivery.
A8 is deferred and is not an acceptance requirement for direct input bindings.

## Verification and acceptance

| Scenario | Required evidence |
|---|---|
| Edit Style from two nodes and the panel | One committed revision updates every reference. No provider call starts. Read-only controls cannot edit. |
| Create and bind an ordinary variable | Creation requires no scope or persistence choice. This workflow appears first in the picker. Scope remains available in details. |
| Share a variable and bind a second workflow | Existing references retain identity. Both workflows resolve the same project variable through their parameter mappings. Sharing and editing start no run. |
| Two workflows publish to the same project variable | One replacement of the expected revision succeeds. The conflict preserves the other result and offers a checked resolution. |
| Export a workflow or lose access to shared state | External mappings are explicit. Missing access fails preflight without leaking project data or silently substituting the saved value. |
| Start a run, then change Style | Every item and feedback iteration uses the captured value. A new run uses the new value. |
| Bind a list of references versus expand a list of prompts | Whole-list input invokes once per owning key. Expansion invokes per item, without extra fan-out from shared parameters. |
| Join branches and independent item sources | Same-source pairing survives different completion times. Independent sources retain explicit join requirements. |
| Refine several prompts | Feedback state and final results remain isolated by parent item and iteration. |
| Attempt concurrent accumulation within one run | Unordered state writes are rejected. Explicit collection or sequential state produces defined results. |
| Use an edited image as the next input, three times, then go back one step | Each `Use as input` is one undoable edit and starts no run. Picking an older result in node history restores it. |
| Add results from two runs to a list variable, then retry the second delivery | The list holds two items in commit order. The duplicate is ignored. A string result becomes one item, not concatenated text. |
| Two app clients append to the same variable at once | Both items are added, with no conflict dialog. Appending beyond the cap fails with the list-full message. |
| `Run N times` with 5 steps, stopped during step 3 | Steps 1 and 2 wrote their targets. Step 3 is cancelled, no step 4 starts, and the estimate was shown before step 1. |
| `Run N times` where the source produced several items | The sequence stops with an error naming the output. |
| `nodetool run --repeat 3` with and without `--save` | Each step starts from the previous step's loopback value. Without `--save` the saved workflow is unchanged. With it, one edit holds the final values. |
| Edit app state before an old run finishes | The result remains inspectable but cannot overwrite the newer edit or invocation. |
| Save, rename, copy, undo, import, and reopen | Identity and type checks survive. Conflicts and missing definitions produce actionable diagnostics. |
| Run a legacy variable workflow | Replay, first-value reads, prompt substitution, and writer completion remain unchanged. |
| Call a workflow with parameters through `params` | Input nodes and parameters resolve by external name. A name collision fails validation. Converting an Input node keeps existing API and app callers working. |
| Inspect an admitted graph with bindings | Bound properties hold resolved values. A Python node and the node cache see the same values as a literal property. No node receives binding metadata. |
| Run an app with a node-property overlay on a bound property | The overlay wins for that node only, other bound nodes keep the variable value, and validation warns. The server, web host and browser runner produce the same admitted graph. |
| Add a variable named like a legacy Prompt channel | The Prompt renders the channel value as before, and validation reports the shadowing. |
| Bind a secret-typed field | Validation rejects it. No secret appears in variable values or run provenance. |
| Use empty lists, null, unset values, cancellation, and failed writes | Each follows its declared contract without leaked subscriptions or waiting forever. |

Use headless executor fixtures and the existing app harness for semantics, plus
editor tests for binding actions and shared controls. Add boundary tests for IDs,
permissions, revisions, and serialized bindings. Prove new validators fail on
invalid fixtures and inspect nonempty input. Exercise large binding graphs to
detect quadratic reference lookup or update behavior.

Implementation must run the build prerequisites and mandatory checks from
[repository verification rules](../../AGENTS.md#mandatory-post-change-verification).
This documentation-only plan requires link and diff checks, not runtime tests.

## vvvv reference and deliberate adaptation

vvvv's [Channel Browser](https://thegraybook.vvvv.org/reference/hde/the_channelbrowser.html)
demonstrates shared typed parameters, read-write access, and reference discovery.
Its [bindings](https://thegraybook.vvvv.org/reference/hde/bindings.html) connect
parameters to controls and external transports. Its
[execution-order documentation](https://thegraybook.vvvv.org/reference/language/execution-order.html)
separately explains stored state across frames for feedback.

NodeTool should adopt shared parameter editing and inspectable references.
Asynchronous workflow execution needs explicit run snapshots and iteration
commits rather than assuming a global frame clock. External device bindings,
arbitrary nested-property bindings, workspace-wide variables, and automatic
reruns are outside this plan's required delivery. Project sharing follows the
workflow-local UI while using the ownership contract established from the start.
