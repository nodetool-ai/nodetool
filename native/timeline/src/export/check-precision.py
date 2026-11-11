"""Focused native delivery acceptance. Run under Xvfb with an isolated config.

Usage: python3 check-precision.py BINARY ARTIFACT_DIRECTORY
The caller selects the RHI backend. No display or sound is opened by this driver.
"""
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import zipfile

binary = str(Path(sys.argv[1]).resolve())
scratch = tempfile.TemporaryDirectory(prefix='nt-precision-') if len(sys.argv) < 3 else None
root = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(scratch.name) / 'results'
root.mkdir(parents=True, exist_ok=False)


CODEC_MEAN_CODE_ERROR = 1
# Allow one extra quantization step for 99% of samples, relative to RGBA8.
CODEC_P99_REGRESSION = 1
# Dither moves a pixel by at most half a code, so it can add at most that to a mean.
CODEC_MEAN_REGRESSION = 0.5
YUV_IDENTITY_MAX_CODE_DELTA = 1


def assert_yuv_identity(a, b, width, height):
    luma = width * height
    assert len(a) == len(b) == luma * 3 // 2
    planes = {}
    for name, start, end in (("Y", 0, luma), ("U", luma, luma * 5 // 4),
                             ("V", luma * 5 // 4, luma * 3 // 2)):
        planes[name] = max(abs(x-y) for x, y in zip(a[start:end], b[start:end]))
    assert max(planes.values()) <= YUV_IDENTITY_MAX_CODE_DELTA, planes
    return planes


def assert_codec_loss(decoded, unencoded, name, mean_limit=CODEC_MEAN_CODE_ERROR):
    assert len(decoded) == len(unencoded) and decoded
    errors = [abs(a-b) for a, b in zip(decoded, unencoded)]
    codec = {'max_code_error': max(errors), 'p99_code_error': sorted(errors)[len(errors) * 99 // 100],
             'mean_absolute_code_error': sum(errors) / len(errors)}
    print(f'{name} codec loss: {json.dumps(codec)}', flush=True)
    assert mean_limit is None or codec['mean_absolute_code_error'] <= mean_limit, (name, codec)
    return codec


def assert_codec_comparison(rgba8, fp16):
    # One pixel's maximum varies between encodes of near-identical content: OpenH264
    # gave 7 and 10 while FP16's mean was the better one. Compare the 99th percentile.
    assert fp16['p99_code_error'] <= rgba8['p99_code_error'] + CODEC_P99_REGRESSION, (rgba8, fp16)
    assert fp16['mean_absolute_code_error'] <= rgba8['mean_absolute_code_error'] + CODEC_MEAN_REGRESSION, (rgba8, fp16)


def command(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def export(name, fp16, fmt, effects, size=(), opacity=1, cancel=False, spatial=None):
    folder = root / name
    folder.mkdir()
    doc = {'width': 65, 'height': 49, 'fps': 1, 'durationMs': 2000 if cancel else 1000,
           'tracks': [{'id': 'v', 'type': 'video', 'visible': True}],
           'clips': [{'id': 'c', 'trackId': 'v', 'mediaType': 'shape', 'startMs': 0,
                      'durationMs': 2000 if cancel else 1000, 'width': 65, 'height': 49,
                      'opacity': opacity, 'shapeStyle': {'kind': 'rect', 'fill': '#7392ba'},
                      'effects': effects}]}
    if name.startswith('identity-'):
        doc['width'], doc['height'] = 64, 48
    if spatial is not None:
        doc['clips'][0]['shapeStyle']['fill'] = '#315b89'
        for i, (x, y, w, h, color) in enumerate(((7, 5, 19, 13, '#db7935'),
                                                (-13, -9, 11, 17, '#45bc93'))):
            clip = dict(doc['clips'][0], id=f'patch{i}', width=w, height=h,
                        transform={'position': {'x': x, 'y': y}},
                        shapeStyle={'kind': 'rect', 'fill': color})
            doc['clips'].append(clip)
    source = folder / 'scene.json'
    source.write_text(json.dumps(doc))
    output = folder / ('output.zip' if fmt == 'png_sequence' else 'output.mp4')
    env = os.environ.copy()
    env['NT_TEST_EXPORT_YUV'] = str(folder / 'unencoded.yuv') if fmt == 'mp4' else ''
    env['NT_TEST_EXPORT_FLOAT'] = str(folder / 'canvas.f32') if spatial is not None else ''
    env['NT_TEST_EXPORT_FP16'] = '1' if fp16 else '0'
    with tempfile.TemporaryDirectory(dir=folder) as config:
        env['XDG_CONFIG_HOME'] = config
        run = subprocess.run([binary, str(source), '--export', str(output), '--format', fmt,
                              '--json', *size, *(['--cancel-after-frames', '1'] if cancel else [])],
                             env=env, capture_output=True)
    (folder / 'log').write_bytes(run.stdout + run.stderr)
    if cancel:
        assert not output.exists(), name
        assert not list(folder.glob('.nt-export-*')), name
        assert run.returncode == 3 and b'Export cancelled' in run.stderr, run.stderr
        return None
    assert run.returncode == 0, (name, run.stderr.decode())
    if fmt == 'png_sequence':
        with zipfile.ZipFile(output) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            assert manifest['count'] == 1
            source = folder / 'frame.png'
            source.write_bytes(archive.read('frame_000001.png'))
    else:
        source = output
    tags = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                              '-show_streams', '-of', 'json', str(source)]))['streams'][0]
    (folder / 'tags.json').write_text(json.dumps(tags, indent=2))
    width, height = tags['width'], tags['height']
    if fmt == 'mp4':
        assert tags['pix_fmt'] == 'yuv420p'
        assert tags['color_range'] == 'tv'
        for field in ('color_space', 'color_transfer', 'color_primaries'):
            assert tags[field] == 'bt709'
    else:
        assert tags['pix_fmt'] in ('rgba', 'rgb24')
    if fmt == 'mp4':
        decoded_yuv = command(['ffmpeg', '-v', 'error', '-i', str(source), '-frames:v', '1',
                               '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'])
        unencoded = (folder / 'unencoded.yuv').read_bytes()
        assert len(unencoded) == len(decoded_yuv) == width * height * 3 // 2
        # A spatial fixture is small and detailed, and judges the resize alone. Its
        # codec loss depends on the encoder, as CI's OpenH264 measured 1.11 here.
        codec = assert_codec_loss(decoded_yuv, unencoded, name, None if spatial else CODEC_MEAN_CODE_ERROR)
        (folder / 'codec-error.json').write_text(json.dumps(codec))
        metrics[name + '-codec'] = codec
    pixels = command(['ffmpeg', '-v', 'error', '-i', str(source), '-frames:v', '1',
                      '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'])
    (folder / 'decoded.rgba').write_bytes(pixels)
    assert len(pixels) == width * height * 4
    assert all(a == 255 for a in pixels[3::4])
    if spatial is not None:
        reference = spatial_reference(folder, width, height, *spatial)
        if fmt == 'mp4':
            # Only color conversion/subsampling uses FFmpeg. Resizing above is
            # independent Python math, with no Qt or renderer helper calls.
            rgba64 = b''.join(struct.pack('<H', round(max(0, min(1, v)) * 65535))
                              for v in reference)
            raw = folder / 'reference.rgba64'
            raw.write_bytes(rgba64)
            wide = command(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pixel_format',
                            'rgba64le', '-video_size', f'{width}x{height}', '-i', str(raw),
                            '-vf', 'scale=iw:ih:flags=bicubic:in_range=full:out_range=limited:out_color_matrix=bt709:sws_dither=none',
                            '-frames:v', '1', '-pix_fmt', 'yuv420p16le', '-f', 'rawvideo', '-'])
            reference = [v[0] / 256 for v in struct.iter_unpack('<H', wide)]
            resize = spatial_error(unencoded, reference)
            decoded = spatial_error(decoded_yuv, reference)
            assert resize['max_code_error'] <= 1, (name, 'resize', resize)
            assert decoded['max_code_error'] <= 1 + codec['max_code_error'], (name, decoded)
        else:
            reference = [v * 255 for i, v in enumerate(reference) if i % 4 != 3]
            decoded = spatial_error([v for i, v in enumerate(pixels) if i % 4 != 3], reference)
            resize = decoded
            assert decoded['max_code_error'] <= 1, (name, decoded)
        metrics[name + '-spatial'] = {'resize': resize, 'decoded': decoded}
        print(f'{name} spatial: {json.dumps(metrics[name + "-spatial"])}', flush=True)
    center = [pixels[(y * width + x) * 4 + c]
              for y in range(height // 2 - 4, height // 2 + 4)
              for x in range(width // 2 - 4, width // 2 + 4) for c in range(3)]
    return center, (width, height)


def spatial_error(actual, reference):
    assert len(actual) == len(reference) and reference
    errors = [abs(a - b) for a, b in zip(actual, reference)]
    return {'max_code_error': max(errors), 'mean_absolute_code_error': sum(errors) / len(errors)}


def spatial_reference(folder, width, height, scaled, offset):
    # Observe the same undithered canvas, before any export resizing. Capturing
    # avoids folding renderer error into the resize measurement.
    raw = (folder / 'canvas.f32').read_bytes()
    assert len(raw) == 65 * 49 * 4 * 4
    source = [v[0] for v in struct.iter_unpack('=f', raw)]
    assert all(math.isfinite(v) for v in source)
    assert max(source[::4]) - min(source[::4]) > 0.25

    def weights(old, new, position):
        if new >= old:
            center = max(0, min(old - 1, (position + 0.5) * old / new - 0.5))
            low = math.floor(center)
            return ((low, 1 - (center - low)), (min(low + 1, old - 1), center - low))
        # Integrate the overlap of source cells with the destination footprint.
        lo, hi = position * old / new, (position + 1) * old / new
        return [(i, max(0, min(hi, i + 1) - max(lo, i)) / (hi - lo))
                for i in range(old) if i < hi and i + 1 > lo]

    result = []
    for y in range(height):
        for x in range(width):
            sx, sy = x - offset[0], y - offset[1]
            if not (0 <= sx < scaled[0] and 0 <= sy < scaled[1]):
                result.extend((0, 0, 0, 1))
                continue
            wx, wy = weights(65, scaled[0], sx), weights(49, scaled[1], sy)
            for c in range(4):
                result.append(sum(source[(iy * 65 + ix) * 4 + c] * ax * ay
                                  for ix, ax in wx for iy, ay in wy))
    return result


# One code covers final rounding (half a code) plus centered dithering
# (less than half a code). Codec error is measured independently, then added
# by the triangle inequality. These budgets are not fitted to test output.

inverse = [{'id': 'compress', 'type': 'levels', 'enabled': True, 'outWhite': 0.1},
           {'id': 'expand', 'type': 'levels', 'enabled': True, 'inWhite': 0.1}]
metrics = {}
failures = []
for fmt in ('png_sequence', 'mp4'):
    for geometry, size, scaled, offset in (
        ('fit-down', ('--width', '48', '--height', '32', '--scale-mode', 'fit'), (42, 32), (3, 0)),
        ('fill-down', ('--width', '48', '--height', '32', '--scale-mode', 'fill'), (48, 36), (0, -2)),
        ('fit-up', ('--width', '96', '--height', '80', '--scale-mode', 'fit'), (96, 72), (0, 4)),
        ('fill-up', ('--width', '96', '--height', '80', '--scale-mode', 'fill'), (106, 80), (-5, 0)),
        *([('odd-canvas', (), (64, 48), (0, 0))] if fmt == 'mp4' else [])):
        export(f'spatial-{fmt}-{geometry}', True, fmt, inverse, size, spatial=(scaled, offset))
    for geometry, size, expected in (
        ('canvas', (), (65, 49) if fmt == 'png_sequence' else (64, 48)),
        ('fit-down', ('--width', '48', '--height', '32', '--scale-mode', 'fit'), (48, 32)),
        ('fill-down', ('--width', '48', '--height', '32', '--scale-mode', 'fill'), (48, 32)),
        ('fit-up', ('--width', '96', '--height', '80', '--scale-mode', 'fit'), (96, 80)),
        ('fill-up', ('--width', '96', '--height', '80', '--scale-mode', 'fill'), (96, 80))):
        errors = []
        for fp16 in (False, True):
            name = f'{fmt}-{geometry}-{fp16}'
            pixels, dimensions = export(name, fp16, fmt, inverse, size)
            assert dimensions == expected
            error = sum(abs(v - (115, 146, 186)[i % 3]) for i, v in enumerate(pixels)) / len(pixels)
            errors.append(error)
            metrics[name] = {'mean_absolute_code_error': error}
        if fmt == 'mp4':
            assert_codec_comparison(*(metrics[f'{fmt}-{geometry}-{mode}-codec']
                                      for mode in (False, True)))
        assert errors[1] < errors[0], (fmt, geometry, errors)
    for fp16 in (False, True):
        export(f'cancel-{fmt}-{fp16}', fp16, fmt, [], cancel=True)
    for opacity in (1, 0.001):
        a, _ = export(f'identity-{fmt}-{opacity}-8', False, fmt, [], opacity=opacity)
        b, _ = export(f'identity-{fmt}-{opacity}-16', True, fmt, [], opacity=opacity)
        a = (root / f'identity-{fmt}-{opacity}-8' / 'decoded.rgba').read_bytes()
        b = (root / f'identity-{fmt}-{opacity}-16' / 'decoded.rgba').read_bytes()
        delta = max(abs(x-y) for x, y in zip(a, b))
        identity = {'max_code_delta': delta}
        limit = 1
        if fmt == 'mp4':
            planes = [(root / f'identity-{fmt}-{opacity}-{mode}' / 'unencoded.yuv').read_bytes()
                      for mode in (8, 16)]
            identity['unencoded_yuv_max_code_delta'] = assert_yuv_identity(*planes, 64, 48)
            codecs = [metrics[f'identity-{fmt}-{opacity}-{mode}-codec'] for mode in (8, 16)]
            assert_codec_comparison(*codecs)
            # Triangle inequality: measured codec maxima plus one delivery code.
            # There is no encoder-independent per-pixel codec error budget.
            # BT.709 limited YUV->RGB's largest absolute row sum is blue:
            # 255/219 + 2*(1-Kb)*255/224, Kb=0.0722. Allow one RGB
            # rounding code per decoded image. This is only a codec sanity bound.
            gain = 255 / 219 + 2 * (1 - 0.0722) * 255 / 224
            limit = math.ceil(gain * (sum(c['max_code_error'] for c in codecs)
                                      + YUV_IDENTITY_MAX_CODE_DELTA)) + 2
            identity['decoded_rgb_sanity_limit'] = limit
        if delta > limit:
            failures.append((fmt, opacity, delta))
        metrics[f'identity-{fmt}-{opacity}'] = identity
(root / 'metrics.json').write_text(json.dumps(metrics, indent=2))
print(json.dumps(metrics, indent=2), flush=True)
assert not failures, f"Identity edge agreement failed: {failures}"
