#!/usr/bin/env python3
"""Check native presentation dependencies without reading web sources."""
import argparse
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

MODULE = Path(__file__).resolve().parents[1]
SOURCE_SUFFIXES = {'.qml', '.cpp', '.h', '.hpp', '.cmake', '.qrc'}
ALLOWED_QT = {'Core', 'Gui', 'Qml', 'Quick', 'QuickControls2', 'Svg', 'Test', 'QuickTest'}
FORBIDDEN = re.compile(
    r'NodeTool\.(?:Timeline|Chat|ModelPicker)|'
    r'\b(?:FFmpeg|FFMPEG|GuiPrivate|QRhi|node_modules)\b|'
    r'(?:^|[\s/"\'])web/|'
    r'(?:\.\./)+(?:timeline|chat|model-picker|web|packages)(?:[/\s"\']|$)|'
    r'\b(?:npm|npx|yarn|pnpm)\s+(?:run|install|exec|build)\b', re.MULTILINE)
ARGUMENTS = re.compile(r'#[^\n]*|"(?:\\.|[^"\\])*"|[()]|[^\s()"]+')


def cmake_calls(text):
    tokens = [token for token in ARGUMENTS.findall(text) if not token.startswith('#')]
    index = 0
    while index + 1 < len(tokens):
        if not re.fullmatch(r'[A-Za-z_]\w*', tokens[index]) or tokens[index + 1] != '(':
            index += 1
            continue
        name = tokens[index].lower()
        depth = 1
        cursor = index + 2
        arguments = []
        while cursor < len(tokens) and depth:
            token = tokens[cursor]
            if token == '(':
                depth += 1
            elif token == ')':
                depth -= 1
            if depth:
                arguments.append(token[1:-1] if token.startswith('"') else token)
            cursor += 1
        if depth:
            raise ValueError('Unclosed CMake command')
        yield name, arguments
        index = cursor


def cmake_path_errors(text, path, module):
    errors = []
    variables = {
        'CMAKE_CURRENT_SOURCE_DIR': str(path.parent),
        'CMAKE_CURRENT_LIST_DIR': str(path.parent),
        'PROJECT_SOURCE_DIR': str(module),
        'CMAKE_CURRENT_BINARY_DIR': str(module / '__native_build__')}

    def expand(value):
        for _ in range(8):
            updated = re.sub(r'\$\{([^}]+)\}', lambda match: variables.get(match.group(1), match.group()), value)
            if updated == value:
                return value
            value = updated
        return value

    def check(value):
        value = expand(value)
        if '$ENV{' in value or '$<' in value:
            errors.append('opaque CMake input path ' + value)
            return
        # Template suffixes such as the caller's CMake target name are safe
        # only after an owned source/build prefix. Opaque whole paths fail.
        if '${' in value:
            unknown = re.findall(r'\$\{([^}]+)\}', value)
            if value.startswith(str(module / '__native_build__') + '/') and set(unknown) <= {'target'}:
                value = re.sub(r'\$\{[^}]+\}', '__template__', value)
            else:
                errors.append('unresolved CMake input path ' + value)
                return
        for item in value.split(';'):
            candidate = Path(item)
            if not candidate.is_absolute():
                candidate = path.parent / candidate
            try:
                candidate.resolve().relative_to(module)
            except ValueError:
                errors.append('CMake path escapes module ' + item)

    sections = {'QML_FILES', 'SOURCES', 'RESOURCES', 'FILES'}
    stops = sections | {'URI', 'VERSION', 'CLASS_NAME', 'RESOURCE_PREFIX', 'OUTPUT_DIRECTORY',
                        'OUTPUT_TARGETS', 'PREFIX', 'BASE', 'LANG', 'IMPORTS', 'DEPENDENCIES',
                        'PUBLIC', 'PRIVATE', 'INTERFACE', 'PROPERTIES'}
    for command, args in cmake_calls(text):
        if not args:
            continue
        if command == 'set' and len(args) > 1:
            variables[args[0]] = ';'.join(expand(value) for value in args[1:])
        if command == 'file' and args[0] in {'GLOB', 'GLOB_RECURSE'} and len(args) > 2:
            patterns = [arg for arg in args[2:] if arg not in {'CONFIGURE_DEPENDS', 'LIST_DIRECTORIES', 'true', 'false'}]
            for pattern in patterns:
                check(pattern)
            variables[args[1]] = ';'.join(expand(pattern) for pattern in patterns)
        if command in {'include', 'add_subdirectory'}:
            if command != 'include' or args[0] not in {'CTest', 'GNUInstallDirs', 'CMakePackageConfigHelpers'}:
                check(args[0])
        if command == 'configure_file':
            for value in args[:2]:
                check(value)
        if command == 'file' and args[0] in {'READ', 'STRINGS', 'SIZE', 'TIMESTAMP', 'SHA256', 'MD5', 'WRITE', 'APPEND', 'COPY_FILE'} and len(args) > 1:
            check(args[1])
        if command == 'file' and args[0] in {'GENERATE', 'COPY', 'INSTALL'}:
            active = args[0] in {'COPY', 'INSTALL'}
            for index, arg in enumerate(args[1:], 1):
                if arg in {'INPUT', 'FILES', 'DESTINATION', 'OUTPUT'}:
                    active = True
                elif arg in {'CONTENT', 'CONDITION', 'PERMISSIONS', 'TYPE', 'FILE_PERMISSIONS', 'DIRECTORY_PERMISSIONS'}:
                    active = False
                elif active:
                    check(arg)
        if command == 'file' and args[0] in {'DOWNLOAD', 'UPLOAD'}:
            errors.append('module resources must be vendored, not transferred during configuration')
        if command in {'qt_add_resources', 'qt_add_qml_module'}:
            active = False
            for index, arg in enumerate(args):
                if arg in sections:
                    active = True
                elif arg in stops:
                    active = False
                    if arg == 'BASE' and index + 1 < len(args):
                        check(args[index + 1])
                elif active:
                    check(arg)
        if command in {'target_sources', 'target_include_directories', 'qt_add_executable'}:
            for arg in args[1:]:
                if arg not in {'PUBLIC', 'PRIVATE', 'INTERFACE', 'WIN32', 'MACOSX_BUNDLE', 'MANUAL_FINALIZATION'}:
                    check(arg)
    return errors


