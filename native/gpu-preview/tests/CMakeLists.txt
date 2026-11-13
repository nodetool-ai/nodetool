# Tests of the preview path. They need a GPU that both wgpu and Qt Quick can
# use: on Linux a Vulkan driver, lavapipe included, and a display (xvfb).

qt_add_executable(tst_gpupreview tst_gpupreview.cpp)
qt_add_resources(tst_gpupreview "tst_gpupreview_data" PREFIX "/tests"
    FILES data/catalog.json data/Basic.qml data/Compose.qml data/Multiple.qml)
target_compile_options(tst_gpupreview PRIVATE ${NT_PREVIEW_WARNINGS})
target_link_libraries(tst_gpupreview PRIVATE nodetool_gpu_preview nodetool_gpu_previewplugin Qt6::Quick Qt6::Test)
add_test(NAME tst_gpupreview COMMAND tst_gpupreview)

# The same binary on a window without a GPU device: sharing must be refused
# with a reason, and nothing may be drawn through another path.
add_test(NAME tst_gpupreview_software COMMAND tst_gpupreview softwareWindowIsUnavailable)
set_tests_properties(tst_gpupreview_software PROPERTIES ENVIRONMENT "NT_PREVIEW_TEST_SOFTWARE=1")

set(_lavapipe /usr/share/vulkan/icd.d/lvp_icd.json)
set(_validation /usr/share/vulkan/explicit_layer.d/VkLayer_khronos_validation.json)
if(EXISTS ${_lavapipe} AND NOT DEFINED ENV{NT_PREVIEW_HARDWARE_GPU})
    set_property(TEST tst_gpupreview tst_gpupreview_software APPEND PROPERTY
        ENVIRONMENT "VK_ICD_FILENAMES=${_lavapipe};VK_DRIVER_FILES=${_lavapipe}")
endif()
if(EXISTS ${_validation} AND NOT NT_SANITIZE)
    # The whole suite again under the Vulkan validation layer, on both
    # devices (run-validation.cmake states the one message it accepts). Not
    # in sanitizer builds: the layer and the driver keep their records of
    # the process-lifetime wgpu device, which LeakSanitizer reports.
    add_test(NAME tst_gpupreview_validation
        COMMAND ${CMAKE_COMMAND} -DTEST_COMMAND=$<TARGET_FILE:tst_gpupreview>
                -P ${CMAKE_CURRENT_SOURCE_DIR}/run-validation.cmake)
    if(EXISTS ${_lavapipe} AND NOT DEFINED ENV{NT_PREVIEW_HARDWARE_GPU})
        set_property(TEST tst_gpupreview_validation APPEND PROPERTY
            ENVIRONMENT "VK_ICD_FILENAMES=${_lavapipe};VK_DRIVER_FILES=${_lavapipe}")
    endif()
endif()
get_property(_tests DIRECTORY PROPERTY TESTS)
foreach(_test IN LISTS _tests)
    set_property(TEST ${_test} APPEND PROPERTY ENVIRONMENT
        "LSAN_OPTIONS=suppressions=${CMAKE_CURRENT_SOURCE_DIR}/../tools/lsan.supp:print_suppressions=0")
    set_property(TEST ${_test} APPEND PROPERTY FAIL_REGULAR_EXPRESSION
        "ERROR: AddressSanitizer" "ERROR: LeakSanitizer" "runtime error:")
    if(NT_SANITIZE STREQUAL "thread")
        # Qt, lavapipe and GLib are prebuilt without TSan instrumentation and
        # report races among their own threads. Ignoring those libraries
        # would also hide the locks that order the render thread against the
        # GUI thread, so nothing is suppressed: a report fails the test when
        # any of its frames is in this module or in the graph runner.
        set_property(TEST ${_test} APPEND PROPERTY FAIL_REGULAR_EXPRESSION
            "native/gpu-preview/src/" "native/graph-runner/src/")
        set_property(TEST ${_test} APPEND PROPERTY ENVIRONMENT "TSAN_OPTIONS=exitcode=0")
    endif()
    set_property(TEST ${_test} PROPERTY TIMEOUT 600)
endforeach()

# The graph runner's headless sharing test, here against this build's device,
# which has a sharing backend the runner's default build may lack.
add_executable(gr_gpu_share_tests ${CMAKE_CURRENT_SOURCE_DIR}/../../graph-runner/unittests/gpu_share.cpp)
target_link_libraries(gr_gpu_share_tests PRIVATE gr_gpu_device)
set(_share_args "")
if(NOT NODETOOL_GPU_SHARE_BACKEND STREQUAL "none")
    set(_share_args --require-sharing)
endif()
set(_share_env
    "LSAN_OPTIONS=suppressions=${CMAKE_CURRENT_SOURCE_DIR}/../../graph-runner/tools/lsan.supp:print_suppressions=0"
    "TSAN_OPTIONS=suppressions=${CMAKE_CURRENT_SOURCE_DIR}/../../graph-runner/tools/tsan.supp")
if(EXISTS ${_lavapipe} AND NOT DEFINED ENV{NT_PREVIEW_HARDWARE_GPU})
    list(APPEND _share_env "VK_ICD_FILENAMES=${_lavapipe}" "VK_DRIVER_FILES=${_lavapipe}")
endif()
add_test(NAME gr_gpu_share_tests COMMAND gr_gpu_share_tests ${_share_args})
set_tests_properties(gr_gpu_share_tests PROPERTIES ENVIRONMENT "${_share_env}"
    FAIL_REGULAR_EXPRESSION "ERROR: AddressSanitizer;ERROR: LeakSanitizer;WARNING: ThreadSanitizer;runtime error:")
if(EXISTS ${_validation} AND NODETOOL_GPU_SHARE_BACKEND STREQUAL "vulkan" AND NOT NT_SANITIZE)
    # Under the validation layer, which checks the layouts and queue family
    # transfers of publish() and reclaim() on the wgpu device.
    add_test(NAME gr_gpu_share_validation_tests COMMAND gr_gpu_share_tests ${_share_args})
    set_tests_properties(gr_gpu_share_validation_tests PROPERTIES
        ENVIRONMENT "${_share_env};VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation"
        FAIL_REGULAR_EXPRESSION "Validation Error")
endif()
