nt_qml_sources(src/storyworkspace/StoryWorkspace.h src/storyworkspace/StoryWorkspace.cpp)
nt_sources(core src/storyworkspace/StoryDrafts.h src/storyworkspace/StoryDrafts.cpp)
function(nt_storydraft_tests)
    qt_add_executable(tst_storydrafts src/storyworkspace/tst_storydrafts.cpp)
    target_link_libraries(tst_storydrafts PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_storydrafts COMMAND tst_storydrafts)
endfunction()
nt_tests(nt_storydraft_tests)
function(nt_storyworkspace_tests)
    qt_add_executable(tst_storyworkspace src/storyworkspace/tst_storyworkspace.cpp
        src/storyworkspace/StoryWorkspace.h src/storyworkspace/StoryWorkspace.cpp
        src/aiassist/AssistController.h src/aiassist/AssistController.cpp src/aiassist/AssistEdits.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_storyworkspace PRIVATE timeline_core timeline_server Qt6::WebSockets Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Gui Qt6::Test)
    target_compile_definitions(tst_storyworkspace PRIVATE NT_STORY_SOURCE="${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME tst_storyworkspace COMMAND tst_storyworkspace)
    set_tests_properties(tst_storyworkspace PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_storyworkspace_tests)
