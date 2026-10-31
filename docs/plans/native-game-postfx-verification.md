# Native post-processing verification

The bounded authored environment path uses the same AgX, bloom, vignette and
SMAA order as `GamePostProcessor3D`. The browser helper uses verified, decoded
SMAA lookup bytes instead of loading DOM image data URLs. The Qt implementation
adapts the pinned Three shader equations to QRhi render targets. Lookup resources,
shader provenance and distribution notices are recorded in
[SMAA resources](../../native/game/assets/SMAA.md).

The [measurement artifact](native-game-postfx-verification.json) records exact
input, bundle, source and capture digests, browser renderer identity and pixel
comparisons. It covers AgX, bloom, vignette, the combined stack and an authored
bloom softness change on the same asymmetric HDR input. Browser outputs matched
the actual legacy implementation exactly in these fixtures. Qt outputs passed a
mean RGB channel delta of at most one and a fraction of channels differing by
more than 16 of at most two percent, measured in eight-bit channel values.
These are software-renderer correctness results, not hardware performance claims.

`native/game/tests/PostFXTest.cpp` writes the exact half-float input and native
PNG captures. Run its QtTest target with a valid Xvfb display on Linux and
`QT_QPA_PLATFORM=xcb QT_XCB_GL_INTEGRATION=xcb_egl LIBGL_ALWAYS_SOFTWARE=1`.
Set `NODETOOL_POSTFX_REPORT_DIR` to a temporary report directory. Then run:

```bash
xvfb-run -a npm run test --workspace=packages/game-renderer -- tests/native-post3d.test.ts
```

With the same `NODETOOL_POSTFX_REPORT_DIR`, this compares both the helper and
native captures against the actual legacy renderer. Without that variable, the
test still exercises the browser helper against the legacy renderer using an
in-memory fixture. Fixture discovery requires five cases. The native test also
rejects oversized targets and unsupported tone mapping. The browser test checks
the target budget.

The check was tested with a deliberate twofold exposure error. It failed the
AgX pixel assertion with maximum channel delta 59 against the limit of one.
The original source was restored, and the unchanged comparison passed again.

Regenerate the closed resources and shader interface with
`node packages/game-renderer/scripts/generate-native-postfx.mjs`. Its `--check`
mode compares two lookup resources and six native SMAA shader stages and rejects
drift. Qt embeds the same lookup files in its resource collection. Browser
exports carry them inside the hashed player bundle, with no external request.
