"""Minimal OpenEXR reader for the compositor's staged passes.

Blender's File Output node writes multilayer scanline EXR that this
Blender's own `bpy.data.images.load` surfaces as a 0x0 image, so the op
reads the bytes directly. Only the shape Blender writes under
`--factory-startup` is supported, and the reader refuses anything else
rather than guessing:

- single-part scanline image, increasing line order,
- `NO_COMPRESSION` (Blender's default for file outputs),
- `FLOAT` channels (depth and normal passes are float),
- one chunk per scanline holding every channel in file order.

Pure Python, no `bpy`: `tests/test_exr.py` (inside `test_depth.py`) covers
it with a synthetic file, and the T4 passes suite covers it against Blender.
"""

import struct

_MAGIC = b"v/1\x01"

_NO_COMPRESSION = 0

_FLOAT = 2
_HALF = 1

_TYPE_SIZES = {_FLOAT: 4, _HALF: 2}


class ExrError(ValueError):
    """The file is not the scanline EXR shape this reader supports."""


def _read_cstring(blob, pos):
    end = blob.index(b"\x00", pos)
    return blob[pos:end].decode("utf-8"), end + 1


def _parse_header(blob):
    if blob[:4] != _MAGIC:
        raise ExrError("not an EXR file")
    (version,) = struct.unpack("<I", blob[4:8])
    if version & 0x200:
        raise ExrError("tiled EXR is not supported")
    if version & 0x800:
        raise ExrError("multipart EXR is not supported")
    if version & 0x400:
        raise ExrError("long-name EXR is not supported")
    pos = 8
    attrs = {}
    while True:
        name, pos = _read_cstring(blob, pos)
        if name == "":
            break
        _type, pos = _read_cstring(blob, pos)
        (size,) = struct.unpack("<i", blob[pos : pos + 4])
        pos += 4
        attrs[name] = blob[pos : pos + size]
        pos += size
    return attrs, pos


def _parse_channels(raw):
    channels = []
    pos = 0
    while pos < len(raw):
        name, pos = _read_cstring(raw, pos)
        if name == "":
            break
        pixel_type = struct.unpack("<i", raw[pos : pos + 4])[0]
        x_sampling = struct.unpack("<i", raw[pos + 8 : pos + 12])[0]
        y_sampling = struct.unpack("<i", raw[pos + 12 : pos + 16])[0]
        pos += 16
        channels.append((name, pixel_type, x_sampling, y_sampling))
    return channels


def read_exr_rgba(path):
    """Read R, G, B channels as float lists in row-major order.

    Returns `(width, height, r, g, b)`. Channel lookup is by suffix: the
    compositor writes `*.R`, `*.G`, `*.B` (multilayer prefixes the socket
    layer, e.g. `Image.R`). Raises `ExrError` on any other shape.
    """
    with open(path, "rb") as handle:
        blob = handle.read()
    attrs, pos = _parse_header(blob)
    (compression,) = struct.unpack("B", attrs["compression"][:1])
    if compression != _NO_COMPRESSION:
        raise ExrError("compressed EXR (codec %d) is not supported" % (compression,))
    (x0, y0, x1, y1) = struct.unpack("<iiii", attrs["dataWindow"])
    width, height = x1 - x0 + 1, y1 - y0 + 1
    channels = _parse_header_channels(attrs)
    if any(s != (1, 1) for _, _, s in channels):
        raise ExrError("subsampled EXR channels are not supported")
    for _, pixel_type, _ in channels:
        if pixel_type not in _TYPE_SIZES:
            raise ExrError("non-float EXR channel is not supported")

    offsets = struct.unpack("<%dq" % (height,), blob[pos : pos + 8 * height])
    found = {}
    for row, offset in enumerate(offsets):
        (y,) = struct.unpack("<i", blob[offset : offset + 4])
        if y != y0 + row:
            raise ExrError("scanline %d out of order" % (row,))
        (size,) = struct.unpack("<i", blob[offset + 4 : offset + 8])
        cursor = offset + 8
        for name, pixel_type, _ in channels:
            count = width * _TYPE_SIZES[pixel_type]
            chunk = blob[cursor : cursor + count]
            if len(chunk) != count:
                raise ExrError("scanline %d is truncated" % (row,))
            cursor += count
            values = _decode(chunk, pixel_type)
            found.setdefault(name, []).extend(values)
        if cursor != offset + 8 + size:
            raise ExrError("scanline %d size mismatch" % (row,))

    def channel(suffix):
        for name, values in found.items():
            if name == suffix or name.endswith("." + suffix):
                return values
        raise ExrError("EXR has no .%s channel" % (suffix,))

    return width, height, channel("R"), channel("G"), channel("B")


def _parse_header_channels(attrs):
    raw = attrs.get("channels")
    if raw is None:
        raise ExrError("EXR has no channel list")
    channels = [
        (name, pixel_type, (xs, ys))
        for name, pixel_type, xs, ys in _parse_channels(raw)
    ]
    if not channels:
        raise ExrError("EXR has no channels")
    return channels


def _decode(chunk, pixel_type):
    if pixel_type == _FLOAT:
        return list(struct.unpack("<%df" % (len(chunk) // 4,), chunk))
    return list(struct.unpack("<%de" % (len(chunk) // 2,), chunk))
