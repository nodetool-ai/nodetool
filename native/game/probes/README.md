# Dependency probes

`game-dependency-probe` evaluates a bounded native QuickJS call and advances a
Jolt rigid body for one fixed tick. It has no Qt or GPU dependency. Dependency
archives and checksums come from `../dependencies.json`. Configuration copies the
upstream license notices into the build's `licenses/` directory.

For native execution, build with `GAME_BUILD_DEPENDENCY_PROBES=ON` and run CTest.
For the browser feasibility build, install Emscripten and Node, then run:

```bash
emcmake cmake -S native/game/probes -B native/game/build-wasm
cmake --build native/game/build-wasm --target game-dependency-probe -j 2
ctest --test-dir native/game/build-wasm -R native-game-dependencies --output-on-failure
```

This checks a Node-hosted WebAssembly executable. It does not establish browser
rendering, browser export, download size, or cross-platform replay equivalence.
