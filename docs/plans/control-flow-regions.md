# Control-flow regions

## First release

Ship If / Else and sequential For Each, followed by Test one item and read-only
inspection of recorded iterations. Keep defaults simple: one collection, ordered
results, no carried state unless added, and stop on failure.

Build only the shared ownership, ports, completion, and budget behavior these
features need. Reuse existing execution and provider infrastructure. Preserve
stable identities and versioned workflow data without building a general
control-flow framework.

Delivery order is milestones 1, 2, 3, 4, 4a, 4b, then 7. Existing identifiers are
retained so earlier discussions remain traceable. Milestones 5 and 6 are deferred.

## Existing behavior and compatibility

The [control nodes](../../packages/core-nodes/src/nodes/control.ts) already
provide conditional routing and item emission. Sequential emission alone does
not mean the downstream body finishes before the next item starts. The existing
[feedback loop](../workflow-loops.md) can terminate without a `done` value when
feedback is missing.

New regions need explicit completion. Existing If, Switch, ForEach, and Loop
workflows keep their behavior. Automatic conversion is outside this release.

Use the existing [GroupNode](../../web/src/components/node/GroupNode.tsx) and
[grouping hooks](../../web/src/hooks/nodes/useSurroundWithGroup.ts) as the starting
point for canvas interactions. The current
[groupability rules](../../web/src/hooks/nodes/useIsGroupable.ts) prohibit nested
groups, so nested execution regions require an explicit design and tests.
Existing grouping does not establish region execution semantics.

## Audit findings

This audit inspected current grouping hooks, drag handlers, GroupNode, graph
serialization, subgraph extraction, selected-node execution, frontend graph
tools, their shared schemas, and the headless workflow-document adapter. Historical
sources were the region commit linked below and `LoopNode.tsx` at
`1edf9aadb9^`. This was a source and focused-test audit, not a browser usability
test or an end-to-end demonstration of historical region execution.

### Reuse

- **F10. Existing group interactions are the baseline.**
  [Surround](../../web/src/hooks/nodes/useSurroundWithGroup.ts) creates the
  container and reparents children in one store write.
  [Add](../../web/src/hooks/nodes/useAddToGroup.ts) converts positions and grows
  the frame without a separate resize undo step.
  [Remove](../../web/src/hooks/nodes/useRemoveFromGroup.ts) restores positions.
  [GroupNode](../../web/src/components/node/GroupNode.tsx) already supplies
  resizing, title/color editing, selection behavior, and child status. Reuse
  these interaction patterns and existing undo helpers, adapting touched UI to
  current primitives and tokens rather than copying styles wholesale.
- **F11. Persistence and boundary-rewrite foundations exist.**
  [Serialization](../../web/src/stores/reactFlowNodeToGraphNode.ts) already
  saves `parent_id` and dimensions, and the reverse adapter restores membership.
  [Group into Subgraph](../../web/src/hooks/nodes/useGroupIntoSubgraph.ts) rewrites
  crossing edges into named inputs/outputs. Reuse its planning and undo approach.
  Its generated input nodes use StringInput, so do not assume its current port
  construction supplies the typed branch/state boundaries needed here.

### Change before reuse

- **F12. Nesting requires more than allowing a container type.**
  [Groupability](../../web/src/hooks/nodes/useIsGroupable.ts) prohibits grouped
  groups. Add ignores already-parented nodes, Remove adds only the immediate
  parent's position, and GroupNode run/bypass/status operations select direct
  children. Reuse [absolute positions](../../web/src/utils/absoluteNodePosition.ts)
  and [descendant traversal](../../web/src/utils/withGroupContents.ts) where
  appropriate, but define each operation's scope explicitly. Keep visual-group
  behavior unchanged while adding region ancestry, cycle checks, nested moves,
  and atomic validation of crossing edges.
- **F13. Existing drag gestures need execution-aware rules.**
  [Drag handlers](../../web/src/hooks/handlers/useDragHandlers.ts) remove nodes
  during modifier-key or wiggle gestures, and choose an intersecting group as
  the drop target. Execution regions need a clear prospective branch/body target
  and validation before membership changes. Do not let a wiggle silently move a
  paid operation outside its condition. Preserve ordinary group gestures and
  prototype the region-specific preview and commit behavior without new dialogs.
