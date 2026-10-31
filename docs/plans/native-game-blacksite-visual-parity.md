# BLACKSITE native visual parity

## Scope

Reproduce the visible features used by the shipped BLACKSITE example in the
native C++ Qt player and its shared-core browser player. Preserve the original
legacy document and assets. The native test copy must retain its first-person
camera, combat and extraction behavior. Features outside BLACKSITE's authored
settings remain rejected until implemented. Reuse the TypeScript engine's
vocabulary without admitting settings that renderers ignore.

The existing native presentation remains compatible when a document has no
authored 3D environment. Native 2D behavior and rendering remain covered by
their existing tests.

## Implementation

- A1: Extend prepared glTF materials and the native 3D pipeline for linear PBR,
  metallic/roughness, normal maps, emissive channels, texture sampling and
  transparent materials. Restore the original rifle optic and extraction field.
  Preserve bounded imports and all facility geometry. Split geometry losslessly
  for the portable model limits and store unchanged shared textures as closed
  manifest dependencies. Model preparation returns verified image byte ranges,
  rather than expanding image bytes into JSON arrays across the portable ABI.
- A2: Render BLACKSITE's authored directional and point lights, ambient color,
  directional shadow cascades and local shadows, height fog, procedural sky
  and environment lighting. Resolve scene settings through shared native frames.
- A3: Add HDR presentation and the authored post-processing sequence: bloom,
  AgX exposure and output conversion, vignette and SMAA. Package shader and
  lookup resources with closed, verified runtime artifacts.
- A4: Restore the original widget HUD and fonts, projected decals, deterministic
  particles, model animation and camera-relative weapon presentation. Preserve
  script-driven visibility, text, bars, hit feedback and completion banners.
- A5: Retain a reproducible adapter, asset provenance, input routes and
  assertions under `native/game/tests/fixtures/blacksite/`. Compare matched
  start, combat and extraction frames against the legacy reference and between
  native Qt and browser renderers.

## Ownership

Qt 3D rendering and shader integration belong to the frontend owner. Prepared
assets and material contracts belong to the asset owner. Authored schemas,
document validation and shared presentation frames belong to the contract owner.
HUD and particle helpers belong to the presentation owner, with decal geometry
delegated separately when useful. The browser owner maintains matching native
browser presentation. The gameplay owner maintains the BLACKSITE fixture and
paired capture route. Owners agree interfaces before editing shared files.

## Acceptance

Feature fixtures must prove that each material, light, effect and overlay
changes actual pixels, with invalid settings rejected at admission. Preserve
the existing native rendering fixtures. Match camera pose, resolution, seed,
committed tick and asset digests for comparisons. Inspect corridor, rifle, drone,
HUD and extraction regions as well as whole-frame differences. Record measured
error and explain residual differences rather than selecting permissive
thresholds to declare parity.

Replay combat and extraction after presentation changes. Snapshot restoration
remains authenticated to the originating live session. Software graphics tests
establish correctness, not hardware frame-rate results. Measure subsystem and
asset costs without substituting host round-trip timings for GPU frame times.

After source freeze, rebuild packages and runtime artifacts, then run affected
tests, typecheck, lint and the full harness gate. Run native rendering, browser,
installed standalone and backend bundle checks against the final artifacts.
Record watchdog failures and baseline comparisons without weakening production
limits. Do not commit, publish or deploy without authorization.

## Component evidence and remaining work

The retained fixture preparer preserves every facility triangle and expanded
attribute value. Its five geometry chunks use unchanged external PNG assets
through closed manifest dependencies. The complete original rifle, including
translucent glass, is retained. Fixture checks reject altered geometry,
materials, images, missing dependencies and ID collisions.

The portable particle helper matched the TypeScript emitter reference across
33 emitter definitions and 24 ticks, within floating-point precision. HUD
raster tests cover the original layout, fonts, ammunition, damage, hit feedback
and completion banner. Qt and Skia font rasterization still have measured
differences. Decal helpers reproduce the reference's bounded diagnostic drops
for all 12 BLACKSITE projectors, with visible rendering tested on smaller
controlled geometry.

Native decals additionally cap the complete eligible receiver geometry at
200,000 triangles before broadphase clipping. This explicit restriction makes
the decision stable when equivalent geometry is split into smaller models.
It is stricter than the legacy renderer's scan-work accounting. Oversized
receivers produce a bounded per-decal diagnostic, not a fatal scene error.
Tests must cover equivalent partitions and a large receiver with a small
projector, alongside the visible supported case.

Post-processing comparisons and a deliberate wrong-exposure failure are saved
in [the PostFX evidence](native-game-postfx-verification.md). The complete native
visual mission passed the original 583-input route and authenticated same-session
replay in a Release worker under the unchanged 120-second harness deadline.
The equivalent Debug run exceeded that deadline. Profiling identified duplicate
particle-frame construction as removable work. No script or harness limit was
increased. Simulation timings do not establish hardware frame rates.

Renderer integration and seven controlled scene comparisons are complete.
Browser mean image error ranges from approximately `1e-8` to `8e-7` on normalized
RGB. Qt retains measured differences, with whole-image mean error approximately
`0.0063` to `0.0123`. These are observations, not a claim of pixel identity or
an acceptance threshold selected after measurement. Controlled reference frames
pin camera, entity pose, animation and particle samples. They test presentation
independently from actual native gameplay. Separate Qt Release Session captures
at ticks 0, 120 and 583 passed restore verification and matched the independently
verified native worker cameras.

The reload-state GPU-mesh collision was reproduced under gdb and fixed with
separate reusable draw-run slots. Same-process moved/reordered geometry and
resource-stability regressions pass on OpenGL and Vulkan. Three BSDF equation
corrections are covered by [old-versus-fixed reference checks](native-game-bsdf-verification.md).
Late particle parity extends through the longest authored lifetime, with all
33 emitters covered over 601 ticks.

Final aggregate and installed-artifact verification remains outstanding. Linux
OpenGL and Vulkan are exercised. Shader cross-compilation does not establish
macOS Metal or Windows Direct3D runtime verification. Measured native CPU tick
cost still exceeds the performance guidance, and no hardware FPS claim is made.
