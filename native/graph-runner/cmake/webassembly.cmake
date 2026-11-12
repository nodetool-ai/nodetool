# Include after host-wasm.cmake, which owns the pinned Wasmtime dependency.
target_sources(gr_kernel PRIVATE src/host/webassembly.cpp)
