# Node Graph Editor Performance Audit

_Audited: 2026-07-02. Sources verified against `web/src` at commit `8ff1421`.
ReactFlow (`@xyflow/react`) 12.10.2, React 19, Zustand 5._

Scope: the canvas render path — `ReactFlowWrapper`, `BaseNode` and everything
rendered per node, the Zustand stores the editor subscribes to, edge/handle/
pointer interaction paths, and the editor CSS. All 27 existing performance
guard tests pass; the issues below live in paths those tests do not cover.

The costs concentrate on three hot paths:

1. **Node drag / pan** — per-frame work that is O(all nodes), not O(moved nodes).
2. **Workflow execution** — per-websocket-message work that sweeps the whole
   canvas, including other tabs' runs.
3. **Paint** — CSS `filter` chains on every node (and, in light mode, every
   edge and handle) that force filter-pipeline rasterization during drags.

## High severity

### H1. `onNodesChange` clones every node on every change batch

`NodeStore.ts:58-65`, `504-508`:

```ts
const rawNodes = applyNodeChanges(filteredChanges, currentNodes);
const nodes = syncAllReactFlowNodeChromeClass(rawNodes ?? currentNodes);
// = nodes.map((node) => ({ ...node, className: reactFlowNodeChromeClassName(node.data) }))
```

`applyNodeChanges` preserves object identity for untouched nodes so ReactFlow
can skip them; the unconditional `.map()` + spread then gives **every node a
fresh identity on every change batch** — every drag pointermove frame, every
selection click, every dimension change. Verified against the installed
`@xyflow/system` (`adoptUserNodes`): RF12 skips re-adoption only when
`userNode === internals.userNode`, so every frame re-runs position clamping,
handle parsing, and z-calculation for all N nodes, and every `NodeWrapper`
re-renders (the inner `BaseNode` is saved only by its memo comparator). It
also poisons every downstream cache keyed on node identity.

**Fix** (small): only clone when the class actually changed, and return the
original array when nothing did:

```ts
const syncReactFlowNodeChromeClass = (node) => {
  const cls = reactFlowNodeChromeClassName(node.data);
  return cls === node.className ? node : { ...node, className: cls };
};
```

`bypassed`/`collapsed` only change in `toggleBypass`/`updateNodeData`, which
already set `className` on the touched node — the hot path can be fully
identity-preserving.

### H2. `useViewport()` re-renders the whole canvas wrapper every pan/zoom frame

`ReactFlowWrapper.tsx:362`, consumed only at `:718-733` to derive a
`zoomed-out` class. `useViewport` fires on every transform change (x, y, and
zoom — every pointermove of a pan). The wrapper is the heaviest component in
the editor (~10 store subscriptions, ~15 memos, a ~50-prop `<ReactFlow>`
element) and re-runs per frame to compute a boolean that only changes when
zoom crosses `ZOOMED_OUT`.

**Fix**: `useStore((s) => s.transform[2] <= ZOOMED_OUT)` — re-renders only on
threshold crossings. Same fix for `ViewportStatusIndicator.tsx:39` (full MUI
toolbar re-render per pan frame; it only needs zoom) and
`NodeInfoPanel.tsx:201` (re-renders per frame even with nothing inspected).
`AxisMarker` already does this right (`useOnViewportChange` + ref writes).

### H3. The memoized node chrome components are dead code — every consumer imports the unmemoized export

`NodeHeader.tsx`, `NodeErrors.tsx`, `NodeInputs.tsx`, `NodeOutputs.tsx` each
export a `memo(..., isEqual)` **default** export (`NodeHeader.tsx:394`,
`NodeErrors.tsx:223`, `NodeInputs.tsx:321`, `NodeOutputs.tsx:102`) — and every
canvas consumer (`BaseNode.tsx:30-31`, `NodeContent.tsx:3-4`, all bespoke node
types) imports the **named, unmemoized** component. Verified by grep: the memo
wrappers have zero canvas imports.

BaseNode re-renders on every streaming chunk, status flip, and hover
enter/leave; each re-render re-runs NodeHeader (~350 lines, a large emotion
`css` object, an always-mounted logs dialog) and NodeErrors
(`nodeErrorToDisplayString` runs twice per render) for every affected node.

