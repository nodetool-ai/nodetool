cmake_minimum_required(VERSION 3.22)

project(NodeToolTimeline VERSION 0.1.0 LANGUAGES CXX)
if(APPLE)
    enable_language(OBJCXX)
endif()

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
pkg_check_modules(FFMPEG REQUIRED IMPORTED_TARGET libavformat libavcodec libavutil libswscale libswresample)

if(MSVC)
    set(NT_WARNINGS /W4 /permissive-)
    set(NT_NO_WARNINGS /w)
else()
    set(NT_WARNINGS -Wall -Wextra)
    set(NT_NO_WARNINGS -w)
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

# Model and scene evaluation: no GUI, shared by the app and the tests.
add_library(timeline_core STATIC
    src/model/TimelineTypes.h
    src/model/TimelineJson.h src/model/TimelineJson.cpp
    src/scene/Animation.h src/scene/Animation.cpp
    src/scene/ClipScene.h src/scene/ClipScene.cpp
    src/scene/FlexLayout.h src/scene/FlexLayout.cpp
    src/scene/SvgPath.h src/scene/SvgPath.cpp
    src/scene/TextAnimation.h src/scene/TextAnimation.cpp
    src/scene/TextBlock.h src/scene/TextBlock.cpp
    src/preview/SceneEval.h src/preview/SceneEval.cpp
    src/bench/BenchReport.h src/bench/BenchReport.cpp
    src/platform/CpuUsage.h src/platform/CpuUsage.cpp
    src/playback/AudioClockFeed.h src/playback/AudioClockFeed.cpp
    src/ui/TimelineWheel.h src/ui/TimelineWheel.cpp
    src/ui/TimelineFormat.h src/ui/TimelineFormat.cpp
    src/edit/ClipOps.h src/edit/ClipOps.cpp
    src/edit/EditActions.h src/edit/EditActions.cpp
    src/edit/Keymap.h src/edit/Keymap.cpp src/edit/KeymapData.h)
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
add_library(timeline_decode STATIC
    src/preview/LayerSource.h
    src/preview/FrameRing.h src/preview/FrameRing.cpp
    src/preview/YuvFormat.h src/preview/YuvFormat.cpp
    src/preview/FfmpegSource.h src/preview/FfmpegSource.cpp
    src/preview/SourcePool.h src/preview/SourcePool.cpp src/preview/SurfacePool.h
    src/preview/FrameCache.h src/preview/FrameCache.cpp
    src/preview/SyntheticSource.h src/preview/SyntheticSource.cpp
    src/preview/RetireQueue.h
    ${NT_DECODE_PLATFORM_SOURCES})
