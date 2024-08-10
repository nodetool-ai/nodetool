import math
import PIL.Image
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, Field


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
