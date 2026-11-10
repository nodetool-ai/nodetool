# Native OCR uses the installed, version-checked Tesseract C API. Language
# resources are never discovered from the environment: ContextOptions supplies
# the explicit resource directory, and the native adapter checks every language.
find_package(PkgConfig REQUIRED)
pkg_check_modules(GR_TESSERACT REQUIRED IMPORTED_TARGET tesseract>=5.5.3)
pkg_check_modules(GR_LEPTONICA REQUIRED IMPORTED_TARGET lept>=1.80)
target_sources(gr_kernel PRIVATE src/host/sandbox_ocr.cpp)
target_link_libraries(gr_kernel PRIVATE PkgConfig::GR_TESSERACT PkgConfig::GR_LEPTONICA)
