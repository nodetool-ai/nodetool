# Native distribution

The CMake install target stages the worker, player, benchmark executable, Qt
runtime dependencies and plugins, embedded shaders, and dependency notices.
When the editor target is enabled, installation also stages the editor and QML.
Build and install on the target operating system. Cross-platform package builds
are not inferred from a Linux smoke test.

```bash
cmake --install native/game/build-player --prefix /absolute/runtime-directory
node packages/game-runtime/scripts/native-game-export.mjs --document game.json --assets-root assets --runtime-dir /absolute/runtime-directory --output exported-game
node native/game/scripts/check-delivery.mjs native/game/build-player
```

Alternatively, pass `--build-dir` instead of `--runtime-dir` to install directly
into the export's staging directory. Export validates the native document by
running its installed player, checks asset identities, sizes, digests and paths,
then captures an exact tick before publishing the destination atomically. An
existing destination is preserved and rejected. Failed exports remove staging.
Only prepared assets and the deployed runtime enter the bundle. Host provider
credentials and development loader variables are not passed to the smoke player.

The exported `play` launcher (`play.cmd` on Windows) uses the bundled player,
`game.json`, and prepared assets. `bundle.json` records relative paths and content
digests. Internal runtime library symlinks become regular files so the bundle can
be persisted through a workspace artifact store. External links are rejected.
The destination is published once. Updating a game creates a new export.

The standalone check installs outside the checkout, runs headless capabilities
without a graphics probe, renders a committed tick with the installed player,
and verifies Linux Qt libraries resolve inside the deployed directory. Linux
capture checks use Xvfb. Platform drivers and system libraries remain operating
system prerequisites.

The native worker is an optional package runtime asset. Stage an actual built
worker before backend packaging:

```bash
node packages/game-runtime/scripts/stage-native-runtime.mjs native/game/build-player
npm run backend:smoke
```

A backend profile without the staged binary reports native execution as
unavailable. It does not resolve a source checkout or advertise an absent worker.
The exporter script is a required runtime asset and is copied by the game-runtime
package build. A deployed player directory is configured with
`NODETOOL_NATIVE_GAME_RUNTIME_DIR`; a bare executable is insufficient to provide
Qt plugins and shared libraries.

`game-player --capabilities` reports compiled capabilities without requiring a
window system. Actual graphics availability is established by rendering, not by
that handshake. Operation failures write structured diagnostics to stderr and to
the requested `--report` file. A host must also retain subprocess exit code or
signal when a process crashes before producing a report.
