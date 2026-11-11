add_executable(gr_webassembly_tests unittests/webassembly.cpp)
target_link_libraries(gr_webassembly_tests PRIVATE gr_kernel gr_js gr_wasmtime)
set(GR_WEBASSEMBLY_YOGA "${CMAKE_CURRENT_BINARY_DIR}/webassembly-yoga.js")
set(GR_WEBASSEMBLY_QUOTA "${CMAKE_CURRENT_BINARY_DIR}/webassembly-quota.js")
set(GR_WEBASSEMBLY_MEMORY "${CMAKE_CURRENT_BINARY_DIR}/webassembly-memory.js")
add_custom_target(gr_webassembly_bundles
  COMMAND "${GR_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-webassembly.mjs" "${GR_WEBASSEMBLY_YOGA}"
  COMMAND "${GR_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-webassembly.mjs" "${GR_WEBASSEMBLY_MEMORY}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/webassembly-memory.test.mjs"
  COMMAND "${GR_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-webassembly.mjs" "${GR_WEBASSEMBLY_QUOTA}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/webassembly-quota.test.mjs"
  VERBATIM)
add_dependencies(gr_webassembly_tests gr_webassembly_bundles)
add_test(NAME gr_webassembly_yoga COMMAND gr_webassembly_tests "${GR_WEBASSEMBLY_YOGA}")
add_test(NAME gr_webassembly_memory COMMAND gr_webassembly_tests "${GR_WEBASSEMBLY_MEMORY}")
add_test(NAME gr_webassembly_quota COMMAND gr_webassembly_tests "${GR_WEBASSEMBLY_QUOTA}")
set_tests_properties(gr_webassembly_quota PROPERTIES TIMEOUT 120)
add_executable(gr_webassembly_jobs unittests/webassembly-jobs.cpp)
target_link_libraries(gr_webassembly_jobs PRIVATE nodetool_graph_runner nlohmann_json::nlohmann_json)
set(GR_WEBASSEMBLY_JOBS "${CMAKE_CURRENT_BINARY_DIR}/webassembly-jobs.js")
set(GR_WEBASSEMBLY_REFERENCE "${CMAKE_CURRENT_BINARY_DIR}/webassembly-reference.json")
add_custom_target(gr_webassembly_job_bundle
  COMMAND "${GR_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/webassembly-build-jobs.mjs" "${GR_WEBASSEMBLY_JOBS}" "${GR_WEBASSEMBLY_REFERENCE}"
  VERBATIM)
add_dependencies(gr_webassembly_jobs gr_webassembly_job_bundle)
add_test(NAME gr_webassembly_jobs COMMAND gr_webassembly_jobs "${GR_WEBASSEMBLY_JOBS}" "${GR_WEBASSEMBLY_REFERENCE}")
set_tests_properties(gr_webassembly_jobs PROPERTIES TIMEOUT 120)