**Fix**: memoize the named exports themselves (or switch imports to the
defaults), and give NodeHeader a comparator narrower than deep-equal on the
whole `data` blob — it only reads `data.bypassed`.

### H4. `findNode` is O(N), and per-node selectors call it on every store write → O(N²) per drag frame

`NodeStore.ts:724-725` (`get().nodes.find(...)`). Callers that run per node on
**every** NodeStore update:

- `useNodeGenerations.ts:40-47` — two subscriptions, mounted by **every**
  BaseNode via `useNodeArtifacts` (`BaseNode.tsx:534`), plus PreviewNode.
- `NodeOutputs.tsx:58-61`, `PreviewNode.tsx:268-282`.
- `NodeOutput.tsx` connect-drag fallback (per output handle).

Zustand runs all listeners on every `set()`; dragging updates `nodes` at
~60fps. At 300 nodes that is ~270k id comparisons per frame in selector work
alone, before React renders anything. Same cost per property keystroke.

**Fix**: maintain a `nodesById` index in NodeStore (updated wherever `nodes`
is set) and make `findNode` O(1) — one change fixes all call sites. For
`useNodeGenerations` specifically, `selected_generation(s)` are already on the
`data` prop RF passes to the node — thread them in as parameters.

### H5. The canvas subscribes to the global status maps — every execution message re-renders it

`ReactFlowWrapper.tsx:589-590`:

```ts
const edgeStatuses = useResultsStore((state) => state.edges);
const nodeStatuses = useStatusStore((state) => state.statuses);
```

Both maps are rebuilt with a full spread on every write
(`StatusStore.ts:121`, `ResultsStore.ts:335-341`) and are keyed globally
(`workflowId:jobId:nodeId`). Every `node_update`/`edge_update` from **any**
workflow and **any** job — including runs in other tabs — re-renders the
wrapper and re-runs the `useProcessedEdges` status pass, an O(E) map that
produces fresh edge objects for active edges each time (`useProcessedEdges.ts:
387-424`), so RF re-diffs edges per message while anything is running.

**Fix**: key the stores per run (`statusesByJob[jobKey][nodeId]`) so the
canvas selects only its focused run's sub-map (identity stable when other jobs
write), and make the status pass return prior edge objects when that edge's
status/counter did not change.

### H6. CSS `filter` chains on every node — and on every edge and handle in light mode

- `styles/nodes.states.css:6-27`: every node carries a `filter: drop-shadow(...)`
  at all times; selected nodes get **two** stacked drop-shadows (one with 24px
  blur) on top of the `box-shadow` the node body already draws
  (`selectionStyles.ts:97-101`). Since clicking a node selects it, every drag
  is a selected-node drag: the filter region re-rasterizes per frame.
  `nodes.base.css` also transitions `filter` on all nodes. The code already
  knows filters are costly (`CRISP_NO_BLUR_STYLES` sets `filter: none` on the
  inner body) — the outer rule re-adds the cost.
- `styles/handle_edge_tooltip.css:310-317`: light mode applies
  `filter: saturate(...) brightness(...)` to **every** handle and **every**
  edge path, permanently. Filters on SVG paths disable cheap stroke repaint;
  node drags repaint every attached edge through the filter pipeline.
- `CustomEdge.tsx:88-101`: selected edges get an inline SVG `drop-shadow`
  while their path changes every drag frame (node-driven edge selection makes
  this the common case).
- `handle_edge_tooltip.css:656-665`: the run-time `edgeFlow` dash animation
  adds `filter: drop-shadow(...)` per animated edge and
  `will-change: stroke-dashoffset` (buys nothing — dash offset is main-thread
  paint), running for offscreen edges too.

**Fix**: replace node drop-shadows with the existing body `box-shadow`; bake
the light-mode desaturation into the palette instead of filtering at paint
time; approximate the selected-edge glow with a second wider translucent
stroke; drop `filter`/`will-change` from the animated edge rule.

## Medium severity

### M1. Streaming amplification: per-token store writes, whole-node re-renders, O(k²) accumulation

- `ResultsStore.addChunk` (`:738-749`) spreads the full chunks map per token;
  `setOutputResult` with `append` (`:606-654`) copies the whole accumulated
  array per item — O(k²) over a k-item stream. Audio already has coalescing
  (200ms flush, `workflowUpdates.ts:49-93`); text and other streams do not.
