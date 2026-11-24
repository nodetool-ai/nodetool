nt_sources(core
    src/audio/vst/VstEdits.h
    src/audio/vst/VstEdits.cpp
)
nt_sources(audio
    src/audio/vst/PluginAssistant.h
    src/audio/vst/PluginAssistant.cpp
    src/audio/vst/VstHostClient.h
    src/audio/vst/VstHostClient.cpp
    src/audio/vst/VstLiveChannel.h
    src/audio/vst/VstLiveChannel.cpp
    src/audio/vst/VstAudioStages.h
    src/audio/vst/VstAudioStages.cpp
)
nt_qml_sources(
    src/audio/vst/VstHostModel.h
    src/audio/vst/VstHostModel.cpp
)
nt_sources(app
    src/audio/vst/VstRegistrations.cpp
)

function(nt_vst_tests)
    qt_add_executable(tst_vst
        src/audio/vst/tst_vst.cpp
        src/audio/vst/VstHostModel.h
        src/audio/vst/VstHostModel.cpp
        src/audio/vst/VstRegistrations.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TimelineModel.h
        src/model/TimelineModel.cpp
        src/model/TrackListModel.h
        src/model/TrackListModel.cpp
    )
    set_target_properties(tst_vst PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_vst PRIVATE ${NT_WARNINGS})
    target_compile_definitions(tst_vst PRIVATE
        NT_VST_HOST_BUILD_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../vst-host/build"
    )
    target_link_libraries(tst_vst PRIVATE
        nodetool_timeline_playback_registrar
        timeline_core
        timeline_audio
        Qt6::Gui
        Qt6::Qml
        Qt6::Test
    )
    add_test(NAME tst_vst COMMAND tst_vst)
    add_test(NAME tst_vst_music_loops COMMAND tst_vst musicLoopCutsAndRepeatsMidiSourceWindow)
    set_tests_properties(tst_vst_music_loops PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    set_tests_properties(tst_vst PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_vst_tests)
