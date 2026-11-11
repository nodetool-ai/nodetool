# Feature interplay map

Open [index.html](index.html) in a browser. It works directly from disk and uses no network libraries, build step, or NodeTool server. Keep `data.js`, `created-work.js`, `graph.js`, and `styles.css` beside it.

## Explore

- **A1. Find a feature.** The Feature dropdown selects and centers a node. Selecting a node on the graph highlights its direct connections. The inspector lists the same connections with their evidence.
- **A2. Compare relationships.** The Connections dropdown switches between existing connections, known limits, unverified questions, proposals, or their combined view. Nodes stay in place so the views are comparable.
- **A3. Move around.** Drag to pan, scroll or pinch to zoom, or use the zoom buttons. Select an area title to frame that group. Fit all restores the whole graph. With the graph focused, arrow keys pan, `+` and `-` zoom, `F` fits, and Escape clears selection. Nodes and edges also support Tab and Enter.
- **A4. Inspect sparse areas.** Enable Highlight sparsely mapped features to mark existing features with at most one distinct mapped existing neighbor. The overview inspector lists them. Clear selection to return to that overview.
- **A5. Focus on created work.** Choose **Layer → Created work** to see authored objects and their relationships. The Object dropdown selects work such as a screenplay, workflow, Mini App or asset. Switching layers clears selection and fits the new map. Evidence filters and sparse highlighting keep their settings.
- **A6. Separate relationship types.** In Created work, use **Relationship** to isolate containment, use, production, reads or writes. Colors and endpoint shapes identify types. **Line colors → Evidence states** restores evidence coloring. Relationship and evidence filters combine, and positions stay fixed.

## Created work layer

This layer maps kinds of work a creator can make, including agent-assisted work,
imported material and saved results. It is a curated type map, not a live project
inventory. Editors, providers, execution services and built-in skills are excluded.
The inventory includes authored parts such as layers, shots, tracks, clips,
Input/Output nodes and app widgets, plus workspace files and durable memory notes. Scenes and behavior
scripts are parts of games. Audio, text and 3D files are kinds of assets, not
additional copies of the same work. Run variables are transient values configured
through authored nodes. Proposed saved variables carry the Proposed state.

| Relationship | Endpoint | Direction |
| --- | --- | --- |
| Contains | Filled diamond | Owner to part or member. |
| Uses / references | Open arrow | Consumer to the resource it uses. |
| Produces | Filled arrow | Producer to its output. |
| Reads | Open circle | Reader to the value or file it reads. |
| Writes | Filled square | Writer to the value or file it changes. |
| Is a kind of | Open triangle | Specialized type to broader type. |
| Limited / unsupported | Bar | Source to the target of a documented limitation. |

Each type also has a color. Line patterns preserve evidence states: solid for
source-backed or documented, short dashes for limits, dots for questions and long
dashes for proposals. The inspector always names both relationship and evidence.
Read/write arrows describe access, not the direction data travels. A project
owning two documents does not connect their execution. An exported image does not
retain sketch layers. A source reference does not establish automatic updates.

### Variables and their owners

| Object | Meaning |
| --- | --- |
| Set/Get Variable nodes | Authored nodes contained in a workflow. Set publishes by name. Get streams the named channel. |
| Run variables | Channels in the execution context. Get replays their publication history and follows new values until closure, rather than reading only the latest value. No registered writer means an empty, closed channel. |
| App variables | Declared app values with `instance` or `user` scope. Only user-scoped values may persist. Mapping workflow channel names into app variables does not make run channels persistent. |
| Workflow parameters | Proposed saved workflow values and direct input bindings. Existing Input nodes already expose workflow inputs and remain a separate path. |
| Project variables | Proposed shared, persistent values with revision-checked writes. |

See the [variable nodes](../../../packages/core-nodes/src/nodes/variable.ts),
[channel implementation](../../../packages/runtime/src/variable-channel.ts),
[context lifecycle](../../../packages/runtime/src/context.ts),
[app declarations](../../../packages/app-runtime/src/document.ts) and
[app channel mapping](../../../packages/app-runtime/src/operations.ts).
The [shared variables plan](../shared-variables-input-bindings.md) preserves the
existing Set/Get behavior while proposing saved variables with different owners.

This remains a curated inventory. Individual ports and bindings are described by their
relationships, and some subobjects, such as shots and takes, remain grouped.
It does not enumerate every editable field or every game component type.

The layer reuses applicable evidence from the feature map and adds documented
project membership, script reuse, skill use in chats and game asset preparation.
It does not infer connections through hidden systems. Unconnected objects remain
visible. An empty filtered view means no relationships match both filters.

## Evidence and interpretation

| State | Meaning |
| --- | --- |
| Source-backed | The connection is supported by inspected implementation. It has not been certified by an end-to-end runtime test in this research. |
| Documented | A repository guide describes the connection. Implementation and host parity still need verification. |
| Known limit | A specific inspected or documented boundary. The inspector names its evidence and scope. |
| Needs checking | An unresolved integration question, not a confirmed absence. |
| Proposed | A candidate connection or shared behavior, not a shipped feature claim. |

The map carries forward the previous research inventory. It does not re-audit product behavior. The initial findings and research experiments are in [Feature interplay research](../../research/feature-interplay.md).

These readings and linked plans do not certify runtime behavior. When a delivery
depends on a source claim, recheck its specific route and record the full inspected
commit SHA with the finding or implementation task. Record commands and outcomes
separately for runtime checks. A new documentation-edit commit is not evidence
that an earlier source audit ran against it. Unpinned findings remain inspection
notes until rechecked.

Promote a “Next check” to a plan task only when a selected milestone needs it.
Name the owning plan/task and expected observable result. Unselected checks stay
research questions. The plan task owns execution and evidence, so the reading
links to it rather than maintaining a second checklist.

## Saved readings

[Connections to prioritize](priorities.md) preserves integration opportunities, existing pieces to reuse, and a first experiment for each. Its delivery sequence follows the existing plans. Source following and the impact view remain unscheduled candidates.

Each reading starts with a TLDR, links its evidence, and names a next check or a
tracked task in an owning plan.

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

`created-work.js` selects authored object types, gives them object labels and adds explicit relationships with evidence. Every edge has a relationship kind and a direction matching the table above. Keep its scope separate from the system inventory in `data.js`.

`graph.js` owns layer switching, selection, filtering, the fixed area layouts, zoom and pan. Each layer stays stable across evidence views. Sparse highlighting counts neighbors within the active layer. `styles.css` follows the browser's light or dark preference. The page does not load model providers, execute workflows, or send research data anywhere.

For browser verification, check both layers, switching with a selection or filter active, object selection, edge inspection, each connection filter, sparse highlighting, drag/scroll and keyboard navigation, Fit all, and narrow-screen layout. Inspect both light and dark appearances. Source paths should resolve from the repository root.
