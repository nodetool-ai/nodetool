cmake_minimum_required(VERSION 3.28)
project(TimelinePlayerFirst LANGUAGES CXX)
include(CTest)

set(native_dir "${CMAKE_CURRENT_LIST_DIR}/../../../..")
add_subdirectory("${native_dir}/timeline-player" "${CMAKE_CURRENT_BINARY_DIR}/player")
# The player may have been added by a different component. The app receives
# its targets, independent of the scope that received PARENT_SCOPE variables.
unset(NT_PLAYER_HAVE_VAAPI_VULKAN)
unset(NT_PLAYER_DECODE_PLATFORM_LIBS)
add_subdirectory("${native_dir}/timeline" "${CMAKE_CURRENT_BINARY_DIR}/app")

file(STRINGS "${native_dir}/timeline-player/CMakeLists.txt" player_minimum REGEX "^cmake_minimum_required\\(")
file(STRINGS "${native_dir}/kernels/CMakeLists.txt" kernels_minimum REGEX "^cmake_minimum_required\\(")
if(NOT player_minimum STREQUAL kernels_minimum)
    message(SEND_ERROR "Timeline player has ${player_minimum}, kernels have ${kernels_minimum}")
endif()

get_target_property(imports timeline_qml QT_QML_IMPORT_PATH)
if(NOT "${CMAKE_CURRENT_BINARY_DIR}/player" IN_LIST imports)
    message(SEND_ERROR "Timeline QML imports omit the player's build directory: ${imports}")
endif()

get_target_property(decode_definitions nodetool_timeline_decode INTERFACE_COMPILE_DEFINITIONS)
if(BUILD_TESTING AND "NT_HAVE_VAAPI_VULKAN" IN_LIST decode_definitions AND NOT TARGET tst_vulkaninterop)
    message(SEND_ERROR "Timeline omitted tst_vulkaninterop with VAAPI/Vulkan enabled in the player")
endif()

if(BUILD_TESTING AND (CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang" OR
                      CMAKE_PROJECT_NodeToolTimelinePlayer_INCLUDE STREQUAL "${CMAKE_CURRENT_SOURCE_DIR}/AppleClangOptions.cmake"))
    foreach(test_target IN ITEMS tst_liveloudness tst_cpuusage)
        get_target_property(compile_flags ${test_target} COMPILE_OPTIONS)
        get_target_property(link_flags ${test_target} LINK_OPTIONS)
        if(NOT ("-fexperimental-library" IN_LIST compile_flags OR
                "$<$<COMPILE_LANGUAGE:CXX>:-fexperimental-library>" IN_LIST compile_flags)
           OR NOT "-fexperimental-library" IN_LIST link_flags)
            message(SEND_ERROR "AppleClang ${test_target} omits -fexperimental-library from compile or link options")
        endif()
        message(STATUS "Checked AppleClang ${test_target} compile and link options")
    endforeach()
endif()

message(STATUS "Verified player CMake minimum, QML imports and VAAPI test selection")
