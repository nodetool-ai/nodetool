# @nodetool-ai/blender-nodes

Headless Blender nodes for NodeTool: render glTF scenes to images, image
sequences and render passes, and prepare meshes for a game engine.

The nodes shell out to a Blender binary, resolved by `blender-binary.ts` from
`BLENDER_PATH` or the platform's usual install locations. Without a
Blender install the nodes fail their preflight with the path they looked for —
they never silently produce an empty render.

## Nodes

| Node | Does |
|---|---|
| `RenderImage` | One frame of a glTF scene |
| `RenderAnimation` | A frame range, returned as a video |
| `RenderPasses` | Per-pass output (depth, normal, cryptomatte, …) |
| `PrepareForEngine` | Mesh cleanup, decimation and export for engine import |
| `ExportModel` | Convert a scene between the formats Blender writes |

## Usage

Install the package alongside the runtime and it registers with the node
registry like any other node package:

```bash
npm install @nodetool-ai/blender-nodes
```

Run a single node without a graph:

```bash
nodetool node run nodetool.blender.RenderImage --props '{"scene": "..."}'
```

See [AGENTS.md](../../AGENTS.md) for the repo-wide build and test commands.
