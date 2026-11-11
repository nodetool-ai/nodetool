function(nt_example_tests)
    qt_add_executable(tst_seamexample
        src/app/example/tst_seamexample.cpp src/app/example/ExampleRegistrations.cpp
        src/app/CliModes.cpp)
    set_target_properties(tst_seamexample PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_seamexample PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_seamexample PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_seamexample OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_seamexample_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_seamexample PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    qt_add_resources(tst_seamexample example_panel PREFIX /example BASE src/app/example
        FILES src/app/example/ExamplePanel.qml)
    add_test(NAME tst_seamexample COMMAND tst_seamexample)
    set_tests_properties(tst_seamexample PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_example_tests)
