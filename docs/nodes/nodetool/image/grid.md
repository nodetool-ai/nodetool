# nodetool.nodes.nodetool.image.grid

## CombineImageGrid

Combine a grid of image tiles into a single image.
image, grid, combine, tiles

Use cases:
- Reassemble processed image chunks
- Create composite images from smaller parts
- Merge tiled image data from distributed processing

**Tags:** 

**Fields:**
- **tiles**: List of image tiles to combine. (list[nodetool.metadata.types.ImageRef])
- **columns**: Number of columns in the grid. (int)


## SliceImageGrid

Slice an image into a grid of tiles.
image, grid, slice, tiles

Use cases:
- Prepare large images for processing in smaller chunks
- Create image puzzles or mosaic effects
- Distribute image processing tasks across multiple workers

**Tags:** 

**Fields:**
- **image**: The image to slice into a grid. (ImageRef)
- **columns**: Number of columns in the grid. (int)
- **rows**: Number of rows in the grid. (int)


## Tile

### combine_grid

Combine a grid of tiles into a single image, taking overlaps into account.
The overlapping areas are blended using a gradient mask.
**Args:**
- **tiles (typing.List[typing.List[nodetool.nodes.nodetool.image.grid.Tile]])**
- **tile_w (int)**
- **tile_h (int)**
- **width (int)**
- **height (int)**
- **overlap (int)**

**Returns:** Image

### create_gradient_mask

Create a gradient mask for blending the overlapping region of a tile.
The gradient will fade from fully opaque to fully transparent.
**Args:**
- **tile_w (int)**
- **tile_h (int)**
- **overlap (int)**

**Returns:** Image

### make_grid

Create a grid of coordinates for tiles given the dimensions and overlap.
Returns a list of tile coordinates and the number of columns and rows.
**Args:**
- **width (int)**
- **height (int)**
- **tile_w (int) (default: 512)**
- **tile_h (int) (default: 512)**
- **overlap (int) (default: 0)**

**Returns:** tuple[list[list[tuple[int, int]]], int, int]

