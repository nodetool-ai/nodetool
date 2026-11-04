# Can be built independently, or included by the host tests.
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
 cmake_minimum_required(VERSION 3.22)
 project(NodeEditorServerTests LANGUAGES CXX)
 enable_testing()
endif()
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Core Network WebSockets Test)
add_executable(node_editor_server_tests WorkflowSessionTests.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h
 ../../src/server/MsgPack.cpp)
target_link_libraries(node_editor_server_tests PRIVATE Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test)
add_test(NAME node_editor_server_tests COMMAND node_editor_server_tests)
