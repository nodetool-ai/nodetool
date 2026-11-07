if(GR_ESBUILD)
  find_program(GR_URL_NODE node REQUIRED)
  set(GR_URL_TEST "${CMAKE_CURRENT_BINARY_DIR}/url-test.js")
  add_custom_target(gr_url_test_bundle ALL
    COMMAND "${GR_URL_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-url.mjs" "${GR_URL_TEST}"
    VERBATIM)
  add_executable(gr_url_tests unittests/url.cpp)
  target_link_libraries(gr_url_tests PRIVATE gr_js)
  add_dependencies(gr_url_tests gr_url_test_bundle)
  add_test(NAME gr_url_tests COMMAND gr_url_tests "${GR_URL_TEST}")
endif()
