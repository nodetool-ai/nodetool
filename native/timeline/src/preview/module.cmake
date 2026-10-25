nt_sources(core
    src/preview/SceneEval.h
    src/preview/SceneEval.cpp
)
nt_sources(decode
    src/preview/LayerSource.h
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
    src/preview/RetireQueue.h
)
nt_qml_files(qml/preview/PreviewArea.qml)
nt_sources(qml
    src/preview/PreviewCompositor.h
    src/preview/PreviewCompositor.cpp
)

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

    # M4 exit 3: an edit reaches the preview on the next frame. Renders with
    # QQuickRenderControl on the platform QRhi (no window), so it links the
    # compositor and the model directly instead of the QML module.
    qt_add_executable(tst_editpreview tests/tst_editpreview.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        )
    nt_target_sources(tst_editpreview)
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
        target_link_libraries(tst_vulkaninterop PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Test)
        add_test(NAME tst_vulkaninterop COMMAND tst_vulkaninterop)
        set_tests_properties(tst_vulkaninterop PROPERTIES LABELS render)
    endif()
endfunction()
nt_tests(nt_preview_tests)
