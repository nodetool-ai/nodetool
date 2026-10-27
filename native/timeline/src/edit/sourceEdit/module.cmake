nt_sources(core src/edit/sourceEdit/SourceEdit.h src/edit/sourceEdit/SourceEdit.cpp)

nt_qml_sources(src/edit/sourceEdit/SourceViewerState.h src/edit/sourceEdit/SourceViewerState.cpp)
# Key actions belong to the app so QML test fixtures can register their own handlers.
cmake_language(DEFER CALL target_sources nodetool-timeline PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/sourceEdit/SourceKeyActions.cpp)

function(nt_sourceedit_tests)
    qt_add_executable(sourceedit-ops src/edit/sourceEdit/SourceEditCli.cpp)
    target_link_libraries(sourceedit-ops PRIVATE timeline_core)
    set_target_properties(sourceedit-ops PROPERTIES MACOSX_BUNDLE FALSE)
    get_filename_component(NT_SOURCEEDIT_REPO "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
    add_test(NAME sourceedit_oracle COMMAND "${NT_SOURCEEDIT_REPO}/node_modules/.bin/vitest" run
        --config "${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/vitest.store.config.mts")
    set_tests_properties(sourceedit_oracle PROPERTIES
        ENVIRONMENT "NT_CONFORMANCE_TESTS=${CMAKE_CURRENT_SOURCE_DIR}/src/edit/sourceEdit/sourceEdit-oracle.test.ts;NT_SOURCEEDIT_OPS=$<TARGET_FILE:sourceedit-ops>"
        TIMEOUT 120)
    qt_add_executable(tst_sourceviewer src/edit/sourceEdit/tst_sourceviewer.cpp
        src/edit/sourceEdit/SourceKeyActions.cpp ${NT_app})
    set_target_properties(tst_sourceviewer PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_sourceviewer PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_sourceviewer OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_sourceviewer_qml/NodeTool/Timeline)
    add_test(NAME tst_sourceviewer COMMAND tst_sourceviewer)
    set_tests_properties(tst_sourceviewer PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_sourceedit_tests)
