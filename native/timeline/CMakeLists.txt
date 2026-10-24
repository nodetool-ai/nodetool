cmake_minimum_required(VERSION 3.22)

project(NodeToolTimeline VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()

# GuiPrivate carries the include path of the semi-public QRhi API (<rhi/qrhi.h>).
set(QT_NO_PRIVATE_MODULE_WARNING ON)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui GuiPrivate Qml Quick QuickControls2 ShaderTools Test)
# QRhi through GuiPrivate is only compatible within one Qt minor version, so
# the build accepts the tested 6.12 only.
if(Qt6_VERSION VERSION_GREATER_EQUAL 6.13)
    message(FATAL_ERROR "nodetool-timeline is tested with Qt 6.12 (private QRhi API). Found ${Qt6_VERSION}.")
endif()
qt_standard_project_setup(REQUIRES 6.12)

# FFmpeg through pkg-config. M1a only prints the versions; the decoder step
# uses all four libraries.
find_package(PkgConfig REQUIRED)
pkg_check_modules(FFMPEG REQUIRED IMPORTED_TARGET libavformat libavcodec libavutil libswscale)

set(NT_WARNINGS -Wall -Wextra)

# Model and scene evaluation: no GUI, shared by the app and the tests.
add_library(timeline_core STATIC
    src/model/TimelineTypes.h
    src/model/TimelineJson.h src/model/TimelineJson.cpp
    src/preview/SceneEval.h src/preview/SceneEval.cpp
    src/bench/BenchReport.h src/bench/BenchReport.cpp)
target_include_directories(timeline_core PUBLIC src)
target_link_libraries(timeline_core PUBLIC Qt6::Core)
target_compile_options(timeline_core PRIVATE ${NT_WARNINGS})

# Decode and GPU sources: FFmpeg, QRhi textures, the source pool.
add_library(timeline_decode STATIC
    src/preview/LayerSource.h
    src/preview/FrameRing.h src/preview/FrameRing.cpp
    src/preview/YuvFormat.h src/preview/YuvFormat.cpp
    src/preview/FfmpegSource.h src/preview/FfmpegSource.cpp
    src/preview/SourcePool.h src/preview/SourcePool.cpp
    src/preview/SyntheticSource.h src/preview/SyntheticSource.cpp)
target_link_libraries(timeline_decode PUBLIC timeline_core Qt6::Gui Qt6::GuiPrivate PkgConfig::FFMPEG)
target_compile_options(timeline_decode PRIVATE ${NT_WARNINGS})

qt_add_executable(nodetool-timeline src/main.cpp)
set_target_properties(nodetool-timeline PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(nodetool-timeline PRIVATE ${NT_WARNINGS})
# The generated QML type registrations include the headers by base name.
target_include_directories(nodetool-timeline PRIVATE src/model src/playback src/preview)
target_link_libraries(nodetool-timeline PRIVATE
    timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG)

set_source_files_properties(qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_qml_module(nodetool-timeline
    URI NodeTool.Timeline
    QML_FILES
        qml/TimelineEditor.qml
        qml/Theme.qml
        qml/preview/PreviewArea.qml
        qml/Tracks/TracksRegion.qml
        qml/Tracks/TimeRuler.qml
        qml/Tracks/TrackHeader.qml
        qml/Tracks/TrackLane.qml
        qml/Tracks/Clip.qml
        qml/Tracks/ClipBody.qml
        qml/Tracks/Playhead.qml
        qml/Tracks/TimelineZoomControls.qml
    SOURCES
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp)

qt_add_shaders(nodetool-timeline "compositor_shaders"
    PREFIX "/shaders"
    BASE shaders
    FILES shaders/composite.vert shaders/composite.frag)

foreach(test_name tst_sceneeval tst_timelinejson tst_benchreport tst_framering tst_yuvformat tst_ffmpegsource tst_sourcepool)
    qt_add_executable(${test_name} tests/${test_name}.cpp)
    set_target_properties(${test_name} PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(${test_name} PRIVATE ${NT_WARNINGS})
    target_compile_definitions(${test_name} PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(${test_name} PRIVATE timeline_core timeline_decode Qt6::Test)
    add_test(NAME ${test_name} COMMAND ${test_name})
endforeach()

# The decoder tests read media from scripts/make-fixtures.sh, which keeps
# files that exist, so the setup is quick after the first run.
add_test(NAME make_fixtures COMMAND ${CMAKE_CURRENT_SOURCE_DIR}/scripts/make-fixtures.sh)
set_tests_properties(make_fixtures PROPERTIES FIXTURES_SETUP media)
set_tests_properties(tst_ffmpegsource PROPERTIES FIXTURES_REQUIRED media)
