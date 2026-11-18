#!/usr/bin/env python3
"""Exercise the shipped smoke validator with actual good, blank and missing PNGs."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('smoke-package.py')
spec = importlib.util.spec_from_file_location('smoke_package', SCRIPT)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTest(unittest.TestCase):
    def test_real_image_outputs(self):
        ffmpeg = shutil.which('ffmpeg')
        self.assertIsNotNone(ffmpeg, 'ffmpeg required, do not skip smoke validation')
        with tempfile.TemporaryDirectory(prefix='timeline-smoke-test-') as directory:
            root = Path(directory)
            for name, source in [('good', 'testsrc2=size=64x64'), ('blank', 'color=black:size=64x64')]:
                subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', source,
                                '-frames:v', '1', str(root / f'{name}.png')], check=True)
            smoke.check_image(root / 'good.png', ffmpeg)
            for name, message in [('blank', 'blank still'), ('missing', 'missing or empty still')]:
                result = subprocess.run(['python3', str(SCRIPT), '--check-image', str(root / f'{name}.png')],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn(message, result.stderr)
                print(result.stderr.strip())

    def test_release_version(self):
        script = str(SCRIPT.with_name('release-version.py'))
        result = subprocess.run(['python3', script, 'timeline-v1.0.0'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Expected a release version', result.stderr)
        result = subprocess.run(['python3', script, 'v1.2.3-nightly.20261113.7'],
                                capture_output=True, text=True, check=True)
        lines = result.stdout.splitlines()
        self.assertEqual(lines[0], 'version=1.2.3-nightly.20261113.7')
        self.assertRegex(lines[1], r'^app_version=\d+\.\d+\.\d+$')

if __name__ == '__main__':
    unittest.main()