- `BaseNode.tsx:534` subscribes to the accumulated `chunk` string at the top
  of the node, so each token re-renders the entire node (amplified by H3), and
  `ChunkDisplay.tsx:78` re-parses the full markdown per token — O(n²) per
  stream.
- `NodeLogsDialog` is mounted inside every NodeHeader
  (`NodeHeader.tsx:384-389`) and its memos re-slice/join the full log history
  on every appended line **even while closed** (`NodeLogs.tsx:64-91`);
  NodeHeader itself subscribes to the log array just to show a count.
- `workflowUpdates.ts:587-599` `JSON.stringify`s every non-string output into
  a log line — a multi-MB image ref serializes before the 20k-char truncation
  runs.

**Fix**: reuse the audio coalescing for text chunks/appends; move
chunk/terminal subscriptions into leaf components (NodeProgress already
models this); mount the logs dialog only when open and select
`logsByNode[key]?.length` for the count; summarize rich types before
stringifying.

### M2. `nodeTypes` identity is tied to MetadataStore — map replacement remounts all nodes

`ReactFlowWrapper.tsx:399-422` memoizes on `useMetadataStore((s) => s.nodeTypes)`,
whose identity changes on every `setNodeTypes`/`addNodeType`. Loading a
workflow with unknown types fires one `addNodeType` per type
(`NodeStore.ts:257-261`); each replaces the map, and a changed `nodeTypes`
identity makes ReactFlow **remount every node** — full DOM teardown and handle
re-measure, possibly several times in a row. Related: NodeStore's metadata
subscriber (`NodeStore.ts:267-281`) re-runs `sanitizeGraph` and replaces the
`edges` array unconditionally on every MetadataStore write (including fal/kie
pricing merges), invalidating the expensive structural edge pass in every open
tab.

**Fix**: unknown types already fall through to `default: PlaceholderNode`, so
the per-type placeholder registration can likely be dropped; otherwise batch
into one store write and bail when keys are unchanged. Make the sanitize
subscriber a no-op when the sanitized edges are unchanged.

### M3. Every Ctrl/Meta press re-renders every property editor on the canvas

`PropertyField.tsx:94-99` subscribes each field to
`isKeyPressed("Control")`/`isKeyPressed("Meta")` and threads the result into
`PropertyInput`'s memo comparator. Every modifier press **and** release
(copy/paste, shortcuts, Cmd-click) re-renders hundreds of property editors.
The only consumer is a mouse handler that already receives
`event.ctrlKey`/`event.metaKey` (`PropertyInput.tsx:392`).

**Fix**: delete both subscriptions; read the event modifiers (or
`useKeyPressedStore.getState()` inside the handler).

### M4. Per-frame O(N) bookkeeping in the wrapper, doubled by a redundant second store write

- The layout-fingerprint effect (`ReactFlowWrapper.tsx:295-359`) rebuilds a
  Map of signature strings for all nodes on every `nodes` change — every drag
  frame.
- `nodesStructureKey` (`useProcessedEdges.ts:76-94`) joins an O(N) string per
  frame (multi-KB allocation on large graphs).
- `setWorkflowDirty(true)` is called unconditionally after graph mutations
  (`NodeStore.ts:511-513` and ~15 other sites) with no change guard, so every
  drag frame performs **two** `set()` calls — every mounted selector in the
  graph runs twice per frame.

**Fix**: guard `setWorkflowDirty` on actual change (one line); skip the
fingerprint/structure-key passes while a drag is in progress (the `isSelecting`
trick already exists for marquee drags), or key them on a structural version
counter bumped by the store.

### M5. `updateNodeInternals` over all nodes on edge changes, six refresh passes per layout change

`ReactFlowWrapper.tsx:276-290` refreshes handle bounds for **all** node ids on
every edge add/remove — O(N × handles) `getBoundingClientRect` calls for a
change touching two nodes. `scheduleNodeInternalsRefresh.ts` then runs each
refresh six times over ~160ms (raf, raf, timeout 0/24/72/160).

**Fix**: refresh only the affected edge's endpoints (the
`withEdgeNeighborNodeIds` helper already exists for this); trim the scheduler
to raf-raf plus one late fallback.

### M6. Connection-drag costs: per-pointermove BFS and a whole-graph handle sweep

