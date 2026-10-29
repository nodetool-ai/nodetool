nt_sources(core src/ai/Take.h src/ai/Take.cpp src/ai/ClipRequests.h src/ai/ClipRequests.cpp src/ai/Extension.h src/ai/Extension.cpp src/ai/WorkflowInputs.h src/ai/WorkflowInputs.cpp)
nt_sources(server src/ai/GenerationTransport.h src/ai/GenerationTransport.cpp src/ai/WorkflowGeneration.h src/ai/WorkflowGeneration.cpp src/ai/WorkflowCost.h src/ai/WorkflowCost.cpp)
nt_qml_sources(src/ai/GenerationController.h src/ai/GenerationController.cpp
    src/ai/AiHostRegistry.h src/ai/AiHostRegistry.cpp src/ai/AiInspectorRegistration.cpp)

function(nt_ai_tests)
    get_filename_component(NT_AI_REPO "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
    foreach(oracle AiOracle TakeOracle)
        qt_add_executable(nt_ai_${oracle} src/ai/${oracle}.cpp)
        target_link_libraries(nt_ai_${oracle} PRIVATE timeline_core)
        set_target_properties(nt_ai_${oracle} PROPERTIES MACOSX_BUNDLE FALSE)
    endforeach()
    add_test(NAME ai_oracle COMMAND "${NT_AI_REPO}/node_modules/.bin/vitest" run
        --config "${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/vitest.config.mts")
    set_tests_properties(ai_oracle PROPERTIES ENVIRONMENT "NT_CONFORMANCE_TESTS=${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/suites/ai.test.ts;NT_AI_ORACLE=$<TARGET_FILE:nt_ai_AiOracle>" TIMEOUT 120)
    add_test(NAME ai_take_oracle COMMAND "${NT_AI_REPO}/node_modules/.bin/vitest" run
        --config "${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/vitest.config.mts")
    set_tests_properties(ai_take_oracle PROPERTIES ENVIRONMENT "NT_CONFORMANCE_TESTS=${CMAKE_CURRENT_SOURCE_DIR}/src/ai/take-oracle.test.ts;NT_AI_TAKE_ORACLE=$<TARGET_FILE:nt_ai_TakeOracle>" TIMEOUT 120)
    qt_add_executable(tst_ai_take src/ai/tst_take.cpp)
    target_link_libraries(tst_ai_take PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_ai_take COMMAND tst_ai_take)
    qt_add_executable(tst_ai_cost src/ai/tst_workflowcost.cpp)
    target_link_libraries(tst_ai_cost PRIVATE timeline_server Qt6::Test)
    add_test(NAME tst_ai_cost COMMAND tst_ai_cost)
    qt_add_executable(tst_ai_inputs src/ai/tst_workflowinputs.cpp)
    target_link_libraries(tst_ai_inputs PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_ai_inputs COMMAND tst_ai_inputs)
    qt_add_executable(tst_ai_extension src/ai/tst_extension.cpp)
    target_link_libraries(tst_ai_extension PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_ai_extension COMMAND tst_ai_extension)
    qt_add_executable(tst_ai_requests src/ai/tst_cliprequests.cpp)
    target_link_libraries(tst_ai_requests PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_ai_requests COMMAND tst_ai_requests)
    qt_add_executable(tst_ai_controller src/ai/tst_generationcontroller.cpp
        src/ai/GenerationController.h src/ai/GenerationController.cpp
        src/aiassist/AssistantSession.h src/aiassist/AssistantSession.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
    target_link_libraries(tst_ai_controller PRIVATE timeline_core timeline_decode timeline_server timeline_audio
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::WebSockets Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_ai_controller COMMAND tst_ai_controller)
    qt_add_executable(tst_ai_ui src/ai/tst_generationui.cpp src/preview/hw/HwWindow.cpp)
    target_link_libraries(tst_ai_ui PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_ai_ui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_ai_ui_qml/NodeTool/Timeline)
    add_test(NAME tst_ai_ui COMMAND tst_ai_ui)
    set_tests_properties(tst_ai_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(tst_ai_device src/ai/tst_generationdevice.cpp src/preview/hw/HwWindow.cpp)
    set_target_properties(tst_ai_device PROPERTIES EXCLUDE_FROM_ALL TRUE)
    target_link_libraries(tst_ai_device PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_ai_device OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_ai_device_qml/NodeTool/Timeline)
    qt_add_executable(tst_ai_workflow src/ai/tst_workflowgeneration.cpp)
    target_link_libraries(tst_ai_workflow PRIVATE timeline_server Qt6::WebSockets Qt6::Test)
    add_test(NAME tst_ai_workflow COMMAND tst_ai_workflow)
    qt_add_executable(tst_ai_transport src/ai/tst_generationtransport.cpp)
    target_link_libraries(tst_ai_transport PRIVATE timeline_server Qt6::WebSockets Qt6::Test)
    add_test(NAME tst_ai_transport COMMAND tst_ai_transport)
endfunction()
nt_tests(nt_ai_tests)
