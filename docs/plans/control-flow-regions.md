# Control-flow regions

Cross-plan references use `CF-`, for example `CF-D28`. Local IDs stay unchanged.

A region is a container on the canvas whose contents run under a rule. The first
release adds two kinds, plus a way to test and inspect them. The main decisions:

- **If Region (D1).** Only the chosen area, Then or Else, runs. Nodes in the
  other area never start, even ones with no inputs. Both areas must produce
  every output, so an empty Else connects its input through.
- **For Each Region (D3, D18, D19, D26).** One list in, one item at a time. The
  next item starts only after the current one finishes. Results come back in
  list order. Keep, Stop after iteration, and State for next item are optional.
  A list longer than the maximum fails before any work starts.
- **Failure (D22, D25).** A failed item stops the region, and no partial Results
  reach downstream nodes. Existing recovery that produces a value, such as
  retries, still applies. Recovery that would drop an item counts as a failure.
- **Execution (D24).** Each region invocation and each item runs as an isolated
  inner run on the executor the Subgraph and Workflow nodes already use. A
  spike (A53) must confirm the cost per item before this is final.
- **Membership (D5, D28).** Membership is stored explicitly in `parent_id` and
  never inferred from position. Unknown-type execution rejection and lossless
  saving in supported older editors must be proven by A6. The choice to omit
  a format version field remains conditional on that evidence.
- **Shared execution prerequisite (D27).** Workflow execution owns the optional
  Spending limit per run and reservations across nested work. This affects all
  workflow runs, not only regions. Paid-region release requires A37/A40/A41.
- **Test one item and Inspect item (D15 to D17, D12 to D14).** Test one item runs
  one item with supplied inputs, separate from normal runs. Inspect item only
  reads what an earlier run recorded and never executes anything.
- **Compatibility (D29).** Existing If, For Each, and Loop nodes keep their
  names and behavior. Nothing is converted automatically.

## First release

Ship If Region and sequential For Each Region, followed by Test one item and read-only
inspection of recorded iterations. Keep defaults simple: one collection, ordered
results, no carried state unless added, and stop on failure.

Build only the shared ownership, ports, completion, and budget behavior these
features need. Reuse existing execution and provider infrastructure. Preserve
stable identities and keep saved workflows loading without building a general
control-flow framework.

