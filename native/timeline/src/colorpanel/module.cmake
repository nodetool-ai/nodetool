nt_qml_sources(src/colorpanel/ScopesController.h src/colorpanel/ScopesController.cpp
    src/colorpanel/ColorMatchController.h src/colorpanel/ColorMatchController.cpp)

function(nt_colorpanel_tests)
    find_package(Qt6 6.12 REQUIRED COMPONENTS QuickTest)
    qt_add_executable(tst_colorpanel src/colorpanel/tst_colorpanel.cpp
        src/app/BuiltinEdits.cpp src/edit/groups/GroupRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp src/edit/tracks/TrackEditRegistrations.cpp)
    set_target_properties(tst_colorpanel PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_colorpanel PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test Qt6::QuickTest PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_colorpanel OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_colorpanel_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_colorpanel PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_compile_definitions(tst_colorpanel PRIVATE NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>")
    add_dependencies(tst_colorpanel nodetool-timeline)
    add_test(NAME tst_colorpanel COMMAND tst_colorpanel)
    set_tests_properties(tst_colorpanel PROPERTIES LABELS render TIMEOUT 400 ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
    add_test(NAME colorpanel_wheelmath COMMAND node --test --test-isolation=none ${CMAKE_CURRENT_SOURCE_DIR}/src/colorpanel/wheelmath.test.mjs)
endfunction()
nt_tests(nt_colorpanel_tests)
