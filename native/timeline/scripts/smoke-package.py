#!/usr/bin/env python3
"""Smoke a relocated package, or use --binary for local build verification.

Requires ffmpeg on the caller's PATH for fixture generation and pixel inspection.
The application runs with a separate environment that excludes development SDKs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, timeout=180,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs).stdout


def check_image(path, ffmpeg):
    if not path.is_file() or not path.stat().st_size:
        raise ValueError(f"missing or empty still: {path}")
    pixels = run([ffmpeg, '-v', 'error', '-i', path, '-f', 'rawvideo',
                  '-pix_fmt', 'rgba', '-frames:v', '1', '-'])
    # Reject black, white, transparent and other uniform frames.
    colors = {tuple(pixels[i:i + 3]) for i in range(0, len(pixels), 4)
              if pixels[i + 3] > 0}
    if len(colors) < 16:
        raise ValueError(f"blank still: {path} ({len(colors)} colors)")


def check_package(root):
    files = [p for p in root.rglob('*') if p.is_file()]
    for version in ('2.1', '3'):
        texts = [p for p in files if 'LGPL' in p.name and version in p.name]
        if not any('GNU LESSER GENERAL PUBLIC LICENSE' in p.read_text(errors='replace')
                   and p.stat().st_size > 4000 for p in texts):
            raise ValueError(f"missing full LGPL {version} notice")
    for library in ('avcodec', 'avformat', 'avutil', 'swscale', 'swresample'):
        libs = [p for p in files if re.match(rf'(lib)?{library}[-.]', p.name)
                and ('.so' in p.name or p.suffix in ('.dll', '.dylib'))]
        if not libs:
            raise ValueError(f"missing packaged {library}")
        for lib in libs:
            data = lib.read_bytes()
            if b'--enable-gpl' in data or b'--enable-nonfree' in data:
                raise ValueError(f"GPL/nonfree FFmpeg in package: {lib}")
            if b'LGPL' not in data:
                raise ValueError(f"no LGPL license in packaged library: {lib}")
            if sys.platform == 'win32':
                source = Path(os.environ['FFMPEG_LGPL_BIN']) / lib.name
                if hashlib.sha256(data).digest() != hashlib.sha256(source.read_bytes()).digest():
                    raise ValueError(f"DLL differs from checksum-verified LGPL archive: {lib}")
    for lib in files:
        if lib.suffix in ('.dll', '.dylib') or '.so' in lib.name:
            data = lib.read_bytes()
            if b'--enable-gpl' in data or b'--enable-nonfree' in data:
                raise ValueError(f'GPL/nonfree library in package: {lib}')
    if any(p.name.lower() in ('ffmpeg', 'ffmpeg.exe') for p in files):
        raise ValueError('FFmpeg CLI must not ship in this package')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', nargs='?', type=Path)
    parser.add_argument('--package', type=Path)
    parser.add_argument('--binary', action='store_true')
    parser.add_argument('--version')
    parser.add_argument('--check-image', type=Path)
    args = parser.parse_args()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise ValueError('ffmpeg required for fixture generation and image inspection')
    if args.check_image:
        check_image(args.check_image, ffmpeg)
        return
    if not args.executable or not args.version or not (args.package or args.binary):
        parser.error('executable, --version and --package (or --binary) required')
    exe = args.executable.absolute()
    if args.package:
        check_package(args.package.resolve())
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(('QT_', 'QML_', 'QML2_', 'DYLD_', 'LD_LIBRARY_PATH')):
            env.pop(key)
    if sys.platform == 'win32':
        env['PATH'] = os.pathsep.join([os.environ['SystemRoot'], str(Path(os.environ['SystemRoot']) / 'System32')])
        env.update(QSG_RHI_BACKEND='d3d11', QSG_RHI_PREFER_SOFTWARE_RENDERER='1')
    else:
        env['PATH'] = '/usr/bin:/bin:/usr/sbin:/sbin'
        if sys.platform == 'linux':
            env.update(QT_QPA_PLATFORM='xcb', QSG_RHI_BACKEND='vulkan')
    with tempfile.TemporaryDirectory(prefix='timeline-smoke-') as directory:
        work = Path(directory)
        version = run([exe, '--version'], env=env, cwd=work).decode().strip()
        if version != f'nodetool-timeline {args.version}':
            raise ValueError(f'wrong version: {version!r}, expected {args.version}')
        print(version)
        run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30',
             '-t', '1', '-c:v', 'mpeg4', work / 'fixture.mp4'])
        template = Path(__file__).resolve().parents[1] / 'fixtures/video-cuts.json'
        doc = json.loads(template.read_text())
        doc.update(width=320, height=180, durationMs=1000)
        doc['clips'] = doc['clips'][:1]
        doc['clips'][0].update(width=320, height=180, durationMs=1000, mediaPath=str(work / 'fixture.mp4'))
        fixture = work / 'fixture.json'
        fixture.write_text(json.dumps(doc))
        run([exe, fixture, '--stills', work / 'stills', '--still-frames', '0', '--audio', 'none'], env=env, cwd=work)
        check_image(work / 'stills/frame_000000.png', ffmpeg)
        print('PASS: version and nonblank decoded still' +
              (' with packaged FFmpeg license checks' if args.package else ' (build binary only)'))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr.decode(errors='replace'), file=sys.stderr)
        sys.exit(1)
