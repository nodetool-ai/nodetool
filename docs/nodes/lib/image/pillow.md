# nodetool.nodes.lib.image.pillow

## Blend

Blend two images with adjustable alpha mixing.

Use cases:
- Create smooth transitions between images
- Adjust opacity of overlays
- Combine multiple exposures or effects

**Tags:** blend, mix, fade, transition

**Fields:**
- **image1**: The first image to blend. (ImageRef)
- **image2**: The second image to blend. (ImageRef)
- **alpha**: The mix ratio. (float)


## Composite

Combine two images using a mask for advanced compositing.

Use cases:
- Create complex image compositions
- Apply selective blending or effects
- Implement advanced photo editing techniques

**Tags:** composite, mask, blend, layering

**Fields:**
- **image1**: The first image to composite. (ImageRef)
- **image2**: The second image to composite. (ImageRef)
- **mask**: The mask to composite with. (ImageRef)


- [nodetool.nodes.lib.image.pillow.draw](pillow/draw.md)
- [nodetool.nodes.lib.image.pillow.enhance](pillow/enhance.md)
- [nodetool.nodes.lib.image.pillow.filter](pillow/filter.md)
