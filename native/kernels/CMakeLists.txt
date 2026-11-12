cmake_minimum_required(VERSION 3.28)
project(nodetool_kernels LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC OFF)
if(PROJECT_IS_TOP_LEVEL AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# The kernel library (decision D17 of docs/plans/graph-runner-realtime.md):
# pure buffer kernels with a C ABI and no dependency beyond the standard
# library. scripts/build-wasm.mjs compiles the same sources to WebAssembly.
add_library(nodetool_kernels STATIC
  src/audio.cpp
  src/biquad.cpp
  src/image.cpp
  src/synth.cpp)
target_include_directories(nodetool_kernels PUBLIC include)
# Rule N6: no fast-math and no fused multiply-add contraction, so the native
# and the WebAssembly build compute the same operations in the same order.
if(MSVC)
  target_compile_options(nodetool_kernels PRIVATE /fp:precise)
else()
  target_compile_options(nodetool_kernels PRIVATE -ffp-contract=off -fno-fast-math)
endif()

if(PROJECT_IS_TOP_LEVEL)
  enable_testing()
  add_executable(kernels_tests tests/kernels_tests.cpp)
  target_link_libraries(kernels_tests PRIVATE nodetool_kernels)
  add_test(NAME kernels_tests COMMAND kernels_tests)
  # Not a test: prints the time of each kernel (bench/kernels_bench.cpp).
  add_executable(kernels_bench bench/kernels_bench.cpp)
  target_link_libraries(kernels_bench PRIVATE nodetool_kernels)
endif()
