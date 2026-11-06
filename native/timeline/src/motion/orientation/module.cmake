function(nt_motion_orientation_tests)
    add_test(NAME motion_orientation_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/orientation/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_orientation_tests)
