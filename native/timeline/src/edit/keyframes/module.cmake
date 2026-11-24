nt_sources(core src/edit/keyframes/Keyframes.h src/edit/keyframes/Keyframes.cpp)
nt_qml_sources(src/edit/keyframes/KeyframeEdits.cpp
    src/edit/keyframes/ClipInspectorController.h src/edit/keyframes/ClipInspectorController.cpp)
function(nt_keyframe_tests)
    qt_add_executable(tst_keyframes src/edit/keyframes/tst_keyframes.cpp
        src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.cpp
        src/edit/keyframes/ClipInspectorController.cpp src/edit/keyframes/KeyframeEdits.cpp)
    set_target_properties(tst_keyframes PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_keyframes PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_keyframes PRIVATE nodetool_timeline_player timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    target_compile_definitions(tst_keyframes PRIVATE NT_KEYFRAME_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/src/edit/keyframes/fixtures")
    add_test(NAME tst_keyframes COMMAND tst_keyframes)
    set_tests_properties(tst_keyframes PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_keyframe_tests)
function(nt_keyframe_ui_tests)
    find_package(Qt6 6.12 REQUIRED COMPONENTS QuickTest)
    # The edits and sections Effect Controls hosts, so its groups work as they do in the app.
    qt_add_executable(tst_keyframesui src/edit/keyframes/tst_keyframesui.cpp
        src/preview/crop/ReframePanels.cpp src/preview/crop/ReframeRegistrations.cpp
        src/edit/speed/SpeedRegistrations.cpp)
    set_target_properties(tst_keyframesui PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_keyframesui PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_keyframesui PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::QuickTest PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_keyframesui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_keyframesui_qml/NodeTool/Timeline)
    add_test(NAME tst_keyframesui COMMAND tst_keyframesui -input ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/keyframes/qmltests)
    set_tests_properties(tst_keyframesui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_keyframe_ui_tests)
function(nt_keyed_render_tests)
    qt_add_executable(tst_keyedrender src/edit/keyframes/tst_keyedrender.cpp
        src/edit/keyframes/KeyframeEdits.cpp
        ${NT_EFFECTS_REGISTRAR}
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/export/OffscreenFrames.h src/export/OffscreenFrames.cpp)
    set_target_properties(tst_keyedrender PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_keyedrender PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_keyedrender PRIVATE nodetool_timeline_playback_registrar nodetool_timeline_player timeline_core timeline_decode
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_keyedrender COMMAND tst_keyedrender)
    set_tests_properties(tst_keyedrender PROPERTIES LABELS render)
endfunction()
nt_tests(nt_keyed_render_tests)
