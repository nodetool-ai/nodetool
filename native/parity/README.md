# Native parity harness

Compares the native Qt node editor with the web node editor so an agent can
decide what to port or fix next. It has two parts:

1. The **census** (`census.mjs`) lists what the web editor offers and whether
   the native editor has it. It reads both source trees and needs no build.
2. The **runner** (`run.mjs`) mounts one component at a time on both sides
   with the same fixture, plays a scenario, and compares what each side
   reports. It needs the Qt parity host and the web dev server.

Neither part runs in CI. `npm run test:affected` runs the census check and the
unit tests in `tests/` when a file under `native/parity/` changes.

## Census

```bash
npm run parity:census                 # summary and the open items
npm run parity:census -- --json out.json
npm run parity:census -- --check      # fail on stale registry entries
npm run parity:census -- --suggest    # registry entries for unreviewed shortcuts
```

Three inventories are counted: keyboard shortcuts, property editor types and
web components. Each item is `match`, `partial`, `differs`, `missing`,
`accepted` (a deliberate difference) or `unreviewed`. The census prints two
numbers per inventory:

- **parity**: credit over the reviewed items (match 1, partial and differs
  0.5, missing 0).
- **coverage**: the share of items someone has reviewed.

A low coverage means the parity number says little. Review items into
`registry.json`:

| Inventory | Key | Entry |
|---|---|---|
| `shortcuts` | the web shortcut slug in `web/src/config/shortcuts.ts` | `{"native": "<command in EditorMenus.cpp>"}`, `{"missing": "<why>"}` or `{"accepted": "<why>"}` |
| `propertyTypes` | the type in `PropertyInput.resolver.tsx` | `{"native": "<the path that handles it>"}`, `{"partial": "<what differs>"}` or `{"accepted": "<why>"}` |
| `components` | the web file path | `{"native": ["<qml or cpp path>"], "status": "partial", "note": "..."}` |

Shortcuts and property types are classified from the sources first. A
registry entry for them records what a scan cannot see. `--suggest` matches
shortcuts by key combination only, so check each suggestion before you add
it: an asset viewer's Left arrow is not the canvas's Move left.

## Runner

### Build the Qt host

The host links the component interfaces and the `NodeTool.NodeEditor` QML
module, and nothing of the editor window, QtNodes or the graph runner. The
components-only configuration builds just that:

```bash
cmake -S native/node-editor -B native/node-editor/build-parity -G Ninja \
  -DNODETOOL_NODE_EDITOR_COMPONENTS_ONLY=ON -DBUILD_TESTING=OFF
cmake --build native/node-editor/build-parity --target nodetool-parity-host
```

A full editor build also builds the host. Pass `-DNODETOOL_PARITY_HOST=OFF`
to leave it out.

### Run

```bash
npm run build:packages     # the web page imports built workspace packages
npm run parity             # every scenario in scenarios/
npm run parity -- --scenario node-menu.search-add
npm run parity -- --host <path to nodetool-parity-host> --out <dir> --json
```

`NODETOOL_PARITY_HOST` sets the host path. `NODETOOL_PARITY_CHROMIUM` sets the
Chromium binary when the installed Playwright browsers do not match.

The runner writes `report.json` and the screenshots to `--out` (default
`native/parity/out/`, ignored by git). `report.next` lists the failed checks
in the order to work on them: wrong intents, then wrong state, then pixel
differences.

### What a scenario compares

```json
{
  "id": "node-menu.search-add",
  "component": "NodeMenu",
  "fixture": "node-catalog",
  "steps": [
    { "act": { "type": "type", "text": "resize" } },
    { "observe": { "name": "searched", "compare": ["results", "highlighted"], "screenshot": true } },
    { "act": { "type": "key", "key": "Enter" } },
    { "observe": { "name": "added", "intents": true } }
  ]
}
```

- `act` sends the same input to both sides: `key` (web `KeyboardEvent.key`
  names, with `modifiers`), `type`, `click` or `hover`. A click target is a
  QML `objectName` on Qt and `[data-parity="<name>"]` on the web, or the
  selector in `webTarget`.
- `observe` reads each side's **probe**, a small JSON object that the mount
  of that component defines, and compares the fields in `compare`.
- `intents: true` compares what the component asked its host to do since the
  last observation. On Qt that is every `*Requested` signal of the mounted
  interfaces. On the web it is what the mount records, such as `addNode`
  from the node store. `intents.json` maps Qt signal names to web names.
- `screenshot: true` captures both components and counts the share of 10 by
  10 pixel tiles whose grey level differs. Above `pixelThreshold` (default
  0.05) the check fails. Use it to find layout and styling gaps, not to
  require identical pixels.

Fixtures live in `fixtures/`. `node-catalog.json` is node metadata from the
generated node catalog; rebuild it with `node native/parity/fixtures/build.mjs`.

### Protocol of the Qt host

`nodetool-parity-host` reads one JSON command per line on stdin and writes one
reply per line on stdout. Every reply has `ok`, the command's `id` and `ms`.

| Command | Fields | Reply |
|---|---|---|
| `hello` | | `components`, `qt` |
| `mount` | `component`, `fixture`, `theme` (`dark` or `light`) | `width`, `height` |
| `act` | `action` as in a scenario | |
| `observe` | `screenshot` (optional path) | `state`, `intents` |
| `unmount` | | |
| `quit` | | |

### Add a component

1. Qt: add a `Mount` in `host/Mounts.cpp`. It owns the fixture interfaces,
   fills them through the production mapping code (for example
   `NodeCatalog::entriesFromMetadata`), sets the required properties and
   implements `probe`. A component that needs `EditorWindow` cannot be mounted
   until it takes narrow interfaces instead.
2. Web: add the same name to `MOUNTS` in `web/src/parity/mounts.tsx`. Seed the
   stores the component reads, record intents, and return a probe with the
   same field names.
3. Map new intents in `intents.json` and add a scenario in `scenarios/`.
4. Record the result in `registry.json` under `components`.
