# LayerRegistry is in native/timeline-player (nodetool_timeline_decode).
function(nt_layer_hook_tests)
    qt_add_executable(tst_layerhooks src/preview/layers/tst_layerhooks.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_layerhooks PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_layerhooks PRIVATE nodetool_timeline_player timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    target_compile_definitions(tst_layerhooks PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
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
