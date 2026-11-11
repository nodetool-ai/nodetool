nt_sources(core src/takes/TakeSwitch.h src/takes/TakeSwitch.cpp)
nt_qml_sources(src/takes/TakeSwitcher.h src/takes/TakeSwitcher.cpp src/takes/TakeGrid.h src/takes/TakeGrid.cpp src/takes/TakeActions.cpp)

function(nt_takes_tests)
    nt_qt_test(tst_takeswitch SOURCES src/takes/tst_takeswitch.cpp LIBS timeline_core Qt6::Test)
    qt_add_executable(tst_takeswitchui src/takes/tst_takeswitchui.cpp ${NT_app})
    set_target_properties(tst_takeswitchui PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_takeswitchui PRIVATE src/wiring)
    target_link_libraries(tst_takeswitchui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_takeswitchui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_takeswitchui_qml/NodeTool/Timeline)
    target_compile_definitions(tst_takeswitchui PRIVATE NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>"
        NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    qt_add_resources(tst_takeswitchui takes_sync_banner PREFIX /nodetool/sync BASE src/server/sync
        FILES src/server/sync/ExternalConflictsBanner.qml)
    if(UNIX AND NOT APPLE)
        target_sources(tst_takeswitchui PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_dependencies(tst_takeswitchui nodetool-timeline)
    add_test(NAME tst_takeswitchui COMMAND tst_takeswitchui)
    set_tests_properties(tst_takeswitchui PROPERTIES LABELS render TIMEOUT 400 ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
endfunction()
nt_tests(nt_takes_tests)
