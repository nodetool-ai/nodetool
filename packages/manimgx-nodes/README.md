# @nodetool-ai/manimgx-nodes

[ManimGX](https://github.com/academa-labs/manimgx) nodes for NodeTool: math and
3D animations written in Manim Community Edition's Python API, rendered to
video by a Rust GPU engine.

The nodes shell out to the `manimgx` command, resolved from the `MANIMGX_PATH`
setting, `MANIMGX_PATH`, PATH, or `~/.local/bin`. Install it with:

```bash
uv tool install manimgx   # or: pip install manimgx (Python 3.13+)
```

They do not run in the hosted cloud, because a scene is a Python program that
runs with the server's permissions.

## Nodes

| Node | Does |
|---|---|
| `RenderScene` | Scene code → MP4, with the storyboard, layout report and subtitles |
| `InspectScene` | Storyboard, timeline and 2D layout checks, without video |
| `GenerateScene` | A language model writes the scene, fixes it from the inspection, then renders |

Each node takes dynamic inputs. The scene reads them with
`from nodetool_inputs import inputs`; image, audio and video inputs arrive as
file paths.

## Tests

```bash
npm run test --workspace=packages/manimgx-nodes
npm run test:real --workspace=packages/manimgx-nodes
```

The first runs against a fake `manimgx` and skips the real renders when none is
installed. The second fails without a real install and renders through it.

The authoring guide agents load is the
[`manimgx` system skill](../system-skills/manimgx/SKILL.md).
