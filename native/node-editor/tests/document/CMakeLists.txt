# Can be included by the host or configured independently for document-only tests.
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    cmake_minimum_required(VERSION 3.24)
    project(NodeEditorDocumentTests LANGUAGES CXX)
    enable_testing()
endif()
find_package(Qt6 REQUIRED COMPONENTS Core Gui Test)
include(${CMAKE_CURRENT_LIST_DIR}/../../cmake/CodeInference.cmake)
set(CMAKE_AUTOMOC ON)
add_library(node_editor_document STATIC
    ../../src/document/WorkflowDocument.cpp
    ../../src/document/WorkflowDocument.h
    ../../src/document/WorkflowMerge.cpp
    ../../src/document/WorkflowMerge.h)
node_editor_use_code_inference(node_editor_document)
target_compile_features(node_editor_document PUBLIC cxx_std_20)
target_include_directories(node_editor_document PUBLIC ../../src)
target_link_libraries(node_editor_document PUBLIC Qt6::Core Qt6::Gui)
add_executable(node_editor_document_tests WorkflowDocumentTest.cpp)
target_link_libraries(node_editor_document_tests PRIVATE node_editor_document Qt6::Test)
add_test(NAME node_editor_document COMMAND node_editor_document_tests)
add_executable(node_editor_workflow_merge_tests WorkflowMergeTest.cpp)
target_link_libraries(node_editor_workflow_merge_tests PRIVATE node_editor_document Qt6::Test)
add_test(NAME node_editor_workflow_merge COMMAND node_editor_workflow_merge_tests)
