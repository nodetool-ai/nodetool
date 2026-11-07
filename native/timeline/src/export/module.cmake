nt_sources(decode src/export/ExportCapabilities.h src/export/ExportCapabilities.cpp)
nt_sources(app src/export/ExportEngine.h src/export/ExportEngine.cpp
    src/export/OffscreenFrames.h src/export/OffscreenFrames.cpp src/export/ExportCli.cpp src/export/FrameServerCli.cpp
    src/export/ExportPanel.cpp src/export/ExportRegistrations.cpp src/export/PngZip.h src/export/PngZip.cpp)
nt_qml_sources(src/export/ExportSettings.h src/export/ExportSettings.cpp
    src/export/ExportPresets.h src/export/ExportPresets.cpp
    src/export/ExportQueue.h src/export/ExportQueue.cpp
    src/export/ExportController.h src/export/ExportController.cpp
    src/export/FrameCapture.h src/export/FrameCapture.cpp src/export/FrameImage.h src/export/FrameImage.cpp)
function(nt_export_tests)
    add_test(NAME export_precision COMMAND python3 ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-precision.py
        $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(export_precision PROPERTIES LABELS render RUN_SERIAL TRUE)
    qt_add_executable(tst_deliveryframe src/export/tst_deliveryframe.cpp)
    target_include_directories(tst_deliveryframe PRIVATE src)
    target_link_libraries(tst_deliveryframe PRIVATE Qt6::Gui Qt6::Test PkgConfig::FFMPEG)
    add_test(NAME tst_deliveryframe COMMAND tst_deliveryframe)
    qt_add_executable(tst_pngzip src/export/tst_pngzip.cpp src/export/PngZip.cpp)
    set_target_properties(tst_pngzip PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_pngzip PRIVATE src)
    target_link_libraries(tst_pngzip PRIVATE Qt6::Gui Qt6::Test)
    add_test(NAME tst_pngzip COMMAND tst_pngzip)
    add_test(NAME export_check_guards COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-checks.mjs
        --bin $<TARGET_FILE:nodetool-timeline>)
    foreach(check golden audio timing cancel png)
        if(check STREQUAL "golden")
            set(script check-export.mjs)
        else()
            set(script check-${check}.mjs)
        endif()
        add_test(NAME export_${check} COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/${script}
            --bin $<TARGET_FILE:nodetool-timeline>)
        set_tests_properties(export_${check} PROPERTIES LABELS render FIXTURES_REQUIRED media
            RUN_SERIAL TRUE)
    endforeach()
    add_test(NAME export_range COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-export.mjs --range
        --bin $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(export_range PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE)
    # Full fixture export under ASan takes about 18 minutes.
    set_tests_properties(export_golden PROPERTIES TIMEOUT 2400)
    add_test(NAME export_wav_audio COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-audio.mjs
        --bin $<TARGET_FILE:nodetool-timeline> --wav-only)
    add_test(NAME export_cleanup COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-cancel.mjs
        --bin $<TARGET_FILE:nodetool-timeline> --no-render)
    set_tests_properties(export_wav_audio export_cleanup PROPERTIES FIXTURES_REQUIRED media
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    qt_add_executable(tst_exportdialog src/export/tst_exportdialog.cpp src/export/ExportPanel.cpp
        src/export/ExportEngine.cpp src/export/OffscreenFrames.cpp src/export/PngZip.cpp
        src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_exportdialog PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_exportdialog PRIVATE
        NT_EXPORT_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_EXPORT_BINARY="$<TARGET_FILE:nodetool-timeline>")
    target_link_libraries(tst_exportdialog PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_exportdialog OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_exportdialog_qml/NodeTool/Timeline)
    add_test(NAME tst_exportdialog COMMAND tst_exportdialog dialog panelContext controllerCancelBeforeFrames
        snapshotKeepsRelativeMatte refusesUnavailableServerOriginal audioOnlyExportAllowsMissingPictureOriginal
        cancelExportDuringAudio cancelBlockedAudio cancelOfflineMix stuckChildTeardownCleansStaging
        fitFrameModes)
    set_tests_properties(tst_exportdialog PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(tst_framecapture src/export/tst_framecapture.cpp src/export/OffscreenFrames.cpp src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_framecapture PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_framecapture PRIVATE
        NT_EXPORT_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_EXPORT_BINARY="$<TARGET_FILE:nodetool-timeline>")
    target_link_libraries(tst_framecapture PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test)
    nt_add_timeline_qml(tst_framecapture)
    nt_effects_shaders(tst_framecapture)
    add_test(NAME native_backend_routes COMMAND python3 ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-backends.py
        $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(native_backend_routes PROPERTIES LABELS render RUN_SERIAL TRUE TIMEOUT 180)
    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        add_test(NAME tst_framecapture_opengl COMMAND tst_framecapture offscreenTypedCapture)
        set_tests_properties(tst_framecapture_opengl PROPERTIES LABELS render
            ENVIRONMENT "QSG_RHI_BACKEND=opengl" ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    endif()
    add_test(NAME tst_framecapture COMMAND tst_framecapture)
    add_test(NAME tst_colormatch_render COMMAND tst_framecapture colorMatchWorkingFormat offscreenTypedCapture)
    set_tests_properties(tst_colormatch_render PROPERTIES LABELS render
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    set_tests_properties(tst_framecapture PROPERTIES LABELS render FIXTURES_REQUIRED media
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    add_test(NAME export_original_pixels COMMAND tst_exportdialog snapshotRendersOriginalPicture
        relativeMatteSurvivesOriginalPictureSelection)
    if(APPLE)
        set_tests_properties(export_original_pixels PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=cocoa")
    endif()
    # RenderControl needs the platform RHI; Linux/Windows inherit the same
    # headless render backend as the other render-labelled tests.
    set_tests_properties(export_original_pixels PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    # These two render frames, so they need the platform RHI as well. No render label: CI's render
    # step only runs once every other test passes.
    add_test(NAME export_range_bitrate COMMAND tst_exportdialog rangeResolution bitrateExport)
    if(APPLE)
        set_tests_properties(export_range_bitrate PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=cocoa")
    endif()
    set_tests_properties(export_range_bitrate PROPERTIES FIXTURES_REQUIRED media RUN_SERIAL TRUE
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    add_test(NAME export_controller_cancel COMMAND tst_exportdialog controllerCancel)
    set_tests_properties(export_controller_cancel PROPERTIES LABELS render FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_export_tests)

function(nt_export_snapshot_tests)
    qt_add_executable(tst_exportsnapshot src/export/tst_exportsnapshot.cpp
        src/export/ExportController.cpp src/export/ExportSettings.cpp
        src/model/TimelineModel.cpp src/model/TrackListModel.cpp)
    target_link_libraries(tst_exportsnapshot PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_exportsnapshot COMMAND tst_exportsnapshot)
endfunction()
nt_tests(nt_export_snapshot_tests)

function(nt_export_queue_tests)
    qt_add_executable(tst_exportqueue src/export/tst_exportqueue.cpp
        src/export/ExportQueue.cpp src/export/ExportPresets.cpp src/export/ExportSettings.cpp
        src/export/ExportController.cpp src/model/TimelineModel.cpp src/model/TrackListModel.cpp)
    set_target_properties(tst_exportqueue PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_exportqueue PRIVATE
        NT_EXPORT_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_EXPORT_BINARY="$<TARGET_FILE:nodetool-timeline>")
    target_link_libraries(tst_exportqueue PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::Qml Qt6::Test)
    add_dependencies(tst_exportqueue nodetool-timeline)
    add_test(NAME tst_exportqueue COMMAND tst_exportqueue)
    set_tests_properties(tst_exportqueue PROPERTIES ENVIRONMENT
        "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_export_queue_tests)
nt_qml_sources(src/export/FrameExporter.h src/export/FrameExporter.cpp)
function(nt_frameexport_tests)
    qt_add_executable(tst_frameexport src/export/tst_frameexport.cpp src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp
        src/export/FrameExporter.h src/export/FrameExporter.cpp src/export/FrameCapture.h src/export/FrameCapture.cpp
        src/export/ExportController.h src/export/ExportController.cpp
        src/export/ExportSettings.h src/export/ExportSettings.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp src/model/TrackListModel.h src/model/TrackListModel.cpp)
    target_link_libraries(tst_frameexport PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::Test ${NT_APP_PLATFORM_LIBS})
    target_compile_definitions(tst_frameexport PRIVATE NT_EXPORT_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_EXPORT_BINARY="$<TARGET_FILE:nodetool-timeline>")
    add_test(NAME tst_frameexport COMMAND tst_frameexport)
    set_tests_properties(tst_frameexport PROPERTIES LABELS render FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_frameexport_tests)
function(nt_frameexport_integration_tests)
    add_test(NAME frameexport_stills COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/check-frameexport-stills.mjs
        --bin $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(frameexport_stills PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE)
    add_test(NAME frameexport_server COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/export/frameexport-server.test.mjs
        $<TARGET_FILE:nodetool-timeline> $<TARGET_FILE:tst_frameexportui>)
    set_tests_properties(frameexport_server PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE
        SKIP_RETURN_CODE 77 TIMEOUT 360)
endfunction()
nt_tests(nt_frameexport_integration_tests)
nt_sources(app src/export/FrameExportCli.cpp)
nt_sources(app src/export/FrameExportActions.cpp)
function(nt_frameexport_ui_tests)
    qt_add_executable(tst_frameexportui src/export/tst_frameexportui.cpp ${NT_app})
    set_target_properties(tst_frameexportui PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_frameexportui PRIVATE NT_EXPORT_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
        NT_EXPORT_BINARY="$<TARGET_FILE:nodetool-timeline>")
    target_link_libraries(tst_frameexportui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_frameexportui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_frameexportui_qml/NodeTool/Timeline)
    add_test(NAME tst_frameexportui COMMAND tst_frameexportui)
    # The editor draws in software. The capture helper it starts drops that and needs the platform RHI.
    set_tests_properties(tst_frameexportui PROPERTIES LABELS render FIXTURES_REQUIRED media ENVIRONMENT "QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_frameexport_ui_tests)