- `isValidConnection` (`useConnectionEvents.ts:30-40` → `graphCycle.ts`)
  rebuilds a full adjacency map over all edges and BFSes **per call**, and RF
  calls it from pointermove whenever the wire is near a handle.
- Grabbing a wire re-renders every handle in the graph (they subscribe to
  `ConnectionStore` connect state); each handle re-runs `hashType`
  (`typeFilterUtils.ts:6-13` — recursive string building, uncached) and
  `NodeOutput` falls back to O(N) `findNode` per output handle. Cost lands
  twice per wire drag (grab and release) — a visible hitch at 100+ nodes.

**Fix**: precompute reachable-set once in `onConnectStart` (O(1) checks per
move); cache `hashType` per `TypeMetadata` in a WeakMap; both shrink further
once H4's `nodesById` index exists.

### M7. Undo history: full-graph equality scan per tracked write, one entry per keystroke, and phantom entries from runtime echoes

zundo is configured with `equality: customEquality` (`NodeStore.ts:1423-1431`),
which iterates every node with three `shallow()` compares each
(`customEquality.ts:31-63`) — on every tracked `set()`. Property typing is
undebounced (`updateNodeProperties` per keystroke), so each keystroke pays the
scan and pushes a history entry (undo steps back one character). Drags are
correctly `pause()`/`resume()`d. Worse: `node_update` websocket echoes call
`updateNodeData` while tracking is active (`workflowUpdates.ts:1146-1173`) —
running a workflow creates undo entries the user never authored and marks the
workflow dirty (autosave version churn). Related: BaseNode's overlay
re-measure (`BaseNode.tsx:767-778`) fires `updateNode` per node at run
completion, each dirtying the workflow.

**Fix**: pause temporal (and skip the dirty flag) around runtime echoes and
re-measures; group/debounce property-edit history.

### M8. `onlyRenderVisibleElements={false}` — every cost above scales with total nodes, not visible nodes

`ReactFlowWrapper.tsx:770`. All nodes, property editors, handles, and tooltips
stay mounted regardless of viewport; collapsed nodes also keep their full
subtree mounted (CSS-only collapse via `display: none`). RF12's visibility
culling is much cheaper than v11's. Worth a benchmark, at least above a
node-count threshold, and worth skipping field-editor rendering for collapsed
nodes (handles must stay mounted for edge anchoring — `HandleColumn`/
`HandleOnlyField` already provide that).

## Low severity (grouped)

- **Stale-edge correctness bug in PreviewNode**: `PreviewNode.tsx:237-243`
  memoizes the incoming edge on `[getEdges, props.id]` — both stable — so it
  computes once at mount and never updates when the preview is re-wired. Also
  uses `fast-deep-equal` as a subscriber equality over potentially huge
  property values (`:268-282`); property values are replaced immutably, so
  reference equality suffices.
- `FindInWorkflowDialog` subscribes to `nodes` while closed
  (`useFindInWorkflow.ts:85`) — re-renders per drag frame to return `null`.
- Latent footgun: `useEdgeHandlers.ts:77-121` (`onEdgeMouseEnter/Leave`)
  mutates store edges in place and would trigger a full O(E) structural
  reprocess per hover — currently unwired; delete or rewrite before wiring.
- Every mounted `OutputRenderer` keeps a permanent document-level `mousemove`
  listener (`OutputRenderer.tsx:325-336`); attach on mousedown instead.
- `transition: all` on every handle (`handle_edge_tooltip.css:298`) plus
  layout-affecting width/height transitions when `is-connecting` flips —
  violates the repo's own MOTION rules; list the animated properties.
- `:has()` selectors in per-node CSS (`nodes.states.css:30`,
  `nodes.zoomed.css`) make style invalidation walk node subtrees during runs;
  set a class from JS instead.
- `getNodeCategoryColor` rebuilds its color table per node per minimap frame
  (`ColorUtils.ts:151-165`); hoist to module scope.
- `panOnDrag` array recreated per render (`useDragHandlers.ts:291-294`);
  whole-`settings` subscription in the same hook; inline 30-line
  `onNodeDoubleClick` arrow (`ReactFlowWrapper.tsx:823-851`).
- `NodeEditor` subscribes to the whole upload store (`NodeEditor.tsx:65`) —
  re-renders per upload progress tick.
