cmake_minimum_required(VERSION 3.24)

# The timeline player shared by native/timeline and the node editor:
# nodetool_timeline_scene (the timeline document, its JSON parser and scene
# evaluation, with Qt Core and Yoga only) and nodetool_timeline_decode (the
# media sources, the GPU effects, the hook registries and render2d), and
# nodetool_timeline_player_server (the server loader, Qt Network).
# native/timeline adds this directory with add_subdirectory and links the
# libraries into timeline_core and timeline_decode.
project(NodeToolTimelinePlayer LANGUAGES CXX)
if(APPLE)
    # VideoToolboxInterop.mm
    enable_language(OBJCXX)
endif()

if(PROJECT_IS_TOP_LEVEL)
    set(CMAKE_CXX_STANDARD 20)
    set(CMAKE_CXX_STANDARD_REQUIRED ON)
    include(CTest)
endif()

# GuiPrivate carries the include path of the semi-public QRhi API (<rhi/qrhi.h>),
# which is only compatible within one Qt minor version.
set(QT_NO_PRIVATE_MODULE_WARNING ON)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui GuiPrivate Network ShaderTools Test)
if(Qt6_VERSION VERSION_GREATER_EQUAL 6.13)
    message(FATAL_ERROR "The timeline player is tested with Qt 6.12 (private QRhi API). Found ${Qt6_VERSION}.")
endif()
find_package(PkgConfig REQUIRED)
if(NOT TARGET PkgConfig::FFMPEG)
    pkg_check_modules(FFMPEG REQUIRED IMPORTED_TARGET GLOBAL libavformat libavcodec libavutil libswscale libswresample)
endif()

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
    src/playback/AudioClockFeed.cpp
    src/transcript/CaptionCues.h
    src/transcript/CaptionCues.cpp)
set_target_properties(nodetool_timeline_scene PROPERTIES AUTOMOC ON)
target_include_directories(nodetool_timeline_scene PUBLIC src)
target_link_libraries(nodetool_timeline_scene PUBLIC Qt6::Core PRIVATE yogacore)
target_compile_options(nodetool_timeline_scene PRIVATE ${NT_PLAYER_WARNINGS})
if(NT_PORTABLE)
    target_compile_definitions(nodetool_timeline_scene PUBLIC NT_PORTABLE_PLATFORM)
endif()
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

# Platforms. The hardware decode path is chosen at compile time
# (src/preview/hw/HwInterop.h): VideoToolbox on macOS, D3D11VA on Windows,
# VAAPI with DMA-BUF import into Vulkan on Linux when libva and Vulkan are
# found, else none (software decode only). NT_PORTABLE builds the code of the
# other platforms on macOS: no VideoToolbox and the portable platform code.
option(NT_PORTABLE "macOS: build the non-Apple code paths (no VideoToolbox, portable platform code)" OFF)
set(NT_PLAYER_DECODE_PLATFORM_SOURCES src/preview/hw/HwInterop.h src/preview/hw/HwInterop.cpp)
set(NT_PLAYER_DECODE_PLATFORM_LIBS "")
set(NT_PLAYER_DECODE_DEFINES "")
set(NT_PLAYER_HAVE_VAAPI_VULKAN OFF)
if(NT_PORTABLE)
    list(APPEND NT_PLAYER_DECODE_DEFINES NT_HW_NONE)
