set(NT_SANITIZE "" CACHE STRING "Sanitizers: empty, address,undefined, or thread")
set_property(CACHE NT_SANITIZE PROPERTY STRINGS "" "address,undefined" "thread")
option(NT_FUZZ "Build libFuzzer targets (Clang only)" OFF)
option(NT_SANITIZER_PLANTS "Build deliberately defective tooling checks" OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NT_FUZZ AND (MSVC OR NOT CMAKE_CXX_COMPILER_ID MATCHES "Clang"))
    message(FATAL_ERROR "NT_FUZZ requires Clang with libFuzzer (use the fuzz preset)")
endif()
if(NOT NT_SANITIZE STREQUAL "" AND NOT NT_SANITIZE STREQUAL "address,undefined" AND NOT NT_SANITIZE STREQUAL "thread")
    message(FATAL_ERROR "NT_SANITIZE must be empty, address,undefined, or thread")
endif()
if(NT_FUZZ AND NT_SANITIZE STREQUAL "thread")
    message(FATAL_ERROR "NT_FUZZ cannot be combined with ThreadSanitizer")
endif()
if(NT_SANITIZE OR NT_FUZZ)
    if(MSVC OR NOT CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        message(FATAL_ERROR "NT_SANITIZE requires GCC or Clang with sanitizer runtimes")
    endif()
    if(NT_FUZZ)
        # Instrument the libraries too. Only fuzz entry points link the fuzzer main.
        add_compile_options(-fsanitize=fuzzer-no-link,address,undefined)
        add_link_options(-fsanitize=address,undefined)
    else()
        add_compile_options(-fsanitize=${NT_SANITIZE})
        add_link_options(-fsanitize=${NT_SANITIZE})
    endif()
    add_compile_options(-fno-omit-frame-pointer)
    if(NT_FUZZ OR NT_SANITIZE STREQUAL "address,undefined")
        add_compile_options(-fno-sanitize-recover=undefined)
    endif()
endif()

function(nt_sanitizer_test_checks)
    get_property(tests DIRECTORY PROPERTY TESTS)
    foreach(test IN LISTS tests)
        # Also catch reports printed by a child whose parent accidentally exits zero.
        set_property(TEST ${test} APPEND PROPERTY FAIL_REGULAR_EXPRESSION
            "ERROR: AddressSanitizer" "ERROR: LeakSanitizer" "WARNING: ThreadSanitizer" "runtime error:")
    endforeach()
    # The Vulkan driver has no frame pointers, so the fast unwinder stops in
    # it and the test-scoped suppressions of V-LEAK-2 (lsan.supp) never see
    # the test function. The slow unwinder costs this test a few seconds.
    if(NT_SANITIZE STREQUAL "address,undefined" AND TEST tst_vulkaninterop)
        set_property(TEST tst_vulkaninterop APPEND PROPERTY ENVIRONMENT_MODIFICATION
            "ASAN_OPTIONS=string_append::fast_unwind_on_malloc=0"
            "LSAN_OPTIONS=string_append::fast_unwind_on_malloc=0")
    endif()
endfunction()
