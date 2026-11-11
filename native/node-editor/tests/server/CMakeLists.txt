# Can be built independently, or included by the host tests.
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
 cmake_minimum_required(VERSION 3.22)
 project(NodeEditorServerTests LANGUAGES CXX)
 enable_testing()
endif()
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Core Network WebSockets Test)
include(${CMAKE_CURRENT_LIST_DIR}/../../cmake/CodeInference.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../../cmake/GraphRunner.cmake)
add_executable(node_editor_server_tests WorkflowSessionTests.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/document/WorkflowMerge.cpp ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp ../../src/run/PartialRunPlanner.cpp ../../src/run/GenerationHistory.cpp)
target_link_libraries(node_editor_server_tests PRIVATE nodetool_graph_runner Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test)
nodetool_stage_graph_runner_runtime(node_editor_server_tests)
add_test(NAME node_editor_server_tests COMMAND node_editor_server_tests)
add_executable(node_editor_autosave_tests WorkflowAutosaveTests.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/document/WorkflowMerge.cpp ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp ../../src/run/PartialRunPlanner.cpp ../../src/run/GenerationHistory.cpp)
target_link_libraries(node_editor_autosave_tests PRIVATE nodetool_graph_runner Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test)
nodetool_stage_graph_runner_runtime(node_editor_autosave_tests)
add_test(NAME node_editor_autosave_tests COMMAND node_editor_autosave_tests)
find_package(Qt6 REQUIRED COMPONENTS Multimedia)
add_executable(node_editor_local_run_tests LocalRunTests.cpp
 ../../src/media/MediaResolver.cpp ../../src/media/MediaResolver.h ../../src/media/LocalMediaStore.h
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp ../../src/document/WorkflowMerge.cpp ../../src/run/PartialRunPlanner.cpp ../../src/run/GenerationHistory.cpp
 ../../src/run/NodeRuntimeModel.cpp ../../src/run/NodeRuntimeModel.h
 ../../src/run/RunOutputModel.cpp ../../src/run/RunOutputModel.h
 ../../src/run/OutputCollectionModel.cpp ../../src/run/OutputCollectionModel.h
 ../../src/media/PcmStream.cpp ../../src/media/PcmStream.h)
target_include_directories(node_editor_local_run_tests PRIVATE ../../src)
target_compile_definitions(node_editor_local_run_tests PRIVATE GUEST_BUNDLE="${NODETOOL_GUEST_BUNDLE}")
target_link_libraries(node_editor_local_run_tests PRIVATE nodetool_graph_runner Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test Qt6::Multimedia)
nodetool_stage_graph_runner_runtime(node_editor_local_run_tests)
add_test(NAME node_editor_local_run COMMAND node_editor_local_run_tests)
set_tests_properties(node_editor_local_run PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
find_package(Qt6 REQUIRED COMPONENTS Gui Qml Quick QuickControls2)
if(NOT TARGET nodetool_ui_primitives)
 add_subdirectory(../../../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
qt_add_executable(node_editor_server_sync_panel_tests ServerSyncPanelTest.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/document/WorkflowMerge.cpp ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp ../../src/run/PartialRunPlanner.cpp ../../src/run/GenerationHistory.cpp)
target_link_libraries(node_editor_server_sync_panel_tests PRIVATE nodetool_graph_runner Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test Qt6::Quick)
nodetool_stage_graph_runner_runtime(node_editor_server_sync_panel_tests)
target_compile_definitions(node_editor_server_sync_panel_tests PRIVATE PANEL_SOURCE="${CMAKE_CURRENT_SOURCE_DIR}/../../qml/ServerSyncPanel.qml")
nodetool_use_ui_primitives(node_editor_server_sync_panel_tests)
add_test(NAME node_editor_server_sync_panel COMMAND node_editor_server_sync_panel_tests)
set_tests_properties(node_editor_server_sync_panel PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
add_executable(node_editor_reroute_live_tests RerouteLiveTests.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/document/WorkflowMerge.cpp ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp ../../src/run/PartialRunPlanner.cpp ../../src/run/GenerationHistory.cpp
 ../../src/document/WorkflowDocument.cpp ../../src/document/WorkflowDocument.h)
node_editor_use_code_inference(node_editor_reroute_live_tests)
target_include_directories(node_editor_reroute_live_tests PRIVATE ../../src)
target_link_libraries(node_editor_reroute_live_tests PRIVATE nodetool_graph_runner Qt6::Core Qt6::Gui Qt6::Network Qt6::WebSockets Qt6::Test)
nodetool_stage_graph_runner_runtime(node_editor_reroute_live_tests)
add_test(NAME node_editor_reroute_live COMMAND node_editor_reroute_live_tests)
add_executable(node_editor_bundled_server_tests BundledServerTests.cpp
 ../../src/server/BundledServer.cpp ../../src/server/BundledServer.h)
target_include_directories(node_editor_bundled_server_tests PRIVATE ../../src)
target_link_libraries(node_editor_bundled_server_tests PRIVATE Qt6::Core Qt6::Network Qt6::Test)
add_test(NAME node_editor_bundled_server_tests COMMAND node_editor_bundled_server_tests)
