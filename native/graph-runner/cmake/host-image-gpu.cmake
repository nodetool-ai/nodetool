# Dependencies and sources of the image and gpu host capabilities
# (src/host/image.cpp, src/host/gpu*.cpp). Included from CMakeLists.txt.
#
# stb_image and stb_image_write decode and encode images on the host. They
# are pinned by commit and checksum.
#
# The gpu capability runs the WebGPU image nodes' shader modules on
# wgpu-native (cmake/gpu-device.cmake).

FetchContent_Declare(stb
  URL https://github.com/nothings/stb/archive/d14d46f6b44456eb88beac58cba833a4135d4c89.tar.gz
  URL_HASH SHA256=1b59a668a789a28a8fd4e01ff1413eec7eaeb28688bafdc66ec7068f4e7095e1
  EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(stb)

add_library(gr_host_image STATIC src/host/image.cpp)
target_include_directories(gr_host_image PUBLIC src include)
target_include_directories(gr_host_image SYSTEM PRIVATE ${stb_SOURCE_DIR})
target_link_libraries(gr_host_image PUBLIC nlohmann_json::nlohmann_json)

# The device, the catalog and texture sharing: cmake/gpu-device.cmake.
include(${CMAKE_CURRENT_LIST_DIR}/gpu-device.cmake)

add_library(gr_host_gpu STATIC src/host/gpu.cpp)
target_include_directories(gr_host_gpu PUBLIC src include)
target_link_libraries(gr_host_gpu PUBLIC gr_host_image gr_gpu_device nlohmann_json::nlohmann_json)

if(NODETOOL_GRAPH_RUNNER_GPU)
  target_sources(gr_host_gpu PRIVATE src/host/gpu_compute.cpp)
  # gpu_compute.cpp includes the kernel loop (src/kernel/task.h), a wake
  # target of the job core.
  target_link_libraries(gr_host_gpu PRIVATE wgpu_native nodetool_jobs)
endif()
