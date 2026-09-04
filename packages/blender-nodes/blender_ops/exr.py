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


def _is_color_channel(name):
    return name in ("R", "G", "B") or name.endswith((".R", ".G", ".B"))


def rewrite_background_to_inf(path, foreground):
    """Set every non-foreground sample of a staged depth EXR to `+inf`.

    The compositor stages the raw Z pass, whose off-geometry pixels carry
    the no-hit sentinel (`1e10`, measured on Blender 5.2.1 on both EEVEE
    and Cycles) instead of the `+inf` the `render_passes` contract
    promises for `depth_format: "exr"`. `foreground` is the row-major
    mask the op resolved from this same file (`True` is foreground):
    every other sample becomes `+inf` in each R/G/B-suffixed float
    channel, foreground samples are untouched. Refuses files outside
    the shape `read_exr_rgba` supports.
    """
    with open(path, "rb") as handle:
        blob = bytearray(handle.read())
    attrs, pos = _parse_header(blob)
    (compression,) = struct.unpack("B", attrs["compression"][:1])
    if compression != _NO_COMPRESSION:
        raise ExrError("compressed EXR (codec %d) is not supported" % (compression,))
    (x0, y0, x1, y1) = struct.unpack("<iiii", attrs["dataWindow"])
    width, height = x1 - x0 + 1, y1 - y0 + 1
    if len(foreground) != width * height:
        raise ValueError(
            "foreground mask %d does not fill %dx%d"
            % (len(foreground), width, height)
        )
    channels = _parse_header_channels(attrs)
    if any(s != (1, 1) for _, _, s in channels):
        raise ExrError("subsampled EXR channels are not supported")
    for _, pixel_type, _ in channels:
        if pixel_type not in _TYPE_SIZES:
            raise ExrError("non-float EXR channel is not supported")

    offsets = struct.unpack("<%dq" % (height,), blob[pos : pos + 8 * height])
    for row, offset in enumerate(offsets):
        (y,) = struct.unpack("<i", blob[offset : offset + 4])
        if y != y0 + row:
            raise ExrError("scanline %d out of order" % (row,))
        (size,) = struct.unpack("<i", blob[offset + 4 : offset + 8])
        cursor = offset + 8
        for name, pixel_type, _ in channels:
            sample = _TYPE_SIZES[pixel_type]
            if _is_color_channel(name):
                if pixel_type == _FLOAT:
                    inf = struct.pack("<f", float("inf"))
                else:
                    inf = struct.pack("<e", float("inf"))
                for col in range(width):
                    if not foreground[row * width + col]:
                        start = cursor + col * sample
                        blob[start : start + sample] = inf
            cursor += width * sample
        if cursor != offset + 8 + size:
            raise ExrError("scanline %d size mismatch" % (row,))
    with open(path, "wb") as handle:
        handle.write(bytes(blob))


def _decode(chunk, pixel_type):
    if pixel_type == _FLOAT:
        return list(struct.unpack("<%df" % (len(chunk) // 4,), chunk))
    return list(struct.unpack("<%de" % (len(chunk) // 2,), chunk))
