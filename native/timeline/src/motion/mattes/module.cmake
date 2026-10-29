function(nt_matte_carrier_tests)
    qt_add_executable(tst_mattecarrier src/motion/mattes/tst_mattecarrier.cpp
        src/preview/effects/EffectsRegistrations.cpp src/export/OffscreenFrames.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    target_compile_definitions(tst_mattecarrier PRIVATE NT_MATTE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/fixtures")
    target_link_libraries(tst_mattecarrier PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_mattecarrier "mattecarrier_compositor_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    nt_effects_shaders(tst_mattecarrier)
    add_test(NAME tst_mattecarrier COMMAND tst_mattecarrier)
    set_tests_properties(tst_mattecarrier PROPERTIES LABELS render)
endfunction()
