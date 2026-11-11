nt_qml_sources(src/activity/ActivityController.h src/activity/ActivityController.cpp)
function(nt_activity_tests)
    qt_add_executable(tst_activity src/activity/tst_activity.cpp
        src/activity/ActivityController.h src/activity/ActivityController.cpp
        src/activity/local/LocalActivity.h src/activity/local/LocalActivity.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    nodetool_use_ui_primitives(tst_activity)
    target_compile_definitions(tst_activity PRIVATE NT_ACTIVITY_SOURCE="${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(tst_activity PRIVATE timeline_core timeline_server Qt6::Gui Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test)
    add_test(NAME tst_activity COMMAND tst_activity)
    add_test(NAME activity_editor_smoke COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/activity/editor-smoke.mjs $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(activity_editor_smoke PROPERTIES RUN_SERIAL TRUE TIMEOUT 90 LABELS render)
    set_tests_properties(tst_activity PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_activity_tests)
