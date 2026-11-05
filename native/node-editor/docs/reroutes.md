# Reroute insertion

The web inserts reroutes through
[EdgeContextMenu](../../../web/src/components/context_menus/EdgeContextMenu.tsx).
[RerouteNode](../../../web/src/components/node/RerouteNode.tsx) renders a small
pill with `input_value` and `output` handles. Its label uses
`ui_properties.title`. Declared port types remain `any`. Display inference does
not change the stored schema.

## Document contract

`insertReroute {id: edgeId, position: {x, y}}` replaces one data edge with a
root `nodetool.control.Reroute` and two edges in one undo step. Position is the
node's top-left point in absolute canvas coordinates, matching the web menu.
The result returns `idMap.reroute` and `idMap.upstreamEdge` for the new IDs.

The downstream segment keeps the original edge ID and every stored field,
changing only its source and source handle. The upstream segment gets a new ID
and connects the original source handle to `input_value`. Both segments replace
the original edge's array slot in upstream/downstream order. Other nodes,
edges, links and unknown fields retain their order and contents. Preserving the
original edge metadata is a deliberate improvement over the web insertion code.

Insertion requires catalog metadata for the reroute and existing endpoint ports.
The reroute must declare `input_value` and `output` as `any`. Declared defaults
initialize its data. Missing edges, catalog entries or ports, incompatible
types, control edges, lineage links and nonfinite coordinates reject the entire
command without changing the graph or undo history. New IDs are generated once
and retained across undo/redo.

Deletion uses the existing `removeNodes` command. As in
[NodeStore](../../../web/src/stores/NodeStore.ts), deleting a reroute removes its
incident edges and does not reconnect its neighbors. `reconnectEdge` edits either
segment through the existing validation and replacement rules.

## Acceptance

- A1: Insert on a saved data edge, preserve its ID and metadata downstream,
  retain unrelated ordering, and restore the exact snapshot with one undo.
- A2: Reject malformed input, control/link targets, missing catalog metadata,
  invalid ports and nonfinite positions without a partial edit.
- A3: Save/reopen, duplicate, delete and reconnect the inserted node and segments
  without changing existing false, zero, null, list or structured values.
- A4: Verify the renderer's pill, handles, label, inferred display types and
  context-menu placement separately. Display inference follows
  [useProcessedEdges](../../../web/src/hooks/useProcessedEdges.ts) with indexed
  incoming edges, memoized forward paths and an `any` fallback for cycles.

## Evidence

Run `ctest --test-dir <build> -R 'node_editor_(reroute_presentation|inline_title)'
--output-on-failure` for the canvas and host checks. Set
`NODETOOL_PARTIAL_LIVE_URL` to a disposable backend to run `node_editor_reroute_live`,
which compares direct and inserted paths without provider requests. The backend
omits null output on both paths, so that run does not establish standalone null
delivery.
