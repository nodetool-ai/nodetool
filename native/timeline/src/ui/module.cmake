nt_sources(core
    src/ui/MonitorViewMath.h
    src/ui/MonitorViewMath.cpp
    src/ui/Timecode.h
    src/ui/Timecode.cpp
    src/ui/TimelineWheel.h
    src/ui/TimelineWheel.cpp
    src/ui/TimelineFormat.h
    src/ui/TimelineFormat.cpp
)
nt_sources(app
    src/ui/UiBench.h
    src/ui/UiBench.cpp
)
nt_qml_files(qml/Tracks/TracksRegion.qml)
nt_qml_files(qml/Tracks/TimeRuler.qml)
nt_qml_files(qml/Tracks/TrackHeader.qml)
nt_qml_files(qml/Tracks/TrackIconButton.qml)
nt_qml_files(qml/Tracks/TrackLane.qml)
nt_qml_files(qml/Tracks/Clip.qml)
nt_qml_files(qml/Tracks/ClipBody.qml)
nt_qml_files(qml/Tracks/FadeRamp.qml)
nt_qml_files(qml/Tracks/Playhead.qml)
nt_qml_files(qml/Tracks/TimelineZoomControls.qml)
nt_qml_files(qml/Tracks/TrackHeightSlider.qml)
nt_qml_files(qml/Tracks/TimelineScrollbar.qml)
nt_qml_files(qml/Tracks/ToolButton.qml)
nt_qml_files(qml/Tracks/ToolbarDivider.qml)
nt_qml_files(qml/Tracks/ToolToggle.qml)
nt_qml_files(qml/Tracks/ShortcutsSheet.qml)
nt_sources(qml
    src/ui/MonitorViewState.h
    src/ui/MonitorViewState.cpp
    src/ui/MonitorRulerCanvas.h
    src/ui/MonitorRulerCanvas.cpp
    src/ui/MonitorViewRegistry.h
    src/ui/MonitorMenus.cpp
    src/ui/TimelineViewState.h
    src/ui/TimelineViewState.cpp
    src/ui/TimelineGestureArea.h
    src/ui/TimelineGestureArea.cpp
    src/ui/RulerCanvas.h
    src/ui/RulerCanvas.cpp
    src/ui/MonitorMiniTimeline.h
    src/ui/MonitorMiniTimeline.cpp
    src/ui/MonitorZoomBar.h
    src/ui/MonitorZoomBar.cpp
    src/ui/MediaPreviews.h
    src/ui/MediaPreviews.cpp
    src/ui/MidiNoteLines.h
    src/ui/MidiNoteLines.cpp
    src/ui/PeakLevels.h
    src/ui/ThumbnailDiskCache.h
    src/ui/ThumbnailDiskCache.cpp
    src/ui/BenchMedia.h
    src/ui/BenchMedia.cpp
    src/ui/MediaVersion.h
    src/ui/TimelineFormatQml.h
)

