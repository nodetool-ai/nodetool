function(nt_model_hook_tests)
    qt_add_executable(tst_modelhooks src/model/hooks/tst_modelhooks.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_modelhooks PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_modelhooks PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_modelhooks COMMAND tst_modelhooks)
    set_tests_properties(tst_modelhooks PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_model_hook_tests)
