# The piano roll (web PianoRoll.tsx): the notes of one midi clip, written as one edit.
nt_sources(core src/midi/MidiNotes.h src/midi/MidiNotes.cpp)
nt_qml_sources(src/midi/PianoRollController.h src/midi/PianoRollController.cpp)

function(nt_midi_tests)
    nt_qt_test(tst_midinotes SOURCES src/midi/tst_midinotes.cpp LIBS timeline_core Qt6::Test)
    qt_add_executable(tst_pianorollui src/midi/tst_pianorollui.cpp ${NT_app})
    set_target_properties(tst_pianorollui PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_pianorollui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_pianorollui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_pianorollui_qml/NodeTool/Timeline)
    add_test(NAME tst_pianorollui COMMAND tst_pianorollui)
    set_tests_properties(tst_pianorollui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_midi_tests)
