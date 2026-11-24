# The effects, their shaders and their hook registration are in
# native/timeline-player (nodetool_timeline_decode, which carries the
# shaders). The tests read the timeline's fixtures, so they stay here.
nt_sources(app ${NT_EFFECTS_REGISTRAR})

function(nt_effects_tests)
    # NT_SCENE_PRECISION_TEST adds a working-storage observer to
    # PreviewCompositor and changes its layout, so the precision tests compile
    # the player's QML module sources with it instead of linking
    # nodetool_timeline_player.
    set(player ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player)
    set(precision_player_sources
        ${player}/src/playback/PlaybackClock.h ${player}/src/playback/PlaybackClock.cpp
        ${player}/src/preview/PreviewCompositor.h ${player}/src/preview/PreviewCompositor.cpp
        ${player}/src/preview/hw/HwWindow.h ${player}/src/preview/hw/HwWindow.cpp)
    qt_add_executable(tst_workingprecision src/preview/effects/tst_workingprecision.cpp)
    target_link_libraries(tst_workingprecision PRIVATE timeline_decode Qt6::GuiPrivate Qt6::Test)
    target_compile_definitions(tst_workingprecision PRIVATE
        NT_PRECISION_VECTORS="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/gpu/tests/fixtures/inverse-levels.json")
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
    qt_add_executable(tst_effectmasks src/preview/effects/tst_effectmasks.cpp)
    target_link_libraries(tst_effectmasks PRIVATE timeline_decode Qt6::Test)
    target_compile_definitions(tst_effectmasks PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/fixtures/coverage")
    add_test(NAME tst_effectmasks COMMAND tst_effectmasks)
    qt_add_executable(tst_effectplan src/preview/effects/tst_effectplan.cpp)
    target_link_libraries(tst_effectplan PRIVATE timeline_decode Qt6::Test)
    add_test(NAME tst_effectplan COMMAND tst_effectplan)
    qt_add_executable(tst_effectresources src/preview/effects/tst_effectresources.cpp)
    target_link_libraries(tst_effectresources PRIVATE timeline_decode Qt6::GuiPrivate Qt6::Test)
    add_test(NAME tst_effectresources COMMAND tst_effectresources)
    qt_add_executable(tst_sceneprecision src/preview/effects/tst_sceneprecision.cpp
        src/export/OffscreenFrames.cpp
        ${NT_EFFECTS_REGISTRAR}
        ${NT_RENDER2D_REGISTRAR}
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        ${precision_player_sources})
    set_target_properties(tst_sceneprecision PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_sceneprecision PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_sceneprecision "precision_compositor_shaders" PREFIX "/shaders" BASE ${player}/shaders
        FILES ${player}/shaders/composite.vert ${player}/shaders/composite.frag ${player}/shaders/monitorview.frag)
    target_compile_definitions(tst_sceneprecision PRIVATE NT_SCENE_PRECISION_TEST
        NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_sceneprecision COMMAND tst_sceneprecision)
    set_tests_properties(tst_sceneprecision PROPERTIES LABELS render FIXTURES_REQUIRED media
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    qt_add_executable(tst_precisioncost src/preview/effects/tst_precisioncost.cpp
        ${NT_EFFECTS_REGISTRAR}
        ${NT_RENDER2D_REGISTRAR}
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        ${precision_player_sources})
    set_target_properties(tst_precisioncost PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_precisioncost PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_precisioncost "cost_compositor_shaders" PREFIX "/shaders" BASE ${player}/shaders
        FILES ${player}/shaders/composite.vert ${player}/shaders/composite.frag ${player}/shaders/monitorview.frag)
    target_compile_definitions(tst_precisioncost PRIVATE NT_SCENE_PRECISION_TEST
        NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_precisioncost COMMAND tst_precisioncost)
    set_tests_properties(tst_precisioncost PROPERTIES LABELS render
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    qt_add_executable(tst_effectsblend src/preview/effects/tst_effectsblend.cpp
        ${NT_EFFECTS_REGISTRAR}
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_effectsblend PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_effectsblend PRIVATE nodetool_timeline_player timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_effectsblend_registry COMMAND tst_effectsblend registeredModes)
    set_tests_properties(tst_effectsblend_registry PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_documents COMMAND tst_effectsblend documents clipDocuments trackDocuments animatedGrain adjustmentDocuments)
    set_tests_properties(tst_effectsblend_documents PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_effectsblend_render COMMAND tst_effectsblend blendPixels)
    set_tests_properties(tst_effectsblend_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsclip_render COMMAND tst_effectsblend clipPixels cropPixelsOnClip spreadPixels glowTintPixels vignetteGeometry wideBlurPixels sharpenRadius curveFidelity debandPixels secondaryColorPixels hueSatCurvesPixels exposurePixels stabilizationPixels denoisePixels groupEffectAlpha)
    set_tests_properties(tst_effectsclip_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsmatte_render COMMAND tst_effectsblend mattePixels matteStrengthAndFeather maskPixels)
    set_tests_properties(tst_effectsmatte_render PROPERTIES LABELS render)
    add_test(NAME tst_effectsadjustment_render COMMAND tst_effectsblend adjustmentPixels)
    set_tests_properties(tst_effectsadjustment_render PROPERTIES LABELS render)
    add_test(NAME effects_golden_script COMMAND node --test --test-isolation=none ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/check-effects.test.mjs)
endfunction()
nt_tests(nt_effects_tests)
