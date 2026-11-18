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
    get_target_property(loudness_flags tst_liveloudness COMPILE_OPTIONS)
    if(NOT "-fexperimental-library" IN_LIST loudness_flags)
        message(SEND_ERROR "AppleClang tst_liveloudness compile options omit -fexperimental-library")
    endif()
    message(STATUS "Verified AppleClang tst_liveloudness compile options")
endif()

message(STATUS "Verified player CMake minimum, QML imports and VAAPI test selection")
