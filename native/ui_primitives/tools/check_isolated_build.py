#!/usr/bin/env python3
"""Build copied native sources with no web tree, npm packages or Node tools."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[3]
NATIVE_SOURCES = ('ui_primitives', 'chat', 'model-picker')
BLOCKED_TOOLS = ('node', 'nodejs', 'npm', 'npx', 'yarn', 'pnpm')
POSIX_TOOLS = (
    'cmake', 'ctest', 'ninja', 'c++', 'g++', 'gcc', 'cc', 'clang', 'clang++',
    'ar', 'ranlib', 'ld', 'as', 'strip', 'objdump', 'dsymutil', 'xcrun', 'codesign',
    'install_name_tool', 'otool', 'xcode-select', 'lipo', 'ditto', 'xattr',
    'file', 'uname', 'sw_vers', 'xcodebuild', 'make', 'sh', 'bash',
    'env', 'python3', 'python', 'pkg-config', 'sed', 'grep', 'awk', 'tr', 'head',
    'cat', 'echo', 'readlink', 'dirname', 'which', 'rm', 'mkdir', 'cp', 'mv',
    'touch', 'stat', 'ln', 'chmod', 'sort', 'cut', 'find', 'tee', 'xargs')


def restricted_environment(work, qt_prefix):
    env = os.environ.copy()
    for name in ('QML_IMPORT_PATH', 'QML2_IMPORT_PATH', 'NODE_PATH', 'CMAKE_PREFIX_PATH',
                 'CMAKE_PROJECT_INCLUDE', 'CMAKE_PROJECT_TOP_LEVEL_INCLUDES'):
        env.pop(name, None)
    if os.name == 'nt':
        # Preserve the SDK and MSVC environment, dropping any directory that
        # exposes a JavaScript tool. No compiler wrapper or package install runs.
        paths = [p for p in env.get('PATH', '').split(os.pathsep)
                 if p and not any(shutil.which(tool, path=p) for tool in BLOCKED_TOOLS)]
    else:
        tool_dir = work / 'tools'
        tool_dir.mkdir()
        for name in POSIX_TOOLS:
            source = shutil.which(name)
            if source:
                (tool_dir / name).symlink_to(Path(source).resolve())
        paths = [str(tool_dir)]
    paths.insert(0, str(qt_prefix / 'bin'))
    env['PATH'] = os.pathsep.join(paths)
    env['QT_QPA_PLATFORM'] = 'offscreen'
    env['QT_QUICK_BACKEND'] = 'software'
    for name in BLOCKED_TOOLS:
        if shutil.which(name, path=env['PATH']):
            raise RuntimeError('{} remains available on isolated PATH'.format(name))
    for name in ('cmake', 'ctest', 'ninja'):
        if not shutil.which(name, path=env['PATH']):
            raise RuntimeError('Required isolated build tool is missing: {}'.format(name))
    return env


def copy_native_sources(destination, names):
    for name in names:
        shutil.copytree(REPO / 'native' / name, destination / 'native' / name,
                        ignore=shutil.ignore_patterns('build', 'build-*', '.git',
                                                     '__pycache__', 'node_modules', '*.pyc'))
    for forbidden in ('web', 'node_modules', 'packages', 'native/timeline'):
        if (destination / forbidden).exists():
            raise RuntimeError('Unexpected source in isolated tree: {}'.format(forbidden))


def run(command, env, cwd, log):
    print('+ {}'.format(' '.join(str(arg) for arg in command)), flush=True)
    with log.open('w', encoding='utf-8') as output:
        result = subprocess.run([str(arg) for arg in command], env=env, cwd=cwd,
                                stdout=output, stderr=subprocess.STDOUT, timeout=1800)
    if result.returncode:
        print(log.read_text(encoding='utf-8', errors='replace')[-16000:], file=sys.stderr)
        raise RuntimeError('{} failed with exit {}. Log: {}'.format(command[0], result.returncode, log))


def audit_staged_module(stage):
    tool = Path(__file__).with_name('check_dependencies.py')
    spec = importlib.util.spec_from_file_location('native_dependency_audit', tool)
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    files, errors = audit.audit_module(stage / 'native/ui_primitives')
    if errors or not files:
        raise RuntimeError('Staged native dependency audit failed: ' + '\n'.join(errors))


def sdk_metatype_sources(qt_prefix):
    suffix = '.exe' if os.name == 'nt' else ''
    qtpaths = next((qt_prefix / 'bin' / (name + suffix) for name in ('qtpaths', 'qtpaths6')
                    if (qt_prefix / 'bin' / (name + suffix)).is_file()), None)
    if qtpaths is None:
        raise RuntimeError('Qt SDK has no qtpaths tool for metadata provenance')
    archdata = Path(subprocess.check_output([str(qtpaths), '--query', 'QT_INSTALL_ARCHDATA'],
                                             text=True, timeout=30).strip())
    sdk_locations = {path.resolve() for path in (qt_prefix, qt_prefix / 'share/qt', qt_prefix / 'lib')
                     if path.is_dir()}
    if not archdata.is_absolute() or not archdata.is_dir() or archdata.resolve() not in sdk_locations:
        raise RuntimeError('Qt archdata is not declared by the supplied SDK: {}'.format(archdata))
    directories = [archdata / 'metatypes', qt_prefix / 'lib/metatypes']
    if archdata.resolve() == qt_prefix.resolve():
        directories.append(qt_prefix / 'share/qt/metatypes')
    return {path.resolve() for directory in directories for path in directory.glob('qt6*_metatypes.json')
            if path.is_file()}


def validate_configured_inputs(stage, build, qt_prefix=None):
    """Check CMake's resolved sources and RCC inputs before compiling them."""
    reply = build / '.cmake/api/v1/reply'
    models = list(reply.glob('codemodel-v2-*.json'))
    if not models:
        raise RuntimeError('CMake produced no source ownership model')
    model = json.loads(max(models, key=lambda path: path.stat().st_mtime_ns).read_text())
    source_root = Path(model['paths']['source'])
    sdk_metatypes = sdk_metatype_sources(qt_prefix) if qt_prefix is not None else set()

    def owned(path, sdk_metadata=False):
        # Qt's QML registration target consumes SDK metatype descriptions.
        # These are SDK metadata, not application source or resource inputs.
        if sdk_metadata and path.resolve() in sdk_metatypes:
            return
        try:
            path.resolve().relative_to(stage.resolve())
        except ValueError:
            raise RuntimeError('Configured input escapes isolated native tree: {}'.format(path))

    inspected = 0
    for configuration in model['configurations']:
        for target in configuration['targets']:
            data = json.loads((reply / target['jsonFile']).read_text())
            for source in data.get('sources', []):
                path = Path(source['path'])
                owned(path if path.is_absolute() else source_root / path, sdk_metadata=True)
                inspected += 1
    for qrc in build.rglob('*.qrc'):
        for resource in ET.parse(qrc).iter('file'):
            path = Path(resource.text or '')
            owned(path if path.is_absolute() else qrc.parent / path)
            inspected += 1
    if not inspected:
        raise RuntimeError('No configured native source/resource inputs inspected')
    print('Validated {} resolved native source/resource inputs'.format(inspected), flush=True)


