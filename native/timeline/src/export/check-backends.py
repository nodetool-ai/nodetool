"""Exercise both native CLI routes and require their actual QRhi diagnostics.

Run in the native render suite's platform environment. Also measure Qt's default
with QSG_RHI_BACKEND removed, so CI's explicit backend cannot hide a live route.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def check_backend(log, expected):
    reports = re.findall(r'native-render-backend (\S+) adapter (.+)', log)
    assert reports, f'No actual backend/adapter report:\n{log}'
    for backend, adapter in reports:
        assert backend == expected, (expected, backend, adapter)
    print(f'qualified backend {expected}: {reports}', flush=True)


def run_routes(binary, folder, env, expected):
    source = folder / 'scene.json'
    source.write_text(json.dumps({
        'width': 32, 'height': 16, 'fps': 1, 'durationMs': 1000,
        'tracks': [{'id': 'v', 'type': 'video', 'visible': True}],
        'clips': [{'id': 'c', 'trackId': 'v', 'mediaType': 'shape',
                   'startMs': 0, 'durationMs': 1000, 'width': 32, 'height': 16,
                   'shapeStyle': {'kind': 'rect', 'fill': '#7392ba'}}]}))
    # Always keep configuration isolated. The caller owns the platform/display.
    env = dict(env, XDG_CONFIG_HOME=str(folder / 'config'))
    run = subprocess.run([binary, str(source), '--export', str(folder / 'frame.zip'),
                          '--format', 'png_sequence'], env=env, capture_output=True,
                         text=True, timeout=60)
    assert run.returncode == 0, run.stderr
    print('export', flush=True)
    check_backend(run.stderr, expected)
    with (folder / 'server.log').open('w+') as log:
        process = subprocess.Popen([binary, '--frame-server'], env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=log, text=True)
        try:
            request = {'id': 1, 'kind': 'sequence', 'snapshot': str(source),
                       'timeMs': 0, 'dir': str(folder)}
            process.stdin.write(json.dumps(request) + '\n')
            process.stdin.flush()
            # Keep stdin open until the reply. EOF is cancellation in this protocol.
            # The outer CTest timeout bounds a helper that never replies.
            response = json.loads(process.stdout.readline())
            assert 'error' not in response and 'file' in response, response
            assert Path(response['file']).stat().st_size == 32 * 16 * 4, response
            process.stdin.close()
            assert process.wait(timeout=10) == 0
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        log.seek(0)
        print('frame-server', flush=True)
        check_backend(log.read(), expected)


def main():
    binary = str(Path(sys.argv[1]).resolve())
    default = {'linux': 'OpenGL', 'darwin': 'Metal', 'win32': 'D3D11'}[sys.platform]
    names = {'opengl': 'OpenGL', 'vulkan': 'Vulkan', 'metal': 'Metal', 'd3d11': 'D3D11'}
    env = os.environ.copy()
    env.pop('NT_TEST_EXPORT_FP16', None)
    env.pop('QT_QUICK_BACKEND', None)
    selected = env.get('QSG_RHI_BACKEND')
    qualified = {'linux': {'opengl', 'vulkan'}, 'darwin': {'metal'}, 'win32': {'d3d11'}}
    assert selected is None or selected in qualified[sys.platform], ('Unqualified backend', selected)
    expected = names[selected] if selected else default
    with tempfile.TemporaryDirectory(prefix='nt-backends-') as temporary:
        root = Path(temporary)
        for name, backend in [('selected', expected), ('default', default)]:
            folder = root / name
            folder.mkdir()
            if name == 'default':
                env.pop('QSG_RHI_BACKEND', None)
            print(name, flush=True)
            run_routes(binary, folder, env, backend)


if __name__ == '__main__':
    main()
