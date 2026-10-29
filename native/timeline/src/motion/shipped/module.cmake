function(nt_motion_shipped_tests)
    add_test(NAME motion_shipped_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/shipped/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_shipped_tests)
