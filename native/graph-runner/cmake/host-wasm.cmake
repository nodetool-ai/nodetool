# Wasmtime C API, isolated scalar modules with no WASI/imported host functions.
# Set WASMTIME_ROOT for another platform's matching C API distribution.
if(NOT WASMTIME_ROOT)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux" AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(gr_wasmtime_platform x86_64-linux)
    set(gr_wasmtime_sha256 27871520e02193badd5a83e16a5009c45371ec5ec9e1df8342b4a17efc3e35b6)
  elseif(APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
    set(gr_wasmtime_platform aarch64-macos)
    set(gr_wasmtime_sha256 3aa840ba24f14107bc7dd9b82b1b7b31ece8ea472e06820251ac76cafa8722c0)
  elseif(APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
    set(gr_wasmtime_platform x86_64-macos)
    set(gr_wasmtime_sha256 24fbf0845402437c5857b99d78583177a85a025c91d99a937c1e2c11ec09fcad)
  else()
    message(FATAL_ERROR "Set WASMTIME_ROOT to a Wasmtime v29.0.1 C API distribution for this platform")
  endif()
  FetchContent_Declare(gr_wasmtime
    URL https://github.com/bytecodealliance/wasmtime/releases/download/v29.0.1/wasmtime-v29.0.1-${gr_wasmtime_platform}-c-api.tar.xz
    URL_HASH SHA256=${gr_wasmtime_sha256}
    EXCLUDE_FROM_ALL)
  FetchContent_MakeAvailable(gr_wasmtime)
  set(WASMTIME_ROOT "${gr_wasmtime_SOURCE_DIR}")
endif()
# wgpu-native also bundles Rust std. Linking two Rust static distributions
# collides on rust_eh_personality, so Wasmtime must remain a separate DSO.
find_file(GR_WASMTIME_RUNTIME_LIBRARY
  NAMES libwasmtime.so libwasmtime.dylib wasmtime.dll
  PATHS "${WASMTIME_ROOT}/lib" "${WASMTIME_ROOT}/bin"
  NO_DEFAULT_PATH REQUIRED)
add_library(gr_wasmtime SHARED IMPORTED)
set_target_properties(gr_wasmtime PROPERTIES
  IMPORTED_LOCATION "${GR_WASMTIME_RUNTIME_LIBRARY}"
  IMPORTED_NO_SONAME TRUE
  INTERFACE_INCLUDE_DIRECTORIES "${WASMTIME_ROOT}/include")
if(WIN32)
  find_library(GR_WASMTIME_IMPORT_LIBRARY NAMES wasmtime.dll wasmtime
    PATHS "${WASMTIME_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)
  set_property(TARGET gr_wasmtime PROPERTY IMPORTED_IMPLIB "${GR_WASMTIME_IMPORT_LIBRARY}")
endif()
target_sources(gr_kernel PRIVATE src/host/sandbox_wasm.cpp)
target_link_libraries(gr_kernel PRIVATE gr_wasmtime Threads::Threads ${CMAKE_DL_LIBS})
if(UNIX)
  target_link_libraries(gr_kernel PRIVATE m)
endif()
# CMake includes the imported DSO directory in the build-tree RPATH.
# A distributor must copy GR_WASMTIME_RUNTIME_LIBRARY beside the executable
# (or into its lib directory) and set the executable's install RPATH to
# $ORIGIN / $ORIGIN/../lib on Linux, @loader_path equivalents on macOS.
