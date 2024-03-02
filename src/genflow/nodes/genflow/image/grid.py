import math
import numpy as np
from typing import NamedTuple

import PIL.Image


class Tile(NamedTuple):
    image: PIL.Image.Image
    x: int
    y: int


def make_grid(
    w: int, h: int, tile_w=512, tile_h=512, overlap=64
) -> tuple[list[list[tuple[int, int]]], int, int]:
    """
    Make a grid of tiles with the given width and height. The tiles will be
    overlapping, with the given overlap size.
    """
    assert tile_h <= h, "tile_h must be less than or equal to h"
    assert overlap < tile_w, "overlap must be less than tile_w"
    assert overlap < tile_h, "overlap must be less than tile_h"
    assert w > 0, "w must be greater than 0"
    assert h > 0, "h must be greater than 0"
    assert overlap >= 0, "overlap must be greater than or equal to 0"

    # The width and height of the non-overlapping part of the tile
    non_overlap_width = tile_w - overlap
    non_overlap_height = tile_h - overlap

    # The number of rows and columns of tiles
    cols = math.ceil((w - overlap) / non_overlap_width)
    rows = math.ceil((h - overlap) / non_overlap_height)

    # The distance between the left edge of each tile
    # If there is only one column, dx will be 0
    # If there are multiple columns, dx will be the distance between the left edge of each tile
    dx = (w - tile_w) / (cols - 1) if cols > 1 else 0
    dy = (h - tile_h) / (rows - 1) if rows > 1 else 0

    tiles = []

    for row in range(rows):
        row_tiles = []
        y = int(row * dy)

        # Align the bottom edge of the last tile with the bottom edge of the image
        if y + tile_h >= h:
            y = h - tile_h

        for col in range(cols):
            x = int(col * dx)

            # Align the right edge of the last tile with the right edge of the image
            if x + tile_w >= w:
                x = w - tile_w

            row_tiles.append((x, y))

        tiles.append(row_tiles)

    return tiles, cols, rows


def in_groups_of(items: list, group_size: int, fill_value=None) -> list[list[any]]:
    """
    Split a list into groups of the given size.

    The last group may be smaller than the given size.

    Args:
        items: A list of items to split into groups.
        group_size: The size of each group.
        fill_value: The value to use to fill the last group if it is smaller than the given size.
    """
    groups = []
    for i in range(0, len(items), group_size):
        group = items[i : i + group_size]
        if len(group) < group_size:
            group = group + [fill_value] * (group_size - len(group))
        groups.append(group)
    return groups


def flatten(items: list[list[any]]) -> list[any]:
    """
    Flatten a list of lists into a single list.
    """
    return [item for sublist in items for item in sublist]


def combine_grid(
    tiles: list[list[Tile]],
    tile_w: int,
    tile_h: int,
    image_w: int,
    image_h: int,
    overlap: int,
):
    """
    Combine a grid of tiles into a single image.

    The tiles will be tile_w x tile_h pixels, with overlap pixels of overlap.

    The tiles must be in the same order as the grid returned by make_grid.

    The tiles must be overlapping, with the given overlap size.

    Args:
        tiles: A list of lists of tiles.
        tile_w: The width of the tiles.
        tile_h: The height of the tiles.
        image_w: The width of the image.
        image_h: The height of the image.
        overlap: The number of pixels of overlap between tiles.
    """

    def make_mask_image(r):
        """
        Make a mask image from a 2D array of values.

        The values will be scaled to 0-255.
        """
        r = r.astype(np.uint8)
        return PIL.Image.fromarray(r, "L")

    # Mask image for the left edge of the tile
    # The size of the mask image is (overlap, tile_h)
    # The values of the mask image are 0-255, with 0 being transparent and 255 being opaque.
    mask_w = make_mask_image(
        np.arange(overlap, dtype=np.float32)
        .reshape((1, overlap))
        .repeat(tile_h, axis=0)
    )

    # Mask image for the top edge of the tile
    # The size of the mask image is (tile_w, overlap)
    # The values of the mask image are 0-255, with 0 being transparent and 255 being opaque.
    mask_h = make_mask_image(
        np.arange(overlap, dtype=np.float32)
        .reshape((overlap, 1))
        .repeat(image_w, axis=1)
    )

    combined_image = PIL.Image.new("RGB", (image_w, image_h))

    # Combine the tiles into rows and columns
    for row in tiles:
        combined_row = PIL.Image.new("RGB", (image_w, tile_h))
        for tile in row:
            if tile.x == 0:
                # The first tile in the row is not overlapping with the previous tile
                # Just paste the tile into the row and continue
                # This is a special case because the tile does not need to be combined with the previous tile
                combined_row.paste(tile.image, (0, 0))
                continue

            # Combine the tile with the left and top edges of the previous tile
            # The left edge of the tile is overlapping with the right edge of the previous tile.
            # The top edge of the tile is overlapping with the bottom edge of the previous tile.
            # The mask image is used to make the overlapping parts of the tile transparent.
            combined_row.paste(
                tile.image.crop((0, 0, overlap, tile_h)), (tile.x, 0), mask=mask_w
            )

            # The remaining part of the tile is not overlapping with the previous tile
            # Just paste the tile into the row.
            combined_row.paste(
                tile.image.crop((overlap, 0, tile_w, tile_h)), (tile.x + overlap, 0)
            )

        if tile.y == 0:
            # The first row is not overlapping with the previous row
            # Just paste the row into the combined image and continue
            combined_image.paste(combined_row, (0, 0))
            continue

        # Combine the row with the left and top edges of the previous row
        # The top edge of the row is overlapping with the bottom edge of the previous row.
        # The mask image is used to make the overlapping parts of the row transparent.
        combined_image.paste(
            combined_row.crop((0, 0, combined_row.width, overlap)),
            (0, tile.y),
            mask=mask_h,
        )
        # The remaining part of the row is not overlapping with the previous row
        # Just paste the row into the combined image.
        combined_image.paste(
            combined_row.crop((0, overlap, combined_row.width, tile_h)),
            (0, tile.y + overlap),
        )

    return combined_image
