# Custom Nodes: user-saved node types in the library

Status: design. Owner: web / code-nodes / agents. 2026-08-18.

## Problem

A user who has shaped a Code node into something useful — a scraper for one
API's response shape, a formatter for their invoice numbers, a validator for
their CSV layout — has no way to keep it as a *node*. The shipped snippets
(`web/src/config/codeSnippets.ts`) show the right interaction: open the node
menu, find "Extract URLs", drop it, and a pre-filled Code node appears. But
snippets are hardcoded into the build. A user's own work has exactly one
durable home today, the JS script document
([js-script-document-design.md](js-script-document-design.md)) — and a script
is reachable only through the Code node's **Link script** picker, three clicks
deep inside a node that already exists. Nothing a user saves ever shows up
where they look for nodes: the node menu.

This design closes that gap. A **custom node** is a JS script document the
user has chosen to expose in the node menu. It appears under a **My Nodes**
section of the palette with its declared inputs and outputs, drops onto the
canvas like any node, and the graph it lands in stays portable: the placed
node is a plain `nodetool.code.Code` node with the script materialized onto
it and a provenance link back to the library.

No new document type, no new storage, no new execution path. The feature is
a palette flag on the script document plus the wiring that makes flagged
scripts show up and drop correctly.

## What already exists

The three mechanisms this design composes, none of them modified in kind:

1. **JS script documents** are the library. `js_scripts` rows own a versioned
   document with `code`, declared `inputs`/`outputs` ports, `secrets`,
   `timeoutSeconds`, and saved tests (`packages/models/src/js-script.ts`,
   tRPC router `packages/websocket/src/trpc/routers/js-scripts.ts`).
2. **The snippet palette path** already puts virtual node types in the menu.
   `generateSnippetMetadata()` (`web/src/config/snippetMetadata.ts`) fabricates
   `NodeMetadata` records that `useMetadata.ts` merges into the store, and
   `instantiatePaletteNode` (`web/src/utils/instantiatePaletteNode.ts`)
   expands a virtual type into a real `nodetool.code.Code` node on drop. The
   registry never hears about these types, and the saved graph never contains
   them.
3. **The Code node script link** already defines what a placed custom node is.
   `useCodeNodeScriptLink.materialize()`
   (`web/src/hooks/nodes/useCodeNodeScriptLink.ts`) copies a script's code,
   packages, secrets and timeout onto the node, derives `dynamic_inputs` /
   `dynamic_outputs` from the declared ports, and records
   `properties.script = { id, version }` as provenance. Graph validation
   checks link freshness through `jsScriptPortMismatches` and
   `collectJsScriptLinks` (`packages/node-sdk/src/js-script-link.ts`,
   `graph-validation.ts`), and the editor already offers **update to latest**
   and **detach**.

A custom node is these three composed: a script (1) surfaced like a snippet
(2) that drops as a linked Code node (3).

## Document shape

One optional field on `JsScriptDocument`
(`packages/protocol/src/api-schemas/js-scripts.ts`):

```ts
interface JsScriptDocument {
  // ...existing fields unchanged...
  palette?: {
    category: string;   // menu grouping, e.g. "Text", "My API" — free text
  };
}
```

- **Absence means not exposed.** Every existing script stays a plain library
  script until its owner opts it in; `schemaVersion` stays 1 and old saves
  parse unchanged.
- **`category` is the only knob.** The node's title is the script's `name`,
  its description is the document's `description`, its ports are the declared
  `inputs`/`outputs` — all of which the script already maintains for its
  other consumers. Duplicating any of them into `palette` would create a
  second copy to drift.
- Validation (`validate_js_script` and the document-level rules in
  `packages/node-sdk`): a `palette` on a script with zero declared outputs is
  a warning (the node would have no handles to connect), and an empty or
  whitespace `category` is an error.

## Palette surfacing

Client-side synthetic metadata, the snippet path — not registry registration.
The registry (`NodeRegistry.global`,
`packages/node-sdk/src/registry.ts`) is process-wide with no per-user
scoping, and it does not need any: the virtual node type exists only between
the menu and the drop, and the saved graph never references it. Registering
per-user types server-side is deferred (see Out of scope) until something
server-side actually consumes them.

New module `web/src/config/customNodeMetadata.ts`:

```ts
export const CUSTOM_NODE_PREFIX = "user.";

export function customNodeType(scriptId: string): string {
  return `${CUSTOM_NODE_PREFIX}${categorySlug}.${scriptId}`;
}

export function generateCustomNodeMetadata(
  scripts: JsScriptSummary[]
): Record<string, NodeMetadata> { /* ... */ }
```

