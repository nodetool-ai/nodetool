"""Real QRhi sky/PMREM samples against retained actual Three references."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile

binary = pathlib.Path(sys.argv[1]).resolve()
fixtures = pathlib.Path(__file__).with_name('fixtures') / 'sky3d'
provenance = json.loads((fixtures / 'provenance.json').read_text())
assert len(provenance['fixtureSha256']) == 4
for name, expected in provenance['fixtureSha256'].items():
    assert hashlib.sha256((fixtures / name).read_bytes()).hexdigest() == expected, name
with tempfile.TemporaryDirectory(prefix='native-sky-matrix-', dir=os.environ.get('TMPDIR')) as temporary:
    root = pathlib.Path(temporary)
    for case in ('day', 'night'):
        for backend in ('gl', 'vulkan'):
            output = root / (case + '-' + backend)
            command = [str(binary), 'embedded', backend, str(output), str(fixtures / (case + '-settings.json'))]
            if not os.environ.get('DISPLAY'):
                command = ['xvfb-run', '-a', *command]
            result = subprocess.run(command, env={**os.environ, 'QT_QPA_PLATFORM': 'xcb',
                'QT_XCB_GL_INTEGRATION': 'xcb_egl', 'LIBGL_ALWAYS_SOFTWARE': '1'},
                capture_output=True, text=True, timeout=120)
            assert result.returncode == 0, (case, backend, result.stdout, result.stderr)
            comparison = subprocess.run([str(binary), '--compare', str(output / (backend + '-sky.json')),
                str(fixtures / (case + '-reference.json'))], capture_output=True, text=True, timeout=20)
            assert comparison.returncode == 0, (case, backend, comparison.stdout, comparison.stderr)
            report = json.loads(comparison.stdout)
            assert report['samples'] == 63 and report['channels'] == 189, report
print('GL/Vulkan day/night PMREM references, finite atlas, cache/reset and wrong-value controls pass')
