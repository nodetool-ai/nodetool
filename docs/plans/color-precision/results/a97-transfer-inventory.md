# A97 transfer inventory

Inspected branch `film/color-s0`, starting at `3635b5c79f`.
The corrected A97, A98, D10 and S1 exit gate are present in this checkout.
This records declarations separately from verified sample processing.

## Declaration enumeration

Search: `rg -n 'colorSpace:' packages/gpu/src/shaders` and enumerate
`packages/gpu/src/shaders/**/module.ts`. The table includes every matching
module file, including versions and files defining more than one module.
All 74 files contain `rgba8unorm`. There are only `linear` and `srgb`
colour labels. These are declarations, not verified transfer functions.
This original enumeration precedes the corrections below.

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

## Traced boundaries (original findings, corrections below)

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

## Slot classification

Each row is a module I/O slot. Paths are relative to `packages/gpu/src/shaders`.
The mismatch test reads this table independently of the declarations.
`encoded-sdr` means supplied encoded samples, not measured sRGB or BT.709.
`srgb` on sources describes CSS inputs and on exposure describes its explicit
piecewise transfer. `data` has no colour transfer. Alpha is the current runtime
association contract, preserved because executor alpha mismatches insert passes.
Mask alpha is coverage, not a transfer-encoded channel. All output formats remain
RGBA8. Gaussian blur also processes zero-RGB masks in the drop-shadow recipe.

