# Native BSDF correction

The native PBR fragment shader now follows the installed Three 0.185.1 lighting
equations for three previously different calculations:

- Ambient irradiance contributes `diffuseContribution / PI` separately from IBL.
- Indirect specular computes dielectric and metallic multiscattering separately,
  mixes their results by metalness, and uses componentwise dielectric energy
  conservation for indirect diffuse.
- The GGX distribution uses the reference denominator without an extra clamp.
  The existing minimum roughness prevents its zero-roughness singularity.

The [retained measurements](native-game-bsdf-verification.json) record fixture,
source, player and capture digests. Three closed glTF planes isolate ambient-only
lighting, colored mixed-metal environment lighting and a smooth direct specular
highlight. The browser importer is compared with actual `GLTFLoader` models and
`MeshStandardMaterial` in the same scene. All three browser comparisons were
pixel-exact.

Qt captures use the same camera, geometry, material, resolution and environment.
Their center eight-by-eight mean RGB errors are `0`, `0.00130719` and
`0.00024510`, below the declared normalized-channel limit of `1/255`. Every fixed
capture has maximum channel error at most one eight-bit value. The preserved
pre-correction player produces center errors of `0.0366013`, `0.0356209` and
`0.109069`, so each old-shader control fails the same limit.

The first mixed-metal fixture omitted the sky's sun reference. That exposed
different native and browser default directions and did not provide aligned
environment input. Its failed captures remain in the temporary evidence folder
`native-bsdf-reference-bZuxlN`. The retained fixture specifies a linked +Y sun
with zero direct-light intensity. Shader equations and acceptance thresholds
were unchanged for the corrected comparison.

Run the [reference fixture script](../../packages/game-renderer/tests/fixtures/nativeBsdfReference.mjs)
under a valid Xvfb display with Node's `nodetool-dev` condition and `tsx` loader.
Set `NODETOOL_NATIVE_GAME_PLAYER` to the fixed Qt player and optionally
`NODETOOL_NATIVE_BSDF_BEFORE_PLAYER` to the pre-correction binary. Each Qt capture
uses a fresh process. `TMPDIR` receives the PNGs, logs and numeric reports.
The final run's folder is `native-bsdf-reference-GkaWB7`.

These software-renderer results establish the isolated BSDF corrections. They
do not establish whole-game visual parity or hardware performance.
