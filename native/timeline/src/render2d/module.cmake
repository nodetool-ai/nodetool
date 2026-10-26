# QTextLayout/QRawFont alone differ from Canvas in GPOS advances, variable
# weights and transformed glyph coverage. HarfBuzz shapes the selected face,
# and FreeType rasterizes it to keep the example comparisons above 35 dB.
find_package(harfbuzz CONFIG REQUIRED)
find_package(Freetype REQUIRED)
cmake_language(DEFER CALL target_link_libraries timeline_decode PRIVATE harfbuzz::harfbuzz Freetype::Freetype)
nt_sources(decode src/render2d/Rasterizer.h src/render2d/Rasterizer.cpp
    src/render2d/Paint.h src/render2d/Paint.cpp src/render2d/LayerStyle.h src/render2d/LayerStyle.cpp
    src/render2d/RasterSource.h src/render2d/RasterSource.cpp)
# Compile the startup registrar into the executable, never a static archive.
nt_sources(app src/render2d/Render2dRegistrations.cpp)
set_source_files_properties(src/render2d/Rasterizer.cpp PROPERTIES
    COMPILE_DEFINITIONS NT_TIMELINE_FONTS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/fonts")

function(nt_render2d_tests)
    qt_add_executable(tst_render2d src/render2d/tst_render2d.cpp src/render2d/Render2dRegistrations.cpp)
    set_target_properties(tst_render2d PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_render2d PRIVATE timeline_decode Qt6::Test)
    target_compile_definitions(tst_render2d PRIVATE NT_RENDER2D_REFERENCE_DIR="${CMAKE_CURRENT_BINARY_DIR}/render2d-reference")
    add_test(NAME render2d_reference COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/reference.mjs ${CMAKE_CURRENT_BINARY_DIR}/render2d-reference)
    set_tests_properties(render2d_reference PROPERTIES FIXTURES_SETUP render2d_reference)
    add_test(NAME tst_render2d COMMAND tst_render2d)
    set_tests_properties(tst_render2d PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" FIXTURES_REQUIRED render2d_reference)
    add_test(NAME render2d_stills_script COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/render2d/check-example-stills.test.mjs)
endfunction()
nt_tests(nt_render2d_tests)
