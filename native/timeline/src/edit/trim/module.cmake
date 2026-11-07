nt_sources(core src/edit/trim/TrimModel.h src/edit/trim/TrimModel.cpp)
nt_qml_sources(src/edit/trim/TrimMode.h src/edit/trim/TrimMode.cpp
    src/edit/trim/TrimMonitorFrames.h src/edit/trim/TrimMonitorFrames.cpp)
nt_sources(app src/edit/trim/TrimRegistrations.cpp)
function(nt_trim_model_tests)
    nt_qt_test(tst_trimmodel SOURCES src/edit/trim/tst_trimmodel.cpp LIBS timeline_core Qt6::Test)
    qt_add_executable(tst_trimmode src/edit/trim/tst_trimmode.cpp ${NT_app})
    set_target_properties(tst_trimmode PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_trimmode PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_trimmode OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_trimmode_qml/NodeTool/Timeline)
    target_compile_definitions(tst_trimmode PRIVATE
        NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>"
        NT_TRIM_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_dependencies(tst_trimmode nodetool-timeline)
    qt_add_resources(tst_trimmode trim_sync_banner PREFIX /nodetool/sync BASE src/server/sync
        FILES src/server/sync/ExternalConflictsBanner.qml)
    add_test(NAME tst_trimmode COMMAND tst_trimmode)
    set_tests_properties(tst_trimmode PROPERTIES TIMEOUT 300 FIXTURES_REQUIRED media
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    # The frames come from the renderer, so this one needs what --stills needs.
    add_test(NAME tst_trimmode_frames COMMAND tst_trimmode framesMatchStills)
    set_tests_properties(tst_trimmode_frames PROPERTIES LABELS render TIMEOUT 400 FIXTURES_REQUIRED media
        ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
endfunction()
nt_tests(nt_trim_model_tests)
