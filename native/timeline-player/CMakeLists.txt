cmake_minimum_required(VERSION 3.24)

# The timeline player shared by native/timeline and the node editor. This step
# holds nodetool_timeline_scene: the timeline document, its JSON parser and
# scene evaluation, with Qt Core and Yoga only. native/timeline adds this
# directory with add_subdirectory and links the library into timeline_core.
project(NodeToolTimelinePlayer LANGUAGES CXX)

if(PROJECT_IS_TOP_LEVEL)
    set(CMAKE_CXX_STANDARD 20)
    set(CMAKE_CXX_STANDARD_REQUIRED ON)
    include(CTest)
endif()

find_package(Qt6 6.12 REQUIRED COMPONENTS Core Test)

if(MSVC)
    set(NT_PLAYER_WARNINGS /W4 /permissive-)
    set(NT_PLAYER_NO_WARNINGS /w)
else()
    set(NT_PLAYER_WARNINGS -Wall -Wextra)
    set(NT_PLAYER_NO_WARNINGS -w)
endif()

# Yoga 3.2.1, the flex layout of the web scene model (third_party/yoga).
# No fused multiply-add: the web runs it as WebAssembly, which has none.
file(GLOB_RECURSE NT_YOGA_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/third_party/yoga/yoga/*.cpp)
add_library(yogacore STATIC ${NT_YOGA_SOURCES})
target_include_directories(yogacore PUBLIC third_party/yoga)
target_compile_features(yogacore PUBLIC cxx_std_20)
target_compile_options(yogacore PRIVATE ${NT_PLAYER_NO_WARNINGS})
if(NOT MSVC)
    target_compile_options(yogacore PRIVATE -ffp-contract=off)
endif()

# The document model and scene evaluation: no GUI. Sources keep the folder
# layout of native/timeline/src, so includes such as "scene/ClipScene.h"
# resolve through the PUBLIC include directory in both projects.
add_library(nodetool_timeline_scene STATIC
    src/model/TimelineSource.h
    src/model/TimelineTypes.h
    src/model/TimelineJson.h
    src/model/TimelineJson.cpp
    src/scene/Animation.h
    src/scene/Animation.cpp
    src/scene/ClipScene.h
    src/scene/ClipScene.cpp
    src/scene/FlexLayout.h
    src/scene/FlexLayout.cpp
    src/scene/ParamCurves.h
    src/scene/ParamCurves.cpp
    src/scene/SvgPath.h
    src/scene/SvgPath.cpp
    src/scene/TextAnimation.h
    src/scene/TextAnimation.cpp
    src/scene/TextBlock.h
    src/scene/TextBlock.cpp
    src/scene/TimeRemap.h
    src/scene/TimeRemap.cpp
    src/motion/beat/Beat.h
    src/motion/blur/Shutter.h
    src/motion/tracking/TrackBinding.h
    src/motion/wipe/Wipe.h
    src/preview/SceneEval.h
    src/preview/SceneEval.cpp
    src/preview/layers/SceneHooks.h
    src/preview/layers/SceneHooks.cpp
    src/preview/transitions/TransitionResolver.h
    src/preview/transitions/TransitionResolver.cpp
    src/platform/CpuUsage.h
    src/platform/CpuUsage.cpp
    src/playback/AudioClockFeed.h
    src/playback/AudioClockFeed.cpp)
set_target_properties(nodetool_timeline_scene PROPERTIES AUTOMOC ON)
target_include_directories(nodetool_timeline_scene PUBLIC src)
target_link_libraries(nodetool_timeline_scene PUBLIC Qt6::Core PRIVATE yogacore)
target_compile_options(nodetool_timeline_scene PRIVATE ${NT_PLAYER_WARNINGS})
# The timeline app's QML module registers TimelineSource with QML_FOREIGN,
# which reads these metatypes.
qt_extract_metatypes(nodetool_timeline_scene)
# The scene port computes what the web computes in JavaScript, one rounding
# per operation: no fused multiply-add (Clang contracts by default).
if(NOT MSVC)
    set_source_files_properties(
        src/scene/Animation.cpp src/scene/ClipScene.cpp src/scene/FlexLayout.cpp src/scene/SvgPath.cpp
        src/scene/TextAnimation.cpp src/scene/TextBlock.cpp src/preview/SceneEval.cpp
        src/preview/transitions/TransitionResolver.cpp
        PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

if(BUILD_TESTING)
    qt_add_executable(tst_cpuusage tests/tst_cpuusage.cpp)
    set_target_properties(tst_cpuusage PROPERTIES MACOSX_BUNDLE FALSE AUTOMOC ON)
    target_compile_options(tst_cpuusage PRIVATE ${NT_PLAYER_WARNINGS})
    target_link_libraries(tst_cpuusage PRIVATE nodetool_timeline_scene Qt6::Test)
    add_test(NAME tst_cpuusage COMMAND tst_cpuusage)
endif()
