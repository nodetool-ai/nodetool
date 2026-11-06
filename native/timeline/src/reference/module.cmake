nt_qml_sources(src/reference/ReferenceController.h src/reference/ReferenceController.cpp
    src/reference/ReferenceRegistrations.cpp)

function(nt_reference_tests)
    find_package(Qt6 6.12 REQUIRED COMPONENTS QuickTest)
    qt_add_executable(tst_reference src/reference/tst_reference.cpp
        src/app/BuiltinEdits.cpp src/edit/groups/GroupRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp src/edit/tracks/TrackEditRegistrations.cpp)
    set_target_properties(tst_reference PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_reference PRIVATE tests)
    target_link_libraries(tst_reference PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Network Qt6::Test Qt6::QuickTest PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_reference OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_reference_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_reference PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_compile_definitions(tst_reference PRIVATE NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>")
    add_dependencies(tst_reference nodetool-timeline)
    add_test(NAME tst_reference COMMAND tst_reference)
    set_tests_properties(tst_reference PROPERTIES LABELS render TIMEOUT 400 ENVIRONMENT_MODIFICATION "QT_QUICK_BACKEND=unset:")
endfunction()
nt_tests(nt_reference_tests)
