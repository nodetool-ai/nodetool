# BSDF reference probes

These closed glTF planes isolate three production shader calculations:

- `ambient` uses unit ambient irradiance, a black environment and no direct light.
- `mixed-metal` uses colored half-metal material under the procedural environment.
- `smooth-specular` aligns a smooth metallic plane, camera and directional light.

The source equation witness in `numeric-red.json` records the old ambient result
against Three's separate ambient diffuse term. It is a CPU calculation, not a
captured image.

Run `nativeBsdfReference.mjs` with Node's `nodetool-dev` condition and `tsx`
loader under a valid Xvfb display. It admits each model through the actual native
WASM module and compares the browser importer to the actual `GLTFLoader` model
in the same Three scene. Set `NODETOOL_NATIVE_GAME_PLAYER` to compare a Qt player
capture against that reference. `NODETOOL_NATIVE_BSDF_BEFORE_PLAYER` additionally
runs the pre-correction player as a negative control. The center eight-by-eight
region must have mean RGB channel error at most `1/255`. An old-player control
must exceed that limit for each probe.

The source geometry is derived from the closed flat normal reference plane.
Materials have no external images or network dependencies. Generated captures,
per-player logs and numeric reports go under `TMPDIR`.
