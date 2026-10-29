function(nt_motion_conformance_tests)
    add_test(NAME motion_conformance_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/conformance/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_conformance_tests)
