# @nodetool-ai/image-nodes

Image-processing nodes for [NodeTool](https://nodetool.ai).

A pack of image nodes for NodeTool workflows: resize, crop, and composite images;
color-grade and filter with a Sharp-based and WebGPU-shader pipeline; draw
gradients and text; warp, mask, and key; and run AI image generation, upscaling,
and background removal.

## Install

```bash
npm install @nodetool-ai/image-nodes
```

## Nodes

### I/O

- `nodetool.image.LoadImageFile`, `nodetool.image.LoadImageFolder`, `nodetool.image.LoadImageAssets`
- `nodetool.image.SaveImage`, `nodetool.image.SaveImageFile`, `nodetool.image.GetMetadata`

### Transform and composite

- `nodetool.image.Resize`, `nodetool.image.ResizeImage`, `nodetool.image.Scale`, `nodetool.image.Fit`, `nodetool.image.CanvasResize`
- `nodetool.image.Crop`, `nodetool.image.RotateAndFlip`, `nodetool.image.Paste`, `nodetool.image.Compositor`
- `nodetool.image.BatchToList`, `nodetool.image.ImagesToList`

### AI

- `nodetool.image.TextToImage`, `nodetool.image.ImageToImage`, `nodetool.image.Upscale`
- `nodetool.image.RemoveBackground`, `nodetool.image.Relight`, `nodetool.image.Vectorize`

### Paint and sketch

- `nodetool.image.Painter`
- `nodetool.sketch.CreateSketch`, `nodetool.sketch.RenderSketch`, `nodetool.sketch.SketchLayers`

### Color and grading

Basic color plus a full grading suite.

- Color: `lib.image.color.BrightnessContrast`, `lib.image.color.HSB`, `lib.image.color.Exposure`, `lib.image.color.Invert`, `lib.image.color.Posterize`, `lib.image.color.ChannelSplit`, `lib.image.color.Grade`
- Grading: `lib.image.color_grading.Curves`, `lib.image.color_grading.LiftGammaGain`, `lib.image.color_grading.ColorBalance`, `lib.image.color_grading.CDL`, `lib.image.color_grading.FilmLook`, `lib.image.color_grading.HSLAdjust`, `lib.image.color_grading.SaturationVibrance`, `lib.image.color_grading.SplitToning`, `lib.image.color_grading.Vignette`
- Also: `nodetool.image.Levels`, `nodetool.image.Channels`

### Filters

`lib.image.filter.GaussianBlur`, `lib.image.filter.Canny`, `lib.image.filter.FindEdges`,
`lib.image.filter.Emboss`, `lib.image.filter.Contour`, `lib.image.filter.Pixelate`,
`lib.image.filter.Solarize`, `lib.image.filter.Threshold`, `lib.image.filter.UnsharpMask`,
`lib.image.filter.Smooth`, `lib.image.filter.ConvertToGrayscale`, `nodetool.image.Blur`.

### Enhance

`lib.image.enhance.AutoContrast`, `lib.image.enhance.AdaptiveContrast`,
`lib.image.enhance.EdgeEnhance`, `lib.image.enhance.Detail`,
`lib.image.enhance.Equalize`, `lib.image.enhance.RankFilter`.

### Effects

`lib.image.effects.Glow`, `lib.image.effects.DropShadow`, `lib.image.effects.Outline`,
`lib.image.effects.ColorOverlay`, `lib.image.effects.Add`.

### Draw and generators

`lib.image.draw.LinearGradient`, `lib.image.draw.RadialGradient`,
`lib.image.draw.AngularGradient`, `lib.image.draw.DiamondGradient`,
`lib.image.draw.Checkerboard`, `lib.image.draw.GaussianNoise`,
`lib.image.draw.Background`, `lib.image.draw.RenderText`.

### Warp

`lib.image.warp.Affine`, `lib.image.warp.CornerPin`, `lib.image.warp.Displace`,
`lib.image.warp.Offset`, `lib.image.warp.Pad`, `lib.image.warp.PolarRemap`,
`lib.image.warp.Spherize`, `lib.image.warp.Tile`.

### Mask, channel, and keyer

- Mask: `lib.image.mask.FromImage`, `lib.image.mask.Apply`, `lib.image.mask.Invert`, `lib.image.Mask`
- Channel: `lib.image.channel.Merge`, `lib.image.channel.Shuffle`
- Keyer: `lib.image.keyer.ChromaKey`, `lib.image.keyer.LumaKey`

### Grid

`lib.grid.SliceImageGrid`, `lib.grid.CombineImageGrid`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