- **Node type is keyed on the script id**, not the name: ids are stable and
  unique, names collide and get renamed. The type string is transient (menu →
  drop), so its looks cost nothing. Title and search text come from `name`
  and `description`, which is what the menu's search index actually ranks
  (`NodeSearchIndex` weights title 6, description 1).
- **Namespace is `user.<categorySlug>`**, slugified the way
  `snippetMetadata.ts` slugifies snippet categories. `useNamespaceTree`
  builds the tree from namespace strings alone, so **My Nodes** appears as a
  `user` top-level group with the user's categories under it, no tree changes
  needed. `NamespaceIcon.tsx` gets one entry for the `user` root.
- **Ports map directly.** A declared input becomes a `Property` with its
  `TypeMetadata` and the type's default value; a declared output becomes an
  output entry. No AST inference — scripts declare their ports, which is the
  precision the snippet generator never had. `supports_dynamic_inputs` /
  `supports_dynamic_outputs` stay true, since the placed node is a Code node.
- A script whose body streams its inputs (`usesStreamInputContract`) gets
  `is_streaming_input: true`, so the menu and the drop both say what the node
  will do.

### Loading and refresh

Custom-node metadata is user data, so it cannot ride the unauthenticated
`GET /api/nodes/metadata` fetch. A hook beside `useMetadata.ts` —
`useCustomNodeMetadata` — queries `jsScripts.list` over tRPC (TanStack Query,
key `['jsScripts', 'palette']`), generates the records, and merges them into
`MetadataStore` after the base metadata load. Refresh rides the existing
cross-client sync: `js_scripts` changes already broadcast `resource_change`
(`registerDocumentSync`), which invalidates the query; saving a script,
toggling its palette flag, or deleting it updates the menu without a reload.
Signed-out and error states merge nothing — the menu degrades to the shipped
catalog.

## Drop semantics: materialize, with provenance

`instantiatePaletteNode` gains a third branch, before the snippet branch:

```ts
const script = findCustomNodeScript(metadata.node_type); // from the query cache
if (script) { /* materialize */ }
```

The branch does what `useCodeNodeScriptLink.materialize()` does today — the
port→slot mapping (`portsToSlots` / `portsToOutputs`) and property copying
move into a shared helper both call sites use, so drop and link cannot
drift:

- `properties`: `code`, `packages`, `secrets`, `timeout` from the document,
  and `script: { id, version }` pinning the version that was dropped.
- `data.title`: the script's name. `data.codeNodeMode = "custom"` — a third
  mode beside `"snippet"`, so `codeNodeUi.ts` renders the custom title and
  keeps it editable, and the property panel can show the link affordances
  (update to latest, detach, open script) without the user hunting for them.
- `afterAdd`: `dynamic_inputs` / `dynamic_properties` / `dynamic_outputs`
  from the declared ports, merged once the node exists in the store — the
  snippet pattern.

Everything after the drop is the already-shipped link behavior:

- **The graph is self-contained.** Execution reads only the node's own
  properties (`CodeNode.envelope()` never resolves the link), so the workflow
  runs on the server, in the packaged app, and after export exactly as a
  hand-written Code node does. A deleted or moved script costs freshness
  warnings, never the run.
- **Staleness is visible, not silent.** `validateGraph` with a
  `jsScriptLookup` reports `js_script_missing` and port mismatches through
  `jsScriptPortMismatches`; the editor's **update to latest** re-materializes
  and re-pins. Editing the library script does not mutate placed nodes — the
  same pin-and-update contract the link feature already made, now stated as
  the custom-node contract too: *your graphs keep the version you dropped
  until you update them.*
- **Detach** turns the node back into an anonymous Code node; the code is
  already inline.

## Save path: where "save my customized stuff" happens

Two entry points, both writing through the existing script machinery:

1. **From a Code node — "Save to My Nodes".** The Code node's context menu
   and property panel gain the action next to the existing **Extract to
   script**; it *is* `extractToScript` (which already lifts body, ports,
   packages, secrets into a new script and links the node) plus a small
   dialog for name and category that sets `palette` on the created document.
   One action, and the node the user customized is now in the menu.
   A node already linked to a script offers **Add to My Nodes** instead,
   which just sets `palette` on the linked script.
