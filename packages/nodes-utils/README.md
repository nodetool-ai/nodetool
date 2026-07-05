# @nodetool-ai/nodes-utils

Shared helpers for node packages: platform tags and lazy Node-only module loaders for [NodeTool](https://nodetool.ai).

A small utility crate every `*-nodes` package depends on instead of duplicating helpers or pulling the whole base-nodes barrel: platform-tagging helpers that stamp `static platforms` onto node arrays, lazy loaders for `node:` built-ins so non-portable paths don't block module init on non-Node runtimes, template variable substitution, and Buffer-free base64.

## Install

```bash
npm install @nodetool-ai/nodes-utils
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `tagAsServer` | function | Mark a `_NODES` array as server-only |
| `tagAsNode` | function | Mark nodes as requiring the Node runtime |
| `tagAsHybrid` | function | Mark nodes as running on server or browser |
| `tagAsBrowserGpu` | function | Mark nodes as needing browser WebGPU |
| `tagAsUniversal` | function | Mark nodes as runnable on any platform |
| `tagAsContentCard` | function | Tag nodes surfaced as content cards |
| `loadNodeFsPromises` | function | Lazily import `node:fs/promises` |
| `loadNodeFsSync` | function | Lazily import `node:fs` |
| `loadNodePath` | function | Lazily import `node:path` |
| `loadNodeOs` | function | Lazily import `node:os` |
| `loadNodeUrl` | function | Lazily import `node:url` |
| `renderTemplate` | function | Substitute `{{ variable }}` / `{variable}` placeholders |
| `referencedVariables` | function | List variable names referenced in a template |
| `base64ToBytes` | function | Decode base64 to `Uint8Array` (Node + browser) |
| `bytesToBase64` | function | Encode bytes to base64 (Node + browser) |

## Usage

```ts
import {
  tagAsServer,
  renderTemplate,
  loadNodePath
} from "@nodetool-ai/nodes-utils";

tagAsServer(_NODES);

const text = renderTemplate("Hello {{ name }}", { name: "world" });

// Only touches node:path when this path actually runs
const path = await loadNodePath();
const full = path.join(dir, "file.txt");
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
