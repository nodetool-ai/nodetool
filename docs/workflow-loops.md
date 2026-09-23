# Workflow Loops

Status: implemented in the TypeScript kernel.

A workflow graph may contain a cycle when the cycle closes on a `Loop` node's
feedback input. Every other cycle is still rejected. This page describes the
`Loop` node, the graph rules that keep a looped graph analyzable, and how the
kernel runs and terminates a cycle.

Scheduling background: [correlation design](correlation-design.md).

## Why a dedicated node

The kernel runs one actor per node. An actor finishes when every input handle
has reached end of stream (EOS), and it then sends EOS downstream. In a cycle
each node waits for the EOS of a node that waits for it, so EOS alone can never
end a loop. Correlation analysis also needs a topological order to assign
scopes. Both problems disappear when the kernel knows exactly which edges close
a cycle and which node owns the decision to stop.

Three designs were considered.

1. **Back edge to any node.** The branch that loops goes straight to an
   arbitrary upstream node. That node then receives its first value from the
   entry edge and later values from the back edge on the same handle, which the
   correlation model rejects (two edges into a non-list handle), and nothing
   bounds the iteration count.
2. **Paired start and end nodes** (Houdini block begin/end, Blender repeat
   zone). Clear, but two nodes must be placed, paired, and validated as a pair.
3. **One `Loop` node that owns entry, feedback, decision, and exit.** The body
   feeds its result back into the `Loop` node. The `Loop` node either sends the
   value around again or out through its exit.

NodeTool uses design 3. It reads like `If`: a condition picks one of two
branches, and one branch (`value`) leads through the body back to the node
itself. The back edge always lands on the node that owns the iteration limit,
so every cycle is bounded by construction.

## The `Loop` node

`nodetool.control.Loop`

| Handle | Direction | Type | Meaning |
|---|---|---|---|
| `initial` | input | any | Value that enters the loop. Wired from outside the loop or set as a property. |
| `next` | input, feedback | any | Value for the next iteration. Wired from the loop body. Required. |
| `condition` | input, feedback | bool | Loop again while true. Wired from the loop body. Default `true`. |
| `max_iterations` | property | int | Upper bound on body runs. Default 10, range 1–1000. |
| `value` | output | any | The current iteration's value: `initial` first, then each `next`. |
| `index` | output | int | Iteration number, starting at 0. |
| `done` | output | any | The final `next` value, emitted once when the loop exits. |

The loop is a do-while. For iteration `k`:

```
v = initial
for k in 0 .. max_iterations - 1:
    emit value = v, index = k
    wait for next_k (and condition_k when condition is wired)
    if not condition_k or k == max_iterations - 1:
        emit done = next_k
        stop
    v = next_k
```

With `condition` unwired the body runs exactly `max_iterations` times, which
makes the node a fold. Reaching `max_iterations` while `condition` is still
true ends the loop normally and posts a node warning, so a runaway loop is
visible.

Example: refine a draft until a judge accepts it.

```
Prompt ──► Loop.initial
           Loop.value ──► Rewrite ──► Judge ──► Not ──► Loop.condition
                          Rewrite ─────────────────────► Loop.next
           Loop.done  ──► Output
```

## Graph rules

A **back edge** is a data edge whose target is a `Loop` node's `next` or
`condition` handle. `isLoopBackEdge` in `@nodetool-ai/protocol` is the one
definition every surface uses. The **body** of a loop is every node reachable
from the loop's `value` or `index` output that can also reach one of its back
edges without crossing another back edge. Nodes that only observe iterations
(a `Preview` of each value, a `Collect` of all values) are downstream of the
loop but outside the body.

Correlation analysis enforces these rules at load time.

- **L1.** The graph without its back edges must be acyclic. Any other cycle is
  reported with the nodes involved and a hint to route it through a `Loop`.
