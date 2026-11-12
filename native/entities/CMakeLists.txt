if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
if(NOT TARGET nodetool_media)
    add_subdirectory(../media ${CMAKE_CURRENT_BINARY_DIR}/media)
endif()
set_source_files_properties(qml/EntityKind.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_library(nodetool_entities STATIC)
qt_add_qml_module(nodetool_entities
    URI NodeTool.Entities
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Entities
    QML_FILES qml/EntityKind.qml qml/EntityCard.qml qml/EntityImagePickerDialog.qml)
target_link_libraries(nodetool_entities PUBLIC nodetool_ui_primitives nodetool_media)
target_link_libraries(nodetool_entities PUBLIC Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(entities-tests tests/tst_entities.cpp)
    target_link_libraries(entities-tests PRIVATE nodetool_entities nodetool_entitiesplugin
        nodetool_mediaplugin Qt6::Test Qt6::Quick)
    nodetool_use_ui_primitives(entities-tests)
    add_test(NAME entities-tests COMMAND entities-tests)
    set_tests_properties(entities-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
