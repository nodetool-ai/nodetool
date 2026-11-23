# The piano roll (web PianoRoll.tsx): the notes of one midi clip, written as one edit.
nt_sources(core src/midi/MidiNotes.h src/midi/MidiNotes.cpp
    src/midi/PatternExpand.h src/midi/PatternExpand.cpp
    src/midi/PatternOps.h src/midi/PatternOps.cpp)
nt_sources(audio src/midi/PatternAudioStage.h src/midi/PatternAudioStage.cpp)
# Every audio host gets this registrar, including headless tests and bounces.
function(nt_step_pattern_audio_registration)
    add_library(nt_step_pattern_registrar OBJECT src/midi/PatternRegistrations.cpp)
    target_include_directories(nt_step_pattern_registrar PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src")
    target_link_libraries(nt_step_pattern_registrar PRIVATE Qt6::Core)
    target_link_libraries(timeline_audio INTERFACE $<TARGET_OBJECTS:nt_step_pattern_registrar>)
endfunction()
cmake_language(DEFER CALL nt_step_pattern_audio_registration)
if(NOT MSVC)
    set_source_files_properties(src/midi/PatternExpand.cpp
        PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()
nt_qml_sources(src/midi/PianoRollController.h src/midi/PianoRollController.cpp)
nt_qml_sources(src/midi/StepEditorLaneModel.h src/midi/StepEditorLaneModel.cpp)

function(nt_midi_tests)
    nt_qt_test(tst_midinotes SOURCES src/midi/tst_midinotes.cpp LIBS timeline_core Qt6::Test)
    nt_qt_test(tst_patternexpand SOURCES src/midi/tst_patternexpand.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test
        DEFINES NT_PATTERN_ORACLE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/src/midi/fixtures/step-pattern-oracle.json")
    set_tests_properties(tst_patternexpand PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    qt_add_executable(tst_pianorollui src/midi/tst_pianorollui.cpp ${NT_app})
    set_target_properties(tst_pianorollui PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_pianorollui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_pianorollui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_pianorollui_qml/NodeTool/Timeline)
    add_test(NAME tst_pianorollui COMMAND tst_pianorollui)
    set_tests_properties(tst_pianorollui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_midi_tests)
