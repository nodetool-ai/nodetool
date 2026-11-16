# Additional clean files
cmake_minimum_required(VERSION 3.16)

if("${CONFIG}" STREQUAL "" OR "${CONFIG}" STREQUAL "Debug")
  file(REMOVE_RECURSE
  "qt/CMakeFiles/account_qt_tests_autogen.dir/AutogenUsed.txt"
  "qt/CMakeFiles/account_qt_tests_autogen.dir/ParseCache.txt"
  "qt/CMakeFiles/nodetool_account_qt_autogen.dir/AutogenUsed.txt"
  "qt/CMakeFiles/nodetool_account_qt_autogen.dir/ParseCache.txt"
  "qt/account_qt_tests_autogen"
  "qt/nodetool_account_qt_autogen"
  )
endif()
