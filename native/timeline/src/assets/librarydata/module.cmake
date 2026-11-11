function(nt_library_data_tests)
    qt_add_executable(tst_librarydata
        src/assets/librarydata/tst_librarydata.cpp
        src/assets/AssetBrowser.h src/assets/AssetBrowser.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/model/TrackWindowModel.h src/model/TrackWindowModel.cpp
        src/ui/TimelineViewState.h src/ui/TimelineViewState.cpp)
    set_target_properties(tst_librarydata PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_librarydata PRIVATE timeline_core timeline_server Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_librarydata COMMAND tst_librarydata)
    set_tests_properties(tst_librarydata PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_library_data_tests)
