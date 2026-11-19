nt_sources(app src/chat/TimelineChatHost.h src/chat/TimelineChatHost.cpp)
function(nt_chat_host_tests)
    qt_add_executable(tst_chathost tests/tst_chathost.cpp
        src/chat/TimelineChatHost.h src/chat/TimelineChatHost.cpp
        src/app/startup/LocalDocumentSaver.h src/app/startup/LocalDocumentSaver.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_chathost PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_chathost PRIVATE nodetool_timeline_player timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    target_compile_definitions(tst_chathost PRIVATE NT_TOOL_MANIFEST="${CMAKE_CURRENT_SOURCE_DIR}/resources/chat/tool-manifest.json")
    add_test(NAME tst_chathost COMMAND tst_chathost)
    set_tests_properties(tst_chathost PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_chat_host_tests)
