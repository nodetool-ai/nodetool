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
    # The whole binary takes 6 to 15 minutes on hosted runners, the longest of
    # the non-render tests, so its functions run in three groups side by side.
    find_package(Python3 REQUIRED COMPONENTS Interpreter)
    foreach(group RANGE 0 2)
        if(group EQUAL 0)
            set(test_name tst_keyboardpresets)
        else()
            set(test_name tst_keyboardpresets_${group})
        endif()
        add_test(NAME ${test_name} COMMAND ${Python3_EXECUTABLE}
            ${CMAKE_CURRENT_SOURCE_DIR}/scripts/run-qtest-group.py $<TARGET_FILE:tst_keyboardpresets> ${group} 3)
        # everyBindingRuns reloads a document for each action. That takes close to QtTest's 5 minutes
        # per function on hosted macOS and Windows runners, and about 9 minutes under ASan on two cores.
        set_tests_properties(${test_name} PROPERTIES TIMEOUT 1500
            ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;QTEST_FUNCTION_TIMEOUT=1200000")
    endforeach()
endfunction()
nt_tests(nt_keyboard_tests)
