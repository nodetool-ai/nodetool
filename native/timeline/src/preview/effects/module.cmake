nt_sources(decode src/preview/effects/BlendModes.h src/preview/effects/BlendModes.cpp
    src/preview/effects/DrawCache.h src/preview/effects/DrawCache.cpp
    src/preview/effects/Masks.h src/preview/effects/Masks.cpp
    src/preview/effects/ClipEffects.h src/preview/effects/EffectPlan.cpp src/preview/effects/ClipEffects.cpp)
nt_sources(app src/preview/effects/EffectsRegistrations.cpp)

function(nt_effects_shaders target)
    qt_add_shaders(${target} "${target}_effects_shaders" PREFIX "/effects" BASE shaders/effects GLSL "330,440"
        FILES shaders/effects/blend.vert shaders/effects/blend.frag
            shaders/effects/clip.vert shaders/effects/clip.frag shaders/effects/denoise.frag)
endfunction()
cmake_language(DEFER CALL nt_effects_shaders nodetool-timeline)

function(nt_effects_tests)
    qt_add_executable(tst_workingprecision src/preview/effects/tst_workingprecision.cpp)
    target_link_libraries(tst_workingprecision PRIVATE timeline_decode Qt6::GuiPrivate Qt6::Test)
    target_compile_definitions(tst_workingprecision PRIVATE
        NT_PRECISION_VECTORS="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/gpu/tests/fixtures/inverse-levels.json")
    nt_effects_shaders(tst_workingprecision)
    add_test(NAME tst_workingprecision COMMAND tst_workingprecision)
    set_tests_properties(tst_workingprecision PROPERTIES LABELS render)
    # Linux CLI defaults to OpenGL, independently of the Vulkan CI route.
    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        add_test(NAME tst_workingprecision_opengl COMMAND tst_workingprecision)
        set_tests_properties(tst_workingprecision_opengl PROPERTIES LABELS render
            ENVIRONMENT "QSG_RHI_BACKEND=opengl")
    endif()
    qt_add_executable(tst_masks src/preview/effects/tst_masks.cpp)
    target_link_libraries(tst_masks PRIVATE timeline_decode Qt6::Test)
    add_test(NAME tst_masks COMMAND tst_masks)
    qt_add_executable(tst_effectplan src/preview/effects/tst_effectplan.cpp)
    target_link_libraries(tst_effectplan PRIVATE timeline_decode Qt6::Test)
    add_test(NAME tst_effectplan COMMAND tst_effectplan)
    qt_add_executable(tst_effectresources src/preview/effects/tst_effectresources.cpp)
    target_link_libraries(tst_effectresources PRIVATE timeline_decode Qt6::GuiPrivate Qt6::Test)
    nt_effects_shaders(tst_effectresources)
    add_test(NAME tst_effectresources COMMAND tst_effectresources)
    qt_add_executable(tst_sceneprecision src/preview/effects/tst_sceneprecision.cpp
        src/export/OffscreenFrames.cpp
        src/preview/effects/EffectsRegistrations.cpp
        src/render2d/Render2dRegistrations.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_sceneprecision PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_sceneprecision PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_sceneprecision "precision_compositor_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag shaders/monitorview.frag)
    nt_effects_shaders(tst_sceneprecision)
    target_compile_definitions(tst_sceneprecision PRIVATE NT_SCENE_PRECISION_TEST
        NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_sceneprecision COMMAND tst_sceneprecision)
    set_tests_properties(tst_sceneprecision PROPERTIES LABELS render FIXTURES_REQUIRED media
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    qt_add_executable(tst_precisioncost src/preview/effects/tst_precisioncost.cpp
        src/preview/effects/EffectsRegistrations.cpp
        src/render2d/Render2dRegistrations.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_precisioncost PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_precisioncost PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_precisioncost "cost_compositor_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag shaders/monitorview.frag)
    nt_effects_shaders(tst_precisioncost)
    target_compile_definitions(tst_precisioncost PRIVATE NT_SCENE_PRECISION_TEST
        NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_precisioncost COMMAND tst_precisioncost)
    set_tests_properties(tst_precisioncost PROPERTIES LABELS render
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
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
        FILES shaders/composite.vert shaders/composite.frag shaders/monitorview.frag)
    nt_effects_shaders(tst_effectsblend)
    add_test(NAME tst_effectsblend_registry COMMAND tst_effectsblend registeredModes)
    set_tests_properties(tst_effectsblend_registry PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_documents COMMAND tst_effectsblend documents clipDocuments trackDocuments animatedGrain adjustmentDocuments)
    set_tests_properties(tst_effectsblend_documents PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_render COMMAND tst_effectsblend blendPixels)
    set_tests_properties(tst_effectsblend_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsclip_render COMMAND tst_effectsblend clipPixels cropPixelsOnClip spreadPixels glowTintPixels vignetteGeometry wideBlurPixels sharpenRadius curveFidelity debandPixels secondaryColorPixels exposurePixels stabilizationPixels denoisePixels groupEffectAlpha)
    set_tests_properties(tst_effectsclip_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsmatte_render COMMAND tst_effectsblend mattePixels matteStrengthAndFeather maskPixels)
    set_tests_properties(tst_effectsmatte_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsadjustment_render COMMAND tst_effectsblend adjustmentPixels)
    set_tests_properties(tst_effectsadjustment_render PROPERTIES LABELS render)
    add_test(NAME effects_golden_script COMMAND node --test --test-isolation=none ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/check-effects.test.mjs)
endfunction()
nt_tests(nt_effects_tests)
