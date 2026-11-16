# CMake generated Testfile for 
# Source directory: /home/claude/nodetool/native/account
# Build directory: /home/claude/nodetool/native/account/build-qt
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test([=[account_unit_tests]=] "/home/claude/nodetool/native/account/build-qt/account_unit_tests")
set_tests_properties([=[account_unit_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/claude/nodetool/native/account/CMakeLists.txt;96;add_test;/home/claude/nodetool/native/account/CMakeLists.txt;0;")
add_test([=[account_session_tests]=] "/home/claude/nodetool/native/account/build-qt/account_session_tests")
set_tests_properties([=[account_session_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/claude/nodetool/native/account/CMakeLists.txt;102;add_test;/home/claude/nodetool/native/account/CMakeLists.txt;0;")
add_test([=[account_cloud_tests]=] "/home/claude/nodetool/native/account/build-qt/account_cloud_tests")
set_tests_properties([=[account_cloud_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/claude/nodetool/native/account/CMakeLists.txt;108;add_test;/home/claude/nodetool/native/account/CMakeLists.txt;0;")
add_test([=[account_policy_tests]=] "/home/claude/nodetool/native/account/build-qt/account_policy_tests")
set_tests_properties([=[account_policy_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/claude/nodetool/native/account/CMakeLists.txt;113;add_test;/home/claude/nodetool/native/account/CMakeLists.txt;0;")
add_test([=[account_keychain_tests]=] "/home/claude/nodetool/native/account/build-qt/account_keychain_tests")
set_tests_properties([=[account_keychain_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/claude/nodetool/native/account/CMakeLists.txt;119;add_test;/home/claude/nodetool/native/account/CMakeLists.txt;0;")
subdirs("_deps/nlohmann_json-build")
subdirs("qt")
