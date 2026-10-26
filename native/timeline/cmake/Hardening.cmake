option(NT_HARDENING "Enable standard-library assertions and compiler hardening" ON)

# Directory options precede every target, including Yoga, Qt-generated code and tests.
if(NT_HARDENING AND NOT MSVC)
    include(CheckCXXSourceCompiles)
    check_cxx_source_compiles("#include <version>
#ifndef __GLIBCXX__
#error Not libstdc++
#endif
int main() {}" NT_USES_LIBSTDCXX)
    check_cxx_source_compiles("#include <version>
#ifndef _LIBCPP_VERSION
#error Not libc++
#endif
int main() {}" NT_USES_LIBCXX)
    check_cxx_source_compiles("#include <features.h>
#ifndef __GLIBC__
#error Not glibc
#endif
int main() {}" NT_USES_GLIBC)
    if(NT_USES_LIBSTDCXX)
        add_compile_definitions(_GLIBCXX_ASSERTIONS)
    elseif(NT_USES_LIBCXX)
        add_compile_definitions(_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST)
    endif()
    add_compile_options(-fstack-protector-strong -ftrivial-auto-var-init=zero)
    if(NT_USES_GLIBC)
        # Undefine the toolchain value before replacing it, only with optimization.
        add_compile_options(
            "$<$<CONFIG:Release,RelWithDebInfo,MinSizeRel>:-U_FORTIFY_SOURCE>"
            "$<$<CONFIG:Release,RelWithDebInfo,MinSizeRel>:-D_FORTIFY_SOURCE=3>")
    endif()
endif()
# MSVC skips the GCC/Clang hardening flags above.

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_GREATER_EQUAL 13)
    add_compile_options(-Wdangling-reference)
elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-Wthread-safety)
endif()
