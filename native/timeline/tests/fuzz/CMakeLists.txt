foreach(name timeline_json media_probe)
    add_executable(fuzz_${name} fuzz_${name}.cpp)
    set_target_properties(fuzz_${name} PROPERTIES AUTOMOC OFF)
    target_compile_options(fuzz_${name} PRIVATE ${NT_WARNINGS})
    target_link_options(fuzz_${name} PRIVATE -fsanitize=fuzzer,address,undefined)
    target_link_libraries(fuzz_${name} PRIVATE timeline_decode)
    # Keep corpus mutations and crash artifacts in the ignored build tree.
    file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/corpus/${name}")
    file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/corpus/${name}/"
        DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/corpus/${name}")
    add_test(NAME fuzz_${name}_smoke COMMAND fuzz_${name} -runs=2000 -max_len=65536
        -timeout=10 -rss_limit_mb=2048
        "${CMAKE_CURRENT_BINARY_DIR}/corpus/${name}")
    set_tests_properties(fuzz_${name}_smoke PROPERTIES TIMEOUT 120
        FAIL_REGULAR_EXPRESSION "ERROR: AddressSanitizer;ERROR: LeakSanitizer;runtime error:")
endforeach()
