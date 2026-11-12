# Dependencies and sources of the image and gpu host capabilities
# (src/host/image.cpp, src/host/gpu*.cpp). Included from CMakeLists.txt.
#
# stb_image and stb_image_write decode and encode images on the host. They
# are pinned by commit and checksum.
#
# The gpu capability runs the WebGPU image nodes' shader modules on
# wgpu-native, a prebuilt WebGPU implementation (webgpu.h), pinned by release
# and per-platform checksum. NODETOOL_GRAPH_RUNNER_GPU=OFF builds without it:
# the gpu capability then reports that the build has no GPU support.

FetchContent_Declare(stb
  URL https://github.com/nothings/stb/archive/d14d46f6b44456eb88beac58cba833a4135d4c89.tar.gz
  URL_HASH SHA256=1b59a668a789a28a8fd4e01ff1413eec7eaeb28688bafdc66ec7068f4e7095e1
  EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(stb)

option(NODETOOL_GRAPH_RUNNER_GPU "Run WebGPU image nodes on wgpu-native" ON)

# wgpu-native v29.0.1.1: release asset and SHA-256 per platform.
set(_wgpu_version v29.0.1.1)
set(_wgpu_asset "")
if(CMAKE_SYSTEM_NAME STREQUAL "Linux" AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
  set(_wgpu_asset wgpu-linux-x86_64-release.zip)
  set(_wgpu_sha256 95a4d90c071005a98d03eab348beaa6b07e16eb00d1dcdb9f8348f75eb97ec5a)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux" AND CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64|arm64")
  set(_wgpu_asset wgpu-linux-aarch64-release.zip)
  set(_wgpu_sha256 015fcdf1dbae82e614a783cc38017e5399ae0927a889fe9b69c9b664bc61b47a)
elseif(APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
  set(_wgpu_asset wgpu-macos-aarch64-release.zip)
  set(_wgpu_sha256 a5797a37b1adf720bcd5dcffb291edbbd5b7b14be0a3874c28e6393a655a7a3e)
elseif(APPLE)
  set(_wgpu_asset wgpu-macos-x86_64-release.zip)
  set(_wgpu_sha256 8e2f7378548ddd0e2cf21e7d864dda46e953f0af724855a33778b85ead206d41)
elseif(WIN32 AND MSVC AND CMAKE_SIZEOF_VOID_P EQUAL 8)
  set(_wgpu_asset wgpu-windows-x86_64-msvc-release.zip)
  set(_wgpu_sha256 7e67d7445c42aeb85e30f88930fd8d7d83ee769e3390aeb1ada75ebf3cf78132)
endif()

if(NODETOOL_GRAPH_RUNNER_GPU AND NOT _wgpu_asset)
  message(WARNING "No pinned wgpu-native build for ${CMAKE_SYSTEM_NAME} ${CMAKE_SYSTEM_PROCESSOR}; building without GPU support")
  set(NODETOOL_GRAPH_RUNNER_GPU OFF)
endif()

add_library(gr_host_image STATIC src/host/image.cpp)
target_include_directories(gr_host_image PUBLIC src include)
target_include_directories(gr_host_image SYSTEM PRIVATE ${stb_SOURCE_DIR})
target_link_libraries(gr_host_image PUBLIC nlohmann_json::nlohmann_json)

add_library(gr_host_gpu STATIC src/host/gpu.cpp src/host/gpu_catalog.cpp)
target_include_directories(gr_host_gpu PUBLIC src include)
target_link_libraries(gr_host_gpu PUBLIC gr_host_image nlohmann_json::nlohmann_json)

if(NODETOOL_GRAPH_RUNNER_GPU)
  FetchContent_Declare(wgpu_native
    URL https://github.com/gfx-rs/wgpu-native/releases/download/${_wgpu_version}/${_wgpu_asset}
    URL_HASH SHA256=${_wgpu_sha256}
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    EXCLUDE_FROM_ALL)
  FetchContent_MakeAvailable(wgpu_native)
  add_library(wgpu_native STATIC IMPORTED)
  if(WIN32)
    set(_wgpu_lib ${wgpu_native_SOURCE_DIR}/lib/wgpu_native.lib)
  else()
    set(_wgpu_lib ${wgpu_native_SOURCE_DIR}/lib/libwgpu_native.a)
  endif()
  set_target_properties(wgpu_native PROPERTIES
    IMPORTED_LOCATION ${_wgpu_lib}
    INTERFACE_INCLUDE_DIRECTORIES ${wgpu_native_SOURCE_DIR}/include)
  if(APPLE)
    target_link_libraries(wgpu_native INTERFACE "-framework Metal" "-framework QuartzCore" "-framework Foundation")
  elseif(WIN32)
    target_link_libraries(wgpu_native INTERFACE d3dcompiler ws2_32 userenv bcrypt ntdll opengl32 propsys runtimeobject)
  else()
    target_link_libraries(wgpu_native INTERFACE ${CMAKE_DL_LIBS} m Threads::Threads)
  endif()
  target_sources(gr_host_gpu PRIVATE src/host/gpu_device.cpp src/host/gpu_compute.cpp)
  # gpu_compute.cpp includes the kernel loop (src/kernel/task.h), a wake
  # target of the job core.
  target_link_libraries(gr_host_gpu PRIVATE wgpu_native nodetool_jobs)
  target_compile_definitions(gr_host_gpu PUBLIC NODETOOL_GRAPH_RUNNER_GPU=1)
else()
  target_sources(gr_host_gpu PRIVATE src/host/gpu_device_none.cpp)
endif()