- **L2.** Each `Loop` must have `next` connected.
- **L3.** A back edge must carry the loop scope, which is the scope of
  `initial` plus the loop's own iteration root. A shorter scope means the edge
  comes from outside the loop (set the value as a property instead). A longer
  scope means the body fans out per item and never collapses back to one value
  per iteration.
- **L4.** `initial` and the back edges may not be chunk streams
  (`repeats_per_key`). Each loop run starts from one value and each iteration
  feeds back one value.
- **L5.** No body node may have an `aggregate` output (`Collect`, `Last`,
  `Count`). Those nodes emit when their input stream ends, and inside a body the
  stream ends only after the loop has finished.
- **L6.** `max_iterations` is a property and may not be wired.
- Self-loop edges stay invalid, including `Loop.value → Loop.next`.

## Correlation

The `Loop` node mints an iteration root `<loop id>:loop`, like `ForEach` mints
`<id>:items`. Iteration `k` of the loop run for parent key `P` carries lineage
`P + {<loop id>:loop: k}`. So every body node fires once per iteration, joins
inside the body are keyed per iteration, and parent-scope values wired into the
body from outside stay sticky across iterations.

`done` carries the parent lineage `P`, so downstream of the exit the loop root
is gone. When `initial` iterates (a `ForEach` feeding `Loop.initial`), each item
runs its own loop concurrently and the item keys keep them apart.

Analysis handles a `Loop` node before its body: back edges are left out of the
topological order, the feedback handles are assigned the loop scope, and after
the pass each back edge's computed scope is checked against it (rule L3).

## Runtime

A `Loop` node runs in its own actor mode (`runLoop` in
`packages/kernel/src/loop.ts`). It does not call the node's `process()`.

- A value on `initial` starts a loop run for its parent key and emits iteration
  0. An unwired `initial` starts one run from the property value.
- A value on `next` or `condition` is matched to the active run by parent key
  and iteration index. Values for a finished run or a past iteration are
  logged and dropped.
- When `initial` has closed and no run is active, the node closes `value` and
  `index`. EOS then flows through the body and back into `next` and
  `condition`, the node's inbox drains, and the actor finishes. That is how a
  cycle reaches EOS.

### Iterations that never feed back

A body can end an iteration without producing `next`: an `If` sends the value
down its other branch, a filter drops it, or a node is skipped. Nothing in the
kernel announces that absence in time, because EOS on the back edge waits for
the loop to close first. The kernel detects it in two ways.

1. **Feedback closed.** When `next` (or a wired `condition`) has reached EOS
   with no buffered value, the active runs waiting on it end.
2. **Quiescence.** For graphs with a `Loop`, every inbox reports when its actor
   parks waiting for input. When every live actor is parked, no streaming
   input is open, and inbox activity has happened since the last check, the
   runner tells each `Loop` the graph is quiescent. A parked actor is not
   running a provider call, a timer, or a write, so nothing can still feed the
   loop, and the `Loop` ends every run that is waiting for feedback.

A run that ends this way emits nothing on `done`. That supports exiting a loop
from inside the body:

```
Loop.value ──► Generate ──► Judge ──► If(condition = good, value = Generate)
                                        if_false ──► Loop.next
                                        if_true  ──► Output
```

The accepted value leaves through `if_true` at loop scope, and the loop ends at
the next quiescent point.

## Editor and tooling

The editor, the agent graph builder, and the workflow document tools reject a
new edge that closes a cycle, unless the edge is a back edge or the cycle it
closes passes through a back edge. Scope rules (L3–L6) are checked by the
kernel when the workflow runs or is validated with `nodetool validate`.

The DSL builds graphs from already-created output handles, so it cannot express
a back edge. Exporting a looped workflow to DSL reports the cycle.

## Limits

- Nested iteration inside a body must stay one value per iteration (L3, L5).
  Use a list node or a Code node to map over a list inside one iteration.
- A body iteration dropped by a stream-mode filter is detected at the next
  quiescent point, which waits for unrelated busy branches.
- `while` semantics (check before the first iteration) need an `If` before the
  `Loop`.
