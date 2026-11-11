# WorkflowDocument uses shared Code and child-graph port derivation. Standalone
# document targets need both helpers, the parser resources and QJSEngine.
find_package(Qt6 REQUIRED COMPONENTS Qml)
function(node_editor_use_code_inference target)
  set(root "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/..")
  target_sources(${target} PRIVATE "${root}/src/document/ChildPorts.cpp" "${root}/src/document/ChildPorts.h" "${root}/src/properties/CodeInference.cpp" "${root}/src/properties/CodeInference.h")
  target_link_libraries(${target} PRIVATE Qt6::Qml)
  qt_add_resources(${target} code_parser PREFIX /editor/code BASE "${root}/resources/code"
    FILES "${root}/resources/code/acorn.js" "${root}/resources/code/inference.js")
endfunction()
