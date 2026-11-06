# Feature interplay map

Open [index.html](index.html) in a browser. It works directly from disk and uses no network libraries, build step, or NodeTool server. Keep `data.js`, `graph.js`, and `styles.css` beside it.

## Explore

- **A1. Find a feature.** The Feature dropdown selects and centers a node. Selecting a node on the graph highlights its direct connections. The inspector lists the same connections with their evidence.
- **A2. Compare relationships.** The Connections dropdown switches between existing connections, known limits, unverified questions, proposals, or their combined view. Nodes stay in place so the views are comparable.
- **A3. Move around.** Drag to pan, scroll or pinch to zoom, or use the zoom buttons. Select an area title to frame that group. Fit all restores the whole graph. With the graph focused, arrow keys pan, `+` and `-` zoom, `F` fits, and Escape clears selection. Nodes and edges also support Tab and Enter.
- **A4. Inspect sparse areas.** Enable Highlight sparsely mapped features to mark existing features with at most one distinct mapped existing neighbor. The overview inspector lists them. Clear selection to return to that overview.

## Evidence and interpretation

| State | Meaning |
| --- | --- |
| Source-backed | The connection is supported by inspected implementation. It has not been certified by an end-to-end runtime test in this research. |
| Documented | A repository guide describes the connection. Implementation and host parity still need verification. |
| Known limit | A specific inspected or documented boundary. The inspector names its evidence and scope. |
| Needs checking | An unresolved integration question, not a confirmed absence. |
| Proposed | A candidate connection or shared behavior, not a shipped feature claim. |

The map carries forward the previous research inventory. It does not re-audit product behavior. The initial findings and research experiments are in [Feature interplay research](../../research/feature-interplay.md).

## Saved readings

[Connections to prioritize](priorities.md) preserves one interpretation of the graph: the largest integration opportunities, their recommended order, existing pieces to reuse, and a first experiment for each. It records conclusions separately from the graph's feature and connection inventory.

Each reading below starts with a TLDR, links its evidence and names a next check. These are code and documentation readings, not completed runtime experiments.

| Question | Reading |
| --- | --- |
| Q1 | [Where does editable work become only a result?](q01-editable-sources.md) |
| Q2 | [Which concepts must someone relearn between features?](q02-shared-concepts.md) |
| Q3 | [Can something built in one place become a reusable tool elsewhere?](q03-reusable-tools.md) |
| Q4 | [Which useful loops can we complete?](q04-useful-loops.md) |
| Q5 | [Where do execution models meet?](q05-execution-boundaries.md) |
| Q6 | [Where can manual and generated work coexist safely?](q06-preserving-manual-work.md) |
| Q7 | [Which capabilities are available only through one surface?](q07-surface-parity.md) |
| Q8 | [What survives moving, copying, or publishing a composition?](q08-portable-compositions.md) |
| Q9 | [Which connections explain failures?](q09-explainable-failures.md) |
| Q10 | [Which small bridge enables several experiences?](q10-high-value-bridge.md) |
| Q11 | [Which apparent gaps should remain boundaries?](q11-useful-boundaries.md) |
| Q12 | [Which parts of our map are least trustworthy?](q12-map-confidence.md) |

## Map limits

Layout positions are for readability. Neither proximity nor link count measures integration quality. An area can be loosely connected by design. A missing edge means uncharted, not unsupported. Proposed features remain visible when their edges are filtered out, so the shape of the map stays stable.

Sparse highlighting counts unique neighbors in either direction, using only source-backed and documented edges between source-backed or documented features. Duplicate relationships do not increase the count. Proposed, question, and known-limit nodes do not participate. Filtering changes displayed edges, not this baseline. The graph does not invent links to make every area connected.

Source links open files in this checkout through relative paths. If only this directory is copied elsewhere, the graph still works, but those source links need the rest of the repository.

## Maintain

`data.js` owns the feature groups, node descriptions and relationship evidence. Node IDs and edge IDs are stable identifiers. Each edge names its endpoints, label, state, detail and source path. Add an explicit evidence state when extending the inventory. Do not upgrade a proposal or question merely because a related node or schema exists.

`graph.js` owns selection, filtering, the fixed area layout, zoom and pan. The layout deliberately stays stable across evidence views. `styles.css` follows the browser's light or dark preference. The page does not load model providers, execute workflows, or send research data anywhere.

For browser verification, check feature selection, edge inspection, each connection filter, sparse highlighting, drag/scroll and keyboard navigation, Fit all, and narrow-screen layout. Inspect both light and dark appearances. Source paths should resolve from the repository root.
