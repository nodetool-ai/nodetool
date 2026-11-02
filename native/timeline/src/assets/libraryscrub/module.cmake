nt_qml_sources(src/assets/libraryscrub/LibraryScrub.h src/assets/libraryscrub/LibraryScrub.cpp
    src/assets/libraryscrub/LibraryScrubSource.h src/assets/libraryscrub/LibraryScrubSource.cpp)
# Key actions belong to the app so QML test fixtures can register their own handlers.
cmake_language(DEFER CALL target_sources nodetool-timeline PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src/assets/libraryscrub/LibraryScrubActions.cpp)

function(nt_library_scrub_tests)
    qt_add_executable(tst_libraryscrub src/assets/libraryscrub/tst_libraryscrub.cpp src/assets/AssetPanels.cpp)
    set_target_properties(tst_libraryscrub PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_libraryscrub PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_libraryscrub OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_libraryscrub_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_libraryscrub PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_compile_definitions(tst_libraryscrub PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_libraryscrub COMMAND tst_libraryscrub)
    set_tests_properties(tst_libraryscrub PROPERTIES FIXTURES_REQUIRED media
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_library_scrub_tests)
