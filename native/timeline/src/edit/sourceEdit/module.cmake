nt_sources(core src/edit/sourceEdit/SourceEdit.h src/edit/sourceEdit/SourceEdit.cpp
    src/edit/sourceEdit/SourceRange.h src/edit/sourceEdit/SourceRange.cpp)

nt_qml_sources(src/edit/sourceEdit/SourceEditRegistrations.cpp
    src/edit/sourceEdit/SourceMonitor.h src/edit/sourceEdit/SourceMonitor.cpp)
nt_qml_sources(src/edit/sourceEdit/SourceViewerState.h src/edit/sourceEdit/SourceViewerState.cpp)
nt_qml_files(qml/SourceRangeBar.qml qml/SourceDragArea.qml)
# Key actions belong to the app so QML test fixtures can register their own handlers.
cmake_language(DEFER CALL target_sources nodetool-timeline PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/sourceEdit/SourceKeyActions.cpp)

function(nt_sourceedit_tests)
    add_test(NAME preferences_isolation COMMAND node
        ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/sourceEdit/preferences-isolation.mjs
        ${CMAKE_CTEST_COMMAND} ${CMAKE_BINARY_DIR} $<CONFIG>)
    qt_add_executable(sourceedit-ops src/edit/sourceEdit/SourceEditCli.cpp)
    target_link_libraries(sourceedit-ops PRIVATE timeline_core)
    set_target_properties(sourceedit-ops PROPERTIES MACOSX_BUNDLE FALSE)
    get_filename_component(NT_SOURCEEDIT_REPO "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
    add_test(NAME sourceedit_oracle COMMAND node "${NT_SOURCEEDIT_REPO}/node_modules/vitest/vitest.mjs" run
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
    target_compile_definitions(tst_sourceviewer PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_sourceviewer COMMAND tst_sourceviewer)
    set_tests_properties(tst_sourceviewer PROPERTIES FIXTURES_REQUIRED media ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_sourceedit_tests)

function(nt_sourcerange_tests)
    qt_add_executable(tst_sourcerange src/edit/sourceEdit/tst_sourcerange.cpp)
    target_link_libraries(tst_sourcerange PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_sourcerange COMMAND tst_sourcerange)
endfunction()
nt_tests(nt_sourcerange_tests)
function(nt_sourceplacement_tests)
    qt_add_executable(tst_sourceplacement src/edit/sourceEdit/tst_sourceplacement.cpp)
    target_link_libraries(tst_sourceplacement PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_sourceplacement COMMAND tst_sourceplacement)
endfunction()
nt_tests(nt_sourceplacement_tests)
function(nt_sourcemonitor_tests)
    qt_add_executable(tst_sourcemonitor src/edit/sourceEdit/tst_sourcemonitor.cpp
        src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    target_link_libraries(tst_sourcemonitor PRIVATE timeline_core Qt6::Test ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_sourcemonitor)
    target_compile_definitions(tst_sourcemonitor PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_sourcemonitor COMMAND tst_sourcemonitor)
    set_tests_properties(tst_sourcemonitor PROPERTIES LABELS render FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_sourcemonitor_tests)
function(nt_sourcepanel_tests)
    qt_add_executable(tst_sourcepanel src/edit/sourceEdit/tst_sourcepanel.cpp
        src/edit/sourceEdit/SourceKeyActions.cpp ${NT_app})
    set_target_properties(tst_sourcepanel PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_sourcepanel PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_sourcepanel OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_sourcepanel_qml/NodeTool/Timeline)
    target_compile_definitions(tst_sourcepanel PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_sourcepanel COMMAND tst_sourcepanel)
    set_tests_properties(tst_sourcepanel PROPERTIES LABELS render FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_sourcepanel_tests)
