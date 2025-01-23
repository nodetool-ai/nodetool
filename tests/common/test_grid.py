import pytest
from typing import List, Tuple
from PIL import Image
import numpy as np

from nodetool.nodes.lib.image.grid import Tile, combine_grid, make_grid


def create_dummy_tile(
    x: int, y: int, width: int, height: int, color: Tuple[int, int, int]
):
    """
    This function creates a dummy tile with the given dimensions and color.
    """
    return Tile(image=Image.new("RGB", (width, height), color), x=x, y=y)


def create_dummy_tiles_grid(
    width: int,
    height: int,
    tile_w: int,
    tile_h: int,
    overlap: int,
    color: Tuple[int, int, int] = (0, 0, 0),
) -> List[List[Tile]]:
    tiles, _, _ = make_grid(width, height, tile_w, tile_h, overlap)
    return [
        [create_dummy_tile(x, y, tile_w, tile_h, color) for x, y in row]
        for row in tiles
    ]


def test_zero_dimensions():
    with pytest.raises(AssertionError):
        make_grid(0, 0)


def test_negative_dimensions():
    with pytest.raises(AssertionError):
        make_grid(-1, -1)


def test_zero_tile_size():
    with pytest.raises(AssertionError):
        make_grid(1000, 1000, 0, 0)


def test_negative_tile_size():
    with pytest.raises(AssertionError):
        make_grid(1000, 1000, -1, -1)


def test_zero_overlap():
    tiles, cols, rows = make_grid(1024, 1024, 512, 512, 0)
    assert cols == 2
    assert rows == 2
    expected_tiles = [[(0, 0), (512, 0)], [(0, 512), (512, 512)]]
    assert tiles == expected_tiles


def test_negative_overlap():
    with pytest.raises(AssertionError):
        make_grid(1000, 1000, 512, 512, -1)


def test_single_tile():
    tiles, cols, rows = make_grid(512, 512)
    assert cols == 1
    assert rows == 1
    assert tiles == [[(0, 0)]]


def test_no_overlap():
    tiles, cols, rows = make_grid(1024, 1024, 512, 512, 0)
    assert cols == 2
    assert rows == 2
    expected_tiles = [
        [(0, 0), (512, 0)],
        [(0, 512), (512, 512)],
    ]
    assert tiles == expected_tiles


def test_even_overlap():
    tiles, cols, rows = make_grid(48, 48, 32, 32, 16)
    assert cols == 2
    assert rows == 2
    expected_tiles = [
        [(0, 0), (16, 0)],
        [(0, 16), (16, 16)],
    ]
    assert tiles == expected_tiles


def test_odd_dimensions():
    tiles, cols, rows = make_grid(32, 48, 32, 32, 16)
    assert cols == 1
    assert rows == 2
    expected_tiles = [
        [(0, 0)],
        [(0, 16)],
    ]
    assert tiles == expected_tiles


def test_combine_grid_empty():
    result = combine_grid([], 0, 0, 0, 0, 0)
    assert result.size == (0, 0)


def test_combine_grid_single_tile_no_overlap():
    tiles = create_dummy_tiles_grid(10, 10, 10, 10, 0)
    result = combine_grid(tiles, 10, 10, 10, 10, 0)
    assert result.size == (10, 10)


def test_combine_grid_single_row_no_overlap():
    tiles = create_dummy_tiles_grid(30, 10, 10, 10, 0)
    result = combine_grid(tiles, 10, 10, 30, 10, 0)
    assert result.size == (30, 10)


def test_combine_grid_single_column_no_overlap():
    tiles = create_dummy_tiles_grid(10, 30, 10, 10, 0)
    result = combine_grid(tiles, 10, 10, 10, 30, 0)
    assert result.size == (10, 30)


def test_combine_grid_grid_no_overlap():
    tiles = create_dummy_tiles_grid(30, 30, 10, 10, 0)
    result = combine_grid(tiles, 10, 10, 30, 30, 0)
    assert result.size == (30, 30)
