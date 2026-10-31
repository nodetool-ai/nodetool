# Native game engine

Follow [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) and the
[port plan](../../docs/plans/native-game-cpp-port.md). Use C++20 and RAII.
Simulation and document targets must not depend on Qt or graphics libraries.

Run `node scripts/check-native-game.mjs` from the repository root. Generated
schemas belong to `packages/protocol/src/native-game.ts`. Regenerate them through
its schema generator instead of editing generated JSON by hand.

Worker stdout contains only length-prefixed MsgPack frames. Diagnostics go to
stderr. Keep requests bounded and report unsupported operations explicitly.
