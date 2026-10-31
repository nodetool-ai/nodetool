"""Measure aligned screenshot errors without resizing images or declaring parity."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib


def read_png(path):
    raw = Path(path).read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Expected a PNG screenshot')
    offset, compressed = 8, bytearray()
    while offset < len(raw):
        length = struct.unpack_from('>I', raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        data = raw[offset + 8:offset + 8 + length]
        offset += length + 12
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
                raise ValueError('Expected noninterlaced 8-bit RGB/RGBA screenshots')
            channels = 4 if color == 6 else 3
        if kind == b'IDAT':
            compressed.extend(data)
    decoded = zlib.decompress(compressed)
    stride = width * channels
    if len(decoded) != height * (stride + 1):
        raise ValueError('PNG scanline extent differs from its dimensions')
    previous = bytearray(stride)
    pixels = bytearray(width * height * 3)
    cursor = 0
    for y in range(height):
        mode = decoded[cursor]
        row = bytearray(decoded[cursor + 1:cursor + 1 + stride])
        cursor += stride + 1
        for x in range(stride):
            a = row[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if mode == 1:
                predictor = a
            elif mode == 2:
                predictor = b
            elif mode == 3:
                predictor = (a + b) // 2
            elif mode == 4:
                value = a + b - c
                distances = (abs(value - a), abs(value - b), abs(value - c))
                predictor = a if distances[0] <= min(distances[1:]) else b if distances[1] <= distances[2] else c
            elif mode == 0:
                predictor = 0
            else:
                raise ValueError('Unsupported PNG scanline filter')
            row[x] = (row[x] + predictor) & 255
        for x in range(width):
            target = (y * width + x) * 3
            pixels[target:target + 3] = row[x * channels:x * channels + 3]
        previous = row
    return width, height, pixels


def region_metrics(reference, candidate, width, height, bounds):
    x, y, w, h = bounds
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1.000001 or y + h > 1.000001:
        raise ValueError('Region must lie inside the screenshot')
    left, top = int(x * width), int(y * height)
    right, bottom = min(width, max(left + 1, int((x + w) * width))), min(height, max(top + 1, int((y + h) * height)))
    absolute = squared = changed = maximum = 0
    reference_sum, candidate_sum = [0, 0, 0], [0, 0, 0]
    for row in range(top, bottom):
        for column in range(left, right):
            index = (row * width + column) * 3
            pixel_changed = False
            for channel in range(3):
                a, b = reference[index + channel], candidate[index + channel]
                error = abs(a - b)
                absolute += error
                squared += error * error
                maximum = max(maximum, error)
                reference_sum[channel] += a
                candidate_sum[channel] += b
                pixel_changed |= error != 0
            changed += int(pixel_changed)
    count = (right - left) * (bottom - top)
    return {'boundsPixels': [left, top, right - left, bottom - top], 'pixels': count, 'meanAbsoluteError': absolute / (count * 3 * 255), 'rootMeanSquareError': math.sqrt(squared / (count * 3)) / 255, 'maximumChannelError': maximum / 255, 'changedPixelFraction': changed / count, 'referenceMeanRgb': [value / count / 255 for value in reference_sum], 'candidateMeanRgb': [value / count / 255 for value in candidate_sum]}


def compare(reference_path, candidate_path, configuration, shared_probe_path=None):
    width, height, reference = read_png(reference_path)
    candidate_width, candidate_height, candidate = read_png(candidate_path)
    if (width, height) != (candidate_width, candidate_height):
        raise ValueError('Screenshot dimensions differ; images must not be rescaled for comparison')
    if (width, height) != (configuration['resolution']['width'], configuration['resolution']['height']):
        raise ValueError('Screenshot dimensions differ from the capture inventory')
    regions = {'whole-frame': [0, 0, 1, 1], **configuration.get('regions', {})}
    digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
    return {'referenceImageDigest': digest(reference_path), 'candidateImageDigest': digest(candidate_path), 'resolution': {'width': width, 'height': height}, 'colorSpace': 'encoded PNG RGB bytes', 'sharedProbeDigest': digest(shared_probe_path) if shared_probe_path else None, 'alignment': 'Shared probe supplied; verify both capture reports identify this digest before interpreting errors.' if shared_probe_path else 'Unverified. Error measurements do not establish aligned presentation or visual parity.', 'regions': {name: region_metrics(reference, candidate, width, height, bounds) for name, bounds in regions.items()}, 'acceptance': 'No automatic parity decision or error threshold is applied.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--configuration', default=str(Path(__file__).with_name('comparison.json')))
    parser.add_argument('--shared-probe')
    parser.add_argument('--out', required=True)
    arguments = parser.parse_args()
    result = compare(arguments.reference, arguments.candidate, json.loads(Path(arguments.configuration).read_text()), arguments.shared_probe)
    Path(arguments.out).write_text(json.dumps(result, indent=2) + '\n')
