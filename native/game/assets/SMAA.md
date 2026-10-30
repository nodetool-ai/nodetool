# SMAA lookup resources

The PNG files and adapted shaders come from the pinned Three implementation:
[`SMAAPass.js`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/postprocessing/SMAAPass.js)
and [`SMAAShader.js`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/shaders/SMAAShader.js).
The algorithm is [SMAA 2.8](https://github.com/iryoku/smaa/tree/v2.8), preset
SMAA 1x Medium with color edge detection. Keep the
[Three MIT notice](../licenses/three-LICENSE) and
[SMAA notice](../licenses/SMAA-LICENSE) with distributions.

`packages/game-renderer/scripts/generate-native-postfx.mjs` extracts the pinned
PNG bytes, records PNG and decoded RGBA hashes, embeds the same bytes into the
browser builtin module, and adapts the shader interface for QRhi. `--check`
rejects source or resource drift. The shader equations and search limits remain
the upstream implementation. QRhi render-target sampling alone changes orientation.

AgX, sRGB transfer, the five-level UnrealBloom chain, and its Gaussian coefficients
also follow the pinned Three shader sources. Bloom `softness` controls the
high-pass transition width, matching the legacy controller's configure step.
