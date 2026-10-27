nt_sources(app src/server/recovery/RecoveryRegistration.cpp)

function(nt_recovery_tests)
    qt_add_executable(tst_recovery src/server/recovery/tst_recovery.cpp
        src/server/recovery/RecoveryRegistration.cpp)
    target_link_libraries(tst_recovery PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_recovery OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_recovery_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_recovery PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_include_directories(tst_recovery PRIVATE tests)
    set_target_properties(tst_recovery PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_recovery COMMAND tst_recovery)
    set_tests_properties(tst_recovery PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_recovery_tests)
