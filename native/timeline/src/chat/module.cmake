nt_sources(app src/chat/TimelineChatHost.h src/chat/TimelineChatHost.cpp)
function(nt_chat_host_tests)
    qt_add_executable(tst_chathost tests/tst_chathost.cpp
        src/chat/TimelineChatHost.h src/chat/TimelineChatHost.cpp
        src/app/startup/LocalDocumentSaver.h src/app/startup/LocalDocumentSaver.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
    set_target_properties(tst_chathost PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_chathost PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_chathost COMMAND tst_chathost)
    set_tests_properties(tst_chathost PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_chat_host_tests)
