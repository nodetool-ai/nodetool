nt_qml_sources(src/storyworkspace/StoryWorkspace.h src/storyworkspace/StoryWorkspace.cpp)
function(nt_storyworkspace_tests)
    qt_add_executable(tst_storyworkspace src/storyworkspace/tst_storyworkspace.cpp
        src/storyworkspace/StoryWorkspace.h src/storyworkspace/StoryWorkspace.cpp
        src/aiassist/AssistController.h src/aiassist/AssistController.cpp src/aiassist/AssistEdits.cpp
        src/aiassist/ScriptVoicing.h src/aiassist/ScriptVoicing.cpp
        src/aiassist/CandidatePreview.h src/aiassist/CandidatePreview.cpp
        src/aiassist/ShotWorkflow.h src/aiassist/ShotWorkflow.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    nodetool_use_ui_primitives(tst_storyworkspace)
    target_link_libraries(tst_storyworkspace PRIVATE timeline_core timeline_decode timeline_server timeline_audio nodetool_media nodetool_mediaplugin nodetool_model_picker nodetool_model_pickerplugin nodetool_storyboard nodetool_storyboardplugin Qt6::WebSockets Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Gui Qt6::GuiPrivate Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    target_compile_definitions(tst_storyworkspace PRIVATE NT_STORY_SOURCE="${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME tst_storyworkspace COMMAND tst_storyworkspace)
    set_tests_properties(tst_storyworkspace PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_storyworkspace_tests)
