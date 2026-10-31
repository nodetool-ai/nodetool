function(nt_motion_border_tests)
    add_test(NAME motion_border_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/border/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_border_tests)
