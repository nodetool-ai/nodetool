nt_sources(core src/preview/gizmo/GizmoMath.h src/preview/gizmo/GizmoMath.cpp)
nt_qml_sources(src/preview/gizmo/TransformGizmoController.h src/preview/gizmo/TransformGizmoController.cpp
    src/preview/gizmo/GizmoPanel.cpp)

function(nt_gizmo_tests)
    qt_add_executable(tst_gizmo src/preview/gizmo/tst_gizmo.cpp)
    set_target_properties(tst_gizmo PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_gizmo PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test
        PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    target_compile_definitions(tst_gizmo PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    nt_add_timeline_qml(tst_gizmo OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_gizmo_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_gizmo PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_gizmo COMMAND tst_gizmo)
    set_tests_properties(tst_gizmo PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_gizmo_tests)

qt_add_executable(timeline-gizmo-oracle src/preview/gizmo/GizmoOracle.cpp)
set_target_properties(timeline-gizmo-oracle PROPERTIES MACOSX_BUNDLE FALSE)
target_link_libraries(timeline-gizmo-oracle PRIVATE timeline_core Qt6::Core)
