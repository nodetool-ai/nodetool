nt_sources(decode src/preview/compose/ComposeRegistry.h src/preview/compose/ComposeRegistry.cpp)
function(nt_compose_hook_tests)
    qt_add_executable(tst_composehooks src/preview/compose/tst_composehooks.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/export/OffscreenFrames.h src/export/OffscreenFrames.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_composehooks PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_composehooks PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    qt_add_shaders(tst_composehooks "s4_composite_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    qt_add_shaders(tst_composehooks "s4_hook_shaders" PREFIX "/s4" BASE src/preview/compose
        FILES src/preview/compose/testhook.vert src/preview/compose/multiply.frag src/preview/compose/border.frag
            src/preview/compose/alpha.frag src/preview/compose/luma.frag)
    add_test(NAME tst_composehooks_registry COMMAND tst_composehooks lastRegistrationWins matteExposesSourceLayer)
    set_tests_properties(tst_composehooks_registry PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    add_test(NAME tst_composehooks_render COMMAND tst_composehooks blendHandlerMultipliesLayer
        blendHandlerOnGroupSurface blendHandlerInsideGroupSurface unhandledBlendDrawsOver
        effectOutsetShowsBorder effectOutsetOnGroupSurface effectOutsetChainAndCrop
        matteStageUsesMatteAlpha secondSourceReachesStage exportMatchesPreviewWithHooks)
    set_tests_properties(tst_composehooks_render PROPERTIES LABELS render)
endfunction()
nt_tests(nt_compose_hook_tests)
