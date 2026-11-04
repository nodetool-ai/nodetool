"""Focused native delivery acceptance. Run under Xvfb with an isolated config.

Usage: python3 check-precision.py BINARY ARTIFACT_DIRECTORY
The caller selects the RHI backend. No display or sound is opened by this driver.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

binary = str(Path(sys.argv[1]).resolve())
scratch = tempfile.TemporaryDirectory(prefix='nt-precision-') if len(sys.argv) < 3 else None
root = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(scratch.name) / 'results'
root.mkdir(parents=True, exist_ok=False)


def command(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def export(name, fp16, fmt, effects, size=(), opacity=1, cancel=False):
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
    source = folder / 'scene.json'
    source.write_text(json.dumps(doc))
    output = folder / ('output.zip' if fmt == 'png_sequence' else 'output.mp4')
    env = os.environ.copy()
    env['NT_TEST_EXPORT_YUV'] = str(folder / 'unencoded.yuv') if fmt == 'mp4' else ''
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
    pixels = command(['ffmpeg', '-v', 'error', '-i', str(source), '-frames:v', '1',
                      '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'])
    (folder / 'decoded.rgba').write_bytes(pixels)
    assert len(pixels) == width * height * 4
    assert all(a == 255 for a in pixels[3::4])
    center = [pixels[(y * width + x) * 4 + c]
              for y in range(height // 2 - 8, height // 2 + 8)
              for x in range(width // 2 - 8, width // 2 + 8) for c in range(3)]
    return center, (width, height)


inverse = [{'id': 'compress', 'type': 'levels', 'enabled': True, 'outWhite': 0.1},
           {'id': 'expand', 'type': 'levels', 'enabled': True, 'inWhite': 0.1}]
metrics = {}
failures = []
for fmt in ('png_sequence', 'mp4'):
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
        assert errors[1] < errors[0], (fmt, geometry, errors)
    for fp16 in (False, True):
        export(f'cancel-{fmt}-{fp16}', fp16, fmt, [], cancel=True)
    for opacity in (1, 0.001):
        a, _ = export(f'identity-{fmt}-{opacity}-8', False, fmt, [], opacity=opacity)
        b, _ = export(f'identity-{fmt}-{opacity}-16', True, fmt, [], opacity=opacity)
        a = (root / f'identity-{fmt}-{opacity}-8' / 'decoded.rgba').read_bytes()
        b = (root / f'identity-{fmt}-{opacity}-16' / 'decoded.rgba').read_bytes()
        delta = max(abs(x-y) for x, y in zip(a, b))
        if delta > (1 if fmt == 'png_sequence' else 4):
            failures.append((fmt, opacity, delta))
        metrics[f'identity-{fmt}-{opacity}'] = {'max_code_delta': delta}
(root / 'metrics.json').write_text(json.dumps(metrics, indent=2))
print(json.dumps(metrics, indent=2), flush=True)
assert not failures, f"Identity edge agreement failed: {failures}"
