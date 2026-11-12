# This registrar has no QML type headers that need an include directory.
nt_sources(qml qml/menus/MenuActions.cpp qml/menus/ContextMenus.cpp)
function(nt_menu_tests)
    find_package(Python3 REQUIRED COMPONENTS Interpreter)
    qt_add_executable(tst_menus qml/menus/tst_menus.cpp src/edit/sourceEdit/SourceKeyActions.cpp ${NT_app})
    set_target_properties(tst_menus PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_menus PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_menus OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_menus_qml/NodeTool/Timeline)
    # Each fresh editor is costly under ASan. Discover and partition all functions,
    # including future additions, without omitting any data rows.
    foreach(group RANGE 0 1)
        if(group EQUAL 0)
            set(test_name tst_menus)
        else()
            set(test_name tst_menus_remaining)
        endif()
        add_test(NAME ${test_name} COMMAND ${Python3_EXECUTABLE}
            ${CMAKE_CURRENT_SOURCE_DIR}/scripts/run-qtest-group.py $<TARGET_FILE:tst_menus> ${group} 2)
        set_tests_properties(${test_name} PROPERTIES TIMEOUT 900
            ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    endforeach()
endfunction()
nt_tests(nt_menu_tests)
