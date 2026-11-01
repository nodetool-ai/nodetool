#!/usr/bin/env python3
"""Capture offscreen gallery frames; compare per-platform reference pixels."""
import argparse
import json
import math
import os
import platform
from pathlib import Path
import subprocess
import sys

module = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--build', type=Path, required=True)
parser.add_argument('--scales', default='1,1.25,1.5,2')
parser.add_argument('--ui-scales', default='0.75,1,1.5,2')
parser.add_argument('--text-scales', default='1,1.5,2')
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
build = args.build.resolve()
executable = build / ('ui_gallery.exe' if os.name == 'nt' else 'ui_gallery')
output = build / 'gallery-captures'
output.mkdir(parents=True, exist_ok=True)
references = module / 'tests/visual/gallery' / (sys.platform + '-' + platform.machine())
failures = []
count = 0
compared = 0
selected = set()
environment = dict(platform=sys.platform, machine=platform.machine(),
                   os_version=platform.mac_ver()[0] if sys.platform == 'darwin' else platform.release(),
                   qpa='offscreen', backend='software')
if args.verify:
    manifest_path = references / 'manifest.json'
    if not manifest_path.is_file():
        parser.error('reviewed reference manifest missing for ' + sys.platform + '-' + platform.machine())
    manifest = json.loads(manifest_path.read_text())
    version = subprocess.run([str(executable), '--qt-version'], env={**os.environ, 'QT_QPA_PLATFORM': 'offscreen'},
                             capture_output=True, text=True, check=True).stdout.strip()
    environment['qt_version'] = version
    if manifest['environment'] != environment:
        parser.error('reference render environment differs: expected ' + repr(manifest['environment']) + ', actual ' + repr(environment))
    cases = manifest['cases']
    if not cases or len(cases) != len(set(cases)):
        parser.error('reference manifest must contain distinct reviewed cases')
    selected = set(cases)
captured = set()
for scheme in ('dark', 'light'):
    for scale in args.scales.split(','):
        for ui_scale in args.ui_scales.split(','):
            for text_scale in args.text_scales.split(','):
                if any(not math.isfinite(float(value)) or float(value) <= 0 for value in (scale, ui_scale, text_scale)):
                    parser.error('scales must be positive')
                for scenario, extra in (('standard', []), ('narrow-rtl', ['--width', '320', '--rtl'])):
                    name = '{}-{}-dpr{}-ui{}-text{}.png'.format(scheme, scenario, scale, ui_scale, text_scale)
                    path = output / name
                    env = os.environ.copy()
                    env.update(QT_QPA_PLATFORM='offscreen', QT_QUICK_BACKEND='software', QT_SCALE_FACTOR=scale)
                    result = subprocess.run([str(executable), '--screenshot', str(path), '--scheme', scheme,
                                             '--text-scale', text_scale, '--ui-scale', ui_scale] + extra, env=env, capture_output=True, text=True)
                    count += 1
                    captured.add(name)
                    if result.returncode or not path.is_file() or not path.stat().st_size:
                        failures.append('{}: capture failed: {}'.format(name, result.stderr.strip()))
                        continue
                    if name in selected:
                        reference = references / name
                        if not reference.is_file():
                            failures.append('{}: reference missing'.format(name))
                        else:
                            compared += 1
                            if subprocess.run([str(executable), '--compare-expected', str(reference), '--compare-actual', str(path)], env=env).returncode:
                                failures.append('{}: differs from reference beyond tolerance'.format(name))
for name in sorted(selected - captured):
    failures.append('{}: selected case was not captured'.format(name))
print('Captured {} frames into {}; compared {} reviewed references in {}'.format(count, output, compared, references))
for failure in failures:
    print(failure, file=sys.stderr)
sys.exit(bool(failures))
