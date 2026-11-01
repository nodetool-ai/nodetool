# This registrar has no QML type headers that need an include directory.
nt_sources(qml qml/menus/MenuActions.cpp)
function(nt_menu_tests)
    qt_add_executable(tst_menus qml/menus/tst_menus.cpp ${NT_app})
    set_target_properties(tst_menus PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_menus PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_menus OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_menus_qml/NodeTool/Timeline)
    add_test(NAME tst_menus COMMAND tst_menus)
    set_tests_properties(tst_menus PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_menu_tests)
