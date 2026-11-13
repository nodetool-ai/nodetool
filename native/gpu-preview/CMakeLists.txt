cmake_minimum_required(VERSION 3.28)

project(NodeToolGpuPreview VERSION 0.1.0 LANGUAGES C CXX)
if(APPLE)
    enable_language(OBJCXX)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(CTest)

# Sanitizer builds: -DNT_SANITIZE=address,undefined or thread.
set(NT_SANITIZE "" CACHE STRING "Sanitizers: empty, address,undefined, or thread")
if(NT_SANITIZE)
    add_compile_options(-fsanitize=${NT_SANITIZE} -fno-omit-frame-pointer)
    add_link_options(-fsanitize=${NT_SANITIZE})
endif()

# QuickPrivate carries QQuickWindowPrivate::createTextureFromNativeTexture(),
# the only way to wrap a native texture that is not RGBA8. Private API is
# compatible within one Qt minor version, so the build accepts 6.12 only.
set(QT_NO_PRIVATE_MODULE_WARNING ON)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui Qml Quick QuickPrivate ShaderTools Test)
if(Qt6_VERSION VERSION_GREATER_EQUAL 6.13)
    message(FATAL_ERROR "nodetool-gpu-preview is tested with Qt 6.12 (private Qt Quick API). Found ${Qt6_VERSION}.")
endif()
qt_standard_project_setup(REQUIRES 6.12)

# The wgpu device of the graph runner, without the rest of the runner.
include(FetchContent)
FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
    EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(nlohmann_json)
if(NOT TARGET nodetool_jobs)
    add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../jobs ${CMAKE_CURRENT_BINARY_DIR}/jobs)
endif()
set(CMAKE_AUTOMOC_SAVED ${CMAKE_AUTOMOC})
set(CMAKE_AUTOMOC OFF)
include(${CMAKE_CURRENT_LIST_DIR}/../graph-runner/cmake/gpu-device.cmake)
set(CMAKE_AUTOMOC ${CMAKE_AUTOMOC_SAVED})

if(MSVC)
    set(NT_PREVIEW_WARNINGS /W4 /permissive-)
else()
    set(NT_PREVIEW_WARNINGS -Wall -Wextra)
endif()

# The consumer backend follows the device's sharing backend
# (NODETOOL_GPU_SHARE_BACKEND, set by gpu-device.cmake). With none, the item
# builds and reports that sharing is unavailable.
set(NT_PREVIEW_BACKEND_SOURCES "")
set(NT_PREVIEW_BACKEND_DEFINES "")
set(NT_PREVIEW_BACKEND_LIBS "")
if(NODETOOL_GPU_SHARE_BACKEND STREQUAL "vulkan")
    list(APPEND NT_PREVIEW_BACKEND_SOURCES src/VulkanImporter.cpp)
    list(APPEND NT_PREVIEW_BACKEND_DEFINES NT_PREVIEW_VULKAN=1)
    list(APPEND NT_PREVIEW_BACKEND_LIBS Vulkan::Headers)
elseif(NODETOOL_GPU_SHARE_BACKEND STREQUAL "metal")
    list(APPEND NT_PREVIEW_BACKEND_SOURCES src/MetalImporter.mm)
    list(APPEND NT_PREVIEW_BACKEND_DEFINES NT_PREVIEW_METAL=1)
    list(APPEND NT_PREVIEW_BACKEND_LIBS "-framework Metal" "-framework Foundation")
    set_source_files_properties(src/MetalImporter.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
endif()
message(STATUS "nodetool-gpu-preview: consumer backend: ${NODETOOL_GPU_SHARE_BACKEND}")

qt_add_qml_module(nodetool_gpu_preview
    URI NodeTool.GpuPreview
    STATIC
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/GpuPreview
    SOURCES
        src/GpuPreview.h src/GpuPreview.cpp
        src/GpuFrameSource.h src/GpuFrameSource.cpp
        src/GpuPreviewItem.h src/GpuPreviewItem.cpp
        src/ShaderFrameSource.h src/ShaderFrameSource.cpp
        src/PreviewNode.h src/PreviewNode.cpp
        src/TextureImporter.h src/TextureImporter.cpp
        ${NT_PREVIEW_BACKEND_SOURCES})
qt_add_shaders(nodetool_gpu_preview "nodetool_gpu_preview_shaders"
    BATCHABLE
    PREFIX "/nodetool/gpupreview"
    FILES shaders/present.vert shaders/present.frag)
target_include_directories(nodetool_gpu_preview PUBLIC src)
target_compile_definitions(nodetool_gpu_preview PRIVATE ${NT_PREVIEW_BACKEND_DEFINES})
target_compile_options(nodetool_gpu_preview PRIVATE ${NT_PREVIEW_WARNINGS})
target_link_libraries(nodetool_gpu_preview
    PUBLIC Qt6::Quick gr_gpu_device
    PRIVATE Qt6::QuickPrivate ${NT_PREVIEW_BACKEND_LIBS})

# The demo: an animated WGSL compute shader under moving QML content.
qt_add_executable(nodetool-gpu-preview-demo demo/main.cpp demo/DemoCatalog.h demo/DemoCatalog.cpp)
qt_add_qml_module(nodetool-gpu-preview-demo
    URI NodeTool.GpuPreviewDemo
    RESOURCE_PREFIX /qt/qml
    QML_FILES demo/Main.qml
    RESOURCES demo/plasma.wgsl)
target_compile_options(nodetool-gpu-preview-demo PRIVATE ${NT_PREVIEW_WARNINGS})
target_link_libraries(nodetool-gpu-preview-demo PRIVATE nodetool_gpu_preview nodetool_gpu_previewplugin Qt6::Quick)

if(BUILD_TESTING)
    add_subdirectory(tests)
endif()
