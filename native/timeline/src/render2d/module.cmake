# The rasterizer, layer style, raster sources and their hook registration are
# in native/timeline-player (nodetool_timeline_decode). The inspector sections
# and the tests, which read packages/timeline, stay here.
nt_sources(app ${NT_RENDER2D_REGISTRAR})
nt_qml_sources(src/render2d/Render2dSections.cpp)

function(nt_render2d_copy_fonts)
    file(GLOB fonts CONFIGURE_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/fonts/*.ttf"
        "${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/fonts/*.txt")
    add_custom_target(timeline_fonts
        COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:nodetool-timeline>/fonts"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${fonts} "$<TARGET_FILE_DIR:nodetool-timeline>/fonts"
        DEPENDS ${fonts}
        VERBATIM)
    add_dependencies(nodetool-timeline timeline_fonts)
endfunction()
cmake_language(DEFER CALL nt_render2d_copy_fonts)

function(nt_render2d_tests)
    qt_add_executable(tst_render2d src/render2d/tst_render2d.cpp ${NT_RENDER2D_REGISTRAR})
    set_target_properties(tst_render2d PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_render2d PRIVATE timeline_decode Qt6::Test)
    target_compile_definitions(tst_render2d PRIVATE NT_RENDER2D_REFERENCE_DIR="${CMAKE_CURRENT_BINARY_DIR}/render2d-reference")
    add_test(NAME render2d_reference COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/reference.mjs ${CMAKE_CURRENT_BINARY_DIR}/render2d-reference)
    set_tests_properties(render2d_reference PROPERTIES FIXTURES_SETUP render2d_reference)
    add_test(NAME tst_render2d COMMAND tst_render2d)
    set(render2d_platform offscreen)
    if(WIN32)
        # The offscreen font database only scans QT_QPA_FONTDIR. Use the same
        # system fallback and color emoji engine as the app. No window is shown.
        set(render2d_platform windows)
    endif()
    set_tests_properties(tst_render2d PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=${render2d_platform}" FIXTURES_REQUIRED render2d_reference)
    # The app shapes at the screen's logical DPI (72 on macOS). Its own process,
    # because Qt caches font engines made at the 96 DPI the other slots use.
    add_test(NAME tst_render2d_dpi72 COMMAND tst_render2d textAdvanceIgnoresDpi)
    set_tests_properties(tst_render2d_dpi72 PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=${render2d_platform};QT_FONT_DPI=72")
    add_test(NAME render2d_stills_script COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/check-example-stills.test.mjs)
    add_test(NAME render2d_serein_m0 COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/serein-m0.test.mjs)
    add_test(NAME render2d_window_dry_run COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/window-checks.test.mjs)
endfunction()
nt_tests(nt_render2d_tests)

function(nt_render2d_inspector_tests)
    qt_add_executable(tst_render2dinspector src/render2d/tst_render2dinspector.cpp
        src/app/BuiltinEdits.cpp src/edit/groups/GroupRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp)
    set_target_properties(tst_render2dinspector PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_render2dinspector PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_render2dinspector OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_render2dinspector_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_render2dinspector PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_render2dinspector COMMAND tst_render2dinspector)
    set_tests_properties(tst_render2dinspector PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_render2d_inspector_tests)
