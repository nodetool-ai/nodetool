nt_qml_sources(src/server/projectfolder/ProjectFolderState.h src/server/projectfolder/ProjectFolderState.cpp)

function(nt_project_folder_tests)
    qt_add_executable(tst_projectfolder src/server/projectfolder/tst_projectfolder.cpp
        src/server/projectfolder/ProjectFolderState.h src/server/projectfolder/ProjectFolderState.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_projectfolder PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_projectfolder PRIVATE tests)
    target_link_libraries(tst_projectfolder PRIVATE timeline_server timeline_core nodetool_account_qt Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_projectfolder COMMAND tst_projectfolder)
    set_tests_properties(tst_projectfolder PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_project_folder_tests)
