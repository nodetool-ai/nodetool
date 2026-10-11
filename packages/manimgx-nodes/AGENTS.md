# manimgx-nodes — ManimGX Scenes

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **manimgx-nodes**

The `nodetool.manimgx.*` nodes run the [ManimGX](https://github.com/academa-labs/manimgx)
command line on a Python scene: `RenderScene` (`manimgx render`, MP4),
`InspectScene` (`manimgx inspect`, storyboard and layout checks) and
`GenerateScene` (a language model writes the scene and fixes it from the
inspection). The authoring guide for agents is the shipped
[`manimgx` skill](../system-skills/manimgx/SKILL.md).

- **A scene is a program.** It runs with the server's permissions, so
  `runManimgx` refuses under the cloud profile (`isManimgxEnabled`), and the
  `nodetool.manimgx` namespace stays out of `CLOUD_NODE_NAMESPACES`. Keep both.
- **Binary discovery order**: the user's `MANIMGX_PATH` setting, process
  `MANIMGX_PATH`, `manimgx` on PATH, then `~/.local/bin/manimgx`.
- **The desktop Package Manager installs ManimGX** as the `manimgx` runtime
  package (`UvToolRuntimePackage` in `electron/src/runtime/packages/`). It
  runs `uv tool install` into the app's `uv-tools/bin`, which the server's
  PATH holds. A missing binary throws `MissingRuntimePackageError` for
  `manimgx`, and the nodes declare `requiredRuntimes = ["manimgx"]`, so the
  editor offers that install. Keep the id the same in all three places.
- **The argv is built in one place**, `manimgxArgs`. Every value reaching it
  is validated: the scene name must be a Python class name, times are seconds
  or `end`, the preset is from `MANIMGX_PRESETS`, numbers are clamped. Add a
  flag there and test that a hostile value is refused.
- **The child's environment is an allowlist** (`childEnv`): the server's
  secrets never reach a scene. GPU and Vulkan loader variables pass by prefix.
- **Outputs are read by fixed names after `lstat`.** A scene can write
  anything in its directory, so a symlink or directory where the video should
  be is never followed.
- **A failing scene is a result for `inspect`, an error for `render`.**
  ManimGX exits 1 both for a traceback and for layout problems; the runner
  tells them apart by the `layout: N problems` line.
- **Tests run against `tests/helpers/fake-manimgx.mjs`**, whose behavior is
  picked by a `# fake:<mode>` comment in the scene (the runner scrubs env).
  `tests/real-manimgx.test.ts` runs only when a real `manimgx` resolves;
  `npm run test:real` (`NODETOOL_REQUIRE_MANIMGX=1`) makes a missing install
  fail it.
