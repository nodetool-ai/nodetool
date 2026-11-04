# Native node graph editor

Design for the [native workflow editor](../../native/node-editor/README.md).
The implementation uses [QtNodes](https://github.com/paceholder/nodeeditor).
The editor README distinguishes implemented behavior from deferred parity.

## Goal

Build a native workflow editor that opens the same workflows as the web editor,
edits their graphs, and runs them on the existing NodeTool server. QtNodes owns
the canvas interaction. NodeTool owns document semantics and execution.

The behavior reference is the [web workflow editor](../workflow-editor.md).
The web editor is also the visual reference, and the
[comparison guide](../native-node-editor-visual-comparison.md) measures that
parity. The [native design](../../native/ui_primitives/DESIGN.md) still governs
the shared primitives, tokens, and every other native app.
Apply the [UX guidelines](../UX_GUIDELINES.md) to empty states, saving, errors,
and narrow windows.

## Design decisions

**D1. Use QtNodes for graph presentation.** Its model/view architecture supports
a custom `AbstractGraphModel` and a Widgets graphics scene/view. Use that model
extension rather than its optional dataflow execution implementation. Upstream
supports dynamic ports and custom geometry. Exact integration hooks must be
verified against the pinned revision. See the
[upstream documentation](https://qtnodes.readthedocs.io/en/master/).

**D2. Start with a standalone Widgets host and Qt Quick panels.** Proposed
location: `native/node-editor/`. A `QMainWindow` contains the QtNodes view and
resizable docks. Panel content uses `NodeTool.UiPrimitives` through
`QQuickWidget`. Keep graph painting in QtNodes and controls in the existing
native primitives. This avoids requiring a Widgets canvas inside an existing
Quick scene. Embedding in another native editor is a later integration step.
The first prototype must prove focus, input methods, scaling, and rendering
across Widgets and Quick before building the full inspector.
The rail, tab strip, and status bar frame an inner dock host. The toolbar and
zoom readout float over the canvas as transparent Quick overlays, and Fit uses
the canvas area they leave free.

**D3. Keep the workflow format authoritative.** QtNodes scene JSON is not the
saved document. A NodeTool document module owns graph data, undo, and import and
export. Full resource IDs remain unchanged. Map them to QtNodes-local IDs only
inside the adapter. Map stable port names to presentation indices, rebuilding
indices when dynamic ports change without reconnecting edges to different ports.

**D4. Execute through NodeTool.** Use the existing server contracts for metadata,
workflow persistence, assets, and execution. REST carries JSON and workflow
WebSocket traffic carries MsgPack. No provider execution or credentials belong
in the graph model. Runtime events update a separate run projection and never
enter document undo history.

## Screen and interactions

The top toolbar shows the workflow name, save state, Add node, Undo, Redo,
Fit, Auto layout, and Run. Stop appears for an active run. Menus expose the
same actions and their platform shortcuts.

The center canvas shows left-to-right data flow. Node headers contain the title
and execution state. Inputs and outputs have names and type cues. Selection,
focus, errors, and running state remain distinguishable without color. Properties
live in the inspector initially, limiting embedded controls and focus conflicts.

The left dock searches the node catalog by name and category. A visible Add node
button and Space open the picker. Dropping a connection on empty canvas opens a
picker filtered to compatible ports. Cancel leaves the document unchanged.

The right dock opens on selection with Params, I/O, and Help. Fields derive from
node metadata. Unknown property types remain preserved and show an explanation
rather than an editor that can corrupt their value. Model selectors use server
defaults. Missing models, runtimes, or provider setup provide an actionable link.

The bottom dock contains run output and logs, collapsed when idle. Output
previews resolve asset references through the authenticated server. Raw
`asset://` identifiers are never treated as fetch URLs.

At narrow widths, show one side dock at a time with explicit Nodes and Inspector
buttons. Preserve its state when hidden. Fit only after the layout settles.
Test the window sizes listed in the UX guidelines. Empty workflows show Add node
and Open example actions. Save state distinguishes unsaved, saving, saved, and
failed, with retry that retains local work.

Canvas navigation follows web platform defaults and preferences. Text fields
retain text shortcuts. Escape cancels an active field edit, connection gesture,
or popup before reaching the run-stop action. Visible controls remain available
for every shortcut.

## Scope and compatibility

The first usable version includes opening and saving workflows, catalog search,
node creation, selection, movement, typed connections, property editing,
copy/paste, duplication, deletion, undo/redo, fit, and whole-workflow run/stop.

Complete web parity follows in explicit increments: dynamic port editing,
comments and groups, subgraphs, reroutes, lineage links, disable/enable, layout,
partial runs, and richer output previews. Existing disabled-node semantics must
be preserved from the first run implementation: disabled nodes and their edges
are excluded, with no data passing through them.

Unsupported nodes retain their type, properties, geometry, and incident edges
and appear as labeled placeholders. Unknown fields survive unrelated edits.
If an unsupported structure cannot be represented without loss, open read-only
with a clear reason. Never silently flatten groups or remove links. Lineage
links are not execution edges. The first version is not advertised as full web
parity until the compatibility suite covers these features.

## Module interfaces

The document module exposes load, snapshot, apply command, undo, and redo.
A command either commits atomically or returns an error without a partial edit.
The same interface serves the UI and headless replay. Selection and viewport
are session state unless the canonical format explicitly persists them.

The QtNodes adapter projects nodes, ports, and edges from that document and
translates gestures into commands. Only one undo stack owns graph and inspector
edits. QtNodes built-in commands must be routed into that policy or replaced at
the interaction seam, never stacked alongside an independent document history.
A drag is one undo entry. Field preview is temporary, commit makes one entry,
and Escape restores the previous value. Deleting a selection and its incident
edges is one transaction. Paste remaps IDs and internal connections atomically.

The server session loads metadata and workflows, saves document snapshots, and
starts and cancels runs. Inject its connection and in-memory authentication from
the host, following the [native chat precedent](../../native/chat/README.md).
Reject stale responses after account or workflow changes. Reconcile uncertain
run submission after disconnect before allowing a retry to duplicate the run.
Run events are keyed by run and node, so concurrent runs do not overwrite each
other's status.

Before implementation, trace the actual persistence and revision contracts.
Use server revision checks where available. If conditional writes are absent,
resolve that contract before claiming safe concurrent editing. Failed saves
retain the dirty snapshot. Closing offers retry, export, or explicit discard.
A successful response for an older snapshot must not mark newer edits saved.

## Repository references

The initial source inspection covered
[NodeEditor](../../web/src/components/node_editor/NodeEditor.tsx), which connects
shortcuts, autosave, runtime checks, and inspector selection, and
[NodeData](../../web/src/stores/NodeData.ts), which includes dynamic ports,
selected generations, collapsed geometry, and disabled state.

Implementation must also trace
[NodeStore](../../web/src/stores/NodeStore.ts),
[WorkflowManagerStore](../../web/src/stores/WorkflowManagerStore.ts),
[WorkflowRunner](../../web/src/stores/WorkflowRunner.ts), and the
[protocol package](../../packages/protocol/src) before porting behavior. These
are reference implementations, not dependencies of the C++ editor.

## Implementation sequence and acceptance

**A1. Prove the host integration.** Pin a reviewed QtNodes revision and record its
license and Qt compatibility. Build a canvas with two connected nodes and one
Quick inspector. Verify focus traversal, IME, popups, light/dark theme, scaling,
and offscreen rendering. Graph painting consumes native presentation roles
through a native-owned bridge, with no imports of web presentation code.

**A2. Establish lossless editing.** Implement the document and QtNodes adapter.
Round-trip fixtures from the web editor through native and back. Assert stable
IDs, named ports, unknown fields, dynamic properties, groups, and links. Test
rejected connections, duplicate/paste remapping, and undo of whole gestures.
Use shared fixtures to compare native connection validation with server rules.

**A3. Connect persistence and execution.** Add catalog metadata, inspector fields,
authenticated save, run, stop, and result display. Exercise stale saves,
disconnects, rejected credentials, delayed run events, and cancellation. Submit a
known workflow from both editors and compare the graph sent to the server.

**A4. Close parity gaps.** Implement the deferred interactions against web
fixtures and behavior tests. Add headless command replay, graph/state dumps,
and screenshot capture, then register the editor in the existing harness gate.
Test a large graph with at least 1,000 nodes and 2,000 edges. Measure input to
paint and memory while dragging and receiving run events. Report the machine
and observed results rather than promising an unmeasured frame rate.

Use Qt Test and CTest for native behavior and offscreen GUI tests. Run native
design and dependency checks for the affected host, plus the repository's
mandatory post-code-change checks. Real platform input, accessibility, and
installed-app rendering require separate acceptance on each supported platform.

## Risks to resolve in the prototype

**R1. Mixed rendering and focus.** Quick panels and a Widgets canvas may behave
differently across platforms. The host prototype is a prerequisite for choosing
this integration permanently.

**R2. Two command systems.** QtNodes convenience editing may bypass document
transactions. Prove add, move, connect, delete, and undo through one history
before adding more gestures.

**R3. Schema drift.** Node metadata and workflow fields evolve independently of
the native binary. Preserve unknown data and test compatibility using server
fixtures. Unsupported semantics must be visible before saving or running.
