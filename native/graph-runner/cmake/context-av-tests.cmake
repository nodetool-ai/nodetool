set(GR_CONTEXT_AV_TEST "${CMAKE_CURRENT_BINARY_DIR}/context-av-test.mjs")
add_custom_target(gr_context_av_test_bundle ALL
  COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context.mjs"
    "${GR_CONTEXT_AV_TEST}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/context-av.test.mjs"
  VERBATIM)
add_executable(gr_context_av_tests unittests/context_av.cpp)
target_link_libraries(gr_context_av_tests PRIVATE nodetool_graph_runner gr_kernel gr_js PkgConfig::GR_MEDIA)
add_dependencies(gr_context_av_tests gr_context_av_test_bundle)
add_test(NAME gr_context_av_tests
  COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/verify-context-av.mjs"
    "$<TARGET_FILE:gr_context_av_tests>" "${GR_CONTEXT_AV_TEST}")
set_tests_properties(gr_context_av_tests PROPERTIES TIMEOUT 600)
