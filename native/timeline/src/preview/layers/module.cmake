nt_sources(core src/preview/layers/SceneHooks.h src/preview/layers/SceneHooks.cpp)
nt_sources(decode src/preview/layers/LayerRegistry.h src/preview/layers/LayerRegistry.cpp)
function(nt_layer_hook_tests)
    qt_add_executable(tst_layerhooks src/preview/layers/tst_layerhooks.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/preview/PreviewCompositor.h src/preview/PreviewCompositor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_layerhooks PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_layerhooks PRIVATE timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    target_compile_definitions(tst_layerhooks PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    qt_add_shaders(tst_layerhooks "s2_composite_shaders" PREFIX "/shaders" BASE shaders
        FILES shaders/composite.vert shaders/composite.frag)
    qt_add_shaders(tst_layerhooks "s2_invert_shaders" PREFIX "/s2" BASE src/preview/layers
        FILES src/preview/layers/invert.vert src/preview/layers/invert.frag)
    add_test(NAME tst_layerhooks COMMAND tst_layerhooks decoratorsReachLayersAndGroups
        textMeasurerSeparatesFallbackCache sourceTimeMapperFallsBack captionAndVideoShareClipId)
    add_test(NAME tst_layerhooks_render COMMAND tst_layerhooks registeredSourceDrawsSolidColour
        sourceFactoryFollowsKindAndDocument sourceRectCropsToReference effectStageInvertsOnlyItsLayer effectStageRunsOnGroupSurface
        captionAndVideoKeepSeparateSources registeredMediaReplacesSyntheticSource factoryRegistrationReplacesCachedSource)
    set_tests_properties(tst_layerhooks_render PROPERTIES LABELS render)
    set_tests_properties(tst_layerhooks PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_layer_hook_tests)
