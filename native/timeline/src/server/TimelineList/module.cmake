nt_qml_sources(src/server/TimelineList/TimelineDocumentController.h src/server/TimelineList/TimelineDocumentController.cpp src/server/TimelineList/ProjectSettingsEdit.cpp src/server/TimelineList/ProjectSettingsValues.h)
nt_sources(app src/server/TimelineList/TimelineListStartup.cpp src/server/TimelineList/TimelineListCheck.cpp src/server/TimelineList/TimelineDocumentCheck.cpp)
nt_sources(server
    src/server/TimelineList/TimelineListController.h
    src/server/TimelineList/TimelineListController.cpp)

function(nt_timeline_list_tests)
    add_test(NAME timelinelist_document_controls COMMAND node
        ${CMAKE_CURRENT_SOURCE_DIR}/src/server/TimelineList/document-controls.mjs $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(timelinelist_document_controls PROPERTIES TIMEOUT 1800
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME timelinelist_document_actions COMMAND node
        ${CMAKE_CURRENT_SOURCE_DIR}/src/server/TimelineList/scratch-document.mjs $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(timelinelist_document_actions PROPERTIES TIMEOUT 1800
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME timelinelist_scratch COMMAND node
        ${CMAKE_CURRENT_SOURCE_DIR}/src/server/TimelineList/scratch-list.mjs $<TARGET_FILE:nodetool-timeline> --startup-label)
    set_tests_properties(timelinelist_scratch PROPERTIES TIMEOUT 240 ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME timelinelist_settings_scratch COMMAND node
        ${CMAKE_CURRENT_SOURCE_DIR}/src/server/TimelineList/scratch-list.mjs $<TARGET_FILE:nodetool-timeline> --settings-reopen)
    set_tests_properties(timelinelist_settings_scratch PROPERTIES TIMEOUT 240
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;NT_TIMELINE_LIST_TEST_PORT=17862")
    qt_add_executable(tst_timelinelistclient src/server/TimelineList/tst_timelinelistclient.cpp)
    target_include_directories(tst_timelinelistclient PRIVATE tests)
    target_link_libraries(tst_timelinelistclient PRIVATE timeline_server Qt6::Test)
    add_test(NAME tst_timelinelistclient COMMAND tst_timelinelistclient)
    set_tests_properties(tst_timelinelistclient PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    qt_add_executable(tst_timelinelistsource src/server/TimelineList/tst_timelinelistsource.cpp)
    target_include_directories(tst_timelinelistsource PRIVATE tests)
    target_link_libraries(tst_timelinelistsource PRIVATE timeline_server Qt6::Test)
    add_test(NAME tst_timelinelistsource COMMAND tst_timelinelistsource)
    set_tests_properties(tst_timelinelistsource PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    qt_add_executable(tst_timelinelistui src/server/TimelineList/tst_timelinelistui.cpp src/app/CliModes.cpp src/server/TimelineList/TimelineListStartup.cpp)
    target_include_directories(tst_timelinelistui PRIVATE tests)
    target_link_libraries(tst_timelinelistui PRIVATE timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_timelinelistui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_timelinelistui_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_timelinelistui PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_timelinelistsettings COMMAND tst_timelinelistui settingsPanelRegistered settingsOpenFromDocumentBar settingsOpenFromKeyboard settingsKeepsEditorShortcuts projectSettingsPersistence panelKeepsCppOwnership settingsCommitAndUndo)
    add_test(NAME tst_timelineliststartup COMMAND tst_timelinelistui startupListWithoutServer)
    add_test(NAME tst_timelinelistlayout COMMAND tst_timelinelistui layoutAndStills unnamedRowLabel emptySearchDescription offsetError)
    set_tests_properties(tst_timelinelistsettings tst_timelinelistlayout tst_timelineliststartup PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_timeline_list_tests)
