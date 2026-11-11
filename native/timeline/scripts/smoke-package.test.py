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

    def test_version_mismatch(self):
        result = subprocess.run(['python3', str(SCRIPT.with_name('release-version.py')), 'timeline-v999.0.0'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('matching CMake PROJECT_VERSION', result.stderr)


if __name__ == '__main__':
    unittest.main()
