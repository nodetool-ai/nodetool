# NodeTool.Script: the script editor view and the script line edits that the
# node editor and the timeline share. The edits need only QtCore.
if(NOT TARGET nodetool_storyboard)
    add_subdirectory(../storyboard ${CMAKE_CURRENT_BINARY_DIR}/storyboard)
endif()
qt_add_library(nodetool_script_authoring STATIC src/ScriptAuthoring.h src/ScriptAuthoring.cpp)
target_link_libraries(nodetool_script_authoring PUBLIC Qt6::Core)
target_include_directories(nodetool_script_authoring PUBLIC src)
qt_add_library(nodetool_script STATIC)
qt_add_qml_module(nodetool_script
    URI NodeTool.Script
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Script
    QML_FILES qml/ScriptDocumentEditor.qml
    SOURCES src/ScriptLines.h src/ScriptLines.cpp)
target_link_libraries(nodetool_script PUBLIC
    nodetool_script_authoring
    nodetool_storyboard
    nodetool_storyboardplugin
    nodetool_ui_primitives
    Qt6::Core
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(tst_scriptauthoring tests/tst_scriptauthoring.cpp)
    target_link_libraries(tst_scriptauthoring PRIVATE nodetool_script_authoring Qt6::Test)
    add_test(NAME tst_scriptauthoring COMMAND tst_scriptauthoring)
endif()
