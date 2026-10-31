# BLACKSITE visual parity fixture

This fixture references the shipped [BLACKSITE source](../../../../../packages/game-runtime/samples/blacksite/README.md)
and its owned assets. It does not copy binary media or change the legacy game.
[The parity plan](../../../../../docs/plans/native-game-blacksite-visual-parity.md)
defines the native implementation scope.

`inventory.json` preserves source environment, material, light, decal, particle,
animation, font and HUD values, with asset and script digests. Regenerate it from
the repository root:

```bash
node native/game/tests/fixtures/blacksite/inventory.mjs native/game/tests/fixtures/blacksite/inventory.json
```

Prepare a new artifact directory with:

```bash
node native/game/tests/fixtures/blacksite/prepare-assets.mjs --out "$TMPDIR/blacksite-parity-assets"
node --test native/game/tests/fixtures/blacksite/lossless-glb.test.mjs
```

The preparer retains the original rifle bytes, including translucent optic
glass. It partitions the facility into portable chunks bounded by 50,000
vertices and 150,000 indices. The triangle walk and packing are linear. Source
and prepared SHA-256 digests cover expanded triangle attributes, preserving
winding, positions, normals and UVs. Material bindings, node transforms and
compressed image bytes are checked separately. The four original PNG images
are external closed image dependencies shared by every model chunk. Their
bytes remain unchanged. Model chunks and image files stay within portable model
preparation's 8 MiB file limit. The test deliberately changes
a prepared position byte and a material and proves that verification fails.
Output files cannot overwrite an existing preparation.

Asset preparation requires `ffmpeg` and `ffprobe` on `PATH`. The original score
is Vorbis OGG, while native browser audio admits WAV. The preparer decodes its
verified bytes to float32 PCM and copies that payload unchanged into a canonical
RIFF format-tag-3 WAV. It applies no gain, resampling or integer quantization.
The logical `score` asset remains present. Its original OGG is retained unchanged
at `source-audio/score.ogg` alongside conversion provenance. Legacy source files
and every visual asset remain unchanged.

The score retains mono, 48 kHz and 48 seconds, with 2,304,000 finite samples.
Its WAV occupies 9,216,044 bytes. It uses the existing 64 MiB audio file admission
in [the native decoder](../../../src/audio/Audio.cpp) and
[browser exporter](../../../../../packages/game-runtime/scripts/native-game-web-export.mjs).
The [browser audio decoder](../../../../../packages/game-renderer/src/native-cpp/audio.ts)
also bounds decoded audio to 64,000,000 samples and 600 seconds. Model/image
files retain their 8 MiB limit and model dependency closures retain their
16 MiB limit in [portable model preparation](../../../src/browser/Model.cpp).
Audio is outside those model closures. No engine budget is increased.

`prepare-assets.test.mjs` retains the copied-OGG regression, compares every
decoded payload byte with an independent decode, verifies the original source
copy and hashes, and checks the fixed visual-manifest digest. It also rejects
nonfinite samples, invalid channels/rates, incomplete blocks and oversized audio.
Music mixer and playback parity remain outside the visual comparison scope.

`adapt.mjs --out <directory>` performs that preparation and writes the native
document, copied routes, assertions and adaptation provenance. It wraps the
original player, camera, muzzle and weapon scripts without rewriting their
source. The wrapper maps native commands, broadcasts and prefab lifetimes and
rejects unmapped commands. Rifle impact presentation requires a surface normal
on native ray hits. Decimal light IDs are mapped reversibly to admitted IDs.
The source `facility` ID remains a nonvisual receiver root above the model
chunks, so decals can resolve its descendant geometry.

```bash
node native/game/tests/fixtures/blacksite/adapt.mjs --out "$TMPDIR/blacksite-native-parity"
node --test native/game/tests/fixtures/blacksite/adapt.test.mjs native/game/tests/fixtures/blacksite/lossless-glb.test.mjs
```

`completion.inputs.json` is a byte-for-byte copy of the original 583-tick route.
Native assertions establish five kills and extraction. The legacy victory tick
is 560 and the native camera1 adaptation's victory tick is 557. Compare gameplay
outcomes without claiming exact cross-engine physics.

