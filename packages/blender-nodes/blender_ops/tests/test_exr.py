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

from exr import ExrError, read_exr_rgba, rewrite_background_to_inf


def check(label, actual, expected):
    if actual != expected:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


def read_channel(path, wanted):
    """Float samples of one named channel, in row-major order."""
    from exr import _parse_header, _parse_header_channels

    with open(path, "rb") as handle:
        blob = handle.read()
    attrs, pos = _parse_header(blob)
    (x0, y0, x1, y1) = struct.unpack("<iiii", attrs["dataWindow"])
    width, height = x1 - x0 + 1, y1 - y0 + 1
    channels = _parse_header_channels(attrs)
    offsets = struct.unpack("<%dq" % (height,), blob[pos : pos + 8 * height])
    values = []
    for row, offset in enumerate(offsets):
        cursor = offset + 8
        for name, pixel_type, _ in channels:
            count = width * 4
            if name == wanted:
                values.extend(
                    struct.unpack(
                        "<%df" % (width,), blob[cursor : cursor + count]
                    )
                )
            cursor += count
    return values


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

# background samples become +inf, foreground is bit-exact, alpha is kept.
try:
    write_exr(
        GOOD,
        3,
        2,
        [
            (b"Image.A", [1.0] * 6),
            (b"Image.B", [1e10, 2.0, 1e10, 4.0, 5.0, 1e10]),
            (b"Image.G", [1e10, 2.0, 1e10, 4.0, 5.0, 1e10]),
            (b"Image.R", [1e10, 2.0, 1e10, 4.0, 5.0, 1e10]),
        ],
    )
    rewrite_background_to_inf(
        GOOD, [False, True, False, True, True, False]
    )
    _w, _h, r, g, b = read_exr_rgba(GOOD)
    check("bg", [r[0], r[2], r[5]], [float("inf")] * 3)
    check("fg", [r[1], r[3], r[4]], [2.0, 4.0, 5.0])
    check("g-matches", g, r)
    check("b-matches", b, r)
    check("alpha-kept", read_channel(GOOD, "Image.A"), [1.0] * 6)
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

# a mask that does not fill the frame is refused, never half-applied.
try:
    write_exr(
        GOOD,
        2,
        1,
        [
            (b"L.R", [1.0, 2.0]),
            (b"L.G", [1.0, 2.0]),
            (b"L.B", [1.0, 2.0]),
        ],
    )
    rewrite_background_to_inf(GOOD, [True])
    print("MISMATCH mask-size: expected ValueError")
    sys.exit(1)
except ValueError:
    pass
finally:
    if os.path.exists(GOOD):
        os.remove(GOOD)

print("exr: all checks passed")