2. **From the script editor.** The `jsscript` surface's header gains a
   **Show in node menu** toggle plus the category field — the same
   `palette` write over the existing autosave/CAS sync. `ui_jsscript_set_meta`
   gains the field, so the script assistant can do it too.

Snippets stay as they are: a shipped snippet the user modifies is an
anonymous Code node until they save it, at which point path 1 makes it
theirs. No migration of `codeNodeMode: "snippet"` nodes.

## Agents and headless surfaces

Nothing headless ever sees a `user.*` node type — graphs carry
`nodetool.code.Code` — so `validate`, `debug`, the kernel, mini apps, and
mobile need no changes. What agents need is authoring parity with the user:

- **Discovery** is `list_js_scripts`, which already returns id, name,
  description, and ports. Its result gains the `palette` field so an agent
  can distinguish "the user's nodes" from utility scripts, and the graph
  tools' system prompt tells the agent to check it before writing a Code
  node body from scratch.
- **Placement**: the `ui_add_node` path in the web graph tools accepts the
  virtual `user.*` type like any palette type (it goes through
  `instantiatePaletteNode` already). Headless graph authoring
  (`create_workflow`, the DSL) materializes the same way a drop does; a
  shared helper in `@nodetool-ai/node-sdk` (`materializeJsScriptNode(document,
  link)` → properties + dynamic slots) keeps the web drop, the link hook,
  and headless authoring on one code path.

## Validation and safety

- The materialized body is validated exactly like any Code node body — the
  link adds freshness checks, it never relaxes anything.
- Secrets: the placed node carries the script's declared `secrets` list, and
  the Code node's existing secret gating applies. Dropping a custom node
  grants nothing the same node hand-written would not have.
- Scripts are per-user (`loadOwned` in the tRPC router); the palette is too.
  Sharing a custom node with another user is sharing the workflow (the code
  travels materialized) or exporting the script — a marketplace is out of
  scope.

## Phases

1. **Schema + save path.** `palette` on the document (Zod, validation rules),
   `ui_jsscript_set_meta` support, the script-editor toggle, and the Code
   node's **Save to My Nodes** action on top of `extractToScript`.
2. **Palette.** `customNodeMetadata.ts`, `useCustomNodeMetadata`, the
   `instantiatePaletteNode` branch, `codeNodeMode: "custom"`, the shared
   materialize helper refactor of `useCodeNodeScriptLink`, `NamespaceIcon`
   entry. A user can save a node and drop it from the menu.
3. **Agent parity.** `palette` in `list_js_scripts`, headless
   materialization through the shared helper, prompt guidance, and an eval
   case in `jsscript-tools` covering "save this Code node as a custom node,
   then use it in a second workflow".

Each phase lands green alone; phase 2 reads what phase 1 wrote and nothing
else.

## Testing

- Schema (`packages/protocol` / `packages/node-sdk`): `palette` parses and
  round-trips; the no-outputs warning and empty-category error each go red on
  a fixture built to violate them.
- Web (Jest/RTL): `generateCustomNodeMetadata` maps ports to
  properties/outputs (typed, defaults, streaming flag); the
  `instantiatePaletteNode` branch produces a node whose properties and
  dynamic slots equal what `materialize()` produces for the same script —
  asserted by comparing the two outputs, so the shared helper is proven
  shared; menu refresh on `resource_change`.
- Link freshness: dropping version N, bumping the script to N+1 with a
  changed port, and validating reports the mismatch — the existing
  `jsScriptPortMismatches` suite gains the drop-created fixture.
- Harness: `nodetool jsscript validate` on a fixture with `palette` passes;
  the eval case in phase 3 gates on the agent using the saved script rather
  than re-writing the body.

## Out of scope

- **Server-side registry entries for custom nodes.** Metadata-only
  registration exists (`loadMetadata`), but the global registry has no
  per-user scoping and nothing server-side consumes the virtual types today.
  If `search_nodes` should someday return them, that needs a per-request
  registry view — its own design.
- **Sharing and marketplace.** Custom nodes travel inside workflows
  (materialized) and as exported scripts; a catalog of other users' nodes is
  a distribution problem this design does not touch.
- **Custom icons and colors.** Metadata has no icon field; the `user`
  namespace gets one icon. Per-node art waits until metadata grows it for
  shipped nodes too.
- **Non-Code custom nodes** (saving a configured LLM node, a subgraph). A
  subgraph-as-node is a different feature with its own execution semantics;
  this design deliberately stops at what the Code node can express.
