# NodeTool.Files: the project folder tree that the node editor and the
# timeline show in a dock. It depends on the UI primitives only.
if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
find_package(Qt6 REQUIRED COMPONENTS Network)
# Loads as qrc:/qt/qml/NodeTool/Files/FilesPanel.qml.
set_source_files_properties(qml/FilesPanel.qml PROPERTIES QT_RESOURCE_ALIAS FilesPanel.qml)
qt_add_library(nodetool_files STATIC)
qt_add_qml_module(nodetool_files
    URI NodeTool.Files
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Files
    QML_FILES qml/FilesPanel.qml
    SOURCES src/ProjectFiles.h src/ProjectFiles.cpp)
target_link_libraries(nodetool_files PUBLIC nodetool_ui_primitives)
target_include_directories(nodetool_files PUBLIC src)
target_link_libraries(nodetool_files PUBLIC Qt6::Core Qt6::Gui Qt6::Network Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(files-tests tests/tst_files.cpp tests/FakeProjectFiles.h)
    target_link_libraries(files-tests PRIVATE nodetool_files nodetool_filesplugin Qt6::Test Qt6::Quick)
    nodetool_use_ui_primitives(files-tests)
    add_test(NAME files-tests COMMAND files-tests)
    set_tests_properties(files-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
