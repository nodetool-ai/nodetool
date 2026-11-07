# Optional system rasterizer. No network fetch, native addon or child process.
# Tested system versions are recorded by the G4 focused-test report.
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(GR_CANVAS QUIET IMPORTED_TARGET
    cairo>=1.18.6 pangocairo>=1.58.2 pangoft2>=1.58.2 fontconfig>=2.17)
endif()
target_sources(gr_kernel PRIVATE src/host/canvas.cpp)
if(GR_CANVAS_FOUND)
  target_compile_definitions(gr_kernel PRIVATE GR_HAVE_CANVAS=1)
  target_link_libraries(gr_kernel PRIVATE PkgConfig::GR_CANVAS)
else()
  message(STATUS "Canvas unavailable: Cairo/Pango/Fontconfig dependencies missing")
endif()
