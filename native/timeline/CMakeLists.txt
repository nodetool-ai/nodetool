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
find_package(Qt6 6.12 REQUIRED COMPONENTS Svg Core Gui GuiPrivate Qml Quick QuickPrivate QuickControls2 ShaderTools Test QuickTest)
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
else()
    set(NT_WARNINGS -Wall -Wextra)
endif()

# Apple's libc++ keeps std::jthread and std::stop_token behind this flag.
if(CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
    add_compile_options($<$<COMPILE_LANGUAGE:CXX>:-fexperimental-library>)
    add_link_options(-fexperimental-library)
endif()

# Platforms (M6). The hardware decode path and its libraries are chosen in
# native/timeline-player and propagate through nodetool_timeline_decode.
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

# The timeline player: the document model and scene evaluation
# (nodetool_timeline_scene), decode, effects and render2d
# (nodetool_timeline_decode), and the QML module NodeTool.TimelinePlayer
# with the clock and the compositor (nodetool_timeline_player), which the
# node editor also builds. render2d
# falls back to the repository's fonts in a build tree.
set(NT_PLAYER_FONTS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/fonts")
# The player's TimelinePlayer.qml uses NodeTool.UiPrimitives, so add it first.
if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
if(NOT TARGET nodetool_timeline_scene)
    add_subdirectory(../timeline-player ${CMAKE_CURRENT_BINARY_DIR}/timeline-player)
endif()
get_target_property(NT_UI_IMPORT_PATH nodetool_ui_primitives BINARY_DIR)
get_target_property(NT_PLAYER_IMPORT_PATH nodetool_timeline_player BINARY_DIR)
get_target_property(NT_PLAYER_DECODE_DEFINITIONS nodetool_timeline_decode INTERFACE_COMPILE_DEFINITIONS)
# The startup registrars of the standard preview hooks: each executable that
# renders with those hooks compiles them in (timeline-player README).
set(NT_EFFECTS_REGISTRAR $<TARGET_OBJECTS:nodetool_timeline_effects_registrar>)
set(NT_RENDER2D_REGISTRAR $<TARGET_OBJECTS:nodetool_timeline_render2d_registrar>)
set(NT_PLAYBACK_REGISTRAR $<TARGET_OBJECTS:nodetool_timeline_playback_registrar>)

if(NT_APPLE_CODE)
    set(NT_APP_PLATFORM_SOURCES src/platform/ProcessActivity.h src/platform/ProcessActivity.mm
        src/platform/SchedulingDiagnostics.h src/platform/SchedulingDiagnostics.mm)
    set_source_files_properties(src/platform/ProcessActivity.mm src/platform/SchedulingDiagnostics.mm
        PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
    set(NT_APP_PLATFORM_LIBS "-framework Foundation" "-framework AppKit")
else()
    set(NT_APP_PLATFORM_SOURCES src/platform/ProcessActivity.h src/platform/SchedulingDiagnostics.h
        src/platform/PlatformStubs.cpp)
endif()
add_compile_definitions(${NT_PLATFORM_DEFINES})

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
    cmake_parse_arguments(TEST "" "" "LIBS;DEFINES;INCLUDES;SOURCES" ${ARGN})
    if(NOT TEST_SOURCES)
        set(TEST_SOURCES tests/${name}.cpp)
    endif()
    qt_add_executable(${name} ${TEST_SOURCES})
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
set(NT_MODULES
    qml/dock/module.cmake
    qml/menus/module.cmake
    src/account/module.cmake
    src/activity/local/module.cmake
    src/activity/module.cmake
    src/activity/ui/module.cmake
    src/ai/catalog/module.cmake
    src/ai/module.cmake
    src/aiassist/module.cmake
    src/app/Menus/module.cmake
    src/app/Preferences/module.cmake
    src/app/example/module.cmake
    src/app/module.cmake
    src/app/startup/module.cmake
    src/assets/librarydata/module.cmake
    src/assets/librarypreview/module.cmake
    src/assets/libraryscrub/module.cmake
    src/assets/libraryui/module.cmake
    src/assets/module.cmake
    src/audio/automation/module.cmake
    src/audio/effects/module.cmake
    src/audio/hooks/module.cmake
    src/audio/module.cmake
    src/audio/vst/module.cmake
    src/bench/module.cmake
    src/chat/module.cmake
    src/color/module.cmake
    src/colorpanel/module.cmake
    src/edit/audioroles/module.cmake
    src/edit/clipaudio/module.cmake
    src/edit/clipboard/module.cmake
    src/edit/clipeffects/module.cmake
    src/edit/framehold/module.cmake
    src/edit/groups/module.cmake
    src/edit/inspectorsections/module.cmake
    src/edit/keyframes/module.cmake
    src/edit/keys/module.cmake
    src/edit/module.cmake
    src/edit/registry/module.cmake
    src/edit/sourceEdit/module.cmake
    src/edit/speed/module.cmake
    src/edit/targeting/module.cmake
    src/edit/tracks/module.cmake
    src/edit/transitions/module.cmake
    src/edit/trim/module.cmake
    src/entities/module.cmake
    src/export/module.cmake
    src/interchange/module.cmake
    src/markers/module.cmake
    src/midi/module.cmake
    src/model/hooks/module.cmake
    src/model/module.cmake
    src/motion/beat/module.cmake
    src/motion/blur/module.cmake
    src/motion/blurcontrols/module.cmake
    src/motion/border/module.cmake
    src/motion/capacity/module.cmake
    src/motion/capturedeadline/module.cmake
    src/motion/conformance/module.cmake
    src/motion/controls/module.cmake
    src/motion/dof/module.cmake
    src/motion/gesture/module.cmake
    src/motion/maskoutsets/module.cmake
    src/motion/mattes/module.cmake
    src/motion/module.cmake
    src/motion/orientation/module.cmake
    src/motion/pixels/module.cmake
    src/motion/prism/module.cmake
    src/motion/shipped/module.cmake
    src/motion/tracking/module.cmake
    src/motion/wipe/module.cmake
    src/music/module.cmake
    src/platform/module.cmake
    src/playback/module.cmake
    src/preview/compose/module.cmake
    src/preview/crop/module.cmake
    src/preview/effects/module.cmake
    src/preview/gizmo/module.cmake
    src/preview/layers/module.cmake
    src/preview/module.cmake
    src/preview/transitions/module.cmake
    src/projectfiles/module.cmake
    src/providersettings/module.cmake
    src/reference/module.cmake
    src/remix/clip/module.cmake
    src/remix/module.cmake
    src/render2d/module.cmake
    src/scene/module.cmake
    src/scenedetect/module.cmake
    src/server/TimelineList/module.cmake
    src/server/module.cmake
    src/server/projectfolder/module.cmake
    src/server/recovery/module.cmake
    src/server/sync/module.cmake
    src/storyworkspace/module.cmake
    src/takes/module.cmake
    src/transcript/module.cmake
    src/ui/Tempo/module.cmake
    src/ui/module.cmake
    src/wiring/module.cmake
    src/wiring/w/module.cmake
)
foreach(module IN LISTS NT_MODULES)
    include(${module})
endforeach()
foreach(group core decode audio app ops qml qml_files qml_resources qml_includes server bench_scene)
    get_property(NT_${group} GLOBAL PROPERTY NT_${group})
endforeach()

include(src/app/QmlDiscovery.cmake)

if(NOT TARGET nodetool_model_picker)
    add_subdirectory(../model-picker ${CMAKE_CURRENT_BINARY_DIR}/model-picker)
endif()
if(NOT TARGET nodetool_media)
    add_subdirectory(../media ${CMAKE_CURRENT_BINARY_DIR}/media)
endif()
if(NOT TARGET nodetool_files)
    add_subdirectory(../files ${CMAKE_CURRENT_BINARY_DIR}/files)
endif()
if(NOT TARGET nodetool_entities)
    add_subdirectory(../entities ${CMAKE_CURRENT_BINARY_DIR}/entities)
endif()
if(NOT TARGET nodetool_storyboard)
    add_subdirectory(../storyboard ${CMAKE_CURRENT_BINARY_DIR}/storyboard)
endif()
if(NOT TARGET nodetool_script)
    add_subdirectory(../script ${CMAKE_CURRENT_BINARY_DIR}/script)
endif()
# The timeline's Core-only code, shared by the app, timeline-ops and the tests.
add_library(timeline_core STATIC ${NT_core})
target_include_directories(timeline_core PUBLIC src)
target_link_libraries(timeline_core PUBLIC nodetool_timeline_scene Qt6::Core nodetool_script_authoring)
target_compile_options(timeline_core PRIVATE ${NT_WARNINGS})

# The timeline's decode code over nodetool_timeline_decode: export
# capabilities and the shot scan.
add_library(timeline_decode STATIC ${NT_decode})
target_link_libraries(timeline_decode PUBLIC timeline_core nodetool_timeline_decode Qt6::Gui Qt6::GuiPrivate PkgConfig::FFMPEG)
target_compile_options(timeline_decode PRIVATE ${NT_WARNINGS})

# The app's audio controller and editing features use the shared engine.
add_library(timeline_audio STATIC ${NT_audio})
target_include_directories(timeline_audio PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/../vst-host/source")
target_link_libraries(timeline_audio PUBLIC timeline_core nodetool_timeline_audio PRIVATE Qt6::Gui)
target_compile_options(timeline_audio PRIVATE ${NT_WARNINGS})
# Clang on arm64 contracts by default, which changes a remix's features and plan from every other platform's.
if(NOT MSVC)
    set_source_files_properties(src/remix/RemixDsp.cpp
        TARGET_DIRECTORY timeline_audio PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

qt_add_executable(nodetool-timeline src/main.cpp ${NT_app})
target_compile_definitions(nodetool-timeline PRIVATE NT_APP_VERSION="${PROJECT_VERSION}")
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
include(../account/cmake/MacCodeSign.cmake)
nodetool_macos_dev_sign(nodetool-timeline "ai.nodetool.timeline")
target_compile_options(nodetool-timeline PRIVATE ${NT_WARNINGS})
target_link_libraries(nodetool-timeline PRIVATE
    ${NT_APP_PLATFORM_LIBS} timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG)

# Compile the QML module once. Whole-archive linkage preserves its generated
# type/resource initializers and C++ registrars without a runtime plugin file.
# App-only registrations stay in NT_app and remain specific to each host.
qt_add_library(timeline_qml STATIC)
target_compile_options(timeline_qml PRIVATE ${NT_WARNINGS})
qt_add_qml_module(timeline_qml
    URI NodeTool.Timeline
    NO_PLUGIN
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/Timeline
    # PlaybackClock, PreviewCompositor and TimelineSource, the base of
    # TimelineModel. The QML files import it.
    DEPENDENCIES NodeTool.TimelinePlayer
    # Where qmlcachegen and qmllint find that module's qmldir and types.
    IMPORT_PATH ${NT_PLAYER_IMPORT_PATH} ${NT_UI_IMPORT_PATH}
    QML_FILES ${NT_qml_files}
    RESOURCES ${NT_qml_resources}
    SOURCES ${NT_qml})
list(REMOVE_DUPLICATES NT_qml_includes)
target_include_directories(timeline_qml PUBLIC src/model src/playback src/preview src/ui src/edit ${NT_qml_includes})
target_link_libraries(timeline_qml PRIVATE Qt6::QuickPrivate)
target_link_libraries(timeline_qml PUBLIC nodetool_timeline_player timeline_core timeline_decode timeline_audio
    nodetool_model_picker nodetool_media nodetool_files nodetool_entities nodetool_storyboard nodetool_chat nodetool_account_qt Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG)

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
    nodetool_use_ui_primitives(${target})
    target_link_libraries(${target} PRIVATE "$<LINK_LIBRARY:WHOLE_ARCHIVE,timeline_qml>"
        nodetool_timeline_playerplugin nodetool_model_pickerplugin nodetool_mediaplugin nodetool_filesplugin nodetool_entitiesplugin nodetool_storyboardplugin nodetool_chatplugin)
endfunction()
nt_add_timeline_qml(nodetool-timeline)
# Compile-only check of the Linux hardware path on macOS: with a
# Vulkan-Headers include folder, VulkanInterop.cpp and the Linux branch of
# HwWindow.cpp compile against Qt's Vulkan API and FFmpeg's DRM headers. The
# objects are not linked (scripts/check-portable.sh).
set(NT_CHECK_VULKAN_HEADERS "" CACHE PATH "macOS: a Vulkan-Headers include folder, to compile the Linux hardware path")
if(APPLE AND NT_CHECK_VULKAN_HEADERS)
    add_library(nt_linux_hw_check OBJECT ../timeline-player/src/preview/hw/VulkanInterop.cpp
        ../timeline-player/src/preview/hw/HwWindow.cpp)
    target_compile_definitions(nt_linux_hw_check PRIVATE NT_HW_SYNTAX_CHECK_VAAPI)
    target_include_directories(nt_linux_hw_check PRIVATE ${NT_CHECK_VULKAN_HEADERS})
    target_link_libraries(nt_linux_hw_check PRIVATE timeline_core Qt6::Gui Qt6::GuiPrivate Qt6::Quick PkgConfig::FFMPEG)
    target_compile_options(nt_linux_hw_check PRIVATE ${NT_WARNINGS})
endif()

target_link_libraries(nodetool-timeline PRIVATE timeline_audio)


find_package(Qt6 6.12 REQUIRED COMPONENTS Network WebSockets)
add_library(timeline_server STATIC ${NT_server})
target_link_libraries(timeline_server PUBLIC timeline_core timeline_decode nodetool_account_server_token Qt6::Network Qt6::WebSockets
    nodetool_timeline_player_server)
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

# Headless stress workload. Private profiler API is pinned by the Qt version above.
qt_add_executable(tst_timeline_perf tests/tst_timeline_perf.cpp src/edit/tracks/TrackEditRegistrations.cpp
    src/app/startup/LocalDocumentSaver.h src/app/startup/LocalDocumentSaver.cpp)
set_target_properties(tst_timeline_perf PROPERTIES MACOSX_BUNDLE FALSE)
target_compile_options(tst_timeline_perf PRIVATE ${NT_WARNINGS})
target_link_libraries(tst_timeline_perf PRIVATE timeline_core timeline_decode timeline_server
    Qt6::GuiPrivate Qt6::QmlPrivate Qt6::QuickPrivate Qt6::Quick Qt6::QuickControls2 Qt6::Test
    PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
nt_add_timeline_qml(tst_timeline_perf OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_timeline_perf_qml/NodeTool/Timeline)
add_test(NAME tst_timeline_perf_observers COMMAND tst_timeline_perf --selfcheck)
set_tests_properties(tst_timeline_perf_observers PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
find_package(Python3 REQUIRED COMPONENTS Interpreter)
add_test(NAME tst_timeline_perf_budget_checker COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/test_check_perf.py)
add_test(NAME tst_timeline_aot_checker COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/test_aot.py)
add_test(NAME tst_timeline_aot COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/check_aot.py
    ${CMAKE_CURRENT_BINARY_DIR}/.rcc/qmlcache ${CMAKE_CURRENT_SOURCE_DIR}/budgets/aot-hot-files.json)
foreach(scenario playback scroll zoom clip_drag note_drag model_change note_patch)
    add_test(NAME tst_timeline_perf_${scenario} COMMAND ${Python3_EXECUTABLE}
        ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/check_perf.py
        --binary $<TARGET_FILE:tst_timeline_perf> --scenario ${scenario}
        --budget ${CMAKE_CURRENT_SOURCE_DIR}/budgets/ui-120hz.json
        --output ${CMAKE_CURRENT_BINARY_DIR}/perf-${scenario}.json)
    set_tests_properties(tst_timeline_perf_${scenario} PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;QSG_RENDER_LOOP=basic;QT_SCALE_FACTOR=1;QT_FONT_DPI=96;QT_QUICK_CONTROLS_STYLE=Basic"
        TIMEOUT 360 LABELS perf RUN_SERIAL TRUE)
endforeach()

add_test(NAME tst_timeline_perf_agent COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/check_perf.py
    --binary $<TARGET_FILE:tst_timeline_perf> --scenario model_change --agent
    --budget ${CMAKE_CURRENT_SOURCE_DIR}/budgets/ui-120hz.json
    --output ${CMAKE_CURRENT_BINARY_DIR}/perf-agent.json)
set_tests_properties(tst_timeline_perf_agent PROPERTIES
    ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;QSG_RENDER_LOOP=basic;QT_SCALE_FACTOR=1;QT_FONT_DPI=96;QT_QUICK_CONTROLS_STYLE=Basic"
    TIMEOUT 360 LABELS perf RUN_SERIAL TRUE)

add_test(NAME tst_timeline_perf_agent_note_patch COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/measure/check_perf.py
    --binary $<TARGET_FILE:tst_timeline_perf> --scenario note_patch --agent
    --budget ${CMAKE_CURRENT_SOURCE_DIR}/budgets/ui-120hz.json
    --output ${CMAKE_CURRENT_BINARY_DIR}/perf-agent-note-patch.json)
set_tests_properties(tst_timeline_perf_agent_note_patch PROPERTIES
    ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;QSG_RENDER_LOOP=basic;QT_SCALE_FACTOR=1;QT_FONT_DPI=96;QT_QUICK_CONTROLS_STYLE=Basic"
    TIMEOUT 360 LABELS perf RUN_SERIAL TRUE)

# What scripts/op-conformance.mjs and scripts/plan-conformance.mjs run: the
# app, timeline-ops and the oracle each suite in scripts/conformance/suites/
# names next to timeline-ops.
add_custom_target(conformance-helpers)
foreach(helper nodetool-timeline timeline-ops nt_assets_oracle nt_assist_oracle structure-ops targeting-ops
        timeline-gizmo-oracle track-ops tst_clipaudio tst_inspectorprimitives tst_keyframes tst_reframe tst_speed
        tst_sync tst_tempo tst_transitions)
    if(NOT TARGET ${helper})
        message(FATAL_ERROR "conformance-helpers: no target ${helper}")
    endif()
    add_dependencies(conformance-helpers ${helper})
endforeach()

if(NT_FUZZ)
    add_subdirectory(tests/fuzz)
endif()
if(NT_SANITIZER_PLANTS)
    add_subdirectory(tools/sanitizers/plants)
endif()
if(BUILD_TESTING)
    add_test(NAME timeline_player_first_configure COMMAND ${CMAKE_COMMAND}
        -S ${CMAKE_CURRENT_SOURCE_DIR}/tests/cmake/player-first
        -B ${CMAKE_CURRENT_BINARY_DIR}/player-first-configure
        -G "${CMAKE_GENERATOR}"
        "-DCMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH}"
        "-DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}"
        "-DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}"
        "-DQt6_DIR=${Qt6_DIR}"
        "-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=${nlohmann_json_SOURCE_DIR}")
endif()
nt_sanitizer_test_checks()
# Visual Studio does not emit compile_commands.json.
if(CMAKE_GENERATOR MATCHES "Ninja|Makefiles")
    add_test(NAME shared_qml_build_fixtures COMMAND ${CMAKE_COMMAND}
        -DNT_BUILD_DIR=${CMAKE_CURRENT_BINARY_DIR}
        -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/tests/SharedQmlBuildTest.cmake)
    add_test(NAME shared_qml_build COMMAND ${CMAKE_COMMAND}
        -DNT_BUILD_DIR=${CMAKE_CURRENT_BINARY_DIR}
        -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/tests/SharedQmlBuild.cmake)
endif()

include(cmake/TestPreferences.cmake)
nt_isolate_test_preferences()

# Scratch scripts need kernel-owned process trees on Windows.
if(WIN32)
    add_executable(nt-scratch-job scripts/scratch-job.cpp)
    target_link_libraries(nt-scratch-job PRIVATE Qt6::Core iphlpapi ws2_32)
    target_compile_definitions(nt-scratch-job PRIVATE _WIN32_WINNT=0x0A00 WIN32_LEAN_AND_MEAN NOMINMAX)
    target_compile_options(nt-scratch-job PRIVATE ${NT_WARNINGS})
    add_dependencies(nodetool-timeline nt-scratch-job)
    set_property(TEST scratch_safety timelinelist_document_actions timelinelist_scratch timelinelist_settings_scratch
        APPEND PROPERTY ENVIRONMENT "NT_SCRATCH_JOB_HELPER=$<TARGET_FILE:nt-scratch-job>")
endif()
