# A97 transfer inventory (partial)

Inspected branch `film/color-s0`, starting at `3635b5c79f`.
The corrected A97, A98, D10 and S1 exit gate are present in this checkout.
This records declarations separately from verified sample processing.

## Declaration enumeration

Search: `rg -n 'colorSpace:' packages/gpu/src/shaders` and enumerate
`packages/gpu/src/shaders/**/module.ts`. The table includes every matching
module file, including versions and files defining more than one module.
All 74 files contain `rgba8unorm`. There are only `linear` and `srgb`
colour labels. These are declarations, not verified transfer functions.
No formats or module labels changed in this round.

| Module file relative to `packages/gpu/src/shaders` | Declared labels | Label occurrences |
|---|---|---:|
| `_canary/passthrough/v1/module.ts` | linear | 2 |
| `alpha/premulToStraight/v1/module.ts` | srgb | 2 |
| `alpha/straightToPremul/v1/module.ts` | srgb | 2 |
| `color/brightnessContrast/v1/module.ts` | linear | 3 |
| `color/cdl/v1/module.ts` | srgb | 3 |
| `color/channelMerge/v1/module.ts` | linear | 3 |
| `color/channelShuffle/v1/module.ts` | linear | 2 |
| `color/channelSplit/v1/module.ts` | linear | 2 |
| `color/colorBalance/v1/module.ts` | srgb | 3 |
| `color/cubeLut/v1/module.ts` | srgb | 4 |
| `color/curveTransfer/v1/module.ts` | srgb | 2 |
| `color/curves/v1/module.ts` | srgb | 3 |
| `color/exposure/v1/module.ts` | linear | 3 |
| `color/exposureLinear/v1/module.ts` | srgb | 2 |
| `color/exposureTone/v1/module.ts` | srgb | 3 |
| `color/filmLook/v1/module.ts` | srgb | 3 |
| `color/grade/v1/module.ts` | srgb | 2 |
| `color/grayscale/v1/module.ts` | linear | 3 |
| `color/hsb/v1/module.ts` | linear | 3 |
| `color/hslAdjust/v1/module.ts` | srgb | 3 |
| `color/invert/v1/module.ts` | linear | 3 |
| `color/levels/v1/module.ts` | linear | 3 |
| `color/liftGammaGain/v1/module.ts` | srgb | 3 |
| `color/posterize/v1/module.ts` | linear | 3 |
| `color/secondary/v1/module.ts` | srgb | 2 |
| `color/solarize/v1/module.ts` | linear | 3 |
| `color/splitToning/v1/module.ts` | srgb | 3 |
| `filters/blur/gaussian/v1/module.ts` | linear | 2 |
| `filters/blur/separable/v1/module.ts` | linear | 2 |
| `filters/convolve3x3/v1/module.ts` | linear | 3 |
| `filters/deband/v1/module.ts` | srgb | 2 |
| `filters/denoise/v1/module.ts` | srgb | 6 |
| `filters/glow/v1/module.ts` | linear | 2 |
| `filters/grain/v1/module.ts` | srgb | 2 |
| `filters/grain/v2/module.ts` | srgb | 2 |
| `filters/pixelate/v1/module.ts` | linear | 3 |
| `filters/sharpen/combine/v1/module.ts` | srgb | 3 |
| `filters/sharpen/gaussian/v1/module.ts` | srgb | 2 |
| `filters/sharpen/unsharpMask/v1/module.ts` | srgb | 2 |
| `filters/threshold/v1/module.ts` | linear | 2 |
| `filters/vignette/v1/module.ts` | srgb | 2 |
| `filters/vignette/v2/module.ts` | srgb | 2 |
| `filters/visualFx/v1/module.ts` | linear | 3 |
| `keyer/chromaKey/v1/module.ts` | srgb | 2 |
| `keyer/lumaKey/v1/module.ts` | linear | 2 |
| `mask/apply/v1/module.ts` | linear | 3 |
| `mask/fromImage/v1/module.ts` | linear | 2 |
| `mask/invert/v1/module.ts` | linear | 2 |
| `mixer/add/v1/module.ts` | linear | 3 |
| `mixer/colorOverlay/v1/module.ts` | linear | 2 |
| `mixer/dropShadow/v1/module.ts` | linear | 2 |
| `mixer/outline/v1/module.ts` | linear | 2 |
| `mixer/over/v1/module.ts` | linear | 3 |
| `mixer/shadowCompose/v1/module.ts` | linear | 3 |
| `sources/angularGradient/v1/module.ts` | linear | 1 |
| `sources/checkerboard/v1/module.ts` | linear | 1 |
| `sources/diamondGradient/v1/module.ts` | linear | 1 |
| `sources/gaussianNoise/v1/module.ts` | linear | 1 |
| `sources/linearGradient/v1/module.ts` | linear | 1 |
| `sources/radialGradient/v1/module.ts` | linear | 1 |
| `sources/solid/v1/module.ts` | linear | 1 |
| `transform/affine/v1/module.ts` | linear | 2 |
| `transform/cornerPin/v1/module.ts` | linear | 2 |
| `transform/crop/v1/module.ts` | linear | 2 |
| `transform/displace/v1/module.ts` | linear | 3 |
| `transform/mirror/v1/module.ts` | linear | 2 |
| `transform/offset/v1/module.ts` | linear | 2 |
| `transform/pad/v1/module.ts` | linear | 2 |
| `transform/polarRemap/v1/module.ts` | linear | 2 |
| `transform/resize/v1/module.ts` | linear | 2 |
| `transform/rotate90/v1/module.ts` | linear | 2 |
| `transform/spherize/v1/module.ts` | linear | 2 |
| `transform/stabilize/v1/module.ts` | srgb | 2 |
| `transform/tile/v1/module.ts` | linear | 2 |

