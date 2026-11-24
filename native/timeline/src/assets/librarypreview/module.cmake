function(nt_librarypreview_tests)
    qt_add_executable(tst_librarypreview src/assets/librarypreview/tst_librarypreview.cpp
        src/aiassist/CandidatePreview.h src/aiassist/CandidatePreview.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_librarypreview PRIVATE nodetool_timeline_player timeline_core timeline_decode timeline_server timeline_audio
        Qt6::Gui Qt6::Qml Qt6::Test PkgConfig::FFMPEG)
    add_test(NAME tst_librarypreview COMMAND tst_librarypreview)
    set_tests_properties(tst_librarypreview PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_librarypreview_tests)
