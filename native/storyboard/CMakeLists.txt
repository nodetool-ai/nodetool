if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
if(NOT TARGET nodetool_media)
    add_subdirectory(../media ${CMAKE_CURRENT_BINARY_DIR}/media)
endif()
if(NOT TARGET nodetool_model_picker)
    add_subdirectory(../model-picker ${CMAKE_CURRENT_BINARY_DIR}/model-picker)
endif()
qt_add_library(nodetool_storyboard STATIC)
qt_add_qml_module(nodetool_storyboard
    URI NodeTool.Storyboard
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Storyboard
    QML_FILES
        qml/StoryboardBoard.qml
        qml/ShotCard.qml
        qml/ShotMediaViewer.qml
        qml/ShotEditor.qml
        qml/ShotEditViewer.qml
        qml/ShotEditForm.qml
        qml/ShotGraphicsEditor.qml
        qml/ShotTakesGallery.qml
        qml/ShotRenderDialog.qml
        qml/LinkDocumentDialog.qml
        qml/shotDraft.js
    SOURCES
        src/StoryDrafts.h
        src/StoryDrafts.cpp)
target_link_libraries(nodetool_storyboard PUBLIC
    nodetool_ui_primitives
    nodetool_media
    nodetool_model_picker
    Qt6::Core
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2)
target_include_directories(nodetool_storyboard PUBLIC src)
if(BUILD_TESTING)
    qt_add_executable(tst_storydrafts tests/tst_storydrafts.cpp)
    target_link_libraries(tst_storydrafts PRIVATE
        nodetool_storyboard
        nodetool_storyboardplugin
        nodetool_media
        nodetool_mediaplugin
        nodetool_model_picker
        nodetool_model_pickerplugin
        Qt6::Test
        Qt6::Quick)
    nodetool_use_ui_primitives(tst_storydrafts)
    add_test(NAME tst_storydrafts COMMAND tst_storydrafts)
    set_tests_properties(tst_storydrafts PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
