# NodeTool.MediaPlayer: the shared audio and video player of the native hosts.
# It depends on the UI primitives and Qt Multimedia only. NodeTool.Files and
# NodeTool.Media stay free of it: a host injects this player where it needs one.
if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
find_package(Qt6 REQUIRED COMPONENTS Multimedia)
# Loads as qrc:/qt/qml/NodeTool/MediaPlayer/MediaPlayer.qml.
set_source_files_properties(qml/MediaPlayer.qml PROPERTIES QT_RESOURCE_ALIAS MediaPlayer.qml)
qt_add_library(nodetool_media_player STATIC)
qt_add_qml_module(nodetool_media_player
    URI NodeTool.MediaPlayer
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/MediaPlayer
    QML_FILES qml/MediaPlayer.qml
    SOURCES src/VideoFrameItem.h src/VideoFrameItem.cpp)
target_include_directories(nodetool_media_player PRIVATE src)
target_link_libraries(nodetool_media_player PUBLIC nodetool_ui_primitives)
target_link_libraries(nodetool_media_player PUBLIC Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Multimedia)
if(BUILD_TESTING)
    qt_add_executable(media-player-tests tests/tst_media_player.cpp)
    target_link_libraries(media-player-tests PRIVATE nodetool_media_player nodetool_media_playerplugin Qt6::Test Qt6::Quick)
    target_compile_definitions(media-player-tests PRIVATE NODETOOL_TEST_VIDEO=\"${CMAKE_CURRENT_LIST_DIR}/tests/fixtures/clip.mp4\")
    nodetool_use_ui_primitives(media-player-tests)
    add_test(NAME media-player-tests COMMAND media-player-tests)
    set_tests_properties(media-player-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
