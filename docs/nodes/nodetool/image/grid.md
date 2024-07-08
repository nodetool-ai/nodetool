# nodetool.nodes.nodetool.image.grid

## CombineImageGrid

Combine a grid of image tiles into a single image.
image, grid, combine, tiles

Use cases:
- Reassemble processed image chunks
- Create composite images from smaller parts
- Merge tiled image data from distributed processing

**Tags:** 

- **tiles**: List of image tiles to combine. (list[nodetool.metadata.types.ImageRef])
- **original_width**: Width of the original image. (int)
- **original_height**: Height of the original image. (int)
- **tile_width**: Width of each tile. (int)
- **tile_height**: Height of each tile. (int)
- **overlap**: Overlap between tiles. (int)

## SliceImageGrid

Slice an image into a grid of tiles.
image, grid, slice, tiles

Use cases:
- Prepare large images for processing in smaller chunks
- Create image puzzles or mosaic effects
- Distribute image processing tasks across multiple workers

**Tags:** 

- **image**: The image to slice into a grid. (ImageRef)
- **tile_width**: Width of each tile. (int)
- **tile_height**: Height of each tile. (int)
- **overlap**: Overlap between tiles. (int)

## Tile

Tile(image, x, y)

### combine_grid

Combine a grid of tiles into a single image.

The tiles will be tile_w x tile_h pixels, with overlap pixels of overlap.

The tiles must be in the same order as the grid returned by make_grid.

The tiles must be overlapping, with the given overlap size.


**Args:**

- **tiles**: A list of lists of tiles.
- **tile_w**: The width of the tiles.
- **tile_h**: The height of the tiles.
- **image_w**: The width of the image.
- **image_h**: The height of the image.
- **overlap**: The number of pixels of overlap between tiles.
### flatten

Flatten a list of lists into a single list.
**Args:**
- **items (list[list[typing.Any]])**

**Returns:** list[typing.Any]

### in_groups_of

Split a list into groups of the given size.

The last group may be smaller than the given size.


**Args:**

- **items**: A list of items to split into groups.
- **group_size**: The size of each group.
- **fill_value**: The value to use to fill the last group if it is smaller than the given size.
**Returns:** list[list[typing.Any]]

### make_grid

Make a grid of tiles with the given width and height. The tiles will be
overlapping, with the given overlap size.
**Args:**
- **w (int)**
- **h (int)**
- **tile_w (default: 512)**
- **tile_h (default: 512)**
- **overlap (default: 64)**

**Returns:** tuple[list[list[tuple[int, int]]], int, int]

