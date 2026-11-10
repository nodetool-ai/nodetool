# Include in the top-level test block after GR_NODE/GR_ESBUILD discovery.
if(GR_CANVAS_FOUND AND GR_ESBUILD)
  find_program(GR_NODE node REQUIRED)
  add_executable(gr_canvas_tests unittests/canvas.cpp)
  target_link_libraries(gr_canvas_tests PRIVATE gr_kernel gr_js)
  set(GR_CANVAS_TEST_BUNDLE "${CMAKE_CURRENT_BINARY_DIR}/canvas-test.js")
  set(GR_CANVAS_TIMELINE_BUNDLE "${CMAKE_CURRENT_BINARY_DIR}/canvas-timeline-test.js")
  set(GR_CANVAS_RELOCATED_BUNDLE "${CMAKE_CURRENT_BINARY_DIR}/canvas-relocated-test.js")
  add_custom_target(gr_canvas_test_bundles ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-canvas.mjs" "${GR_CANVAS_TEST_BUNDLE}"
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-canvas-timeline.mjs" "${GR_CANVAS_TIMELINE_BUNDLE}"
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-canvas.mjs" "${GR_CANVAS_RELOCATED_BUNDLE}" --relocated
    VERBATIM)
  add_dependencies(gr_canvas_tests gr_canvas_test_bundles)
  set(_canvas_fonts "${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/fonts")
  add_test(NAME gr_canvas_tests COMMAND gr_canvas_tests "${GR_CANVAS_TEST_BUNDLE}" "${_canvas_fonts}" cancel)
  add_test(NAME gr_canvas_timeline_tests COMMAND gr_canvas_tests "${GR_CANVAS_TIMELINE_BUNDLE}")
  add_test(NAME gr_canvas_relocated_tests COMMAND gr_canvas_tests "${GR_CANVAS_RELOCATED_BUNDLE}")
endif()

# The image capability's and canvas encode's jobs on the CPU lane
# (docs/plans/graph-runner-async-host.md, rollout step 5).
if(GR_CANVAS_FOUND)
  add_executable(gr_async_image_tests unittests/async_image.cpp)
  target_link_libraries(gr_async_image_tests PRIVATE gr_kernel gr_js nlohmann_json::nlohmann_json Threads::Threads)
  if(GR_TEST_TESSDATA)
    target_compile_definitions(gr_async_image_tests PRIVATE GR_TEST_TESSDATA="${GR_TEST_TESSDATA}")
  endif()
  add_test(NAME gr_async_image_tests COMMAND gr_async_image_tests)
endif()

if(NOT GR_CANVAS_FOUND)
  add_executable(gr_canvas_unavailable_tests unittests/canvas-unavailable.cpp)
  target_link_libraries(gr_canvas_unavailable_tests PRIVATE gr_kernel gr_js)
  add_test(NAME gr_canvas_unavailable_tests COMMAND gr_canvas_unavailable_tests)
endif()
