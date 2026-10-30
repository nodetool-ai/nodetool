function(nt_providerdialog_tests)
    qt_add_executable(tst_providerdialog src/providersettings/tst_providerdialog.cpp)
    set_target_properties(tst_providerdialog PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_providerdialog PRIVATE src/providersettings)
    target_link_libraries(tst_providerdialog PRIVATE timeline_server
        Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test)
    # Mount the production dialog and controller without compiling the entire editor twice.
    qt_add_qml_module(tst_providerdialog URI NodeTool.Timeline
        NO_GENERATE_QMLDIR
        OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_providerdialog_qml/NodeTool/Timeline
        QML_FILES qml/Theme.qml qml/providersettings/ProviderSettingsDialog.qml
        RESOURCES fonts/inter-latin-400-normal.woff2 fonts/inter-latin-500-normal.woff2
            fonts/inter-latin-600-normal.woff2 fonts/jetbrains-mono-latin-400-normal.woff2
            fonts/jetbrains-mono-latin-500-normal.woff2 fonts/jetbrains-mono-latin-600-normal.woff2
        SOURCES src/providersettings/ProviderSettings.h src/providersettings/ProviderSettings.cpp)
    # Other editor tests share this URI. Qt's generated qmake resource file
    # otherwise embeds whichever target wrote its qmldir last at configure time.
    set(provider_module_dir "${CMAKE_CURRENT_BINARY_DIR}/provider-dialog-module")
    file(MAKE_DIRECTORY "${provider_module_dir}")
    file(WRITE "${provider_module_dir}/qmldir"
        "module NodeTool.Timeline\nprefer :/qt/qml/NodeTool/Timeline/\nsingleton Theme 254.0 qml/Theme.qml\nProviderSettingsDialog 254.0 qml/providersettings/ProviderSettingsDialog.qml\n")
    qt_add_resources(tst_providerdialog provider_dialog_metadata
        PREFIX "/qt/qml/NodeTool/Timeline"
        BASE "${provider_module_dir}"
        FILES "${provider_module_dir}/qmldir")
    add_test(NAME tst_providerdialog COMMAND tst_providerdialog)
    set_tests_properties(tst_providerdialog PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_providerdialog_tests)
