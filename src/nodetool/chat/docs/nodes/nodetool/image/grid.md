# nodetool.nodes.nodetool.image.grid

## CombineImageGrid

Combine a grid of image tiles into a single image.
image, grid, combine, tiles

Use cases:
- Reassemble processed image chunks
- Create composite images from smaller parts
- Merge tiled image data from distributed processing

**Fields:**
tiles: list
columns: int

## SliceImageGrid

Slice an image into a grid of tiles.
image, grid, slice, tiles

Use cases:
- Prepare large images for processing in smaller chunks
- Create image puzzles or mosaic effects
- Distribute image processing tasks across multiple workers

**Fields:**
image: ImageRef
columns: int
rows: int