if(NT_APPLE_CODE)
    set_source_files_properties(src/preview/hw/VideoToolboxInterop.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
endif()
target_link_libraries(timeline_decode PUBLIC timeline_core Qt6::Gui Qt6::GuiPrivate PkgConfig::FFMPEG
    ${NT_DECODE_PLATFORM_LIBS})
target_compile_options(timeline_decode PRIVATE ${NT_WARNINGS})

# Audio (M3): miniaudio device, PCM rings, the mixer, fade curves.
add_library(timeline_audio STATIC
    src/audio/FadeCurves.h src/audio/FadeCurves.cpp
    src/audio/PcmRing.h
    src/audio/Mixer.h src/audio/Mixer.cpp
    src/audio/AudioSource.h src/audio/AudioSource.cpp
    src/audio/OutputLatency.h src/audio/OutputLatency.cpp
    src/audio/AudioEngine.h src/audio/AudioEngine.cpp
    src/audio/LoopbackCapture.h src/audio/LoopbackCapture.cpp
    src/audio/AudioMode.h src/audio/AudioMode.cpp
    src/audio/miniaudio.cpp)
target_include_directories(timeline_audio PRIVATE third_party)
target_link_libraries(timeline_audio PUBLIC timeline_core PkgConfig::FFMPEG ${NT_AUDIO_PLATFORM_LIBS})
target_compile_options(timeline_audio PRIVATE ${NT_WARNINGS})
# Third-party code: its own warnings are not ours to fix.
set_source_files_properties(src/audio/miniaudio.cpp PROPERTIES COMPILE_OPTIONS "${NT_NO_WARNINGS}")

qt_add_executable(nodetool-timeline src/main.cpp ${NT_APP_PLATFORM_SOURCES}
    src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp
    src/bench/ScrubRun.h src/bench/ScrubRun.cpp
    src/ui/UiBench.h src/ui/UiBench.cpp)
# The edit operations one call at a time, for scripts/op-conformance.mjs.
# Core only: no GUI, so a call starts in milliseconds.
qt_add_executable(timeline-ops src/edit/OpCli.h src/edit/OpCli.cpp)
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
# The NodeTool.Timeline QML module. The app and the UI test (tst_tracksui)
# each build it, the test into its own output folder.
function(nt_add_timeline_qml target)
    qt_add_qml_module(${target}
        URI NodeTool.Timeline
        ${ARGN}
        QML_FILES
            qml/TimelineEditor.qml
            qml/Theme.qml
            qml/Icons.qml
            qml/Icon.qml
            qml/TransportButton.qml
            qml/preview/PreviewArea.qml
            qml/Tracks/TracksRegion.qml
            qml/Tracks/TimeRuler.qml
            qml/Tracks/TrackHeader.qml
            qml/Tracks/TrackIconButton.qml
            qml/Tracks/TrackLane.qml
            qml/Tracks/Clip.qml
            qml/Tracks/ClipBody.qml
            qml/Tracks/FadeRamp.qml
            qml/Tracks/Playhead.qml
            qml/Tracks/TimelineZoomControls.qml
            qml/Tracks/ZoomStepButton.qml
            qml/Tracks/CompactSlider.qml
            qml/Tracks/TrackHeightSlider.qml
            qml/Tracks/TimelineScrollbar.qml
            qml/Tracks/ToolButton.qml
            qml/Tracks/ToolbarDivider.qml
            qml/Tracks/ToolToggle.qml
            qml/Tracks/ShortcutsSheet.qml
            qml/DocumentBar.qml
            qml/SaveStatus.qml
            qml/SaveBanners.qml
        RESOURCES
            fonts/inter-latin-400-normal.woff2
            fonts/inter-latin-500-normal.woff2
            fonts/inter-latin-600-normal.woff2
            fonts/jetbrains-mono-latin-400-normal.woff2
            fonts/jetbrains-mono-latin-500-normal.woff2
            fonts/jetbrains-mono-latin-600-normal.woff2
        SOURCES
            src/model/TimelineModel.h src/model/TimelineModel.cpp
            src/model/TrackListModel.h src/model/TrackListModel.cpp
            src/model/TrackWindowModel.h src/model/TrackWindowModel.cpp
            src/model/LaneClipModel.h src/model/LaneClipModel.cpp
            src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
            src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
            src/ui/TimelineViewState.h src/ui/TimelineViewState.cpp
            src/ui/TimelineGestureArea.h src/ui/TimelineGestureArea.cpp
            src/ui/RulerCanvas.h src/ui/RulerCanvas.cpp
            src/ui/MediaPreviews.h src/ui/MediaPreviews.cpp
            src/ui/BenchMedia.h src/ui/BenchMedia.cpp
            src/ui/MediaVersion.h
            src/ui/TimelineFormatQml.h
            src/edit/ClipGestureController.h src/edit/ClipGestureController.cpp)
    qt_add_shaders(${target} "${target}_compositor_shaders"
        PREFIX "/shaders"
        BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    # The generated QML type registrations include the headers by base name.
    target_include_directories(${target} PRIVATE src/model src/playback src/preview src/ui src/edit)
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
target_sources(nodetool-timeline PRIVATE src/audio/AppAudio.h src/audio/AppAudio.cpp
    src/audio/AudioCli.h src/audio/AudioCli.cpp)

# Audio tests (M3): fade curves against the TypeScript vectors, the mixer,
# the PCM ring, the audio source, and the clock with a fake device.
foreach(test_name tst_fadecurves tst_mixer tst_audioclock tst_audioengine)
    qt_add_executable(${test_name} tests/${test_name}.cpp)
    set_target_properties(${test_name} PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(${test_name} PRIVATE ${NT_WARNINGS})
    target_compile_definitions(${test_name} PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_BUILD_DIR="${CMAKE_CURRENT_BINARY_DIR}")
    target_include_directories(${test_name} PRIVATE src/playback)
    target_link_libraries(${test_name} PRIVATE timeline_core timeline_audio Qt6::Test)
    add_test(NAME ${test_name} COMMAND ${test_name})
endforeach()
target_sources(tst_audioclock PRIVATE src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
target_link_libraries(tst_audioclock PRIVATE Qt6::Qml)
# The curve vectors come from the TypeScript functions on every run.
add_test(NAME fade_vectors COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/fade-vectors.mjs
    --out ${CMAKE_CURRENT_BINARY_DIR}/fade-vectors.json)
set_tests_properties(fade_vectors PROPERTIES FIXTURES_SETUP fadevectors)
set_tests_properties(tst_fadecurves PROPERTIES FIXTURES_REQUIRED fadevectors)
set_tests_properties(tst_mixer tst_audioengine PROPERTIES FIXTURES_REQUIRED media)
# The offline mix against the reference built from the TypeScript rules, and
# the headless A/V sync (offline and on the null device: no sound).
add_test(NAME mix_reference COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/check-mix.mjs
    --bin $<TARGET_FILE:nodetool-timeline>)
add_test(NAME av_sync COMMAND $<TARGET_FILE:nodetool-timeline> ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --av-sync)
add_test(NAME av_sync_fractional COMMAND $<TARGET_FILE:nodetool-timeline>
    ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync-fractional.json --av-sync)
set_tests_properties(mix_reference av_sync av_sync_fractional PROPERTIES FIXTURES_REQUIRED media)
# The audio mode main() selects, without opening a device (review F2): both
# spellings of an automated mode select none.
add_test(NAME audio_mode_play_stills COMMAND $<TARGET_FILE:nodetool-timeline>
    ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --play-stills /tmp/nt-unused --still-frames 1 --audio-dry-run)
add_test(NAME audio_mode_play_stills_equals COMMAND $<TARGET_FILE:nodetool-timeline>
    ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --play-stills=/tmp/nt-unused --still-frames=1 --audio-dry-run)
set_tests_properties(audio_mode_play_stills audio_mode_play_stills_equals PROPERTIES
    PASS_REGULAR_EXPRESSION "audio mode: none" FAIL_REGULAR_EXPRESSION "audio mode: (system|null)"
    ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

foreach(test_name tst_cpuusage tst_sceneeval tst_timelinejson tst_benchreport tst_framering tst_yuvformat tst_ffmpegsource tst_sourcepool tst_retirequeue tst_framecache tst_surfacepool tst_timelinewheel tst_editactions)
    qt_add_executable(${test_name} tests/${test_name}.cpp)
    set_target_properties(${test_name} PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(${test_name} PRIVATE ${NT_WARNINGS})
    target_compile_definitions(${test_name} PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(${test_name} PRIVATE timeline_core timeline_decode Qt6::Test)
    add_test(NAME ${test_name} COMMAND ${test_name})
endforeach()

# The decoder tests read media from scripts/make-fixtures.sh, which keeps
# files that exist, so the setup is quick after the first run.
# Through an explicit bash: CTest on Windows cannot execute a .sh, and the
# bash.exe in System32 is WSL's, so Git's comes first there (M6).
find_program(NT_BASH NAMES bash HINTS "C:/Program Files/Git/bin" "$ENV{ProgramFiles}/Git/bin" NO_CACHE REQUIRED)
add_test(NAME make_fixtures COMMAND ${NT_BASH} ${CMAKE_CURRENT_SOURCE_DIR}/scripts/make-fixtures.sh)
set_tests_properties(make_fixtures PROPERTIES FIXTURES_SETUP media)
set_tests_properties(tst_ffmpegsource PROPERTIES FIXTURES_REQUIRED media)
if(NT_APPLE_CODE)
    target_link_libraries(tst_ffmpegsource PRIVATE "-framework CoreVideo")
endif()
target_link_libraries(tst_sourcepool PRIVATE Qt6::Network)

# The tracks UI (M2): the QML module in an offscreen QQuickView with the
# software scene graph, driven by synthetic wheel, gesture and mouse events.
qt_add_executable(tst_tracksui tests/tst_tracksui.cpp)
set_target_properties(tst_tracksui PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(tst_tracksui PRIVATE ${NT_WARNINGS})
target_compile_definitions(tst_tracksui PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
target_link_libraries(tst_tracksui PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick
    Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
nt_add_timeline_qml(tst_tracksui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_tracksui_qml/NodeTool/Timeline)
# Linux: the render-control case attaches a Vulkan instance (hw::prepareWindow)
# when the scene graph runs on Vulkan, as CI and the render tests do.
if(UNIX AND NOT APPLE)
    target_sources(tst_tracksui PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
endif()
add_test(NAME tst_tracksui COMMAND tst_tracksui)
# No window is ever shown: the offscreen platform and the software renderer.
set_tests_properties(tst_tracksui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

# Server read and asset cache (M5a): the tRPC client, the D33 disk cache, the
# loader report, and `--server URL --timeline ID` in the app.
find_package(Qt6 6.12 REQUIRED COMPONENTS Network)
add_library(timeline_server STATIC
    src/server/ServerClient.h src/server/ServerClient.cpp
    src/server/AssetCache.h src/server/AssetCache.cpp
    src/server/FieldAudit.h src/server/FieldAudit.cpp
    src/server/ServerTimeline.h src/server/ServerTimeline.cpp
    src/server/ServerSource.h src/server/ServerSource.cpp
    src/server/AutosaveController.h src/server/AutosaveController.cpp)
target_link_libraries(timeline_server PUBLIC timeline_core timeline_decode Qt6::Network)
target_compile_options(timeline_server PRIVATE ${NT_WARNINGS})
# The save banners are tested against the real AutosaveController (M2b).
target_link_libraries(tst_tracksui PRIVATE timeline_server)
target_link_libraries(nodetool-timeline PRIVATE timeline_server)
# The save harness needs TimelineModel, which the app's QML module compiles.
target_sources(nodetool-timeline PRIVATE src/server/SaveCli.h src/server/SaveCli.cpp)

# Cache and client tests against an in-process HTTP server (no NodeTool server).
foreach(test_name tst_assetcache tst_serverclient tst_autosave)
    qt_add_executable(${test_name} tests/${test_name}.cpp)
    set_target_properties(${test_name} PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(${test_name} PRIVATE ${NT_WARNINGS})
    target_link_libraries(${test_name} PRIVATE timeline_server Qt6::Test)
    add_test(NAME ${test_name} COMMAND ${test_name})
    set_tests_properties(${test_name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endforeach()

# M4 exit 3: an edit reaches the preview on the next frame. Renders with
# QQuickRenderControl on the platform QRhi (no window), so it links the
# compositor and the model directly instead of the QML module.
qt_add_executable(tst_editpreview tests/tst_editpreview.cpp
    src/model/TimelineModel.h src/model/TimelineModel.cpp
    src/model/TrackListModel.h src/model/TrackListModel.cpp
    src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
    src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
    src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
set_target_properties(tst_editpreview PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_definitions(tst_editpreview PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
target_compile_options(tst_editpreview PRIVATE ${NT_WARNINGS})
target_link_libraries(tst_editpreview PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml
    Qt6::Quick Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
qt_add_shaders(tst_editpreview "tst_editpreview_shaders"
    PREFIX "/shaders"
    BASE shaders
    FILES shaders/composite.vert shaders/composite.frag)
add_test(NAME tst_editpreview COMMAND tst_editpreview)
# The label `render` marks the tests that need the platform QRhi: no
# QT_QPA_PLATFORM=offscreen (that platform has no QRhi, so Qt Quick falls back
# to the software scene graph). CI runs them on Cocoa/Metal, on xcb under Xvfb
# with Vulkan on lavapipe, and on the Windows platform with D3D11 on WARP, and
# checks the backend in their log (.github/workflows/native-timeline.yml).
# The window-event tests set the offscreen platform in their ENVIRONMENT.
set_tests_properties(tst_editpreview PROPERTIES LABELS render)
# Linux: the VAAPI interop's frame completion marks on a Vulkan QRhi.
if(UNIX AND NOT APPLE AND Vulkan_FOUND AND LIBVA_FOUND)
    qt_add_executable(tst_vulkaninterop tests/tst_vulkaninterop.cpp)
    target_compile_options(tst_vulkaninterop PRIVATE ${NT_WARNINGS})
    target_compile_definitions(tst_vulkaninterop PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(tst_vulkaninterop PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Test
        PkgConfig::FFMPEG)
    add_test(NAME tst_vulkaninterop COMMAND tst_vulkaninterop)
    set_tests_properties(tst_vulkaninterop PROPERTIES LABELS render FIXTURES_REQUIRED media)
endif()
# Native easing against the web's values (scene/Animation.h).
qt_add_executable(tst_easing tests/tst_easing.cpp)
set_target_properties(tst_easing PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(tst_easing PRIVATE ${NT_WARNINGS})
target_compile_definitions(tst_easing PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
target_link_libraries(tst_easing PRIVATE timeline_core Qt6::Test)
add_test(NAME tst_easing COMMAND tst_easing)
# The flex layout port's pure parts against the TypeScript values (scene/FlexLayout.h).
# It links TimelineModel to check that every edit makes a new revision.
qt_add_executable(tst_flexlayout tests/tst_flexlayout.cpp
    src/model/TimelineModel.h src/model/TimelineModel.cpp
    src/model/TrackListModel.h src/model/TrackListModel.cpp)
set_target_properties(tst_flexlayout PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(tst_flexlayout PRIVATE ${NT_WARNINGS})
target_link_libraries(tst_flexlayout PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
add_test(NAME tst_flexlayout COMMAND tst_flexlayout)
# The comparison helpers of scripts/plan-conformance.mjs (node:test).
add_test(NAME plan_compare COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/plan-compare.test.mjs)
# The scratch-server safety rules of scripts/server-check.mjs (node:test).
add_test(NAME scratch_safety COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/scratch-safety.test.mjs)
# The verdicts of scripts/web-baseline.mjs and scripts/peaks-check.mjs on
# mocked inputs (node:test; no server, no browser).
add_test(NAME web_baseline_checks COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/web-baseline.test.mjs)
add_test(NAME peaks_check_plan COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/peaks-check.test.mjs)
# The bundle dependency audit of scripts/macho-deps.py (review F5): builds
# tiny Mach-O files with clang.
if(APPLE)
    find_program(NT_PYTHON3 NAMES python3 NO_CACHE REQUIRED)
    add_test(NAME macho_deps COMMAND ${NT_PYTHON3} ${CMAKE_CURRENT_SOURCE_DIR}/scripts/macho-deps.test.py)
endif()
# Scene evaluation cost per frame (manual bench, not a ctest).
qt_add_executable(bench_scene tests/bench_scene.cpp)
set_target_properties(bench_scene PROPERTIES MACOSX_BUNDLE FALSE)
target_link_libraries(bench_scene PRIVATE timeline_core)
