import math
import PIL.Image
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, Field

from typing import List
from PIL import Image, ImageChops, ImageDraw


class Tile:
    def __init__(self, image: Image.Image, x: int, y: int):
        self.image = image
        self.x = x
        self.y = y


def make_grid(
    width: int, height: int, tile_w: int = 512, tile_h: int = 512, overlap: int = 0
) -> tuple[list[list[tuple[int, int]]], int, int]:
    """
    Create a grid of coordinates for tiles given the dimensions and overlap.
    Returns a list of tile coordinates and the number of columns and rows.
    """
    assert width > 0 and height > 0, "Dimensions must be positive"
    assert tile_w > 0 and tile_h > 0, "Tile size must be positive"
    assert overlap >= 0, "Overlap must be non-negative"

    tiles = []
    y = 0
    while y + tile_h <= height:
        row = []
        x = 0
        while x + tile_w <= width:
            row.append((x, y))
            x += tile_w - overlap
        tiles.append(row)
        y += tile_h - overlap

    cols = len(tiles[0]) if tiles else 0
    rows = len(tiles)

    return tiles, cols, rows


def create_gradient_mask(tile_w: int, tile_h: int, overlap: int) -> Image.Image:
    """
    Create a gradient mask for blending the overlapping region of a tile.
    The gradient will fade from fully opaque to fully transparent.
    """
    mask = Image.new("L", (tile_w, tile_h), 0)
    draw = ImageDraw.Draw(mask)

    # Horizontal gradient
    for i in range(overlap):
        draw.rectangle(
            [tile_w - overlap + i, 0, tile_w - overlap + i + 1, tile_h],
            fill=int(255 * (i / overlap)),
        )

    # Vertical gradient
    for i in range(overlap):
        draw.rectangle(
            [0, tile_h - overlap + i, tile_w, tile_h - overlap + i + 1],
            fill=int(255 * (i / overlap)),
        )

    return mask


def combine_grid(
    tiles: List[List[Tile]],
    tile_w: int,
    tile_h: int,
    width: int,
    height: int,
    overlap: int,
) -> Image.Image:
    """
    Combine a grid of tiles into a single image, taking overlaps into account.
    The overlapping areas are blended using a gradient mask.
    """
    combined_image = Image.new("RGB", (width, height))

    for row in tiles:
        for tile in row:
            x, y = tile.x, tile.y

            # Paste the tile onto the combined image
            combined_image.paste(tile.image, (x, y))

            # Apply a gradient mask for the overlap area
            if overlap > 0:
                mask = create_gradient_mask(tile_w, tile_h, overlap)

                # Create a cropped version of the tile that is blended with the previous one
                cropped_tile = tile.image.crop(
                    (tile_w - overlap, tile_h - overlap, tile_w, tile_h)
                )

                # Paste the cropped tile with the gradient mask
                combined_image.paste(
                    cropped_tile, (x + tile_w - overlap, y + tile_h - overlap), mask
                )

    return combined_image


class SliceImageGrid(BaseNode):
    """
    Slice an image into a grid of tiles.

    image, grid, slice, tiles

    Use cases:
    - Prepare large images for processing in smaller chunks
    - Create image puzzles or mosaic effects
    - Distribute image processing tasks across multiple workers
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to slice into a grid."
    )
    columns: int = Field(default=0, ge=0, description="Number of columns in the grid.")
    rows: int = Field(default=0, ge=0, description="Number of rows in the grid.")

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        image = await context.image_to_pil(self.image)
        width, height = image.size

        if self.columns <= 0 and self.rows <= 0:
            # If neither columns nor rows are specified, default to a 3x3 grid
            self.columns = self.rows = 3
        elif self.columns <= 0:
            # If only rows are specified, calculate columns to maintain aspect ratio
            self.columns = math.ceil(width / height * self.rows)
        elif self.rows <= 0:
            # If only columns are specified, calculate rows to maintain aspect ratio
            self.rows = math.ceil(height / width * self.columns)

        tile_width = width // self.columns
        tile_height = height // self.rows

        sliced_images = []
        for y in range(0, height, tile_height):
            for x in range(0, width, tile_width):
                # Adjust the right and bottom edges to include any remainder pixels
                right = min(x + tile_width, width)
                bottom = min(y + tile_height, height)

                tile = image.crop((x, y, right, bottom))
                sliced_images.append(await context.image_from_pil(tile))

        return sliced_images


class CombineImageGrid(BaseNode):
    """
    Combine a grid of image tiles into a single image.

    image, grid, combine, tiles

    Use cases:
    - Reassemble processed image chunks
    - Create composite images from smaller parts
    - Merge tiled image data from distributed processing
    """

    tiles: list[ImageRef] = Field(
        default=[], description="List of image tiles to combine."
    )
    columns: int = Field(default=0, ge=0, description="Number of columns in the grid.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if not self.tiles:
            raise ValueError("No tiles provided for combining.")

        pil_tiles = [await context.image_to_pil(tile) for tile in self.tiles]
        pil_tiles = [tile.convert("RGBA") for tile in pil_tiles]

        if self.columns <= 0:
            self.columns = math.isqrt(len(pil_tiles))

        rows = math.ceil(len(pil_tiles) / self.columns)

        # Get the maximum width and height of tiles
        max_width = max(tile.width for tile in pil_tiles)
        max_height = max(tile.height for tile in pil_tiles)

        # Create a new image with the calculated size
        combined_width = max_width * self.columns
        combined_height = max_height * rows
        combined_image = PIL.Image.new("RGBA", (combined_width, combined_height))

        # Paste the tiles into the combined image
        for index, tile in enumerate(pil_tiles):
            row = index // self.columns
            col = index % self.columns
            x = col * max_width
            y = row * max_height
            combined_image.paste(tile, (x, y))

        return await context.image_from_pil(combined_image)
