nt_sources(core src/edit/framehold/FrameHold.h src/edit/framehold/FrameHold.cpp)
function(nt_framehold_tests)
    qt_add_executable(tst_framehold src/edit/framehold/tst_framehold.cpp src/edit/keys/AudioCrossfade.cpp
        src/edit/framehold/FrameHoldRegistrations.cpp src/edit/framehold/FrameHoldController.h src/edit/framehold/FrameHoldController.cpp
        src/edit/speed/SpeedMixRegistration.cpp src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_framehold PRIVATE timeline_core timeline_audio Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_framehold COMMAND tst_framehold)
endfunction()
nt_tests(nt_framehold_tests)
function(nt_framehold_export_test)
    add_test(NAME framehold_export COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/framehold/check-hold-export.mjs
        --bin $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(framehold_export PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE)
endfunction()
nt_tests(nt_framehold_export_test)
nt_sources(app src/edit/framehold/FrameHoldRegistrations.cpp)
nt_qml_sources(src/edit/framehold/FrameHoldController.h src/edit/framehold/FrameHoldController.cpp)
nt_sources(app src/edit/framehold/FrameHoldActions.cpp)
