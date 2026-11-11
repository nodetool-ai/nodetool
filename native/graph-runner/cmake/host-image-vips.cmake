# Existing native dependencies. Exact versions match the sharp reference stack.
# Install development headers and pkg-config files before configuring the host.
find_package(PkgConfig REQUIRED)
pkg_check_modules(GR_VIPS REQUIRED IMPORTED_TARGET vips-cpp=8.18.7)
pkg_check_modules(GR_WEBP REQUIRED IMPORTED_TARGET libwebp=1.6.0)
target_sources(gr_host_image PRIVATE src/host/image_vips.cpp)
target_link_libraries(gr_host_image PRIVATE PkgConfig::GR_VIPS PkgConfig::GR_WEBP)
target_sources(gr_host_image PRIVATE src/host/image_spec.cpp)