- Marquee-end edge hit-testing does one `document.querySelector` per edge
  (`useSelectionEvents.ts:139-156`); use one `querySelectorAll`.
- `PropertyInput.tsx:228` subscribes to the entire metadata map for a
  reset-to-default handler; read `getState()` in the callback.
- `KieCreditsFooter` subscribes every node to two hot stores before its
  "not a KIE node" early return (`KieCreditsFooter.tsx:96`).
- `useAutoEnableNodePacks` allocates an O(N) types array on every store
  update (`useAutoEnableNodePacks.ts:31-33`); cache by `nodes` identity.

## What is already done well

Preserve these patterns when fixing the above:

- `useNodes` defaults to `shallow` equality (`NodeContext.tsx:64`); `useShallow`
  is used consistently for multi-value selections; no whole-store no-selector
  subscriptions in the canvas path.
- Per-node execution state is correctly isolated: status/progress/error/
  duration lookups are O(1) keyed maps returning stable references — a
  progress tick on node A does not re-render node B, and `NodeProgress` is a
  leaf subscriber mounted only while running.
- `useProcessedEdges` two-stage split (heavy structural pass keyed by a
  structure fingerprint; light status pass with whole-result identity bail),
  O(1) lookup maps, and the `incomingByTargetHandle` index that removed a
  prior O(E²).
- Identity-cached selectors: `selectedNodeIdsSelector`
  (`ReactFlowWrapper.tsx:629-651`), `getSelectedNodeCount`/`getSelection`
  closures, BaseNode's `hasConnectedInput`/`hasControlEdge`, GroupNode's
  children-status selector.
- History is paused during drags, slider scrubs, and group operations;
  `partialize` keeps viewport/hover out of history; selection changes don't
  create undo entries.
- Audio streaming is fully coalesced (200ms batches, single-copy append,
  rolling caps, React-free worklet fast path) — the template for text streams.
- Connection drag writes no store state per pointermove; the connectability
  matrix is precomputed at metadata load; `EdgeGradientDefinitions` renders one
  gradient per active type pair with stabilized keys; `CustomEdge`/`ControlEdge`
  have explicit memo comparators.
- `AxisMarker` and `GhostNode` handle per-frame updates via refs/rAF with zero
  React re-renders; viewport is persisted only on `onMoveEnd`; drag
  intersection checks are throttled to 50ms.
- LogStore is pre-keyed by node with caps and truncation; autosave is
  interval-based, not per-change; no `structuredClone`/JSON round-trips on hot
  paths.

## Suggested fix order

| # | Fix | Effort | Pays off on |
|---|-----|--------|-------------|
| 1 | H1: identity-preserving `syncReactFlowNodeChromeClass` | tiny | every drag frame |
| 2 | H2: boolean zoom selector instead of `useViewport` (3 components) | tiny | every pan/zoom frame |
| 3 | H3: use the memoized node chrome exports; narrow NodeHeader comparator | small | every streaming chunk/hover |
| 4 | M3: drop Ctrl/Meta subscriptions in PropertyField | tiny | every shortcut press |
| 5 | M4: `setWorkflowDirty` change guard | tiny | every graph mutation |
| 6 | H4: `nodesById` index for `findNode` | small | drag frames, keystrokes, connect drags |
| 7 | H5: per-run keying for status/results maps | medium | execution messages |
| 8 | H6: remove node/edge/handle CSS filters | small | paint during drag, light mode |
| 9 | M1: coalesce text-stream writes; leaf-subscribe chunks; lazy logs dialog | medium | streaming runs |
| 10 | M2: stabilize `nodeTypes`; conditional sanitize | small | workflow load |
| 11 | M8: benchmark `onlyRenderVisibleElements` on large graphs | experiment | large graphs |

## Test coverage gaps

The existing suites (`web/src/__tests__/performance/`) guard LogStore bucket
identity, selection-count memoization, and selector patterns — none cover the
top findings. Worth adding once fixed:

- untouched node objects keep identity through `onNodesChange` (locks in H1);
- `ReactFlowWrapper` does not re-render on another job's `setStatus` (H5);
- a streamed chunk re-renders the chunk display leaf, not `BaseNode` (M1);
- modifier keypress does not re-render `PropertyInput` (M3).

The pattern-level assertions in `componentPerformance.test.tsx` are gated
behind `PERF_TESTS=true` and do not enforce in CI.
