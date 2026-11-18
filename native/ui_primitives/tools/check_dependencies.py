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
FORBIDDEN_STORYBOARD = re.compile(
    r'NodeTool\.(?:Timeline|Chat)|'
    r'\b(?:FFmpeg|FFMPEG|GuiPrivate|QRhi|node_modules)\b|'
    r'(?:^|[\s/"\'])web/|'
    r'(?:\.\./)+(?:timeline|chat|web|packages)(?:[/\s"\']|$)|'
    r'\b(?:npm|npx|yarn|pnpm)\s+(?:run|install|exec|build)\b', re.MULTILINE)
# The Files package talks to the server itself, so it may use Qt Network, and
# neither host app may leak into it.
FORBIDDEN_FILES = re.compile(
    r'NodeTool\.(?:Timeline|Chat|ModelPicker|NodeEditor|Media)|'
    r'\b(?:FFmpeg|FFMPEG|GuiPrivate|QRhi|node_modules)\b|'
    r'(?:^|[\s/"\'])web/|'
    r'(?:\.\./)+(?:timeline|chat|model-picker|node-editor|media|web|packages)(?:[/\s"\']|$)|'
    r'\b(?:npm|npx|yarn|pnpm)\s+(?:run|install|exec|build)\b', re.MULTILINE)
