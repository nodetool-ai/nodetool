nt_sources(server src/activity/local/LocalActivityStore.h src/activity/local/LocalActivityStore.cpp)
nt_qml_sources(src/activity/local/LocalActivity.h src/activity/local/LocalActivity.cpp)
function(nt_localactivity_tests)
    qt_add_executable(tst_localactivity src/activity/local/tst_localactivity.cpp
        src/export/ExportController.h src/export/ExportController.cpp src/export/ExportSettings.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_localactivity PRIVATE timeline_server timeline_decode Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_localactivity COMMAND tst_localactivity)
endfunction()
nt_tests(nt_localactivity_tests)
