# Wasmtime C API, isolated scalar modules with no WASI/imported host functions.
# Set WASMTIME_ROOT for another platform's matching C API distribution.
if(NOT WASMTIME_ROOT)
  if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux" OR NOT CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    message(FATAL_ERROR "Set WASMTIME_ROOT to a Wasmtime v29.0.1 C API distribution for this platform")
  endif()
  FetchContent_Declare(gr_wasmtime
    URL https://github.com/bytecodealliance/wasmtime/releases/download/v29.0.1/wasmtime-v29.0.1-x86_64-linux-c-api.tar.xz
    URL_HASH SHA256=27871520e02193badd5a83e16a5009c45371ec5ec9e1df8342b4a17efc3e35b6
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
  find_library(GR_WASMTIME_IMPORT_LIBRARY NAMES wasmtime
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
