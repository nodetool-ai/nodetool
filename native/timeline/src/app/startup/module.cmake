nt_sources(core
    src/app/startup/DecodeDefault.h
    src/app/startup/DecodeDefault.cpp
)
nt_sources(app src/app/startup/LocalDocumentSaver.h src/app/startup/LocalDocumentSaver.cpp)
function(nt_startup_hook_tests)
    qt_add_executable(tst_startuphooks src/app/startup/tst_startuphooks.cpp
        src/app/startup/LocalDocumentSaver.h src/app/startup/LocalDocumentSaver.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_startuphooks PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_startuphooks PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_startuphooks COMMAND tst_startuphooks)
    set_tests_properties(tst_startuphooks PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_startup_hook_tests)
