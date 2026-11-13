# Runs a test under the Vulkan validation layer and fails on any validation
# message, with one exception.
#
#   cmake -DTEST_COMMAND=<binary> -P run-validation.cmake
#
# The exception: Qt's device imports an image whose content another Vulkan
# device wrote. Its first use there names the layout the exporter left,
# SHADER_READ_ONLY_OPTIMAL, as the Vulkan external memory rules require to
# keep the content. The validation layer tracks layouts per device, has seen
# no transition on this one and reports UNDEFINED as the current layout
# (UNASSIGNED-CoreValidation-DrawState-InvalidImageLayout at vkQueueSubmit).
# Starting from UNDEFINED would silence it and allow the driver to discard
# the frame. Every other message, including any other layout mismatch,
# fails the run.
if(NOT TEST_COMMAND)
    message(FATAL_ERROR "TEST_COMMAND is not set")
endif()
set(ENV{VK_INSTANCE_LAYERS} "VK_LAYER_KHRONOS_validation")
set(ENV{QT_VULKAN_DEBUG_OUTPUT} "1")
execute_process(COMMAND ${TEST_COMMAND} RESULT_VARIABLE result OUTPUT_VARIABLE output ERROR_VARIABLE output)
# A semicolon would split one message into several list items.
string(REPLACE ";" "," output "${output}")
string(REGEX MATCHALL "Validation Error[^\n]*" messages "${output}")
set(unexpected "")
set(known 0)
foreach(line IN LISTS messages)
    if(line MATCHES "to be in layout VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL--instead, current layout is VK_IMAGE_LAYOUT_UNDEFINED")
        math(EXPR known "${known} + 1")
    else()
        list(APPEND unexpected "${line}")
    endif()
endforeach()
string(REGEX MATCH "Totals: [^\n]*" totals "${output}")
message(STATUS "${totals}")
message(STATUS "validation messages: ${known} import-layout reports (expected), others listed below")
if(NOT result EQUAL 0)
    message("${output}")
    message(FATAL_ERROR "the test failed under the validation layer (exit ${result})")
endif()
# The run must have exercised the layer: a silent layer proves nothing.
if(NOT output MATCHES "sharing: Vulkan")
    message(FATAL_ERROR "the run did not share Vulkan textures")
endif()
if(unexpected)
    foreach(line IN LISTS unexpected)
        message("${line}")
    endforeach()
    message(FATAL_ERROR "Vulkan validation errors")
endif()
