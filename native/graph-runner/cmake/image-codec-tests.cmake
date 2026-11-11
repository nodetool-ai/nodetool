find_program(GR_NODE node REQUIRED)
set(GR_IMAGE_FIXTURES "${CMAKE_CURRENT_BINARY_DIR}/image-codec-fixtures")
add_custom_target(gr_image_codec_fixtures ALL
  COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-image-codec.mjs" "${GR_IMAGE_FIXTURES}"
  VERBATIM)
add_executable(gr_image_codec_tests unittests/image-codec.cpp)
target_link_libraries(gr_image_codec_tests PRIVATE gr_kernel gr_js gr_host_image PkgConfig::GR_VIPS)
add_dependencies(gr_image_codec_tests gr_image_codec_fixtures)
add_test(NAME gr_image_codec_tests COMMAND gr_image_codec_tests
  "${GR_IMAGE_FIXTURES}/test.js" "${GR_IMAGE_FIXTURES}/fixtures.json")
# libvips starts once, before the first pool thread, and a failed start is
# never retried. Each mode runs in its own process.
add_executable(gr_vips_startup_tests unittests/vips_startup.cpp)
target_link_libraries(gr_vips_startup_tests PRIVATE gr_kernel gr_js PkgConfig::GR_VIPS)
add_test(NAME gr_vips_startup_failure_tests COMMAND gr_vips_startup_tests failure)
add_test(NAME gr_vips_startup_throwing_tests COMMAND gr_vips_startup_tests throwing)
add_test(NAME gr_vips_startup_lanes_tests COMMAND gr_vips_startup_tests lanes-first)
# The spec parser: its allocation bound, field checks and ignored keys.
add_executable(gr_image_spec_tests unittests/image_spec.cpp)
target_link_libraries(gr_image_spec_tests PRIVATE gr_host_image)
add_test(NAME gr_image_spec_tests COMMAND gr_image_spec_tests)