- **F14. Run Group is not Test one item.** GroupNode runs its direct children
  through [Run selected](../../web/src/hooks/nodes/useRunSelectedNodes.ts).
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
  [Get graph](../../web/src/lib/tools/builtin/getGraph.ts) and the
  [headless adapter](../../packages/node-sdk/src/workflow-document-tools.ts)
  expose parent IDs. The inspected [tool schemas](../../packages/protocol/src/toolSchemas.ts)
  offer no parent/branch parameter on node creation, and
  [Add node](../../web/src/lib/tools/builtin/addNode.ts) creates a root node.
  [Update node data](../../web/src/lib/tools/builtin/updateNodeData.ts) changes
  data, not structural parent membership. Extend the shared graph-tool contract
  for region creation, membership/branch edits, and named ports in both browser
  and headless adapters. Agents also need scoped testing, read-only iteration
  inspection, compact region/status summaries, and actionable validation errors.
  Preserve revision checks and ID handling. A canvas move must never substitute
  for a semantic membership operation.

The focused grouping and selected-run suites passed during the audit. Reproduce
that check with:

```bash
npm run test --workspace=web -- --runInBand --runTestsByPath src/hooks/nodes/__tests__/useAddToGroup.test.ts src/hooks/nodes/__tests__/useRemoveFromGroup.test.ts src/hooks/nodes/__tests__/useSurroundWithGroup.test.tsx src/hooks/nodes/__tests__/useRunSelectedNodes.test.ts
```

These tests support reuse of existing behavior. They do not verify nested
execution regions, branch ports, agent region edits, or the historical UI.

## Execution contract

### Branches and membership

**D1.** If / Else has a fixed Then / Else layout and shared named outputs.
Only the selected branch executes, including nodes without wired inputs. Both
branches must supply compatible values for every declared output. For a no-op
Else, wire through the input explicitly. An absent required output is an error,
not an implicit null. Separate optional-output and fallback modes are deferred.

**D5, D21.** Store membership and ports explicitly, independent of canvas
position. Preview boundary-crossing moves, validate affected connections, and
support one-step undo. Resizing a region never captures or releases nodes.
Editor, imported, API, and agent-authored graphs use the same validation.
Completion is delivered separately from values so untaken branches cannot leave
joins waiting indefinitely.

### For Each defaults

**D3, D4, D18, D19.** Accept one finite collection. Other boundary inputs are
resolved once and remain constant for that invocation. Combining collections is
an explicit upstream operation. Each iteration finishes before the next begins.
Collect kept results in input order. Label outputs Results and optional feedback
ports State for next item. State fields require initial values and explicit next
values. Commit state only after successful body completion.

Keep defaults to true. Stop after iteration defaults to false. Neither requires
a visible control until the author adds it. Their interaction is defined here:

| Outcome | Results and state | Completion |
|---|---|---|
| Body succeeds, Keep=true | Append result and commit next state. | Start next item unless stopping. |
| Body succeeds, Keep=false | Omit result and commit next state. | Start next item unless stopping. |
| Last item succeeds | Apply Keep and commit final state. | Return collected results and final state once. |
| Stop after iteration=true | Apply Keep and commit state for this completed iteration. | Return collected results and final state once. Start no later item. |
| Empty collection | Empty results and unchanged initial state. | Success, with No items to process. |
| Failure, cancellation, or exhausted budget | Retain available completed records for inspection. | No successful region output to downstream nodes. Report the reason. |

**D22.** Stop on item failure after existing permitted node retries are exhausted.
Do not introduce a region-level retry or skip-error policy. Identify the failed
item. Cancellation cannot undo completed side effects or accepted provider work.
Successful early stopping is distinct from failure or budget exhaustion.

### Nesting and presentation

**D6, D8.** Support nested conditionals and sequential loops. Aim for one or two
expanded levels. Give nonblocking guidance when adding a third level and a
stronger collapse recommendation at four, without persistent warnings. The
outermost region is level one. Reuse subworkflow extraction only where it already
exists. Independently enforce a structural depth cap chosen through stress tests.
Collapsed regions still count toward that cap.

**D11.** Keep default layouts focused on condition and branch outputs, or item
and results. Reveal state and advanced controls on demand. Collapsing affects
presentation only. Follow the [design system](../DESIGN.md),
[UX guidelines](../UX_GUIDELINES.md), and
[primitives strategy](../../web/src/components/ui_primitives/STRATEGY.md).

### Spending and execution limits

**D7, D9.** Nested regions, subworkflow calls, and retries share the owning run's
execution, time, concurrency, and spending limits. No nested invocation resets
these counters. At the shared billable-request boundary, authorize and reserve
before submission, then reconcile known charges. Reservations must be atomic
across concurrent callers and reduce available funds. Retain unresolved
reservations when submission or charging is uncertain. Stop new submissions
when a limit is reached.

