nt_qml_sources(src/edit/clipaudio/ClipAudio.h src/edit/clipaudio/ClipAudio.cpp
    src/edit/clipaudio/AudioInspectorRegistration.cpp src/edit/clipaudio/AudioEffects.cpp)
function(nt_clipaudio_tests)
    qt_add_executable(tst_clipaudio src/edit/clipaudio/tst_clipaudio.cpp)
    set_target_properties(tst_clipaudio PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_clipaudio PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_clipaudio OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_clipaudio_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_clipaudio PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_compile_definitions(tst_clipaudio PRIVATE NT_TIMELINE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME clip_audio_mix COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/edit/clipaudio/check_mix.mjs
        ${CMAKE_CURRENT_SOURCE_DIR} $<TARGET_FILE:tst_clipaudio> $<TARGET_FILE:nodetool-timeline>)
    set_tests_properties(clip_audio_mix PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME tst_clipaudio COMMAND tst_clipaudio)
    set_tests_properties(tst_clipaudio PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_clipaudio_tests)
