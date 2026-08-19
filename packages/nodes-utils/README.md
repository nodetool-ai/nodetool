# @nodetool-ai/nodes-utils

Shared helpers for node packages: platform tags and lazy Node-only module loaders for [NodeTool](https://nodetool.ai).

A small utility crate every `*-nodes` package depends on instead of duplicating helpers or pulling the whole base-nodes barrel: platform-tagging helpers that stamp `static platforms` onto node arrays, lazy loaders for `node:` built-ins so non-portable paths don't block module init on non-Node runtimes, template variable substitution, Buffer-free base64, and the destination rules every `Save*File` node shares.

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
| `resolveSaveTarget` | function | Folder + filename → an absolute path, directory created, name numbered on collision |
| `resolveSaveFolder` | function | Pick the workspace folder or the node's own `folder` property |
| `uniqueFilePath` | function | `name.ext` → `name_1.ext`, `name_2.ext`, … past what is already there |
| `folderPathOf` | function | Read a folder property (path, `file://` URI or folder ref) |
| `SAVE_TO_WORKSPACE_TITLE` | const | Title every save node shows on the workspace toggle |
| `SAVE_TO_WORKSPACE_DESCRIPTION` | const | Description every save node shows on the workspace toggle |
| `VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE` | const | `json_schema_extra` (`visible_when`) that shows the folder field only while the toggle is off |

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

### Saving a file from a node

```ts
// Writes into the run's workspace folder while `save_to_workspace` is on, and
// numbers the name (`out_1.png`) rather than overwriting what is there.
const target = await resolveSaveTarget({
  folder: this.folder,
  filename: dateName(String(this.filename || "out.png")),
  saveToWorkspace: this.save_to_workspace,
  workspaceDir: context?.workspaceDir
});
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