**D10.** Distinguish estimates from enforceable ceilings. Reuse the run's spending
policy, rather than adding region-specific budget modes. Under a strict ceiling,
reject requests whose charges cannot be bounded by enforced request parameters.
An estimated-budget policy must be explicit and show possible overruns or unknown
costs. Cancellation does not guarantee a refund. The implementation audit must
identify gaps in existing controls before paid region execution ships. This
release does not require a new pricing engine or account-wide billing system.

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
Use the same spending controls described above, with one test-run budget shared
by nested work and retries, plus existing account-level limits where applicable.
Testing may incur charges and body side effects.

Show item, state source, nested scope, and budget beside Run test. Distinguish
remaining budget from estimated or unknown cost. Run test starts execution
directly under that displayed policy, without a confirmation dialog.

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

## Risks and mitigations

| Risk | Required evidence |
|---|---|
| **R1. Ambiguous execution order** | Stop after iteration finishes the body and starts no next item. Immediate exits remain deferred. |
| **R2. Accidental overspend** | Competing requests, nested work, and retries cannot bypass shared reservation checks. |
| **R3. Uncertain estimates** | Unknown charges remain visible and strict ceilings reject unbounded requests. Estimates are never labeled guaranteed maxima. |
| **R4. Editor complexity** | Authors can tell what runs, what comes out, and whether an action executes anything from the canvas and adjacent controls. |
| **R5. Stalled joins or misleading partial success** | Untaken branches, empty collections, and every exit path resolve explicitly. Failures do not emit successful partial collections. |
| **R6. Scope and compatibility** | Old fixtures retain behavior. Deferred features are not first-release dependencies. |
| **R7. Misleading tests** | Later-item tests clearly use initial state and cannot mutate live results or state. |
| **R8. Unsafe inspection** | Record selection executes nothing. Retention, redaction, access checks, and missing-data behavior are tested. |

## Milestone 1: Contract and implementation audit

- [ ] **A1.** Enumerate existing branch, join, loop, correlation, and grouping
  implementations and tests. Use F10-F17 as the completed grouping, historical-UI,
  and graph-tool audit. Complete the execution/correlation and budget audit
  before choosing runtime changes. Verify reuse through behavior, not comments.
- [ ] **A2.** Define the schema for ownership, nesting, stable ports, and legal
  crossing edges. Distinguish visual groups from execution regions.
- [ ] **A52.** Before production UI implementation, prototype conditional repair
  and a For Each containing an If using current group interactions. Resolve the
  missing behaviors in F12, F13, and F16. Exercise equivalent semantic edits
  through the proposed agent contract, without requiring coordinate placement to
  express membership. Verify the resulting graph is readable and editable by a
  person. Use sample data and stub execution for this authoring check.
- [ ] **A3.** Specify branch completion and type validation using D1 and D5.
- [ ] **A4.** Specify iteration completion and state commits using the outcome table.
- [ ] **A5.** Map errors, cancellation, exhaustion, and late messages to the
  existing run lifecycle without treating them as successful completion.
- [ ] **A6.** Define workflow format versioning and legacy compatibility tests.
- [ ] **A35.** Define structural-depth and subworkflow call-depth accounting.
- [ ] **A39.** Audit provider submission and budget paths against D7-D10. Identify
  required changes, including ambiguous submissions and delayed charges. Reuse
  existing controls and record any unsupported paid execution paths.

Acceptance: the contract has no unresolved output or exit semantics. Required
changes and existing implementation support are identified before scheduler work.

## Milestone 2: Format and execution foundation

Depends on milestone 1.

- [ ] **A7.** Add region definitions and ports to shared schemas and round-trip
  them through save, load, export, and import.
- [ ] **A8.** Validate ownership, nesting, types, cycles, and crossing edges.
  Reject unsupported new region kinds without rejecting valid legacy nodes.
- [ ] **A9.** Implement scoped entry, completion, and cancellation. Inactive
  branches must not start, including disconnected nodes inside the branch.
- [ ] **A10.** Integrate correlation scopes and reject late outputs from finished
  invocations. Include concurrent parent invocations in the isolation tests.
- [ ] **A11.** Add headless fixtures for branches, joins, nested scopes, and
  malformed graphs. Prove new checks reject invalid inputs and inspect data.
- [ ] **A36.** Stress-test deep and wide graphs, choose the structural cap, and
  test at and beyond it through the shared validator used by graph entry points.
- [ ] **A37.** Integrate shared execution limits and verify nested invocations
  cannot reset them.
- [ ] **A40.** Implement missing reservation and reconciliation behavior from A39
  at the shared request boundary, not separately in each region.
