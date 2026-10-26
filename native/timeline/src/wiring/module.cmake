nt_sources(core src/wiring/SourceDurations.h src/wiring/SourceDurations.cpp)
nt_qml_sources(src/wiring/RulerProviders.h src/wiring/RulerProviders.cpp)
nt_qml_sources(src/wiring/SnapProviders.h src/wiring/SnapProviders.cpp)
nt_qml_sources(src/wiring/KeyActions.h src/wiring/KeyActions.cpp)

function(nt_wiring_tests)
    qt_add_executable(tst_wiring src/wiring/tst_wiring.cpp ${NT_app})
    set_target_properties(tst_wiring PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_wiring PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_wiring OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_wiring_qml/NodeTool/Timeline)
    qt_add_resources(tst_wiring wiring_probes PREFIX /wiring-test BASE src/wiring
        FILES src/wiring/TestSlotProbe.qml src/wiring/TestClipBody.qml src/wiring/TestToolbar.qml
        src/wiring/TestDocumentBar.qml src/wiring/TestPreview.qml src/wiring/TestHeaderActions.qml)
    add_test(NAME wiring_markers COMMAND ${CMAKE_COMMAND}
        -DNT_DISCOVERY=${CMAKE_CURRENT_SOURCE_DIR}/src/app/QmlDiscovery.cmake
        -DNT_TEST_DIR=${CMAKE_CURRENT_BINARY_DIR}/wiring-marker-test
        -P ${CMAKE_CURRENT_SOURCE_DIR}/src/wiring/MarkerDiscoveryTest.cmake)
    qt_add_executable(tst_wiringedit src/wiring/tst_wiringedit.cpp ${NT_app})
    set_target_properties(tst_wiringedit PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_wiringedit PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_wiringedit OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_wiringedit_qml/NodeTool/Timeline)
    qt_add_executable(tst_wiringplay src/wiring/tst_wiringplay.cpp ${NT_app})
    set_target_properties(tst_wiringplay PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_wiringplay PRIVATE NT_WIRING_SOURCE="${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(tst_wiringplay PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_wiringplay OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_wiringplay_qml/NodeTool/Timeline)
    add_test(NAME tst_wiringplay COMMAND tst_wiringplay)
    set_tests_properties(tst_wiringplay PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME tst_wiringedit COMMAND tst_wiringedit)
    set_tests_properties(tst_wiringedit PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME tst_wiring COMMAND tst_wiring)
    set_tests_properties(tst_wiring PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_wiring_tests)
