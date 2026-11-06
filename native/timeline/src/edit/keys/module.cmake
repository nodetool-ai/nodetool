nt_qml_sources(src/edit/keys/KeyboardActions.cpp src/edit/keys/PlaybackAudioActions.cpp src/edit/keys/AudioCrossfade.h src/edit/keys/AudioCrossfade.cpp)
nt_sources(app src/edit/keys/KeyPanels.cpp)
function(nt_keyboard_tests)
    qt_add_executable(tst_keyboardpresets src/edit/keys/tst_keyboardpresets.cpp
        src/edit/sourceEdit/SourceKeyActions.cpp ${NT_app})
    set_target_properties(tst_keyboardpresets PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_keyboardpresets PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_keyboardpresets OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_keyboardpresets_qml/NodeTool/Timeline)
    qt_add_resources(tst_keyboardpresets keyboard_sync_banner PREFIX /nodetool/sync BASE src/server/sync
        FILES src/server/sync/ExternalConflictsBanner.qml)
    add_test(NAME tst_keyboardpresets COMMAND tst_keyboardpresets)
    set_tests_properties(tst_keyboardpresets PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    # everyBindingRuns reloads a document for each action. That takes close to QtTest's 5 minutes
    # per function on hosted macOS and Windows runners, and about 9 minutes under ASan on two cores.
    set_tests_properties(tst_keyboardpresets PROPERTIES TIMEOUT 1500)
    set_property(TEST tst_keyboardpresets APPEND PROPERTY ENVIRONMENT "QTEST_FUNCTION_TIMEOUT=1200000")
endfunction()
nt_tests(nt_keyboard_tests)