- [ ] **A41.** Test competing reservations, retries, nested work, unknown costs,
  cancellation after acceptance, and ambiguous failures. A rejected submission
  must never reach a provider.

Acceptance: headless region execution is isolated, invalid structure fails before
work starts, and every billable request passes the owning run's spending policy.

## Milestone 3: If / Else

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
  provider calls and side effects in the unselected branch.
- [ ] **A38.** Add nesting guidance from D6 and verify small-window readability.

Acceptance: conditional image repair produces one result and saves once, with
no work performed in the unselected branch.

## Milestone 4: Sequential For Each

Depends on milestone 3.

- [ ] **A17.** Implement one collection, constant boundary inputs, item/index,
  and sequential body completion.
- [ ] **A18.** Add ordered Results and optional named state with initial values.
- [ ] **A19.** Add Keep and Stop after iteration using the outcome table.
- [ ] **A20.** Show progress and completion reason. Reveal state and optional
  controls on demand, without logging sensitive payloads.
- [ ] **A21.** Test the outcome table, nested loops, concurrent parent inputs,
  constant inputs, and result ordering. Failure must stop subsequent items and
  must not publish a successful partial collection.
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
  Keep state and budget visible beside the button, including in small windows.
- [ ] **A46.** Test samples, later-item indices, missing inputs, nested execution,
  state isolation, and budget exhaustion. Assert no upstream execution, external
  downstream execution, or second outer item. A subsequent full run must remain
  unaffected by test selection.

Acceptance: an author can test one item using initial state, with visible spending
policy and separate results, without running the surrounding workflow.

## Milestone 4b: Recorded inspection

Depends on milestone 4a. This is read-only inspection, not replay.

- [ ] **A47.** Add bounded records for available node summaries, branch choices,
  statuses, and errors using existing trace policies. Specify iteration and byte
  limits and expose truncation. Do not require full snapshots.
- [ ] **A48.** Add item selection, previous/next, and a failed-item shortcut to
  existing inspectors. Apply one selected historical context consistently.
- [ ] **A50.** Test nested identity, graph edits, missing records, expiry,
  retention limits, redaction, and access checks. Assert zero node execution and
  provider calls during inspection, and no substitution of latest/live values.

Acceptance: authors can inspect available records for one iteration. Missing data
and earlier revisions are explicit. Selecting an item incurs no execution.

## Milestone 7: First-release verification

Depends on milestones 1-4, 4a, and 4b. Complete relevant checks in each delivery.

- [ ] **A30.** Extend shared tools and browser/headless adapters for the operations
  in F17, including recorded-iteration inspection. Test agent creation, branch
  reparenting, port edits, save/reload, and subsequent manual editing. Verify
  revision conflicts, failed edits leaving the graph unchanged, and resource-ID
  boundaries. Return readable membership and status without requiring a screenshot.
- [ ] **A31.** Verify examples covering conditional repair, filtered collection,
  stopping, single-item testing, and inspection. Include a stateful example that
  makes a later-item test's initial-state assumption visible.
- [ ] **A32.** Update [loop guidance](../workflow-loops.md), affected shipped
  authoring skills, and area instructions when behavior changes.
- [ ] **A33.** Register applicable selfchecks and verify gate selection using
  [Harness-First Engineering](../HARNESS_FIRST.md) and the
  [harness reference](../harnesses.md).
- [ ] **A34.** After code changes, build packages, then run `npm run test:affected`,
  `npm run typecheck`, `npm run lint`, and
  `npm run dev:nodetool -- harness gate --base origin/main`. Record evidence in
  each implementing PR. Run `npm run check:agents-docs` for instruction changes.

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
archival, and new subworkflow extraction tooling.

## Reference lessons

### Earlier NodeTool implementations

| Reference | Useful evidence | Limits on reuse |
|---|---|---|
| [ForEach and If region commit](https://github.com/nodetool-ai/nodetool/commit/0f1a56a392bc1e7ced1d4cd065eaa8cfa1e32af3), on `copilot/add-foreach-and-if-regions` | `ForEachRegion.tsx`, `IfRegion.tsx`, shared `RegionNode.tsx`, badges, resizing, and graph serialization changes. | This commit is not an ancestor of the checkout examined for this plan. Its changes are frontend-only and do not prove backend execution. The If component describes position-based branch assignment, which conflicts with explicit membership in D5. |
| Removed `web/src/components/node/LoopNode.tsx`, accessible through `git log --all -- web/src/components/node/LoopNode.tsx` | History of boundary input/output styling, resizing, child selection, and experimental collapse. | Historical behavior may be incomplete or incompatible with current stores, primitives, and execution. Check the relevant revisions and tests before porting anything. |

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
