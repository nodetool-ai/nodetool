function(nt_shutter_tests)
    qt_add_executable(tst_shutter src/motion/blur/tst_shutter.cpp src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
    target_link_libraries(tst_shutter PRIVATE timeline_core timeline_decode Qt6::Qml Qt6::Test)
    add_test(NAME tst_shutter COMMAND tst_shutter)
    add_test(NAME shutter_oracle COMMAND node "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/blur/oracle.mjs" $<TARGET_FILE:tst_shutter>)
endfunction()

function(nt_blur_pool_tests)
    qt_add_executable(tst_blurpool src/motion/blur/tst_blurpool.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/export/OffscreenFrames.h src/export/OffscreenFrames.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_blurpool PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_blurpool PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_blurpool "blurpool_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    qt_add_shaders(tst_blurpool "blurpool_second_shaders" PREFIX "/s4" BASE src/preview/compose
        FILES src/preview/compose/testhook.vert src/preview/compose/luma.frag)
    add_test(NAME tst_blurpool COMMAND tst_blurpool)
    set_tests_properties(tst_blurpool PROPERTIES LABELS render)
endfunction()
