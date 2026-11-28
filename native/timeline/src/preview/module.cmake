# The sources, pools and hook registries are in native/timeline-player
# (nodetool_timeline_decode), and PreviewCompositor is in its QML module
# (nodetool_timeline_player). Their tests read the timeline's fixtures, so
# they stay here.
nt_qml_files(qml/preview/PreviewArea.qml)

function(nt_preview_tests)
    foreach(test_name
        tst_sceneeval
        tst_framering
        tst_yuvformat
        tst_ffmpegsource
        tst_sourcepool
        tst_retirequeue
        tst_framecache
        tst_surfacepool)
        nt_qt_test(${test_name} LIBS timeline_core timeline_decode Qt6::Test
            DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
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

    nt_qt_test(tst_monitorcompositor
        SOURCES src/preview/tst_monitorcompositor.cpp
        LIBS timeline_core timeline_decode timeline_server Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test)
    nt_add_timeline_qml(tst_monitorcompositor)
    set_tests_properties(tst_monitorcompositor PROPERTIES LABELS render
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")

    # M4 exit 3: an edit reaches the preview on the next frame. Renders with
    # QQuickRenderControl on the platform QRhi (no window), so it links the
    # player library and the model directly instead of the timeline's QML
    # module.
    qt_add_executable(tst_editpreview tests/tst_editpreview.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_editpreview PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_editpreview PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_compile_options(tst_editpreview PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_editpreview PRIVATE nodetool_timeline_player timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml
        Qt6::Quick Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_editpreview COMMAND tst_editpreview)
    # The label `render` marks the tests that need the platform QRhi: no
    # QT_QPA_PLATFORM=offscreen (that platform has no QRhi, so Qt Quick falls back
    # to the software scene graph). CI runs them on Cocoa/Metal, on xcb under Xvfb
    # with Vulkan on lavapipe, and on the Windows platform with D3D11 on WARP, and
    # checks the backend in their log (.github/workflows/native-timeline.yml).
    # The window-event tests set the offscreen platform in their ENVIRONMENT.
    set_tests_properties(tst_editpreview PROPERTIES LABELS render)
    if(WIN32)
        nt_qt_test(tst_d3d11window LIBS nodetool_timeline_player timeline_decode Qt6::Quick Qt6::GuiPrivate Qt6::Test)
        set_tests_properties(tst_d3d11window PROPERTIES LABELS render)
    endif()
    # Linux: the VAAPI interop's frame completion marks on a Vulkan QRhi.
    if("NT_HAVE_VAAPI_VULKAN" IN_LIST NT_PLAYER_DECODE_DEFINITIONS)
        qt_add_executable(tst_vulkaninterop tests/tst_vulkaninterop.cpp)
        target_compile_options(tst_vulkaninterop PRIVATE ${NT_WARNINGS})
        target_compile_definitions(tst_vulkaninterop PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
        target_link_libraries(tst_vulkaninterop PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Test)
        add_test(NAME tst_vulkaninterop COMMAND tst_vulkaninterop)
        set_tests_properties(tst_vulkaninterop PROPERTIES LABELS render)
    endif()
endfunction()
nt_tests(nt_preview_tests)
