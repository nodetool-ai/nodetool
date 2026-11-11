nt_sources(core src/scenedetect/SceneDetect.h src/scenedetect/SceneDetect.cpp
    src/scenedetect/SceneEditPlan.h src/scenedetect/SceneEditPlan.cpp)
nt_sources(decode src/scenedetect/ShotScan.h src/scenedetect/ShotScan.cpp)
nt_qml_sources(src/scenedetect/SceneEditController.h src/scenedetect/SceneEditController.cpp
    src/scenedetect/SceneEditSession.h src/scenedetect/SceneEditRegistrations.cpp)
nt_sources(app src/scenedetect/SceneEditPanels.cpp)

function(nt_scenedetect_tests)
    qt_add_executable(tst_scenedetect src/scenedetect/tst_scenedetect.cpp)
    set_target_properties(tst_scenedetect PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_scenedetect PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_scenedetect PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_scenedetect COMMAND tst_scenedetect)

    qt_add_executable(tst_sceneeditplan src/scenedetect/tst_sceneeditplan.cpp)
    set_target_properties(tst_sceneeditplan PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_sceneeditplan PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_sceneeditplan PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_sceneeditplan COMMAND tst_sceneeditplan)

    qt_add_executable(tst_shotscan src/scenedetect/tst_shotscan.cpp)
    set_target_properties(tst_shotscan PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_shotscan PRIVATE ${NT_WARNINGS})
    target_compile_definitions(tst_shotscan PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(tst_shotscan PRIVATE timeline_core timeline_decode Qt6::Test)
    add_test(NAME tst_shotscan COMMAND tst_shotscan)
    set_tests_properties(tst_shotscan PROPERTIES FIXTURES_REQUIRED media)

    qt_add_executable(tst_sceneedit src/scenedetect/tst_sceneedit.cpp ${NT_app})
    set_target_properties(tst_sceneedit PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_definitions(tst_sceneedit PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    target_link_libraries(tst_sceneedit PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_sceneedit OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_sceneedit_qml/NodeTool/Timeline)
    add_test(NAME tst_sceneedit COMMAND tst_sceneedit)
    set_tests_properties(tst_sceneedit PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software"
        FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_scenedetect_tests)