`comparison.json` fixes capture resolution, seed and feature probes and records
initial native camera anchors. Capture the ordinary gameplay camera separately,
then use the generated shared-probe camera in each renderer. Start, combat and
extraction frames alone do not exercise every transient effect. Inspect the muzzle, explosion,
reload and damage probes as well. The damage probe requires observed damage
before accepting its frame.

Controlled presentation comparisons must also match entity poses and active
sets, animation and lighting time, and particle seed/history where supported.
Save those probe inputs and their digests. Label renderer-only adapters and
keep them separate from actual native gameplay and replay evidence. A legacy
render reference does not establish that native gameplay ran.

`reference.mjs --native-document <prepared-game.json> --out <directory>` replays
the legacy engine solely to prepare reference data. It saves legacy frames and
resolved particles, typed native renderer-probe frames, and shared-probe
digests. Each controlled probe uses the actual reference camera quaternion,
including recoil and roll, rather than assuming equal ticks produce equal
cameras. `--damage` prepares the independently observed damage frame.
`--capture-reference` also captures reference PNGs. Use
`--render-reference-only --view <name>` to render one already prepared view
without replaying the reference session. GPU captures run sequentially.
`--reuse-reference <saved-directory>` rebuilds controlled frames from saved
legacy frames and particle samples without running either engine. Baked frame
entities have no parent IDs. The authored native document retains its hierarchy.

`browser-capture.mjs` captures that exact controlled frame through the production
native browser renderer. It starts a fresh WASM worker solely for `prepareModel`,
preloads the closed verified asset broker, and never opens or steps a session.
The helper bundles into the output cache, rejects legacy runtime dependencies,
serves only declared local files, and owns a fresh headless browser context.
The report records raw frame and shared-probe digests, runtime and bundle hashes,
model preparation provenance, diagnostics and software-rendering limitations.
Use `--prepare-only` to validate bundling and declared files without starting GPU
work. The runtime directory must contain the current native WASM artifacts.

```bash
node native/game/tests/fixtures/blacksite/browser-capture.mjs --document "$TMPDIR/blacksite-native-parity/game.json" --frame "$TMPDIR/controlled/start-native-frame.json" --shared-probe "$TMPDIR/controlled/start-shared-probe.json" --runtime "$TMPDIR/native-wasm" --out "$TMPDIR/captures/start-browser"
```

`gameplay-frames.mjs` collects actual C++ gameplay frames separately. It drives
the original route through the public native worker client, checks every native
completion assertion, and verifies an authenticated same-session continuation.
Its frame provenance identifies the worker binary and original route hashes.
It rejects host save requests rather than silently dropping them. Render these
native frames separately from the legacy-pinned controlled comparisons.

```bash
node --import tsx --conditions=nodetool-dev native/game/tests/fixtures/blacksite/gameplay-frames.mjs --document "$TMPDIR/blacksite-native-parity/game.json" --worker "$TMPDIR/release-worker/game-worker" --out "$TMPDIR/native-gameplay"
```

`pixel-metrics.py` measures encoded-RGB error for whole frames and the named
regions in `comparison.json`. It rejects mismatched dimensions and performs no
rescaling or automatic parity decision. Supply the shared renderer-probe file
and verify that both capture reports identify its digest before interpreting
errors. Review the images as well as the measurements.

```bash
python3 native/game/tests/fixtures/blacksite/pixel-metrics.py --reference reference.png --candidate native.png --shared-probe controlled-frame.json --out comparison-report.json
python3 native/game/tests/fixtures/blacksite/pixel-metrics.test.py
```

Spawned effect IDs follow native admission rules, so their cosmetic particle
seed addresses differ from the legacy `prefab#sequence/root` IDs. Controlled
renderer probes must use identical resolved particle samples. Native Qt and
browser gameplay must agree with each other on shared particle IDs, seeds,
ticks and restored continuation. Do not loosen resource-ID rules to imitate
legacy effect IDs.

The visual-parity adapter must retain original rifle glass, extraction field,
material channels, lighting, effects, fonts, widget HUD, drone hover and visual
script commands. The earlier test copy omitted these features. It is not a
visual-parity fixture. Audio mixing remains separate from visual acceptance.

Write prepared assets, logs and screenshots beneath the caller's `TMPDIR`.
Keep installed artifacts closed and verify their digests before capture.
