cmake_minimum_required(VERSION 3.22)
# Windows: link the C++ runtime statically, so the helper needs no VC++ redistributable.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

project(NodeToolVstHost VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()

# JUCE comes from GitHub at a pinned tag. To build offline, point JUCE_DIR at a
# local checkout: cmake -B build -DJUCE_DIR=/path/to/JUCE
if(DEFINED JUCE_DIR)
    add_subdirectory(${JUCE_DIR} ${CMAKE_BINARY_DIR}/JUCE)
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.4
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(JUCE)
endif()

set(VSTHOST_DEFS
    JUCE_PLUGINHOST_VST3=1 JUCE_PLUGINHOST_AU=0 JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0
    NODETOOL_VSTHOST_VERSION="${PROJECT_VERSION}")
set(VSTHOST_LIBS
    juce::juce_audio_processors
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags)

juce_add_console_app(NodeToolVstHost PRODUCT_NAME "NodeToolVstHost")
target_sources(NodeToolVstHost PRIVATE source/VstHostMain.cpp source/VstHost.cpp)
if(APPLE)
    enable_language(OBJCXX)
    target_sources(NodeToolVstHost PRIVATE source/MacApplication.mm)
endif()
target_compile_definitions(NodeToolVstHost PRIVATE ${VSTHOST_DEFS})
target_link_libraries(NodeToolVstHost PRIVATE ${VSTHOST_LIBS})

option(VSTHOST_BUILD_TESTS "Build vst_host_test and its test instrument" ON)
if(VSTHOST_BUILD_TESTS)
    # A sine instrument the test loads, so CI needs no third-party plug-in.
    juce_add_plugin(ToneInstrument
        PRODUCT_NAME "NodeTool Test Tone"
        COMPANY_NAME "NodeTool"
        PLUGIN_MANUFACTURER_CODE Ndtl
        PLUGIN_CODE Tone
        FORMATS VST3
        IS_SYNTH TRUE
        NEEDS_MIDI_INPUT TRUE
        COPY_PLUGIN_AFTER_BUILD FALSE)
    set_target_properties(ToneInstrument PROPERTIES OBJCXX_VISIBILITY_PRESET hidden)
    target_sources(ToneInstrument PRIVATE test/tone/ToneInstrument.cpp)
    target_compile_definitions(ToneInstrument PUBLIC
        JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
    target_link_libraries(ToneInstrument PRIVATE
        juce::juce_audio_utils
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)

    juce_add_console_app(vst_host_test PRODUCT_NAME "vst_host_test")
    target_sources(vst_host_test PRIVATE test/vst_host_test.cpp source/VstHost.cpp)
    target_compile_definitions(vst_host_test PRIVATE ${VSTHOST_DEFS})
    target_link_libraries(vst_host_test PRIVATE ${VSTHOST_LIBS})
    add_dependencies(vst_host_test ToneInstrument_VST3)
    set(VSTHOST_TEST_PLUGIN "${CMAKE_BINARY_DIR}/ToneInstrument_artefacts/$<CONFIG>/VST3/NodeTool Test Tone.vst3")
    set(VSTHOST_TEST_STATE "${CMAKE_BINARY_DIR}/nondefault-state.txt")
    add_test(NAME vst_host_test
        COMMAND vst_host_test "${VSTHOST_TEST_PLUGIN}" "${VSTHOST_TEST_STATE}")
    set_tests_properties(vst_host_test PROPERTIES FIXTURES_SETUP vst_nondefault_state)
    find_program(NODE_EXECUTABLE node REQUIRED)
    add_test(NAME vst_editor_state
        COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/test/editor-state.test.mjs"
            "$<TARGET_FILE:NodeToolVstHost>" "${VSTHOST_TEST_PLUGIN}" "${VSTHOST_TEST_STATE}")
    set_tests_properties(vst_editor_state PROPERTIES FIXTURES_REQUIRED vst_nondefault_state TIMEOUT 40)
endif()
