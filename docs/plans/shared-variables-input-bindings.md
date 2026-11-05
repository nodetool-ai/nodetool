# Shared variables and direct input bindings

## Purpose

Let creators bind a node input directly to a typed variable and edit that value
from other bound inputs, app controls, or a variables panel. Make it clear when
an edit changes configuration, when work starts, and how state moves between
items or feedback iterations.

This is a proposed implementation plan. It covers document contracts, runtime
behavior, the editor, app integration, agent authoring, migration, and tests.
It builds on the existing scheduler and coordinates with the
[control-flow regions plan](control-flow-regions.md). It does not require
regions before shared input editing can ship.

## Existing behavior to preserve

| Surface | Inspected behavior | Consequence |
|---|---|---|
| [Workflow variable nodes](../../packages/core-nodes/src/nodes/variable.ts) | Set Variable publishes by name. Get Variable streams published values. | Existing graphs can depend on repeated emissions without wires. |
| [VariableChannel](../../packages/runtime/src/variable-channel.ts) | `first()` returns the first publication. `stream()` replays the full history and then follows new publications. | This is not a latest-value variable. Changing it in place would change existing workflows. |
| [App state](../../packages/app-runtime/src/state.ts) | Variables hold current values. Invocation ownership prevents superseded runs from updating owned slots. | Reuse these protections when connecting app controls and workflow parameters. |
| [Item correlation](../correlation-design.md) | Item sources establish identity, downstream nodes execute for matching items, and parent values can be reused. Independent item sources require explicit joins. | Shared scalar parameters must not introduce another item stream. |
| [Feedback loops](../workflow-loops.md) | Loop owns initial state, feedback, iteration matching, limits, and completion. | Variable binding must not bypass the existing cycle rules. |

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

The interface should explain the feature as: "Bind inputs to the same variable
to edit them together. Run uses a snapshot of those values."

Decision identifiers D1–D13 retain the decisions from the design discussion.

| Decision | Contract |
|---|---|
| D1. Separate values, events, and streams. | A variable holds a current value. An event requests an action. A stream carries successive items or chunks. Updating one does not silently become another. |
| D2. Separate reading and watching. | Read samples once. Watch observes committed changes. Replay is an explicit stream behavior. Direct input binding uses a run snapshot by default. |
| D3. Infer scope from ownership. | Creation location supplies the default owner. Scope determines access and sharing, while persistence determines lifetime. Workflow, project, app-instance, run, and iteration ownership are explicit in the contract without requiring a routine scope picker. |
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
offering an editor. Binding direction is available as text and an accessible
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
Both changes are undoable. Resetting the shared variable is a distinct command
that names the affected references. Deletion offers replacement or conversion
of references to literals. It must not silently leave fallback values running.

Selecting the binding label opens its details: name, type, scope, default,
current value, edit access, and references. Revisions are available in advanced
diagnostics rather than routine editing. Show a preview of
affected controls when editing from the panel. Renaming retains identity.
Copying nodes within a workflow retains bindings. Copying across workflows
requires an explicit import or mapping of definitions, with no name-only match.

Follow the [design system](../DESIGN.md), [UX guidelines](../UX_GUIDELINES.md),
and [primitives strategy](../../web/src/components/ui_primitives/STRATEGY.md).
Keep binding actions keyboard accessible and usable in narrow node inspectors.

## Ownership and document contract

| Scope | Lifetime and persistence | Execution access |
|---|---|---|
| Workflow parameter | Definition and authored default saved with the workflow. Editing the workflow changes that authored value. | Each run receives an immutable snapshot. Runs do not rewrite defaults. |
| Project variable | Owned by a project and shared with authorized workflows and apps. Saved by default, with persistence declared separately from scope. | Runs capture its value through parameter mappings. Explicit publications use revision checks. |
| App instance | Current state belongs to the open app instance. Persistence follows explicit app settings. | An operation maps values to workflow parameters at invocation. Output mappings may commit results back under ownership checks. |
| Run-local variable | Initialized for one run and discarded at its end unless explicitly exported. | Ordered Read and Write operations may access it. A direct binding remains a snapshot, not a live read. |
| Iteration state | Owned by one loop invocation and its parent item identity. | Updated through feedback or region state ports at the defined iteration commit. |

Use one logical definition and binding contract across surfaces, with adapters
to existing app state and execution contexts. Do not create a second app store
or place runtime subscriptions in graph JSON. Agent memory remains a separate
domain with its existing contracts.

A variable definition needs a stable resource ID, display name, type, owner,
default or explicit unset state, and persistence policy. A binding identifies
the variable, target input, and edit access. Store IDs rather than paths or
names as identity. Apply the repository's full-ID and short-ID boundary rules.

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

At run admission, resolve permitted overrides and atomically capture the
referenced parameter values and revisions. Precedence is declared invocation
overrides, then a declared project binding, then authored defaults for unbound
parameters. App mappings produce invocation overrides. An inaccessible, missing,
or unset required project binding fails preflight rather than falling back to a
default. Conflicting mappings to the same parameter fail validation.

Resolve bindings before correlation analysis and node execution. A scalar
snapshot behaves as a constant side input reused for every applicable item.
It does not create an iteration root or subscribe the node to edits. Record
snapshot provenance with the run, using existing access and redaction rules.
Cache identity must include resolved input values so parameter changes cannot
reuse incompatible results.

During a run, controls show current editable values and offer inspection of the
values used by that run. Show `Changed since this run started` when applicable.
Future items and feedback iterations within that run keep the same parameter
snapshot. Restart explicitly to use new configuration.