# The timeline player decodes with FFmpeg and draws with QRhi, so those are
# allowed. The timeline app, the node editor and the web stay outside it.
FORBIDDEN_TIMELINE_PLAYER = re.compile(
    r'NodeTool\.(?:Timeline|Chat|ModelPicker|NodeEditor)\b|'
    r'\bnode_modules\b|'
    r'(?:^|[\s/"\'])web/|'
    r'(?:\.\./)+(?:timeline|chat|model-picker|node-editor|web|packages)(?:[/\s"\']|$)|'
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
        while name == 'cmake_language' and arguments[:1] == ['CALL'] and len(arguments) >= 2:
            if not re.fullmatch(r'[A-Za-z_]\w*', arguments[1]):
                break
            name, arguments = arguments[1].lower(), arguments[2:]
        yield name, arguments
        index = cursor


def module_policy(module):
    if module.name == 'media':
        return {
            'subdirs': {'../ui_primitives'},
            'qml_imports': {'NodeTool.UiPrimitives', 'NodeTool.Media'},
            'targets': {'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin', 'nodetool_media', 'nodetool_mediaplugin'},
            'forbidden': FORBIDDEN,
        }
    if module.name == 'files':
        return {
            'subdirs': {'../ui_primitives'},
            'qml_imports': {'NodeTool.UiPrimitives', 'NodeTool.Files'},
            'targets': {'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin', 'nodetool_files', 'nodetool_filesplugin'},
            'qt': {'Network'},
            'forbidden': FORBIDDEN_FILES,
        }
    if module.name == 'entities':
        return {
            'subdirs': {'../ui_primitives', '../media'},
            'qml_imports': {'NodeTool.UiPrimitives', 'NodeTool.Media', 'NodeTool.Entities'},
            'targets': {
                'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin',
                'nodetool_media', 'nodetool_mediaplugin',
                'nodetool_entities', 'nodetool_entitiesplugin',
            },
            'forbidden': FORBIDDEN,
        }
    if module.name == 'storyboard':
        return {
            'subdirs': {'../ui_primitives', '../media', '../model-picker'},
            'qml_imports': {'NodeTool.UiPrimitives', 'NodeTool.Media', 'NodeTool.ModelPicker', 'NodeTool.Storyboard'},
            'targets': {
                'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin',
                'nodetool_media', 'nodetool_mediaplugin',
                'nodetool_model_picker', 'nodetool_model_pickerplugin',
                'nodetool_storyboard', 'nodetool_storyboardplugin', 'nodetool_storyboard_markdown',
            },
            'forbidden': FORBIDDEN_STORYBOARD,
        }
    if module.name == 'timeline-player':
        return {
            'subdirs': {'../ui_primitives', '../kernels'},
            'include_paths': {('nodetool_timeline_player_server', '../account/qt/include')},
            'qml_imports': {'NodeTool.UiPrimitives', 'NodeTool.TimelinePlayer'},
            'targets': {
                'nodetool_timeline_scene', 'yogacore',
                'nodetool_timeline_decode', 'nodetool_timeline_audio', 'nodetool_timeline_hooks',
                'nodetool_timeline_player', 'nodetool_timeline_playerplugin', 'nodetool_timeline_player_server',
                'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin', 'nodetool_kernels',
                'nodetool_timeline_effects_registrar', 'nodetool_timeline_render2d_registrar',
                'nodetool_timeline_playback_registrar',
                'PkgConfig::FFMPEG', 'harfbuzz::harfbuzz', 'Freetype::Freetype',
            },
            # Values the hardware decode and audio link variables may hold.
            'platform_links': {
                '-framework CoreVideo', '-framework IOSurface', '-framework Metal', '-framework Foundation',
                'd3d11', 'dxgi', 'Vulkan::Vulkan', 'PkgConfig::LIBVA',
                '-framework CoreAudio', '-framework AudioToolbox', '-framework CoreFoundation',
                '${CMAKE_DL_LIBS}', 'Threads::Threads', 'm',
            },
            'qt': {'GuiPrivate', 'Network', 'ShaderTools'},
            'forbidden': FORBIDDEN_TIMELINE_PLAYER,
            # Upstream documentation URLs contain /web/ path segments.
            'vendored_sources': {'third_party/miniaudio.h'},
            # Yoga's upstream build file, vendored unchanged and never added.
            'unbuilt_cmake': {'third_party/yoga/yoga/CMakeLists.txt'},
        }
    return {
        'subdirs': set(),
        'qml_imports': {'NodeTool.UiPrimitives'},
        'targets': {'nodetool_ui_primitives', 'nodetool_ui_primitivesplugin'},
        'forbidden': FORBIDDEN,
    }


def cmake_path_errors(text, path, module, allowed_subdirs=(), allowed_include_paths=()):
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
            if command == 'add_subdirectory' and args[0] in allowed_subdirs:
                continue
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
                if command == 'target_include_directories' and (args[0], arg) in allowed_include_paths:
                    continue
                if arg not in {'PUBLIC', 'PRIVATE', 'INTERFACE', 'WIN32', 'MACOSX_BUNDLE', 'MANUAL_FINALIZATION'}:
                    check(arg)
    return errors


def cmake_link_errors(cmake_files, policy):
    variable_ref = re.compile(r'\$\{(\w+)\}')
    links = [(label, arg) for label, calls in cmake_files for command, args in calls
             if command == 'target_link_libraries' for argument in args[1:]
             for arg in argument.split(';') if arg not in {'PUBLIC', 'PRIVATE', 'INTERFACE'}]
    platform_links = policy.get('platform_links', set())
    variables = {match.group(1) for _, arg in links
                 if platform_links and (match := variable_ref.fullmatch(arg))}
    assigned = set()
    link_properties = {'LINK_LIBRARIES', 'INTERFACE_LINK_LIBRARIES', 'INTERFACE_LINK_LIBRARIES_DIRECT'}
    legacy_link_property = re.compile(r'(?:IMPORTED_)?LINK_INTERFACE_LIBRARIES(?:_.+)?')
    standard_libraries = re.compile(r'CMAKE_(?:C|CXX)_STANDARD_LIBRARIES(?:_INIT)?')
    errors = []
    # The audit visits every branch. A removal cannot make an earlier link
    # safe, so collect every value that can be introduced into a link list.
    for label, calls in cmake_files:
        initialized = set()
        scope_depth = 0
        for command, args in calls:
            if command in {'endif', 'endforeach', 'endwhile', 'endfunction', 'endmacro', 'endblock'}:
                scope_depth -= 1
            properties = []
            if command == 'set_property' and args[:1] == ['TARGET'] and 'PROPERTY' in args:
                properties = args[args.index('PROPERTY') + 1:][:1]
            elif command == 'set_target_properties' and 'PROPERTIES' in args:
                properties = args[args.index('PROPERTIES') + 1::2]
            if command == 'cmake_language' and args[:1] == ['CALL']:
                errors.append(f'{label}: unresolved cmake_language(CALL) command')
            if command == 'cmake_language' and args[:1] == ['EVAL']:
                errors.append(f'{label}: cmake_language(EVAL CODE) bypasses static dependency checking')
            for arg in args:
                if standard_libraries.fullmatch(arg):
                    errors.append(f'{label}: use target_link_libraries() instead of {arg}')
            if command == 'link_libraries' or any(
                name in link_properties or legacy_link_property.fullmatch(name) or '$' in name for name in properties
            ):
                errors.append(f'{label}: use target_link_libraries() instead of {command}() to set link dependencies')
            if command in {'if', 'foreach', 'while', 'function', 'macro', 'block'}:
                scope_depth += 1
            # An indirect destination can name any of the tracked variables.
            destination = args[:1] if command in {'set', 'unset'} else args[1:2]
            mutates_destination = command in {'set', 'unset', 'list'} or (
                command == 'string' and args[:1] in (['APPEND'], ['PREPEND']))
            if variables and mutates_destination and any('$' in name for name in destination):
                errors.append(f'{label}: unresolved {command}() variable name {destination[0]}')
                continue
            written = variables.intersection(args)
            if not written or command in {'if', 'elseif'}:
                continue
            if command == 'set' and args[0] in written:
                name, *values = args
                if values[-1:] == ['PARENT_SCOPE']:
                    values.pop()
                elif values and 'CACHE' not in values:
                    assigned.add(name)
                    if scope_depth == 0:
                        initialized.add(name)
                else:
                    errors.append(f'{label}: set({name}) must assign a local link value')
            elif command == 'list' and len(args) >= 2 and args[1] in written:
                action, name, *values = args
                if name not in initialized:
                    errors.append(f'{label}: set({name} "") before list({action}) of a link variable')
                if action in {'REMOVE_ITEM', 'REMOVE_AT', 'REMOVE_DUPLICATES', 'REVERSE', 'SORT'}:
                    continue
                if action not in {'APPEND', 'PREPEND', 'INSERT'}:
                    errors.append(f'{label}: unresolved list({action}) for link variable {name}')
                    continue
                if action == 'INSERT':
                    values = values[1:]
            else:
                for name in sorted(written):
                    errors.append(f'{label}: unresolved {command}() for link variable {name}')
                continue
            for value in (item for value in values for item in value.split(';') if item):
                if value not in platform_links | policy['targets']:
                    errors.append(f'{label}: external link target {value} in ${{{name}}}')
    qt_modules = ALLOWED_QT | policy.get('qt', set())
    for label, target in links:
        if target in policy['targets'] or (target.startswith('Qt6::') and target[5:] in qt_modules):
            continue
        match = variable_ref.fullmatch(target)
        if match and match.group(1) in assigned:
            continue
        errors.append(f'{label}: external link target {target}')
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
    policy = module_policy(module)
    files = source_files(module)
    errors = []
    cmake_files = []
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
        dependency_text = text
        if label in policy.get('vendored_sources', set()):
            dependency_text = re.sub(r'https?://[^\s"\'<>]+', '', text)
        for match in policy['forbidden'].finditer(dependency_text):
            errors.append('{}: forbidden dependency {}'.format(label, match.group().strip()))
        if path.suffix == '.qml':
            for imported in re.findall(r'^\s*import\s+([^\s;]+)', text, re.MULTILINE):
                if imported.startswith('"') and imported.endswith('"'):
                    try:
                        (path.parent / imported[1:-1]).resolve().relative_to(module)
                    except ValueError:
                        errors.append('{}: QML import escapes module {}'.format(label, imported))
                    continue
                if not (imported in policy['qml_imports'] or imported.split('.')[0] in {'QtQuick', 'QtQml', 'QtTest'}):
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
        if (path.suffix == '.cmake' or path.name == 'CMakeLists.txt') and label not in policy.get('unbuilt_cmake', set()):
            path_errors = cmake_path_errors(text, path, module, policy['subdirs'], policy.get('include_paths', set()))
            errors.extend(f'{label}: {error}' for error in path_errors)
            for qt_target in re.findall(r'Qt6::([A-Za-z0-9_]+)', text):
                if qt_target not in ALLOWED_QT | policy.get('qt', set()):
                    errors.append('{}: forbidden Qt dependency {}'.format(label, qt_target))
            for command in re.findall(r'\b(?:execute_process|add_custom_command|add_custom_target)\s*\(([^)]*)\)', text, re.DOTALL):
                if re.search(r'\b(?:node|npm|npx|yarn|pnpm)\b', command):
                    errors.append('{}: JavaScript build command'.format(label))
            cmake_files.append((label, list(cmake_calls(text))))
    errors.extend(cmake_link_errors(cmake_files, policy))
    return files, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--module-root', type=Path, default=None)
    args = parser.parse_args()
    roots = [args.module_root] if args.module_root is not None else [MODULE, MODULE.parent / 'media', MODULE.parent / 'entities', MODULE.parent / 'storyboard', MODULE.parent / 'files', MODULE.parent / 'timeline-player']
    files = []
    errors = []
    for root in roots:
        root_files, root_errors = audit_module(root)
        files.extend(root_files)
        errors.extend(root_errors)
    print('Inspected {} native module source files'.format(len(files)))
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