def assert_clean_runtime_log(log):
    text = log.read_text(encoding='utf-8', errors='replace')
    if re.search(r'TypeError:|ReferenceError:|Binding loop detected|Unable to assign|'
                 r'Cannot assign|module .+ is not installed|'
                 r'current style does not support customization|'
                 r'QQmlApplicationEngine failed', text):
        raise RuntimeError('Installed host emitted a QML error. Log: {}'.format(log))


def platform_plugin_directory(qt_prefix, env):
    suffix = '.exe' if os.name == 'nt' else ''
    for name in ('qtpaths', 'qtpaths6'):
        tool = qt_prefix / 'bin' / (name + suffix)
        if tool.is_file():
            output = subprocess.check_output([str(tool), '--query', 'QT_INSTALL_PLUGINS'],
                                             env=env, text=True, timeout=30).strip()
            path = Path(output) / 'platforms'
            if path.is_dir():
                return path
    raise RuntimeError('Qt SDK has no discoverable platform plugin directory')


def verify_stage(work, name, sources, source_dir, qt_prefix, env, parallel):
    stage = work / name
    stage.mkdir()
    copy_native_sources(stage, sources)
    audit_staged_module(stage)
    build = stage / 'build'
    query = build / '.cmake/api/v1/query'
    query.mkdir(parents=True)
    (query / 'codemodel-v2').touch()
    run(['cmake', '-S', stage / source_dir, '-B', build, '-G', 'Ninja',
         '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTING=ON',
         '-DCMAKE_PREFIX_PATH={}'.format(qt_prefix)], env, stage, stage / 'configure.log')
    validate_configured_inputs(stage, build, qt_prefix)
    run(['cmake', '--build', build, '--parallel', parallel], env, stage, stage / 'build.log')
    if name == 'module':
        run(['cmake', '--build', build, '--target', 'nodetool_ui_primitives_qmllint'],
            env, stage, stage / 'qmllint.log')
    run(['ctest', '--test-dir', build, '--output-on-failure'], env, stage, stage / 'tests.log')
    if name == 'chat':
        install = stage / 'install'
        run(['cmake', '--install', build, '--prefix', install], env, stage, stage / 'install.log')
        if sys.platform == 'darwin':
            executable = install / 'nodetool-chat.app/Contents/MacOS/nodetool-chat'
        else:
            executable = install / 'bin' / ('nodetool-chat.exe' if os.name == 'nt' else 'nodetool-chat')
        screenshot = stage / 'installed-chat.png'
        smoke_env = env.copy()
        # Deployment ships the operating system's window backend. The SDK's
        # headless backend is a test fixture, while QML comes from the bundle.
        smoke_env['QT_QPA_PLATFORM_PLUGIN_PATH'] = str(platform_plugin_directory(qt_prefix, env))
        if sys.platform == 'darwin':
            # Homebrew platform plugins name absolute SDK frameworks. Resolve
            # those names to the bundled copies to avoid loading Qt twice.
            smoke_env['DYLD_FRAMEWORK_PATH'] = str(install / 'nodetool-chat.app/Contents/Frameworks')
        run([executable, '--screenshot', screenshot], smoke_env, stage, stage / 'installed-smoke.log')
        assert_clean_runtime_log(stage / 'installed-smoke.log')
        if not screenshot.is_file() or screenshot.stat().st_size == 0:
            raise RuntimeError('Installed chat host produced no screenshot')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qt-prefix', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--parallel', default='2')
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    qt_prefix = args.qt_prefix.resolve()
    if not (qt_prefix / 'bin').is_dir():
        parser.error('--qt-prefix must contain bin/')
    work = args.work_dir.resolve() if args.work_dir else Path(tempfile.mkdtemp(prefix='nodetool-native-isolation-')).resolve()
    if args.work_dir:
        work.mkdir(parents=True, exist_ok=False)
    success = False
    try:
        env = restricted_environment(work, qt_prefix)
        verify_stage(work, 'module', ('ui_primitives',), 'native/ui_primitives', qt_prefix, env, args.parallel)
        verify_stage(work, 'chat', NATIVE_SOURCES, 'native/chat', qt_prefix, env, args.parallel)
        success = True
        print('Isolated native module/gallery and chat/model-picker builds and tests passed.')
        return 0
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(error, file=sys.stderr)
        print('Isolation evidence retained at {}'.format(work), file=sys.stderr)
        return 1
    finally:
        if success and not args.keep and not args.work_dir:
            shutil.rmtree(work)
        elif success:
            print('Isolation evidence retained at {}'.format(work))


if __name__ == '__main__':
    sys.exit(main())
