nt_qml_sources(src/edit/audioroles/AudioRoleJson.h src/edit/audioroles/AudioRoleEdits.cpp
    src/edit/audioroles/RoleAnalysis.h src/edit/audioroles/RoleAnalysis.cpp
    src/edit/audioroles/AudioRoles.h src/edit/audioroles/AudioRoles.cpp
    src/edit/audioroles/AudioRolesRegistration.cpp
    src/edit/audioroles/LoudnessMeters.h src/edit/audioroles/LoudnessMeters.cpp)
nt_sources(app src/edit/audioroles/AudioRolesCli.cpp)
nt_sources(audio src/audio/loudness/AppReadout.h src/audio/loudness/AppReadout.cpp)
function(nt_audioroles_tests)
    qt_add_executable(tst_audioroles src/edit/audioroles/tst_audioroles.cpp)
    set_target_properties(tst_audioroles PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_audioroles PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_audioroles OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_audioroles_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_audioroles PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_audioroles COMMAND tst_audioroles)
    set_tests_properties(tst_audioroles PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(tst_audiorolesui src/edit/audioroles/tst_audiorolesui.cpp)
    set_target_properties(tst_audiorolesui PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_audiorolesui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_audiorolesui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_audiorolesui_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_audiorolesui PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    # The panel is dock content, so it needs a real window platform: the software scene graph under xcb.
    add_test(NAME tst_audiorolesui COMMAND tst_audiorolesui)
    set_tests_properties(tst_audiorolesui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_audioroles_tests)
function(nt_audioroles_cli_tests)
    add_test(NAME audio_roles_cli COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/audioroles/check-roles.mjs
        --bin $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(audio_roles_cli PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_audioroles_cli_tests)
