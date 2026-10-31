# Sunrush Kart native port

This fixture adapts the existing `packages/game-runtime/samples/sunrush-kart`
course to native schema 4, shared QuickJS and the native Qt/WASM presentation
contract. Original source files and assets remain unchanged. It does not run
the legacy TypeScript session or renderer.

All 31 source entities and ten original function bodies are retained. The
functions run in one controller with separate states and a previous-tick property
overlay. Native commands do not expose `setProp`, so source property changes are
staged until every role has read the same committed snapshot. Targeted pulse
events preserve their source and target metadata through native event data.
Race progress, ordered gates, laps, steering, drifting, items, recovery, pause,
camera and HUD logic remain in the original functions.
The original racer intentionally leaves its own index empty in its `seen`
array. Legacy JSON serialization turned that sparse slot into `null` between
ticks. The fixture materializes sparse array holes as `null` before native
state serialization. Explicit `undefined` values and nonfinite numbers still
fail, and no original function body changes.

The source racers and camera rig have scripted kinematic bodies without
colliders. The native binding uses seven tiny, noninteracting sensor pose
markers with collision mask zero. Their positions use admitted native
`setPosition` commands. Nonphysical heading children preserve source quaternion
poses and the original kart/camera hierarchy. The source's custom kart overlap
solver remains unchanged. These markers are not a new physical vehicle model.
Keyboard actions produce throttle and steering axes when explicit recorded
analog axes are absent. Per-racer scripted poses take precedence over Qt's
default movement input. Enter starts/retries, Shift drifts, Space/E uses items,
Q looks back, R recovers and Escape invokes scripted pause. Qt intercepts P as
host pause before authored actions, so P and Escape are different paths.
Gamepad and touch device parity is not claimed.

## Assets and presentation

All 23 source asset files are verified against their authored SHA256 digests.
The three large scenery models exceed the unchanged 100,000-vertex model cap.
Preparation welds only identical complete attribute byte tuples, including
negative-zero bits, then partitions triangles under the existing bounds.
Expanded triangle attribute hashes must remain identical. Materials, node
hierarchies, selected scenes and ocean animation are retained. Images extracted
as closed dependencies retain their encoded bytes and hashes. Preparation
records source counts, prepared counts and hashes in `provenance.json`.

Original ocean `COLOR_0` RGB/alpha and
`KHR_materials_emissive_strength` are retained without approximation. Their
native engine/render support and actual model admission are separate checks.
`modelAdmissionPending` remains true until those checks run. A passing schema
or gameplay run does not establish model admission or visual parity.
Sunrush explicitly uses the PBR environment profile. Emissive strength, material
mask/blend and shadows are PBR features. The compatibility profile gains vertex
RGBA support only, so Sunrush evidence does not establish those PBR features in
the compatibility profile.

The following native presentation differences are explicit:

- Source Neutral tone mapping/MSAA becomes admitted AgX/SMAA. Source linear
  distance fog is omitted because native height fog has different semantics.
- Player kart squash scaling has no native runtime command. Rotation and hop
  remain supported, while the dynamic scale component is omitted.
- Source confetti boxes become native tetrahedra with the source color range's
  fixed midpoint. Other particle settings and emission commands are retained.
- Native UI retains the source panels, text, bars and verified fonts. Three
  buttons become static panels and labels with keyboard actions. Pointer/focus
  activation is unsupported. Six moving minimap dots require dynamic HUD
  positions and are omitted. The static course minimap remains.
- Static audio bus gains become event volumes. Reverb, ducking, fade transitions
  and finish snapshots are unsupported. Original WAV bytes remain unchanged.

This is an explicit native adaptation, not a claim of complete visual, input,
audio or physical parity.

## Reproduce

Use the repository's Node version and built workspace packages. Choose a
writable output directory and an installed native worker:

```bash
export SUNRUSH_OUT="$TMPDIR/sunrush-kart-native-qa"
export NODETOOL_NATIVE_GAME_WORKER=/path/to/install/bin/game-worker
node --test native/game/tests/fixtures/sunrush-kart/adapt.test.mjs
node native/game/tests/fixtures/sunrush-kart/adapt.mjs packages/game-runtime/samples/sunrush-kart "$SUNRUSH_OUT"
SUNRUSH_TICKS=8 node native/game/tests/fixtures/sunrush-kart/run.mjs "$SUNRUSH_OUT" "$NODETOOL_NATIVE_GAME_WORKER"
node native/game/tests/fixtures/sunrush-kart/run.mjs "$SUNRUSH_OUT" "$NODETOOL_NATIVE_GAME_WORKER"
node native/game/tests/fixtures/sunrush-kart/verify.mjs "$SUNRUSH_OUT"
node native/game/tests/fixtures/sunrush-kart/probes.mjs "$SUNRUSH_OUT" "$NODETOOL_NATIVE_GAME_WORKER"
```

The full runner consumes the source's 3717 recorded frames with Qt-shaped
movement fields and explicit analog axes. It checks three ordered laps and
finish, then restores a midpoint snapshot in the same live session and compares
every continuation frame digest. Partial development runs cannot establish full
completion. Runtime, asset-admission, live-input, capture and benchmark results
must be read from the actual output reports. Software captures do not establish
hardware FPS. No engine cap or watchdog is raised by this fixture.

The bounded control probes test no-start behavior, countdown pause/resume,
look-back camera position and resolved view direction, and recovery without
granting a lap or gate. The full verifier requires three ordered lap events,
one real finish/win, drift/boost/pickup/item events, six results and the native
results UI. Frame positions are observed native output, not copied legacy
assertion coordinates.