| File | Module | Slot | Role | Transfer | Alpha | Math and interpretation |
|---|---|---|---|---|---|---|
| _canary/passthrough/v1/module.ts | _canary.passthrough@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| _canary/passthrough/v1/module.ts | _canary.passthrough@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| alpha/premulToStraight/v1/module.ts | alpha.premulToStraight@1 | source | colour | encoded-sdr | premultiplied | Transfer-preserving alpha multiply/divide, also usable with linear input |
| alpha/premulToStraight/v1/module.ts | alpha.premulToStraight@1 | output | colour | encoded-sdr | straight | Transfer-preserving alpha multiply/divide, also usable with linear input |
| alpha/straightToPremul/v1/module.ts | alpha.straightToPremul@1 | source | colour | encoded-sdr | straight | Transfer-preserving alpha multiply/divide, also usable with linear input |
| alpha/straightToPremul/v1/module.ts | alpha.straightToPremul@1 | output | colour | encoded-sdr | premultiplied | Transfer-preserving alpha multiply/divide, also usable with linear input |
| color/brightnessContrast/v1/module.ts | color.brightnessContrast@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/brightnessContrast/v1/module.ts | color.brightnessContrast@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/brightnessContrast/v1/module.ts | color.brightnessContrast@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/cdl/v1/module.ts | color.cdl@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/cdl/v1/module.ts | color.cdl@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/cdl/v1/module.ts | color.cdl@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelMerge/v1/module.ts | color.channelMerge@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelMerge/v1/module.ts | color.channelMerge@1 | alpha | data | data | premultiplied | Select raw RGBA or weighted RGB as coverage, no unpremultiply |
| color/channelMerge/v1/module.ts | color.channelMerge@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelShuffle/v1/module.ts | color.channelShuffle@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelShuffle/v1/module.ts | color.channelShuffle@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelSplit/v1/module.ts | color.channelSplit@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/channelSplit/v1/module.ts | color.channelSplit@1 | output | colour | encoded-sdr | premultiplied | Opaque grayscale selected channel (including alpha), encoded code values |
| color/colorBalance/v1/module.ts | color.colorBalance@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/colorBalance/v1/module.ts | color.colorBalance@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/colorBalance/v1/module.ts | color.colorBalance@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/cubeLut/v1/module.ts | color.cubeLut@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/cubeLut/v1/module.ts | color.cubeLut@1 | lut | data | data | premultiplied | RGB lookup values, alpha ignored (opaque producer) |
| color/cubeLut/v1/module.ts | color.cubeLut@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/cubeLut/v1/module.ts | color.cubeLut@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/curveTransfer/v1/module.ts | color.curveTransfer@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/curveTransfer/v1/module.ts | color.curveTransfer@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/curves/v1/module.ts | color.curves@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/curves/v1/module.ts | color.curves@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/curves/v1/module.ts | color.curves@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/exposure/v1/module.ts | color.exposure@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/exposure/v1/module.ts | color.exposure@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/exposure/v1/module.ts | color.exposure@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/exposureLinear/v1/module.ts | color.exposureLinear@1 | source | colour | srgb | premultiplied | Unpremultiply, sRGB decode, linear exposure, sRGB encode, premultiply |
| color/exposureLinear/v1/module.ts | color.exposureLinear@1 | output | colour | srgb | premultiplied | Unpremultiply, sRGB decode, linear exposure, sRGB encode, premultiply |
| color/exposureTone/v1/module.ts | color.exposureTone@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/exposureTone/v1/module.ts | color.exposureTone@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/exposureTone/v1/module.ts | color.exposureTone@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/filmLook/v1/module.ts | color.filmLook@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/filmLook/v1/module.ts | color.filmLook@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/filmLook/v1/module.ts | color.filmLook@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/grade/v1/module.ts | color.grade@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/grade/v1/module.ts | color.grade@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/grayscale/v1/module.ts | color.grayscale@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/grayscale/v1/module.ts | color.grayscale@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/grayscale/v1/module.ts | color.grayscale@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/hsb/v1/module.ts | color.hsb@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/hsb/v1/module.ts | color.hsb@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/hsb/v1/module.ts | color.hsb@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/hslAdjust/v1/module.ts | color.hslAdjust@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/hslAdjust/v1/module.ts | color.hslAdjust@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/hslAdjust/v1/module.ts | color.hslAdjust@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/invert/v1/module.ts | color.invert@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/invert/v1/module.ts | color.invert@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/invert/v1/module.ts | color.invert@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/levels/v1/module.ts | color.levels@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/levels/v1/module.ts | color.levels@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/levels/v1/module.ts | color.levels@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/liftGammaGain/v1/module.ts | color.liftGammaGain@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/liftGammaGain/v1/module.ts | color.liftGammaGain@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/liftGammaGain/v1/module.ts | color.liftGammaGain@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/posterize/v1/module.ts | color.posterize@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/posterize/v1/module.ts | color.posterize@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/posterize/v1/module.ts | color.posterize@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/secondary/v1/module.ts | color.secondary@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/secondary/v1/module.ts | color.secondary@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/solarize/v1/module.ts | color.solarize@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/solarize/v1/module.ts | color.solarize@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/solarize/v1/module.ts | color.solarize@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/splitToning/v1/module.ts | color.splitToning@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| color/splitToning/v1/module.ts | color.splitToning@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| color/splitToning/v1/module.ts | color.splitToning@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/blur/gaussian/v1/module.ts | filters.blur.gaussian@1 | source | colour/mask | encoded-sdr | premultiplied | Normalized RGBA sum, also carries dropShadow coverage unchanged in meaning |
| filters/blur/gaussian/v1/module.ts | filters.blur.gaussian@1 | output | colour/mask | encoded-sdr | premultiplied | Normalized RGBA sum, also carries dropShadow coverage unchanged in meaning |
| filters/blur/separable/v1/module.ts | filters.blur.gaussianSeparable@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/blur/separable/v1/module.ts | filters.blur.gaussianSeparable@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/convolve3x3/v1/module.ts | filters.convolve3x3@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/convolve3x3/v1/module.ts | filters.convolve3x3@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| filters/convolve3x3/v1/module.ts | filters.convolve3x3@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/deband/v1/module.ts | filters.deband@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/deband/v1/module.ts | filters.deband@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.spatial@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.spatial@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.temporal@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.temporal@1 | before | colour | encoded-sdr | straight | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.temporal@1 | after | colour | encoded-sdr | straight | Encoded sample math, no transfer conversion |
| filters/denoise/v1/module.ts | filters.denoise.temporal@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/glow/v1/module.ts | filters.glow@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/glow/v1/module.ts | filters.glow@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/grain/v1/module.ts | filters.grain@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/grain/v1/module.ts | filters.grain@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/grain/v2/module.ts | filters.grain@2 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/grain/v2/module.ts | filters.grain@2 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/pixelate/v1/module.ts | filters.pixelate@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/pixelate/v1/module.ts | filters.pixelate@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| filters/pixelate/v1/module.ts | filters.pixelate@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/combine/v1/module.ts | filters.sharpen.combine@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/combine/v1/module.ts | filters.sharpen.combine@1 | blurred | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/combine/v1/module.ts | filters.sharpen.combine@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/gaussian/v1/module.ts | filters.sharpen.gaussian@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/gaussian/v1/module.ts | filters.sharpen.gaussian@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/unsharpMask/v1/module.ts | filters.sharpen.unsharpMask@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/sharpen/unsharpMask/v1/module.ts | filters.sharpen.unsharpMask@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/threshold/v1/module.ts | filters.threshold@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/threshold/v1/module.ts | filters.threshold@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/vignette/v1/module.ts | filters.vignette@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/vignette/v1/module.ts | filters.vignette@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/vignette/v2/module.ts | filters.vignette@2 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/vignette/v2/module.ts | filters.vignette@2 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/visualFx/v1/module.ts | filters.visualFx@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| filters/visualFx/v1/module.ts | filters.visualFx@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| filters/visualFx/v1/module.ts | filters.visualFx@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| keyer/chromaKey/v1/module.ts | keyer.chromaKey@1 | source | colour | encoded-sdr | straight | Straight RGB key distance and spill, output RGB multiplied by output alpha |
| keyer/chromaKey/v1/module.ts | keyer.chromaKey@1 | output | colour | encoded-sdr | premultiplied | Straight RGB key distance and spill, output RGB multiplied by output alpha |
| keyer/lumaKey/v1/module.ts | keyer.lumaKey@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| keyer/lumaKey/v1/module.ts | keyer.lumaKey@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mask/apply/v1/module.ts | mask.apply@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mask/apply/v1/module.ts | mask.apply@1 | mask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| mask/apply/v1/module.ts | mask.apply@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mask/fromImage/v1/module.ts | mask.fromImage@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mask/fromImage/v1/module.ts | mask.fromImage@1 | output | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| mask/invert/v1/module.ts | mask.invert@1 | source | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| mask/invert/v1/module.ts | mask.invert@1 | output | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| mixer/add/v1/module.ts | mixer.add@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/add/v1/module.ts | mixer.add@1 | over | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/add/v1/module.ts | mixer.add@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/colorOverlay/v1/module.ts | mixer.colorOverlay@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/colorOverlay/v1/module.ts | mixer.colorOverlay@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/dropShadow/v1/module.ts | mixer.dropShadow@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/dropShadow/v1/module.ts | mixer.dropShadow@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/outline/v1/module.ts | mixer.outline@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/outline/v1/module.ts | mixer.outline@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/over/v1/module.ts | mixer.over@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/over/v1/module.ts | mixer.over@1 | over | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/over/v1/module.ts | mixer.over@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/shadowCompose/v1/module.ts | mixer.shadowCompose@1 | source | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| mixer/shadowCompose/v1/module.ts | mixer.shadowCompose@1 | shadowMask | mask | data | premultiplied | Alpha coverage only, RGB ignored or zero |
| mixer/shadowCompose/v1/module.ts | mixer.shadowCompose@1 | output | colour | encoded-sdr | premultiplied | Encoded sample math, no transfer conversion |
| sources/angularGradient/v1/module.ts | sources.angularGradient@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| sources/checkerboard/v1/module.ts | sources.checkerboard@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| sources/diamondGradient/v1/module.ts | sources.diamondGradient@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| sources/gaussianNoise/v1/module.ts | sources.gaussianNoise@1 | output | colour | encoded-sdr | premultiplied | Generated normalized code values, opaque alpha |
| sources/linearGradient/v1/module.ts | sources.linearGradient@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| sources/radialGradient/v1/module.ts | sources.radialGradient@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| sources/solid/v1/module.ts | sources.solid@1 | output | colour | srgb | premultiplied | CSS colour bytes premultiplied by image-node caller, then mix/copy |
| transform/affine/v1/module.ts | transform.affine@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/affine/v1/module.ts | transform.affine@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/cornerPin/v1/module.ts | transform.cornerPin@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/cornerPin/v1/module.ts | transform.cornerPin@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/crop/v1/module.ts | transform.crop@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/crop/v1/module.ts | transform.crop@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/displace/v1/module.ts | transform.displace@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/displace/v1/module.ts | transform.displace@1 | displacement | data | data | premultiplied | Unpremultiply RG, map 0.5 to zero displacement |
| transform/displace/v1/module.ts | transform.displace@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/mirror/v1/module.ts | transform.mirror@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/mirror/v1/module.ts | transform.mirror@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/offset/v1/module.ts | transform.offset@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/offset/v1/module.ts | transform.offset@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/pad/v1/module.ts | transform.pad@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/pad/v1/module.ts | transform.pad@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/polarRemap/v1/module.ts | transform.polarRemap@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/polarRemap/v1/module.ts | transform.polarRemap@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/resize/v1/module.ts | transform.resize@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/resize/v1/module.ts | transform.resize@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/rotate90/v1/module.ts | transform.rotate90@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/rotate90/v1/module.ts | transform.rotate90@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/spherize/v1/module.ts | transform.spherize@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/spherize/v1/module.ts | transform.spherize@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/stabilize/v1/module.ts | transform.stabilize@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/stabilize/v1/module.ts | transform.stabilize@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/tile/v1/module.ts | transform.tile@1 | source | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |
| transform/tile/v1/module.ts | transform.tile@1 | output | colour | encoded-sdr | premultiplied | Resample encoded RGBA, preserve association |

