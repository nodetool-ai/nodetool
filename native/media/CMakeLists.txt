if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
qt_add_library(nodetool_media STATIC)
qt_add_qml_module(nodetool_media
    URI NodeTool.Media
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Media
    QML_FILES qml/SwipePager.qml qml/AssetGallery.qml qml/AssetGrid.qml qml/AssetItem.qml qml/AssetContext.js qml/GridReflow.qml qml/GridGlide.qml qml/StableImage.qml
    SOURCES src/AssetListModel.h src/AssetListModel.cpp)
target_link_libraries(nodetool_media PUBLIC nodetool_ui_primitives)
target_include_directories(nodetool_media PUBLIC src)
target_link_libraries(nodetool_media PUBLIC Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(media-tests tests/tst_media.cpp)
    target_link_libraries(media-tests PRIVATE nodetool_media nodetool_mediaplugin Qt6::Test Qt6::Quick)
    nodetool_use_ui_primitives(media-tests)
    add_test(NAME media-tests COMMAND media-tests)
    set_tests_properties(media-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
