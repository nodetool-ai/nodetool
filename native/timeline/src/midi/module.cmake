# The piano roll (web PianoRoll.tsx): the notes of one midi clip, written as one edit.
nt_sources(core src/midi/MidiNotes.h src/midi/MidiNotes.cpp
    src/midi/PatternExpand.h src/midi/PatternExpand.cpp
    src/midi/PatternOps.h src/midi/PatternOps.cpp)
nt_sources(audio src/midi/PatternAudioStage.h src/midi/PatternAudioStage.cpp
    src/midi/DrumSamplerSamples.h src/midi/DrumSamplerSamples.cpp
    src/midi/DrumSampler.h src/midi/DrumSampler.cpp
    src/midi/WavetableTables.h src/midi/WavetableTables.cpp
    src/midi/WavetableSynth.h src/midi/WavetableSynth.cpp
    src/midi/WavetablePresets.h src/midi/WavetablePresets.cpp
    src/midi/WavetableEdits.h src/midi/WavetableEdits.cpp
    src/midi/BassSynth.h src/midi/BassSynth.cpp
    src/midi/BassSynthPresets.h src/midi/BassSynthPresets.cpp
    src/midi/BassSynthEdits.h src/midi/BassSynthEdits.cpp
    src/midi/InstrumentEdits.h src/midi/InstrumentEdits.cpp
    src/midi/MultisampleSampler.h src/midi/MultisampleSampler.cpp
    src/midi/SamplerEdits.h src/midi/SamplerEdits.cpp
    src/midi/modal/ModalDsp.h src/midi/modal/ModalDsp.cpp
    src/midi/modal/ModalSynth.h src/midi/modal/ModalSynth.cpp
    src/midi/modal/ModalPresets.h src/midi/modal/ModalPresets.cpp
    src/midi/modal/ModalEdits.h src/midi/modal/ModalEdits.cpp)
# Every audio host gets this registrar, including headless tests and bounces.
function(nt_step_pattern_audio_registration)
    add_library(nt_step_pattern_registrar OBJECT src/midi/PatternRegistrations.cpp)
    target_include_directories(nt_step_pattern_registrar PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src"
        "${CMAKE_CURRENT_SOURCE_DIR}/../audio-io/src")
    target_link_libraries(nt_step_pattern_registrar PRIVATE Qt6::Core)
    target_link_libraries(timeline_audio INTERFACE $<TARGET_OBJECTS:nt_step_pattern_registrar>)
endfunction()
cmake_language(DEFER CALL nt_step_pattern_audio_registration)
function(nt_drum_sampler_registration)
    add_library(nt_drum_sampler_registrar OBJECT src/midi/DrumSamplerRegistrations.cpp)
    target_include_directories(nt_drum_sampler_registrar PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src"
        "${CMAKE_CURRENT_SOURCE_DIR}/../audio-io/src")
    target_link_libraries(nt_drum_sampler_registrar PRIVATE Qt6::Core)
    target_link_libraries(timeline_audio INTERFACE $<TARGET_OBJECTS:nt_drum_sampler_registrar>)
endfunction()
cmake_language(DEFER CALL nt_drum_sampler_registration)
function(nt_bass_synth_registration)
    add_library(nt_bass_synth_registrar OBJECT src/midi/BassSynthRegistrations.cpp)
    target_include_directories(nt_bass_synth_registrar PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src"
        "${CMAKE_CURRENT_SOURCE_DIR}/../audio-io/src")
    target_link_libraries(nt_bass_synth_registrar PRIVATE Qt6::Core)
    target_link_libraries(timeline_audio INTERFACE $<TARGET_OBJECTS:nt_bass_synth_registrar>)
endfunction()
cmake_language(DEFER CALL nt_bass_synth_registration)
function(nt_wavetable_synth_registration)
    add_library(nt_wavetable_registrar OBJECT src/midi/WavetableRegistrations.cpp)
    target_include_directories(nt_wavetable_registrar PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src"
        "${CMAKE_CURRENT_SOURCE_DIR}/../audio-io/src")
    target_link_libraries(nt_wavetable_registrar PRIVATE Qt6::Core)
    target_link_libraries(timeline_audio INTERFACE $<TARGET_OBJECTS:nt_wavetable_registrar>)
