nt_sources(qml
    src/model/TimelineModel.h
    src/model/TimelineModel.cpp
    src/model/TrackListModel.h
    src/model/TrackListModel.cpp
    src/model/TrackWindowModel.h
    src/model/TrackWindowModel.cpp
    src/model/LaneClipModel.h
    src/model/LaneClipModel.cpp
)

function(nt_model_tests)
    nt_qt_test(tst_timelinejson LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

    # The flex layout port's pure parts against the TypeScript values (scene/FlexLayout.h).
    # It links TimelineModel to check that every edit makes a new revision.
    qt_add_executable(tst_flexlayout tests/tst_flexlayout.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_flexlayout PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_flexlayout PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_flexlayout PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_flexlayout COMMAND tst_flexlayout)

    add_test(NAME tst_perf3_js COMMAND node "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_perf3.mjs")

    # Change notification costs of TimelineModel edits.
    qt_add_executable(tst_timelinemodel tests/tst_timelinemodel.cpp
        src/midi/PianoRollController.h src/midi/PianoRollController.cpp
        src/music/MusicPanelModel.h src/music/MusicPanelModel.cpp
        src/music/MusicSelection.h src/music/MusicSelection.cpp
        src/music/MusicEdits.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_timelinemodel PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_timelinemodel PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_timelinemodel PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/../vst-host/source")
    target_link_libraries(tst_timelinemodel PRIVATE timeline_core timeline_audio Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_timelinemodel COMMAND tst_timelinemodel)
endfunction()
nt_tests(nt_model_tests)