Delivery order is milestones 1, 2, 3, 4, 4a, 4b, then 7. Existing identifiers are
retained so earlier discussions remain traceable. Milestones 5 and 6 are deferred.
D27 and D28 record the spending and compatibility choices, with their
[verification conditions](#resolved-questions).

## Terms authors see

The editor, messages, docs, and every decision in this plan use the terms below.
Region is the generic word for both containers. Do not substitute block, zone,
or group: groups are the existing visual frames, which do not change execution.

| Term | Meaning |
|---|---|
| Region | A container on the canvas whose contents run under a rule. Nodes inside it are its members. |
| If Region | A region with a Then area and an Else area. Only one area runs. |
| For Each Region | A region that runs its contents once per item of a list, one item at a time. |
| Item, Index | The current list element and its position inside a For Each Region. |
| Results | The For Each Region output: one value per kept item, in list order. |
| State for next item | An optional value carried from one item to the next. It needs a starting value. |
| Keep | An optional true/false input inside a For Each Region. False leaves this item out of Results. It is true when not connected. |
| Stop after iteration | An optional true/false input inside a For Each Region. True finishes this item and starts no more. It is false when not connected. |
| Test one item | Opens test controls for one item. Run test starts it. |
| Inspect item | Shows what an earlier run recorded for one item. It never runs anything. |
| Spending limit per run | The one spending setting for workflow runs (D27). |

**D29. Region names leave existing nodes unchanged.** The word Region tells the
new containers apart from the existing If and For Each nodes, so those nodes keep
their types, titles, and behavior. A search for "if" or "for each" lists the
region first and the node second. Each region's menu description says it is a
container and points to the node for simple routing or streaming.
[Loop guidance](https://github.com/nodetool-ai/nodetool/blob/main/docs/workflow-loops.md) says when to use a For Each Region (a
list) and when to use Loop (repeat until a condition).

## Existing behavior and compatibility

The [control nodes](https://github.com/nodetool-ai/nodetool/blob/main/packages/core-nodes/src/nodes/control.ts) already
provide conditional routing and item emission. `If` and `Switch` emit only the
taken output. `ForEach` yields every item at once, and the correlation scheduler
runs body invocations for different items concurrently, so emission order does
not mean the body finishes before the next item starts. The only bound on
in-flight items is the inbox limit of 10,000 pending keys, which fails the run
when exceeded ([correlation design](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md#6-done-dropped-key-and-scope-close-propagation)).
The [feedback loop](https://github.com/nodetool-ai/nodetool/blob/main/docs/workflow-loops.md) caps iterations at 1,000 and can
terminate without a `done` value when feedback is missing.

New regions need explicit completion. Existing If, Switch, ForEach, and Loop
workflows keep their behavior. Automatic conversion is outside this release.

Use the existing [GroupNode](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node/GroupNode.tsx) and
[grouping hooks](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useSurroundWithGroup.ts) as the starting
point for canvas interactions. The current
[groupability rules](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useIsGroupable.ts) prohibit nested
groups, so nested execution regions require an explicit design and tests.
Existing grouping does not establish region execution semantics.

## Audit findings

This audit inspected current grouping hooks, drag handlers, GroupNode, graph
serialization, subgraph extraction, selected-run execution, frontend graph
tools, their shared schemas, and the headless workflow-document adapter. A
second pass inspected the actor scheduler, control nodes, inner-graph runner,
supervisor, content-filter handling, graph migration, run budgets, the
generation seam, and the credit gate. Historical sources were the region commit
linked below and `LoopNode.tsx` at `1edf9aadb9^`. Both passes read source and
focused tests. Neither was a browser usability test or an end-to-end
demonstration of historical region execution.

Recheck claims needed for delivery under the [evidence rules](https://github.com/nodetool-ai/nodetool/blob/main/docs/plans/feature-interplay/README.md#evidence-and-interpretation).

### Reuse

- **F10. Existing group interactions are the baseline.**
  [Surround](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useSurroundWithGroup.ts) creates the
  container and reparents children in one store write.
  [Add](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useAddToGroup.ts) converts positions and grows
  the frame without a separate resize undo step.
  [Remove](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useRemoveFromGroup.ts) restores positions.
  [GroupNode](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node/GroupNode.tsx) already supplies
  resizing, title/color editing, selection behavior, and child status. Reuse
  these interaction patterns and existing undo helpers, adapting touched UI to
  current primitives and tokens rather than copying styles wholesale.
- **F11. Persistence and boundary-rewrite foundations exist.**
  [Serialization](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/reactFlowNodeToGraphNode.ts) already
  saves `parent_id` and dimensions, and the reverse adapter restores membership.
  [Group into Subgraph](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useGroupIntoSubgraph.ts) rewrites
  crossing edges into named inputs/outputs. Reuse its planning and undo approach.
  Its generated input nodes use StringInput, so do not assume its current port
  construction supplies the typed branch/state boundaries needed here.
- **F18. An isolated inner-run executor already exists.**
  [`runInnerGraph`](https://github.com/nodetool-ai/nodetool/blob/main/packages/core-nodes/src/nodes/run-inner-graph.ts) backs
  the Subgraph, Workflow, and App nodes. It runs a graph on a child
  `WorkflowRunner` with a copied context, passes named params to inner Input
  nodes, and collects named outputs. A parent cancel aborts the child. Inner
  messages are forwarded to the parent except the child's `job_update`. Assets
  and generations keep the parent job id. `MAX_INNER_GRAPH_DEPTH` (8) and a
  self-call check bound nesting. The child's cost is added to the parent total
  only after the child finishes, so this path records spend but does not admit
  it. D24 proposes this executor for region bodies.

### Change before reuse

- **F12. Nesting requires more than allowing a container type.**
  [Groupability](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useIsGroupable.ts) prohibits grouped
  groups. Add ignores already-parented nodes, Remove adds only the immediate
  parent's position, and GroupNode run/bypass/status operations select direct
  children. Reuse [absolute positions](https://github.com/nodetool-ai/nodetool/blob/main/web/src/utils/absoluteNodePosition.ts)
  and [descendant traversal](https://github.com/nodetool-ai/nodetool/blob/main/web/src/utils/withGroupContents.ts) where
  appropriate, but define each operation's scope explicitly. Keep visual-group
  behavior unchanged while adding region ancestry, cycle checks, nested moves,
  and atomic validation of crossing edges.
- **F13. Existing drag gestures need execution-aware rules.**
  [Drag handlers](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/handlers/useDragHandlers.ts) remove nodes
  during modifier-key or wiggle gestures, and choose an intersecting group as
  the drop target. Execution regions need a clear prospective branch/body target
  and validation before membership changes. Do not let a wiggle silently move a
  paid operation outside its condition. Preserve ordinary group gestures and
  prototype the region-specific preview and commit behavior without new dialogs.
- **F14. Run Group is not Test one item.** GroupNode runs its direct children
  through [Run selected](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useRunSelectedNodes.ts).
  That path uses cached inputs, can add deterministic upstream work, blocks
  uncached generative upstreams, and stamps outputs for reuse by later runs.
  Reuse execution infrastructure, but add a strict supplied/resolved-input path
  and separate test result storage. Do not inherit automatic upstream execution
  or publish test results into the normal run cache.
- **F15. Historical regions are visual references, not a runtime foundation.**
  The separate region commit adds shared container rendering, serialization,
  and badges. Its Run action selects only the region and direct children and
  drops external edges. Badges read `current_iteration`, `iteration_count`, and
  `active_branch` from properties. The renderer does not implement typed boundary
  ports or recorded inspection. IfRegion's position-based branch assignment is
  described in comments, not established by that renderer. The old LoopNode
  renders NodeInputs/NodeOutputs and refers to GroupInput/GroupOutput, but also
  carries raw styles and a MutationObserver panning workaround. Borrow boundary
  presentation ideas, not these execution paths or obsolete editor workarounds.
- **F19. The untaken-branch skip does not satisfy D1.** The actor skips a node
  only when every wired data input closed without a value
  (`receivedNothing` in [the actor](https://github.com/nodetool-ai/nodetool/blob/main/packages/execution-core/src/actor.ts)).
  A node with no wired inputs is never skipped. A node that receives a value on
  one handle and nothing on another fires with defaults for the missing handle,
  which the DSL test "partial branches use defaults while wholly untaken branches
  skip" in `packages/dsl/tests/script-export.test.ts` pins. So a branch node
  that also takes an input from outside the branch runs on the untaken side.
  Region execution must not rely on this cascade.
- **F20. ForEach has no completion gate.** `ForEachNode.genProcess` yields all
  items without waiting, and `outputCorrelation` gives each item its own key.
  Making the next item wait for the body needs either a new scheduler gate (the
  correlation design lists backpressure as an open decision) or a per-item
  isolated run (D24).
- **F21. Two existing failure policies drop items instead of failing.** The
  [supervisor](../workflow-supervisor-design.md) can answer a failed invocation
  with `skip` or `end_stream`, and with `substitute` for a repaired value. It
  offers `retry` only when the invocation spent nothing and created no asset,
  capped at 2 retries per invocation key
  ([supervisor.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/execution-core/src/supervisor.ts)). A
  content-filter refusal is retried twice and then drops the item when the
  invocation is one item of a fan-out
  ([content-filter.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/execution-core/src/content-filter.ts)).
  Inside a For Each Region body both would publish a collection with a missing item,
  which D22 and R5 forbid. D25 resolves this.
- **F22. Visual groups are transparent to execution, and graphs have no format
  version.** `Graph.topologicalSort` in
  [graph.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/execution-core/src/graph.ts) treats children of a
  `GroupNode` as root-scope nodes. Region children must not inherit that rule.
  Graph documents carry no version field.
  [`migrateGraphNodeTypes`](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/graph.ts) only rewrites
  removed node types and renamed properties on load. An older build reading a
  region graph would see unknown node types, which `nodetool validate` rejects.
  D28 relies on that rejection.

### Spending controls

- **F23. Run budgets cover agent runs only.** `RunBudget` and
  `CompositeTurnBudget` in
  [turn-budget.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/turn-budget.ts) reserve a worst
  case before each model turn and commit actuals after it. The reservation
  handle is per turn, so concurrent loops cannot release each other's headroom.
  Admission runs in `BaseProvider`'s loop for chat turns, agent nodes, and
  sub-agents ([costs and credits](../costs-and-credits.md#agent-runs)). No
  workflow runner creates one, so an ordinary workflow run on the user's own
  keys has no per-run cost cap, deadline, or concurrency limit. "Reuse the run's
  spending policy" in D10 has nothing to reuse on that surface. D27 adds one.
- **F24. The generation seam records spend but does not admit it.**
  `ProcessingContext.runGeneration` in
  [context.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/context.ts) opens a generation row
  before the provider call and closes it with status, cost, and assets. It
  distinguishes `submission_unknown` and supports reconciliation
  ([generation tracking](../media-generation-tracking-design.md#current-implementation-boundary)).
  It does not reserve or refuse. Provider node packages that drive an SDK
  themselves (`fal-nodes`, `kie-nodes`, `replicate-nodes`, and the rest of
  surface S7 in [§8 of that design](../media-generation-tracking-design.md#8-surfaces-that-must-go-through-the-seam))
  bypass the seam, so no limit can stop them before they call a provider today.
- **F25. Run-level gates price one pass.** The
  [credit gate](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/credit-gate.ts) reserves a run's
  estimate before it starts, counts in-flight reservations, keeps them
  process-local, and fails open. Mini-app budgets also check before a run. The
  editor estimate in
  [useGraphCostEstimate](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/useGraphCostEstimate.ts) counts each
  node once, times its own fan-out properties, and does not multiply by a
  ForEach item count. A For Each Region would be priced as one item.

### Still missing

- **F16. User-facing region behavior needs a small prototype.** Current
  GroupNode has no region-specific collapse or boundary-port behavior. Generic
  node collapse persistence and the old LoopNode's collapsed flag do not prove
  that descendants and crossing links collapse correctly. Prototype explicit
  Then/Else membership, typed boundary wiring, nested target selection, and
  collapse using current groups. Add iteration progress from runtime events,
  Test one item, and consistent recorded previews. Do not present these as
  already supported by the old region badges.
- **F17. Agents can read membership but lack the required region edits.**
  [Get graph](https://github.com/nodetool-ai/nodetool/blob/main/web/src/lib/tools/builtin/getGraph.ts) and the
  [headless adapter](https://github.com/nodetool-ai/nodetool/blob/main/packages/node-sdk/src/workflow-document-tools.ts)
  expose parent IDs. The inspected [tool schemas](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/toolSchemas.ts)
  offer no parent/branch parameter on node creation, and
  [Add node](https://github.com/nodetool-ai/nodetool/blob/main/web/src/lib/tools/builtin/addNode.ts) creates a root node.
  [Update node data](https://github.com/nodetool-ai/nodetool/blob/main/web/src/lib/tools/builtin/updateNodeData.ts) changes
  data, not structural parent membership. Extend the shared graph-tool contract
  for region creation, membership/branch edits, and named ports in both browser
  and headless adapters. Agents also need scoped testing, read-only iteration
  inspection, compact region/status summaries, and actionable validation errors.
  Preserve revision checks and ID handling. A canvas move must never substitute
  for a semantic membership operation.

The focused grouping and selected-run suites passed during the first pass.
Reproduce that check with:

```bash
npm run test --workspace=web -- --runInBand --runTestsByPath src/hooks/nodes/__tests__/useAddToGroup.test.ts src/hooks/nodes/__tests__/useRemoveFromGroup.test.ts src/hooks/nodes/__tests__/useSurroundWithGroup.test.tsx src/hooks/nodes/__tests__/useRunSelectedNodes.test.ts
```

These tests support reuse of existing behavior. They do not verify nested
execution regions, branch ports, agent region edits, or the historical UI.
F18 to F25 come from reading source. No test was run for them. F19 and F21
need reproduction tests in A1 before runtime work depends on them.

## Execution contract

### Execution strategy

**D24 (provisional, awaiting A53).** Run each region invocation as an isolated
inner run through the F18 executor. The editor document keeps one graph with
explicit membership (D5). The region node declares its boundary ports as dynamic
inputs and outputs, the mechanism the Subgraph node already uses. At load, each
region's members compile to an inner graph, with generated Input and Output
nodes standing for those ports. Authors never see the generated nodes.

- An If Region evaluates its condition, then runs only the selected branch's inner
  graph. Nodes in the other branch are never scheduled, so F19 does not apply.
- A For Each Region runs the body's inner graph once per item and starts item N+1 only
  after item N's run finishes. Boundary inputs are passed as constant params.
  State fields are passed in and read back between runs.
- Test one item is one inner run with supplied inputs (D15 to D17).
- A region invoked per key of an outer legacy ForEach gets one inner run per
  key, so concurrent parent invocations stay isolated.

The alternative keeps region members in the outer graph and adds a per-key gate
to the correlation scheduler. That needs new kernel backpressure and a fix for
partial-input firing (F19, F20), and it leaves Test one item without an entry
point. A53 must measure the inner-run cost per iteration before this is
accepted. If the cost is too high for the expected item counts, choose the
in-graph alternative and record why.

The inner-run strategy must also close three gaps in the current executor.
Inner runs must share the owning run's limits instead of adding cost
afterward (D7). Forwarded messages must carry region invocation and iteration
identity for progress and inspection (D12). Region depth must count toward the
existing inner-graph depth limit (D6, A35).

### Branches and membership

**D1.** An If Region has a fixed Then / Else layout and shared named outputs.
Only the selected branch executes, including nodes without wired inputs and
nodes that also take inputs from outside the region. Both branches must supply
compatible values for every declared output. For a no-op Else, wire through the
input explicitly. An absent required output is an error, not an implicit null.
The validation message names the branch and the output, for example "Else has
no value for Result", and offers to connect the matching input through.
Separate optional-output and fallback modes are deferred.

**D5, D21.** Store membership and ports explicitly, independent of canvas
position. Preview boundary-crossing moves, validate affected connections, and
support one-step undo. Resizing a region never captures or releases nodes.
Editor, imported, API, and agent-authored graphs use the same validation.
Completion is delivered separately from values so untaken branches cannot leave
joins waiting indefinitely. Region children are never treated as root-scope
nodes the way visual-group children are (F22).

### For Each Region defaults

**D3, D4, D18, D19.** Accept one finite collection. Other boundary inputs are
resolved once and remain constant for that invocation. Combining collections is
an explicit upstream operation. Each iteration finishes before the next begins.
Collect kept results in input order. Label outputs Results and optional feedback
ports State for next item. State fields require initial values and explicit next
values. Commit state only after successful body completion.

**D26 (accepted behavior, bounds set by A36).** Each For Each Region has a maximum
item count. A collection longer than the maximum fails before the first item starts, naming both
numbers. Never truncate silently. A36 sets the default and the upper bound.
Show the item count beside Run workflow's estimate when it is known.

Keep is true and Stop after iteration is false when not connected. Neither
appears on the region until the author adds it. Their interaction is defined here:

| Outcome | Results and state | Completion |
|---|---|---|
| Body succeeds, Keep=true | Append result and commit next state. | Start next item unless stopping. |
| Body succeeds, Keep=false | Omit result and commit next state. | Start next item unless stopping. |
| Last item succeeds | Apply Keep and commit final state. | Return collected results and final state once. |
| Stop after iteration=true | Apply Keep and commit state for this completed iteration. | Return collected results and final state once. Start no later item. |
| Empty collection | Empty results and unchanged initial state. | Success, with No items to process. |
| Collection exceeds maximum | No records. | Failure before the first item (D26). |
| Failure, cancellation, or exhausted budget | Retain available completed records for inspection. | No successful region output to downstream nodes. Report the reason. |

**D22.** Stop on item failure after existing permitted node retries are exhausted.
Do not introduce a region-level retry or skip-error policy. Identify the failed
item. Cancellation cannot undo completed side effects or accepted provider work.
Successful early stopping is distinct from failure or budget exhaustion.

**D25 (accepted behavior, verification required in A21).** Inside a region body,
existing recovery that produces a value stays allowed: supervisor `retry` under its existing rules,
supervisor `substitute` after validation, and the bounded content-filter
retries. Recovery that removes an item is an item failure: supervisor `skip`
and `end_stream`, and the content-filter drop after its retries are exhausted.
Outside regions, both policies keep their current behavior.

### Nesting and presentation

**D6, D8.** Support nested conditionals and sequential loops. Aim for one or two
expanded levels. Give nonblocking guidance when adding a third level and a
stronger collapse recommendation at four, without persistent warnings. The
outermost region is level one. Reuse subworkflow extraction only where it already
exists. Independently enforce a structural depth cap chosen through stress tests.
Collapsed regions still count toward that cap. Under D24, region nesting and
Subgraph, Workflow, and App nesting share one runtime call-depth count, so the
structural cap must leave room below `MAX_INNER_GRAPH_DEPTH`.

**D11.** Keep default layouts focused on condition and branch outputs, or item
and results. Reveal state and advanced controls on demand. Collapsing affects
presentation only. Follow the [design system](https://github.com/nodetool-ai/nodetool/blob/main/docs/DESIGN.md),
[UX guidelines](https://github.com/nodetool-ai/nodetool/blob/main/docs/UX_GUIDELINES.md), and
[primitives strategy](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/ui_primitives/STRATEGY.md).

### Spending and execution limits

**D7, D9.** Nested regions, subworkflow calls, and retries share whatever limits
the owning run has. No nested invocation resets them. Reserve before paid work
starts, then reconcile known charges. Reservations must be atomic across
concurrent callers and reduce available funds. Keep the reservation when the
charge is uncertain. Stop starting paid work when a limit is reached. The first
release adds no new time or concurrency limits for workflow runs.

Model turns in `BaseProvider` already admit against a `RunBudget`. Media
generations in `runGeneration` record but do not admit, and provider node
packages outside the generation seam have no boundary at all (F23, F24). D27
puts workflow admission at node invocation, which covers every node package
without moving any of them behind the generation seam first.

**D10.** Regions add no budget modes of their own. They run under the existing
limits plus D27. Estimates are never presented as guaranteed maximums, and
unknown costs stay visible. Cancellation does not guarantee a refund. Pre-run
estimates and gates multiply a For Each Region body's estimate by the collection size
when it is known and mark it per item when it is not (F25). This release does
not require a new pricing engine or account-wide billing system.

**D27. Shared execution prerequisite: one spending limit per workflow run.**
Workflow execution owns this work at the common invocation boundary, including
ordinary runs. A37/A40/A41 are release gates for paid regions, not optional
region controls. Every workflow run gets a `RunBudget` created by the job
runner, so regions, loops and fan-outs follow the same rule. Authors see one
control and one message.

- **The setting.** Settings has one field, Spending limit per run, in USD. The
  CLI takes `--cost-cap <usd>` as agent runs do. Empty means no limit, so
  existing workflows run as before. Agent-started runs, mini-app budgets and
  hosted spending budgets keep their limits. A run uses the stricter applicable limit.
- **Admission.** Before a paid node invocation starts, the actor reserves that
  node's estimate from `estimateWorkflowCost`, the lookup the editor estimate
  already uses. After the invocation, it commits the actual cost from the
  invocation account and releases the difference. An unknown actual keeps the
  reserved amount. Agent nodes reserve per model turn through the existing
  `BaseProvider` admission instead, so nothing is reserved twice.
- **Stopping.** When a reservation would exceed the limit, the node does not
  start and the run fails with "Spending limit reached: $X of $Y used", naming
  the node. A For Each Region stops at that item with the exhausted-budget outcome.
- **Unknown prices.** With a limit set, a node whose model has no catalog price
  does not start. The message names the node and says to choose a priced model
  or clear the limit. Local providers count as free, not unknown.
- **Label.** Estimates marked `≥` can be exceeded by work already running, so
  the setting's help text reads "NodeTool stops starting paid steps once this
  amount is reached. A step already running can finish above it."

**D28. No format version field, conditional on compatibility evidence.** A region
is a new node type whose members use `parent_id`. A6 must test execution rejection
and load/save preservation separately in each older editor version claimed as
supported. Unknown-type rejection alone does not prove safe saving. Preserve the
unknown node, its data, and members' `parent_id` through a round trip. Name the
unknown type in the run error and recommend upgrading. If preservation fails,
define the supported-version boundary and revisit this choice before release.
Adding a field cannot make an already-shipped client honor it.

### Test one item

**D15, D16.** Select one item from an already resolved collection and preserve its
index. Otherwise accept a supplied sample and explicit test index, defaulting to
zero. Require all boundary inputs to be supplied or resolved. Do not execute
upstream nodes automatically. Use configured initial state in an isolated test
run. A later item tested with initial state is a sample, not a reproduction of
its historical iteration. First-release tests do not restore recorded state.

**D17.** Execute one outer iteration with its normal branches and nested work.
Nested loops may execute multiple items. Keep test state and results separate
from the live run and execute no downstream nodes outside the selected region.
A test is its own run under the same Spending limit per run (D27), shared by its
nested work and retries. Testing may incur charges and body side effects.

Beside Run test, show the item, where its state comes from, the item's estimate,
and the spending limit. Mark an unknown estimate as unknown. Run test starts
directly, without a confirmation dialog.

### Recorded inspection

**D12, D13, D20.** Inspect item reads records only. Test one item opens test
controls. Run workflow executes normally. Selection never triggers execution,
and test selection never limits a later full run. Identify records by run,
workflow revision, region invocation, parent iteration path, and original index.
Show item positions starting at one, with the zero-based index in details.

**D14, D23.** Reuse existing node inspectors and trace access, redaction, and
retention policies. Retain bounded summaries and authorized media references,
not complete execution snapshots. Missing, expired, or truncated data is explicit.
All previews use the selected recorded context, never a fallback to live or
latest values. Label live, recorded, and test data distinctly. Mark older workflow
revisions after edits, and show unavailable where a node cannot be matched.
Inspection makes no provider calls and does not regenerate missing data.

## Resolved questions

These are design choices, not verified implementation claims. D28 remains
conditional on A6. D24 is separately provisional until A53. D25 and D26 define
the accepted first-release behavior, with bounds measured in A36.

- **Q1. Spending policy for ordinary workflow runs.** Decided by D27. Every
  workflow run gets the same optional limit. The rejected option allowed paid
  regions only on surfaces that already have a budget. It was less work, but it
  meant authors had to know which surface they were on.
- **Q2. Workflow format marker.** D28 proposes omitting a marker only after A6
  proves rejection and preservation for the supported versions. Silent data
  loss requires revisiting compatibility before release.

## Risks and mitigations

| Risk | Required evidence |
|---|---|
| **R1. Ambiguous execution order** | Stop after iteration finishes the body and starts no next item. Immediate exits remain deferred. |
| **R2. Accidental overspend** | Competing requests, nested work, and retries cannot bypass shared reservation checks. |
| **R3. Uncertain estimates** | Unknown charges remain visible, and under a spending limit an unpriced cloud model does not start. Estimates are never labeled guaranteed maximums. |
| **R4. Editor complexity** | Authors can tell what runs, what comes out, and whether an action executes anything from the canvas and adjacent controls. |
| **R5. Stalled joins or misleading partial success** | Untaken branches, empty collections, and every exit path resolve explicitly. Failures, supervisor skips, and content-filter drops do not emit successful partial collections. |
| **R6. Scope and compatibility** | Old fixtures retain behavior. Deferred features are not first-release dependencies. |
| **R7. Misleading tests** | Later-item tests clearly use initial state and cannot mutate live results or state. |
| **R8. Unsafe inspection** | Record selection executes nothing. Retention, redaction, access checks, and missing-data behavior are tested. |
| **R9. Slow sequential loops** | A53 measures inner-run cost per iteration against the D26 maximum. Long loops report progress per item. |
| **R10. Work leaking from an untaken branch** | A branch node with an input from outside the region, and a branch node with no inputs, make zero provider calls when its branch is not taken. |

## Milestone 1: Contract and implementation audit

- [ ] **A1.** Enumerate existing branch, join, loop, correlation, and grouping
  implementations and tests. F10 to F25 record the grouping, historical-UI,
  graph-tool, execution, and spending audit. Add reproduction tests for F19
  (a branch node with an outside input runs on the untaken side) and F21 (a
  supervisor skip or content-filter drop removes one item from a collected
  list). Verify reuse through behavior, not comments.
- [ ] **A2.** Define the schema for ownership, nesting, stable ports, and legal
  crossing edges. Distinguish visual groups from execution regions, including
  the root-scope rule in F22. Define the semantic agent-edit contract needed by
  A52: create region, assign branch membership, and edit boundary ports without
  coordinates. This contract portion of A30 moves here. Full adapters remain A30.
- [ ] **A52.** After A2 and before production UI implementation, prototype
  conditional repair and a For Each Region containing an If Region using
  current group interactions. Resolve the
  missing behaviors in F12, F13, and F16. Exercise equivalent semantic edits
  through the proposed agent contract, without requiring coordinate placement to
  express membership. Verify the resulting graph is readable and editable by a
  person. Use sample data and stub execution for this authoring check.
- [ ] **A53.** Spike D24 headlessly. Compile a branch and a body to inner graphs,
  run them through `runInnerGraph`, and measure overhead per iteration at 1, 100,
  and 1,000 items. A36 uses these numbers to set the D26 maximum. Verify parent
  cancellation, cost roll-up, generation origin, and message forwarding. Accept
  D24 or record why the in-graph alternative was chosen.
- [ ] **A3.** Specify branch completion and type validation using D1 and D5.
- [ ] **A4.** Specify iteration completion and state commits using the outcome
  table, D25, and D26.
- [ ] **A5.** Map errors, cancellation, exhaustion, and late messages to the
  existing run lifecycle without treating them as successful completion.
- [ ] **A6.** Run legacy compatibility fixtures under D28. Record the exact older
  editor versions tested and the inspected source commit. Load and save a graph
  with unknown region nodes, node data, and members' `parent_id`, then compare
  the saved graph. Separately verify execution refusal and old-fixture behavior.
  A destructive round trip blocks the compatibility claim and region release.
- [ ] **A35.** Define structural-depth and subworkflow call-depth accounting,
  including how regions count toward `MAX_INNER_GRAPH_DEPTH`.
- [ ] **A39.** Complete the budget audit started in F23 to F25. List every paid
  call path that bypasses the generation seam and `BaseProvider` admission,
  including ambiguous submissions and delayed charges. Confirm that every paid
  node type has an invocation-level estimate for D27, and list the ones that
  would be refused as unpriced under a limit.

Acceptance: output and exit semantics are defined, D24 is confirmed or replaced,
and A6 establishes a safe compatibility boundary. Required changes and existing
implementation support are identified before scheduler work.

## Milestone 2: Format and execution foundation

Depends on milestone 1.

- [ ] **A7.** Add region definitions and ports to shared schemas and round-trip
  them through save, load, export, and import.
- [ ] **A8.** Validate ownership, nesting, types, cycles, and crossing edges.
  Reject unsupported new region kinds without rejecting valid legacy nodes.
- [ ] **A9.** Implement scoped entry, completion, and cancellation. Inactive
  branches must not start, including disconnected nodes inside the branch and
  nodes that also receive inputs from outside it.
- [ ] **A10.** Give each region invocation and each item its own inner run (D24),
  and drop messages from a run that has finished. Include concurrent parent
  invocations from an outer legacy ForEach in the isolation tests.
- [ ] **A11.** Add headless fixtures for branches, joins, nested scopes, and
  malformed graphs. Prove new checks reject invalid inputs and inspect data.
- [ ] **A36.** Stress-test deep and wide graphs, choose the structural cap and the
  D26 item maximum, and test at and beyond each through the shared validator
  used by graph entry points.
- [ ] **A37.** Pass the owning run's `RunBudget` to every inner run, so nested
  regions, Subgraph, Workflow, and App nodes reserve against the same limit.
  Verify none of them can reset it.
- [ ] **A40.** Implement D27: the workflow `RunBudget`, node-invocation
  reservation and commit, the setting, the `--cost-cap` flag, and the stop and
  unpriced-node messages. Do this at the shared boundary, not separately in each
  region.
- [ ] **A41.** Test competing reservations, retries, nested work, unknown costs,
  cancellation after acceptance, and ambiguous failures. A rejected submission
  must never reach a provider. A run with no limit behaves as it does today, a
  local model runs under a limit, and an unpriced cloud model is refused under
  one.

Acceptance: headless region execution is isolated, invalid structure fails before
work starts, and every billable request passes the owning run's spending policy.

## Milestone 3: If Region

Depends on milestone 2.

- [ ] **A12.** Execute one branch and emit its declared outputs once.
- [ ] **A13.** Add fixed Then / Else editing, boundary wiring, collapse,
  copy/paste, and undo/redo with accessible controls.
  Reuse verified grouping interactions from A1. Prototype the missing execution
  controls and boundary ports before committing to their detailed layout.
- [ ] **A14.** Support wrapping selected nodes, requiring explicit output mapping
  where crossing-edge intent cannot be inferred.
- [ ] **A51.** Preview membership changes, validate connections, and support
  keyboard operation and one-step undo. Resizing and overlap must not change
  membership. Invalid moves preserve the original graph.
- [ ] **A15.** Show selected and skipped branches and retain readable output
  labels when collapsed.
- [ ] **A16.** Test both branches, nesting, explicit pass-through Else, missing
  required outputs, null where allowed by type, and downstream joins. Assert zero
  provider calls and side effects in the unselected branch, including the R10
  cases.
- [ ] **A38.** Add nesting guidance from D6 and verify small-window readability.
Acceptance: conditional image repair produces one result and saves once, with
no work performed in the unselected branch.

## Milestone 4: Sequential For Each Region

Depends on milestone 3.

- [ ] **A17.** Implement one collection, constant boundary inputs, item/index,
  sequential body completion, and the D26 maximum.
- [ ] **A18.** Add ordered Results and optional named state with initial values.
- [ ] **A19.** Add Keep and Stop after iteration using the outcome table.
- [ ] **A20.** Show progress and completion reason. Reveal state and optional
  controls on demand, without logging sensitive payloads.
- [ ] **A54.** Price a For Each Region body per item in the editor estimate and the
  pre-run gates, multiplied by the collection size when known (D10, F25).
- [ ] **A21.** Test the outcome table, nested loops, concurrent parent inputs,
  constant inputs, result ordering, and D25. Failure, a supervisor skip, and a
  content-filter drop must stop subsequent items and must not publish a
  successful partial collection.
- [ ] **A42.** Validate conditional repair and filtered collection with creators.
  Check understanding of execution, outputs, Keep, stopping, and spending before
  adding controls. Repeat this usability check for milestones 4a and 4b.

Acceptance: a collection runs in order, filters results without skipping body
work, and stops with the specified success or failure behavior.

## Milestone 4a: Test one item

Depends on milestone 4. Deliver before recorded inspection.

- [ ] **A43.** Add a headless single-item entry point using the existing region
  executor. Validate supplied/resolved inputs and preserve the chosen index.
  Address the selected-run mismatch in F14, including test-cache isolation.
- [ ] **A44.** Isolate test identity, initial state, outputs, and provenance.
  Return the body's result, next state, Keep, and stop decision for inspection.
- [ ] **A45.** Add the test controls and direct Run test action described in D17.
  Keep the state source, estimate, and spending limit visible beside the button,
  including in small windows.
- [ ] **A46.** Test samples, later-item indices, missing inputs, nested execution,
  state isolation, and budget exhaustion. Assert no upstream execution, external
  downstream execution, or second outer item. A subsequent full run must remain
  unaffected by test selection.

Acceptance: an author can test one item using initial state, with visible spending
policy and separate results, without running the surrounding workflow.

## Milestone 4b: Recorded inspection

Depends on milestone 4a. This is read-only inspection, not replay.

- [ ] **A47.** Add bounded records for available node summaries, branch choices,
  statuses, and errors using existing trace policies. Carry region invocation
  and iteration identity on forwarded inner-run messages. Specify iteration and
  byte limits and expose truncation. Do not require full snapshots.
- [ ] **A48.** Add item selection, previous/next, and a failed-item shortcut to
  existing inspectors. Apply one selected historical context consistently.
- [ ] **A50.** Test nested identity, graph edits, missing records, expiry,
  retention limits, redaction, and access checks. Assert zero node execution and
  provider calls during inspection, and no substitution of latest/live values.

Acceptance: authors can inspect available records for one iteration. Missing data
and earlier revisions are explicit. Selecting an item incurs no execution.

## Milestone 7: First-release verification

Depends on milestones 1-4, 4a, and 4b. Complete relevant checks in each delivery.

- [ ] **A30.** Implement shared tools and browser/headless adapters from A2's
  semantic-edit contract, plus recorded-iteration inspection. Test agent creation, branch
  reparenting, port edits, save/reload, and subsequent manual editing. Verify
  revision conflicts, failed edits leaving the graph unchanged, and resource-ID
  boundaries. Return readable membership and status without requiring a screenshot.
- [ ] **A31.** Verify examples covering conditional repair, filtered collection,
  stopping, single-item testing, and inspection. Include a stateful example that
  makes a later-item test's initial-state assumption visible.
- [ ] **A32.** Update [loop guidance](https://github.com/nodetool-ai/nodetool/blob/main/docs/workflow-loops.md), the
  [correlation design](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) where regions change scheduling,
  [costs and credits](../costs-and-credits.md) for new spending behavior,
  affected shipped authoring skills, and area instructions when behavior changes.
- [ ] **A33.** Register applicable selfchecks and verify gate selection using
  [Harness-First Engineering](../HARNESS_FIRST.md) and the
  [harness reference](../harnesses.md).
- [ ] **A34.** Follow [repository verification requirements](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#mandatory-post-change-verification)
  and record evidence in each implementing PR.

Release requires the milestone acceptance criteria, legacy compatibility,
round-trip persistence, and required checks. No deferred task is a release gate.

## Deferred work

These identifiers remain for traceability, not as implementation commitments.
Revisit them only after the first release supplies evidence of a need.

| Identifiers | Deferred scope |
|---|---|
| **D2, A22-A25, milestone 5** | Switch cases, Repeat, conditional repetition, and legacy-loop conversion. |
| **A26-A29, milestone 6** | Immediate Continue / Break and their ordering checkpoints. |
| **A49** | Restoring complete recorded inputs and pre-iteration state for a new test. Summaries are insufficient. |

Also deferred: If without Else and optional-output modes, multiple collection
inputs, parallel loops, labeled outer exits, configurable error policies,
exception regions, automatic upstream execution for tests, replay, full-state
archival, new subworkflow extraction tooling, and moving the S7 provider
packages behind the generation seam.

## Reference lessons

### Earlier NodeTool implementations

| Reference | Useful evidence | Limits on reuse |
|---|---|---|
| [ForEach and If region commit](https://github.com/nodetool-ai/nodetool/commit/0f1a56a392bc1e7ced1d4cd065eaa8cfa1e32af3), on `copilot/add-foreach-and-if-regions` | `ForEachRegion.tsx`, `IfRegion.tsx`, shared `RegionNode.tsx`, badges, resizing, and graph serialization changes. | This commit is not an ancestor of the checkout examined for this plan. Its changes are frontend-only and do not prove backend execution. The If component describes position-based branch assignment, which conflicts with explicit membership in D5. |
| Removed `web/src/components/node/LoopNode.tsx`, accessible through `git log --all -- web/src/components/node/LoopNode.tsx` | History of boundary input/output styling, resizing, child selection, and experimental collapse. | Historical behavior may be incomplete or incompatible with current stores, primitives, and execution. Check the relevant revisions and tests before porting anything. |
| [Subgraph](https://github.com/nodetool-ai/nodetool/blob/main/packages/core-nodes/src/nodes/subgraph.ts) and [Workflow](https://github.com/nodetool-ai/nodetool/blob/main/packages/core-nodes/src/nodes/workflow.ts) nodes | Current, tested isolated execution with named inputs and outputs, cancellation, cost roll-up, and a depth limit (F18). | They run once per invocation and admit no spend. Region bodies need per-iteration runs, shared limits, and iteration identity on messages. |

These are design references, not approved implementations or instructions to
restore a branch. Verify actual behavior and compatibility before reuse. Keep
branch membership explicit for both human and agent authoring, and do not infer
runtime support from a rendered container or progress badge.

### Other node editors

[vvvv loops](https://thegraybook.vvvv.org/reference/language/loops.html) distinguish
collected results from carried state, and Keep from finishing the current
iteration before breaking. NodeTool uses the explicit label Stop after iteration.

[Houdini Block End](https://www.sidefx.com/docs/houdini/nodes/sop/block_end.html)
provides Single Pass execution and separates gathered results from feedback.
[Blender Repeat Zone](https://docs.blender.org/manual/en/5.1/modeling/geometry_nodes/utilities/repeat_zone.html)
provides an inspection index. Borrow these distinctions while keeping testing
and recorded inspection separate because NodeTool execution may incur charges.
