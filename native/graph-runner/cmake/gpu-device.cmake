# gr_gpu_device: the WebGPU device (src/host/gpu_device.cpp), the shader
# catalog and texture sharing (src/host/gpu_share.h). Included from
# host-image-gpu.cmake. A project that needs only the device, such as
# native/gpu-preview, includes this file on its own after it has defined
# nlohmann_json::nlohmann_json and nodetool_jobs.
#
# The device runs on wgpu-native, a prebuilt WebGPU implementation
# (webgpu.h), pinned by release and per-platform checksum.
# NODETOOL_GRAPH_RUNNER_GPU=OFF builds without it: the gpu capability then
# reports that the build has no GPU support.
#
# NODETOOL_WGPU_NATIVE_DIR replaces the pinned download with a local build
# that has include/ and lib/. Sharing Vulkan textures needs the native
# interop functions of third_party/wgpu-native, which the pinned release
# does not have (third_party/wgpu-native/README.md).
if(TARGET gr_gpu_device)
  return()
endif()
include(FetchContent)

set(_gr_root ${CMAKE_CURRENT_LIST_DIR}/..)

option(NODETOOL_GRAPH_RUNNER_GPU "Run WebGPU image nodes on wgpu-native" ON)
set(NODETOOL_WGPU_NATIVE_DIR "" CACHE PATH
    "A wgpu-native build (include/, lib/) to use in place of the pinned release")

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

if(NODETOOL_GRAPH_RUNNER_GPU AND NOT _wgpu_asset AND NOT NODETOOL_WGPU_NATIVE_DIR)
  message(WARNING "No pinned wgpu-native build for ${CMAKE_SYSTEM_NAME} ${CMAKE_SYSTEM_PROCESSOR}; building without GPU support")
  set(NODETOOL_GRAPH_RUNNER_GPU OFF)
endif()

add_library(gr_gpu_device STATIC
  ${_gr_root}/src/host/gpu_alpha.cpp
  ${_gr_root}/src/host/gpu_catalog.cpp
  ${_gr_root}/src/host/gpu_share.cpp)
target_include_directories(gr_gpu_device PUBLIC ${_gr_root}/src ${_gr_root}/include)
target_link_libraries(gr_gpu_device PUBLIC nlohmann_json::nlohmann_json nodetool_jobs)
target_compile_features(gr_gpu_device PUBLIC cxx_std_20)

if(NODETOOL_GRAPH_RUNNER_GPU)
  if(NODETOOL_WGPU_NATIVE_DIR)
    set(_wgpu_dir ${NODETOOL_WGPU_NATIVE_DIR})
  else()
    FetchContent_Declare(wgpu_native
      URL https://github.com/gfx-rs/wgpu-native/releases/download/${_wgpu_version}/${_wgpu_asset}
      URL_HASH SHA256=${_wgpu_sha256}
      DOWNLOAD_EXTRACT_TIMESTAMP TRUE
      EXCLUDE_FROM_ALL)
    FetchContent_MakeAvailable(wgpu_native)
    set(_wgpu_dir ${wgpu_native_SOURCE_DIR})
  endif()
  add_library(wgpu_native STATIC IMPORTED)
  if(WIN32)
    set(_wgpu_lib ${_wgpu_dir}/lib/wgpu_native.lib)
  else()
    set(_wgpu_lib ${_wgpu_dir}/lib/libwgpu_native.a)
  endif()
  if(NOT EXISTS ${_wgpu_lib} OR NOT EXISTS ${_wgpu_dir}/include/webgpu/wgpu.h)
    message(FATAL_ERROR "No wgpu-native build in ${_wgpu_dir} (expected include/webgpu/wgpu.h and ${_wgpu_lib})")
  endif()
  set_target_properties(wgpu_native PROPERTIES
    IMPORTED_LOCATION ${_wgpu_lib}
    INTERFACE_INCLUDE_DIRECTORIES ${_wgpu_dir}/include)
  if(APPLE)
    target_link_libraries(wgpu_native INTERFACE "-framework Metal" "-framework QuartzCore" "-framework Foundation")
  elseif(WIN32)
    target_link_libraries(wgpu_native INTERFACE d3dcompiler ws2_32 userenv bcrypt ntdll opengl32 propsys runtimeobject)
  else()
    find_package(Threads REQUIRED)
    target_link_libraries(wgpu_native INTERFACE ${CMAKE_DL_LIBS} m Threads::Threads)
  endif()
  target_sources(gr_gpu_device PRIVATE ${_gr_root}/src/host/gpu_device.cpp)
  target_link_libraries(gr_gpu_device PRIVATE wgpu_native)
  target_compile_definitions(gr_gpu_device PUBLIC NODETOOL_GRAPH_RUNNER_GPU=1)

  # Texture sharing (src/host/gpu_share.h).
  set(NODETOOL_GPU_SHARE_BACKEND "none")
  file(STRINGS ${_wgpu_dir}/include/webgpu/wgpu.h _wgpu_interop REGEX "define WGPU_NATIVE_INTEROP_REVISION")
  if(APPLE)
    # The pinned release exports the MTLDevice and MTLTexture of a device.
    target_compile_definitions(gr_gpu_device PRIVATE NODETOOL_GPU_SHARE_METAL=1)
    target_link_libraries(gr_gpu_device PRIVATE "-framework CoreFoundation" objc)
    set(NODETOOL_GPU_SHARE_BACKEND "metal")
  elseif(UNIX AND _wgpu_interop)
    find_package(Vulkan)
    if(Vulkan_FOUND)
      target_sources(gr_gpu_device PRIVATE ${_gr_root}/src/host/gpu_share_vulkan.cpp)
      target_compile_definitions(gr_gpu_device PRIVATE NODETOOL_GPU_SHARE_VULKAN=1)
      target_link_libraries(gr_gpu_device PRIVATE Vulkan::Vulkan)
      set(NODETOOL_GPU_SHARE_BACKEND "vulkan")
    endif()
  endif()
  message(STATUS "nodetool gpu device: texture sharing backend: ${NODETOOL_GPU_SHARE_BACKEND}")
else()
  target_sources(gr_gpu_device PRIVATE ${_gr_root}/src/host/gpu_device_none.cpp)
endif()