endif()
if(APPLE AND NOT NT_PORTABLE)
    list(APPEND NT_PLAYER_DECODE_PLATFORM_SOURCES src/preview/hw/VideoToolboxInterop.h src/preview/hw/VideoToolboxInterop.mm)
    set_source_files_properties(src/preview/hw/VideoToolboxInterop.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
    set(NT_PLAYER_DECODE_PLATFORM_LIBS "-framework CoreVideo" "-framework IOSurface" "-framework Metal" "-framework Foundation")
elseif(APPLE)
    # NT_PORTABLE: QRhi's Metal backend still runs the compositor.
    set(NT_PLAYER_DECODE_PLATFORM_LIBS "-framework Foundation")
elseif(WIN32)
    list(APPEND NT_PLAYER_DECODE_PLATFORM_SOURCES src/preview/hw/D3D11Interop.h src/preview/hw/D3D11Interop.cpp)
    set(NT_PLAYER_DECODE_PLATFORM_LIBS d3d11 dxgi)
elseif(UNIX)
    find_package(Vulkan)
    pkg_check_modules(LIBVA IMPORTED_TARGET GLOBAL libva libva-drm)
    if(Vulkan_FOUND AND LIBVA_FOUND)
        list(APPEND NT_PLAYER_DECODE_PLATFORM_SOURCES src/preview/hw/VulkanInterop.h src/preview/hw/VulkanInterop.cpp)
        list(APPEND NT_PLAYER_DECODE_DEFINES NT_HAVE_VAAPI_VULKAN)
        set(NT_PLAYER_DECODE_PLATFORM_LIBS Vulkan::Vulkan PkgConfig::LIBVA)
        set(NT_PLAYER_HAVE_VAAPI_VULKAN ON)
    else()
        message(STATUS "timeline player: no libva or Vulkan, software decode only")
    endif()
endif()

# QTextLayout/QRawFont alone differ from Canvas in GPOS advances, variable
# weights and transformed glyph coverage. HarfBuzz shapes the selected face,
# and FreeType rasterizes it to keep the example comparisons above 35 dB.
# HarfBuzz's own CMake package is missing on Debian and Ubuntu and points at
# a wrong prefix in vcpkg, so find the header and the library directly.
if(NOT TARGET harfbuzz::harfbuzz)
    find_path(NT_HARFBUZZ_INCLUDE_DIR hb.h PATH_SUFFIXES harfbuzz REQUIRED)
    find_library(NT_HARFBUZZ_LIBRARY NAMES harfbuzz REQUIRED)
    add_library(harfbuzz::harfbuzz UNKNOWN IMPORTED GLOBAL)
    set_target_properties(harfbuzz::harfbuzz PROPERTIES
        IMPORTED_LOCATION "${NT_HARFBUZZ_LIBRARY}"
        INTERFACE_INCLUDE_DIRECTORIES "${NT_HARFBUZZ_INCLUDE_DIR}")
endif()
find_package(Freetype REQUIRED)

# The fonts render2d loads when no NODETOOL_TIMELINE_FONTS_DIR, fonts folder
# next to the executable or app bundle Resources/fonts exists. The host sets
# it before adding this directory. Empty: no build-tree fallback.
set(NT_PLAYER_FONTS_DIR "" CACHE PATH "Fallback fonts directory compiled into render2d")

# Decode and GPU: the media sources and their pools, hardware interop, the
# layer and compose hook registries, the effects and render2d. The standard
# hooks register through src/preview/StandardHooks.h.
add_library(nodetool_timeline_decode STATIC
    src/preview/LayerSource.h
    src/preview/WorkingFormat.h
    src/preview/FrameRing.h
    src/preview/FrameRing.cpp
    src/preview/YuvFormat.h
    src/preview/YuvFormat.cpp
    src/preview/FfmpegSource.h
    src/preview/FfmpegSource.cpp
    src/preview/SourcePool.h
    src/preview/SourcePool.cpp
    src/preview/SurfacePool.h
    src/preview/FrameCache.h
    src/preview/FrameCache.cpp
    src/preview/SyntheticSource.h
    src/preview/SyntheticSource.cpp
    src/preview/StillImageSource.h
    src/preview/StillImageSource.cpp
    src/preview/RetireQueue.h
    src/preview/StandardHooks.h
    src/preview/StandardHooks.cpp
    src/preview/layers/LayerRegistry.h
    src/preview/layers/LayerRegistry.cpp
    src/preview/compose/BackdropStage.h
    src/preview/compose/ComposeRegistry.h
    src/preview/compose/ComposeRegistry.cpp
    src/preview/effects/BlendModes.h
    src/preview/effects/BlendModes.cpp
    src/preview/effects/BlurBounds.h
    src/preview/effects/ClipAnalysis.h
    src/preview/effects/ClipEffects.h
    src/preview/effects/ClipEffects.cpp
    src/preview/effects/Denoise.h
    src/preview/effects/DrawCache.h
    src/preview/effects/DrawCache.cpp
    src/preview/effects/EffectMasks.h
    src/preview/effects/EffectMasks.cpp
    src/preview/effects/EffectPlan.cpp
    src/preview/effects/EffectsRegistrations.h
    src/preview/effects/EffectsRegistrations.cpp
    src/preview/effects/Masks.h
    src/preview/effects/Masks.cpp
    src/preview/effects/MotionAnalysis.h
    src/preview/effects/Stabilization.h
    src/motion/capacity/ScratchPool.h
    src/render2d/Rasterizer.h
    src/render2d/Rasterizer.cpp
    src/render2d/Paint.h
    src/render2d/Paint.cpp
    src/render2d/LayerStyle.h
    src/render2d/LayerStyle.cpp
    src/render2d/RasterSource.h
    src/render2d/RasterSource.cpp
    src/render2d/Render2dRegistrations.h
    src/render2d/Render2dRegistrations.cpp
    ${NT_PLAYER_DECODE_PLATFORM_SOURCES})
target_link_libraries(nodetool_timeline_decode
    PUBLIC nodetool_timeline_scene Qt6::Gui Qt6::GuiPrivate PkgConfig::FFMPEG ${NT_PLAYER_DECODE_PLATFORM_LIBS}
    PRIVATE harfbuzz::harfbuzz Freetype::Freetype)
target_compile_definitions(nodetool_timeline_decode PUBLIC ${NT_PLAYER_DECODE_DEFINES})
target_compile_options(nodetool_timeline_decode PRIVATE ${NT_PLAYER_WARNINGS})
set_source_files_properties(src/render2d/Rasterizer.cpp PROPERTIES
    COMPILE_DEFINITIONS NT_TIMELINE_FONTS_DIR="${NT_PLAYER_FONTS_DIR}")
# The effect shaders. A static library carries them as resource objects that
# link into every consumer, so no host can lose them.
qt_add_shaders(nodetool_timeline_decode nodetool_timeline_effects_shaders
    PREFIX "/effects" BASE shaders/effects GLSL "330,440"
    FILES shaders/effects/blend.vert shaders/effects/blend.frag
        shaders/effects/clip.vert shaders/effects/clip.frag shaders/effects/denoise.frag)

# The startup registrars of the standard hooks (src/preview/StandardHooks.h).
# Object libraries, so their objects link into each executable that names
# them, and no archive member with the registration is dropped.
add_library(nodetool_timeline_effects_registrar OBJECT src/preview/effects/EffectsStartup.cpp)
target_link_libraries(nodetool_timeline_effects_registrar PUBLIC nodetool_timeline_decode)
add_library(nodetool_timeline_render2d_registrar OBJECT src/render2d/Render2dStartup.cpp)
target_link_libraries(nodetool_timeline_render2d_registrar PUBLIC nodetool_timeline_decode)

if(NOT PROJECT_IS_TOP_LEVEL)
    # The host links the same platform libraries into code that includes the
    # hardware interop headers.
    set(NT_PLAYER_DECODE_PLATFORM_LIBS ${NT_PLAYER_DECODE_PLATFORM_LIBS} PARENT_SCOPE)
    set(NT_PLAYER_HAVE_VAAPI_VULKAN ${NT_PLAYER_HAVE_VAAPI_VULKAN} PARENT_SCOPE)
endif()

add_library(nodetool_timeline_player_server STATIC
    src/model/TimelineDocumentLoader.h
    src/server/AssetCache.h
    src/server/AssetCache.cpp
    src/server/FieldAudit.h
    src/server/FieldAudit.cpp
    src/server/ServerClient.h
    src/server/ServerClient.cpp
    src/server/ServerIdentity/ServerIdentity.h
    src/server/ServerIdentity/ServerIdentity.cpp
    src/server/ServerTimeline.h
    src/server/ServerTimeline.cpp
    src/server/ServerTimelineLoader.h
    src/server/ServerTimelineLoader.cpp)
set_target_properties(nodetool_timeline_player_server PROPERTIES AUTOMOC ON)
target_link_libraries(nodetool_timeline_player_server PUBLIC nodetool_timeline_scene Qt6::Network)
target_compile_options(nodetool_timeline_player_server PRIVATE ${NT_PLAYER_WARNINGS})

if(BUILD_TESTING)
    qt_add_executable(tst_cpuusage tests/tst_cpuusage.cpp)
    set_target_properties(tst_cpuusage PROPERTIES MACOSX_BUNDLE FALSE AUTOMOC ON)
    target_compile_options(tst_cpuusage PRIVATE ${NT_PLAYER_WARNINGS})
    target_link_libraries(tst_cpuusage PRIVATE nodetool_timeline_scene Qt6::Test)
    add_test(NAME tst_cpuusage COMMAND tst_cpuusage)

    # The standard hooks, through the startup registrars and through
    # registerStandardHooks() (src/preview/StandardHooks.h).
    qt_add_executable(tst_standardhooks tests/tst_standardhooks.cpp)
    target_compile_definitions(tst_standardhooks PRIVATE NT_STARTUP_REGISTRARS)
    target_link_libraries(tst_standardhooks PRIVATE nodetool_timeline_decode
        nodetool_timeline_effects_registrar nodetool_timeline_render2d_registrar Qt6::Test)
    qt_add_executable(tst_standardhooks_explicit tests/tst_standardhooks.cpp)
    target_link_libraries(tst_standardhooks_explicit PRIVATE nodetool_timeline_decode Qt6::Test)
    foreach(test_name tst_standardhooks tst_standardhooks_explicit)
        set_target_properties(${test_name} PROPERTIES MACOSX_BUNDLE FALSE AUTOMOC ON)
        target_compile_options(${test_name} PRIVATE ${NT_PLAYER_WARNINGS})
        add_test(NAME ${test_name} COMMAND ${test_name})
        set_tests_properties(${test_name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    endforeach()
endif()

# A sanitizer build of the timeline (native/timeline/cmake/Sanitizers.cmake)
# fails these tests on a sanitizer report too.
if(COMMAND nt_sanitizer_test_checks)
    nt_sanitizer_test_checks()
endif()
