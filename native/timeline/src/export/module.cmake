nt_sources(decode src/export/ExportCapabilities.h src/export/ExportCapabilities.cpp)
nt_sources(app src/export/ExportEngine.h src/export/ExportEngine.cpp
    src/export/OffscreenFrames.h src/export/OffscreenFrames.cpp src/export/ExportCli.cpp
    src/export/ExportPanel.cpp src/export/PngZip.h src/export/PngZip.cpp)
nt_qml_sources(src/export/ExportController.h src/export/ExportController.cpp)
function(nt_export_tests)
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
        snapshotKeepsRelativeMatte cancelExportDuringAudio cancelBlockedAudio cancelOfflineMix stuckChildTeardownCleansStaging)
    set_tests_properties(tst_exportdialog PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME export_controller_cancel COMMAND tst_exportdialog controllerCancel)
    set_tests_properties(export_controller_cancel PROPERTIES LABELS render FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_export_tests)

function(nt_export_snapshot_tests)
    qt_add_executable(tst_exportsnapshot src/export/tst_exportsnapshot.cpp
        src/export/ExportController.cpp src/model/TimelineModel.cpp src/model/TrackListModel.cpp)
    target_link_libraries(tst_exportsnapshot PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_exportsnapshot COMMAND tst_exportsnapshot)
endfunction()
nt_tests(nt_export_snapshot_tests)
