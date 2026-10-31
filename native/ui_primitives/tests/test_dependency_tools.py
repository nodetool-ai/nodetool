#!/usr/bin/env python3
"""Exercise dependency rejection and the actual isolated tool environment."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

QTPATHS = 'qtpaths.exe' if os.name == 'nt' else 'qtpaths'

TOOLS = Path(__file__).resolve().parents[1] / 'tools'


def load(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dependencies = load('check_dependencies')
isolation = load('check_isolated_build')


class DependencyTests(unittest.TestCase):
    def test_rejects_empty_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(dependencies.audit_module(Path(directory))[1])

    @unittest.skipIf(os.name == 'nt', 'Windows symlink privileges vary')
    def test_external_symlink_is_rejected_without_reading_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'module'
            root.mkdir()
            outside = Path(directory) / 'outside.qml'
            outside.write_bytes(b'\xff\xfe')
            (root / 'Bad.qml').symlink_to(outside)
            self.assertTrue(dependencies.audit_module(root)[1])

    def test_rejects_each_external_boundary(self):
        cases = {
            'qml import': ('Bad.qml', 'import NodeTool.Timeline\nItem {}'),
            'non-UI Qt': ('Bad.qml', 'import QtWebEngine\nItem {}'),
            'web resource': ('Bad.qml', 'Image { source: "../../web/icon.svg" }'),
            'web code': ('Bad.cpp', '#include "../../web/theme.h"'),
            'feature include': ('Bad.cpp', '#include "../timeline/Editor.h"'),
            'backend': ('CMakeLists.txt', 'target_link_libraries(ui PRIVATE FFMPEG)'),
            'backend target': ('CMakeLists.txt', 'target_link_libraries(ui PRIVATE nodetool_runtime)'),
            'unknown include': ('Bad.cpp', '#include "../../backend/Client.h"'),
            'network': ('CMakeLists.txt', 'target_link_libraries(ui PRIVATE Qt6::Network)'),
            'npm': ('CMakeLists.txt', 'execute_process(COMMAND npm install)'),
            'node': ('CMakeLists.txt', 'add_custom_target(generate COMMAND node tokens.js)')}
        cases.update({
            'outside CMake': ('CMakeLists.txt', 'include("/tmp/outside-theme.cmake")'),
            'outside resource': ('CMakeLists.txt', 'qt_add_resources(ui arbitrary FILES "/tmp/outside-icon.svg")'),
            'relative CMake': ('CMakeLists.txt', 'include("../outside-theme.cmake")'),
            'indirect outside CMake': ('CMakeLists.txt', 'set(THEME "/tmp/outside-theme.cmake")\ninclude("${THEME}")'),
            'outside read': ('CMakeLists.txt', 'file(READ "/tmp/outside-theme.json" theme)')})
        for name, (filename, source) in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / filename).write_text(source)
                self.assertTrue(dependencies.audit_module(root)[1])

    def test_accepts_owned_qt_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'Label.qml').write_text('import QtQuick\nimport NodeTool.UiPrimitives as Ui\nUi.Text {}')
            files, errors = dependencies.audit_module(root)
            self.assertEqual(len(files), 1)
            self.assertEqual(errors, [])

    def test_configured_sources_and_resources_are_owned_before_build(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / 'stage'
            source = stage / 'native/ui_primitives'
            source.mkdir(parents=True)
            build = stage / 'build'
            reply = build / '.cmake/api/v1/reply'
            reply.mkdir(parents=True)
            (reply / 'codemodel-v2-fixture.json').write_text(json.dumps({
                'paths': {'source': str(source)},
                'configurations': [{'targets': [{'jsonFile': 'target.json'}]}]}))
            (reply / 'target.json').write_text(json.dumps({'sources': [{'path': 'qml/Text.qml'}]}))
            isolation.validate_configured_inputs(stage, build)
            (reply / 'target.json').write_text(json.dumps({'sources': [{'path': str(stage.parent / 'outside.cpp')}]}))
            with self.assertRaises(RuntimeError):
                isolation.validate_configured_inputs(stage, build)
            (reply / 'target.json').write_text(json.dumps({'sources': [{'path': 'qml/Text.qml'}]}))
            (build / 'external.qrc').write_text('<RCC><qresource><file>{}</file></qresource></RCC>'.format(stage.parent / 'outside.svg'))
            with self.assertRaises(RuntimeError):
                isolation.validate_configured_inputs(stage, build)

    def test_qt_sdk_metatypes_are_metadata_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / 'stage'
            build = stage / 'build'
            reply = build / '.cmake/api/v1/reply'
            reply.mkdir(parents=True)
            qt = root / 'qt'
            (qt / 'bin').mkdir(parents=True)
            (qt / 'bin' / QTPATHS).touch()
            metadata = qt / 'share/qt/metatypes/qt6qml_metatypes.json'
            metadata.parent.mkdir(parents=True)
            metadata.write_text('{}')
            (reply / 'codemodel-v2-fixture.json').write_text(json.dumps({
                'paths': {'source': str(stage)},
                'configurations': [{'targets': [{'jsonFile': 'target.json'}]}]}))
            (reply / 'target.json').write_text(json.dumps({'sources': [{'path': str(metadata)}]}))
            with patch.object(isolation.subprocess, 'check_output', return_value=str(qt / 'share/qt')):
                isolation.validate_configured_inputs(stage, build, qt)
                (build / 'external.qrc').write_text('<RCC><qresource><file>{}</file></qresource></RCC>'.format(metadata))
                with self.assertRaises(RuntimeError):
                    isolation.validate_configured_inputs(stage, build, qt)

    def test_qt_metatypes_follow_queried_sdk_archdata_and_lib_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / 'stage'
            build = stage / 'build'
            reply = build / '.cmake/api/v1/reply'
            reply.mkdir(parents=True)
            qt = root / 'qt'
            (qt / 'bin').mkdir(parents=True)
            (qt / 'bin' / QTPATHS).touch()
            metadata = qt / 'lib/metatypes/qt6qml_metatypes.json'
            metadata.parent.mkdir(parents=True)
            metadata.write_text('{}')
            (reply / 'codemodel-v2-fixture.json').write_text(json.dumps({
                'paths': {'source': str(stage)},
                'configurations': [{'targets': [{'jsonFile': 'target.json'}]}]}))
            target = reply / 'target.json'
            target.write_text(json.dumps({'sources': [{'path': str(metadata)}]}))
            with patch.object(isolation.subprocess, 'check_output', return_value=str(qt)) as query:
                isolation.validate_configured_inputs(stage, build, qt)
                self.assertEqual(query.call_args.args[0], [str(qt / 'bin' / QTPATHS), '--query', 'QT_INSTALL_ARCHDATA'])
            unrelated = root / 'unrelated/metatypes/qt6qml_metatypes.json'
            unrelated.parent.mkdir(parents=True)
            unrelated.write_text('{}')
            target.write_text(json.dumps({'sources': [{'path': str(unrelated)}]}))
            with patch.object(isolation.subprocess, 'check_output', return_value=str(root / 'unrelated')):
                with self.assertRaises(RuntimeError):
                    isolation.validate_configured_inputs(stage, build, qt)

    @unittest.skipIf(os.name == 'nt', 'Windows symlink privileges vary')
    def test_qt_metatypes_accept_sdk_declared_directory_and_file_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / 'stage'
            build = stage / 'build'
            reply = build / '.cmake/api/v1/reply'
            reply.mkdir(parents=True)
            qt = root / 'qt'
            (qt / 'bin').mkdir(parents=True)
            (qt / 'bin' / QTPATHS).touch()
            archdata = root / 'sdk-share'
            metadata = archdata / 'metatypes/qt6qml_metatypes.json'
            metadata.parent.mkdir(parents=True)
            component = root / 'qtdeclarative/qt6qml_metatypes.json'
            component.parent.mkdir(parents=True)
            component.write_text('{}')
            metadata.symlink_to(component)
            (qt / 'share').mkdir()
            (qt / 'share/qt').symlink_to(archdata, target_is_directory=True)
            (reply / 'codemodel-v2-fixture.json').write_text(json.dumps({
                'paths': {'source': str(stage)},
                'configurations': [{'targets': [{'jsonFile': 'target.json'}]}]}))
            (reply / 'target.json').write_text(json.dumps({'sources': [{'path': str(metadata)}]}))
            with patch.object(isolation.subprocess, 'check_output', return_value=str(archdata)):
                isolation.validate_configured_inputs(stage, build, qt)
            with patch.object(isolation.subprocess, 'check_output', return_value=str(root / 'unrelated')):
                with self.assertRaises(RuntimeError):
                    isolation.validate_configured_inputs(stage, build, qt)

    def test_installed_smoke_rejects_qml_errors_even_after_zero_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'smoke.log'
            for message in ('TypeError: broken binding', 'ReferenceError: missingName',
                            'The current style does not support customization of this control'):
                with self.subTest(message=message):
                    log.write_text(message)
                    with self.assertRaises(RuntimeError):
                        isolation.assert_clean_runtime_log(log)
            log.write_text('Offscreen smoke completed')
            isolation.assert_clean_runtime_log(log)

    @unittest.skipIf(shutil.which('cmake') is None or shutil.which('ninja') is None, 'CMake/Ninja required')
    def test_isolated_path_does_not_expose_node(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            qt = root / 'qt'
            (qt / 'bin').mkdir(parents=True)
            environment = isolation.restricted_environment(root, qt)
            for name in isolation.BLOCKED_TOOLS:
                self.assertIsNone(shutil.which(name, path=environment['PATH']))


if __name__ == '__main__':
    unittest.main()
