cmake_minimum_required(VERSION 3.24)

project(NodeToolTimeline VERSION 0.1.0 LANGUAGES CXX)
if(APPLE)
    enable_language(OBJCXX)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(CTest)

include(cmake/Hardening.cmake)
include(cmake/Sanitizers.cmake)

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
pkg_check_modules(FFMPEG REQUIRED IMPORTED_TARGET libavformat libavcodec libavutil libswscale libswresample)

if(MSVC)
    set(NT_WARNINGS /W4 /permissive-)
    set(NT_NO_WARNINGS /w)
else()
    set(NT_WARNINGS -Wall -Wextra)
    set(NT_NO_WARNINGS -w)
endif()

# Apple's libc++ keeps std::jthread and std::stop_token behind this flag.
if(CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
    add_compile_options($<$<COMPILE_LANGUAGE:CXX>:-fexperimental-library>)
    add_link_options(-fexperimental-library)
endif()

# Platforms (M6). The hardware decode path is chosen at compile time
# (src/preview/hw/HwInterop.h): VideoToolbox on macOS, D3D11VA on Windows,
# VAAPI with DMA-BUF import into Vulkan on Linux when libva and Vulkan are
# found, else none (software decode only).
# NT_PORTABLE builds the code of the other platforms on macOS: no
# VideoToolbox and the portable platform code, so it compiles and its tests
# run on the development machine.
option(NT_PORTABLE "macOS: build the non-Apple code paths (no VideoToolbox, portable platform code)" OFF)
set(NT_APPLE_CODE OFF)
if(APPLE AND NOT NT_PORTABLE)
    set(NT_APPLE_CODE ON)
endif()
set(NT_PLATFORM_DEFINES "")
if(NT_PORTABLE)
    list(APPEND NT_PLATFORM_DEFINES NT_HW_NONE NT_PORTABLE_PLATFORM)
endif()
set(NT_DECODE_PLATFORM_SOURCES src/preview/hw/HwInterop.h src/preview/hw/HwInterop.cpp)
set(NT_DECODE_PLATFORM_LIBS "")
if(NT_APPLE_CODE)
    list(APPEND NT_DECODE_PLATFORM_SOURCES src/preview/hw/VideoToolboxInterop.h src/preview/hw/VideoToolboxInterop.mm)
    set(NT_DECODE_PLATFORM_LIBS "-framework CoreVideo" "-framework IOSurface" "-framework Metal" "-framework Foundation")
elseif(APPLE)
    # NT_PORTABLE: QRhi's Metal backend still runs the compositor.
    set(NT_DECODE_PLATFORM_LIBS "-framework Foundation")
elseif(WIN32)
    list(APPEND NT_DECODE_PLATFORM_SOURCES src/preview/hw/D3D11Interop.h src/preview/hw/D3D11Interop.cpp)
    set(NT_DECODE_PLATFORM_LIBS d3d11 dxgi)
elseif(UNIX)
    find_package(Vulkan)
    pkg_check_modules(LIBVA IMPORTED_TARGET libva libva-drm)
    if(Vulkan_FOUND AND LIBVA_FOUND)
        list(APPEND NT_DECODE_PLATFORM_SOURCES src/preview/hw/VulkanInterop.h src/preview/hw/VulkanInterop.cpp)
        list(APPEND NT_PLATFORM_DEFINES NT_HAVE_VAAPI_VULKAN)
        set(NT_DECODE_PLATFORM_LIBS Vulkan::Vulkan PkgConfig::LIBVA)
    else()
        message(STATUS "nodetool-timeline: no libva or Vulkan, software decode only")
    endif()
endif()
if(APPLE)
    set(NT_AUDIO_PLATFORM_LIBS "-framework CoreAudio" "-framework AudioToolbox" "-framework CoreFoundation")
elseif(UNIX)
    # miniaudio loads ALSA and PulseAudio at run time.
    find_package(Threads REQUIRED)
    set(NT_AUDIO_PLATFORM_LIBS ${CMAKE_DL_LIBS} Threads::Threads m)
else()
    set(NT_AUDIO_PLATFORM_LIBS "")
endif()
if(NT_APPLE_CODE)
    set(NT_APP_PLATFORM_SOURCES src/platform/ProcessActivity.h src/platform/ProcessActivity.mm
        src/platform/SchedulingDiagnostics.h src/platform/SchedulingDiagnostics.mm)
    set_source_files_properties(src/platform/ProcessActivity.mm src/platform/SchedulingDiagnostics.mm
        PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
    set(NT_APP_PLATFORM_LIBS "-framework Foundation" "-framework AppKit")
else()
    set(NT_APP_PLATFORM_SOURCES src/platform/ProcessActivity.h src/platform/SchedulingDiagnostics.h
        src/platform/PlatformStubs.cpp)
    set(NT_APP_PLATFORM_LIBS ${NT_DECODE_PLATFORM_LIBS})
endif()
add_compile_definitions(${NT_PLATFORM_DEFINES})

# Yoga 3.2.1, the flex layout of the web scene model (third_party/yoga).
# No fused multiply-add: the web runs it as WebAssembly, which has none.
file(GLOB_RECURSE NT_YOGA_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/third_party/yoga/yoga/*.cpp)
add_library(yogacore STATIC ${NT_YOGA_SOURCES})
target_include_directories(yogacore PUBLIC third_party/yoga)
target_compile_features(yogacore PUBLIC cxx_std_20)
target_compile_options(yogacore PRIVATE ${NT_NO_WARNINGS})
if(NOT MSVC)
    target_compile_options(yogacore PRIVATE -ffp-contract=off)
endif()

# A module contributes to a target group or registers a test callback. All
# app registration sources compile directly into each consuming executable.
function(nt_sources group)
    set_property(GLOBAL APPEND PROPERTY NT_${group} ${ARGN})
endfunction()
function(nt_target_sources target)
    get_property(sources GLOBAL PROPERTY NT_${target})
    if(sources)
        target_sources(${target} PRIVATE ${sources})
    endif()
endfunction()
function(nt_qml_files)
    nt_sources(qml_files ${ARGN})
endfunction()
function(nt_qml_sources)
    nt_sources(qml ${ARGN})
    foreach(source IN LISTS ARGN)
        get_filename_component(directory "${source}" DIRECTORY)
        nt_sources(qml_includes "${CMAKE_CURRENT_SOURCE_DIR}/${directory}")
    endforeach()
endfunction()
function(nt_qt_test name)
    cmake_parse_arguments(TEST "" "" "LIBS;DEFINES;INCLUDES" ${ARGN})
    qt_add_executable(${name} tests/${name}.cpp)
    set_target_properties(${name} PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(${name} PRIVATE ${NT_WARNINGS})
    if(TEST_DEFINES)
        target_compile_definitions(${name} PRIVATE ${TEST_DEFINES})
    endif()
    if(TEST_INCLUDES)
        target_include_directories(${name} PRIVATE ${TEST_INCLUDES})
    endif()
    target_link_libraries(${name} PRIVATE ${TEST_LIBS})
    add_test(NAME ${name} COMMAND ${name})
endfunction()
function(nt_tests callback)
    set_property(GLOBAL APPEND PROPERTY NT_test_callbacks ${callback})
endfunction()
file(GLOB_RECURSE NT_MODULES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/*/module.cmake"
    "${CMAKE_CURRENT_SOURCE_DIR}/qml/module.cmake")
list(SORT NT_MODULES)
foreach(module IN LISTS NT_MODULES)
    include(${module})
endforeach()
foreach(group core decode audio app ops qml qml_files qml_resources qml_includes server bench_scene)
    get_property(NT_${group} GLOBAL PROPERTY NT_${group})
endforeach()

include(src/app/QmlDiscovery.cmake)

add_subdirectory(../model-picker ${CMAKE_CURRENT_BINARY_DIR}/model-picker)

# Model and scene evaluation: no GUI, shared by the app and the tests.
add_library(timeline_core STATIC ${NT_core})
target_include_directories(timeline_core PUBLIC src)
target_link_libraries(timeline_core PUBLIC Qt6::Core PRIVATE yogacore)
target_compile_options(timeline_core PRIVATE ${NT_WARNINGS})
# The scene port computes what the web computes in JavaScript, one rounding
# per operation: no fused multiply-add (Clang contracts by default).
if(NOT MSVC)
    set_source_files_properties(
        src/scene/Animation.cpp src/scene/ClipScene.cpp src/scene/FlexLayout.cpp src/scene/SvgPath.cpp
        src/scene/TextAnimation.cpp src/scene/TextBlock.cpp src/preview/SceneEval.cpp
        TARGET_DIRECTORY timeline_core PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

# Decode and GPU sources: FFmpeg, QRhi textures, the source pool.
add_library(timeline_decode STATIC ${NT_decode})
if(NT_APPLE_CODE)
    set_source_files_properties(src/preview/hw/VideoToolboxInterop.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
endif()
target_link_libraries(timeline_decode PUBLIC timeline_core Qt6::Gui Qt6::GuiPrivate PkgConfig::FFMPEG
    ${NT_DECODE_PLATFORM_LIBS})
target_compile_options(timeline_decode PRIVATE ${NT_WARNINGS})

# Audio (M3): miniaudio device, PCM rings, the mixer, fade curves.
add_library(timeline_audio STATIC ${NT_audio})
target_include_directories(timeline_audio PRIVATE third_party)
target_link_libraries(timeline_audio PUBLIC timeline_core PkgConfig::FFMPEG ${NT_AUDIO_PLATFORM_LIBS})
target_compile_options(timeline_audio PRIVATE ${NT_WARNINGS})
# Third-party code: its own warnings are not ours to fix.
set_source_files_properties(src/audio/miniaudio.cpp PROPERTIES COMPILE_OPTIONS "${NT_NO_WARNINGS}")

qt_add_executable(nodetool-timeline src/main.cpp ${NT_app})
add_subdirectory(../chat ${CMAKE_CURRENT_BINARY_DIR}/chat)
target_link_libraries(nodetool-timeline PRIVATE nodetool_chat nodetool_chatplugin)
# The edit operations one call at a time, for scripts/op-conformance.mjs.
# Core only: no GUI, so a call starts in milliseconds.
qt_add_executable(timeline-ops ${NT_ops})
set_target_properties(timeline-ops PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(timeline-ops PRIVATE ${NT_WARNINGS})
target_link_libraries(timeline-ops PRIVATE timeline_core)
# A .app bundle only for packaging (scripts/package-macos.sh); the checks
# run the plain executable.
option(NT_MACOS_BUNDLE "macOS: build nodetool-timeline as an .app bundle" OFF)
set_target_properties(nodetool-timeline PROPERTIES MACOSX_BUNDLE ${NT_MACOS_BUNDLE}
    MACOSX_BUNDLE_GUI_IDENTIFIER ai.nodetool.timeline MACOSX_BUNDLE_BUNDLE_NAME "NodeTool Timeline"
    MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION} MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION})
target_compile_options(nodetool-timeline PRIVATE ${NT_WARNINGS})
target_link_libraries(nodetool-timeline PRIVATE
    ${NT_APP_PLATFORM_LIBS} timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG)

set_source_files_properties(qml/Theme.qml qml/Icons.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
# Compile the QML module once. Whole-archive linkage preserves its generated
# type/resource initializers and C++ registrars without a runtime plugin file.
# App-only registrations stay in NT_app and remain specific to each host.
qt_add_library(timeline_qml STATIC)
target_compile_options(timeline_qml PRIVATE ${NT_WARNINGS})
qt_add_qml_module(timeline_qml
    URI NodeTool.Timeline
    NO_PLUGIN
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Timeline
    QML_FILES ${NT_qml_files}
    RESOURCES ${NT_qml_resources}
    SOURCES ${NT_qml})
qt_add_shaders(timeline_qml timeline_compositor_shaders
    PREFIX "/shaders"
    BASE shaders
    FILES shaders/composite.vert shaders/composite.frag)
list(REMOVE_DUPLICATES NT_qml_includes)
target_include_directories(timeline_qml PUBLIC src/model src/playback src/preview src/ui src/edit ${NT_qml_includes})
target_link_libraries(timeline_qml PUBLIC timeline_core timeline_decode timeline_audio
    nodetool_model_picker nodetool_chat Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG)

function(nt_add_timeline_qml target)
    # OUTPUT_DIRECTORY belonged to the former per-executable module. Keep the
    # call interface so host-specific sources, resources and definitions stay local.
    cmake_parse_arguments(HOST "" "OUTPUT_DIRECTORY" "" ${ARGN})
    if(HOST_UNPARSED_ARGUMENTS)
        message(FATAL_ERROR "Unexpected QML host arguments: ${HOST_UNPARSED_ARGUMENTS}")
    endif()
    # Some hosts explicitly listed a module source before the module was added.
    # It must now come only from the archive, including registrar-only sources.
    get_target_property(host_sources ${target} SOURCES)
    list(REMOVE_ITEM host_sources ${NT_qml})
    set_property(TARGET ${target} PROPERTY SOURCES "${host_sources}")
    target_link_libraries(${target} PRIVATE "$<LINK_LIBRARY:WHOLE_ARCHIVE,timeline_qml>"
        nodetool_model_pickerplugin nodetool_chatplugin)
endfunction()
nt_add_timeline_qml(nodetool-timeline)
# Compile-only check of the Linux hardware path on macOS: with a
# Vulkan-Headers include folder, VulkanInterop.cpp and the Linux branch of
# HwWindow.cpp compile against Qt's Vulkan API and FFmpeg's DRM headers. The
# objects are not linked (scripts/check-portable.sh).
set(NT_CHECK_VULKAN_HEADERS "" CACHE PATH "macOS: a Vulkan-Headers include folder, to compile the Linux hardware path")
if(APPLE AND NT_CHECK_VULKAN_HEADERS)
    add_library(nt_linux_hw_check OBJECT src/preview/hw/VulkanInterop.cpp src/preview/hw/HwWindow.cpp)
    target_compile_definitions(nt_linux_hw_check PRIVATE NT_HW_SYNTAX_CHECK_VAAPI)
    target_include_directories(nt_linux_hw_check PRIVATE ${NT_CHECK_VULKAN_HEADERS})
    target_link_libraries(nt_linux_hw_check PRIVATE timeline_core Qt6::Gui Qt6::GuiPrivate Qt6::Quick PkgConfig::FFMPEG)
    target_compile_options(nt_linux_hw_check PRIVATE ${NT_WARNINGS})
endif()

target_link_libraries(nodetool-timeline PRIVATE timeline_audio)


find_package(Qt6 6.12 REQUIRED COMPONENTS Network WebSockets)
add_library(timeline_server STATIC ${NT_server})
target_link_libraries(timeline_server PUBLIC timeline_core timeline_decode Qt6::Network Qt6::WebSockets)
target_compile_options(timeline_server PRIVATE ${NT_WARNINGS})
# QML controllers include server headers, including their WebSocket types.
target_link_libraries(timeline_qml PUBLIC timeline_server)
# The save banners are tested against the real AutosaveController (M2b).
target_link_libraries(nodetool-timeline PRIVATE timeline_server)
# The save harness needs TimelineModel, which the app's QML module compiles.


# Scene evaluation cost per frame (manual bench, not a ctest).
qt_add_executable(bench_scene ${NT_bench_scene})
set_target_properties(bench_scene PROPERTIES MACOSX_BUNDLE FALSE)
target_link_libraries(bench_scene PRIVATE timeline_core)

get_property(NT_TEST_CALLBACKS GLOBAL PROPERTY NT_test_callbacks)
foreach(callback IN LISTS NT_TEST_CALLBACKS)
    cmake_language(CALL ${callback})
endforeach()

if(NT_FUZZ)
    add_subdirectory(tests/fuzz)
endif()
if(NT_SANITIZER_PLANTS)
    add_subdirectory(tools/sanitizers/plants)
endif()
nt_sanitizer_test_checks()
# Visual Studio does not emit compile_commands.json.
if(CMAKE_GENERATOR MATCHES "Ninja|Makefiles")
    add_test(NAME shared_qml_build COMMAND ${CMAKE_COMMAND}
        -DNT_BUILD_DIR=${CMAKE_CURRENT_BINARY_DIR}
        -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/tests/SharedQmlBuild.cmake)
endif()

include(cmake/TestPreferences.cmake)
nt_isolate_test_preferences()