## Recipe intermediates and caller evidence

These are fixed RGBA8 resources. No working-format inheritance was introduced.

| Recipe | Intermediate slots | Role | Transfer | Alpha |
|---|---|---|---|---|
| filters.blur.gaussianSeparable | blurH | colour (or supplied mask) | source interpretation | premultiplied |
| filters.glow | bright, blurH, blurV | colour | encoded-sdr | premultiplied |
| mixer.dropShadow | mask, blurH, blurV | mask | data | alpha coverage, RGB zero |
| filters.sharpen.gaussian | horizontal, blurred | colour | encoded-sdr | premultiplied |

The recipe pass maps are in each module file. `recipe.ts` labels scratch from
the producing pass and carries the source interpretation through Gaussian blur.
The existing catalog declares intermediates in producer order. The scratch key
receives that metadata at allocation, before pool reuse. No pooled label is
mutated after allocation. The new test alternates shadow, glow, shadow on one
pool and checks both Gaussian pass boundaries.

The shared image caller is `image-nodes/src/nodes/lib-shader-utils.ts`:
`decodeRgba` supplies encoded bytes, `premultiplyInPlace` multiplies byte RGB,
and `readbackStraightAlpha` divides byte RGB. Neither applies a transfer curve.
`lib-image-generators.ts` and `lib-image-draw.ts` parse CSS bytes and premultiply
colour parameters before source shaders. `lib-image-warp.ts` does the same for
padding colour. Filters, grading, keyer, mask, channel and mixer node factories
call the same upload/execute/readback helpers. Extra image slots are numeric
only when their contract says data. Borrowed GPU inputs retain their original
producer metadata. A colour image used as coverage is not globally relabelled.