function(nt_ui_tests)
    qt_add_executable(tst_monitorui src/ui/tst_monitorui.cpp ${NT_app})
    set_target_properties(tst_monitorui PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_monitorui PRIVATE src/wiring)
    target_link_libraries(tst_monitorui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_monitorui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_monitorui_qml/NodeTool/Timeline)
    qt_add_resources(tst_monitorui monitor_test_views PREFIX /monitor-test BASE src/ui
        FILES src/ui/tests_qml/TestMonitorView.qml src/ui/tests_qml/TestMonitorPictureView.qml)
    add_test(NAME tst_monitorui COMMAND tst_monitorui)
    set_tests_properties(tst_monitorui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    nt_qt_test(tst_monitorview SOURCES src/ui/tst_monitorview.cpp
        src/ui/MonitorViewState.cpp src/ui/MonitorViewState.h
        LIBS timeline_core Qt6::Qml Qt6::Test)
    nt_qt_test(tst_timecode SOURCES src/ui/tst_timecode.cpp src/wiring/RulerProviders.cpp
        src/ui/TimelineViewState.cpp src/ui/TimelineViewState.h src/ui/TimelineFormatQml.h
        LIBS timeline_core Qt6::Qml Qt6::Test)
    qt_add_executable(tst_thumbnailcache tests/tst_thumbnailcache.cpp
        src/ui/ThumbnailDiskCache.cpp src/ui/MediaPreviews.cpp src/ui/MediaPreviews.h
        src/ui/TimelineViewState.cpp src/ui/TimelineViewState.h)
    set_target_properties(tst_thumbnailcache PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_thumbnailcache PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_thumbnailcache PRIVATE timeline_core Qt6::Gui Qt6::GuiPrivate
        Qt6::Qml Qt6::Quick Qt6::Test PkgConfig::FFMPEG)
    add_test(NAME tst_thumbnailcache COMMAND tst_thumbnailcache)
    set_tests_properties(tst_thumbnailcache PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

    # Waveform peaks at more than one resolution (AU-7).
    qt_add_executable(tst_peaklevels src/ui/tst_peaklevels.cpp
        src/ui/ThumbnailDiskCache.cpp src/ui/MediaPreviews.cpp src/ui/MediaPreviews.h src/ui/PeakLevels.h
        src/ui/TimelineViewState.cpp src/ui/TimelineViewState.h)
    set_target_properties(tst_peaklevels PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_peaklevels PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_peaklevels PRIVATE timeline_core Qt6::Gui Qt6::GuiPrivate
        Qt6::Qml Qt6::Quick Qt6::Test PkgConfig::FFMPEG)
    add_test(NAME tst_peaklevels COMMAND tst_peaklevels)
    set_tests_properties(tst_peaklevels PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

    # The midi note lines of a clip body: geometry and the drawing item.
    qt_add_executable(tst_midinotelines tests/tst_midinotelines.cpp src/ui/MidiNoteLines.cpp src/ui/MidiNoteLines.h
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/audio/automation/AutomationRecorder.h
        src/audio/automation/AutomationRecorder.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.h
        ${CMAKE_CURRENT_SOURCE_DIR}/../timeline-player/src/playback/PlaybackClock.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_midinotelines PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_midinotelines PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_midinotelines PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate
        Qt6::Qml Qt6::Quick Qt6::Test PkgConfig::FFMPEG)
    add_test(NAME tst_midinotelines COMMAND tst_midinotelines)
    set_tests_properties(tst_midinotelines PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

    # The track header's color strip, icon and volume slider.
    qt_add_executable(tst_trackheadervolume tests/tst_trackheadervolume.cpp ${NT_app})
    set_target_properties(tst_trackheadervolume PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_trackheadervolume PRIVATE tests)
    target_link_libraries(tst_trackheadervolume PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_trackheadervolume OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_trackheadervolume_qml/NodeTool/Timeline)
    add_test(NAME tst_trackheadervolume COMMAND tst_trackheadervolume)
    set_tests_properties(tst_trackheadervolume PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

    nt_qt_test(tst_timelinewheel LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

    # The tracks UI (M2): the QML module in an offscreen QQuickView with the
    # software scene graph, driven by synthetic wheel, gesture and mouse events.
    qt_add_executable(tst_tracksui tests/tst_tracksui.cpp)
    set_target_properties(tst_tracksui PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_tracksui PRIVATE ${NT_WARNINGS})
    target_compile_definitions(tst_tracksui PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(tst_tracksui PRIVATE timeline_core timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick
        Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    target_link_libraries(tst_tracksui PRIVATE timeline_server)
    # The account fakes (test_support.h) for the cloud saver tests.
    target_include_directories(tst_tracksui PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../account/tests)
    # The cloud saver applies a kept draft through the restoreDocument edit,
    # which the app registers from this file.
    target_sources(tst_tracksui PRIVATE src/server/recovery/RecoveryRegistration.cpp)
    nt_add_timeline_qml(tst_tracksui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_tracksui_qml/NodeTool/Timeline)
    add_test(NAME tst_tracksui COMMAND tst_tracksui)
    # No window is ever shown: the offscreen platform and the software renderer.
    set_tests_properties(tst_tracksui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")

endfunction()
nt_tests(nt_ui_tests)
