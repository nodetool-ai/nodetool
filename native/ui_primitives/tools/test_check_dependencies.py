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


if __name__ == '__main__':
    unittest.main()