`timeline/src/render/effects.ts` wraps decoded inputs, temporal neighbours and
ping-pong targets as encoded SDR. Its LUT producer writes RGB table entries to
RGBA16F with alpha one. That existing fixed LUT format is unchanged. LUT values
are data, not an image transfer declaration. Curve/secondary tables and shader
uniforms are numeric parameters, not additional texture slots.

`frameCompositor.ts` uploads straight bytes, composites in the encoded domain
and resolves alpha on readback. Browser upload/presentation and server/native
export observations remain as recorded above. Decoder profile qualification remains open. The [A101 owner decision](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
keeps pass-through delivery and accepts today's inaccurate BT.709 transfer tag (O1).

## Readers and behaviour

Repository source search: `git grep -n colorSpace -- packages web/src`, excluding
compiled marketing bundles, tests and the unrelated Three.js material system.
The shader-pool runtime readers before this change are:

- F7: `gpu/src/context.ts:bucketKey` reads the tag for scratch compatibility.
  Changing the tag changes pool partitioning, not formats, usage or shader math.
- F8: `gpu/src/executor.ts:convertAlphaIfNeeded` copies colour metadata into
  scratch. It does not branch on it. `validateInputs` does not check colour.
- F9: `gpu/src/texture.ts:createLabeledTexture` merges supplied metadata with
  defaults. It never passes the colour label to WebGPU texture creation.

New readers in `recipe.ts` choose only scratch colour metadata. New image-node
readers choose only upload/output colour metadata. `types.ts` is a type-only
union extension, not a serialized schema change. Tests read declarations to
validate the inventory. Runtime media codec colour fields and Three.js texture
colour management are separate types, not consumers of these pool tags.
No pool colour reader selects conversions, formats, samplers or WGSL. All 73
changed module files compare byte-for-byte with the starting revision after
normalizing only `colorSpace` string literals. The remaining exposureLinear
file is unchanged. All alpha declarations, uniforms and WGSL are unchanged.

Alpha metadata is behaviour-sensitive: executor mismatches select multiplication
or division passes. Chroma key requires straight input. Temporal denoise requires
straight before/after and premultiplied current input. Alpha conversion modules
have opposite input/output associations. Those declarations already match their
math and remain unchanged. The generic image helper's output allocation and
readback assume premultiplied alpha, so calling it with the internal
`alpha.premulToStraight` module would mislabel straight output and divide again.
No published image factory calls that module. Correcting that generic alpha
path could change bytes and is left for a separate fix. No colour correction
was withheld because of a conversion reader.

Runtime mismatch enforcement remains disabled. A Gaussian mask pass and borrowed
colour images used as coverage are valid even when literal tags differ, and an
exception would remove existing output. The static inventory check catches
wrong labels and new unclassified files/modules/slots without changing rendering.

## Totals and verification

The complete I/O table has 173 slots in 74 files (75 module declarations):
143 colour, 25 mask, 3 data and 2 dual colour/mask slots. It records 137
encoded-sdr, 28 data and 8 sRGB declarations. 171 colourSpace literals changed.
No colour slot declares linear light. The nine recipe intermediates above are
additional allocation slots, not extra module I/O declarations.

The mismatch test passed, failed with exit 1 after changing only
`color.exposure@1` source from encoded-sdr to linear, then passed after restoring
it. The failure identifies the changed slot. No mutation remains.
