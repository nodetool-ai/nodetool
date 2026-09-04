"""Depth normalization for the `render_passes` op (D4).

Pure Python, no `bpy` import, so `tests/test_depth.py` runs under system
Python as well as Blender's own interpreter.

Contracts:

- `depth`: linear distance along the camera view axis, in scene units, from
  the Z pass. `png16` (default) normalizes to `[0, 65535]` between
  `depth_near` and `depth_far` — the min and max finite depth over the
  foreground (masked) pixels — with background `65535`. `exr` keeps the raw
  float with background `+inf`, rewritten from the `1e10` sentinel the
  staged file carries.
"""

import struct
import zlib

#: 16-bit value written for background (masked-out or non-finite) pixels.
BACKGROUND16 = 65535

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _isfinite(value):
    return value != float("inf") and value != float("-inf") and value == value


def depth_range(depths, foreground):
    """Min/max finite depth over the foreground pixels.

    `depths` is the Z channel in row-major order, `foreground` a parallel
    mask (nonzero is foreground). Returns `(near, far)`. Raises
    `ValueError` when no foreground pixel carries a finite depth.
    """
    near = float("inf")
    far = float("-inf")
    for depth, mask in zip(depths, foreground):
        if not mask:
            continue
        if not _isfinite(depth):
            continue
        if depth < near:
            near = depth
        if depth > far:
            far = depth
    if near == float("inf"):
        raise ValueError("no foreground pixel carries a finite depth")
    return near, far


def normalize_to_u16(depths, foreground, near, far):
    """Map depths to `[0, 65535]`: foreground `near -> 0`, `far -> 65535`.

    Background (unmasked) and non-finite pixels map to `65535`. A degenerate
    range (`far <= near`, e.g. one fronto-parallel plane) maps finite
    foreground to `0` instead of dividing by zero.
    """
    span = far - near
    values = []
    for depth, mask in zip(depths, foreground):
        if not mask or not _isfinite(depth):
            values.append(BACKGROUND16)
        elif span <= 0:
            values.append(0)
        else:
            scaled = (depth - near) / span
            if scaled < 0:
                scaled = 0
            elif scaled > 1:
                scaled = 1
            values.append(int(round(scaled * BACKGROUND16)))
    return values


def _chunk(kind, payload):
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _check_fills(values, width, height, channels, label):
    if len(values) != width * height * channels:
        raise ValueError(
            "%s values %d do not fill %dx%dx%d"
            % (label, len(values), width, height, channels)
        )


def _write_png(path, width, height, bit_depth, color_type, raw):
    ihdr = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, 0)
    with open(path, "wb") as handle:
        handle.write(_PNG_SIGNATURE)
        handle.write(_chunk(b"IHDR", ihdr))
        handle.write(_chunk(b"IDAT", zlib.compress(bytes(raw))))
        handle.write(_chunk(b"IEND", b""))


def write_gray16_png(path, width, height, values):
    """Write 16-bit grayscale PNG: big-endian samples, filter 0 per row."""
    _check_fills(values, width, height, 1, "depth")
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        for col in range(width):
            raw += struct.pack(">H", values[row * width + col])
    _write_png(path, width, height, 16, 0, raw)


def write_gray8_png(path, width, height, values):
    """Write 8-bit grayscale PNG (the mask pass): filter 0 per row."""
    _check_fills(values, width, height, 1, "mask")
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        for col in range(width):
            raw.append(values[row * width + col])
    _write_png(path, width, height, 8, 0, raw)


def write_rgb8_png(path, width, height, values):
    """Write 8-bit RGB PNG (the normal pass): filter 0 per row."""
    _check_fills(values, width, height, 3, "normal")
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        for col in range(width):
            base = (row * width + col) * 3
            raw += bytes(values[base : base + 3])
    _write_png(path, width, height, 8, 2, raw)
