# Signal Forge native port

This fixture adapts the original Signal Forge industrial relay puzzle to
`native-cpp-1`, schema 4, QuickJS and Jolt. The web document and source media
remain unchanged. It retains every original entity and all fifteen authored
script functions verbatim, with independent role state.

The native engine invokes entities in ID order. Three contiguous controller
groups retain that order, including audio immediately after the courier role.
Each group keeps the unchanged sixteen-command limit and throws on overflow.
Commands retain their original entity owner. Newly emitted events are delivered
on the next committed tick. Removed roles stop executing.

Original model-node selections and per-instance materials are prepared into
closed native model assets. The asset preparer preserves selected geometry,
texture bytes and WAV bytes, and records digests in `asset-provenance.json`.
The original prepared obstacle mesh becomes the native inline static collider.
The final beacon's sole identity-local model is bound directly to its physical
collectible owner, so physical collection also removes the visual. The original
child ID remains as a detached nonvisual marker. The adapter rejects a nonidentity
child transform or multiple parts rather than applying this transfer incorrectly.

## Reproduce

Use the repository Node version and built dependencies. All output goes to an
explicit writable cache directory. Do not overwrite the web source game.

```bash
node --conditions=nodetool-dev --import=tsx --test native/game/tests/fixtures/signal-forge/adapt.test.mjs
node --conditions=nodetool-dev --import=tsx --test native/game/tests/fixtures/signal-forge/prepare-assets.test.mjs
node --conditions=nodetool-dev --import=tsx native/game/tests/fixtures/signal-forge/adapt.mjs "$SIGNAL_OUT"
node --conditions=nodetool-dev --import=tsx native/game/tests/fixtures/signal-forge/run.mjs \
  --document "$SIGNAL_OUT/game.json" --worker "$NODETOOL_NATIVE_GAME_WORKER" --out "$SIGNAL_OUT/run"
LP_NUM_THREADS=1 QSG_RHI_BACKEND=vulkan node native/game/tests/fixtures/signal-forge/capture.mjs \
  "$SIGNAL_OUT" "$NODETOOL_NATIVE_GAME_PLAYER"
```

The runner checks every returned frame with the actual protocol parser. A run
only reports completion after native score, physical collection of the final
beacon, relay, coolant and reactor events, and the original winning UI logic.
It restores its midpoint checkpoint in the originating live session and compares
the entire continuation with targeted ownership-generation normalization.
Failure receipts retain the committed prefix and the error. `--probe` allows a
bounded nonwinning route while reporting `complete:false`.

The capture command shows the Linux verification configuration. It uses Xvfb
and captures the actual installed player at ticks 0, 609 and 1,219. Set the
player variable to an install with native metallic-roughness texture support.

## Compatibility limits

Continuous force becomes a fixed-step impulse `force / 60`. Jolt replaces the
legacy engine's character, damping and friction implementation. Exact legacy
physics parity is not asserted. Native angular impulses and per-body gravity
scale are unavailable. The sphere core's rolling torque is omitted, and the two
decorative flywheels retain fixed poses rather than dynamic spinning.

The expanding repulsor-field visual is unsupported because native 3D visual
commands admit rotation only. The authored tiny initial visual remains, while
the actual repulsion force and pulse events are retained. The original linear
near/far fog is omitted because native fog uses a different height-fog contract.
Follow/orbit preserves its offsets and sensitivity without the legacy camera
collision sphere sweep.

`setProp` updates stay in each guest role's adapter state. No original Signal
Forge role reads those values from a different role. Native frames retain the
authored entity props. Audio applies the source volume and static master/bus
gains. Limiting, reverb, music fade envelopes and exact spatial mixing parity
are not asserted.

The selected geometry exceeds the existing browser indexed-vertex cap. This
fixture targets native Qt play and does not increase that cap. Initial native
asset admission rejected the authored metallic-roughness textures. Native
importer and QRhi material support now admit those maps without replacing them
with constants. The verified Release player prepared and rendered the retained
model selections and images at all three capture ticks.

## Verified results

The unchanged 1,219-tick source route completes relay, coolant and reactor
objectives in order, physically collects the final beacon for score 1, and
shows the original victory UI with progress 4. The independent Release worker
also passes 610 continuation comparisons after restoring its originating
session's midpoint checkpoint. Manual checkpoint recovery, distant pulse
rejection, camera-relative movement, jump/landing and nonplayer collectible
overlap probes pass. Removing the player-only sensor mask makes the negative
probe fail with actual score 1, demonstrating that the guard detects a wrong
collector.

Actual Qt Release captures pass at ticks 0, 609 and 1,219 at 1280×720 using
Vulkan and llvmpipe with `LP_NUM_THREADS=1`. Start and midpoint PNGs are
byte-identical to the default-thread captures. An initial OpenGL context setup
failure and the first Vulkan finish capture's `SCRIPT_LIMIT` remain recorded;
the final three captures and independent Release worker run pass with the
native script watchdog unchanged. These captures prove rendering on the named
software configuration, not hardware frame rate or audible device playback.

The initial Release headless benchmark used 240 measured ticks after 60 warmup ticks
and reports total p95 of **6.481992 ms**. It fails the unchanged **4 ms** target
with exit 2. This serial fixed-input simulation measurement is separate from
the busy gameplay route and synchronized rendering costs.

After the QuickJS thread-handoff correction, refreshed Release binaries repeat
the full 1,219-tick route, 610 same-session continuation comparisons and all
gameplay probes successfully. The refreshed player's finish capture uses the
same Vulkan backend, `LP_NUM_THREADS=1` and 1280×720 settings. Its PNG is
byte-identical to the earlier finish capture, with SHA-256
`387d3d93c0413eab09a6959ed50cd94f27498c3ecd4948dd0ed6c99ce45ce08b`.
The refreshed benchmark repeats exactly 240 measured ticks, 60 warmup ticks
and the 4 ms limit. It reports **6.864616 ms** p95 and exits 2. Both benchmark
results miss the target; the difference is not attributed to the code change.

Evidence is retained under `/home/mg/.cache/native-final-tmp/` in
`signal-forge-release-worker-run/verification.json`,
`signal-forge-asset-preflight/capture-evidence.json`,
`signal-forge-negative-control.json`,
`signal-forge-capture-thread-parity.json` and
`signal-forge-release-bench.json`. The captured document digest is
`806ac1b8361a00db3522c94c9075715e86e183979614206a7f446b9964b7d6d7`.
The refreshed binary hashes, commands, exits, unchanged input hashes, capture
comparison and benchmark are retained in
`signal-forge-thread-hop-live/receipt.json` in the same cache directory.

