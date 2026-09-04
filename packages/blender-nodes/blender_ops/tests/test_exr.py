"""Unit tests for `exr.py`: the minimal scanline reader.

Plain asserts, no pytest, no `bpy`: runs under system Python (`python3
tests/test_exr.py`) and under Blender's interpreter alike. Exits nonzero
on the first mismatch.

The synthetic file mirrors exactly what Blender's File Output writes for a
staged pass: single-part scanline, `NO_COMPRESSION`, `FLOAT` channels named
`Image.R/G/B/A`, increasing line order.
"""

import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from exr import ExrError, read_exr_rgba


def check(label, actual, expected):
    if actual != expected:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


def write_exr(path, width, height, channels, compression=0):
    """Minimal uncompressed scanline EXR: `channels` is [(name, [floats])]."""
    blob = bytearray(b"v/1\x01" + struct.pack("<I", 2))

    def attr(name, typ, payload):
        blob.extend(name + b"\x00" + typ + b"\x00")
        blob.extend(struct.pack("<i", len(payload)) + payload)

    attr(b"compression", b"compression", struct.pack("B", compression))
    attr(
        b"dataWindow",
        b"box2i",
        struct.pack("<iiii", 0, 0, width - 1, height - 1),
    )
    attr(
        b"displayWindow",
        b"box2i",
        struct.pack("<iiii", 0, 0, width - 1, height - 1),
    )
    attr(b"lineOrder", b"lineOrder", b"\x00")
    chlist = b""
    for name, _values in channels:
        chlist += name + b"\x00" + struct.pack("<i", 2) + b"\x00\x00\x00\x00"
        chlist += struct.pack("<ii", 1, 1)
    chlist += b"\x00"
    attr(b"channels", b"chlist", chlist)
    blob += b"\x00"
    table_at = len(blob)
    blob += b"\x00" * (8 * height)
    offsets = []
    for row in range(height):
        offsets.append(len(blob))
        blob += struct.pack("<i", row)
        body = b"".join(
            struct.pack("<%df" % (width,), *values[row * width : (row + 1) * width])
            for _name, values in channels
        )
        blob += struct.pack("<i", len(body)) + body
    struct.pack_into("<%dq" % (height,), blob, table_at, *offsets)
    with open(path, "wb") as handle:
        handle.write(bytes(blob))


HERE = os.path.dirname(os.path.abspath(__file__))
GOOD = os.path.join(HERE, "_exr_test.exr")

try:
    depth = [float(i) for i in range(6)]
    write_exr(
        GOOD,
        3,
        2,
        [
            (b"Image.A", [1.0] * 6),
            (b"Image.B", depth),
            (b"Image.G", depth),
            (b"Image.R", depth),
        ],
    )
    width, height, r, g, b = read_exr_rgba(GOOD)
    check("geometry", (width, height), (3, 2))
    check("r", r, depth)
    check("g", g, depth)
    check("b", b, depth)
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

# inf and nan survive the round trip bit-exact (the sentinel gate needs them).
try:
    write_exr(
        GOOD,
        2,
        1,
        [
            (b"L.R", [float("inf"), float("nan")]),
            (b"L.G", [0.0, 0.0]),
            (b"L.B", [0.0, 0.0]),
        ],
    )
    _w, _h, r, _g, _b = read_exr_rgba(GOOD)
    check("inf", r[0] == float("inf"), True)
    check("nan", r[1] != r[1], True)
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

# a compressed file is refused, never misread.
try:
    write_exr(
        GOOD,
        1,
        1,
        [(b"L.R", [1.0]), (b"L.G", [1.0]), (b"L.B", [1.0])],
        compression=3,
    )
    read_exr_rgba(GOOD)
    print("MISMATCH compressed: expected ExrError")
    sys.exit(1)
except ExrError:
    pass
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

# not an EXR file at all.
try:
    with open(GOOD, "wb") as handle:
        handle.write(b"definitely not exr")
    read_exr_rgba(GOOD)
    print("MISMATCH magic: expected ExrError")
    sys.exit(1)
except ExrError:
    pass
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

print("exr: all checks passed")
