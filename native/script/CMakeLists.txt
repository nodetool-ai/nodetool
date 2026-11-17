# NodeTool.Script: the script line edits the timeline uses. The edits need only QtCore.
qt_add_library(nodetool_script_authoring STATIC src/ScriptAuthoring.h src/ScriptAuthoring.cpp)
target_link_libraries(nodetool_script_authoring PUBLIC Qt6::Core)
target_include_directories(nodetool_script_authoring PUBLIC src)
if(BUILD_TESTING)
    qt_add_executable(tst_scriptauthoring tests/tst_scriptauthoring.cpp)
    target_link_libraries(tst_scriptauthoring PRIVATE nodetool_script_authoring Qt6::Test)
    add_test(NAME tst_scriptauthoring COMMAND tst_scriptauthoring)
endif()
