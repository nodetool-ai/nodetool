# Kernel Parity Gaps

Tracked differences between the TypeScript kernel (`packages/kernel`) and the
reference Python runtime. Each gap has regression tests that assert the
**current** TypeScript behavior so a future fix is an explicit, reviewed change
rather than a silent one. The desired end-state is recorded here instead of as
bare `// TODO` comments scattered through the tests.

Tests: `packages/kernel/tests/parity-output-edge-gaps.test.ts`.

## Gap #9 — Output node handling (consecutive deduplication)

Python's `process_output_node()` consumes a stream item-by-item and emits one
`output_update` per value, deduplicating *consecutive* identical values.

- **Current TS behavior:** the output node is buffered and fires once with the
  last value, so three yields of `same, same, different` produce a single
  `output_update` carrying `different`.
- **Desired:** when the output node consumes the stream item-by-item,
  consecutive dedup should reduce `same, same, different` to **two**
  `output_update` messages (`same` once, then `different`).
- **Asserted at:** the `should ... deduplicate consecutive` test (current
  behavior: `outputMsgs.length === 1`).

`output_update` message fields (`node_id`, `node_name`, `output_name`, `value`,
`output_type`, `metadata`) are already populated — that part of gap #9 is fixed.

## Gap #15 — Edge counter updates for input-originating edges

Python emits `edge_update` at several lifecycle points, including `"drained"`
during `drain_active_edges()` and `"completed"` during `_send_EOS()`.
`_drainActiveEdges()` now exists in TS and emits `"drained"` for edges whose
target handle is still open at completion.

- **Current TS behavior:** input nodes are not actors, so `_sendEOS` is never
  called for edges that originate at an input node. Those edges receive an
  `"active"` update from `_dispatchInputs()` but no terminal `"completed"` /
  `"drained"`.
- **Desired:** input-originating edges should also receive a terminal
  `"completed"` (or `"drained"`) update at the end of the run.
- **Asserted at:** the two edge-lifecycle tests (current behavior:
  `completedMsgs.length === 0` for input edges).

Edges between non-input nodes already get both `"active"` and `"completed"`.