For multiple controls editing one variable, commit through one authority with
expected revisions. Update subscribed controls from committed revisions without
echoing received updates as new writes. Reject stale concurrent edits with a
visible reload/reapply choice. Undo is another checked write, not a rollback of
unrelated changes. A same-value state write creates no change event. Repeated
action requests remain events and are not deduplicated as state.

For run-local state, Read must be ordered after the intended Write through an
execution dependency. Unordered competing writes fail validation where statically
detectable and fail with a conflict at runtime otherwise. No last-arrival-wins
accumulator shared across parallel items. Use explicit collection/reduction or
sequential region state instead.

App output mappings retain existing invocation ownership. Also check the target
revision captured for publication so a late result cannot overwrite a newer
manual edit. Report an uncommitted result and retain its output for inspection.
Cancellation, retries, and duplicate delivery must not commit an output twice.

Project publication uses the same revision check against the shared authority.
Two workflows replacing the same revision cannot both succeed. Keep the losing
result available and show: `This variable changed while the workflow was running.`
Offer `Keep current value` or `Use result`. Choosing Use result performs another
checked write against the displayed revision, never an unconditional overwrite.
Counters and accumulated results need explicit atomic update or append contracts
before support. Replacement writes must not simulate them through read-modify-write.

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

## Delivery plan

- [ ] **A1. Inventory and fixtures.** Enumerate existing variable readers/writers,
  prompt substitution, app mappings, list-entry shortcuts, item sources, joins,
  and tests. Capture representative behavior before changing it. Verify list
  shortcuts against their serialized graph and executor, not only UI labels.
- [ ] **A2. Shared contracts.** Add versioned definitions and source bindings to
  protocol/document schemas. Define scopes, revisions, compatibility, import,
  authorization, and persistence, including project ownership and external
  parameter mappings. Save/load/export must preserve bindings or explicitly
  report mappings that require reconnection.
- [ ] **A3. Headless parameter execution.** Resolve snapshots and overrides before
  scheduling. Add preflight errors, cache inputs, run provenance, and equivalent
  CLI/API/agent behavior. Preserve item correlation and existing variable streams.
- [ ] **A4. First editor delivery.** Implement workflow-scoped parameters, the
  input picker, shared editing, reference inspection, unbind, undo/redo, and
  changed-since-run feedback. Infer scope at creation and avoid routine scope
  prompts. Ship direct bindings without requiring Watch or regions.
- [ ] **A9. Project sharing.** Add project-owned storage, checked publication,
  parameter mappings, and authorized reference discovery. Implement `Share with
  project…` and picker groups without breaking existing bindings. Test concurrent
  workflow writes, cross-client edits, permissions, and project export/import.
- [ ] **A5. App integration.** Map app variables into parameters and results back
  into app state. Reuse the existing reducer and ownership model. Add revision
  conflict handling for edits made during execution. Keep separate instances isolated.
- [ ] **A6. Explicit mutable state.** Add ordered run-local Read/Write only after
  scheduling dependencies and conflicts are defined. Integrate iteration state
  through the regions plan rather than inventing a separate accumulator mechanism.
- [ ] **A7. Compatibility and discoverability.** Preserve legacy Set/Get and
  prompt behavior. Offer deliberate conversion with a preview of changed semantics.
  Add examples for shared Style, whole-list references, item batches, and per-item
  refinement. Update node help and agent authoring guidance alongside implementation.
- [ ] **A8. Optional reactive execution.** Design Watch and automatic execution
  separately after finite-run behavior ships. Require explicit lifetime, triggering,
  concurrency, and cycle contracts before enabling them.

Dependencies: A2 follows A1. A3 follows A2. A4 requires A3. A5 requires A3 and A4.
A9 follows A4 and the shared contracts in A2 and A3. It can ship independently
of A6 and A8. Keep A9's contracts in A2 even if its UI ships after A5.
A6 depends on the applicable region contracts. A7 accompanies each delivery.
A8 is deferred and is not an acceptance requirement for direct input bindings.

## Verification and acceptance

| Scenario | Required evidence |
|---|---|
| Edit Style from two nodes and the panel | One committed revision updates every reference. No provider call starts. Read-only controls cannot edit. |
| Create and bind an ordinary variable | Creation requires no scope or persistence choice. This workflow appears first in the picker. Scope remains available in details. |
| Share a variable and bind a second workflow | Existing references retain identity. Both workflows resolve the same project variable through their parameter mappings. Sharing and editing start no run. |
| Two workflows publish to the same project variable | One replacement of the expected revision succeeds. The conflict preserves the other result and offers a checked resolution. |
| Export a workflow or lose access to shared state | External mappings are explicit. Missing access fails preflight without leaking project data or silently substituting a default. |
| Start a run, then change Style | Every item and feedback iteration uses the captured value. A new run uses the new value. |
| Bind a list of references versus expand a list of prompts | Whole-list input invokes once per owning key. Expansion invokes per item, without extra fan-out from shared parameters. |
| Join branches and independent item sources | Same-source pairing survives different completion times. Independent sources retain explicit join requirements. |
| Refine several prompts | Feedback state and final results remain isolated by parent item and iteration. |
| Attempt concurrent accumulation | Unordered state writes are rejected. Explicit collection or sequential state produces defined results. |
| Edit app state before an old run finishes | The result remains inspectable but cannot overwrite the newer edit or invocation. |
| Save, rename, copy, undo, import, and reopen | Identity and type checks survive. Conflicts and missing definitions produce actionable diagnostics. |
| Run a legacy variable workflow | Replay, first-value reads, prompt substitution, and writer completion remain unchanged. |
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
