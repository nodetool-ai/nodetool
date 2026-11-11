# Optional system rasterizer. No network fetch, native addon or child process.
# The floor is the oldest release with every call canvas.cpp makes:
# pango_color_parse_with_alpha needs Pango 1.46. Cairo 1.16 and Fontconfig
# 2.13 are far above the calls used. Ubuntu 24.04 meets all three.
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(GR_CANVAS QUIET IMPORTED_TARGET
    cairo>=1.16 pangocairo>=1.46 pangoft2>=1.46 fontconfig>=2.13)
endif()
target_sources(gr_kernel PRIVATE src/host/canvas.cpp)
if(GR_CANVAS_FOUND)
  target_compile_definitions(gr_kernel PRIVATE GR_HAVE_CANVAS=1)
  target_link_libraries(gr_kernel PRIVATE PkgConfig::GR_CANVAS)
else()
  message(STATUS "Canvas unavailable: Cairo/Pango/Fontconfig dependencies missing")
endif()
