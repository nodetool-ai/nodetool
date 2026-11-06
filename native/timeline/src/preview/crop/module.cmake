nt_sources(core src/preview/crop/Reframe.h src/preview/crop/Reframe.cpp)
nt_sources(app src/preview/crop/ReframeRegistrations.cpp src/preview/crop/CropDecorator.cpp
    src/preview/crop/ReframePanels.cpp)
nt_qml_sources(src/preview/crop/ReframeController.h src/preview/crop/ReframeController.cpp)
function(nt_reframe_tests)
    qt_add_executable(tst_reframe src/preview/crop/tst_reframe.cpp src/preview/crop/ReframeRegistrations.cpp
        src/preview/crop/CropDecorator.cpp src/preview/crop/ReframePanels.cpp)
    set_target_properties(tst_reframe PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_reframe PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_reframe OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_reframe_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_reframe PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME crop_comparator COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/crop/crop-comparator.test.mjs)
    add_test(NAME crop_golden COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/compare-golden.mjs
        ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/crop/fixtures/static-crops.json
        --frames 15,45,75 --min-psnr 40 --bin $<TARGET_FILE:nodetool-timeline>)
    add_test(NAME crop_reframe_golden COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/compare-golden.mjs
        ${CMAKE_CURRENT_SOURCE_DIR}/src/preview/crop/fixtures/reframe-crops.json
        --frames 15,45,75 --min-psnr 40 --bin $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(crop_golden crop_reframe_golden PROPERTIES LABELS render FIXTURES_REQUIRED media RUN_SERIAL TRUE)
    add_test(NAME tst_reframe COMMAND tst_reframe)
    set_tests_properties(tst_reframe PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_reframe_tests)
