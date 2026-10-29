function(nt_motion_prism_tests)
    add_test(NAME motion_prism_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/prism/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_prism_tests)