def source_files(module):
    result = []
    for path in module.rglob('*'):
        relative = path.relative_to(module)
        if any(part in {'.git', '__pycache__', 'tools'} for part in relative.parts):
            continue
        if any((parent / 'CMakeCache.txt').is_file() for parent in path.parents if parent != module.parent):
            continue
        if path.is_file() and (path.suffix in SOURCE_SUFFIXES or path.name == 'CMakeLists.txt'):
            result.append(path)
    return sorted(result)


def audit_module(module):
    module = module.resolve()
    files = source_files(module)
    errors = []
    if not files:
        errors.append('No native module source files inspected')
    for path in module.rglob('*'):
        if path.is_symlink():
            try:
                path.resolve().relative_to(module)
            except ValueError:
                errors.append('{}: source or resource symlink escapes module'.format(path))
    for path in files:
        try:
            path.resolve().relative_to(module)
        except ValueError:
            continue
        text = path.read_text(encoding='utf-8')
        label = str(path.relative_to(module))
        for match in FORBIDDEN.finditer(text):
            errors.append('{}: forbidden dependency {}'.format(label, match.group().strip()))
        if path.suffix == '.qml':
            for imported in re.findall(r'^\s*import\s+([^\s;]+)', text, re.MULTILINE):
                if not (imported == 'NodeTool.UiPrimitives' or imported.split('.')[0] in {'QtQuick', 'QtQml', 'QtTest'}):
                    errors.append('{}: external QML import {}'.format(label, imported))
        if path.suffix in {'.cpp', '.h', '.hpp'}:
            for include in re.findall(r'^\s*#include\s+"([^"]+)"', text, re.MULTILINE):
                try:
                    (path.parent / include).resolve().relative_to(module)
                except ValueError:
                    errors.append('{}: include escapes module {}'.format(label, include))
        if path.suffix == '.qrc':
            try:
                for resource in ET.fromstring(text).iter('file'):
                    resource_path = (path.parent / (resource.text or '')).resolve()
                    try:
                        resource_path.relative_to(module)
                    except ValueError:
                        errors.append('{}: resource escapes module {}'.format(label, resource.text))
            except ET.ParseError:
                errors.append('{}: malformed resource XML'.format(label))
        if path.suffix == '.cmake' or path.name == 'CMakeLists.txt':
            errors.extend('{}: {}'.format(label, error) for error in cmake_path_errors(text, path, module))
            for qt_target in re.findall(r'Qt6::([A-Za-z0-9_]+)', text):
                if qt_target not in ALLOWED_QT:
                    errors.append('{}: forbidden Qt dependency {}'.format(label, qt_target))
            for command in re.findall(r'\b(?:execute_process|add_custom_command|add_custom_target)\s*\(([^)]*)\)', text, re.DOTALL):
                if re.search(r'\b(?:node|npm|npx|yarn|pnpm)\b', command):
                    errors.append('{}: JavaScript build command'.format(label))
            for links in re.findall(r'\btarget_link_libraries\s*\(([^)]*)\)', text, re.DOTALL):
                for target in links.split()[1:]:
                    if target in {'PUBLIC', 'PRIVATE', 'INTERFACE'}:
                        continue
                    if target in {'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin'}:
                        continue
                    if target.startswith('Qt6::') and target[5:] in ALLOWED_QT:
                        continue
                    errors.append('{}: external link target {}'.format(label, target))
    return files, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--module-root', type=Path, default=MODULE)
    args = parser.parse_args()
    files, errors = audit_module(args.module_root)
    print('Inspected {} native module source files'.format(len(files)))
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
