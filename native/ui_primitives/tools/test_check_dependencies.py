"""Regression fixtures for the native CMake link audit."""
from pathlib import Path
import unittest

from check_dependencies import cmake_calls, cmake_link_errors, module_policy


class CMakeLinkAuditTest(unittest.TestCase):
    def audit(self, source):
        policy = module_policy(Path('timeline-player'))
        return cmake_link_errors([('CMakeLists.txt', list(cmake_calls(source)))], policy)

    def test_parent_scope_cannot_initialize_link_list(self):
        for prefix in ('', 'if(FALSE)\nset(libs "")\nendif()\n',
                       'set(libs "" PARENT_SCOPE)\n', 'set(libs "")\nunset(libs)\n'):
            with self.subTest(prefix=prefix):
                self.assertTrue(self.audit(prefix + '''
                    list(APPEND libs PkgConfig::FFMPEG)
                    target_link_libraries(test PRIVATE ${libs})
                '''))

    def test_local_initialization_allows_platform_link_list(self):
        self.assertEqual(self.audit('''
            set(libs "")
            list(APPEND libs PkgConfig::FFMPEG)
            target_link_libraries(test PRIVATE ${libs})
        '''), [])

    def test_indirect_link_commands(self):
        for command in (
            'link_libraries(forbidden_lib)',
            'set_property(TARGET x APPEND PROPERTY INTERFACE_LINK_LIBRARIES forbidden_lib)',
            'set_target_properties(x PROPERTIES LINK_LIBRARIES forbidden_lib)',
        ):
            with self.subTest(command=command):
                self.assertIn('use target_link_libraries()', self.audit(command)[0])

    def test_cmake_language_call_audits_link_target(self):
        self.assertIn('external link target forbidden_lib', ' '.join(self.audit(
            'cmake_language(CALL TARGET_LINK_LIBRARIES x PRIVATE forbidden_lib)')))
        self.assertEqual(self.audit('cmake_language(CALL target_link_libraries x PRIVATE Qt6::Core)'), [])

    def test_cmake_language_eval_cannot_inject_link_dependencies(self):
        self.assertIn('cmake_language(EVAL CODE)', ' '.join(self.audit(
            'cmake_language(EVAL CODE "target_link_libraries(x PRIVATE forbidden_lib)")')))

    def test_cmake_language_deferred_link_commands(self):
        for command in (
            'cmake_language(DEFER CALL target_link_libraries x PRIVATE forbidden_lib)',
            'cmake_language(DEFER DIRECTORY . ID delayed CALL TARGET_LINK_LIBRARIES x PRIVATE forbidden_lib)',
        ):
            with self.subTest(command=command):
                self.assertIn('cmake_language(DEFER', ' '.join(self.audit(command)))

    def test_linker_flag_variables_cannot_inject_link_dependencies(self):
        for variable in ('CMAKE_EXE_LINKER_FLAGS', 'CMAKE_SHARED_LINKER_FLAGS',
                         'CMAKE_EXE_LINKER_FLAGS_INIT', 'CMAKE_SHARED_LINKER_FLAGS_DEBUG'):
            with self.subTest(variable=variable):
                self.assertIn(variable, ' '.join(self.audit(f'set({variable} "-lforbidden")')))

    def test_link_options_cannot_inject_link_dependencies(self):
        for command in (
            'add_link_options(-lforbidden)',
            'add_link_options(LINKER:-l,forbidden)',
            'add_link_options("SHELL:-l forbidden")',
            'target_link_options(x PRIVATE -Wl,-lforbidden)',
            'target_link_options(x PRIVATE "$<$<CONFIG:Debug>:-lforbidden>")',
            'target_link_options(x PRIVATE "/opt/forbidden library/libforbidden.so.1.2")',
            'add_link_options(LINKER:/opt/libforbidden.a)',
            'target_link_options(x PRIVATE "C:/SDK/forbidden.lib")',
        ):
            with self.subTest(command=command):
                self.assertIn('use target_link_libraries()', ' '.join(self.audit(command)))
        self.assertEqual(self.audit('''
            add_link_options(-fexperimental-library)
            target_link_options(x PRIVATE -Wl,--as-needed -L/opt/lib)
        '''), [])

    def test_legacy_link_properties(self):
        for name in ('LINK_INTERFACE_LIBRARIES', 'LINK_INTERFACE_LIBRARIES_DEBUG',
                     'IMPORTED_LINK_INTERFACE_LIBRARIES', 'IMPORTED_LINK_INTERFACE_LIBRARIES_RELEASE'):
            with self.subTest(name=name):
                self.assertIn('use target_link_libraries()', ' '.join(self.audit(
                    f'set_target_properties(x PROPERTIES {name} forbidden_lib)')))

    def test_standard_libraries_cannot_inject_link_dependencies(self):
        for language in ('C', 'CXX'):
            for suffix in ('', '_INIT'):
                variable = f'CMAKE_{language}_STANDARD_LIBRARIES{suffix}'
                with self.subTest(variable=variable):
                    self.assertIn(variable, ' '.join(self.audit(f'set({variable} forbidden_lib)')))


if __name__ == '__main__':
    unittest.main()
