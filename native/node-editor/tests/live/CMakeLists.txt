cmake_minimum_required(VERSION 3.24)
project(NodeEditorLiveTests LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Network WebSockets Test)
enable_testing()
add_executable(node_editor_live_tests WorkflowSessionLiveTest.cpp
 ../../src/server/WorkflowSession.cpp ../../src/server/WorkflowSession.h ../../src/server/AccountJobs.cpp ../../src/server/AccountJobs.h
 ../../src/server/MsgPack.cpp)
target_link_libraries(node_editor_live_tests PRIVATE Qt6::Core Qt6::Network Qt6::WebSockets Qt6::Test)
add_test(NAME node_editor_live COMMAND node_editor_live_tests)
