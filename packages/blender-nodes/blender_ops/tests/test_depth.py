"""Unit tests for `depth.py`: normalization contracts and the PNG writer.

Plain asserts, no pytest, no `bpy`: runs under system Python (`python3
tests/test_depth.py`) and under Blender's interpreter alike. Exits nonzero
on the first mismatch.
"""

import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from depth import (
    BACKGROUND16,
    depth_range,
    normalize_to_u16,
    write_gray8_png,
    write_gray16_png,
    write_rgb8_png,
)


def check(label, actual, expected):
    if actual != expected:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


def check_close(label, actual, expected, tol=1e-9):
    if abs(actual - expected) > tol:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


# min/max over the masked finite pixels; inf and unmasked pixels never win.
near, far = depth_range(
    [1.0, float("inf"), 5.0, 2.0],
    [True, True, False, True],
)
check_close("near", near, 1.0)
check_close("far", far, 2.0)

# no finite foreground depth is an error, not a silent (0, 0).
try:
    depth_range([float("inf"), 3.0], [True, False])
    print("MISMATCH empty-range: expected ValueError")
    sys.exit(1)
except ValueError:
    pass

# endpoints land exactly; background and +inf land on 65535.
values = normalize_to_u16(
    [1.0, 2.0, 3.0, float("inf"), 99.0],
    [True, True, True, True, False],
    1.0,
    3.0,
)
check("normalized", values, [0, 32768, 65535, BACKGROUND16, BACKGROUND16])

# degenerate range maps finite foreground to 0, never divides by zero.
check(
    "degenerate",
    normalize_to_u16([2.0, float("inf")], [True, True], 2.0, 2.0),
    [0, BACKGROUND16],
)

# past the endpoints clamps to the endpoint values.
check(
    "clamped",
    normalize_to_u16([0.0, 9.0], [True, True], 1.0, 3.0),
    [0, 65535],
)

# the writer round-trips: parse the chunks, inflate the IDAT, compare bytes.
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_depth_test.png")
try:
    write_gray16_png(out, 2, 2, [0, 32768, 65535, 12345])
    with open(out, "rb") as handle:
        blob = handle.read()
    check("png signature", blob[:8], b"\x89PNG\r\n\x1a\n")
    pos = 8
    seen = {}
    while pos < len(blob):
        (length,) = struct.unpack(">I", blob[pos : pos + 4])
        kind = blob[pos + 4 : pos + 8]
        payload = blob[pos + 8 : pos + 8 + length]
        (crc,) = struct.unpack(">I", blob[pos + 8 + length : pos + 12 + length])
        check("crc %s" % (kind,), crc, zlib.crc32(kind + payload) & 0xFFFFFFFF)
        seen[kind] = payload
        pos += 12 + length
    ihdr = seen[b"IHDR"]
    check("ihdr size", struct.unpack(">II", ihdr[:8]), (2, 2))
    check("ihdr depth/type", (ihdr[8], ihdr[9]), (16, 0))
    raw = zlib.decompress(seen[b"IDAT"])
    expect = b"".join(
        [
            b"\x00" + struct.pack(">HH", 0, 32768),
            b"\x00" + struct.pack(">HH", 65535, 12345),
        ]
    )
    check("idat samples", raw, expect)
finally:
    if os.path.exists(out):
        os.remove(out)


def read_rows(path):
    with open(path, "rb") as handle:
        blob = handle.read()
    pos = 8
    ihdr = None
    idat = b""
    while pos < len(blob):
        (length,) = struct.unpack(">I", blob[pos : pos + 4])
        kind = blob[pos + 4 : pos + 8]
        payload = blob[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            ihdr = payload
        elif kind == b"IDAT":
            idat += payload
        pos += 12 + length
    width, height = struct.unpack(">II", ihdr[:8])
    return width, height, ihdr[8], ihdr[9], zlib.decompress(idat)


out8 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_mask_test.png")
try:
    write_gray8_png(out8, 3, 1, [0, 255, 128])
    width, height, depth, ctype, raw = read_rows(out8)
    check("gray8 geometry", (width, height, depth, ctype), (3, 1, 8, 0))
    check("gray8 samples", raw, b"\x00\x00\xff\x80")
finally:
    if os.path.exists(out8):
        os.remove(out8)

outn = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_normal_test.png")
try:
    write_rgb8_png(outn, 2, 1, [128, 128, 255, 255, 0, 0])
    width, height, depth, ctype, raw = read_rows(outn)
    check("rgb8 geometry", (width, height, depth, ctype), (2, 1, 8, 2))
    check("rgb8 samples", raw, b"\x00\x80\x80\xff\xff\x00\x00")
finally:
    if os.path.exists(outn):
        os.remove(outn)

# a short row is an error, never a truncated file.
try:
    write_gray8_png(out8, 2, 2, [0, 0, 0])
    print("MISMATCH short-row: expected ValueError")
    sys.exit(1)
except ValueError:
    pass
if os.path.exists(out8):
    os.remove(out8)

print("depth: all checks passed")
