nt_sources(audio
    src/audio/AppAudio.h
    src/audio/AppAudio.cpp
    src/audio/AudioMode.h
    src/audio/AudioMode.cpp
)
nt_sources(app
    src/audio/AvSyncInterpolation.h
    src/audio/AudioCli.h
    src/audio/AudioCli.cpp
)

function(nt_audio_tests)
    # Audio tests (M3): fade curves against the TypeScript vectors, the mixer,
    # the PCM ring, the audio source, and the clock with a fake device.
    foreach(test_name tst_fadecurves tst_mixer tst_audioclock tst_audioengine tst_shuttleaudio)
        nt_qt_test(${test_name} LIBS timeline_core timeline_audio Qt6::Test
            DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures" NT_BUILD_DIR="${CMAKE_CURRENT_BINARY_DIR}"
            INCLUDES src/playback)
    endforeach()
    target_link_libraries(tst_audioclock PRIVATE nodetool_timeline_player Qt6::Qml)
    target_link_libraries(tst_shuttleaudio PRIVATE nodetool_timeline_player Qt6::Qml)
    set_tests_properties(tst_shuttleaudio PROPERTIES FIXTURES_REQUIRED media)
    qt_add_executable(tst_appaudio tests/tst_appaudio.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_appaudio PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_appaudio PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_appaudio PRIVATE src/playback)
    target_link_libraries(tst_appaudio PRIVATE nodetool_timeline_player timeline_core timeline_audio Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_appaudio COMMAND tst_appaudio)
    # The curve vectors come from the TypeScript functions on every run.
    add_test(NAME fade_vectors COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/fade-vectors.mjs
        --out ${CMAKE_CURRENT_BINARY_DIR}/fade-vectors.json)
    set_tests_properties(fade_vectors PROPERTIES FIXTURES_SETUP fadevectors)
    set_tests_properties(tst_fadecurves PROPERTIES FIXTURES_REQUIRED fadevectors)
    set_tests_properties(tst_mixer tst_audioengine PROPERTIES FIXTURES_REQUIRED media)
    # The offline mix against the reference built from the TypeScript rules, and
    # the headless A/V sync (offline and on the null device: no sound).
    add_test(NAME mix_reference COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/check-mix.mjs
        --bin $<TARGET_FILE:nodetool-timeline>)
    add_test(NAME av_sync COMMAND $<TARGET_FILE:nodetool-timeline> ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --av-sync)
    add_test(NAME av_sync_fractional COMMAND $<TARGET_FILE:nodetool-timeline>
        ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync-fractional.json --av-sync)
    set_tests_properties(mix_reference av_sync av_sync_fractional PROPERTIES FIXTURES_REQUIRED media)
    # The audio mode main() selects, without opening a device (review F2): both
    # spellings of an automated mode select none.
    add_test(NAME audio_mode_play_stills COMMAND $<TARGET_FILE:nodetool-timeline>
        ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --play-stills /tmp/nt-unused --still-frames 1 --audio-dry-run)
    add_test(NAME audio_mode_play_stills_equals COMMAND $<TARGET_FILE:nodetool-timeline>
        ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/av-sync.json --play-stills=/tmp/nt-unused --still-frames=1 --audio-dry-run)
    set_tests_properties(audio_mode_play_stills audio_mode_play_stills_equals PROPERTIES
        PASS_REGULAR_EXPRESSION "audio mode: none" FAIL_REGULAR_EXPRESSION "audio mode: (system|null)"
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

endfunction()
nt_tests(nt_audio_tests)
