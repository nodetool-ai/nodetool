nt_qml_sources(src/edit/clipeffects/ClipEffectsSections.cpp src/edit/clipeffects/ClipEffectsUi.h)
nt_sources(qml_resources src/edit/clipeffects/ClipAdjustments.qml src/edit/clipeffects/ClipEffectsList.qml
    src/edit/clipeffects/EffectRow.qml src/edit/clipeffects/EffectFields.qml
    src/edit/clipeffects/EffectNumber.qml src/edit/clipeffects/ToneCurveEditor.qml
    src/edit/clipeffects/ClipEffectsEdits.qml src/edit/clipeffects/ClipEffectsCatalog.js)

function(nt_clipeffects_tests)
    find_package(Qt6 6.12 REQUIRED COMPONENTS QuickTest)
    qt_add_executable(tst_clipeffects src/edit/clipeffects/tst_clipeffects.cpp
        src/app/BuiltinEdits.cpp src/edit/groups/GroupRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp)
    set_target_properties(tst_clipeffects PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_clipeffects PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test Qt6::QuickTest PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_clipeffects OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_clipeffects_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_clipeffects PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_compile_definitions(tst_clipeffects PRIVATE NT_TIMELINE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME tst_clipeffects COMMAND tst_clipeffects)
    set_tests_properties(tst_clipeffects PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME clipeffects_golden_script COMMAND node --test --test-isolation=none
        ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/clipeffects/check-inspector.test.mjs
        ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/clipeffects/catalogue.test.mjs)
endfunction()
nt_tests(nt_clipeffects_tests)
