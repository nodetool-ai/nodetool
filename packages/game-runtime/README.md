# Native game simulation

The public factories preserve legacy schema versions 1 and 2 with engine `1`.
Schema version 3 uses `dimension: "3d"` and engine `2`. `openGameSession`
validates the version and prepares the selected spatial implementation. Opening
2D does not import Rapier or Three.js.

Both dimensions use the shared [gameplay lifecycle](src/gameplay/lifecycle.ts)
for score, collection, triggers, lifetime, spawning, transitions, HUD, audio,
health state, seeded randomness, event limits and failed-tick handling. The
legacy ordered-event, render-frame and snapshot characterization fixtures were
recorded before extracting those rules.

3D uses pinned Rapier WASM with meters, Y up, normalized quaternions and a fixed
60 Hz tick. Player capsules remain upright. Follow-camera state and controller
state belong to snapshots. Authored follow-camera yaw, pitch and pitch limits
use degrees. Committed camera yaw/pitch and script camera inputs use radians.
Visual model animation is cosmetic and cannot move
physics bodies. Scripts run in the same isolated QuickJS scheduler with explicit
3D commands and JSON state. Query results arrive in the next tick.

Prepared collider bytes must match their binding digest, version, counts and
bounds before creating a physics shape. Triangle meshes require static bodies.
Physics hierarchies reject scale and competing transform owners. Snapshot
restore verifies the engine build and the authored document digest. Every 3D tick
rehydrates the serialized Rapier world before advancing physics, including a
continuous session. Rapier omits transient traversal caches from its snapshots.
Using that same codec boundary on both paths preserves exact world bytes after
resume. This trades serialization work for strict replay in small worlds, and
releases the previous world and its controllers each tick.

The package uses TypeScript's bundler resolution for Rapier's declaration files,
which contain extensionless internal imports. Its compiled output remains ESM
and is exercised through the public factory in Node.

Run `npm run test --workspace=packages/game-runtime` for compatibility, controller,
physics, script isolation, prefab and replay fixtures. See the
[3D design](../../docs/plans/native-game-3d-upgrade.md) for ownership rules and
release scope.

The [Relay Yard example](samples/relay-yard/README.md) provides an asset-free
3D course, a completion recording and CLI assertions for collection, gate
movement and the finish.
