nt_sources(core src/edit/tracks/TrackEdits.h src/edit/tracks/TrackEdits.cpp)
nt_sources(app src/edit/tracks/TrackEditRegistrations.cpp)
nt_qml_sources(src/edit/tracks/TrackHeaderActions.h src/edit/tracks/TrackHeaderActions.cpp)

function(nt_track_tests)
    qt_add_executable(track-ops src/edit/tracks/TrackOpsCli.cpp src/edit/tracks/TrackEditRegistrations.cpp)
    target_link_libraries(track-ops PRIVATE timeline_core)
    set_target_properties(track-ops PROPERTIES MACOSX_BUNDLE FALSE)

    qt_add_executable(tst_trackedits src/edit/tracks/tst_trackedits.cpp src/edit/tracks/TrackEditRegistrations.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_trackedits PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    set_target_properties(tst_trackedits PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_trackedits COMMAND tst_trackedits)
    set_tests_properties(tst_trackedits PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

    qt_add_executable(tst_tracksregion src/edit/tracks/tst_tracksregion.cpp src/edit/tracks/TrackEditRegistrations.cpp)
    target_link_libraries(tst_tracksregion PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    set_target_properties(tst_tracksregion PROPERTIES MACOSX_BUNDLE FALSE)
    nt_add_timeline_qml(tst_tracksregion OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_tracksregion_qml/NodeTool/Timeline)
    qt_add_resources(tst_tracksregion tracks_test_header PREFIX /tracks-test BASE src/edit/tracks
        FILES src/edit/tracks/TestHeaderAction.qml)
    if(UNIX AND NOT APPLE)
        target_sources(tst_tracksregion PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_tracksregion COMMAND tst_tracksregion)
    set_tests_properties(tst_tracksregion PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_track_tests)
