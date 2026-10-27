nt_sources(decode src/preview/effects/BlendModes.h src/preview/effects/BlendModes.cpp)
nt_sources(app src/preview/effects/EffectsRegistrations.cpp)

function(nt_effects_shaders target)
    qt_add_shaders(${target} "${target}_effects_shaders" PREFIX "/effects" BASE shaders/effects
        FILES shaders/effects/blend.vert shaders/effects/blend.frag)
endfunction()
cmake_language(DEFER CALL nt_effects_shaders nodetool-timeline)

function(nt_effects_tests)
    qt_add_executable(tst_effectsblend src/preview/effects/tst_effectsblend.cpp
        src/preview/effects/EffectsRegistrations.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_effectsblend PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_effectsblend PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_effectsblend "effects_compositor_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    nt_effects_shaders(tst_effectsblend)
    add_test(NAME tst_effectsblend_registry COMMAND tst_effectsblend registeredModes)
    set_tests_properties(tst_effectsblend_registry PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_documents COMMAND tst_effectsblend documents)
    set_tests_properties(tst_effectsblend_documents PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_render COMMAND tst_effectsblend blendPixels)
    set_tests_properties(tst_effectsblend_render PROPERTIES LABELS render)
    add_test(NAME effects_golden_script COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/check-effects.test.mjs)
endfunction()
nt_tests(nt_effects_tests)
