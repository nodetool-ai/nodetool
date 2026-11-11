# Include after the production library and gr_media_native_reference target.
get_filename_component(GR_MEDIA_PUBLIC_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
find_program(GR_MEDIA_PUBLIC_NODE node REQUIRED)
add_executable(gr_media_native_public_tests "${GR_MEDIA_PUBLIC_ROOT}/unittests/media-native-public.cpp")
target_link_libraries(gr_media_native_public_tests PRIVATE nodetool_graph_runner nlohmann_json::nlohmann_json)
set(GR_MEDIA_PUBLIC_BUNDLE "${CMAKE_CURRENT_BINARY_DIR}/media-native-public.js")
add_custom_target(gr_media_native_public_bundle
  COMMAND "${GR_MEDIA_PUBLIC_NODE}" "${GR_MEDIA_PUBLIC_ROOT}/unittests/media-native-public-build.mjs" "${GR_MEDIA_PUBLIC_BUNDLE}"
  VERBATIM)
add_dependencies(gr_media_native_public_tests gr_media_native_public_bundle gr_media_native_reference)
add_test(NAME gr_media_native_public_tests
  COMMAND "${GR_MEDIA_PUBLIC_NODE}" "${GR_MEDIA_PUBLIC_ROOT}/unittests/media-native-public-verify.mjs"
    "$<TARGET_FILE:gr_media_native_public_tests>" "$<TARGET_FILE:gr_media_native_reference>"
    "${GR_MEDIA_PUBLIC_BUNDLE}" "${CMAKE_CURRENT_BINARY_DIR}/media-native-public-results" image)
set_tests_properties(gr_media_native_public_tests PROPERTIES TIMEOUT 300)
if(EXISTS "/usr/share/vulkan/icd.d/lvp_icd.json")
  set_tests_properties(gr_media_native_public_tests PROPERTIES ENVIRONMENT "VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json")
endif()
