"""Production grazing samples and fixed-pose resource stability on both RHIs."""
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile

binary = pathlib.Path(sys.argv[1]).resolve()
fixtures = pathlib.Path(__file__).with_name('fixtures') / 'anisotropic3d'
metadata = json.loads((fixtures / 'native-reference.json').read_text())
assert len(metadata['sha256']) == 3
for name, digest in metadata['sha256'].items():
    assert hashlib.sha256((fixtures / name).read_bytes()).hexdigest() == digest, name
metrics_path = pathlib.Path(__file__).with_name('fixtures') / 'blacksite' / 'pixel-metrics.py'
spec = importlib.util.spec_from_file_location('native_pixel_metrics', metrics_path)
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)
width, height, reference = metrics.read_png(fixtures / 'legacy-reference.png')
assert (width, height) == (256, 256)
with tempfile.TemporaryDirectory(prefix='native-anisotropic-', dir=os.environ.get('TMPDIR')) as temporary:
    root = pathlib.Path(temporary)
    for backend in ('opengl', 'vulkan'):
        reports, images = [], []
        for frames in (0, 120):
            name = backend + '-' + str(frames)
            image, report = root / (name + '.png'), root / (name + '.json')
            command = [str(binary), str(fixtures / 'game.json'), '--assets-dir', str(fixtures),
                       '--capture', str(image), '--report', str(report), '--width', '256', '--height', '256',
                       '--benchmark-frames', str(frames)]
            if not os.environ.get('DISPLAY'):
                command = ['xvfb-run', '-a', *command]
            result = subprocess.run(command, env={**os.environ, 'QSG_RHI_BACKEND': backend,
                'QT_QPA_PLATFORM': 'xcb', 'QT_XCB_GL_INTEGRATION': 'xcb_egl', 'LIBGL_ALWAYS_SOFTWARE': '1'},
                capture_output=True, text=True, timeout=120)
            assert result.returncode == 0, (backend, frames, result.stdout, result.stderr)
            reports.append(json.loads(report.read_text()))
            rendered_width, rendered_height, pixels = metrics.read_png(image)
            assert (rendered_width, rendered_height) == (width, height)
            error = sum(abs(a - b) for a, b in zip(pixels, reference)) / (len(reference) * 255)
            assert error <= metadata['meanAbsoluteTolerance'], (backend, 'actual legacy grazing error', error)
            images.append(pixels)
        assert images[0] == images[1], 'Committed-pose pixels drifted'
        for key in ('scenePipelineCount', 'sceneMeshCount', 'sceneImageTextureCount', 'meshBytes', 'imageGpuBytes', 'targetBytes'):
            assert reports[0][key] == reports[1][key], (backend, key)
        assert reports[0]['sky']['builds'] == reports[1]['sky']['builds']
print('GL/Vulkan grazing reference and120-frame pixel/resource stability pass')