endfunction()
cmake_language(DEFER CALL nt_wavetable_synth_registration)
if(NOT MSVC)
    set_source_files_properties(src/midi/PatternExpand.cpp src/midi/RegionParams.cpp
        PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()
nt_qml_sources(src/midi/NoteLayerItem.h src/midi/NoteLayerItem.cpp)
nt_qml_sources(src/midi/PianoRollController.h src/midi/PianoRollController.cpp)
nt_qml_sources(src/midi/StepEditorLaneModel.h src/midi/StepEditorLaneModel.cpp)
nt_qml_sources(src/midi/StepSequencerController.h src/midi/StepSequencerController.cpp)
nt_qml_sources(src/midi/WavetableCatalog.h src/midi/WavetableCatalog.cpp)
nt_qml_sources(src/midi/BassSynthCatalog.h src/midi/BassSynthCatalog.cpp)
nt_qml_sources(src/midi/SamplerHelper.h src/midi/SamplerHelper.cpp)
nt_qml_sources(src/midi/modal/ModalCatalog.h src/midi/modal/ModalCatalog.cpp)
nt_qml_files(qml/instruments/SamplerPanel.qml)
nt_qml_files(qml/instruments/WavetableSynthPanel.qml)
nt_qml_files(qml/instruments/ModalSynthPanel.qml)

function(nt_midi_tests)
    nt_qt_test(tst_midinotes SOURCES src/midi/tst_midinotes.cpp LIBS timeline_core Qt6::Test)
    nt_qt_test(tst_patternops SOURCES src/midi/tst_patternops.cpp LIBS timeline_core Qt6::Test)
    nt_qt_test(tst_drumsampler SOURCES src/midi/tst_drumsampler.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test)
    set_tests_properties(tst_drumsampler PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    nt_qt_test(tst_wavetablesynth SOURCES src/midi/tst_wavetablesynth.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test)
    set_tests_properties(tst_wavetablesynth PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    nt_qt_test(tst_basssynth SOURCES src/midi/tst_basssynth.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test)
    set_tests_properties(tst_basssynth PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    nt_qt_test(tst_multisamplesampler SOURCES src/midi/tst_multisamplesampler.cpp
        src/midi/SamplerHelper.h src/midi/SamplerHelper.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Qml Qt6::Test)
    set_tests_properties(tst_multisamplesampler PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    nt_qt_test(tst_modalsynth SOURCES src/midi/tst_modalsynth.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test)
    set_tests_properties(tst_modalsynth PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    nt_qt_test(tst_instrumentdemo SOURCES src/midi/tst_instrumentdemo.cpp
        LIBS nodetool_timeline_playback_registrar timeline_core timeline_audio Qt6::Test)
    set_tests_properties(tst_instrumentdemo PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
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
    add_test(NAME tst_pianorollui_geometry COMMAND tst_pianorollui retainedNoteLayers)
    set_tests_properties(tst_pianorollui_geometry PROPERTIES ENVIRONMENT
        "QT_QPA_PLATFORM=offscreen;QSG_RENDER_LOOP=basic;QSG_RHI_BACKEND=null;NT_PIANOROLL_GPU=1;NT_PIANOROLL_NULL_RHI=1")
    add_test(NAME tst_notelayer_boundary COMMAND python3 "${CMAKE_CURRENT_SOURCE_DIR}/tests/pianoroll/test_note_layer_boundary.py")
    add_test(NAME tst_pianorollui_threaded COMMAND tst_pianorollui retainedNoteLayers layerInvalidationBoundaries)
    set_tests_properties(tst_pianorollui_threaded PROPERTIES ENVIRONMENT
        "QT_QPA_PLATFORM=offscreen;QSG_RENDER_LOOP=threaded;QSG_RHI_BACKEND=null;NT_PIANOROLL_GPU=1;NT_PIANOROLL_NULL_RHI=1;NT_PIANOROLL_THREADED=1")
    option(NT_TIMELINE_RHI_TESTS "Require a real offscreen RHI backend for piano-roll visual tests" OFF)
    if(NT_TIMELINE_RHI_TESTS)
        add_test(NAME tst_pianorollui_rhi_comparison COMMAND tst_pianorollui canvasComparison retainedNoteLayers)
        set_tests_properties(tst_pianorollui_rhi_comparison PROPERTIES ENVIRONMENT
            "QT_QPA_PLATFORM=offscreen;QSG_RENDER_LOOP=basic;NT_PIANOROLL_GPU=1")
    endif()
    qt_add_executable(tst_stepsequencerui src/midi/tst_stepsequencerui.cpp ${NT_app})
    set_target_properties(tst_stepsequencerui PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_stepsequencerui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_stepsequencerui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_stepsequencerui_qml/NodeTool/Timeline)
    add_test(NAME tst_stepsequencerui COMMAND tst_stepsequencerui)
    set_tests_properties(tst_stepsequencerui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_midi_tests)

nt_sources(core src/midi/RegionParams.h src/midi/RegionParams.cpp)
