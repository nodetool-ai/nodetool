nt_qml_sources(src/edit/inspectorsections/InspectorSectionRegistry.h
    src/edit/inspectorsections/InspectorSectionRegistry.cpp
    src/edit/inspectorsections/InspectorEdits.h src/edit/inspectorsections/InspectorEdits.cpp
    src/edit/inspectorsections/InspectorEditRegistrations.cpp
    src/edit/inspectorsections/SectionRegistrations.cpp)
nt_sources(qml_resources src/edit/inspectorsections/RegisteredInspectorSections.qml
    src/edit/inspectorsections/MediaSection.qml src/edit/inspectorsections/TimingSection.qml
    src/edit/inspectorsections/ClipGroupPanel.qml src/edit/inspectorsections/InspectorCaption.qml
    src/edit/inspectorsections/InspectorActionButton.qml)

function(nt_inspector_section_tests)
    qt_add_executable(tst_inspectorsections src/edit/inspectorsections/tst_inspectorsections.cpp
        src/app/BuiltinEdits.cpp src/edit/groups/GroupRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp)
    set_target_properties(tst_inspectorsections PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_inspectorsections PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_inspectorsections OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_inspectorsections_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_inspectorsections PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    qt_add_resources(tst_inspectorsections inspector_test PREFIX /inspector-test
        BASE src/edit/inspectorsections FILES src/edit/inspectorsections/TestInspectorSection.qml)
    add_test(NAME tst_inspectorsections COMMAND tst_inspectorsections)
    set_tests_properties(tst_inspectorsections PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_inspector_section_tests)
