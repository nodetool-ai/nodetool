# The Intl fixture runs in Node for the reference and in the guest through
# guest-probe; the two result lists must match.
set(GR_INTL_TEST "${CMAKE_CURRENT_BINARY_DIR}/intl-icu-test.js")
set(GR_INTL_REFERENCE "${CMAKE_CURRENT_BINARY_DIR}/intl-icu-reference.json")
add_custom_target(gr_intl_test_bundle ALL
  COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-intl-icu.mjs" "${GR_INTL_TEST}"
  COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/intl-icu-reference.mjs" "${GR_INTL_REFERENCE}"
  VERBATIM)
add_executable(gr_intl_probe unittests/guest-probe.cpp)
target_link_libraries(gr_intl_probe PRIVATE nodetool_graph_runner gr_kernel gr_js)
add_dependencies(gr_intl_probe gr_intl_test_bundle)
add_test(NAME gr_intl_tests
  COMMAND "${CMAKE_COMMAND}" "-DPROBE=$<TARGET_FILE:gr_intl_probe>" "-DFIXTURE=${GR_INTL_TEST}"
          "-DREFERENCE=${GR_INTL_REFERENCE}" -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/intl-icu-compare.cmake")