## Traced boundaries

- F1: `timeline/src/render/frameCompositor.ts:uploadPixels` writes straight
  RGBA bytes to `rgba8unorm` without transfer conversion. The shared blend
  shader uses straight source RGB and premultiplied destination RGB and writes
  premultiplied output. `BLIT_FRAGMENT` returns `textureLoad` unchanged.
  The `linear` compositor constructor argument selects filtering, not transfer.
  The working-frame descriptor now says `encoded-sdr`, for both storage formats.
  It does not claim every video decoder produces sRGB.
- F2: `gpu/src/texture.ts:DEFAULT_META` and `context.ts` scratch keys/default
  textures say `linear`. `image-nodes/src/nodes/lib-shader-utils.ts` decodes,
  premultiplies byte RGB, and calls `createLabeledTexture` without overriding
  that default. This is a confirmed declaration mismatch for encoded inputs.
  Correcting the entire producer/consumer chain remains outstanding.
- F3: `color/exposureLinear/v1/module.ts` unpremultiplies, applies the sRGB
  piecewise decode (0.04045, 2.4), changes exposure in linear light, applies
  the sRGB encode (0.0031308), and premultiplies. Its `srgb` boundary labels
  describe its actual assumption. Its name does not mean linear input/output.
  `color/exposure/v1` instead multiplies the supplied samples. A81 measured
  that older operation. Keep the distinction in A101.
- F4: `web/.../preview/gpu/compositor.ts` uploads external images with
  `premultipliedAlpha: false` and no explicit colour-space override. Presentation
  configures premultiplied alpha with no explicit colour-space override.
  `web/.../render/TimelineRenderer.ts` passes the rendered canvas to mediabunny
  `CanvasSource` with codec, bitrate and alpha settings, without explicit
  transfer tags. Actual browser conversion and encoded metadata are unmeasured.
- F5: Server `video-nodes/.../timeline/rawFrames.ts:decodeImageRgba` uses
  `scale=...:flags=accurate_rnd+full_chroma_int,format=rgba`. Default encoding
  uses `scale=out_color_matrix=bt709:out_range=tv` and tags matrix, primaries
  and transfer BT.709. `encoderSpecFromArgs` forwards the tags as options to
  runtime media encoding. This filter declares a matrix/range conversion,
  not an sRGB-to-BT.709 transfer conversion.
- F6: Native `ExportEngine.cpp` assigns BT.709 matrix, primaries and transfer.
  For sRGB-origin pixels, the server and native delivery tags therefore need
  qualification against the sRGB assumption of exposure. This is a source-level
  inconsistency, not yet a measured exported colour bug in this round.

## Classification still required

The table's `linear` labels cannot be accepted as proof of linear light.
The `srgb` labels on mask and LUT slots cannot be accepted as colour semantics:
`cubeLut` declares source, lut and mask alike, while the latter two are lookup
and coverage inputs. Read each slot's WGSL and its callers before correcting
those labels or alpha conventions. Full per-slot semantic classification,
shared image recipes, video metadata probing, Color Match, browser video-copy
shader and alternate delivery formats remain unverified. No mismatch checks
were enabled. No current-output colour bug was reproduced or silently fixed.
