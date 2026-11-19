nt_sources(app src/motion/mattes/MatteResolver.h src/motion/mattes/MatteResolver.cpp)
function(nt_matte_service_tests)
    target_sources(tst_assetbrowser PRIVATE src/motion/mattes/MatteResolver.cpp src/motion/mattes/MatteResolver.h)
endfunction()
nt_tests(nt_matte_service_tests)
function(nt_matte_carrier_tests)
    qt_add_executable(tst_mattecarrier src/motion/mattes/tst_mattecarrier.cpp
        ${NT_EFFECTS_REGISTRAR} src/export/OffscreenFrames.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_compile_definitions(tst_mattecarrier PRIVATE NT_MATTE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/src/preview/effects/fixtures")
    target_link_libraries(tst_mattecarrier PRIVATE nodetool_timeline_player timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_mattecarrier COMMAND tst_mattecarrier)
    set_tests_properties(tst_mattecarrier PROPERTIES LABELS render)
endfunction()
nt_tests(nt_matte_carrier_tests)
