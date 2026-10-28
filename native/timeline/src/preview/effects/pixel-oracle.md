# Blend pixel oracle

The reported failures come from test documents and expectations. The blend
implementation agrees with the export formulas for the reported pixels.
The shader and golden fixtures remain unchanged.

- F1: Placement 1 originally ordered clips as `g,a,b` on one track. Both `g`
  and its child `b` are active. The group needs no width or height. The export
  draws the surface at the group's own stack position, then the full-frame
  opaque `a` hides it. This explains `(128,192,64)` for every mode and opacity.
  The test now orders `a,g,b`, which exercises the intended group blend.
- F2: Placements 2 and 3 originally had normal groups with opacity `0.8`.
  [groupNeedsPrecomposite](../../../../../packages/timeline/src/render/sceneModel.ts)
  does not create a surface for opacity alone. It folds opacity into each
  child. Their original surface expectations therefore described different
  documents. An enabled identity color effect now forces a surface. New
  placements 4 and 5 preserve the original documents with corrected values.
- F3: The test's last-registered `PaintSource` supplies solid-color pixels and
  overrides the shape source. Package I's rasterizer is not involved.

The non-render `documents` test checks active children, source dimensions,
surface membership, group stack position and child/surface opacity. Before the
document correction it failed on placement 1's ordering and the missing
surfaces in placements 2 and 3. It also failed on the newly added placement 5
until its half-opacity backdrop was implemented. All six document rows pass
after correction. An independent headless call to the web scene model confirmed
the old and corrected ordering, surface counts and opacities for placements
1 through 3.

## Math

Use normalized `Cs=(192,64,128)/255` and `Cd=(128,192,64)/255`, with `B` from
[blend/wgsl.ts](../../../../../packages/gpu/src/blend/wgsl.ts).
[fs_blend](../../../../../packages/gpu/src/compositor/shaders.ts) accumulates
premultiplied color:

```text
P = as*(1-ad)*Cs + as*ad*B(Cs,Cd) + (1-as)*ad*Cd
A = as + ad*(1-as)
```

[frameCompositor.ts](../../../../../packages/timeline/src/render/frameCompositor.ts)
seeds a group with transparent black. It resolves the group's result to straight
color `P/A`, then applies group opacity once when blending the surface. With a
normal surface of opacity `0.8` over the default opaque black canvas, its final
RGB is `0.8*P` and its final alpha is one. For placement 3, `as=ad=0.5`, so
`P=0.25*(Cs+B(Cs,Cd)+Cd)` and `A=0.75`. Multiplying `P` by `0.75` again would
apply alpha twice.

An opacity-only group creates no intermediate. The backdrop first blends over
opaque black, giving `D=ad*Cd` with alpha one. The top then gives
`P=as*B(Cs,D)+(1-as)*D`. For original placement 2, `(ad,as)` is `(0.8,0.8)`
or `(0.8,0.4)`. For original placement 3 it is `(0.4,0.4)`.

`add` follows the export's separate Canvas lighter branch:
`P=min(1,as*Cs+ad*Cd)` and `A=min(1,as+ad)`. A normal group surface then
scales this premultiplied result by its own opacity.

## Original opacity-only documents

These independently calculated RGB values use the export math above, rounded
to the nearest byte. Every reported failing actual pixel for original
placements 2 and 3 is within one byte per channel of these values. The test
keeps its existing tolerance of two for RGBA8 intermediate rounding.
An arithmetic check also compared all 120 updated test expectations with the
unrounded export formulas. Their maximum difference was one byte per channel.

| Mode | Original 2, opacity 1 (new 4) | Original 2, opacity 0.5 (new 4) | Original 3, opacity 0.5 (new 5) |
|---|---|---|---|
| multiply | 82,62,31 | 92,108,41 | 46,54,21 |
| screen | 194,174,133 | 148,164,92 | 113,95,72 |
| overlay | 144,113,51 | 123,133,51 | 62,62,26 |
| darken | 102,82,51 | 102,118,51 | 51,72,26 |
| lighten | 174,154,113 | 138,154,82 | 108,77,67 |
| color-dodge | 224,195,92 | 163,174,72 | 114,87,36 |
| color-burn | 62,31,10 | 82,92,31 | 31,46,15 |
| hard-light | 164,92,52 | 133,123,52 | 92,62,26 |
| soft-light | 126,129,51 | 114,141,51 | 64,66,26 |
| difference | 92,102,72 | 97,128,61 | 87,51,56 |
| exclusion | 133,143,112 | 118,148,82 | 97,87,67 |
| add | 255,205,154 | 179,179,102 | 128,102,77 |

Placement 0's expectations are unchanged. Placement 1 retains those same
expectations after correcting stack order. Placements 2 and 3 retain their
surface expectations after making the documents actually create surfaces.
The new folded columns in `tst_effectsblend.cpp` use the values above.

## Changes and local verification

This run changes [tst_effectsblend.cpp](tst_effectsblend.cpp), adds its non-render
document test to [module.cmake](module.cmake), links this explanation from
[README.md](README.md), and adds this report. No production implementation or
golden fixture content changed. The pixel test now registers 120 rows across
all twelve modes and six placements.

The first document-test run exited 8 with four failing rows. Its relevant
failures were:

```text
documents(1): '*group.stackOrder > *a.stackOrder' returned FALSE
documents(2): frame.precomposites.size() actual 0, expected 1
documents(3): frame.precomposites.size() actual 0, expected 1
documents(5): a.opacity actual 0.8, expected 0.4
```

After the corrections, the full native build passed. Registration, all six
document rows and the five golden-script unit tests passed. The independent
web-scene check and arithmetic check also passed. Markdown links, whitespace
and control-byte checks passed.

The complete non-render ctest run finished with 87 of 90 tests passing.
`transitions_plan` initially rejected the binary as older than the edited test
source. Relinking the app and rerunning that test passed, together with all
three focused effects checks. The remaining failures are `tst_ffmpegsource`
and `tst_sourcepool`, whose hardware cases report VAAPI initialization errors.
The same hardware-test limitation was reported in the previous step summary.
Edit conformance passed with 676 tests, three documented skips with replacement
coverage, zero problems and 13,806 native calls.

Verification used Node from `.nvmrc`. The broader tests ran outside the sandbox
after restricted runs encountered process/socket permission errors. Qt stayed
offscreen. Commands, from the repository root:

```sh
TMPDIR=$PWD/native/timeline/build/tmp nice -n 10 \
  cmake --build native/timeline/build -j 3
QT_QPA_PLATFORM=offscreen ctest --test-dir native/timeline/build \
  -LE render -j 2 --output-on-failure
QT_QPA_PLATFORM=offscreen ctest --test-dir native/timeline/build \
  -R '^(transitions_plan|tst_effectsblend_registry|tst_effectsblend_documents|effects_golden_script)$' \
  --output-on-failure
```

Edit conformance, from `native/timeline/`:

```sh
node scripts/op-conformance.mjs --bin build/timeline-ops
```

Pixel rendering remains for the GPU driver. From `native/timeline/`:

```sh
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan \
  ctest --test-dir build -R '^tst_effectsblend_render$' --output-on-failure
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan \
  node src/preview/effects/check-effects.mjs \
  --bin build/nodetool-timeline --min-psnr 40
```
